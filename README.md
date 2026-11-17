# AdaptiveAI — A Self-Improving AI Assistant

A full-stack portfolio project exploring how validated, private memory can improve an assistant's answers. “Self-improving” means retrieval-augmented memory and reviewed feedback. The project does not retrain model weights.

**Current milestone: Step 2 — interactive chat with a mock provider.** A responsive React chat interface now talks to a real local Cloudflare Worker. It supports session conversations, loading, cancellation, errors, and retry. Replies are deterministic mock responses, clearly labeled in the interface. Authentication, persistent history, Gemini, memory, and evaluation remain planned. There is no public application deployment or measured improvement yet.

## Start locally

Use Node.js 24 and npm. No cloud accounts or API keys are needed for this milestone.

```sh
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and send a message, or choose the **Architecture**, **Memory**, or **Evaluation** starter. The frontend calls the local Worker's `/api/v1/demo/chat` endpoint through Vite's development proxy. The Worker also serves [http://localhost:8787/api/v1/health](http://localhost:8787/api/v1/health).

Conversations exist only in this browser tab's memory and clear on refresh. The app does not save chat text in local storage or send it to Gemini. This milestone exercises the application flow, not long-term memory or model intelligence.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` runs strict TypeScript checks, Vitest, the frontend build, and a Worker dry-run build. Unit tests cover shared contracts, HTTP boundaries, client transport, and dependency direction. Playwright covers mock chat, failure/retry, cancellation, late-response isolation, keyboard submission and focus, safe text rendering, and responsive/reduced-motion behavior on desktop and mobile Chromium. Tests do not call paid or live AI services. CI runs these checks on pushes to `main` and pull requests and preserves browser failure diagnostics; deployment automation comes in Step 3.

## Design in one minute

The implemented Step 2 path is:

```text
React chat → typed API client → Worker validation → deterministic mock provider
```

The planned production architecture is:

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
7. [Step 2 walkthrough](docs/step-2.md) — trace a message, understand request states, and inspect error-recovery tests.

## Repository layout

```text
apps/
  web/src/
    features/chat/      Chat UI, session state, model, and API client
    components/         Reusable icons and decorative orb
  api/src/              Worker entry, HTTP boundary, routes, and providers
packages/shared/src/    Framework-independent API contracts and validation
supabase/
  migrations/           Reserved for reviewed SQL migrations
  tests/                Reserved for database/tenant-isolation tests
tests/e2e/              Playwright tests
tests/architecture.test.ts  Import-boundary guard
docs/                   Architecture and implementation plan
.github/workflows/      CI verification
```

The browser and Worker depend on the shared contract and never on each other's source. The [architecture guide](docs/architecture.md#current-module-boundaries) documents each module's responsibility. The schema is currently a design document; there are no applied migrations. The demo API checks JSON shape, request size, and exact allowed browser origins. Production authentication, tenant isolation, durable quotas, and persistence are not implemented. A successful health check is liveness, not database/provider readiness. The mock-only demo endpoint defaults to disabled in the deployment configuration; the local development command explicitly enables it. It must remain separate from future authenticated AI routes.

## Free-tier deployment constraints

Checked 2026-11-16. Cloud hosting removes the laptop dependency but free services have availability and quota constraints. Supabase Free may pause after a week of inactivity. Gemini quotas depend on the project and model; inspect AI Studio before choosing limits. Current Gemini terms require Paid Services for clients serving users in the EEA, Switzerland, or UK. These constraints must be resolved before a globally accessible live AI launch; this scaffold does not enable billing or provision accounts.

Sources: [Supabase pricing](https://supabase.com/pricing), [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Gemini terms](https://ai.google.dev/gemini-api/terms). The detailed deployment decisions are in [setup.md](docs/setup.md).

## Immediate next milestone

Step 3 connects Gemini behind an authenticated, budgeted backend and prepares Pages/Worker deployment. Resolve the provider's audience and cost constraints first. Basic identity, ownership checks, and durable usage limits must ship before any public endpoint accepts live AI requests; the mock demo route is not a shortcut around them.
