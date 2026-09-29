# Project Context for Cursor

This file is context for the AI agent working in this repo. Read it before generating code.

## What this is

A gold price aggregation platform for Sri Lanka, with two front doors sharing one backend:
1. **WhatsApp agent** — jewellers submit daily prices via message; consumers query prices via message.
2. **Web app** — public page showing today's aggregate price, a per-jeweller comparison table, a karat conversion calculator, and price trends.

Jewellers are the supply side (write), consumers are the demand side (read). Trust and data quality on the write path matter more than feature count on the read path.

## Tech stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend/DB**: Supabase (Postgres, Row Level Security, Edge Functions for webhooks, pg_cron for scheduled jobs)
- **WhatsApp**: Meta WhatsApp Cloud API (official, not Twilio/BSP, not unofficial libraries)
- **Hosting**: Vercel (web app), Supabase (DB + edge functions)
- **Charts**: Recharts, for the trend sparklines
- Package manager: pnpm unless the repo already has a lockfile saying otherwise — check before assuming.

## Data model (source of truth)

Don't invent alternate schemas. Extend this one if needed, but keep these core tables:

- `jewellers` — id, name, phone_number (unique), area, status (pending/approved/suspended), created_at
- `submissions` — id, jeweller_id (fk), karat (24k/22k/18k), price_per_gram, submitted_at, flagged_outlier (bool)
- `daily_prices` — date, karat, median_price, submission_count (computed/aggregated row, one per day per karat)
- `whatsapp_messages` — inbound/outbound log for debugging conversation flows (id, phone_number, direction, payload, created_at) — don't skip this, WhatsApp webhook bugs are hard to debug without a message log.

All monetary values in LKR. All timestamps stored UTC, displayed in Asia/Colombo.

## Aggregation rules — do not change without asking

- Use **median**, not mean, across a day's submissions per karat. Mean is not a design preference here — it's the guard against a single fat-fingered entry skewing the public number.
- Flag submissions that deviate more than a threshold (e.g. 5%) from the current running median as `flagged_outlier = true`. Excluded from the public aggregate until reviewed, but keep the row.
- A jeweller with `status != approved` must never contribute to `daily_prices`, even if they somehow message the webhook.

## WhatsApp integration guidelines

- All webhook logic goes through a single verified endpoint; validate Meta's signature on every inbound request.
- Business-initiated messages (morning nudge to jewellers, opt-in consumer broadcast) **must** use pre-approved message templates — this is a Meta policy requirement, not optional. Freeform text only works within the 24-hour customer-service window after a user messages first.
- Keep webhook handlers thin: parse → validate → write to DB → respond fast (Meta expects quick 200s). Push any heavier logic (aggregation, notification fan-out) to a queued job or cron, not inline in the webhook.
- Never hardcode phone numbers, tokens, or the WhatsApp Business Account ID — all via environment variables, never committed.

## Coding conventions

- Prefer Server Components for anything read-only (price displays, tables); Client Components only where interactivity is needed (the karat calculator, filters).
- API routes / Edge Functions: validate input with zod (or similar) before touching the DB — this app takes public input (WhatsApp messages), treat all of it as untrusted.
- No `any` in TypeScript. If a type is genuinely unknown (e.g. raw WhatsApp webhook payload), define it properly from Meta's docs rather than typing loosely.
- Error handling: user-facing errors (WhatsApp replies, web UI) should be plain-language and actionable, not raw error dumps. Log the raw error server-side.
- Don't introduce a new state management library — React state + Supabase client is enough for this app's complexity.
- Keep environment-specific config (API keys, webhook verify tokens) in `.env.local`, never in code. Add new required env vars to `.env.example` when you introduce them.

## Things not to do

- Don't build a generic "admin dashboard" template — the actual need is: approve/suspend jewellers, review flagged outliers, view message logs. Build only those screens.
- Don't add real-time subscriptions (Supabase Realtime) for price data — prices update at most once a day per jeweller; polling/ISR is sufficient and cheaper.
- Don't let the web app query WhatsApp APIs directly — web app only ever talks to Supabase. WhatsApp Cloud API calls stay server-side in webhook/cron handlers.
