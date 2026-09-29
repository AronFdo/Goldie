// Single verified entry point for Meta's WhatsApp webhook.
// GET: subscription handshake. POST: verify signature -> log -> write -> 200.
// Replies are queued in outbound_jobs and sent in the background; the cron
// dispatcher retries anything that doesn't go out immediately.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";
import { createServiceClient, currentPricesSchema, submissionResultSchema } from "../_shared/db.ts";
import {
  loadSupabaseEnv,
  loadWebhookEnv,
  loadWhatsAppEnv,
  type SupabaseEnv,
  type WebhookEnv,
  type WhatsAppEnv,
} from "../_shared/env.ts";
import {
  helpReply,
  invalidPricesReply,
  notApprovedReply,
  notRegisteredReply,
  priceReply,
  subscribedReply,
  submissionReceipt,
  unsubscribedReply,
  unsupportedTypeReply,
} from "../_shared/messages.ts";
import {
  type InboundMessage,
  type MessageStatus,
  messagesValueSchema,
  webhookPayloadSchema,
} from "../_shared/meta-types.ts";
import { dispatchJobs, enqueueTextReply } from "../_shared/outbound.ts";
import { normalizePhone, parseIntent } from "../_shared/parse.ts";
import { runInBackground } from "../_shared/runtime.ts";
import { timingSafeEqual, verifyMetaSignature } from "../_shared/signature.ts";

interface Config {
  supabase: SupabaseEnv;
  whatsapp: WhatsAppEnv;
  webhook: WebhookEnv;
}

const IGNORED_MESSAGE_TYPES = new Set(["system", "reaction", "unsupported"]);

function logError(event: string, detail: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...detail }));
}

function loadConfig(): Config {
  return {
    supabase: loadSupabaseEnv(),
    whatsapp: loadWhatsAppEnv(),
    webhook: loadWebhookEnv(),
  };
}

function verifySubscription(url: URL, webhook: WebhookEnv): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge && timingSafeEqual(token, webhook.WHATSAPP_VERIFY_TOKEN)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

async function replyFor(
  db: SupabaseClient,
  config: Config,
  phone: string,
  message: InboundMessage,
): Promise<string | null> {
  if (IGNORED_MESSAGE_TYPES.has(message.type)) return null;

  const text = message.text?.body ?? message.button?.text;
  if (!text) return unsupportedTypeReply;

  const siteUrl = config.whatsapp.PUBLIC_SITE_URL;
  const intent = parseIntent(text);

  switch (intent.kind) {
    case "submit_prices": {
      const { data, error } = await db.rpc("record_price_submission", {
        p_phone: phone,
        p_prices: intent.prices,
      });
      if (error) throw new Error(`record_price_submission failed: ${error.message}`);

      const result = submissionResultSchema.parse(data);
      switch (result.status) {
        case "ok":
          return submissionReceipt(
            result.jeweller_name,
            result.items.map((item) => ({
              karat: item.karat,
              pricePerGram: item.price_per_gram,
              flaggedOutlier: item.flagged_outlier,
            })),
          );
        case "not_registered":
          return notRegisteredReply;
        case "not_approved":
          return notApprovedReply;
      }
      break;
    }
    case "invalid_prices":
      return invalidPricesReply(intent.reason);
    case "price_query": {
      const { data, error } = await db.rpc("current_prices");
      if (error) throw new Error(`current_prices failed: ${error.message}`);
      const current = currentPricesSchema.parse(data);
      return priceReply(
        {
          date: current.date,
          isToday: current.is_today,
          shopCount: current.shop_count ?? 0,
          prices: current.prices,
        },
        siteUrl,
      );
    }
    case "subscribe":
    case "unsubscribe": {
      const optedIn = intent.kind === "subscribe";
      const now = new Date().toISOString();
      const { error } = await db.from("consumer_subscribers").upsert(
        optedIn
          ? { phone_number: phone, opted_in: true, opted_in_at: now, opted_out_at: null }
          : { phone_number: phone, opted_in: false, opted_out_at: now },
        { onConflict: "phone_number" },
      );
      if (error) throw new Error(`consumer_subscribers upsert failed: ${error.message}`);
      return optedIn ? subscribedReply : unsubscribedReply;
    }
    case "help":
      return helpReply(siteUrl);
  }
  return null;
}

