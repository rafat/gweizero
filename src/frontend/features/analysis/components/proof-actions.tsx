"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MintProofResponse, ProofPayloadResponse, getProofPayload, mintProof } from "@/lib/api/analysis";

type MintHistoryEntry = {
  id: string;
  jobId: string;
  timestamp: number;
  chainId: number;
  txHash: string;
  tokenId?: string;
  contractName: string;
  originalHash: string;
  optimizedHash: string;
  savingsPercentBps: number;
  source: "backend" | "wallet";
};

const HISTORY_KEY = "gweizero_mint_history";
const BSC_MAINNET_CHAIN_ID = 56;
const BSC_MAINNET_HEX = "0x38";
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_GAS_OPTIMIZATION_REGISTRY_ADDRESS || "";
const MINT_PROOF_SELECTOR = "0x360ad03a";

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
  const [mintState, setMintState] = useState<"idle" | "loading" | "success" | "error">("idle"); // backend relayer
  const [walletMintState, setWalletMintState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<MintHistoryEntry[]>(() => loadMintHistory());
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

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
    setWalletMintState("idle");
    try {
      const receipt = await mintProof(jobId, requestBody);
      setMintReceipt(receipt);
      setPayload(receipt.payload);
      setMintState("success");
      const nextEntry: MintHistoryEntry = {
        id: `${receipt.receipt.txHash}-${Date.now()}`,
        jobId,
        timestamp: Date.now(),
        chainId: receipt.receipt.chainId,
        txHash: receipt.receipt.txHash,
        tokenId: receipt.receipt.tokenId,
        contractName: receipt.payload.contractName,
        originalHash: receipt.payload.originalHash,
        optimizedHash: receipt.payload.optimizedHash,
        savingsPercentBps: receipt.payload.savingsPercentBps,
        source: "backend"
      };
      setHistory((prev) => {
        const next = [nextEntry, ...prev].slice(0, 12);
        saveMintHistory(next);
        return next;
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to mint proof.";
      setError(message);
      setMintState("error");
    }
  }

  async function onConnectWallet() {
    setError(null);
    const ethereum = getEthereum();
    if (!ethereum) {
      setError("MetaMask not detected. Install MetaMask to use wallet mint.");
      return;
    }

    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const chainHex = (await ethereum.request({ method: "eth_chainId" })) as string;
      setWalletAddress(accounts[0] || null);
      setWalletChainId(Number.parseInt(chainHex, 16));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to connect MetaMask.";
      setError(message);
    }
  }

  async function onSwitchToBscMainnet() {
    setError(null);
    const ethereum = getEthereum();
    if (!ethereum) {
      setError("MetaMask not detected.");
      return;
    }

    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_MAINNET_HEX }]
      });
      setWalletChainId(BSC_MAINNET_CHAIN_ID);
    } catch (e: unknown) {
      const maybeError = e as { code?: number; message?: string };
      if (maybeError?.code === 4902) {
        try {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: BSC_MAINNET_HEX,
                chainName: "BNB Smart Chain",
                rpcUrls: ["https://bsc-dataseed.binance.org"],
                nativeCurrency: {
                  name: "BNB",
                  symbol: "BNB",
                  decimals: 18
                },
                blockExplorerUrls: ["https://bscscan.com"]
              }
            ]
          });
          setWalletChainId(BSC_MAINNET_CHAIN_ID);
          return;
        } catch (addErr: unknown) {
          const addMsg = addErr instanceof Error ? addErr.message : "Failed to add BSC mainnet.";
          setError(addMsg);
          return;
        }
      }
      const message = e instanceof Error ? e.message : "Failed to switch network.";
      setError(message);
    }
  }

  async function onWalletMint() {
    setError(null);
    setWalletMintState("loading");
    setMintState("idle");

    try {
      if (!REGISTRY_ADDRESS) {
        throw new Error("Missing NEXT_PUBLIC_GAS_OPTIMIZATION_REGISTRY_ADDRESS in frontend env.");
      }

      const ethereum = getEthereum();
      if (!ethereum) {
        throw new Error("MetaMask not detected.");
      }

      let payloadToMint = payload;
      if (!payloadToMint) {
        setPayloadState("loading");
        payloadToMint = await getProofPayload(jobId, requestBody);
        setPayload(payloadToMint);
        setPayloadState("success");
      }
      const chainHex = (await ethereum.request({ method: "eth_chainId" })) as string;
      const chainId = Number.parseInt(chainHex, 16);
      if (chainId !== BSC_MAINNET_CHAIN_ID) {
        throw new Error("MetaMask must be connected to BSC mainnet (chainId 56).");
      }

      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const signerAddress = accounts?.[0];
      if (!signerAddress) {
        throw new Error("No wallet account found.");
      }
      setWalletAddress(signerAddress);
      setWalletChainId(chainId);
      const data = buildMintProofCalldata(payloadToMint);
      const txHash = (await ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: signerAddress,
            to: REGISTRY_ADDRESS,
            data
          }
        ]
      })) as string;
      await waitForReceipt(ethereum, txHash, 90_000);

      const frontendReceipt: MintProofResponse = {
        minted: true,
        payload: payloadToMint,
        receipt: {
          txHash,
          tokenId: undefined,
          registryAddress: REGISTRY_ADDRESS,
          chainId
        }
      };
      setMintReceipt(frontendReceipt);
      setWalletMintState("success");

      const nextEntry: MintHistoryEntry = {
        id: `${txHash}-${Date.now()}`,
        jobId,
        timestamp: Date.now(),
        chainId,
        txHash,
        tokenId: undefined,
        contractName: payloadToMint.contractName,
        originalHash: payloadToMint.originalHash,
        optimizedHash: payloadToMint.optimizedHash,
        savingsPercentBps: payloadToMint.savingsPercentBps,
        source: "wallet"
      };
      setHistory((prev) => {
        const next = [nextEntry, ...prev].slice(0, 12);
        saveMintHistory(next);
        return next;
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Wallet mint failed.";
      setError(message);
      setWalletMintState("error");
      if (payloadState === "loading") {
        setPayloadState("error");
      }
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((curr) => (curr === label ? null : curr)), 1200);
    } catch {
      setError("Clipboard copy failed.");
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold">On-Chain Proof</p>
      <p className="mt-1 text-xs text-muted">
        Generate a mint payload from this validated job, then mint either via MetaMask (user wallet) or backend
        relayer.
      </p>

      <div className="mt-3 rounded-lg border border-line/70 bg-surface p-3">
        <p className="text-xs uppercase tracking-wider text-muted">Wallet</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onConnectWallet}>
            {walletAddress ? "Reconnect MetaMask" : "Connect MetaMask"}
          </Button>
          <Button variant="secondary" onClick={onSwitchToBscMainnet}>
            Switch to BSC Mainnet
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {walletAddress
            ? `Connected: ${shortAddress(walletAddress)}${walletChainId ? ` · Chain ${walletChainId}` : ""}`
            : "Wallet not connected"}
        </p>
      </div>

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
        <Button onClick={onWalletMint} disabled={walletMintState === "loading"}>
          {walletMintState === "loading" ? "Minting via Wallet..." : "Mint via MetaMask"}
        </Button>
        <Button variant="secondary" onClick={onMintProof} disabled={mintState === "loading"}>
          {mintState === "loading" ? "Minting via Backend..." : "Mint via Backend"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <StatusPill label={`Payload: ${payloadState}`} state={payloadState} />
        <StatusPill label={`Wallet mint: ${walletMintState}`} state={walletMintState} />
        <StatusPill label={`Backend mint: ${mintState}`} state={mintState} />
      </div>

      {payload && (
        <div className="mt-4 rounded-lg border border-line/70 bg-surface p-3">
          <p className="text-xs uppercase tracking-wider text-muted">Payload</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="text-xs"
              onClick={() => copyText("originalHash", payload.originalHash)}
            >
              {copied === "originalHash" ? "Copied original hash" : "Copy Original Hash"}
            </Button>
            <Button
              variant="secondary"
              className="text-xs"
              onClick={() => copyText("optimizedHash", payload.optimizedHash)}
            >
              {copied === "optimizedHash" ? "Copied optimized hash" : "Copy Optimized Hash"}
            </Button>
          </div>
          <pre className="mt-2 overflow-auto text-xs text-text">{JSON.stringify(payload, null, 2)}</pre>
        </div>
      )}

      {mintReceipt && (
        <div className="mt-4 rounded-lg border border-success/40 bg-surface p-3">
          <p className="text-xs uppercase tracking-wider text-success">Transaction Result</p>
          <p className="mt-2 text-sm">
            Tx Hash: <span className="font-mono text-xs">{mintReceipt.receipt.txHash}</span>
          </p>
          <div className="mt-2">
            <Button
              variant="secondary"
              className="text-xs"
              onClick={() => copyText("txHash", mintReceipt.receipt.txHash)}
            >
              {copied === "txHash" ? "Copied tx hash" : "Copy Tx Hash"}
            </Button>
          </div>
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

      <div className="mt-4 rounded-lg border border-line/70 bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wider text-muted">Mint History (Current Session)</p>
          {history.length > 0 && (
            <Button
              variant="secondary"
              className="text-xs"
              onClick={() => {
                setHistory([]);
                saveMintHistory([]);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {history.length === 0 && <p className="mt-2 text-xs text-muted">No mint transactions yet.</p>}
        {history.length > 0 && (
          <div className="mt-2 max-h-52 space-y-2 overflow-auto pr-1">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-line/60 px-3 py-2">
                <p className="text-xs text-muted">
                  {new Date(entry.timestamp).toLocaleTimeString()} · Job {entry.jobId.slice(0, 8)}...
                </p>
                <p className="mt-1 text-xs font-mono text-text">{entry.txHash}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span>{entry.source === "wallet" ? "MetaMask" : "Backend"}</span>
                  <span>Chain {entry.chainId}</span>
                  <span>Token {entry.tokenId || "—"}</span>
                  <span>Save {(entry.savingsPercentBps / 100).toFixed(2)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return value ?? null;
}

function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildMintProofCalldata(payload: ProofPayloadResponse): string {
  const valuesHead = [
    encodeBytes32(payload.originalHash),
    encodeBytes32(payload.optimizedHash),
    encodeAddress(payload.contractAddress || ZeroAddressHex),
    encodeUint256(32 * 7),
    encodeUint256(payload.originalGas),
    encodeUint256(payload.optimizedGas),
    encodeUint256(payload.savingsPercentBps)
  ].join("");

  const contractName = payload.contractName || "OptimizedContract";
  const nameTail = encodeDynamicString(contractName);
  return `${MINT_PROOF_SELECTOR}${valuesHead}${nameTail}`;
}

const ZeroAddressHex = "0x0000000000000000000000000000000000000000";

function encodeBytes32(value: string): string {
  const clean = strip0x(value);
  if (clean.length !== 64) {
    throw new Error("Invalid bytes32 value in payload.");
  }
  return clean;
}

function encodeAddress(address: string): string {
  const clean = strip0x(address).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(clean)) {
    throw new Error("Invalid contract address in payload.");
  }
  return clean.padStart(64, "0");
}

function encodeUint256(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Invalid numeric payload value.");
  }
  return Math.floor(value).toString(16).padStart(64, "0");
}

function encodeDynamicString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const lenHex = bytes.length.toString(16).padStart(64, "0");
  const dataHex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const paddedLength = Math.ceil(dataHex.length / 64) * 64;
  const paddedData = dataHex.padEnd(paddedLength, "0");
  return `${lenHex}${paddedData}`;
}

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

async function waitForReceipt(
  ethereum: EthereumProvider,
  txHash: string,
  timeoutMs: number
): Promise<{ transactionHash: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = (await ethereum.request({
      method: "eth_getTransactionReceipt",
      params: [txHash]
    })) as { transactionHash?: string } | null;
    if (receipt?.transactionHash) {
      return { transactionHash: receipt.transactionHash };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Mint submitted but timed out waiting for receipt. Check tx on explorer.");
}

function loadMintHistory(): MintHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MintHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMintHistory(entries: MintHistoryEntry[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
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
