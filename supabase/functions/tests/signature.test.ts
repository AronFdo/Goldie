import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { signBody, timingSafeEqual, verifyMetaSignature } from "../_shared/signature.ts";

const secret = "test-app-secret";
const body = new TextEncoder().encode('{"object":"whatsapp_business_account","entry":[]}');

Deno.test("matches a known HMAC-SHA256 vector", async () => {
  // echo -n '{"object":"whatsapp_business_account","entry":[]}' | openssl dgst -sha256 -hmac test-app-secret
  assertEquals(
    await signBody(body, secret),
    "sha256=c84a394cc475525991e78ff16e430b02e47f953877d2af0ade26956ce6f384dc",
  );
});

Deno.test("accepts a correctly signed body", async () => {
  const header = await signBody(body, secret);
  assert(await verifyMetaSignature(body, header, secret));
});

Deno.test("rejects a tampered body", async () => {
  const header = await signBody(body, secret);
  const tampered = new TextEncoder().encode('{"object":"whatsapp_business_account","entry":[{}]}');
  assertFalse(await verifyMetaSignature(tampered, header, secret));
});

Deno.test("rejects a missing or malformed header", async () => {
  assertFalse(await verifyMetaSignature(body, null, secret));
  assertFalse(await verifyMetaSignature(body, "md5=abc", secret));
});

Deno.test("rejects the wrong secret", async () => {
  const header = await signBody(body, "other-secret");
  assertFalse(await verifyMetaSignature(body, header, secret));
});

Deno.test("timingSafeEqual compares exactly", () => {
  assert(timingSafeEqual("abc", "abc"));
  assertFalse(timingSafeEqual("abc", "abd"));
  assertFalse(timingSafeEqual("abc", "abcd"));
});
