"use client";

import dynamic from "next/dynamic";
import { AnalysisResult } from "@/lib/api/analysis";

const MonacoDiffEditor = dynamic(async () => (await import("@monaco-editor/react")).DiffEditor, {
  ssr: false
});

export function MonacoDiffPanel({ originalCode, result }: { originalCode?: string; result: AnalysisResult }) {
  const optimized = result.aiOptimizations?.optimizedContract || "";
  const original = originalCode || "";

  if (!optimized || !original) {
    return (
      <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-sm font-semibold">Code Diff</p>
        <p className="mt-2 text-sm text-muted">Diff will appear when original and optimized source are available.</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold">Monaco Code Diff</p>
      <div className="mt-3 h-[480px] overflow-hidden rounded-lg border border-line/70">
        <MonacoDiffEditor
          height="100%"
          language="sol"
          original={original}
          modified={optimized}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            fontSize: 12,
            wordWrap: "on",
            scrollBeyondLastLine: false
          }}
          theme="vs-dark"
        />
      </div>
    </section>
  );
}
