# Database design

**Status: Step 1 design; none of these tables, policies, or functions is deployed or implemented.** This document is the contract for later Supabase migrations. Do not interpret the scaffold as providing database security yet.

Use Supabase PostgreSQL as the system of record. PostgreSQL stores conversation history, feedback, approved memory, and evaluation records together; pgvector adds semantic retrieval without another database. Supabase Auth owns identity in `auth.users`: do not create a second password or identity table.

## Conventions and invariants

- IDs are `uuid` with server-generated defaults; timestamps are `timestamptz` in UTC. Required fields are non-null unless marked `?`.
- Every tenant table has `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`. `user_id` is immutable and originates from a **verified** token, never the request body.
- Tenant parent tables expose `UNIQUE(id, user_id)`. Children reference both columns, not only a parent UUID. Owning a child must never allow linking another user's parent.
- All public tables enable RLS. Ownership policies use `user_id = (SELECT auth.uid())`. Future insert/update policies require the same `WITH CHECK` condition; RLS alone does not protect trusted status or role columns.
- Apply bounded lengths and enum/check constraints in both request validation and SQL. Suggested starting limits: user message 4,000 characters, correction 4,000, memory 2,000, title 120. Token budgets are enforced separately.
- PostgreSQL grants and RLS are separate controls. Schema migrations must include both and explicit function `EXECUTE` grants.

## Public tenant tables

These tables are readable only by their owner. All application writes initially go through Worker-controlled RPCs; users do not receive direct table write grants.

| Table | Columns and constraints | Indexes and relationships |
| --- | --- | --- |
| `conversations` | `id uuid PK`, `user_id uuid`, `title text`, `created_at timestamptz`, `updated_at timestamptz` | `UNIQUE(id,user_id)`; `(user_id,updated_at DESC,id)` for cursor pagination. |
| `messages` | `id uuid PK`, `user_id uuid`, `conversation_id uuid`, `sequence bigint`, `role text CHECK IN ('user','assistant')`, `content text`, `generation_status text CHECK IN ('pending','completed','failed')`, `request_id uuid`, `model_id text?`, `prompt_version text?`, `input_tokens integer?`, `output_tokens integer?`, `latency_ms integer?`, `error_code text?`, `created_at timestamptz`, `completed_at timestamptz?` | `UNIQUE(id,user_id)`; `(conversation_id,user_id) REFERENCES conversations(id,user_id) ON DELETE CASCADE`; `UNIQUE(conversation_id,sequence)`; `UNIQUE(user_id,request_id,role)`; `(user_id,conversation_id,sequence)`. Require nonnegative usage/latency. User messages are completed; only the Worker creates assistant rows. |
| `feedback` | `id uuid PK`, `user_id uuid`, `message_id uuid`, `rating smallint? CHECK IN (-1,1)`, `correction_text text?`, `correction_kind text? CHECK IN ('preference','factual')`, `source_url text?`, `status text CHECK IN ('submitted','needs_review','approved','rejected','withdrawn','revoked')`, `validation_version text?`, `decision_reason_code text?`, `reviewed_at timestamptz?`, `created_at timestamptz`, `updated_at timestamptz` | `UNIQUE(id,user_id)`; `(message_id,user_id) REFERENCES messages(id,user_id) ON DELETE CASCADE`; `(user_id,created_at DESC,id)`; `(user_id,status,created_at)`. Require rating or correction text. RPC verifies the referenced message is a completed assistant message. Rating-only feedback does not create memory. |
| `memories` | `id uuid PK`, `user_id uuid`, `feedback_id uuid`, `source_message_id uuid`, `content text`, `kind text CHECK IN ('preference','factual')`, `state text CHECK IN ('pending_embedding','active','revoked')`, `revision integer`, `content_hash text`, `embedding_model text`, `embedding_version text`, `embedding_dimensions integer`, `embedding vector(768)?`, `activated_at timestamptz?`, `revoked_at timestamptz?`, `created_at timestamptz`, `updated_at timestamptz` | `UNIQUE(id,user_id)`; composite FKs to `feedback(id,user_id)` and `messages(id,user_id)`, both `ON DELETE CASCADE`; `UNIQUE(user_id,feedback_id,revision)`; `(user_id,state,updated_at DESC)`; `CHECK(embedding_dimensions = 768)`; active state requires a non-null embedding and activation timestamp. |
| `memory_usage` | `id uuid PK`, `user_id uuid`, `assistant_message_id uuid`, `memory_id uuid`, `memory_revision integer`, `rank smallint`, `similarity real`, `created_at timestamptz` | Composite FKs to `messages(id,user_id)` and `memories(id,user_id)`, both `ON DELETE CASCADE`; `UNIQUE(assistant_message_id,memory_id)`; `(user_id,assistant_message_id)`. This records provenance without copying the memory text. |

