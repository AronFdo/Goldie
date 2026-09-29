"use client";

import { formatColomboTime, formatLkr } from "@/lib/format";
import type { BoardData, Karat } from "@/lib/types";

function karatLabel(karat: Karat): string {
  return karat.toUpperCase();
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null || Math.abs(pct) < 0.05) return null;
  const up = pct > 0;
  return (
    <span
      className={`ml-2 font-mono text-sm tabular-nums ${
        up ? "text-deep-emerald" : "text-brick"
      }`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(pct).toFixed(1)} percent`}
    >
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function SettlingPrice({ value, delayMs }: { value: number; delayMs: number }) {
  return (
    <span
      className="digit-settle font-mono text-3xl font-medium tabular-nums tracking-tight text-antique-gold sm:text-4xl md:text-5xl"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {formatLkr(value)}
    </span>
  );
}

export function TheBoard({ data }: { data: BoardData }) {
  return (
    <section
      aria-label="Today's gold price board"
      className="board-glow relative overflow-hidden border border-brass-line/40 bg-ink px-5 py-8 sm:px-8 sm:py-10"
    >
      <div className="board-scanlines absolute inset-0 opacity-60" aria-hidden />
      <div className="relative z-10">
        <p className="font-display text-2xl tracking-wide text-parchment sm:text-3xl">
          Goldie
        </p>
        <p className="mt-1 text-sm text-parchment/70">Today&apos;s gold price</p>

        {data.showingYesterday && (
          <p className="mt-4 text-sm text-brick" role="status">
            No submissions yet today — showing yesterday&apos;s prices
          </p>
        )}

        <ul className="mt-8 space-y-5">
          {data.prices.map((row, i) => (
            <li
              key={row.karat}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-brass-line/25 pb-4 last:border-0 last:pb-0"
            >
              <span className="w-12 font-mono text-sm tabular-nums text-parchment/80">
                {karatLabel(row.karat)}
              </span>
              <span className="text-sm text-parchment/55">LKR</span>
              <SettlingPrice value={row.price} delayMs={i * 90} />
              <span className="text-sm text-parchment/55">/g</span>
              <Delta pct={row.deltaPct} />
            </li>
          ))}
        </ul>

        <p className="mt-8 font-mono text-xs tabular-nums text-parchment/60">
          updated {formatColomboTime(data.updatedAt)}
          <span className="mx-2 text-brass-line">·</span>
          {data.shopCount} {data.shopCount === 1 ? "shop" : "shops"}
        </p>
      </div>
    </section>
  );
}
