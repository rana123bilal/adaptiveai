# Step 2: trace a message through the application

Step 2 builds the real application shell around a deterministic mock provider. The browser sends actual HTTP requests to a local Cloudflare Worker. Replies are scripted, with one clear footer explaining that they are demo replies and chats clear on refresh. This gives us a controlled way to develop loading, failure, cancellation, and retry behavior before depending on an external model.

## What works now

- Responsive chat workspace with a session conversation list, message composer, suggestion prompts, and explicit request states.
- A typed API client and shared request/response contracts, plus runtime checks at the HTTP boundary.
- A mock-only Worker route and provider interface, without provider keys or database access.
- Retry within the existing conversation turn instead of duplicating the user's message.
- Stop response and automatic cancellation when changing conversations, with guards against stale responses.
- Motion for the interface and message transitions, with reduced-motion support.

Authentication, Gemini, durable history, vector search, approved memory, feedback review, and measured evaluation remain future work. Session conversations do not demonstrate tenant isolation or long-term learning.

## Follow one request

| File | Responsibility |
| --- | --- |
| `apps/web/src/App.tsx` | Composes the application from the chat feature. |
| `apps/web/src/features/chat/ChatWorkspace.tsx` and `components/` | Chat layout, composer, messages, history drawer, and keyboard focus. |
| `apps/web/src/features/chat/useChat.ts` and `model.ts` | Session conversations, turns, cancellation, retries, and active-request identity. |
| `apps/web/src/features/chat/api.ts` | HTTP transport, combined abort/timeout signals, response validation, and safe error messages. |
| `apps/web/src/components/Orb.tsx` | Decorative local WebGL animation, static fallback, and reduced-motion behavior. |
| `packages/shared/src/api.ts` / `demo-chat.ts` | Shared API envelopes, demo request/response types, and runtime validation; exported through `index.ts`. |
| `apps/api/src/index.ts` / `app.ts` | Worker entry point, request dispatch, method checks, and HTTP errors. |
| `apps/api/src/http.ts` / `config.ts` | Bounded JSON reading, CORS, response headers, and configuration. |
| `apps/api/src/routes.ts` | Health response and validated mock-chat orchestration. |
| `apps/api/src/providers/provider.ts` / `mock.ts` | Provider interface and deterministic scripted replies. |

```text
Composer → conversation state → typed API client → Worker route
                                                    ↓
                                                validation
                                                    ↓
                                               mock provider
                                                    ↓
Conversation state ← response validation ← JSON response
```

1. The composer accepts plain text. Empty messages are not sent, and the application enforces a 4,000-character message limit.
2. Sending creates a conversation turn and a UUID `clientRequestId`. The interface enters a sending state and offers **Stop response**.
3. The API client POSTs `{ clientRequestId, content }` to `/api/v1/demo/chat`, using the server's default normal-reply scenario. An `AbortController` connects the user-facing stop action to the fetch.
4. The Worker checks the configured browser origin, route/method, demo flag, content type, byte limit, and JSON shape before invoking a provider. It rejects client-selected identity or privileged fields.
5. The mock provider returns deterministic text. A provider interface keeps HTTP handling separate from response generation; a later Gemini implementation can reuse the boundary, but must sit behind authenticated production routes.
6. The client validates the response and checks that it still belongs to the active request before inserting the assistant message. Failure and cancellation produce explicit states rather than a successful blank answer.

