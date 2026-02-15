"use client";

import { AnalysisResult } from "@/lib/api/analysis";

type Row = {
  name: string;
  originalGas: number;
  optimizedGas: number | null;
  deltaPct: number | null;
};

function toRows(result: AnalysisResult): Row[] {
  const baseline = result.dynamicProfile?.gasProfile?.functions || {};
  const optimized = result.optimizedDynamicProfile?.gasProfile?.functions || {};
  const names = new Set([...Object.keys(baseline), ...Object.keys(optimized)]);

  return [...names]
    .map((name) => {
      const originalGas = Number(baseline[name] || 0);
      const optimizedRaw = optimized[name];
      const optimizedGas = optimizedRaw != null ? Number(optimizedRaw) : null;
      const deltaPct =
        optimizedGas != null && originalGas > 0
          ? ((optimizedGas - originalGas) / originalGas) * 100
          : null;
      return { name, originalGas, optimizedGas, deltaPct };
    })
    .sort((a, b) => b.originalGas - a.originalGas);
}

export function FunctionGasTable({ result }: { result: AnalysisResult }) {
  const rows = toRows(result);
  if (!rows.length) return null;

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold">Function Gas Comparison</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th className="pb-2 pr-3">Function</th>
              <th className="pb-2 pr-3">Original</th>
              <th className="pb-2 pr-3">Optimized</th>
              <th className="pb-2">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-line/70">
                <td className="py-2 pr-3 font-mono">{row.name}()</td>
                <td className="py-2 pr-3">{row.originalGas.toLocaleString()}</td>
                <td className="py-2 pr-3">
                  {row.optimizedGas != null ? row.optimizedGas.toLocaleString() : "—"}
                </td>
                <td
                  className={`py-2 ${
                    row.deltaPct == null
                      ? "text-muted"
                      : row.deltaPct <= 0
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {row.deltaPct == null ? "—" : `${row.deltaPct.toFixed(2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
