import { formatLkr, formatShortDate } from "./format.ts";
import type { Karat } from "./parse.ts";

const KARATS: Karat[] = ["24k", "22k", "18k"];

export interface CurrentPrices {
  date: string | null;
  isToday: boolean;
  shopCount: number;
  prices: Partial<Record<Karat, number>>;
}

export interface SubmissionItem {
  karat: Karat;
  pricePerGram: number;
  flaggedOutlier: boolean;
}

function withSiteLink(text: string, siteUrl: string | undefined): string {
  return siteUrl ? `${text}\n\nFull comparison: ${siteUrl}` : text;
}

export function priceReply(current: CurrentPrices, siteUrl: string | undefined): string {
  if (!current.date || Object.keys(current.prices).length === 0) {
    return "No prices have been submitted yet. Please check again later today.";
  }

  const heading = current.isToday
    ? "Today's gold price (LKR per gram)"
    : `No submissions yet today. Latest prices from ${formatShortDate(current.date)} (LKR per gram)`;

  const lines = KARATS.filter((k) => current.prices[k] !== undefined).map(
    (k) => `${k.toUpperCase()}  ${formatLkr(current.prices[k] ?? 0)}`,
  );

  const shops = `Median across ${current.shopCount} ${current.shopCount === 1 ? "shop" : "shops"}.`;

  return withSiteLink([heading, ...lines, shops].join("\n"), siteUrl);
}

export function submissionReceipt(jewellerName: string, items: SubmissionItem[]): string {
  const saved = items
    .map((item) => `${item.karat.toUpperCase()} ${formatLkr(item.pricePerGram)}`)
    .join(" · ");
  const flagged = items.filter((item) => item.flaggedOutlier).map((item) => item.karat.toUpperCase());

  const lines = [`Thanks, ${jewellerName}. Saved: ${saved} LKR/g.`];
  if (flagged.length > 0) {
    lines.push(
      `${flagged.join(" and ")} ${flagged.length === 1 ? "is" : "are"} more than 5% away from today's median, so ${flagged.length === 1 ? "it is" : "they are"} held for review before counting. If that was a typo, send the corrected price.`,
    );
  }
  return lines.join("\n");
}

export const notRegisteredReply =
  "This number isn't registered as a Goldie jeweller. To see today's prices, send PRICE.";

export const notApprovedReply =
  "Your shop is still awaiting approval. Your prices will count once it's approved.";

export const subscribedReply =
  "You're subscribed. You'll get today's gold price each morning. Send STOP to unsubscribe.";

export const unsubscribedReply =
  "You're unsubscribed and won't get daily prices. Send SUBSCRIBE to start again.";

export const unsupportedTypeReply =
  "I can only read text messages. Send PRICE for today's gold price, or HELP for options.";

export function helpReply(siteUrl: string | undefined): string {
  return withSiteLink(
    [
      "Goldie — Sri Lanka gold prices",
      "PRICE — today's gold price",
      "SUBSCRIBE — daily price each morning",
      "STOP — stop daily messages",
      "Jewellers: send today's prices per gram, e.g. 24k 46500 22k 42600 18k 34900",
    ].join("\n"),
    siteUrl,
  );
}

export function invalidPricesReply(reason: string): string {
  return `Nothing was saved. ${reason}`;
}
