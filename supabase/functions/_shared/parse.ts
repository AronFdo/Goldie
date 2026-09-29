export type Karat = "24k" | "22k" | "18k";

export type PriceSet = Partial<Record<Karat, number>>;

export type Intent =
  | { kind: "submit_prices"; prices: PriceSet }
  | { kind: "invalid_prices"; reason: string }
  | { kind: "price_query" }
  | { kind: "subscribe" }
  | { kind: "unsubscribe" }
  | { kind: "help" };

const GRAMS_PER_PAWN = 8;
const MIN_PER_GRAM = 1_000;
const MAX_PER_GRAM = 200_000;

const PRICE_QUERY_WORDS = new Set(["price", "prices", "rate", "rates", "gold", "today"]);
const SUBSCRIBE_WORDS = new Set(["subscribe", "start", "alerts", "join"]);
const UNSUBSCRIBE_WORDS = new Set(["stop", "unsubscribe", "cancel"]);

// "24k 46500", "22K: 42,600", "18kt - Rs. 34900", "22 carat = LKR 42600", "22k pawn 340800"
const PRICE_PATTERN =
  /\b(24|22|18)\s*(?:k|kt|karat|carat|ct)\b\s*[:=-]?\s*(?:(?:per\s+|\/\s*)?(?:pawn|pawan|pavan|sovereign|grams?|g)s?\b\s*[:=-]?\s*)?(?:rs\.?|lkr)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gi;

const PAWN_PATTERN = /\b(pawn|pawan|pavan|sovereign)s?\b/i;

function label(karat: Karat): string {
  return karat.toUpperCase();
}

export function parseIntent(raw: string): Intent {
  const text = raw.trim();
  const matches = [...text.matchAll(PRICE_PATTERN)];

  if (matches.length > 0) {
    return parsePrices(text, matches);
  }

  const word = text.toLowerCase().replace(/[^a-z]/g, "");
  if (PRICE_QUERY_WORDS.has(word)) return { kind: "price_query" };
  if (SUBSCRIBE_WORDS.has(word)) return { kind: "subscribe" };
  if (UNSUBSCRIBE_WORDS.has(word)) return { kind: "unsubscribe" };
  return { kind: "help" };
}

function parsePrices(text: string, matches: RegExpMatchArray[]): Intent {
  const perPawn = PAWN_PATTERN.test(text);
  const prices: PriceSet = {};

  for (const match of matches) {
    const karat = `${match[1]}k` as Karat;
    const value = Number(match[2].replace(/,/g, ""));
    const perGram = perPawn ? value / GRAMS_PER_PAWN : value;
    const rounded = Math.round(perGram * 100) / 100;

    const existing = prices[karat];
    if (existing !== undefined && existing !== rounded) {
      return {
        kind: "invalid_prices",
        reason: `You sent two different ${label(karat)} prices. Please send one price per karat.`,
      };
    }

    if (!Number.isFinite(rounded) || rounded < MIN_PER_GRAM) {
      return {
        kind: "invalid_prices",
        reason: `${label(karat)} ${match[2]} looks too low. Send the price per gram in LKR, for example 24k 46500.`,
      };
    }

    if (rounded > MAX_PER_GRAM) {
      return {
        kind: "invalid_prices",
        reason: `${label(karat)} ${match[2]} looks like a pawn price. Add the word "pawn" or send the price per gram.`,
      };
    }

    prices[karat] = rounded;
  }

  const order: Karat[] = ["24k", "22k", "18k"];
  const present = order.filter((k) => prices[k] !== undefined);
  for (let i = 1; i < present.length; i++) {
    const higher = present[i - 1];
    const lower = present[i];
    if ((prices[higher] ?? 0) <= (prices[lower] ?? 0)) {
      return {
        kind: "invalid_prices",
        reason: `${label(higher)} should be higher than ${label(lower)}. Please check and send again.`,
      };
    }
  }

  return { kind: "submit_prices", prices };
}

// Meta sends wa_id / from as digits only ("94771234567"); jewellers are stored E.164.
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}
