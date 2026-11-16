# AdaptiveAI — A Self-Improving AI Assistant

A full-stack portfolio project exploring how validated, private memory can improve an assistant's answers. “Self-improving” means retrieval-augmented memory and reviewed feedback. The project does not retrain model weights.

**Current milestone: Step 1 — architecture and local foundation.** This repository runs a React frontend and Cloudflare Worker health endpoint. Chat, authentication, persistence, memory, and evaluation are designed but not implemented. There is no public deployment or measured improvement yet.

## Start locally

Use Node.js 24 and npm. No cloud accounts or API keys are needed for this milestone.

```sh
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), then choose **Check API connection**. The frontend calls the actual local Worker through Vite's development proxy. The Worker also serves [http://localhost:8787/api/v1/health](http://localhost:8787/api/v1/health).

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` runs strict TypeScript checks, Vitest, the frontend build, and a Worker dry-run build. Playwright checks the browser-to-Worker connection and the network-error state on desktop and mobile Chromium. Tests do not call paid or live AI services. CI runs these checks on pushes to `main` and pull requests; deployment automation comes in Step 3.

## Design in one minute

```text
Browser / React on Cloudflare Pages
  ├── Supabase Auth → session
  └── HTTPS + access token → Cloudflare Worker
        ├── Supabase PostgreSQL + pgvector → own history and approved memories
        └── Gemini API → embeddings and answers
```

The browser owns presentation. The Worker owns secrets, verification, request budgets, and AI orchestration. PostgreSQL owns durable records and permission enforcement. After deployment, these services run independently of a laptop.

The planned learning loop is **feedback → validation → approval → embedding → active memory → retrieval → evaluation**. A factual correction needs evidence and authorized review. A personal preference can be confirmed by its owner. Neither path shares memory between users.

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| API | Cloudflare Workers, TypeScript |
| AI | Gemini API behind a provider adapter |
| Identity and data | Supabase Auth, PostgreSQL, pgvector |
| Hosting | Cloudflare Pages + separate Worker |
| Verification and delivery | Vitest, Playwright, GitHub Actions |

## Read the engineering plan

1. [Architecture and decisions](docs/architecture.md) — responsibilities, request flow, trust boundaries.
2. [API contracts](docs/api.md) — routes, errors, pagination, retries, idempotency.
3. [Database design](docs/database.md) — tables, ownership, permission matrix, validation states.
4. [Setup and deployment preparation](docs/setup.md) — local commands, environments, account setup.
5. [Evaluation design](docs/evaluation.md) — baseline comparison, metrics, held-out cases.
6. [Milestones](docs/roadmap.md) — what to build next and how to know it works.

## Repository layout

```text
apps/
  web/                  React SPA; dist/ is the future Pages artifact
  api/                  Worker; wrangler.jsonc and HTTP boundary tests
packages/shared/        Shared TypeScript contracts
supabase/
  migrations/           Reserved for reviewed SQL migrations
  tests/                Reserved for database/tenant-isolation tests
tests/e2e/              Playwright tests
docs/                   Architecture and implementation plan
.github/workflows/      CI verification
```

The schema is currently a design document; there are no applied migrations. Security mechanisms described in the plan are not yet implemented, except the limited health endpoint's exact-origin CORS handling and response headers. A successful health check is liveness, not database/provider readiness.

## Free-tier deployment constraints

Checked 2026-11-16. Cloud hosting removes the laptop dependency but free services have availability and quota constraints. Supabase Free may pause after a week of inactivity. Gemini quotas depend on the project and model; inspect AI Studio before choosing limits. Current Gemini terms require Paid Services for clients serving users in the EEA, Switzerland, or UK. These constraints must be resolved before a globally accessible live AI launch; this scaffold does not enable billing or provision accounts.

Sources: [Supabase pricing](https://supabase.com/pricing), [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Gemini terms](https://ai.google.dev/gemini-api/terms). The detailed deployment decisions are in [setup.md](docs/setup.md).

## Immediate next milestone

Build the chat layout and a deterministic mock provider behind the API contract. Verify loading, errors, cancellation, and retry behavior locally before connecting Gemini. Basic identity and usage limits must ship before any public endpoint accepts live AI requests.
