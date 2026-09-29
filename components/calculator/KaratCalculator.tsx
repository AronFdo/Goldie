"use client";

import { useMemo, useState } from "react";
import { formatLkr } from "@/lib/format";
import type { Karat } from "@/lib/types";

const KARAT_OPTIONS: Karat[] = ["24k", "22k", "18k"];

export function KaratCalculator({
  medians,
}: {
  medians: Record<Karat, number>;
}) {
  const [grams, setGrams] = useState("1");
  const [karat, setKarat] = useState<Karat>("22k");

  const total = useMemo(() => {
    const g = Number.parseFloat(grams);
    if (!Number.isFinite(g) || g < 0) return null;
    return g * medians[karat];
  }, [grams, karat, medians]);

  return (
    <section
      aria-label="Karat conversion calculator"
      className="border border-brass-line bg-parchment p-5"
    >
      <h2 className="font-display text-xl text-ink">Convert</h2>
      <p className="mt-1 text-sm text-brass-line">
        Grams times today&apos;s median
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <label className="flex min-w-[7rem] flex-1 flex-col gap-1 text-xs text-brass-line">
          Grams
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="border border-brass-line/50 bg-parchment px-3 py-2 font-mono text-base tabular-nums text-ink"
          />
        </label>
        <label className="flex min-w-[6rem] flex-col gap-1 text-xs text-brass-line">
          Karat
          <select
            value={karat}
            onChange={(e) => setKarat(e.target.value as Karat)}
            className="border border-brass-line/50 bg-parchment px-3 py-2 text-sm text-ink"
          >
            {KARAT_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-6 border-t border-brass-line/40 pt-4 font-mono text-lg tabular-nums text-ink">
        = LKR{" "}
        <span className="text-2xl text-antique-gold">
          {total === null ? "—" : formatLkr(total)}
        </span>
      </p>
    </section>
  );
}
