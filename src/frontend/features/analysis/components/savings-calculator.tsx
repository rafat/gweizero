"use client";

import { useMemo, useState } from "react";
import { AnalysisResult } from "@/lib/api/analysis";

function avg(
  functions:
    | Record<
        string,
        | {
            status: "measured";
            gasUsed: string;
            stateMutability: string;
          }
        | {
            status: "unmeasured";
            reason: string;
            stateMutability: string;
          }
      >
    | undefined
): number {
  if (!functions) return 0;
  const values = Object.values(functions)
    .filter(
      (entry): entry is { status: "measured"; gasUsed: string; stateMutability: string } =>
        entry.status === "measured" &&
        (entry.stateMutability === "nonpayable" || entry.stateMutability === "payable")
    )
    .map((entry) => Number(entry.gasUsed))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function SavingsCalculator({ result }: { result: AnalysisResult }) {
  const [txPerDay, setTxPerDay] = useState(100);
  const [gasPriceGwei, setGasPriceGwei] = useState(3);
  const [bnbUsd, setBnbUsd] = useState(600);
  const hasOptimizedProfile = !!result.optimizedDynamicProfile?.gasProfile;

  const baselineAvg = avg(result.dynamicProfile?.gasProfile?.functions);
  const optimizedAvg = hasOptimizedProfile ? avg(result.optimizedDynamicProfile?.gasProfile?.functions) : baselineAvg;

  const calc = useMemo(() => {
    const baselineDailyGas = baselineAvg * txPerDay;
    const optimizedDailyGas = optimizedAvg * txPerDay;
    const savedGasPerDay = Math.max(0, baselineDailyGas - optimizedDailyGas);

    const gasPriceInBnb = gasPriceGwei / 1_000_000_000;
    const savedBnbPerDay = savedGasPerDay * gasPriceInBnb;
    const savedUsdPerDay = savedBnbPerDay * bnbUsd;

    return {
      baselineDailyGas,
      optimizedDailyGas,
      savedGasPerDay,
      savedUsdPerDay,
      savedUsdPerMonth: savedUsdPerDay * 30,
      savedUsdPerYear: savedUsdPerDay * 365
    };
  }, [baselineAvg, optimizedAvg, txPerDay, gasPriceGwei, bnbUsd]);

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold">Savings Calculator</p>
      {!hasOptimizedProfile && (
        <p className="mt-1 text-xs text-muted">
          No accepted optimized gas profile is available for this job yet. Savings are not computed.
        </p>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs text-muted">
          Transactions / day
          <input
            type="number"
            min={1}
            value={txPerDay}
            onChange={(e) => setTxPerDay(Number(e.target.value || 0))}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text"
          />
        </label>
        <label className="text-xs text-muted">
          Gas price (Gwei)
          <input
            type="number"
            min={0}
            step="0.1"
            value={gasPriceGwei}
            onChange={(e) => setGasPriceGwei(Number(e.target.value || 0))}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text"
          />
        </label>
        <label className="text-xs text-muted">
          BNB price (USD)
          <input
            type="number"
            min={0}
            step="0.01"
            value={bnbUsd}
            onChange={(e) => setBnbUsd(Number(e.target.value || 0))}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Stat label="Savings / day" value={hasOptimizedProfile ? `$${calc.savedUsdPerDay.toFixed(2)}` : "N/A"} />
        <Stat
          label="Savings / month"
          value={hasOptimizedProfile ? `$${calc.savedUsdPerMonth.toFixed(2)}` : "N/A"}
        />
        <Stat label="Savings / year" value={hasOptimizedProfile ? `$${calc.savedUsdPerYear.toFixed(2)}` : "N/A"} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-surface px-3 py-3">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
