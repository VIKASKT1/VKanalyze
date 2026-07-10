# VKAnalyze

**Privacy-first data analysis, in your browser.**

Upload a CSV, TSV, Excel, or JSON file and get automatic profiling, a live data quality score, cleaning tools, SQL and AI-assisted analysis, interactive dashboards, and shareable reports — with your raw data never leaving your device unless you explicitly choose to share it.

[![Build](https://img.shields.io/badge/build-passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()
[![License](https://img.shields.io/badge/license-MIT-lightgrey)]()

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Folder structure](#folder-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Gemini AI setup](#gemini-ai-setup)
- [Development](#development)
- [Testing](#testing)
- [Production build & deployment](#production-build--deployment)
- [Admin access](#admin-access)
- [Dashboard sharing & privacy model](#dashboard-sharing--privacy-model)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

VKAnalyze is a full analytics workspace built around one constraint: **your dataset stays on your device by default.** File parsing, profiling, cleaning, statistics, SQL queries, and chart rendering all run client-side in the browser. Only aggregated metadata — column names, statistics, and (if you choose) dashboard snapshots — is ever persisted to the backend.

Built with React 18, TypeScript, Vite, Tailwind CSS, Supabase (Postgres + Auth + Edge Functions), and Google Gemini.

## Features

**Data preparation**
- Upload CSV, TSV, Excel (`.xlsx`/`.xls`), and JSON files, parsed entirely client-side
- Automatic column profiling: type detection, null counts, unique values, distributions
- Live data quality score that recalculates immediately after any cleaning operation
- Cleaning rules: fill/remove nulls, trim whitespace, fix casing, remove duplicates, convert types, outlier handling
- AI-assisted cleaning suggestions (Gemini)

**Analysis**
- SQL workspace with a real in-browser SQL engine (SELECT, WHERE, GROUP BY, HAVING, ORDER BY, aggregates)
- Natural-language-to-SQL generation via Gemini, with a local fallback when AI is unavailable
- Correlation analysis (Pearson matrix + scatter plots)
- Outlier detection (Z-score and IQR)
- Time-series forecasting (linear regression)
- Pivot tables, advanced filters, dataset comparison

**Visualization & collaboration**
- Interactive bar, line, area, pie, scatter, and histogram charts
- Dashboard builder with KPI, chart, and table widgets, undo/redo, and autosave
- **Dashboard sharing** via public links, backed by aggregated, privacy-safe snapshots — see [Dashboard sharing & privacy model](#dashboard-sharing--privacy-model)
- PDF report export, CSV export of cleaned data, PNG/SVG chart export

**AI**
- Gemini-powered chat and insights over dataset metadata and statistics (never raw rows, unless Enhanced mode is explicitly enabled)
- Multi-key failover so AI features stay available under quota pressure

**Administration**
- Admin dashboard: platform analytics, user management, feedback moderation, audit log export
- Activity logs per dataset, viewable and clearable from the Privacy Dashboard

**Privacy & security**
- Local Only Mode: guarantees zero cloud calls and zero AI usage for a dataset
- Row Level Security on every table; Supabase Auth with JWT sessions
- No third-party tracking or analytics scripts

## Architecture

```
Browser (React + TypeScript)
  ├─ File parsing & profiling         → src/lib/data-processing.ts (main thread + Web Worker)
  ├─ Cleaning engine                  → src/components/tabs/CleanTab.tsx
  ├─ SQL engine, pivot, charts        → client-side, in-memory
  └─ Supabase client                  → src/lib/supabase.ts
        │
        ▼
Supabase
  ├─ Postgres (RLS on every table)    → supabase/migrations/
  ├─ Auth (JWT, email/password)
  └─ Edge Functions (Deno)            → supabase/functions/
        ├─ gemini-proxy               → AI requests, never forwards raw rows
        ├─ admin-*                    → user management, scoped to admin role
        └─ delete-user                → account deletion
        │
        ▼
Google Gemini API (via edge function proxy only — never called from the browser)
```

Only three things ever reach Supabase for a given dataset: column-level statistics, a quality score, and (only if you create a share link) an aggregated dashboard snapshot. Raw rows are never persisted server-side by default.

## Folder structure

```
src/
├── components/
│   ├── ui/              Shared design system: SiteNav, SiteFooter, PageShell,
│   │                    motion primitives, AnimatedCounter
│   ├── home/             Homepage section components (Hero, WorkflowRail, etc.)
│   ├── pages/             Public & authenticated pages (About, FAQ, Admin, ...)
│   ├── tabs/               Workspace tabs (Clean, SQL, Dashboard, Visualize, ...)
│   └── HomePage.tsx, App.tsx, Auth.tsx, DataFlowApp.tsx
├── lib/
│   ├── data-processing.ts   Parsing, profiling, quality scoring, cleaning
│   ├── dashboard-snapshot.ts Aggregation for privacy-safe dashboard sharing
│   ├── supabase.ts           Supabase client + typed query helpers
│   ├── privacy.ts            Local Only Mode / AI consent logic
│   └── __tests__/            Vitest unit tests
├── workers/
│   └── parse.worker.ts       Off-main-thread parsing for large/CSV files
supabase/
├── migrations/              SQL migrations (schema + RLS policies)
└── functions/                Edge Functions (Deno)
```

## Getting started

**Prerequisites:** Node.js 18+, npm, a Supabase project, a Google Gemini API key (optional — the app works without AI, with reduced functionality).

```bash
git clone https://github.com/VIKASKT1/vkanalyze.git
cd vkanalyze
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

## Environment variables

Copy `.env.example` to `.env.local`:

```bash
# Frontend (Vite) — safe to expose; access is scoped by RLS
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Edge Function secrets are **not** set in `.env` files — configure them in the Supabase dashboard under Project Settings → Edge Functions → Secrets:

```bash
GEMINI_API_KEY=AIza...          # Primary Gemini key
GEMINI_API_KEY_2=AIza...        # Optional failover key
GEMINI_API_KEY_3=AIza...        # Optional failover key
PRODUCTION_ORIGIN=https://yourdomain.com
PREVIEW_ORIGIN=https://preview.yourdomain.com   # Optional staging/preview origin
```

Never prefix Edge Function secrets with `VITE_` — that would expose them to the browser bundle.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migrations in `supabase/migrations/` in order — either via the Supabase CLI (`supabase db push`) or by pasting each file into the SQL Editor in sequence.
3. Copy your project URL and anon key into `.env.local`.
4. Deploy the Edge Functions in `supabase/functions/` (`supabase functions deploy <name>` for each, or via the dashboard).
5. Set Edge Function secrets as described above.

Every table ships with Row Level Security enabled; review the policies in the migration files before deploying to production if you fork the schema.

## Gemini AI setup

1. Get an API key from [Google AI Studio](https://aistudio.google.com/).
2. Add it as `GEMINI_API_KEY` in your Supabase Edge Function secrets (not the frontend `.env`).
3. Optionally add `GEMINI_API_KEY_2` / `GEMINI_API_KEY_3` for automatic failover under quota limits.

AI features degrade gracefully without a key: SQL generation falls back to a local pattern-matcher, and AI chat/insights are simply unavailable.

## Development

```bash
npm run dev         # start the dev server
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # vitest run
```

All four should exit cleanly before opening a pull request.

## Testing

Unit tests live in `src/lib/__tests__/` and run via [Vitest](https://vitest.dev/). They cover the parsing pipeline (CSV, TSV, JSON — including the wrapped-object-with-multiple-arrays edge case), cleaning rules, and the quality scoring formula's mathematical bounds.

```bash
npm test
```

## Production build & deployment

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

`dist/` is a static site — deploy it to Netlify, Vercel, Cloudflare Pages, or any static host. Set the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as build-time environment variables on your host.

Before deploying, confirm a clean pipeline:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Admin access

Admin routes (`/admin`) are gated by a `role` column on the user's profile, enforced both client-side and via RLS policies on admin-only tables. To grant admin access, update the relevant user's role directly in the Supabase dashboard — there is no self-service admin signup.

## Dashboard sharing & privacy model

Sharing a dashboard does **not** upload your dataset. When you create a share link:

1. VKAnalyze computes a small aggregated snapshot from the widgets on your dashboard — value-frequency buckets for bar/pie charts, downsampled point series for line/area charts, and (only for KPI widgets) column statistics that were already being synced.
2. This snapshot, capped in size, is what the public link actually serves — never your raw rows.
3. If a dashboard includes a table widget, you can optionally check "Include dataset preview for sharing" to publish a small, explicit preview (first ~20 rows, up to 8 columns). This is off by default.

See `src/lib/dashboard-snapshot.ts` for the exact aggregation logic and `supabase/migrations/20260703090000_add_dashboard_snapshots.sql` for the schema and RLS policies.

## Troubleshooting

**Build fails with a TypeScript error after pulling changes** — run `npm install` again; a dependency version may have changed.

**Charts on a shared dashboard are empty** — the dashboard owner needs to re-share (or click "Refresh shared data") after adding new widgets; snapshots are computed at share time, not live.

**AI features return an error** — check that `GEMINI_API_KEY` is set in Supabase Edge Function secrets, not the frontend `.env`. Confirm the `gemini-proxy` function is deployed.

**A dataset always shows 0% quality** — this was a real bug in earlier versions, caused by wrapped JSON files with multiple array-valued keys picking the wrong array. It's fixed; if you still see it, please open an issue with a sample file shape (not the actual data).

**Local Only Mode and I still see network requests** — open the Privacy Dashboard's diagnostics panel, which lists every request type the app is capable of making and confirms which are blocked.

## FAQ

See the in-app [FAQ page](/faq) for the full, current list — it covers file formats, privacy, AI behavior, SQL capabilities, and account data retention in more detail than fits here.

## Contributing

Issues and pull requests are welcome. Please:

1. Run `npm run typecheck && npm run lint && npm test` before opening a PR.
2. Keep changes focused — one concern per PR.
3. For anything touching privacy behavior (what data leaves the browser), please explain the reasoning in the PR description.

See `CONTRIBUTING.md` for more detail, `SECURITY.md` for how to report a vulnerability, and `CODE_OF_CONDUCT.md` for community expectations.

## License

MIT — see `LICENSE`.

## Credits

Built by [Vikas K T](https://github.com/VIKASKT1).
