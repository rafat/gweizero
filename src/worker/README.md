# GweiZero Worker

Dedicated compilation/gas-analysis service. Runs Hardhat workloads asynchronously and stores job state in Postgres.

## What This Service Does

- Accepts Solidity code analysis jobs.
- Compiles/deploys contracts in local Hardhat runtime.
- Measures deployment + function gas.
- Persists job lifecycle in Postgres.
- Supports cancel and retry APIs.

## Prerequisites

- Node.js `20+`
- npm
- PostgreSQL (local or managed)

## Install

```bash
cd src/worker
npm install
```

## Environment

Copy env template:

```bash
cp .env.example .env
```

Required:

- `WORKER_PORT=3010`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gweizero_worker`

Optional:

- `PGSSLMODE=require` for hosted Postgres that requires SSL

## Local Postgres Quick Start (Docker)

```bash
docker run --name gweizero-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=gweizero_worker \
  -p 5432:5432 \
  -d postgres:16
```

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
- `GET /jobs/health` JSON health
- `POST /jobs/analyze` create job (`{ code }`)
- `GET /jobs/:id` get job status/result
- `POST /jobs/:id/cancel` cancel queued/running job
- `POST /jobs/:id/retry` retry failed/cancelled job

## Job Status Values

- `queued`
- `processing`
- `completed`
- `failed`
- `cancelled`

## Persistence Behavior

- Worker auto-creates table `analysis_jobs` and index `idx_analysis_jobs_status`.
- Every status transition is upserted to Postgres.
- On startup, worker loads existing jobs into memory.

## Integration with Backend

Backend must set:

- `COMPILATION_WORKER_URL=http://127.0.0.1:3010`

Then backend orchestrates user-facing async analysis while worker handles heavy compile/gas execution.
