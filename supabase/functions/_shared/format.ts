export function formatLkr(amount: number): string {
  return new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 }).format(Math.round(amount));
}

// "2026-09-29" -> "29 Sep"
export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
