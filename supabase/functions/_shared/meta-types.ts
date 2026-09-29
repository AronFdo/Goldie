import { z } from "npm:zod@4.4.3";

// Subset of the WhatsApp Cloud API webhook payload that Goldie reads.
// https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages
// Unknown keys are stripped; the raw payload is logged separately.

export const inboundMessageSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  // Absent for users who only share a business-scoped user ID (BSUID).
  from: z.string().optional(),
  from_user_id: z.string().optional(),
  text: z.object({ body: z.string() }).optional(),
  button: z.object({ text: z.string(), payload: z.string().optional() }).optional(),
});

export const statusErrorSchema = z.object({
  code: z.number(),
  title: z.string(),
  message: z.string().optional(),
});

export const statusSchema = z.object({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  errors: z.array(statusErrorSchema).optional(),
});

export const messagesValueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  metadata: z.object({
    display_phone_number: z.string(),
    phone_number_id: z.string(),
  }),
  contacts: z
    .array(
      z.object({
        wa_id: z.string().optional(),
        user_id: z.string().optional(),
        profile: z.object({ name: z.string() }).optional(),
      }),
    )
    .optional(),
  messages: z.array(inboundMessageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
});

export const webhookPayloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.unknown(),
        }),
      ),
    }),
  ),
});

export type InboundMessage = z.infer<typeof inboundMessageSchema>;
export type MessageStatus = z.infer<typeof statusSchema>;
export type MessagesValue = z.infer<typeof messagesValueSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

// Graph API send response / error envelope.
export const sendSuccessSchema = z.object({
  messages: z.array(z.object({ id: z.string() })).min(1),
});

export const graphErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
    error_subcode: z.number().optional(),
    fbtrace_id: z.string().optional(),
  }),
});
