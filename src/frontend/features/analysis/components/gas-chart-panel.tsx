"use client";

import { AnalysisResult } from "@/lib/api/analysis";

type FunctionPoint = {
  name: string;
  original: number | null;
  optimized: number | null;
};

function parseGasValue(value: string | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

function parseFunctionGas(
  entry:
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
    | undefined
): number | null {
  if (!entry || entry.status !== "measured") {
    return null;
  }
  return parseGasValue(entry.gasUsed);
}

function toChartData(result: AnalysisResult): FunctionPoint[] {
  const baseline = result.dynamicProfile?.gasProfile?.functions || {};
  const optimized = result.optimizedDynamicProfile?.gasProfile?.functions || {};
  const names = new Set([...Object.keys(baseline), ...Object.keys(optimized)]);

  return [...names]
    .map((name) => ({
      name,
      original: parseFunctionGas(baseline[name]),
      optimized: parseFunctionGas(optimized[name])
    }))
    .filter((x) => x.original != null && x.original > 0)
    .sort((a, b) => (b.original ?? 0) - (a.original ?? 0))
    .slice(0, 8);
}

export function GasChartPanel({ result }: { result: AnalysisResult }) {
  const data = toChartData(result);
  if (!data.length) return null;
  const maxGas = Math.max(...data.map((d) => Math.max(d.original ?? 0, d.optimized ?? 0)), 1);

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold">Function Gas Bars (Top 8)</p>
      <p className="mt-1 text-xs text-muted">Red = original, Binance yellow = optimized</p>

      <div className="mt-4 space-y-3">
        {data.map((row) => (
          <div key={row.name}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-mono text-text">{formatFunctionName(row.name)}</span>
              <span className="text-muted">
                {row.original != null ? row.original.toLocaleString() : "—"} →{" "}
                {row.optimized != null ? row.optimized.toLocaleString() : "—"}
              </span>
            </div>
            <div className="relative h-4 rounded-md bg-surface">
              <div
                className="absolute inset-y-0 left-0 rounded-md bg-danger/55"
                style={{ width: `${((row.original ?? 0) / maxGas) * 100}%` }}
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

function formatFunctionName(name: string): string {
  return name.includes("(") ? name : `${name}()`;
}
