# Evaluation design

**Status: Step 1 design only. No model evaluation has run, and no improvement score exists yet.** The eventual dashboard must show an empty state until it can load actual recorded runs. Synthetic fixtures may demonstrate the layout only when visibly labeled as fixtures.

AdaptiveAI improves retrieval and use of approved memory. Evaluation should test that specific capability without implying that Gemini's model weights were trained or that every feedback submission improves quality.

## Comparison protocol

1. Create a versioned synthetic dataset before tuning retrieval. Include fictional personal preferences, source-supported fictional project facts, questions with no relevant memory, conflicting/outdated facts, and adversarial instruction-like memories.
2. Split examples into development and held-out test sets by fact/topic family, not only by wording. Paraphrases of the same example belong in the same split. Keep correction examples separate from held-out questions.
3. Freeze a memory snapshot containing only information approved before the evaluation cutoff. Record snapshot hash, memory revisions, embedding model/version/dimensions, dataset version, prompt version, code commit, generation model, and generation settings.
4. For each test case, run a paired baseline and adapted response. Both arms receive the same question, conversation context, model, generation settings, and answer prompt. Baseline receives no long-term memory; adapted receives retrieved memory from the frozen snapshot. This isolates the memory contribution.
5. Randomize arm order and repeat runs when quota permits to estimate model variability. Record every attempted case, including timeouts and failures. Never silently drop difficult cases or compare different completed subsets.
6. Score against a predeclared rubric and expected evidence. Use deterministic checks where meaningful and blind human review for answer quality. An LLM judge can assist, but record its model/prompt and audit a sample; the generating model grading itself is not an independent truth oracle.
7. Publish actual paired results and configuration. Report unchanged or worse outcomes as clearly as improvements. A model alias can change upstream; capture the requested ID and any returned version metadata and describe reproducibility limits.

Prevent test labels and reference answers from entering prompts or memory. Legitimate source facts may exist in a memory snapshot—that is what retrieval is meant to use—but copying the held-out question and its target answer into memory would invalidate the comparison. Freeze the final test set; use separate development results for threshold and prompt tuning.

## Proposed storage

Keep evaluation tables in the **private** schema, excluded from the Data API, with no `anon`/`authenticated` grants. Worker read RPCs return only an authorized user's own evaluation data; the public portfolio dashboard uses explicitly approved synthetic results. Enable RLS with no end-user policies as an additional defense. Every tenant-owned row has `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`, and every parent referenced by tenant children has `UNIQUE(id,user_id)`.

| Table | Fields | Constraints and indexes |
| --- | --- | --- |
| `eval_datasets` | `id uuid PK`, `user_id uuid`, `name text`, `version text`, `content_hash text`, `synthetic boolean`, `created_at timestamptz` | `UNIQUE(id,user_id)`; `UNIQUE(user_id,name,version)`. Immutable once a run starts. |
| `eval_cases` | `id uuid PK`, `user_id uuid`, `dataset_id uuid`, `case_key text`, `split text` (`development/test`), `topic_group text`, `question text`, `conversation_context jsonb`, `reference_answer text?`, `rubric jsonb`, `expected_memory_keys text[]`, `category text`, `created_at timestamptz` | Composite `(dataset_id,user_id)` FK to datasets, cascading delete; `UNIQUE(id,user_id)`; `UNIQUE(dataset_id,case_key)`; `(user_id,dataset_id,split)`. Use stable source keys rather than live-memory UUIDs in fixtures. |
| `eval_snapshots` | `id uuid PK`, `user_id uuid`, `snapshot_hash text`, `approved_before timestamptz`, `embedding_model text`, `embedding_version text`, `embedding_dimensions integer`, `created_at timestamptz` | `UNIQUE(id,user_id)`; `(user_id,created_at DESC)`. Snapshot metadata immutable after capture. |
| `eval_snapshot_memories` | `id uuid PK`, `user_id uuid`, `snapshot_id uuid`, `source_memory_id uuid?`, `source_key text`, `revision integer`, `content text`, `content_hash text`, `embedding vector(768)`, `source_approved_at timestamptz` | Composite `(snapshot_id,user_id)` FK cascading delete; composite `(source_memory_id,user_id)` FK to live memories when applicable, cascading delete; `UNIQUE(snapshot_id,source_key)`. Synthetic snapshots may have no live source. Capture one consistent database snapshot, not rows fetched at different times. |
| `eval_runs` | `id uuid PK`, `user_id uuid`, `dataset_id uuid`, `snapshot_id uuid`, `status text` (`queued/running/completed/failed/invalidated`), `code_commit text`, `prompt_version text`, `model_id text`, `provider_model_version text?`, `generation_settings jsonb`, `retrieval_settings jsonb`, `judge_config jsonb?`, `started_at timestamptz?`, `finished_at timestamptz?`, `expected_case_count integer`, `completed_pair_count integer`, `failure_count integer` | `UNIQUE(id,user_id)`; composite dataset/snapshot FKs cascading delete; `(user_id,started_at DESC,id)`. Settings include context/token caps, top-k, and similarity threshold. |
| `eval_results` | `id uuid PK`, `user_id uuid`, `run_id uuid`, `case_id uuid`, `arm text` (`baseline/memory`), `repetition smallint`, `status text` (`completed/failed`), `answer text?`, `retrieved_source_keys text[]`, `retrieved_scores real[]`, `task_score real?`, `grounded_score real?`, `preference_score real?`, `retrieval_latency_ms integer?`, `generation_latency_ms integer?`, `total_latency_ms integer?`, `input_tokens integer?`, `output_tokens integer?`, `grader_reason text?`, `error_code text?`, `created_at timestamptz` | Composite run/case FKs cascading delete; `UNIQUE(run_id,case_id,arm,repetition)`; `(user_id,run_id,case_id)`. Scores constrained to `[0,1]`; failed cases retain null quality scores, never fabricated zero-token usage. RPC verifies each case belongs to the run's dataset and selected split. |

