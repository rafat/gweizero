"use client";

import { AnalysisResult } from "@/lib/api/analysis";

function toNumber(value: string | undefined): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function avgGas(functions: Record<string, string> | undefined): number {
  if (!functions) return 0;
  const values = Object.values(functions).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function ResultsBento({ result }: { result: AnalysisResult }) {
  const contractName = result.staticProfile?.contractName || result.dynamicProfile?.contractName || "Contract";
  const baselineDeployment = toNumber(result.dynamicProfile?.gasProfile?.deploymentGas);
  const optimizedDeployment = toNumber(result.optimizedDynamicProfile?.gasProfile?.deploymentGas);
  const baselineAvgFn = avgGas(result.dynamicProfile?.gasProfile?.functions);
  const optimizedAvgFn = avgGas(result.optimizedDynamicProfile?.gasProfile?.functions);
  const savingsPct =
    baselineAvgFn > 0 ? ((baselineAvgFn - optimizedAvgFn) / baselineAvgFn) * 100 : 0;

  return (
    <section className="mt-6 grid gap-4 md:grid-cols-4">
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Contract</p>
        <p className="mt-2 text-lg font-semibold">{contractName}</p>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Deployment Gas</p>
        <p className="mt-2 text-lg font-semibold">{baselineDeployment.toLocaleString()}</p>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Optimized Deployment</p>
        <p className="mt-2 text-lg font-semibold">{optimizedDeployment.toLocaleString()}</p>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Avg Function Savings</p>
        <p className="mt-2 text-lg font-semibold">
          {savingsPct >= 0 ? `${savingsPct.toFixed(2)}%` : "N/A"}
        </p>
      </div>
    </section>
  );
}
