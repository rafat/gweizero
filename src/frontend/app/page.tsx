import Link from "next/link";
import { ContractInputCard } from "@/components/input/contract-input-card";

export default function HomePage() {
  return (
    <main className="relative mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent">GweiZero</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight">
            Gas Optimization
            <br />
            BNB Chain HUD
          </h1>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-muted hover:border-accent/60 hover:text-accent"
            href="/"
          >
            Analyze
          </Link>
          <Link
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-muted hover:border-accent/60 hover:text-accent"
            href="/analysis/demo"
          >
            Progress View
          </Link>
        </nav>
      </header>

      <section className="mb-8 max-w-2xl">
        <p className="text-lg text-muted">
          Paste a Solidity contract and get function-level gas analysis, AI optimization candidates, and a validated
          acceptance pipeline before any proof is minted on-chain.
        </p>
      </section>

      <ContractInputCard />
    </main>
  );
}
