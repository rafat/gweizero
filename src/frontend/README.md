# GweiZero Frontend

Next.js cinematic frontend shell for contract analysis UX.

## Milestone A + B Status

Implemented:

- Next.js App Router + TypeScript scaffold
- Tailwind + theme tokens + HUD-style global styling
- Landing page (`/`) with:
  - input mode switch (paste/upload/address)
  - network selector
  - analyze action
- Backend job creation integration (`POST /api/analyze/jobs`)
- Redirect to analysis route (`/analysis/[jobId]`)
- Live analysis HUD on `/analysis/[jobId]`:
  - SSE stream consumption (`/api/analyze/jobs/:id/events`)
  - polling fallback when SSE fails
  - phase timeline (`queued` -> `static` -> `dynamic` -> `ai` -> `complete`)
  - cancel action (`POST /api/analyze/jobs/:id/cancel`)
  - acceptance summary display

## Setup

```bash
cd src/frontend
cp .env.example .env.local
npm install
```

## Run

```bash
npm run dev
```

Open:

- `http://localhost:3000`

## Environment

- `NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:3001`

## Next Milestone

- Add rich results bento grid
- Function-level gas table + visual charts
- Monaco diff viewer with `edits[]` overlays
- Savings calculator + proof payload/mint actions
