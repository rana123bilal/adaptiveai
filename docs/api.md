# AdaptiveAI API design

Status: Step 1. Only the health endpoint is implemented. Every other endpoint, authorization rule, persistence behavior, and limit below is a planned contract, not a functioning service. Unknown routes currently return `404`.

Base path: `/api/v1`. JSON requests and responses use UTF-8. Auth is managed by the Supabase SDK rather than a duplicate `/login` API.

## Implemented endpoint

| Method | Path | Access | Result |
| --- | --- | --- | --- |
| GET, HEAD | `/health` | Public | Worker liveness; no Gemini or database call. |

The health payload is:

```json
{
  "service": "adaptiveai-api",
  "status": "ok",
  "stage": "foundation",
  "dependencies": { "gemini": "not-configured", "supabase": "not-configured" }
}
```

HEAD returns the same status/headers without a body. A successful health check means the Worker can answer HTTP requests; it does not mean AI, authentication, or the database is ready. CORS supports the configured frontend origin.

## Planned endpoint inventory

All routes below require a verified Supabase bearer token except the public synthetic evaluation summary, if explicitly enabled later. IDs are UUIDs. An object outside the caller's scope returns `404` to avoid revealing its existence.

| Method | Path | Purpose / successful response |
| --- | --- | --- |
| GET | `/me` | `200` minimal account/settings view; no tokens or admin metadata. |
| PATCH | `/me/settings` | `200` update memory opt-in and other allowlisted preferences. |
| GET | `/me/export` | `200` bounded export of the caller's records, with cursor for larger exports. |
| DELETE | `/me` | `202` start idempotent account/data deletion; invalidate access and remove derived data. |
| GET | `/conversations` | `200` cursor-paginated conversation summaries. |
| POST | `/conversations` | `201` create an owner-bound conversation. |
| PATCH | `/conversations/:id` | `200` update the conversation title. |
| DELETE | `/conversations/:id` | `204` delete conversation and invalidate/delete derived memories. |
| GET | `/conversations/:id/messages` | `200` cursor-paginated persisted messages and generation states. |
| POST | `/conversations/:id/messages` | `201` persist user message and completed assistant answer; idempotency required. |
| GET | `/requests/:id` | `200` inspect an owned generation request after timeout/disconnection. |
| POST | `/messages/:id/feedback` | `201` submit rating and optional correction for an owned assistant message. |
| GET | `/feedback` | `200` list the caller's submissions and review decisions. |
| POST | `/feedback/:id/confirm-preference` | `200` confirm a personal preference; never factual approval. |
| DELETE | `/feedback/:id` | `204` withdraw feedback and revoke its derived memory. |
| GET | `/memories` | `200` inspect own active/pending memory metadata, text, and provenance. |
| POST | `/memories/search` | `200` retrieve own active memories for bounded query text. |
| DELETE | `/memories/:id` | `204` forget a memory and its embedding. |
| GET | `/evaluations/runs` | `200` list visible evaluation run metadata. |
| GET | `/evaluations/runs/:id` | `200` permitted aggregate results and publishable case details. |
| POST | `/admin/feedback/:id/review` | `200` operator-only factual review; reason/evidence and audit record required. |
| POST | `/admin/evaluations/runs` | `202` operator-only bounded evaluation job; budgeted and idempotent. |

The dashboard does not grant access to other users' conversations. Public evaluation results, if added, are an explicit projection of synthetic/publishable data. Evaluation jobs are initiated by an authenticated operator or controlled CI identity, not any signed-in visitor.

## Request conventions

Send `Authorization: Bearer <access-token>` and `Content-Type: application/json`. Mutating requests that can create work use `Idempotency-Key: <UUID>`. The Worker rejects client-supplied `user_id`, assistant roles, validation status, model overrides, and other unexpected privileged fields. It derives ownership from verified claims.

Initial limits, to be validated against provider quotas before launch:

- JSON body: at most 16 KiB, enforced while reading, not just from `Content-Length`.
- User message: 1–4,000 characters after trimming; correction: at most 4,000; title: 1–120.
- Pagination: `limit` defaults to 20 and has a maximum of 100. Opaque cursor encodes an endpoint's sort boundary: `(updated_at, id)` for conversations, `(created_at, id)` for feedback, and `sequence` for messages. A cursor never grants tenant authority. Concurrent conversation updates may move a summary to the first page; clients de-duplicate by ID.
- Memory retrieval: at most 5 matches; server owns similarity threshold, embedding configuration, and context budget. Return no raw vectors.
- Generation: one active request per conversation initially; output capped and context bounded server-side. Start with a 25-second provider deadline and tune using measured latency.
- Quotas: deployment configuration sets per-user and shared project request/token budgets after checking AI Studio. Do not invent a universal free-tier allowance.

