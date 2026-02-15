"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createAnalysisJob } from "@/lib/api/analysis";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ChainOption, ContractInputMode, useAnalysisDraftStore } from "@/store/analysis";

const MODES: { value: ContractInputMode; label: string }[] = [
  { value: "paste", label: "Paste Code" },
  { value: "upload", label: "Upload File" },
  { value: "address", label: "BscScan Address" }
];

const NETWORKS: { value: ChainOption; label: string }[] = [
  { value: "bsc-mainnet", label: "BSC Mainnet" },
  { value: "bsc-testnet", label: "BSC Testnet" },
  { value: "opbnb-mainnet", label: "opBNB Mainnet" }
];

export function ContractInputCard() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    mode,
    network,
    sourceCode,
    sourceAddress,
    setMode,
    setNetwork,
    setSourceCode,
    setSourceAddress
  } = useAnalysisDraftStore();

  const hasAnalyzableInput = useMemo(() => {
    if (mode === "address") {
      return sourceAddress.trim().length > 0;
    }
    return sourceCode.trim().length > 0;
  }, [mode, sourceAddress, sourceCode]);

  async function onUploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    setSourceCode(text);
    setMode("paste");
  }

  async function onAnalyze() {
    setError(null);

    if (!hasAnalyzableInput) {
      setError("Provide Solidity code or a BscScan contract address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const codeForSubmission = mode === "address" ? `// address: ${sourceAddress}` : sourceCode;
      const response = await createAnalysisJob(codeForSubmission);
      router.push(`/analysis/${response.jobId}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to start analysis.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="hud-grid relative w-full max-w-4xl rounded-2xl border border-line bg-surface/70 p-6 backdrop-blur"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl value={mode} options={MODES} onChange={setMode} />
        <select
          value={network}
          onChange={(event) => setNetwork(event.target.value as ChainOption)}
          className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-text"
        >
          {NETWORKS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {mode !== "address" && (
        <textarea
          value={sourceCode}
          onChange={(event) => setSourceCode(event.target.value)}
          placeholder="Paste Solidity source code here..."
          className="h-72 w-full rounded-xl border border-line bg-surface-2 p-4 font-mono text-sm text-text outline-none focus:border-accent/60"
        />
      )}

      {mode === "upload" && (
        <div className="mt-3">
          <input
            type="file"
            accept=".sol"
            onChange={onUploadFile}
            className="block w-full text-sm text-muted file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-black"
          />
        </div>
      )}

      {mode === "address" && (
        <input
          type="text"
          value={sourceAddress}
          onChange={(event) => setSourceAddress(event.target.value)}
          placeholder="Paste BscScan contract address or URL"
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-text outline-none focus:border-accent/60"
        />
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          This starts an async analysis job and redirects to the HUD progress screen.
        </p>
        <Button onClick={onAnalyze} disabled={isSubmitting}>
          {isSubmitting ? "Starting Analysis..." : "Analyze Gas"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </motion.section>
  );
}
