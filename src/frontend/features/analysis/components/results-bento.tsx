"use client";

import { AnalysisResult } from "@/lib/api/analysis";

function toNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function avgGas(
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

export function ResultsBento({ result }: { result: AnalysisResult }) {
  const hasOptimizedProfile = !!result.optimizedDynamicProfile?.gasProfile;
  const contractName = result.staticProfile?.contractName || result.dynamicProfile?.contractName || "Contract";
  const baselineDeployment = toNumber(result.dynamicProfile?.gasProfile?.deploymentGas);
  const optimizedDeployment = toNumber(result.optimizedDynamicProfile?.gasProfile?.deploymentGas);
  const baselineAvgFn = avgGas(result.dynamicProfile?.gasProfile?.functions);
  const optimizedAvgFn = hasOptimizedProfile ? avgGas(result.optimizedDynamicProfile?.gasProfile?.functions) : 0;
  const savingsPct =
    hasOptimizedProfile && baselineAvgFn > 0 ? ((baselineAvgFn - optimizedAvgFn) / baselineAvgFn) * 100 : null;

  return (
    <section className="mt-6 grid gap-4 md:grid-cols-4">
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Contract</p>
        <p className="mt-2 text-lg font-semibold">{contractName}</p>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Deployment Gas (Secondary)</p>
        <p className="mt-2 text-lg font-semibold">{baselineDeployment != null ? baselineDeployment.toLocaleString() : "—"}</p>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Optimized Deployment (Secondary)</p>
        <p className="mt-2 text-lg font-semibold">
          {hasOptimizedProfile && optimizedDeployment != null ? optimizedDeployment.toLocaleString() : "N/A"}
        </p>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Avg Mutable Function Savings</p>
        <p className="mt-2 text-lg font-semibold">
          {savingsPct != null ? `${savingsPct.toFixed(2)}%` : "N/A"}
        </p>
      </div>
    </section>
  );
}