The request ID returned in the response envelope is a server-side HTTP correlation ID. The client request ID identifies the turn being retried. They have different jobs. Neither means the demo has a database-backed request ledger. The [module boundaries](architecture.md#current-module-boundaries) show which layer owns each decision and which imports are allowed.

## Request states and retry

| State | What the user sees | Allowed next action |
| --- | --- | --- |
| Idle | Composer ready; previous completed messages visible. | Send a message or choose a suggestion. |
| Sending | Activity indicator and stop control. | Stop, or change conversation; both cancel the pending request. |
| Completed | Assistant response in the existing turn. | Send another message. |
| Failed | Clear failure message and retry control. | Retry the same turn or start another conversation. |
| Cancelled | Stopped state; no fabricated response. | Retry the same turn or move on. |

Retry preserves the user's message and `clientRequestId` and attempts another normal reply. A new assistant message is inserted only after a valid successful response. The interface contains no testing-mode selector; automated tests override outgoing requests to exercise simulated failure and delay, then remove the override to verify recovery.

Aborting a browser fetch is only part of cancellation. Requests can finish near the moment a user stops or changes conversation. The frontend also checks the active request identity, so an older response cannot overwrite a newer turn or appear in another conversation. A future live provider may already have accepted work when cancellation happens; Step 3 must account for uncertain upstream outcomes and consumed quota.

The Worker passes `request.signal` to the mock provider so an observed disconnect can cancel its timer. Wrangler explicitly enables `enable_request_signal` for the pinned compatibility date. A local proxy can affect disconnect propagation, so the UI never relies only on the server noticing the abort. The browser's active-request guard remains necessary.

## Why conversations are temporary

The conversation list is held in React state. Each conversation owns its turns; switching between them changes the selected conversation, and refreshing the page clears the entire session. There is no chat persistence in `localStorage`, cookies, or Supabase.

This keeps the milestone honest and avoids introducing an unauthenticated shared database. Persistent history needs verified identity, ownership constraints, and deletion behavior. Those requirements already appear in the production design and will be implemented before storing real user conversations.

## Why the endpoint says demo

`/api/v1/demo/chat` is explicitly gated by `DEMO_ENABLED="true"` and only calls the deterministic mock provider. The committed configuration disables it; `npm run dev:api` explicitly enables it for local development. It does not accept arbitrary transcripts or offer a switch to a live model. Its lack of authentication is appropriate only for this non-persistent mock behavior.

The later `/conversations/:id/messages` API will need verified Supabase identity, database ownership checks, durable idempotency and usage reservations, provider deadlines, and persistence. Replacing a single configuration string must never silently expose an unauthenticated Gemini proxy.

## How the UI supports the flow

The slim navigation rail contains new-chat and conversation-history actions. The welcome screen keeps the orb, a heading, three compact starter prompts, and the composer. The history drawer has explicit open/close controls. A single footer identifies demo replies and temporary chats. Enter sends a message, while Shift+Enter inserts a line break; composition events are respected so input methods can finish a character before sending. Starter and retry actions move focus to the composer because their buttons disappear when a request starts.

Animation emphasizes changes in state: new messages enter, pending replies show activity, and controls respond to interaction. The decorative orb is generated locally with WebGL rather than downloaded as an asset; a CSS fallback covers unavailable graphics contexts. Reduced-motion preferences make the orb static and disable nonessential movement. Rendering pauses while the document is hidden. Keyboard controls, focus visibility, and readable status text remain available without relying on animation. A persistent polite live region announces completed replies to screen-reader users while focus stays in the composer.

Messages are rendered as text. A message containing HTML is displayed as text rather than interpreted as markup. This boundary must remain explicit if Markdown support is added later.

## Verification and next step

Run `npm run check` for TypeScript, Vitest, and both builds. Unit tests cover request/response validation, Worker HTTP boundaries, and client transport errors; the architecture tests enforce application/shared import direction. Run `npm run test:e2e` for desktop/mobile browser coverage. The browser suite exercises the real local Worker for successful chat and demo error responses, cancellation followed by retry, conversation switching, refresh behavior, keyboard submission and focus recovery, safe text rendering, and reduced-motion layout. Failure and cancellation tests override the outgoing request's `scenario` in Playwright, leaving the normal interface uncluttered. One controlled race test intentionally holds a completed response and ignores abort in the test transport, proving that the active-request guard rejects late results after a conversation switch. Existing successful-chat and reduced-motion tests also save screenshots for visual inspection. CI preserves browser failure reports, traces, and screenshots for seven days. Live model responses are not used in CI.

The next milestone introduces real Gemini generation and cloud deployment. Before that launch, resolve the provider's audience/cost constraints and implement minimal authentication, ownership checks, and durable request budgets. This demo remains useful as a deterministic test fixture after a real provider is added.
