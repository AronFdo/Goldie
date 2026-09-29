import { getFallbackPageData, getFallbackTrend } from "@/lib/data/fallback";
import { addDaysColombo, colomboDateString, deltaPct } from "@/lib/format";
import { createServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type {
  BoardData,
  BoardKaratPrice,
  ComparisonRow,
  DailyPrice,
  Karat,
  PageData,
  TrendPoint,
} from "@/lib/types";

const KARATS: Karat[] = ["24k", "22k", "18k"];

interface PublicJewellerPriceRow {
  jeweller_id: string;
  name: string;
  area: string;
  price_24k: number | string | null;
  price_22k: number | string | null;
  price_18k: number | string | null;
  updated_at: string | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapDaily(rows: DailyPrice[] | null, date: string): Map<Karat, DailyPrice> {
  const map = new Map<Karat, DailyPrice>();
  for (const row of rows ?? []) {
    if (row.date === date) {
      map.set(row.karat, row);
    }
  }
  return map;
}

export async function getBoardData(): Promise<BoardData> {
  const supabase = createServerClient();
  if (!supabase) {
    return getFallbackPageData().board;
  }

  const today = colomboDateString();
  const yesterday = addDaysColombo(today, -1);

  const { data: dailyRows, error: dailyError } = await supabase
    .from("daily_prices")
    .select("date, karat, median_price, submission_count")
    .in("date", [today, yesterday])
    .in("karat", KARATS);

  if (dailyError) {
    throw dailyError;
  }

  const typed = (dailyRows ?? []) as DailyPrice[];
  const todayMap = mapDaily(typed, today);
  const yesterdayMap = mapDaily(typed, yesterday);
  const showingYesterday = todayMap.size === 0;
  const sourceMap = showingYesterday ? yesterdayMap : todayMap;

  const prices: BoardKaratPrice[] = KARATS.map((karat) => {
    const current = sourceMap.get(karat);
    const prev = showingYesterday
      ? null
      : yesterdayMap.get(karat);
    const price = toNumber(current?.median_price) ?? 0;
    const prevPrice = toNumber(prev?.median_price);
    return {
      karat,
      price,
      deltaPct:
        prevPrice !== null && prevPrice > 0 ? deltaPct(price, prevPrice) : null,
    };
  });

  const { data: submissionMeta } = await supabase
    .from("submissions")
    .select("submitted_at, jeweller_id")
    .eq("flagged_outlier", false)
    .gte("submitted_at", `${showingYesterday ? yesterday : today}T00:00:00+05:30`)
    .lt("submitted_at", `${addDaysColombo(showingYesterday ? yesterday : today, 1)}T00:00:00+05:30`)
    .order("submitted_at", { ascending: false })
    .limit(200);

  const shopIds = new Set(
    (submissionMeta ?? []).map((row: { jeweller_id: string }) => row.jeweller_id),
  );
  const updatedAt =
    (submissionMeta?.[0] as { submitted_at?: string } | undefined)?.submitted_at ??
    null;

  const shopCount =
    shopIds.size ||
    (sourceMap.get("22k")?.submission_count ??
      sourceMap.get("24k")?.submission_count ??
      0);

  return {
    prices,
    updatedAt,
    shopCount,
    showingYesterday,
  };
}

export async function getComparisonRows(): Promise<ComparisonRow[]> {
  const supabase = createServerClient();
  if (!supabase) {
    return getFallbackPageData().comparison;
  }

  const { data, error } = await supabase
    .from("public_jeweller_prices")
    .select("jeweller_id, name, area, price_24k, price_22k, price_18k, updated_at")
    .order("name");

  if (error) {
    throw error;
  }

  return ((data ?? []) as PublicJewellerPriceRow[]).map((row) => ({
    jewellerId: row.jeweller_id,
    name: row.name,
    area: row.area,
    price24k: toNumber(row.price_24k),
    price22k: toNumber(row.price_22k),
    price18k: toNumber(row.price_18k),
    updatedAt: row.updated_at,
  }));
}

export async function getTrend(karat: Karat = "22k", days = 30): Promise<TrendPoint[]> {
  const supabase = createServerClient();
  if (!supabase) {
    return getFallbackTrend(karat);
  }

  const today = colomboDateString();
  const from = addDaysColombo(today, -(days - 1));

  const { data, error } = await supabase
    .from("daily_prices")
    .select("date, median_price")
    .eq("karat", karat)
    .gte("date", from)
    .lte("date", today)
    .order("date", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as { date: string; median_price: number | string }[]).map(
    (row) => ({
      date: row.date,
      median_price: toNumber(row.median_price) ?? 0,
    }),
  );
}

export async function getPageData(): Promise<PageData> {
  if (!hasSupabaseEnv()) {
    return getFallbackPageData();
  }

  try {
    const [board, comparison, trend24, trend22, trend18] = await Promise.all([
      getBoardData(),
      getComparisonRows(),
      getTrend("24k"),
      getTrend("22k"),
      getTrend("18k"),
    ]);

    const areas = Array.from(new Set(comparison.map((r) => r.area))).sort();

    return {
      board,
      comparison,
      areas,
      trends: {
        "24k": trend24,
        "22k": trend22,
        "18k": trend18,
      },
      usingFallback: false,
    };
  } catch {
    return getFallbackPageData();
  }
}
