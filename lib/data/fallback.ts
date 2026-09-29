import { addDaysColombo, colomboDateString, deltaPct } from "@/lib/format";
import type {
  BoardData,
  ComparisonRow,
  Karat,
  PageData,
  TrendPoint,
} from "@/lib/types";

const AREAS = [
  "Colombo 1",
  "Colombo 3",
  "Nawala",
  "Kandy",
  "Borella",
  "Dehiwala",
  "Nugegoda",
  "Wellawatte",
  "Rajagiriya",
];

const SHOPS: { name: string; area: string; offset24: number; offset22: number; offset18: number; hoursAgo: number }[] = [
  { name: "Seneviratne Jewellers", area: "Colombo 3", offset24: -100, offset22: -90, offset18: -80, hoursAgo: 0.5 },
  { name: "Peoples Gold House", area: "Colombo 3", offset24: -50, offset22: -45, offset18: -40, hoursAgo: 0.8 },
  { name: "Nawala Gold Centre", area: "Nawala", offset24: 0, offset22: 0, offset18: 0, hoursAgo: 1.2 },
  { name: "Kandy Road Jewels", area: "Kandy", offset24: 50, offset22: 45, offset18: 40, hoursAgo: 9 },
  { name: "Galle Face Gold", area: "Colombo 1", offset24: 100, offset22: 90, offset18: 80, hoursAgo: 1.5 },
  { name: "Borella Bullion", area: "Borella", offset24: 150, offset22: 135, offset18: 120, hoursAgo: 2 },
  { name: "Dehiwala Fine Gold", area: "Dehiwala", offset24: -150, offset22: -135, offset18: -120, hoursAgo: 0.3 },
  { name: "Nugegoda Rates", area: "Nugegoda", offset24: 200, offset22: 180, offset18: 160, hoursAgo: 2.5 },
  { name: "Wellawatte Gold Mart", area: "Wellawatte", offset24: -200, offset22: -180, offset18: -160, hoursAgo: 3 },
  { name: "Rajagiriya Jewel Box", area: "Rajagiriya", offset24: 75, offset22: 70, offset18: 60, hoursAgo: 4 },
];

const TODAY_MEDIAN: Record<Karat, number> = {
  "24k": 46500,
  "22k": 42600,
  "18k": 34900,
};

const YESTERDAY_MEDIAN: Record<Karat, number> = {
  "24k": 46300,
  "22k": 42450,
  "18k": 34780,
};

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function getFallbackBoard(): BoardData {
  const karats: Karat[] = ["24k", "22k", "18k"];
  return {
    prices: karats.map((karat) => ({
      karat,
      price: TODAY_MEDIAN[karat],
      deltaPct: deltaPct(TODAY_MEDIAN[karat], YESTERDAY_MEDIAN[karat]),
    })),
    updatedAt: hoursAgoIso(0.5),
    shopCount: SHOPS.length,
    showingYesterday: false,
  };
}

export function getFallbackComparison(): ComparisonRow[] {
  return SHOPS.map((shop, i) => ({
    jewellerId: `fallback-${i}`,
    name: shop.name,
    area: shop.area,
    price24k: TODAY_MEDIAN["24k"] + shop.offset24,
    price22k: TODAY_MEDIAN["22k"] + shop.offset22,
    price18k: TODAY_MEDIAN["18k"] + shop.offset18,
    updatedAt: hoursAgoIso(shop.hoursAgo),
  }));
}

export function getFallbackTrend(karat: Karat = "22k", days = 30): TrendPoint[] {
  const today = colomboDateString();
  const base = TODAY_MEDIAN[karat];
  const points: TrendPoint[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = addDaysColombo(today, -d);
    points.push({
      date,
      median_price: Math.round(base - d * 16 + ((d % 5) * 35)),
    });
  }
  return points;
}

export function getFallbackPageData(): PageData {
  return {
    board: getFallbackBoard(),
    comparison: getFallbackComparison(),
    areas: AREAS,
    trends: {
      "24k": getFallbackTrend("24k"),
      "22k": getFallbackTrend("22k"),
      "18k": getFallbackTrend("18k"),
    },
    usingFallback: true,
  };
}
