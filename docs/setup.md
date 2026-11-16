# Local setup and deployment preparation

Status: Step 1. Local setup is runnable; application hosting and database setup below are plans for later milestones. The source repository is published on GitHub; the cloud application has not been provisioned.

## Prerequisites and commands

Use Node.js 24 (`.nvmrc`) and npm. Run commands from the repository root, the directory containing this README and `package-lock.json`. Docker, Supabase CLI, cloud accounts, and secrets are not needed for Step 1.

```sh
npm ci
npm run dev
```

The web server uses `http://localhost:5173`; the Worker uses port `8787`. Both bind locally. The button on the foundation page calls `/api/v1/health`, which Vite proxies to the Worker. Both servers stop with Ctrl+C. `--strictPort` prevents the frontend silently selecting a different port.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend and Worker together. |
| `npm run dev:web` / `npm run dev:api` | Start either process separately. |
| `npm run typecheck` | Check shared types, frontend, API, and test/configuration files. |
| `npm test` | Run Vitest HTTP boundary tests. |
| `npm run test:watch` | Watch unit tests during development. |
| `npm run build` | Compile web assets and dry-run bundle the Worker; does not publish. |
| `npm run check` | Typecheck, unit tests, and both builds. |
| `npm run test:e2e` | Start missing local servers and run browser tests. |

Before the first browser run, use `npx playwright install chromium`. On Linux CI, the workflow uses `npx playwright install --with-deps chromium` to install OS dependencies too. Browser tests use a real local Worker; the failure test explicitly interrupts its health request. `npm run check` alone does not run browser tests.

Dependencies are locked by `package-lock.json`. CI and fresh clones use `npm ci`, not an unbounded package update. The initial tests do not prove RLS, live Gemini compatibility, or production performance; those belong to their integration milestones.

## Environment ownership

Nothing needs to be copied for Step 1. The example files document future configuration. Do not paste secrets into chat or commit them.

| Variable | Location later | Secret? | Purpose |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | `apps/web/.env.local`; Pages build configuration | No | Worker origin without `/api/v1`, e.g. `https://adaptiveai-api.<account>.workers.dev`; blank only for local proxy. |
| `VITE_SUPABASE_URL` | Web build | No | Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Web build | No | Browser project identifier; protected by database grants and RLS. |
| `ALLOWED_ORIGINS` | Worker configuration | No | Exact comma-separated origins; no paths, trailing slashes, or broad preview wildcard. |
| `SUPABASE_URL` | Worker configuration | No | HTTPS project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Worker configuration | No | Used with the verified user's JWT for ordinary reads. |
| `GEMINI_CHAT_MODEL` | Worker configuration | No | Choose an available model after verifying account quota in Step 3. |
| `GEMINI_EMBEDDING_MODEL` | Worker configuration | No | Proposed text model `gemini-embedding-001`; recheck availability at integration. |
| `GEMINI_API_KEY` | Worker secret; local `.dev.vars` for development | Yes | Server-only provider access. |
| `SUPABASE_SECRET_KEY` | Worker secret; restricted workflows only | Yes | Server-side access bypassing RLS; never a normal user client or browser variable. |

`VITE_*` values are compiled into public JavaScript. Changing them requires rebuilding the frontend. Supabase publishable keys are designed for client exposure; secret/service-role keys are not. New secret keys and legacy `service_role` keys need equivalent care; confirm the project's key format during integration. See [Supabase API keys](https://supabase.com/docs/guides/api/api-keys).

In local development, `.dev.vars` belongs beside `apps/api/wrangler.jsonc`. In production use Cloudflare Worker secrets, not a committed file. Add an integration environment validator when those integrations actually exist. The current health endpoint deliberately reports both integrations as unconfigured even if example values are copied.

## Accounts and cloud resources, introduced when needed

