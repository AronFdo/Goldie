import { assertEquals } from "jsr:@std/assert@1";
import { normalizePhone, parseIntent } from "../_shared/parse.ts";

Deno.test("parses a full price submission", () => {
  assertEquals(parseIntent("24k 46500 22k 42600 18k 34900"), {
    kind: "submit_prices",
    prices: { "24k": 46500, "22k": 42600, "18k": 34900 },
  });
});

Deno.test("tolerates separators, currency and thousands commas", () => {
  assertEquals(parseIntent("24K: Rs. 46,500\n22kt - LKR 42,600"), {
    kind: "submit_prices",
    prices: { "24k": 46500, "22k": 42600 },
  });
});

Deno.test("converts pawn prices to per gram", () => {
  assertEquals(parseIntent("22k pawn 340800"), {
    kind: "submit_prices",
    prices: { "22k": 42600 },
  });
});

Deno.test("accepts a trailing pawn unit and an explicit per-gram unit", () => {
  assertEquals(parseIntent("24k 372000 22k 340800 per pawn"), {
    kind: "submit_prices",
    prices: { "24k": 46500, "22k": 42600 },
  });
  assertEquals(parseIntent("22k per gram 42600"), {
    kind: "submit_prices",
    prices: { "22k": 42600 },
  });
});

Deno.test("rejects a pawn-sized price without the pawn keyword", () => {
  assertEquals(parseIntent("22k 340800").kind, "invalid_prices");
});

Deno.test("rejects prices that are too low", () => {
  assertEquals(parseIntent("24k 465").kind, "invalid_prices");
});

Deno.test("rejects karat order that can't be right", () => {
  assertEquals(parseIntent("24k 42600 22k 46500").kind, "invalid_prices");
});

Deno.test("rejects conflicting prices for the same karat", () => {
  assertEquals(parseIntent("22k 42600 22k 42700").kind, "invalid_prices");
});

Deno.test("does not treat a bare number as a submission", () => {
  assertEquals(parseIntent("22 42600").kind, "help");
});

Deno.test("recognises keyword commands", () => {
  assertEquals(parseIntent("Price").kind, "price_query");
  assertEquals(parseIntent(" rates? ").kind, "price_query");
  assertEquals(parseIntent("SUBSCRIBE").kind, "subscribe");
  assertEquals(parseIntent("stop").kind, "unsubscribe");
  assertEquals(parseIntent("hello there").kind, "help");
});

Deno.test("normalizes Meta phone ids to E.164", () => {
  assertEquals(normalizePhone("94771110001"), "+94771110001");
  assertEquals(normalizePhone("+94 77 111 0001"), "+94771110001");
  assertEquals(normalizePhone("0771110001"), null);
  assertEquals(normalizePhone("123"), null);
});
