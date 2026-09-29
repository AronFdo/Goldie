"use client";

import { useMemo, useState } from "react";
import {
  formatColomboRelative,
  formatLkr,
  isStale,
} from "@/lib/format";
import type { ComparisonRow } from "@/lib/types";

type SortKey = "price22k" | "price24k" | "updated" | "name";

function priceCell(value: number | null) {
  if (value === null) return "—";
  return formatLkr(value);
}

export function ComparisonSection({
  rows,
  areas,
}: {
  rows: ComparisonRow[];
  areas: string[];
}) {
  const [area, setArea] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("price22k");

  const filtered = useMemo(() => {
    let list = area === "all" ? rows : rows.filter((r) => r.area === area);

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "price22k": {
          const av = a.price22k ?? Number.POSITIVE_INFINITY;
          const bv = b.price22k ?? Number.POSITIVE_INFINITY;
          return av - bv;
        }
        case "price24k": {
          const av = a.price24k ?? Number.POSITIVE_INFINITY;
          const bv = b.price24k ?? Number.POSITIVE_INFINITY;
          return av - bv;
        }
        case "updated": {
          const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bt - at;
        }
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [rows, area, sort]);

  return (
    <section aria-label="Jeweller price comparison" className="min-w-0">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl text-ink">Shop rates</h2>
          <p className="mt-1 text-sm text-brass-line">
            Compare today&apos;s posted prices by jeweller
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-brass-line">
            Area
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="min-w-[9rem] border border-brass-line/50 bg-parchment px-2 py-2 text-sm text-ink"
            >
              <option value="all">All areas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-brass-line">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="min-w-[9rem] border border-brass-line/50 bg-parchment px-2 py-2 text-sm text-ink"
            >
              <option value="price22k">Price (22K)</option>
              <option value="price24k">Price (24K)</option>
              <option value="updated">Updated</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="border border-brass-line/40 bg-parchment/50 px-4 py-6 text-sm text-ink">
          No shops match this area. Try another filter.
        </p>
      ) : (
        <div className="overflow-x-auto border-y border-brass-line/40">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-brass-line/40 text-xs uppercase tracking-wide text-brass-line">
                <th className="py-3 pr-4 font-medium">Shop</th>
                <th className="py-3 pr-4 font-medium font-mono">24K</th>
                <th className="py-3 pr-4 font-medium font-mono">22K</th>
                <th className="py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const stale = isStale(row.updatedAt);
                return (
                  <tr
                    key={row.jewellerId}
                    className={`border-b border-brass-line/25 transition-colors hover:bg-brass-line/10 ${
                      stale ? "text-ink/55" : "text-ink"
                    }`}
                  >
                    <td className="py-3 pr-4">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-brass-line">{row.area}</div>
                    </td>
                    <td className="py-3 pr-4 font-mono tabular-nums">
                      {priceCell(row.price24k)}
                    </td>
                    <td className="py-3 pr-4 font-mono tabular-nums">
                      {priceCell(row.price22k)}
                    </td>
                    <td className="py-3 font-mono text-xs tabular-nums">
                      <span className="inline-flex items-center gap-2">
                        {formatColomboRelative(row.updatedAt)}
                        {stale && (
                          <span
                            className="inline-block h-2 w-2 rounded-full bg-brick"
                            title="Stale — last updated more than 6 hours ago"
                            aria-label="Stale price"
                          />
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
