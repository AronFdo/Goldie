import { TheBoard } from "@/components/board/TheBoard";
import { KaratCalculator } from "@/components/calculator/KaratCalculator";
import { ComparisonSection } from "@/components/comparison/ComparisonSection";
import { DemoBanner } from "@/components/DemoBanner";
import { TrendSection } from "@/components/trend/TrendSection";
import { getPageData } from "@/lib/data/prices";
import type { Karat } from "@/lib/types";

export const revalidate = 300;

export default async function HomePage() {
  const data = await getPageData();

  const medians = data.board.prices.reduce(
    (acc, row) => {
      acc[row.karat] = row.price;
      return acc;
    },
    { "24k": 0, "22k": 0, "18k": 0 } as Record<Karat, number>,
  );

  return (
    <>
      {data.usingFallback && <DemoBanner />}
      <header className="sr-only">
        <h1>Goldie — today&apos;s gold price in Sri Lanka</h1>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <TheBoard data={data.board} />

        <div className="mt-8 rounded-none bg-parchment px-4 py-6 text-ink sm:px-6 sm:py-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
            <ComparisonSection rows={data.comparison} areas={data.areas} />
            <KaratCalculator medians={medians} />
          </div>

          <div className="mt-10 border-t border-brass-line/40 pt-8">
            <TrendSection trends={data.trends} />
          </div>
        </div>
      </main>
      <footer className="border-t border-brass-line/30 px-4 py-6 text-center text-xs text-parchment/50">
        Prices in LKR per gram · Times in Asia/Colombo · Medians across
        submitting shops
      </footer>
    </>
  );
}
