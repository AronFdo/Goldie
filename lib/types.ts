export type Karat = "24k" | "22k" | "18k";

export type JewellerStatus = "pending" | "approved" | "suspended";

export interface Jeweller {
  id: string;
  name: string;
  phone_number: string;
  area: string;
  status: JewellerStatus;
  created_at: string;
}

export interface Submission {
  id: string;
  jeweller_id: string;
  karat: Karat;
  price_per_gram: number;
  submitted_at: string;
  flagged_outlier: boolean;
}

export interface DailyPrice {
  date: string;
  karat: Karat;
  median_price: number;
  submission_count: number;
}

export interface BoardKaratPrice {
  karat: Karat;
  price: number;
  deltaPct: number | null;
}

export interface BoardData {
  prices: BoardKaratPrice[];
  updatedAt: string | null;
  shopCount: number;
  showingYesterday: boolean;
}

export interface ComparisonRow {
  jewellerId: string;
  name: string;
  area: string;
  price24k: number | null;
  price22k: number | null;
  price18k: number | null;
  updatedAt: string | null;
}

export interface TrendPoint {
  date: string;
  median_price: number;
}

export interface PageData {
  board: BoardData;
  comparison: ComparisonRow[];
  areas: string[];
  trends: Record<Karat, TrendPoint[]>;
  usingFallback: boolean;
}
