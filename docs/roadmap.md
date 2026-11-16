# Milestones and acceptance criteria

Keep each milestone small enough to explain and demonstrate. Every README claim should describe behavior that is implemented and verified.

| Step | Work | Done when |
| --- | --- | --- |
| 1. Architecture and setup | Architecture, API contracts, schema design, workspace, health check, CI. | A clean install builds; frontend reaches local Worker; tests pass; design vs implementation is clear. |
| 2. Application shell | Chat components, typed API client, provider interface, deterministic mock replies, errors/loading/retry behavior. | Browser tests cover a successful chat and failed request without needing Gemini. Mock mode is clearly labeled. |
| 3. First public deployment | Gemini adapter, verified Supabase identity, body/output limits, provider deadlines; minimum tenancy, quota and idempotency SQL migrations with RLS/restricted RPC grants; Pages/Worker deployment pipeline. | Account/region/cost requirements resolved; no keys in browser; unauthorized calls fail; atomic budgets and request ownership are tested; public demo works independently of laptop. A scripted public demo is an alternative while live-access constraints remain unresolved. |
| 4. Accounts and history | Complete login/logout UX, extend the initial SQL schema for full history, durable messages, pagination, export/delete, and retry recovery. | Reload restores own history; two-user tests reject cross-user access through both Worker and direct database API; retries do not duplicate turns. |
| 5. Memory and feedback | 768-dimensional embeddings, search, opt-in preferences, feedback review, atomic activation, forgetting/revocation. | Relevant approved private memory appears in later chats; pending/rejected/revoked memory never does; direct client approval and forged assistant writes fail. |
| 6. Security and evaluation | Broaden threat tests, load/quota/failure checks, frozen evaluation harness, dashboard. | Paired baseline/memory results show sample count and actual metrics; no leakage; failures and regressions are visible. Improvement is a result to measure, not an acceptance assumption. |
| 7. Portfolio release | Final README, screenshots, architecture decisions, live link, demo walkthrough, reproducible evaluation. | Another developer can run the project and a reviewer can verify the engineering claims. |

Basic security starts before the first public AI request. Step 6 expands it; it does not introduce authentication after private data or provider keys have already been exposed.

## Step 2 teaching sequence

1. Trace one message from the React composer to a typed Worker request and back.
2. Introduce a provider interface with a deterministic development implementation.
3. Add explicit states for idle, sending, completed, failed, and cancelled requests.
4. Validate request bodies at runtime; TypeScript alone cannot validate network input.
5. Test meaningful failure cases and retries before connecting an external AI provider.

Defer global knowledge sharing, automatic model training, document uploads, autonomous tools, and complex background queues. Each introduces a separate trust or operational problem and is unnecessary for demonstrating the initial learning loop.
