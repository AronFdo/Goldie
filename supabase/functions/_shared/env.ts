import { z } from "npm:zod@4.4.3";

const required = z.string().min(1);

const supabaseSchema = z.object({
  SUPABASE_URL: required,
  SUPABASE_SERVICE_ROLE_KEY: required,
});

const whatsappSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: required,
  WHATSAPP_PHONE_NUMBER_ID: required,
  WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().min(2).default("en"),
  WHATSAPP_TEMPLATE_JEWELLER_NUDGE: z.string().min(1).default("goldie_daily_price_reminder"),
  WHATSAPP_TEMPLATE_CONSUMER_DAILY_PRICE: z.string().min(1).default("goldie_daily_gold_price"),
  PUBLIC_SITE_URL: z.url().optional(),
});

const webhookSchema = z.object({
  WHATSAPP_APP_SECRET: required,
  WHATSAPP_VERIFY_TOKEN: required,
});

const dispatchSchema = z.object({
  DISPATCH_SECRET: z.string().min(24),
});

export type SupabaseEnv = z.infer<typeof supabaseSchema>;
export type WhatsAppEnv = z.infer<typeof whatsappSchema>;
export type WebhookEnv = z.infer<typeof webhookSchema>;
export type DispatchEnv = z.infer<typeof dispatchSchema>;

function load<T extends z.ZodType>(schema: T, name: string): z.infer<T> {
  const result = schema.safeParse(Deno.env.toObject());
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid ${name} configuration: ${missing}`);
  }
  return result.data;
}

export const loadSupabaseEnv = () => load(supabaseSchema, "Supabase");
export const loadWhatsAppEnv = () => load(whatsappSchema, "WhatsApp");
export const loadWebhookEnv = () => load(webhookSchema, "webhook");
export const loadDispatchEnv = () => load(dispatchSchema, "dispatch");
