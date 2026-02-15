"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MintProofResponse, ProofPayloadResponse, getProofPayload, mintProof } from "@/lib/api/analysis";

type Props = {
  jobId: string;
  defaultContractName?: string;
};

export function ProofActions({ jobId, defaultContractName }: Props) {
  const [contractAddress, setContractAddress] = useState("");
  const [contractName, setContractName] = useState(defaultContractName || "");
  const [payload, setPayload] = useState<ProofPayloadResponse | null>(null);
  const [mintReceipt, setMintReceipt] = useState<MintProofResponse | null>(null);
  const [payloadState, setPayloadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mintState, setMintState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const requestBody = useMemo(
    () => ({
      contractAddress: contractAddress.trim() || undefined,
      contractName: contractName.trim() || undefined
    }),
    [contractAddress, contractName]
  );

  async function onGeneratePayload() {
    setError(null);
    setPayloadState("loading");
    setMintReceipt(null);
    try {
      const nextPayload = await getProofPayload(jobId, requestBody);
      setPayload(nextPayload);
      setPayloadState("success");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to generate payload.";
      setError(message);
      setPayloadState("error");
    }
  }

  async function onMintProof() {
    setError(null);
    setMintState("loading");
    try {
      const receipt = await mintProof(jobId, requestBody);
      setMintReceipt(receipt);
      setPayload(receipt.payload);
      setMintState("success");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to mint proof.";
      setError(message);
      setMintState("error");
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold">On-Chain Proof</p>
      <p className="mt-1 text-xs text-muted">
        Generate a mint payload from this validated job, then submit mint transaction via backend relayer.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-muted">
          Contract Address (optional)
          <input
            type="text"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            placeholder="0x..."
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text"
          />
        </label>
        <label className="text-xs text-muted">
          Contract Name (optional)
          <input
            type="text"
            value={contractName}
            onChange={(e) => setContractName(e.target.value)}
            placeholder="MyContract"
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onGeneratePayload} disabled={payloadState === "loading"}>
          {payloadState === "loading" ? "Generating..." : "Generate Payload"}
        </Button>
        <Button onClick={onMintProof} disabled={mintState === "loading"}>
          {mintState === "loading" ? "Minting..." : "Mint Proof"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <StatusPill label={`Payload: ${payloadState}`} state={payloadState} />
        <StatusPill label={`Mint: ${mintState}`} state={mintState} />
      </div>

      {payload && (
        <div className="mt-4 rounded-lg border border-line/70 bg-surface p-3">
          <p className="text-xs uppercase tracking-wider text-muted">Payload</p>
          <pre className="mt-2 overflow-auto text-xs text-text">{JSON.stringify(payload, null, 2)}</pre>
        </div>
      )}

      {mintReceipt && (
        <div className="mt-4 rounded-lg border border-success/40 bg-surface p-3">
          <p className="text-xs uppercase tracking-wider text-success">Transaction Result</p>
          <p className="mt-2 text-sm">
            Tx Hash: <span className="font-mono text-xs">{mintReceipt.receipt.txHash}</span>
          </p>
          {explorerTxUrl(mintReceipt.receipt.chainId, mintReceipt.receipt.txHash) && (
            <a
              href={explorerTxUrl(mintReceipt.receipt.chainId, mintReceipt.receipt.txHash)!}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-accent underline"
            >
              View transaction on explorer
            </a>
          )}
          <p className="mt-1 text-sm">Chain ID: {mintReceipt.receipt.chainId}</p>
          <p className="mt-1 text-sm">
            Token ID: {mintReceipt.receipt.tokenId ? mintReceipt.receipt.tokenId : "Pending/Not emitted"}
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}

function explorerTxUrl(chainId: number, txHash: string): string | null {
  if (chainId === 56) return `https://bscscan.com/tx/${txHash}`;
  if (chainId === 97) return `https://testnet.bscscan.com/tx/${txHash}`;
  if (chainId === 204) return `https://opbnbscan.com/tx/${txHash}`;
  if (chainId === 5611) return `https://testnet.opbnbscan.com/tx/${txHash}`;
  return null;
}

function StatusPill({
  label,
  state
}: {
  label: string;
  state: "idle" | "loading" | "success" | "error";
}) {
  const cls =
    state === "success"
      ? "border-success/70 text-success"
      : state === "error"
      ? "border-danger/70 text-danger"
      : state === "loading"
      ? "border-accent/70 text-accent"
      : "border-line text-muted";
  return <span className={`rounded-full border px-2 py-1 ${cls}`}>{label}</span>;
}