`vector(768)` is a provisional storage contract, not a claim that every embedding provider defaults to 768 dimensions. Before the memory migration, choose a Gemini embedding model that supports the configured output dimension, use the same model/settings for queries and stored content, and verify vector length and normalization requirements. If that choice changes, migrate the column/index and re-embed; never compare different embedding spaces. Store these settings with each row. [Gemini embeddings documentation](https://ai.google.dev/gemini-api/docs/embeddings)

Start with exact cosine search over the owner's active memories. Small tenant collections do not need an approximate index. After measuring query latency and recall, add an HNSW `vector_cosine_ops` index and validate filtered recall; an approximate index is not an ownership control. [Supabase vector indexes](https://supabase.com/docs/guides/ai/vector-indexes)

Optional future `user_preferences` stores application settings only: `user_id uuid PK REFERENCES auth.users(id) ON DELETE CASCADE`, `memory_enabled boolean DEFAULT false`, `created_at`, `updated_at`. Turning memory off stops retrieval and new memory ingestion; an explicit forget action deletes existing memories. Until this table is implemented, memory must stay disabled rather than silently assuming consent.

## Private operational tables

Place these in a `private` schema excluded from the Supabase Data API. Revoke schema access from `anon` and `authenticated`. Enable RLS as an additional defense; expose no end-user policies. Worker routines access only the records required by their operation.

| Table | Fields and purpose | Constraints/indexes |
| --- | --- | --- |
| `request_jobs` | `id uuid PK`, `user_id uuid`, `conversation_id uuid?`, `operation text`, `idempotency_key text`, `request_hash text`, `status text` (`reserved/running/completed/failed/unknown`), `lease_expires_at timestamptz?`, `result_id uuid?`, `attempt_count integer`, `created_at`, `updated_at` | `UNIQUE(user_id,operation,idempotency_key)`; user FK cascades; composite conversation FK cascades. Same key with different hash returns a conflict. Results must be checked against the job's owner before replay. Unknown jobs are not automatically regenerated. |
| `quota_buckets` | `scope text` (`user/global`), `subject text`, `period_start timestamptz`, `request_count integer`, `reserved_tokens bigint`, `used_tokens bigint`, `updated_at` | Composite PK `(scope,subject,period_start)`; nonnegative counters. For user buckets, `subject` is the verified UUID string; for global buckets, a fixed application identifier. Daily and burst periods are separate operations. Remove user buckets during account deletion. |
| `quota_reservations` | `id uuid PK`, `user_id uuid`, `job_id uuid`, `period_start timestamptz`, `maximum_tokens bigint`, `actual_tokens bigint?`, `state text` (`reserved/settled/released/uncertain`), `created_at`, `updated_at` | `UNIQUE(job_id)`; user/job FKs cascade; `(state,created_at)`. An uncertain upstream outcome retains its conservative charge until reconciled. |
| `validation_events` | `id uuid PK`, `user_id uuid`, `feedback_id uuid`, `actor_id uuid?`, `stage text`, `outcome text`, `reason_code text`, `validator_version text`, `created_at` | Composite feedback FK cascades; user FK cascades; actor FK to `auth.users(id) ON DELETE SET NULL`; `(user_id,feedback_id,created_at)`. No raw prompt or correction copies in audit logs. |
| `reviewer_roles` | `user_id uuid PK REFERENCES auth.users(id) ON DELETE CASCADE`, `role text CHECK IN ('factual_reviewer')`, `created_at` | Provisioned by project administration only. Never derive reviewer authority from editable `user_metadata`. |

Use PostgreSQL row locks/atomic updates in one transaction to reserve both the user and global allowance, always locking in the same order. Reject before the Gemini call when either cap is exhausted. Settle once using the reservation ID. Request-count limits remain useful where exact provider token accounting is unavailable. These database limits are separate from approximate Cloudflare burst protection.

## Permission matrix and RPC boundary

| Operation | `anon` | `authenticated` with user JWT | Worker with server credential |
| --- | --- | --- | --- |
| Read conversations/messages/feedback/memory | Denied | Owner rows only through RLS | Ordinary reads still use a separate client with the user's JWT. |
| Insert/update/delete application rows directly | Denied | Denied | Application code uses named RPCs; revoke direct DML where supported by the final migration/grant design. |
| Run semantic retrieval | Denied | `match_my_memories` only; security invoker, owner RLS, active compatible vectors | Calls the same function with the user's JWT. |
| Create messages or change generation state | Denied | Denied | `begin_chat_request` / `complete_chat_request` / `fail_chat_request`. |
| Submit or withdraw feedback | Denied | Denied directly | `submit_feedback` / `withdraw_feedback`, with verified actor and owner checks. |
| Approve factual corrections | Denied | Denied directly | `review_factual_feedback`; verified actor must have a private reviewer role. |
| Confirm a personal preference | Denied | Denied directly | `confirm_preference`; verified actor must equal feedback owner. |
| Activate memory | Denied | Denied | `activate_memory`; checks current approval, content hash/revision, and completed embedding. |
| Forget memory / delete conversation | Denied | Denied directly | `forget_memory` / `delete_conversation`; verified actor must equal owner. |
| Read/change operational budgets or audits | Denied | Denied | Only operation-specific RPCs. |

The browser uses Supabase directly for Auth. The Worker verifies identity and creates two clearly separated clients: a user-JWT client for ordinary reads and a server-credential client for restricted RPCs. User bearer tokens must not accidentally replace the server credential on privileged calls, and server credentials must not be used for ordinary retrieval.

RPCs that must be exposed through PostgREST live in an exposed schema but have `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`; grant it only to `service_role`. Prefer narrow `SECURITY DEFINER` routines with a fixed empty `search_path` and fully qualified object names when table privileges are withheld from the caller. Revoke default public function execution in migrations too. Every privileged routine checks tenant relationships, allowed state transitions, and any reviewer authority itself. Actor IDs are passed only after Worker token verification; the privileged credential is what authorizes this trusted assertion. Do not expose a generic execute-SQL, owner override, or status-update RPC.

**The Supabase server secret is still a privileged credential:** calling narrow RPCs does not inherently restrict everything that the key can do. Verify the actual database grants in integration tests, minimize its use, keep it in Worker secrets, and never ship it in a `VITE_*` variable. A later dedicated database role can further reduce this privilege. Supabase secret/service-role credentials bypass RLS; ordinary user JWT requests remain subject to it. [RLS and bypass behavior](https://supabase.com/docs/guides/database/postgres/row-level-security), [database function security](https://supabase.com/docs/guides/database/functions)

`match_my_memories(query_embedding, embedding_model, embedding_version, limit)` runs as security invoker, caps `limit` (initially five), filters to the caller's `user_id`, `state = active`, and compatible embedding settings, then orders by cosine distance. It accepts no caller-selected user ID. Similarity cutoffs are tuned on evaluation data; do not assume one threshold works for every embedding model. [Permission-aware RAG](https://supabase.com/docs/guides/ai/rag-with-permissions)

## Correction and memory lifecycle

1. **Submission:** write immutable original feedback with `submitted`, plus a validation event. Ignore any client-supplied approval/status/model/owner fields. Feedback must reference the owner's completed assistant answer.
2. **Validation:** enforce size/schema limits; detect empty, duplicate, contradictory, unsafe-to-store, or instruction-like content; record validator version and reason codes. An LLM may assist with classification, but its agreement does not prove a fact. Failed checks produce `rejected`; valid candidates become `needs_review`.
3. **Approval:** the owner explicitly confirms a personal preference. A factual correction requires a designated reviewer checking supplied evidence. Arbitrary source URLs are not automatically fetched by the Worker; any future fetcher needs URL and network restrictions. A normal user cannot approve factual claims by changing a payload field.
4. **Transactional promotion:** lock the feedback row, recheck its current state and authority, set `approved`, and create one `pending_embedding` memory revision in the same transaction. A unique `(user_id,feedback_id,revision)` makes retries safe. Validation events record the decision. No pending memory is retrievable.
5. **Embedding:** outside a database transaction, request the embedding for the approved content. Activation is a second transaction that confirms the feedback remains approved, the memory remains pending, and the revision/content hash still matches; validate dimensions and finite values before setting `active`. If revoked or deleted meanwhile, discard the result. Repeated activation of the same completed revision is a no-op.
6. **Revision/revocation:** edited feedback creates a new validation cycle and revision rather than silently changing approved knowledge. Revoke the previous memory before activating a replacement. Withdrawal or rejection invalidates all derived memories immediately.

The user can confirm a preference such as preferred response length; that does not establish a universal fact. All memory remains scoped to the submitting user. A shared knowledge base is outside the initial design.

## Chat consistency and deletion

`begin_chat_request` atomically checks conversation ownership, reserves budget, creates the user message plus pending assistant row, and records the idempotency job. Assign message sequences while locking the conversation row. Initially allow one active generation per conversation; concurrent requests return a conflict. Finish the transaction **before** calling Gemini. `complete_chat_request` writes the answer, provenance, usage, and terminal state together. A known provider failure produces a failed message/job. If a timeout or expired lease leaves the upstream outcome uncertain, mark the job `unknown` and the message failed with an `UPSTREAM_OUTCOME_UNKNOWN` code; retain the conservative quota reservation. Replaying that idempotency key reports the existing unknown outcome and never silently calls Gemini again. A new attempt requires a new explicit request; a late response cannot overwrite a finalized retry. The request-status API maps `reserved/running` to `pending` and preserves `completed/failed/unknown`.

Deleting a conversation cascades to its messages, feedback, source-linked memories, and memory-usage rows. Deleting one memory also deletes its provenance links; old conversation text remains until the user separately deletes it. Withdrawal revokes the derived memory immediately. A future summarization feature must track source dependencies and invalidate summaries when any source is deleted; unsupported derived data must not be retained anonymously by accident.

Account deletion removes all tenant rows, private evaluation snapshots/results, audit events, jobs, and user quota buckets. Aggregate application counters may remain only without user identifiers/content. Database backups and upstream provider retention are separate from live-row deletion and must be accurately described in the privacy notice; do not promise instant erasure from providers.

## Required verification before use

- Integration tests authenticate as user A and user B and attempt cross-user reads, writes, child-row references, retrieval RPCs, deletion, and evaluation access.
- Call Supabase REST directly with a user's token: attempts to forge an assistant row, approve feedback, activate memory, invoke privileged RPCs, or read the private schema must fail.
- Exercise concurrent quota reservations, duplicate idempotency keys, mismatched retry bodies, approval/withdrawal races, and embedding completion after deletion.
- Inspect grants, RLS flags, and function owners in the actual migrated database. Passing Worker unit tests does not prove database isolation.

These checks are acceptance criteria for implementation, not tests already completed in Step 1.
