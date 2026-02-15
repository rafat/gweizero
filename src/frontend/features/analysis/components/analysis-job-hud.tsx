"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { Button } from "@/components/ui/button";
import { FunctionGasTable } from "@/features/analysis/components/function-gas-table";
import { GasChartPanel } from "@/features/analysis/components/gas-chart-panel";
import { MonacoDiffPanel } from "@/features/analysis/components/monaco-diff-panel";
import { OptimizationCards } from "@/features/analysis/components/optimization-cards";
import { ProofActions } from "@/features/analysis/components/proof-actions";
import { ResultsBento } from "@/features/analysis/components/results-bento";
import { SavingsCalculator } from "@/features/analysis/components/savings-calculator";
import { playAnalysisCompleteCue } from "@/lib/sound/ui-sound";
import { useCinematicStore } from "@/store/cinematic";
import {
  AnalysisJobResponse,
  AnalysisPhaseStatus,
  AnalysisProgressEvent,
  analysisEventsUrl,
  cancelAnalysisJob,
  getAnalysisJob,
  isTerminalStatus
} from "@/lib/api/analysis";

const PHASES: { key: AnalysisPhaseStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "static_analysis", label: "Static Analysis" },
  { key: "dynamic_analysis", label: "Dynamic Analysis" },
  { key: "ai_optimization", label: "AI Optimization" },
  { key: "completed", label: "Complete" }
];

function phaseClass(active: boolean, done: boolean, failed: boolean) {
  if (failed) return "border-danger/80 text-danger";
  if (active) return "border-accent text-accent shadow-glow";
  if (done) return "border-success text-success";
  return "border-line text-muted";
}

type Props = {
  jobId: string;
};

