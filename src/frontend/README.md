# GweiZero Frontend

Next.js cinematic frontend shell for contract analysis UX.

## Milestone A + B + C + D Status

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
- Milestone C results experience:
  - bento summary cards (contract + gas overview)
  - function-level gas comparison table
  - interactive savings calculator
  - Monaco side-by-side code diff (original vs optimized)
- Milestone D proof flow:
  - derive proof payload (`POST /api/analyze/jobs/:id/proof-payload`)
  - mint proof (`POST /api/analyze/jobs/:id/mint-proof`)
  - tx state indicators (idle/loading/success/error)
  - mint receipt display with explorer link

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

- Add visual chart module (bar/ring charts)
- Add optimization cards with line-jump integration into Monaco diff
- Add wallet-connected direct mint option (non-relayed)
