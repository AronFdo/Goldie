# Goldie

Gold price aggregation for Sri Lanka. Jewellers submit daily prices over WhatsApp; consumers check prices over WhatsApp or on the public board (aggregate medians, jeweller comparison, karat calculator, 30-day trends).

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS — public web app
- Supabase — Postgres, Edge Functions (WhatsApp webhook + dispatcher), pg_cron (schedules)
- Meta WhatsApp Cloud API
- Recharts for trend sparklines

## Web app setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Without Supabase credentials, the app serves typed demo data and shows a banner.

## Database

Run the migrations in order, then optionally the seed:

1. [`001_init.sql`](supabase/migrations/001_init.sql) — core tables, public read policies
2. [`002_whatsapp_backend.sql`](supabase/migrations/002_whatsapp_backend.sql) — outbound job queue, consumer opt-ins, submission + aggregation functions
3. [`003_schedules.sql`](supabase/migrations/003_schedules.sql) — pg_cron jobs
4. [`seed.sql`](supabase/seed.sql) — sample jewellers and prices (dev only)

With the CLI: `supabase link --project-ref <ref>` then `supabase db push`.

Jeweller phone numbers must be stored in E.164 format (`+94771234567`) so incoming WhatsApp messages match them.

## WhatsApp backend

```text
Meta ──POST──▶ whatsapp-webhook ──▶ whatsapp_messages (log, dedupe)
                     │               submissions / consumer_subscribers
                     └──▶ outbound_jobs ◀── pg_cron: nudges, broadcast
                                │
          pg_cron (every min) ──▶ whatsapp-dispatch ──▶ Graph API
```

- **`whatsapp-webhook`** verifies `X-Hub-Signature-256`, logs each message, writes submissions or opt-ins, queues a reply, and returns 200. Replies are sent in the background; anything that doesn't go out is retried by the dispatcher.
- **`whatsapp-dispatch`** sends due `outbound_jobs` with exponential backoff (up to 5 attempts). Every outbound message is logged to `whatsapp_messages`.
- **Aggregation** runs in SQL on cron, never in the webhook: medians of each approved jeweller's latest clean submission per karat. Submissions more than 5% from the running median are stored with `flagged_outlier = true` and excluded until reviewed.

### Schedules (Asia/Colombo)

| Job | When | What |
|---|---|---|
| `goldie-recompute-today` | every 10 min | refresh today's `daily_prices` |
| `goldie-recompute-yesterday` | 00:05 | final pass over the previous day |
| `goldie-jeweller-nudge` | 08:00 | template reminder to approved jewellers who haven't submitted |
| `goldie-consumer-broadcast` | 10:30 | template with today's prices to opted-in consumers (skipped if no data) |
| `goldie-dispatch-outbound` | every min | calls `whatsapp-dispatch` when jobs are due |

### What users can send

- Jewellers: `24k 46500 22k 42600 18k 34900` (per gram), or add `pawn` to send per-pawn prices
- Anyone: `PRICE`, `SUBSCRIBE`, `STOP`, `HELP`

### Message templates

Business-initiated messages need Meta-approved templates. Create these in WhatsApp Manager (category **Utility**, language matching `WHATSAPP_TEMPLATE_LANGUAGE`). The variable order matters.

`goldie_daily_price_reminder`

```text
Good morning {{1}}. Please send today's gold prices per gram in LKR, for example: 24k 46500 22k 42600 18k 34900
```

`goldie_daily_gold_price`

```text
Gold price for {{1}}, median across {{2}} shops (LKR per gram): 24K {{3}} · 22K {{4}} · 18K {{5}}. Reply STOP to unsubscribe.
```

### Deploy

1. Create the Meta app (use case: **Connect with customers through WhatsApp**) and generate a permanent System User token.
2. Set function secrets:

   ```bash
   cp supabase/functions/.env.example supabase/functions/.env   # fill in values
   supabase secrets set --env-file supabase/functions/.env
   ```

3. Store the values pg_cron needs in Vault (SQL editor):

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'goldie_project_url');
   select vault.create_secret('<same value as DISPATCH_SECRET>', 'goldie_dispatch_secret');
   ```

4. Deploy the functions (JWT verification is disabled for both in [`config.toml`](supabase/config.toml); they authenticate with Meta's signature and the dispatch secret instead):

   ```bash
   supabase functions deploy whatsapp-webhook
   supabase functions deploy whatsapp-dispatch
   ```

5. In the Meta app, go to WhatsApp → Configuration → Webhook. Set the callback URL to `https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook` and the verify token to `WHATSAPP_VERIFY_TOKEN`, then subscribe to the `messages` field.

### Tests

```bash
cd supabase/functions
deno test --allow-env tests/
deno check whatsapp-webhook/index.ts whatsapp-dispatch/index.ts
```

## Scripts

- `pnpm dev` — local development
- `pnpm build` — production build
- `pnpm start` — run production server
- `pnpm lint` — ESLint
