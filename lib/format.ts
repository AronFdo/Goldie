const COLOMBO = "Asia/Colombo";

export function formatLkr(amount: number): string {
  return new Intl.NumberFormat("en-LK", {
    style: "decimal",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function formatLkrFull(amount: number): string {
  return `LKR ${formatLkr(amount)}`;
}

export function formatColomboTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-LK", {
    timeZone: COLOMBO,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatColomboRelative(iso: string | null, now = new Date()): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function isStale(updatedAt: string | null, hours = 6, now = new Date()): boolean {
  if (!updatedAt) return true;
  const then = new Date(updatedAt);
  return now.getTime() - then.getTime() > hours * 60 * 60 * 1000;
}

export function deltaPct(today: number, yesterday: number): number {
  if (yesterday === 0) return 0;
  return ((today - yesterday) / yesterday) * 100;
}

export function colomboDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysColombo(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
