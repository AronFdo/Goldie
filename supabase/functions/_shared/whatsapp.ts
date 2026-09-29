import type { WhatsAppEnv } from "./env.ts";
import { graphErrorSchema, sendSuccessSchema } from "./meta-types.ts";

export type SendBody =
  | { type: "text"; text: { body: string; preview_url: boolean } }
  | {
    type: "template";
    template: {
      name: string;
      language: { code: string };
      components: { type: "body"; parameters: { type: "text"; text: string }[] }[];
    };
  };

export type SendResult =
  | { ok: true; messageId: string; response: unknown }
  | { ok: false; retryable: boolean; error: string; code: number | null; response: unknown };

// Meta error codes worth retrying later: throttling, spam/pair rate limits,
// and transient platform errors. Everything else (template problems,
// re-engagement window closed, invalid recipient) needs a human.
const RETRYABLE_CODES = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131048, 131056, 133004]);

export function textBody(body: string): SendBody {
  return { type: "text", text: { body, preview_url: true } };
}

export function templateBody(name: string, languageCode: string, params: string[]): SendBody {
  return {
    type: "template",
    template: {
      name,
      language: { code: languageCode },
      components: params.length > 0
        ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
        : [],
    },
  };
}

export async function sendWhatsAppMessage(
  env: WhatsAppEnv,
  toE164: string,
  body: SendBody,
): Promise<SendResult> {
  const url = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toE164.replace(/^\+/, ""),
        ...body,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      error: `Network error: ${error instanceof Error ? error.message : String(error)}`,
      code: null,
      response: null,
    };
  }

  const json: unknown = await response.json().catch(() => null);

  if (response.ok) {
    const parsed = sendSuccessSchema.safeParse(json);
    if (parsed.success) {
      return { ok: true, messageId: parsed.data.messages[0].id, response: json };
    }
    return { ok: false, retryable: false, error: "Unexpected Graph API response", code: null, response: json };
  }

  const graphError = graphErrorSchema.safeParse(json);
  const code = graphError.success ? graphError.data.error.code : null;
  const message = graphError.success ? graphError.data.error.message : `HTTP ${response.status}`;
  const retryable = response.status >= 500 || response.status === 429 ||
    (code !== null && RETRYABLE_CODES.has(code));

  return { ok: false, retryable, error: `${code ?? response.status}: ${message}`, code, response: json };
}
