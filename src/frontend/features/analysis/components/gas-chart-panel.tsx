"use client";

import { AnalysisResult } from "@/lib/api/analysis";

type FunctionPoint = {
  name: string;
  original: number;
  optimized: number | null;
};

function toChartData(result: AnalysisResult): FunctionPoint[] {
  const baseline = result.dynamicProfile?.gasProfile?.functions || {};
  const optimized = result.optimizedDynamicProfile?.gasProfile?.functions || {};
  const names = new Set([...Object.keys(baseline), ...Object.keys(optimized)]);

  return [...names]
    .map((name) => ({
      name,
      original: Number(baseline[name] || 0),
      optimized: optimized[name] != null ? Number(optimized[name]) : null
    }))
    .filter((x) => x.original > 0)
    .sort((a, b) => b.original - a.original)
    .slice(0, 8);
}

export function GasChartPanel({ result }: { result: AnalysisResult }) {
  const data = toChartData(result);
  if (!data.length) return null;
  const maxGas = Math.max(...data.map((d) => Math.max(d.original, d.optimized || 0)), 1);

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold">Function Gas Bars (Top 8)</p>
      <p className="mt-1 text-xs text-muted">Red = original, Binance yellow = optimized</p>

      <div className="mt-4 space-y-3">
        {data.map((row) => (
          <div key={row.name}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-mono text-text">{row.name}()</span>
              <span className="text-muted">
                {row.original.toLocaleString()} →{" "}
                {row.optimized != null ? row.optimized.toLocaleString() : "—"}
              </span>
            </div>
            <div className="relative h-4 rounded-md bg-surface">
              <div
                className="absolute inset-y-0 left-0 rounded-md bg-danger/55"
                style={{ width: `${(row.original / maxGas) * 100}%` }}
              />
              {row.optimized != null && (
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-accent/85"
                  style={{ width: `${(row.optimized / maxGas) * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
