// Sends due outbound_jobs. Invoked every minute by pg_cron (only when work is
// due) and authenticated with a shared secret header rather than a JWT.

import { createServiceClient } from "../_shared/db.ts";
import { loadDispatchEnv, loadSupabaseEnv, loadWhatsAppEnv } from "../_shared/env.ts";
import { type DispatchSummary, dispatchJobs } from "../_shared/outbound.ts";
import { json } from "../_shared/runtime.ts";
import { timingSafeEqual } from "../_shared/signature.ts";

const TIME_BUDGET_MS = 20_000;
const BATCH_SIZE = 25;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let config;
  try {
    config = {
      supabase: loadSupabaseEnv(),
      whatsapp: loadWhatsAppEnv(),
      dispatch: loadDispatchEnv(),
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "dispatch_config_invalid",
      error: error instanceof Error ? error.message : String(error),
    }));
    return json({ error: "Server misconfigured" }, 500);
  }

  const secret = req.headers.get("x-dispatch-secret");
  if (!secret || !timingSafeEqual(secret, config.dispatch.DISPATCH_SECRET)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const db = createServiceClient(config.supabase);
  const deadline = Date.now() + TIME_BUDGET_MS;
  const total: DispatchSummary = { claimed: 0, sent: 0, retrying: 0, failed: 0 };

  try {
    while (Date.now() < deadline) {
      const batch = await dispatchJobs(db, config.whatsapp, { limit: BATCH_SIZE });
      total.claimed += batch.claimed;
      total.sent += batch.sent;
      total.retrying += batch.retrying;
      total.failed += batch.failed;
      if (batch.claimed < BATCH_SIZE) break;
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "dispatch_failed",
      error: error instanceof Error ? error.message : String(error),
      progress: total,
    }));
    return json({ error: "Dispatch failed", progress: total }, 500);
  }

  return json(total);
});
