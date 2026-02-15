"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
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
  const optimizations = result.aiOptimizations?.optimizations || [];
  const editorRef = useRef<{
    getModifiedEditor: () => {
      revealLineInCenter: (line: number) => void;
      setPosition: (pos: { lineNumber: number; column: number }) => void;
      focus: () => void;
      getModel: () => { getLineCount: () => number } | null;
      deltaDecorations: (oldDecorations: string[], newDecorations: unknown[]) => string[];
    };
  } | null>(null);
  const monacoRef = useRef<any>(null);
  const decorationIdsRef = useRef<string[]>([]);

  const markers = useMemo(() => {
    if (!optimized) return [];
    const maxLine = optimized.split("\n").length;
    const grouped = new Map<number, typeof optimizations>();

    for (const item of optimizations) {
      const rawLine = Number(item.line || 0);
      if (!Number.isFinite(rawLine) || rawLine < 1) continue;
      const line = Math.min(maxLine, Math.floor(rawLine));
      const existing = grouped.get(line);
      if (existing) {
        existing.push(item);
      } else {
        grouped.set(line, [item]);
      }
    }

    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([line, items]) => ({ line, items }));
  }, [optimized, optimizations]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const modified = editorRef.current.getModifiedEditor();
    const model = modified.getModel();
    if (!model) return;

    const maxLine = model.getLineCount();
    const nextDecorations = markers.map((marker) => {
      const line = Math.min(maxLine, marker.line);
      const hoverBody = marker.items
        .map(
          (item) =>
            `**${item.type.replaceAll("_", " ")}**\n${item.description}\nEstimated: ${item.estimatedSaving || "N/A"}`
        )
        .join("\n\n---\n\n");

      return {
        range: new monacoRef.current.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: line === focusLine ? "gweizero-opt-line gweizero-opt-line-active" : "gweizero-opt-line",
          linesDecorationsClassName:
            line === focusLine ? "gweizero-opt-glyph gweizero-opt-glyph-active" : "gweizero-opt-glyph",
          overviewRuler: {
            color: line === focusLine ? "rgba(240, 185, 11, 0.95)" : "rgba(240, 185, 11, 0.5)",
            position: monacoRef.current.editor.OverviewRulerLane.Right
          },
          hoverMessage: { value: hoverBody }
        }
      };
    });

    decorationIdsRef.current = modified.deltaDecorations(decorationIdsRef.current, nextDecorations);
  }, [focusLine, focusNonce, markers]);

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
      <p className="mt-1 text-xs text-muted">
        Optimization markers: {markers.length}. Hover highlighted lines for AI explanation.
      </p>
      <div className="mt-3 h-[480px] overflow-hidden rounded-lg border border-line/70">
        <MonacoDiffEditor
          height="100%"
          language="sol"
          original={original}
          modified={optimized}
          onMount={(editor: any, monaco: any) => {
            editorRef.current = editor;
            monacoRef.current = monaco;
          }}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            glyphMargin: true,
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