// Returns the queued reply job id, if a new one was created.
async function handleMessage(
  db: SupabaseClient,
  config: Config,
  message: InboundMessage,
  rawValue: unknown,
): Promise<string | null> {
  const phone = message.from ? normalizePhone(message.from) : null;
  const logPhone = phone ?? `bsuid:${message.from_user_id ?? "unknown"}`;

  const { data: alreadyProcessed, error: logErrorResult } = await db.rpc("log_inbound_message", {
    p_wa_message_id: message.id,
    p_phone: logPhone,
    p_message_type: message.type,
    p_payload: rawValue,
  });
  if (logErrorResult) throw new Error(`log_inbound_message failed: ${logErrorResult.message}`);
  if (alreadyProcessed === true) return null;

  let jobId: string | null = null;
  if (phone) {
    const reply = await replyFor(db, config, phone, message);
    if (reply) {
      jobId = await enqueueTextReply(db, `reply:${message.id}`, phone, reply);
    }
  }

  const { error: markError } = await db
    .from("whatsapp_messages")
    .update({ processed_at: new Date().toISOString() })
    .eq("wa_message_id", message.id)
    .eq("direction", "inbound");
  if (markError) throw new Error(`Failed to mark message processed: ${markError.message}`);

  return jobId;
}

async function recordStatus(db: SupabaseClient, status: MessageStatus): Promise<void> {
  const firstError = status.errors?.[0];
  const { error } = await db
    .from("outbound_jobs")
    .update({
      delivery_status: status.status,
      ...(firstError ? { last_error: `${firstError.code}: ${firstError.message ?? firstError.title}` } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("wa_message_id", status.id);
  if (error) throw new Error(`Failed to record status: ${error.message}`);
}

async function handleEvent(req: Request): Promise<Response> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    logError("webhook_config_invalid", { error: error instanceof Error ? error.message : String(error) });
    return new Response("Server misconfigured", { status: 500 });
  }

  const raw = new Uint8Array(await req.arrayBuffer());
  const signatureValid = await verifyMetaSignature(
    raw,
    req.headers.get("x-hub-signature-256"),
    config.webhook.WHATSAPP_APP_SECRET,
  );
  if (!signatureValid) {
    logError("webhook_signature_invalid", {});
    return new Response("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const payload = webhookPayloadSchema.safeParse(body);
  if (!payload.success) {
    // Signed by Meta but not a shape we handle; acknowledge so it isn't retried.
    logError("webhook_payload_unrecognised", { issues: payload.error.issues.slice(0, 5) });
    return new Response("OK", { status: 200 });
  }

  const db = createServiceClient(config.supabase);
  const replyJobIds: string[] = [];
  let failures = 0;

  for (const entry of payload.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const value = messagesValueSchema.safeParse(change.value);
      if (!value.success) {
        logError("webhook_messages_value_unrecognised", { issues: value.error.issues.slice(0, 5) });
        continue;
      }
      if (value.data.metadata.phone_number_id !== config.whatsapp.WHATSAPP_PHONE_NUMBER_ID) continue;

      for (const status of value.data.statuses ?? []) {
        try {
          await recordStatus(db, status);
        } catch (error) {
          failures += 1;
          logError("webhook_status_failed", {
            waMessageId: status.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      for (const message of value.data.messages ?? []) {
        try {
          const jobId = await handleMessage(db, config, message, change.value);
          if (jobId) replyJobIds.push(jobId);
        } catch (error) {
          failures += 1;
          logError("webhook_message_failed", {
            waMessageId: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  if (replyJobIds.length > 0) {
    runInBackground(
      dispatchJobs(db, config.whatsapp, { ids: replyJobIds, limit: replyJobIds.length }),
      "dispatch_replies",
    );
  }

  // A 500 makes Meta redeliver; already-processed messages are skipped on retry.
  return failures > 0 ? new Response("Retry", { status: 500 }) : new Response("OK", { status: 200 });
}

Deno.serve(async (req) => {
  if (req.method === "POST") return await handleEvent(req);

  if (req.method === "GET") {
    try {
      return verifySubscription(new URL(req.url), loadWebhookEnv());
    } catch (error) {
      logError("webhook_config_invalid", { error: error instanceof Error ? error.message : String(error) });
      return new Response("Server misconfigured", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
