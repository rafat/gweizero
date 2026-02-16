"use client";

import { AnalysisResult } from "@/lib/api/analysis";

type Row = {
  name: string;
  stateMutability: string;
  originalGas: number | null;
  optimizedGas: number | null;
  deltaPct: number | null;
  reason?: string;
};

function parseGasValue(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

function parseFunctionEntry(
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
): { gas: number | null; reason?: string } {
  if (!entry) return { gas: null };
  if (entry.status === "unmeasured") {
    return { gas: null, reason: entry.reason || "Unmeasured" };
  }
  return { gas: parseGasValue(entry.gasUsed) };
}

function toRows(result: AnalysisResult): Row[] {
  const baseline = result.dynamicProfile?.gasProfile?.functions || {};
  const optimized = result.optimizedDynamicProfile?.gasProfile?.functions || {};
  const names = new Set([...Object.keys(baseline), ...Object.keys(optimized)]);

  return [...names]
    .map((name) => {
      const original = parseFunctionEntry(baseline[name]);
      const optimizedEntry = parseFunctionEntry(optimized[name]);
      const stateMutability =
        baseline[name]?.stateMutability || optimized[name]?.stateMutability || "nonpayable";
      const originalGas = original.gas;
      const optimizedGas = optimizedEntry.gas;
      const deltaPct =
        optimizedGas != null && originalGas != null && originalGas > 0
          ? ((optimizedGas - originalGas) / originalGas) * 100
          : null;
      return {
        name,
        stateMutability,
        originalGas,
        optimizedGas,
        deltaPct,
        reason: optimizedEntry.reason || original.reason
      };
    })
    .sort((a, b) => (b.originalGas ?? -1) - (a.originalGas ?? -1));
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
              <th className="pb-2 pr-3">Type</th>
              <th className="pb-2 pr-3">Original</th>
              <th className="pb-2 pr-3">Optimized</th>
              <th className="pb-2">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-line/70">
                <td className="py-2 pr-3 font-mono">{formatFunctionName(row.name)}</td>
                <td className="py-2 pr-3 text-xs uppercase tracking-wide text-muted">{row.stateMutability}</td>
                <td className="py-2 pr-3">{row.originalGas != null ? row.originalGas.toLocaleString() : "—"}</td>
                <td className="py-2 pr-3">{row.optimizedGas != null ? row.optimizedGas.toLocaleString() : "—"}</td>
                <td
                  className={`py-2 ${
                    row.deltaPct == null
                      ? "text-muted"
                      : row.deltaPct <= 0
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {row.deltaPct == null ? row.reason ? "Unmeasured" : "—" : `${row.deltaPct.toFixed(2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatFunctionName(name: string): string {
  return name.includes("(") ? name : `${name}()`;
}
