-- Scheduled jobs. pg_cron runs in UTC; Asia/Colombo is UTC+5:30 with no DST.
--
-- The dispatcher call reads two Vault secrets at run time (create them once
-- per project, see README):
--   goldie_project_url      https://<project-ref>.supabase.co
--   goldie_dispatch_secret  same value as the DISPATCH_SECRET function secret

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Every 10 minutes: refresh today's medians from clean, approved submissions.
select cron.schedule(
  'goldie-recompute-today',
  '*/10 * * * *',
  $$ select public.recompute_daily_prices(public.colombo_today()); $$
);

-- 00:05 Colombo (18:35 UTC): final pass over the day that just ended.
select cron.schedule(
  'goldie-recompute-yesterday',
  '35 18 * * *',
  $$ select public.recompute_daily_prices(public.colombo_today() - 1); $$
);

-- 08:00 Colombo (02:30 UTC): remind approved jewellers who haven't submitted.
select cron.schedule(
  'goldie-jeweller-nudge',
  '30 2 * * *',
  $$ select public.enqueue_jeweller_nudges(); $$
);

-- 10:30 Colombo (05:00 UTC): refresh medians, then queue the consumer broadcast.
select cron.schedule(
  'goldie-consumer-broadcast',
  '0 5 * * *',
  $$
    select public.recompute_daily_prices(public.colombo_today());
    select public.enqueue_consumer_broadcast();
  $$
);

-- Every minute: wake the dispatcher, but only when there is work due.
select cron.schedule(
  'goldie-dispatch-outbound',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'goldie_project_url')
        || '/functions/v1/whatsapp-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'goldie_dispatch_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (
      select 1
      from public.outbound_jobs
      where (status = 'pending' and run_after <= now())
         or (status = 'processing' and locked_at < now() - interval '5 minutes')
    );
  $$
);
