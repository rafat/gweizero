"use client";

import { AnalysisResult } from "@/lib/api/analysis";
import { Button } from "@/components/ui/button";

type Props = {
  result: AnalysisResult;
  onJumpToLine: (line: number) => void;
};

export function OptimizationCards({ result, onJumpToLine }: Props) {
  const optimizations = result.aiOptimizations?.optimizations || [];
  if (!optimizations.length) return null;

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold">Optimization Insights</p>
      <p className="mt-1 text-xs text-muted">Click a card to focus the matching line in the Monaco diff.</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {optimizations.map((item, index) => {
          const line = Number(item.line || 0);
          return (
            <div
              key={`${item.type}-${index}-${line}`}
              role={line > 0 ? "button" : undefined}
              tabIndex={line > 0 ? 0 : -1}
              onClick={() => line > 0 && onJumpToLine(line)}
              onKeyDown={(event) => {
                if (line <= 0) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onJumpToLine(line);
                }
              }}
              className="rounded-lg border border-line/70 bg-surface p-3 text-left transition hover:border-accent/60 hover:bg-surface/80"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs uppercase tracking-wider text-accent">{item.type.replaceAll("_", " ")}</p>
                <span className="text-xs text-muted">{line > 0 ? `Line ${line}` : "Line n/a"}</span>
              </div>

              <p className="mt-2 text-sm text-text">{item.description}</p>
              <p className="mt-2 text-xs text-success">Estimated saving: {item.estimatedSaving || "N/A"}</p>

              {line > 0 && (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      onJumpToLine(line);
                    }}
                  >
                    Jump to line {line}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