Publishing results is a separate allowlisted operation, not a user-writable `is_public` flag. Export only synthetic cases, approved display content, and aggregate metrics; omit account IDs and private memory. Authentication is required for user-specific dashboards. Reference answers and rubrics are available to evaluation scoring, not ordinary generation/retrieval endpoints.

Snapshot immutability has a privacy exception: if a live source is deleted, delete its copied snapshot content and invalidate affected runs before they can be reported as reproducible. Delete affected outputs that may repeat that source. Account deletion removes snapshots and results too. Prefer synthetic evaluation from the start to avoid preserving private content for research convenience.

## Metrics and dashboard interpretation

| Metric | Definition | Interpretation |
| --- | --- | --- |
| Task success | Cases satisfying the predeclared task rubric / attempted cases; also show completed-case quality separately. | Primary paired baseline-versus-memory comparison. Failures count as unsuccessful attempts. |
| Paired improvement | Mean of each case's `memory score − baseline score` over complete pairs, with complete-pair coverage and sample size shown. | Report percentage points for percentage scores; do not confuse this with relative percent improvement. |
| Preference adherence | Eligible preference cases obeying the stored preference / attempted eligible cases. | Tests long-term personalization; not universal factual accuracy. |
| Retrieval recall@k | Relevant expected memories retrieved / relevant expected memories available, averaged over cases with expected memories. | Show `N/A` for cases without relevant memory instead of dividing by zero. |
| Retrieval precision@k | Relevant memories retrieved / all memories retrieved. | Report no-result cases separately; do not assign perfect precision to empty retrieval. |
| Unsupported-claim rate | Reviewed answers containing unsupported material / reviewed answers. | Requires a clear evidence rubric and blind review; lower is better. |
| Irrelevant-memory use | No-memory-needed cases where retrieved context causes an irrelevant or wrong assertion / such attempted cases. | Detects harm introduced by retrieval. |
| Latency | p50/p95 total request time, with retrieval and generation components. | Include sample counts; small-sample p95 is unstable. |
| Usage and reliability | Input/output tokens, attempted/completed/failed cases, timeout and quota failures. | Token counts are usage measurements, not invented dollar savings. |

Use at least a small, explicitly reported set of diverse cases for the first experiment, then increase coverage as quota permits. Do not set an arbitrary sample size as proof of reliability. For repeated comparisons, report uncertainty (for example, a paired bootstrap interval) and disclose the method; treat a small improvement on a small sample as inconclusive.

The initial dashboard should show run ID/date, dataset and snapshot versions, model/prompt configuration, sample and failure counts, paired quality metrics, retrieval metrics, latency/usage, and inspectable synthetic before/after examples. Label comparison arms plainly: **without long-term memory** and **with approved memory**. Feedback volume and number of stored memories are activity metrics, not evidence of improvement.

## Execution and acceptance criteria

- Run evaluation on demand through a restricted maintainer workflow or CLI first. A public dashboard must not allow visitors to trigger unbounded Gemini workloads.
- Use separate evaluation quota reservations, concurrency limits, and resumable case jobs. Never use real production users' memories in public fixtures.
- Unit-test metric calculations against hand-calculated examples, including empty samples, missing pairs, failures, and zero relevant memories.
- Integration-test snapshot ownership, cross-tenant denial, source-deletion invalidation, and run/case dataset consistency.
- CI runs deterministic tests and mocked-provider evaluation fixtures. Live Gemini evaluations are explicitly triggered and record real provider outputs; they should not make every pull request depend on a free-tier external service.
- Before making an improvement claim, retain an auditable run with both comparison arms, frozen inputs, scoring rules, sample size, and failures. No such claim is made by the Step 1 scaffold.
