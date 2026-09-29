import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";
import type { WhatsAppEnv } from "./env.ts";
import {
  consumerDailyPricePayloadSchema,
  jewellerNudgePayloadSchema,
  type OutboundJob,
  outboundJobSchema,
  textPayloadSchema,
} from "./db.ts";
import { formatLkr, formatShortDate } from "./format.ts";
import { type SendBody, sendWhatsAppMessage, templateBody, textBody } from "./whatsapp.ts";

export interface DispatchSummary {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
}

const MAX_BACKOFF_MINUTES = 60;

export async function enqueueTextReply(
  db: SupabaseClient,
  dedupeKey: string,
  toPhone: string,
  body: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("outbound_jobs")
    .upsert(
      { dedupe_key: dedupeKey, to_phone: toPhone, kind: "text", payload: { body } },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");

  if (error) throw new Error(`Failed to enqueue reply: ${error.message}`);
  const rows = (data ?? []) as { id: string }[];
  return rows[0]?.id ?? null;
}

function buildBody(env: WhatsAppEnv, job: OutboundJob): SendBody {
  switch (job.kind) {
    case "text":
      return textBody(textPayloadSchema.parse(job.payload).body);
    case "jeweller_nudge": {
      const payload = jewellerNudgePayloadSchema.parse(job.payload);
      return templateBody(env.WHATSAPP_TEMPLATE_JEWELLER_NUDGE, env.WHATSAPP_TEMPLATE_LANGUAGE, [
        payload.name,
      ]);
    }
    case "consumer_daily_price": {
      const payload = consumerDailyPricePayloadSchema.parse(job.payload);
      const price = (value: number | undefined) => (value === undefined ? "-" : formatLkr(value));
      return templateBody(
        env.WHATSAPP_TEMPLATE_CONSUMER_DAILY_PRICE,
        env.WHATSAPP_TEMPLATE_LANGUAGE,
        [
          formatShortDate(payload.date),
          String(payload.shop_count),
          price(payload.prices["24k"]),
          price(payload.prices["22k"]),
          price(payload.prices["18k"]),
        ],
      );
    }
  }
}

// A failed status write after a successful send would let the stall reclaim
// resend the message, so surface it loudly.
async function updateJob(db: SupabaseClient, jobId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await db
    .from("outbound_jobs")
    .update({ ...fields, locked_at: null, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) {
    console.error(JSON.stringify({ event: "outbound_job_update_failed", jobId, fields, error: error.message }));
  }
}

async function logOutbound(
  db: SupabaseClient,
  job: OutboundJob,
  body: SendBody | null,
  result: unknown,
  waMessageId: string | null,
): Promise<void> {
  const { error } = await db.from("whatsapp_messages").insert({
    phone_number: job.to_phone,
    direction: "outbound",
    wa_message_id: waMessageId,
    message_type: body?.type ?? job.kind,
    payload: { job_id: job.id, kind: job.kind, attempt: job.attempts, request: body, result },
  });
  if (error) console.error(JSON.stringify({ event: "outbound_log_failed", jobId: job.id, error: error.message }));
}

async function processJob(db: SupabaseClient, env: WhatsAppEnv, job: OutboundJob): Promise<"sent" | "retrying" | "failed"> {
  let body: SendBody;
  try {
    body = buildBody(env, job);
  } catch (error) {
    const message = `Invalid job payload: ${error instanceof Error ? error.message : String(error)}`;
    await updateJob(db, job.id, { status: "failed", last_error: message });
    await logOutbound(db, job, null, { error: message }, null);
    return "failed";
  }

  const result = await sendWhatsAppMessage(env, job.to_phone, body);

  if (result.ok) {
    await updateJob(db, job.id, { status: "sent", wa_message_id: result.messageId, last_error: null });
    await logOutbound(db, job, body, result.response, result.messageId);
    return "sent";
  }

  const willRetry = result.retryable && job.attempts < job.max_attempts;
  const backoffMinutes = Math.min(2 ** job.attempts, MAX_BACKOFF_MINUTES);

  await updateJob(db, job.id, willRetry
    ? {
      status: "pending",
      run_after: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
      last_error: result.error,
    }
    : { status: "failed", last_error: result.error });
  await logOutbound(db, job, body, { error: result.error, response: result.response }, null);

  console.error(JSON.stringify({
    event: "outbound_send_failed",
    jobId: job.id,
    kind: job.kind,
    attempt: job.attempts,
    willRetry,
    error: result.error,
  }));

  return willRetry ? "retrying" : "failed";
}

// Claims due jobs (optionally only the given ids) and sends them.
export async function dispatchJobs(
  db: SupabaseClient,
  env: WhatsAppEnv,
  options: { limit?: number; ids?: string[] } = {},
): Promise<DispatchSummary> {
  const { data, error } = await db.rpc("claim_outbound_jobs", {
    p_limit: options.limit ?? 20,
    p_ids: options.ids ?? null,
  });
  if (error) throw new Error(`Failed to claim jobs: ${error.message}`);

  const jobs = outboundJobSchema.array().parse(data ?? []);
  const summary: DispatchSummary = { claimed: jobs.length, sent: 0, retrying: 0, failed: 0 };

  for (const job of jobs) {
    const outcome = await processJob(db, env, job);
    summary[outcome] += 1;
  }

  return summary;
}
