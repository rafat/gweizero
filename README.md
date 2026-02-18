# GweiZero

AI-powered Solidity gas optimization platform for BNB Chain.

Core value proposition:

> Paste a contract, get validated optimization candidates with measured gas savings and optional on-chain proof minting.

On-Chain Proof of Mint (BSC Mainnet) : https://bscscan.com/tx/0x3c54828f1ab0e303face736eaa07fd147fad3ebd7471ba681693605eab0df654

## Repository Structure

```text
/README.md
/bsc.address
/docs
/src
  /backend
  /contracts
  /worker
  /frontend
```

- `src/backend`: API orchestration, async analysis jobs, SSE progress, AI optimization pipeline, proof payload/mint endpoints.
- `src/contracts`: Hardhat package for `GasOptimizationRegistry` contract, tests, and deploy scripts.
- `src/worker`: heavy compile/deploy/gas measurement service (Hardhat), durable job persistence in Postgres, cancel/retry.
- `src/frontend`: reserved for Next.js app.

## Architecture

1. Frontend submits Solidity source to backend.
2. Backend runs:
   - static analysis
   - dynamic analysis (delegated to worker)
   - robust AI optimization loop
3. Backend performs final acceptance validation:
   - candidate compiles
   - ABI compatibility
   - gas regression threshold checks
4. Optional: backend derives and mints `GasOptimizationRegistry` proof on-chain.

## Current Backend/Worker Features

- Async analysis jobs with statuses and SSE progress streaming.
- Worker-side cancel and retry job controls.
- Postgres-backed worker job persistence.
- AI robustness controls:
  - structured JSON schema validation
  - repair retries for invalid output
  - provider/model fallback
  - verifier pass
  - compile-feedback iterative attempts
- Final accepted-contract validation before optimized result is accepted.

## Prerequisites

- Node.js `20+`
- npm
- Docker (optional, for local Postgres)
- AI API key:
  - `GEMINI_API_KEY` or `GOOGLE_API_KEY`
  - optional `OPENAI_API_KEY` for fallback

## Local Quick Start

### 1) Start Postgres (for worker)

```bash
docker run --name gweizero-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=gweizero_worker \
  -p 5432:5432 \
  -d postgres:16
```

### 2) Configure worker

```bash
cd src/worker
cp .env.example .env
npm install
npm run dev
```

### 3) Configure backend

```bash
cd src/backend
cp .env.example .env
npm install
npm run dev
```

Minimum backend env values:

- `COMPILATION_WORKER_URL=http://127.0.0.1:3010`
- `GEMINI_API_KEY=...` (or `GOOGLE_API_KEY=...`)

### 4) Configure frontend

```bash
cd src/frontend
cp .env.example .env
npm install
npm run dev
```

## Primary API Flows

### Async analysis (recommended)

1. `POST /api/analyze/jobs` with `{ code }`
2. `GET /api/analyze/jobs/:id/events` for SSE progress
3. `GET /api/analyze/jobs/:id` for status/result
4. Optional cancel: `POST /api/analyze/jobs/:id/cancel`

### Proof integration (after accepted optimization)

1. `POST /api/analyze/jobs/:id/proof-payload`
2. `POST /api/analyze/jobs/:id/mint-proof`

Requires backend env:

- `CHAIN_RPC_URL`
- `BACKEND_SIGNER_PRIVATE_KEY`
- `GAS_OPTIMIZATION_REGISTRY_ADDRESS`

## Service Documentation

- `src/backend/README.md`
- `src/worker/README.md`
- `src/frontend/README.md`

## Notes

- Worker and backend are intentionally split for fault isolation and scalability.
- Worker persistence is Postgres-only (`DATABASE_URL` required).
- `bsc.address` should be updated with deployed contract addresses when available.
