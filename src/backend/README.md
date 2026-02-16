# GweiZero Backend

Main API service for orchestration, async analysis jobs, SSE progress streaming, and AI optimization flow.

## What This Service Does

- Accepts Solidity source from the frontend.
- Runs static analysis (AST parsing).
- Delegates compile/deploy/gas measurement to the worker service.
- Runs robust AI optimization pipeline:
  - schema validation + repair retries
  - provider/model fallback
  - verifier pass
  - final acceptance validation (compile + ABI + gas regression checks)
- Exposes synchronous and async job APIs.

## Prerequisites

- Node.js `20+`
- npm
- Running worker service (`src/worker`)
- AI key (`GEMINI_API_KEY` or `GOOGLE_API_KEY`; optional `OPENAI_API_KEY` fallback)

## Install

```bash
cd src/backend
npm install
```

## Environment

Copy env template:

```bash
cp .env.example .env
```

Key variables:

- `PORT=3001`
- `COMPILATION_WORKER_URL=http://127.0.0.1:3010`
- `WORKER_POLL_INTERVAL_MS=1000`
- `WORKER_TIMEOUT_MS=180000`
- `ANALYSIS_JOB_DEDUPE_TTL_MS=600000` (reuse same-code in-flight/recent completed job to avoid duplicate runs)
- `GEMINI_API_KEY=...` (or `GOOGLE_API_KEY=...`)
- `AI_GEMINI_MODELS=gemini-2.5-flash` (required when using Gemini key)
- `OPENAI_API_KEY=...` (optional fallback)
- `AI_OPENAI_MODELS=gpt-4.1-mini` (required when using OpenAI key)
- `AI_LOGGING_ENABLED=true` (logs provider/model/retries/latency)
- `AI_LOG_RAW_RESPONSES=false` (set true to print raw model output)
- `AI_LOG_RAW_MAX_CHARS=5000` (truncate raw output logs)
- `AI_PROVIDER_RETRIES=2`
- `AI_MAX_OPTIMIZER_CYCLES=3`
- `AI_ACCEPTANCE_MAX_ATTEMPTS=3`
- `AI_MAX_ALLOWED_REGRESSION_PCT=2`
- `AI_MAX_DEPLOYMENT_REGRESSION_PCT=15` (secondary deployment threshold; runtime function gas is primary)

## Run

Development:

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

## API Endpoints

- `GET /` health text
- `POST /api/analyze` synchronous full analysis
- `POST /api/analyze/jobs` create async analysis job
- `GET /api/analyze/jobs/:id` get async job status/result
- `POST /api/analyze/jobs/:id/cancel` cancel async job
- `GET /api/analyze/jobs/:id/events` SSE progress stream
- `POST /api/analyze/jobs/:id/proof-payload` derive `GasOptimizationRegistry.mintProof` payload from accepted analysis
- `POST /api/analyze/jobs/:id/mint-proof` backend-relayed on-chain proof mint

## Async Flow (Frontend Integration)

1. `POST /api/analyze/jobs` with `{ code }`
2. Subscribe to `GET /api/analyze/jobs/:id/events` (SSE)
3. Optionally poll `GET /api/analyze/jobs/:id`
4. Cancel via `POST /api/analyze/jobs/:id/cancel`

## On-Chain Proof Flow (GasOptimizationRegistry)

1. Complete analysis job and wait for `status=completed`.
2. Ensure response has `optimizationValidation.accepted = true`.
3. Build payload:
   - `POST /api/analyze/jobs/:id/proof-payload`
4. Mint proof:
   - `POST /api/analyze/jobs/:id/mint-proof`

Required env vars for relayed minting:

- `CHAIN_RPC_URL`
- `BACKEND_SIGNER_PRIVATE_KEY`
- `GAS_OPTIMIZATION_REGISTRY_ADDRESS`

## Notes

- Backend is intentionally separate from worker to keep API responsive and isolate heavy Hardhat execution.
- If optimized candidates fail acceptance validation, backend safely falls back and reports validation metadata in response.
