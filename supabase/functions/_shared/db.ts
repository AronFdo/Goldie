import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";
import { z } from "npm:zod@4.4.3";
import type { SupabaseEnv } from "./env.ts";

export function createServiceClient(env: SupabaseEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const karatSchema = z.enum(["24k", "22k", "18k"]);
const numeric = z.coerce.number();

export const outboundJobSchema = z.object({
  id: z.string(),
  dedupe_key: z.string(),
  to_phone: z.string(),
  kind: z.enum(["text", "jeweller_nudge", "consumer_daily_price"]),
  payload: z.unknown(),
  status: z.enum(["pending", "processing", "sent", "failed"]),
  attempts: z.number(),
  max_attempts: z.number(),
});

export type OutboundJob = z.infer<typeof outboundJobSchema>;

export const textPayloadSchema = z.object({ body: z.string().min(1).max(4096) });

export const jewellerNudgePayloadSchema = z.object({ name: z.string().min(1) });

export const consumerDailyPricePayloadSchema = z.object({
  date: z.string(),
  shop_count: z.number(),
  prices: z.partialRecord(karatSchema, numeric),
});

export const submissionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    jeweller_name: z.string(),
    items: z.array(
      z.object({
        karat: karatSchema,
        price_per_gram: numeric,
        flagged_outlier: z.boolean(),
      }),
    ),
  }),
  z.object({ status: z.literal("not_registered") }),
  z.object({ status: z.literal("not_approved"), jeweller_status: z.string() }),
]);

export const currentPricesSchema = z.object({
  date: z.string().nullable(),
  is_today: z.boolean(),
  shop_count: z.coerce.number().nullable(),
  prices: z.partialRecord(karatSchema, numeric),
});
