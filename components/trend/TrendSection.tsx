"use client";

import { useState } from "react";
import { TrendSparkline } from "@/components/trend/TrendSparkline";
import type { Karat, TrendPoint } from "@/lib/types";

export function TrendSection({
  trends,
}: {
  trends: Record<Karat, TrendPoint[]>;
}) {
  const [karat, setKarat] = useState<Karat>("22k");

  return (
    <TrendSparkline
      data={trends[karat]}
      karat={karat}
      onKaratChange={setKarat}
    />
  );
}
