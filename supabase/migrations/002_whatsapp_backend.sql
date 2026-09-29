-- WhatsApp backend: inbound dedupe, outbound job queue, consumer opt-ins,
-- submission recording with outlier flagging, and daily median aggregation.
-- All functions here are service-role only (Edge Functions + pg_cron).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.colombo_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Colombo')::date;
$$;

-- Start of a Colombo calendar day as an absolute timestamp.
create or replace function public.colombo_day_start(p_date date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_date::timestamp at time zone 'Asia/Colombo';
$$;

-- Phone numbers are stored E.164 ("+94771234567") so webhook senders match jewellers.
alter table public.jewellers
  add constraint jewellers_phone_number_e164
  check (phone_number ~ '^\+[1-9][0-9]{6,14}$');

-- ---------------------------------------------------------------------------
-- Message log extensions
-- ---------------------------------------------------------------------------

alter table public.whatsapp_messages
  add column wa_message_id text,
  add column message_type text,
  add column processed_at timestamptz;

-- Meta retries webhooks; one inbound row per WhatsApp message id.
create unique index whatsapp_messages_inbound_wa_id_key
  on public.whatsapp_messages (wa_message_id)
  where direction = 'inbound';

-- ---------------------------------------------------------------------------
-- Consumer opt-ins for the daily broadcast
-- ---------------------------------------------------------------------------

create table public.consumer_subscribers (
  phone_number text primary key
    check (phone_number ~ '^\+[1-9][0-9]{6,14}$'),
  opted_in boolean not null default true,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Outbound job queue
-- ---------------------------------------------------------------------------

create type public.outbound_job_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.outbound_jobs (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  to_phone text not null
    check (to_phone ~ '^\+[1-9][0-9]{6,14}$'),
  kind text not null
    check (kind in ('text', 'jeweller_nudge', 'consumer_daily_price')),
  payload jsonb not null default '{}'::jsonb,
  status public.outbound_job_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  wa_message_id text,
  delivery_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outbound_jobs_due_idx
  on public.outbound_jobs (run_after)
  where status = 'pending';

create index outbound_jobs_wa_message_id_idx
  on public.outbound_jobs (wa_message_id)
  where wa_message_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: backend-only tables have no public policies
-- ---------------------------------------------------------------------------

alter table public.consumer_subscribers enable row level security;
alter table public.outbound_jobs enable row level security;

revoke all on public.consumer_subscribers from anon, authenticated;
revoke all on public.outbound_jobs from anon, authenticated;
revoke all on public.whatsapp_messages from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Inbound logging with retry dedupe
-- Returns true when this message was already fully processed.
-- ---------------------------------------------------------------------------

create or replace function public.log_inbound_message(
  p_wa_message_id text,
  p_phone text,
  p_message_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.whatsapp_messages (phone_number, direction, payload, wa_message_id, message_type)
  values (p_phone, 'inbound', p_payload, p_wa_message_id, p_message_type)
  on conflict (wa_message_id) where direction = 'inbound' do nothing;

  return exists (
    select 1
    from public.whatsapp_messages
    where wa_message_id = p_wa_message_id
      and direction = 'inbound'
      and processed_at is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Price submission
-- Only approved jewellers can write. Each price is compared against the
-- running median of today's clean submissions from other approved shops
-- (or the latest daily median when fewer than 3 peers have submitted);
-- more than 5% away => flagged_outlier, kept but excluded from aggregates.
-- ---------------------------------------------------------------------------

create or replace function public.record_price_submission(p_phone text, p_prices jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_jeweller public.jewellers%rowtype;
  v_today date := public.colombo_today();
  v_start timestamptz := public.colombo_day_start(public.colombo_today());
  v_threshold constant numeric := 0.05;
  v_min_peers constant integer := 3;
  v_karat public.karat;
  v_price numeric;
  v_reference numeric;
  v_peer_count integer;
  v_flagged boolean;
  v_items jsonb := '[]'::jsonb;
begin
  select * into v_jeweller
  from public.jewellers
  where phone_number = p_phone;

  if not found then
    return jsonb_build_object('status', 'not_registered');
  end if;

  if v_jeweller.status <> 'approved' then
    return jsonb_build_object('status', 'not_approved', 'jeweller_status', v_jeweller.status);
  end if;

  for v_karat, v_price in
    select key::public.karat, value::numeric
    from jsonb_each_text(p_prices)
  loop
    select percentile_cont(0.5) within group (order by peers.price_per_gram), count(*)
      into v_reference, v_peer_count
    from (
      select distinct on (s.jeweller_id) s.price_per_gram
      from public.submissions s
      join public.jewellers j on j.id = s.jeweller_id
      where j.status = 'approved'
        and not s.flagged_outlier
        and s.karat = v_karat
        and s.submitted_at >= v_start
        and s.jeweller_id <> v_jeweller.id
      order by s.jeweller_id, s.submitted_at desc
    ) peers;

    if v_peer_count < v_min_peers then
      select d.median_price into v_reference
      from public.daily_prices d
      where d.karat = v_karat
        and d.date < v_today
        and d.date >= v_today - 7
      order by d.date desc
      limit 1;
    end if;

    v_flagged := v_reference is not null
      and abs(v_price - v_reference) / v_reference > v_threshold;

    insert into public.submissions (jeweller_id, karat, price_per_gram, flagged_outlier)
    values (v_jeweller.id, v_karat, v_price, v_flagged);

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'karat', v_karat,
      'price_per_gram', v_price,
      'flagged_outlier', v_flagged
    ));
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'jeweller_name', v_jeweller.name,
    'items', v_items
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily aggregation: median of each approved jeweller's latest clean
-- submission per karat for the Colombo day.
-- ---------------------------------------------------------------------------

create or replace function public.recompute_daily_prices(p_date date default public.colombo_today())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz := public.colombo_day_start(p_date);
  v_end timestamptz := public.colombo_day_start(p_date + 1);
  v_count integer;
begin
  with latest as (
    select distinct on (s.jeweller_id, s.karat) s.karat, s.price_per_gram
    from public.submissions s
    join public.jewellers j on j.id = s.jeweller_id
    where j.status = 'approved'
      and not s.flagged_outlier
      and s.submitted_at >= v_start
      and s.submitted_at < v_end
    order by s.jeweller_id, s.karat, s.submitted_at desc
  ),
  aggregated as (
    select
      karat,
      round(percentile_cont(0.5) within group (order by price_per_gram)::numeric, 2) as median_price,
      count(*)::integer as submission_count
    from latest
    group by karat
  ),
  removed as (
    delete from public.daily_prices d
    where d.date = p_date
      and not exists (select 1 from aggregated a where a.karat = d.karat)
  )
  insert into public.daily_prices (date, karat, median_price, submission_count)
  select p_date, karat, median_price, submission_count
  from aggregated
  on conflict (date, karat) do update
    set median_price = excluded.median_price,
        submission_count = excluded.submission_count;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Latest available aggregate (today, or the most recent day before it).
create or replace function public.current_prices()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with latest_date as (
    select max(date) as d
    from public.daily_prices
    where date <= public.colombo_today()
  )
  select coalesce(
    (
      select jsonb_build_object(
        'date', ld.d,
        'is_today', ld.d = public.colombo_today(),
        'shop_count', max(dp.submission_count),
        'prices', jsonb_object_agg(dp.karat, dp.median_price)
      )
      from latest_date ld
      join public.daily_prices dp on dp.date = ld.d
      group by ld.d
    ),
    jsonb_build_object('date', null, 'is_today', false, 'shop_count', 0, 'prices', '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Scheduled enqueuers
-- ---------------------------------------------------------------------------

-- Morning nudge to approved jewellers who haven't submitted today.
create or replace function public.enqueue_jeweller_nudges(p_date date default public.colombo_today())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz := public.colombo_day_start(p_date);
  v_end timestamptz := public.colombo_day_start(p_date + 1);
  v_count integer;
begin
  insert into public.outbound_jobs (dedupe_key, to_phone, kind, payload)
  select
    'nudge:' || p_date || ':' || j.id,
    j.phone_number,
    'jeweller_nudge',
    jsonb_build_object('name', j.name)
  from public.jewellers j
  where j.status = 'approved'
    and not exists (
      select 1
      from public.submissions s
      where s.jeweller_id = j.id
        and s.submitted_at >= v_start
        and s.submitted_at < v_end
    )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Daily price broadcast to opted-in consumers. Skips the day entirely when
-- there is no aggregate for it, rather than broadcasting stale prices.
create or replace function public.enqueue_consumer_broadcast(p_date date default public.colombo_today())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_prices jsonb;
  v_shop_count integer;
  v_count integer;
begin
  select jsonb_object_agg(karat, median_price), max(submission_count)
    into v_prices, v_shop_count
  from public.daily_prices
  where date = p_date;

  if v_prices is null then
    return 0;
  end if;

  insert into public.outbound_jobs (dedupe_key, to_phone, kind, payload)
  select
    'broadcast:' || p_date || ':' || c.phone_number,
    c.phone_number,
    'consumer_daily_price',
    jsonb_build_object('date', p_date, 'prices', v_prices, 'shop_count', v_shop_count)
  from public.consumer_subscribers c
  where c.opted_in
  on conflict (dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatcher claim: locks due jobs (and reclaims ones stuck in processing
-- for over 5 minutes) so concurrent dispatchers never double-send.
-- ---------------------------------------------------------------------------

create or replace function public.claim_outbound_jobs(
  p_limit integer default 20,
  p_ids uuid[] default null
)
returns setof public.outbound_jobs
language plpgsql
set search_path = ''
as $$
begin
  update public.outbound_jobs
  set status = 'failed',
      last_error = coalesce(last_error, 'Gave up after repeated stalls'),
      locked_at = null,
      updated_at = now()
  where status = 'processing'
    and locked_at < now() - interval '5 minutes'
    and attempts >= max_attempts;

  return query
  with due as (
    select o.id
    from public.outbound_jobs o
    where (p_ids is null or o.id = any (p_ids))
      and (
        (o.status = 'pending' and o.run_after <= now())
        or (o.status = 'processing' and o.locked_at < now() - interval '5 minutes')
      )
    order by o.run_after
    limit p_limit
    for update skip locked
  )
  update public.outbound_jobs o
  set status = 'processing',
      locked_at = now(),
      attempts = o.attempts + 1,
      updated_at = now()
  from due
  where o.id = due.id
  returning o.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock functions down to the service role
-- ---------------------------------------------------------------------------

revoke execute on function public.log_inbound_message(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.record_price_submission(text, jsonb) from public, anon, authenticated;
revoke execute on function public.recompute_daily_prices(date) from public, anon, authenticated;
revoke execute on function public.current_prices() from public, anon, authenticated;
revoke execute on function public.enqueue_jeweller_nudges(date) from public, anon, authenticated;
revoke execute on function public.enqueue_consumer_broadcast(date) from public, anon, authenticated;
revoke execute on function public.claim_outbound_jobs(integer, uuid[]) from public, anon, authenticated;

grant execute on function public.log_inbound_message(text, text, text, jsonb) to service_role;
grant execute on function public.record_price_submission(text, jsonb) to service_role;
grant execute on function public.recompute_daily_prices(date) to service_role;
grant execute on function public.current_prices() to service_role;
grant execute on function public.enqueue_jeweller_nudges(date) to service_role;
grant execute on function public.enqueue_consumer_broadcast(date) to service_role;
grant execute on function public.claim_outbound_jobs(integer, uuid[]) to service_role;