export function AnalysisJobHud({ jobId }: Props) {
  const [job, setJob] = useState<AnalysisJobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState<"sse" | "polling" | "initializing">("initializing");
  const [localEvents, setLocalEvents] = useState<AnalysisProgressEvent[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const setGlowIntensity = useCinematicStore((s) => s.setGlowIntensity);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseGridRef = useRef<HTMLDivElement | null>(null);
  const previousStatusRef = useRef<AnalysisPhaseStatus | null>(null);

  const status = job?.status ?? "queued";
  const isTerminal = isTerminalStatus(status);
  const events = useMemo(() => {
    const base = job?.events ?? [];
    if (!localEvents.length) return base;
    const merged = [...base, ...localEvents];
    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  }, [job?.events, localEvents]);

  const fetchJob = useCallback(async () => {
    try {
      const data = await getAnalysisJob(jobId);
      setJob(data);
      return data;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch job.";
      setError(message);
      return null;
    }
  }, [jobId]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    setStreamMode("polling");
    pollTimerRef.current = setInterval(async () => {
      const latest = await fetchJob();
      if (latest && isTerminalStatus(latest.status)) {
        stopPolling();
      }
    }, 2500);
  }, [fetchJob, stopPolling]);

  const stopSse = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const initial = await fetchJob();
      if (!mounted) return;

      if (initial && isTerminalStatus(initial.status)) {
        setStreamMode("polling");
        return;
      }

      const source = new EventSource(analysisEventsUrl(jobId));
      eventSourceRef.current = source;
      setStreamMode("sse");

      source.addEventListener("progress", (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data) as AnalysisProgressEvent;
          setLocalEvents((prev) => [...prev, parsed]);
        } catch {
          // ignore malformed progress events
        }
      });

      source.addEventListener("done", async () => {
        await fetchJob();
        stopSse();
      });

      source.onerror = async () => {
        stopSse();
        const latest = await fetchJob();
        if (!latest || !isTerminalStatus(latest.status)) {
          startPolling();
        }
      };
    })();

    return () => {
      mounted = false;
      stopSse();
      stopPolling();
    };
  }, [fetchJob, jobId, startPolling, stopPolling, stopSse]);

  useEffect(() => {
    if (!phaseGridRef.current) return;
    const cards = phaseGridRef.current.querySelectorAll("[data-phase-card='true']");
    gsap.fromTo(
      cards,
      { y: 6, opacity: 0.75 },
      {
        y: 0,
        opacity: 1,
        duration: 0.35,
        ease: "power2.out",
        stagger: 0.04
      }
    );
  }, [status]);

  useEffect(() => {
    const prev = previousStatusRef.current;
    if (status === "completed" && prev !== "completed") {
      playAnalysisCompleteCue();
    }
    previousStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!job?.result || status !== "completed") {
      setGlowIntensity(0.2);
      return;
    }

    const baselineFns = job.result.dynamicProfile?.gasProfile?.functions || {};
    const optimizedFns = job.result.optimizedDynamicProfile?.gasProfile?.functions || {};

    const avg = (values: Record<string, string>) => {
      const nums = Object.values(values).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
      if (!nums.length) return 0;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    };

    const before = avg(baselineFns);
    const after = avg(optimizedFns);
    const savingsPct = before > 0 ? ((before - after) / before) * 100 : 0;

    // Map 0-25% savings range to cinematic glow range.
    const normalized = Math.max(0, Math.min(1, savingsPct / 25));
    setGlowIntensity(0.2 + normalized * 0.8);
  }, [job?.result, setGlowIntensity, status]);

  async function onCancel() {
    setIsCancelling(true);
    setError(null);
    try {
      const updated = await cancelAnalysisJob(jobId);
      setJob(updated);
      if (isTerminalStatus(updated.status)) {
        stopSse();
        stopPolling();
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to cancel job.";
      setError(message);
    } finally {
      setIsCancelling(false);
    }
  }

  function jumpToDiffLine(line: number) {
    if (!Number.isFinite(line) || line < 1) return;
    setFocusedLine(Math.floor(line));
    setFocusNonce((v) => v + 1);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <section className="rounded-2xl border border-line bg-surface/70 p-6 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Analysis Job</p>
            <h1 className="mt-1 text-2xl font-semibold">{jobId}</h1>
            <p className="mt-2 text-sm text-muted">
              Stream mode: <span className="text-text">{streamMode}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs uppercase tracking-wider text-muted">
              {status.replaceAll("_", " ")}
            </span>
            {!isTerminal && (
              <Button variant="secondary" onClick={onCancel} disabled={isCancelling}>
                {isCancelling ? "Cancelling..." : "Cancel"}
              </Button>
            )}
          </div>
        </div>

        <div ref={phaseGridRef} className="mt-6 grid gap-3 md:grid-cols-5">
          {PHASES.map((phase, index) => {
            const phaseIndex = PHASES.findIndex((p) => p.key === status);
            const done = phaseIndex > index || status === "completed";
            const active = phase.key === status;
            const failed = (status === "failed" || status === "cancelled") && active;
            return (
              <div
                key={phase.key}
                data-phase-card="true"
                className={`rounded-xl border px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider ${phaseClass(
                  active,
                  done,
                  failed
                )}`}
              >
                {phase.label}
              </div>
            );
          })}
        </div>

        {job?.result?.optimizationValidation && (
          <div className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
            <p className="text-sm font-semibold">Acceptance Validation</p>
            <p className="mt-2 text-sm text-muted">
              Accepted:{" "}
              <span className={job.result.optimizationValidation.accepted ? "text-success" : "text-danger"}>
                {job.result.optimizationValidation.accepted ? "Yes" : "No"}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">{job.result.optimizationValidation.reason}</p>
            {typeof job.result.optimizationAttempts === "number" && (
              <p className="mt-1 text-sm text-muted">Attempts: {job.result.optimizationAttempts}</p>
            )}
          </div>
        )}

        {job?.status === "completed" && job.result && (
          <>
            <ResultsBento result={job.result} />
            <GasChartPanel result={job.result} />
            <FunctionGasTable result={job.result} />
            <SavingsCalculator result={job.result} />
            <OptimizationCards result={job.result} onJumpToLine={jumpToDiffLine} />
            <MonacoDiffPanel
              originalCode={job.result.originalContract}
              result={job.result}
              focusLine={focusedLine}
              focusNonce={focusNonce}
            />
            {job.result.optimizationValidation?.accepted && (
              <ProofActions jobId={jobId} defaultContractName={job.result.staticProfile?.contractName} />
            )}
          </>
        )}

        <div className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
          <p className="text-sm font-semibold">Live Event Stream</p>
          <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-2">
            {events.length === 0 && <p className="text-sm text-muted">Waiting for events...</p>}
            {events.map((event, idx) => (
              <div key={`${event.timestamp}-${idx}`} className="rounded-lg border border-line/70 px-3 py-2">
                <p className="text-xs uppercase tracking-wider text-muted">{event.phase.replaceAll("_", " ")}</p>
                <p className="mt-1 text-sm text-text">{event.message}</p>
              </div>
            ))}
          </div>
        </div>

        {job?.error && <p className="mt-4 text-sm text-danger">{job.error}</p>}
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      </section>
    </main>
  );
}
