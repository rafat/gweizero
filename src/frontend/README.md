# GweiZero Frontend

Next.js cinematic frontend shell for contract analysis UX.

## Milestone A Status

Implemented:

- Next.js App Router + TypeScript scaffold
- Tailwind + theme tokens + HUD-style global styling
- Landing page (`/`) with:
  - input mode switch (paste/upload/address)
  - network selector
  - analyze action
- Backend job creation integration (`POST /api/analyze/jobs`)
- Redirect to analysis route (`/analysis/[jobId]`)
- Base analysis page scaffold for upcoming live progress HUD

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

- Wire SSE stream (`/api/analyze/jobs/:id/events`)
- Build scanning/progress phase timeline
- Add result HUD cards, function table, diff viewer, and calculator