1. **GitHub:** the scaffold is published at [rana123bilal/adaptiveai](https://github.com/rana123bilal/adaptiveai), with the local `origin` remote pointing there. CI runs on pushes to `main` and pull requests. Requiring CI checks through branch protection is a later repository configuration step.
2. **Cloudflare:** create one Pages project and a separate Worker. Free service subdomains avoid buying a domain. No server on the laptop participates in serving production traffic.
3. **Supabase:** create a PostgreSQL project, choose an appropriate region, enable pgvector through a reviewed migration, and configure GitHub OAuth. Add explicit local/production callback URLs. Use a dedicated development project or local Supabase for destructive database tests.
4. **Google AI Studio:** inspect available models, project quotas, regions, and service terms. Create a key and store it as a Worker secret only when enabling the integration.

GitHub OAuth is the initial authentication choice for the portfolio audience. Email/password or magic links can follow when SMTP is configured. Supabase's [default mail service](https://supabase.com/docs/guides/auth/auth-smtp) limits recipients to project-team addresses and is not a public signup mail solution.

## Free-tier feasibility, checked 2026-11-16

| Service | Verified constraint | Design consequence |
| --- | --- | --- |
| Cloudflare Workers Free | 100,000 requests/day and 10 ms CPU per invocation; network waiting is distinct from CPU. | Keep orchestration lightweight; generate embeddings remotely; measure CPU in the deployed runtime. |
| Cloudflare Pages Free | 500 builds/month. | Small static frontend; avoid redundant deployment pipelines. |
| Supabase Free | 500 MB database; inactivity can trigger pausing after a week. | Bound retention and vector storage; document a restore procedure. Free hosting is not an uptime guarantee. |
| Gemini | Model/project-specific request and token quotas. | Check AI Studio; reserve budget for generation, embeddings, validation, and evaluation. |
| Gemini availability/terms | Paid Services required for clients offered to EEA, Switzerland, or UK users. | A worldwide strictly free Gemini deployment is not the assumed launch configuration. |

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Supabase pricing](https://supabase.com/pricing), [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Gemini terms](https://ai.google.dev/gemini-api/terms).

Before Step 3, decide whether the public site offers a clearly labeled scripted demo, a live service limited to eligible audiences under the applicable terms, or a billing-enabled Gemini integration with a deliberately revised cost requirement. Billing is not enabled by this repository. Do not claim that linking billing guarantees zero charges. Keep the provider adapter so a different provider can be evaluated if strict zero-cost access is essential.

Google's unpaid-service data-use terms and regional exceptions also affect what may be sent to the provider. Tenant isolation in our database does not mean prompts stay inside our database. The app must explain that chosen conversation context and memory are sent to the AI provider. Use synthetic, non-sensitive content in the portfolio demo and settle the actual deployed account's data handling before collecting real personal memory.

## Deployment plan for Step 3

Use GitHub Actions as the single deployment authority. Create a Pages **Direct Upload** project, then deploy the successful frontend artifact with Wrangler. This avoids automatic Pages Git builds publishing code before the Actions test job completes. The production job will depend on all checks and use a protected GitHub environment with scoped Cloudflare credentials. Fork PR checks receive no production secrets. See [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

| Deployment | Working directory | Build artifact/configuration |
| --- | --- | --- |
| Pages | Repository root | Build web workspace; upload `apps/web/dist`. Set production Worker URL at build time. |
| Worker | `apps/api` | Wrangler bundles `src/index.ts` using `wrangler.jsonc`; set exact Pages origin and Worker secrets. |
| Database | Versioned SQL migrations | Reviewed, backward-compatible migrations before dependent code. Never reset production to apply a change. |

The Vite proxy exists only in development. Production Pages must call the Worker origin configured in `VITE_API_BASE_URL`; Worker CORS must allow the exact Pages origin. A future same-origin custom-domain route is optional. Configure a Content Security Policy with the actual Supabase/Worker origins before auth launches; the current `_headers` file supplies basic browser headers only.

Deploy the compatible API before a frontend depending on new routes. Smoke-test the live health endpoint, identity rejection, and a small budgeted authenticated request. Keep the previous Worker and frontend versions for rollback; use additive database changes because rolling back code does not undo a migration. No deployment workflow is enabled in Step 1.
