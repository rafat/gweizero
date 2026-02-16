"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnalysisResult } from "@/lib/api/analysis";
import { Button } from "@/components/ui/button";

const MonacoDiffEditor = dynamic(async () => (await import("@monaco-editor/react")).DiffEditor, {
  ssr: false
});
const MonacoEditor = dynamic(async () => (await import("@monaco-editor/react")).Editor, {
  ssr: false
});

export function MonacoDiffPanel({
  jobId,
  originalCode,
  result,
  focusLine,
  focusNonce
}: {
  jobId: string;
  originalCode?: string;
  result: AnalysisResult;
  focusLine?: number | null;
  focusNonce?: number;
}) {
  const rawOptimized = normalizeSoliditySource(result.aiOptimizations?.optimizedContract || "");
  const original = normalizeSoliditySource(originalCode || "");
  const optimized = looksLikeSoliditySource(rawOptimized) ? rawOptimized : original;
  const optimizations = result.aiOptimizations?.optimizations || [];
  const [tab, setTab] = useState<"diff" | "optimized" | "original">("diff");
  const [accepted, setAccepted] = useState(false);
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
  const ACCEPT_KEY = `gweizero_accepted_${jobId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = window.sessionStorage.getItem(ACCEPT_KEY);
    setAccepted(persisted === "1");
  }, [ACCEPT_KEY]);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Code Review</p>
          <p className="mt-1 text-xs text-muted">
            Optimization markers: {markers.length}. Hover highlighted lines for AI explanation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("diff")}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              tab === "diff" ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-text"
            }`}
          >
            Diff
          </button>
          <button
            type="button"
            onClick={() => setTab("optimized")}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              tab === "optimized"
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:text-text"
            }`}
          >
            Optimized Code
          </button>
          <button
            type="button"
            onClick={() => setTab("original")}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              tab === "original"
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:text-text"
            }`}
          >
            Original Code
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setAccepted(true);
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem(ACCEPT_KEY, "1");
            }
          }}
          variant={accepted ? "secondary" : "primary"}
        >
          {accepted ? "Changes Accepted" : "Accept Changes"}
        </Button>
        <Button
          variant="secondary"
          disabled={!accepted}
          onClick={() => downloadOptimizedCode(optimized)}
        >
          Download Optimized .sol
        </Button>
        <span className="text-xs text-muted">
          {accepted ? "Accepted for export." : "Accept changes to enable download."}
        </span>
      </div>

      <div className="mt-3 h-[520px] overflow-hidden rounded-lg border border-line/70">
        {tab === "diff" && (
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
        )}
        {tab === "optimized" && (
          <MonacoEditor
            height="100%"
            language="sol"
            value={optimized}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: "on",
              scrollBeyondLastLine: false
            }}
            theme="vs-dark"
          />
        )}
        {tab === "original" && (
          <MonacoEditor
            height="100%"
            language="sol"
            value={original}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: "on",
              scrollBeyondLastLine: false
            }}
            theme="vs-dark"
          />
        )}
      </div>
    </section>
  );
}

function normalizeSoliditySource(input: string): string {
  if (!input) return "";
  let output = input.trim();

  // Remove fenced block wrappers if model returned markdown.
  output = output.replace(/^```(?:solidity|sol)?\s*/i, "");
  output = output.replace(/```$/, "");

  // Convert escaped newlines to real newlines if content is serialized.
  if (!output.includes("\n") && output.includes("\\n")) {
    output = output.replace(/\\n/g, "\n").replace(/\\"/g, "\"");
  }

  // If source looks heavily corrupted, fallback guard will be handled by caller.
  return output.trim();
}

function looksLikeSoliditySource(input: string): boolean {
  if (!input) return false;
  const lowered = input.toLowerCase();
  return lowered.includes("pragma solidity") || lowered.includes("contract ");
}

function downloadOptimizedCode(code: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const name = inferContractName(code) || "OptimizedContract";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.optimized.sol`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function inferContractName(code: string): string | null {
  const match = code.match(/\bcontract\s+([A-Za-z_][A-Za-z0-9_]*)/);
  return match?.[1] || null;
}
