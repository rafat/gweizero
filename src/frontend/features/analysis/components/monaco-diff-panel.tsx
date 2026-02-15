"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { AnalysisResult } from "@/lib/api/analysis";

const MonacoDiffEditor = dynamic(async () => (await import("@monaco-editor/react")).DiffEditor, {
  ssr: false
});

export function MonacoDiffPanel({
  originalCode,
  result,
  focusLine,
  focusNonce
}: {
  originalCode?: string;
  result: AnalysisResult;
  focusLine?: number | null;
  focusNonce?: number;
}) {
  const optimized = result.aiOptimizations?.optimizedContract || "";
  const original = originalCode || "";
  const editorRef = useRef<{
    getModifiedEditor: () => {
      revealLineInCenter: (line: number) => void;
      setPosition: (pos: { lineNumber: number; column: number }) => void;
      focus: () => void;
    };
  } | null>(null);

  useEffect(() => {
    if (!focusLine || focusLine < 1 || !editorRef.current) return;
    const modified = editorRef.current.getModifiedEditor();
    modified.revealLineInCenter(focusLine);
    modified.setPosition({ lineNumber: focusLine, column: 1 });
    modified.focus();
  }, [focusLine, focusNonce]);

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
          onMount={(editor: any) => {
            editorRef.current = editor;
          }}
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
