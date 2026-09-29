-- Seed data for local / demo. Run after 001_init.sql.
-- Timestamps use Asia/Colombo calendar days via date::timestamptz at noon UTC+5:30-ish (UTC noon).

truncate public.submissions, public.daily_prices, public.jewellers, public.whatsapp_messages cascade;

insert into public.jewellers (id, name, phone_number, area, status, created_at) values
  ('11111111-1111-1111-1111-111111111101', 'Seneviratne Jewellers', '+94771110001', 'Colombo 3', 'approved', now() - interval '90 days'),
  ('11111111-1111-1111-1111-111111111102', 'Peoples Gold House', '+94771110002', 'Colombo 3', 'approved', now() - interval '80 days'),
  ('11111111-1111-1111-1111-111111111103', 'Nawala Gold Centre', '+94771110003', 'Nawala', 'approved', now() - interval '70 days'),
  ('11111111-1111-1111-1111-111111111104', 'Kandy Road Jewels', '+94771110004', 'Kandy', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-111111111105', 'Galle Face Gold', '+94771110005', 'Colombo 1', 'approved', now() - interval '50 days'),
  ('11111111-1111-1111-1111-111111111106', 'Borella Bullion', '+94771110006', 'Borella', 'approved', now() - interval '45 days'),
  ('11111111-1111-1111-1111-111111111107', 'Dehiwala Fine Gold', '+94771110007', 'Dehiwala', 'approved', now() - interval '40 days'),
  ('11111111-1111-1111-1111-111111111108', 'Nugegoda Rates', '+94771110008', 'Nugegoda', 'approved', now() - interval '35 days'),
  ('11111111-1111-1111-1111-111111111109', 'Wellawatte Gold Mart', '+94771110009', 'Wellawatte', 'approved', now() - interval '30 days'),
  ('11111111-1111-1111-1111-111111111110', 'Rajagiriya Jewel Box', '+94771110010', 'Rajagiriya', 'approved', now() - interval '25 days'),
  ('11111111-1111-1111-1111-111111111111', 'Pending New Shop', '+94771110011', 'Colombo 7', 'pending', now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111112', 'Suspended Outlet', '+94771110012', 'Moratuwa', 'suspended', now() - interval '100 days');

-- 30 days of daily_prices (median-ish series around current Colombo rates)
insert into public.daily_prices (date, karat, median_price, submission_count)
select
  (current_date - (d || ' days')::interval)::date as date,
  k.karat,
  round(
    case k.karat
      when '24k' then 45800 + (d * 18) + ((d % 5) * 40)
      when '22k' then 42000 + (d * 16) + ((d % 5) * 35)
      when '18k' then 34400 + (d * 13) + ((d % 5) * 28)
    end
  , 2) as median_price,
  8 + (d % 5) as submission_count
from generate_series(0, 29) as d
cross join (values ('24k'::public.karat), ('22k'::public.karat), ('18k'::public.karat)) as k(karat);

-- Today's submissions (approved shops only)
insert into public.submissions (jeweller_id, karat, price_per_gram, submitted_at, flagged_outlier)
select
  j.id,
  k.karat,
  round(
    case k.karat
      when '24k' then 46400 + ((row_number() over (partition by k.karat order by j.name) - 1) * 50) - 100
      when '22k' then 42500 + ((row_number() over (partition by k.karat order by j.name) - 1) * 45) - 90
      when '18k' then 34800 + ((row_number() over (partition by k.karat order by j.name) - 1) * 40) - 80
    end
  , 2),
  now() - ((row_number() over (order by j.name) % 8) * interval '25 minutes'),
  false
from public.jewellers j
cross join (values ('24k'::public.karat), ('22k'::public.karat), ('18k'::public.karat)) as k(karat)
where j.status = 'approved';

-- One shop intentionally stale (yesterday)
update public.submissions
set submitted_at = now() - interval '9 hours'
where jeweller_id = '11111111-1111-1111-1111-111111111104';

-- One flagged outlier (excluded from public view)
insert into public.submissions (jeweller_id, karat, price_per_gram, submitted_at, flagged_outlier)
values (
  '11111111-1111-1111-1111-111111111101',
  '22k',
  52000,
  now() - interval '10 minutes',
  true
);

-- Align today's daily_prices with roughly current medians
update public.daily_prices
set median_price = case karat
  when '24k' then 46500
  when '22k' then 42600
  when '18k' then 34900
end,
submission_count = 10
where date = current_date;

update public.daily_prices
set median_price = case karat
  when '24k' then 46300
  when '22k' then 42450
  when '18k' then 34780
end
where date = current_date - 1;
