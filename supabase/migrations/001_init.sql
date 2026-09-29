-- Goldie initial schema
-- Core tables from CURSOR.md; public read path via RLS + view

create extension if not exists "pgcrypto";

create type public.jeweller_status as enum ('pending', 'approved', 'suspended');
create type public.karat as enum ('24k', '22k', '18k');
create type public.message_direction as enum ('inbound', 'outbound');

create table public.jewellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_number text not null unique,
  area text not null,
  status public.jeweller_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  jeweller_id uuid not null references public.jewellers (id) on delete cascade,
  karat public.karat not null,
  price_per_gram numeric(12, 2) not null check (price_per_gram > 0),
  submitted_at timestamptz not null default now(),
  flagged_outlier boolean not null default false
);

create index submissions_jeweller_submitted_idx
  on public.submissions (jeweller_id, submitted_at desc);

create index submissions_submitted_at_idx
  on public.submissions (submitted_at desc);

create table public.daily_prices (
  date date not null,
  karat public.karat not null,
  median_price numeric(12, 2) not null check (median_price > 0),
  submission_count integer not null check (submission_count >= 0),
  primary key (date, karat)
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  direction public.message_direction not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index whatsapp_messages_phone_created_idx
  on public.whatsapp_messages (phone_number, created_at desc);

-- Latest non-outlier submission per approved jeweller + karat (any day)
create or replace view public.public_jeweller_prices as
with latest as (
  select distinct on (s.jeweller_id, s.karat)
    s.jeweller_id,
    s.karat,
    s.price_per_gram,
    s.submitted_at
  from public.submissions s
  join public.jewellers j on j.id = s.jeweller_id
  where j.status = 'approved'
    and s.flagged_outlier = false
  order by s.jeweller_id, s.karat, s.submitted_at desc
)
select
  j.id as jeweller_id,
  j.name,
  j.area,
  max(case when l.karat = '24k' then l.price_per_gram end) as price_24k,
  max(case when l.karat = '22k' then l.price_per_gram end) as price_22k,
  max(case when l.karat = '18k' then l.price_per_gram end) as price_18k,
  max(l.submitted_at) as updated_at
from public.jewellers j
join latest l on l.jeweller_id = j.id
where j.status = 'approved'
group by j.id, j.name, j.area;

-- RLS
alter table public.jewellers enable row level security;
alter table public.submissions enable row level security;
alter table public.daily_prices enable row level security;
alter table public.whatsapp_messages enable row level security;

-- Public read: approved jewellers only
create policy "Public can read approved jewellers"
  on public.jewellers
  for select
  to anon, authenticated
  using (status = 'approved');

-- Public read: non-outlier submissions from approved jewellers
create policy "Public can read clean submissions from approved jewellers"
  on public.submissions
  for select
  to anon, authenticated
  using (
    flagged_outlier = false
    and exists (
      select 1 from public.jewellers j
      where j.id = submissions.jeweller_id
        and j.status = 'approved'
    )
  );

-- Public read: daily aggregates
create policy "Public can read daily prices"
  on public.daily_prices
  for select
  to anon, authenticated
  using (true);

-- No public write policies — service role / edge functions only
-- whatsapp_messages: no anon policies (admin/service only)

grant usage on schema public to anon, authenticated;
grant select on public.jewellers to anon, authenticated;
grant select on public.submissions to anon, authenticated;
grant select on public.daily_prices to anon, authenticated;
grant select on public.public_jeweller_prices to anon, authenticated;