Collection response:

```json
{
  "data": [{ "id": "00000000-0000-4000-8000-000000000001", "title": "Project ideas" }],
  "nextCursor": null
}
```

## Planned chat exchange

```http
POST /api/v1/conversations/:id/messages
Authorization: Bearer <access-token>
Idempotency-Key: <new UUID for this user action>
Content-Type: application/json

{"content":"Which frontend stack did I choose?"}
```

```json
{
  "requestId": "00000000-0000-4000-8000-000000000002",
  "status": "completed",
  "userMessage": { "id": "00000000-0000-4000-8000-000000000003", "role": "user", "content": "Which frontend stack did I choose?" },
  "assistantMessage": { "id": "00000000-0000-4000-8000-000000000004", "role": "assistant", "content": "You chose React, TypeScript, and Tailwind CSS." },
  "memorySources": [{ "id": "00000000-0000-4000-8000-000000000005", "revision": 1 }]
}
```

This is an illustrative contract, not a measured or generated answer. `memorySources` refers only to records the caller may inspect. The browser does not submit an arbitrary full transcript or system prompt; the Worker loads canonical history.

The server scopes idempotency by owner, operation, and key and stores a request payload hash. A completed retry returns the stored result with `200`; a request still running returns `202` with its request ID and `Location` status URL. A changed payload under the same key returns `409`. Initial synchronous completion returns `201`.

The status resource distinguishes `pending`, `completed`, `failed`, and `unknown` provider outcome. Internal jobs in `reserved` or `running` map to public `pending`; terminal states keep their names. A client that loses a response checks status before sending a new generation. A second concurrent action in the same conversation returns `409`. The server must reconcile abandoned reservations; no automatic retry is allowed to create duplicate visible messages or unbounded upstream calls. See [database.md](database.md) for transaction boundaries and request-state storage.

## Planned feedback exchange

```json
{
  "rating": "down",
  "correction": "Cloudflare Pages can serve a static frontend.",
  "kind": "factual",
  "evidence": "https://developers.cloudflare.com/pages/"
}
```

`rating` is `up` or `down`, mapped to database values `1` or `-1`; `kind` is `preference` or `factual` when a correction is supplied. A correction-only submission may omit `rating`. API fields `correction`, `kind`, and `evidence` map to database fields `correction_text`, `correction_kind`, and `source_url`. The response contains a submission ID and review state (`submitted`, `needs_review`, `approved`, `rejected`, `withdrawn`, or `revoked`), never automatic factual approval. Evidence URLs are treated as untrusted text; accepting one does not authorize the Worker to fetch arbitrary internal or private URLs. A factual review checks that the evidence supports the specific claim. A preference confirmation can only confirm the caller's own preference submission.

Embedding happens after approval. Failure to embed leaves the approved revision unavailable for retrieval until a bounded retry succeeds. Editing a correction creates a new submission/revision rather than mutating an active memory in place.

## Errors and transport

Planned error envelope:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "The request allowance has been reached.",
    "requestId": "00000000-0000-4000-8000-000000000002"
  }
}
```

Use `400` for invalid input, `401` for missing/invalid identity, `403` for a denied operator action, `404` for absent/inaccessible resources, `405` for unsupported methods, `409` for idempotency/state conflict, `413` for oversized bodies, `415` for unsupported content type, `429` for quota exhaustion, `502` for upstream failure, `503` for an unavailable dependency, and `504` for an upstream deadline. Rate-limit responses include `Retry-After` when a reset time is known. Do not expose SQL, provider response bodies, stack traces, or credentials.

Private responses use `Cache-Control: no-store`. CORS matches exact configured origins and permits only needed methods/headers; arbitrary preview subdomains are not implicitly trusted. Bearer tokens, not browser origin checks, authorize requests. HTTPS is mandatory outside local development. Provider failures and blocked responses have explicit user-visible states; the API never manufactures a successful answer.
