"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatLkr } from "@/lib/format";
import type { Karat, TrendPoint } from "@/lib/types";

function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

export function TrendSparkline({
  data,
  karat,
  onKaratChange,
}: {
  data: TrendPoint[];
  karat: Karat;
  onKaratChange: (karat: Karat) => void;
}) {
  const chartData = data.map((p) => ({
    ...p,
    label: shortDate(p.date),
  }));

  return (
    <section aria-label="30-day price trend" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">30-day trend</h2>
          <p className="mt-1 text-sm text-brass-line">
            Daily median price per gram
          </p>
        </div>
        <div
          className="flex gap-1"
          role="group"
          aria-label="Trend karat"
        >
          {(["24k", "22k", "18k"] as Karat[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onKaratChange(k)}
              className={`border px-3 py-1.5 font-mono text-xs tabular-nums transition-colors ${
                karat === k
                  ? "border-antique-gold bg-ink text-antique-gold"
                  : "border-brass-line/50 bg-parchment text-ink hover:border-brass-line"
              }`}
            >
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="border border-brass-line/40 px-4 py-8 text-sm text-brass-line">
          No trend data yet.
        </p>
      ) : (
        <div className="h-48 w-full border border-brass-line/30 bg-parchment/40 p-2 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: "#8A7350", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#8A7350", strokeOpacity: 0.4 }}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                domain={["dataMin - 200", "dataMax + 200"]}
                tick={{ fill: "#8A7350", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => formatLkr(v)}
              />
              <Tooltip
                contentStyle={{
                  background: "#F3ECDC",
                  border: "1px solid #8A7350",
                  borderRadius: 0,
                  fontFamily: "var(--font-ibm-plex-mono)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#15120E" }}
                formatter={(value) => [
                  `LKR ${formatLkr(Number(value ?? 0))}`,
                  "Median",
                ]}
              />
              <Line
                type="monotone"
                dataKey="median_price"
                stroke="#C9A34E"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: "#C9A34E" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
