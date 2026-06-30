# Plan: Planner Keyword-Routing Hints (bilingual UK/EN)

## Task Description

The Planner currently classifies user messages into `legal` / `procurement_general` / `technical_system` subtasks using only the LLM and the Langfuse system prompt. The user has curated a bilingual dictionary of official and slang terms per agent at `data/agent_routing_dictionaries_uk_en.json` (~1100 phrases, 3 agents × {`official_uk`, `official_en`, `slang_uk`, `slang_en`}). The dictionary's own metadata says: *"Use as lexical signals for Planner classification. A single ambiguous term such as tender/тендер should not be enough; combine with verbs, entities, and source hints."*

The task is to wire this dictionary into the Planner as a **deterministic pre-scoring step** whose result is injected into the system prompt as a *hint* (not a directive). The LLM keeps final authority over decomposition, but it now gets explicit lexical evidence to weight against semantic interpretation. The change must be ablation-friendly (a single env toggle) and observable (signals stored on `ResearchPlan` for Langfuse traces).

## Objective

After this change:

1. Every Planner invocation scores the user query against the keyword dictionary and produces `{raw_scores, normalized_scores, top_matches}` per topic.
2. When at least one phrase matches, a compact signals block is injected into the Planner system prompt (≤ ~200 tokens).
3. The signals are persisted on the returned `ResearchPlan` for downstream tracing.
4. A single env flag (`PLANNER_KEYWORD_ROUTING_ENABLED`) turns the feature off for ablation, restoring the current LLM-only behavior bit-for-bit.
5. Routing accuracy on `tests/golden_dataset.json` is unchanged or improved; off-topic gate behavior is unchanged.

## Problem Statement

Pure-LLM topic classification has two recurring failure modes the dictionary directly addresses:

- **Ambiguous procurement jargon** ("тендер", "закупівля", "оскарження") leans the LLM toward whichever topic is most prominent in training data — often `legal` — even when the user's intent is technical or general. The dictionary distinguishes the same surface form across topics by surrounding context, but the LLM does not see this dictionary today.
- **Bilingual mixed queries** — Ukrainian users frequently mix English ("tender", "API", "Prozorro DOC") inside Ukrainian sentences. The Planner prompt is in Ukrainian; English signals get under-weighted.

The dictionary already encodes both languages and both registers (official + slang). We just need to expose it as a signal — without giving up the LLM's strength at multi-topic decomposition, off-topic detection, and escalation gating.

## Solution Approach

A pure-Python scorer module computes per-topic lexical signals **before** the LLM call. The signals are formatted into a short multi-line block and inserted into the Planner system prompt via a new `__KEYWORD_SIGNALS__` placeholder (same pattern as the existing `__PLANNER_MAX_SUBTASKS__` substitution at `agents/planner.py:12-20`). When no phrase matches, the block is empty and behavior is identical to today's prompt.

The scorer:

1. Loads `data/agent_routing_dictionaries_uk_en.json` once at module import (cached).
2. Case-folds the user query (works for Cyrillic + Latin via `str.lower()`).
3. For each `(agent, tier, phrase)` triple where `tier ∈ {official_uk, official_en, slang_uk, slang_en}`:
   - Tests `phrase.lower() in query.lower()` (substring match, multi-word phrases are robust).
   - Adds weight to the topic: `official_*` → `1.0`, `slang_*` → `0.7` (configurable).
4. Deduplicates by removing matched character spans before evaluating shorter phrases, so `"тендерна документація"` does not double-count `"тендер"`. Phrases are scanned longest-first per topic.
5. Returns:
   - `raw_scores: dict[topic, float]` — weighted match sum
   - `normalized_scores: dict[topic, float]` — share of total weighted matches (0.0 when no matches)
   - `top_matches: dict[topic, list[str]]` — up to `PLANNER_KEYWORD_TOP_MATCHES` matched phrases per topic (in original casing)

The prompt block is human-readable, e.g.:

```
Лексичні сигнали з користувацького запиту (підказка, не директива):
- legal: 67% (матчі: «стаття 17», «Закон 922», «оскарження»)
- technical_system: 33% (матчі: «КЕП», «помилка 500»)
- procurement_general: 0%
```

The signals are also attached to the returned `ResearchPlan` via a new optional field `keyword_signals` for Langfuse traces and future Critic / eval use.

### Architecture Decisions

- **Affected graph nodes**: Only `planner_node` changes. No supervisor wiring change, no other agent change.
- **Schemas**: Extend `ResearchPlan` with an optional `keyword_signals: dict[str, float] = Field(default_factory=dict)` (per-topic *normalized* scores). Optional with default — backward compatible. Do not add `top_matches` to the schema (it's prompt-only, not inter-agent).
- **RAG collection(s)**: None. Pure planner-side change, no vector store touch.
- **External calls**: None added. The scorer is offline, file-local. LLM call count per Planner invocation is unchanged (still 1).
- **Sessions / persistence**: No checkpoint format change. The new `keyword_signals` field is part of `GraphState.plan` and serializes through `PostgresSaver` as part of the existing `ResearchPlan` blob.
- **Prompt source**: Update the `procurement-planner` prompt in Langfuse to include a `__KEYWORD_SIGNALS__` placeholder + a one-paragraph instruction telling the LLM the signals are *hints, not directives*, and that semantic interpretation overrides lexical match when they conflict. Mirror the Langfuse change in `prompts/procurement-planner.md` (backup copy — create the file if `prompts/` does not exist yet; CLAUDE.md notes the backup directory is expected).
- **Defense-in-depth preserved**: The Planner gate (`is_on_topic`), per-agent system prompts, and Critic Structure dimension are untouched. Keyword signals strengthen layer 1 only.
- **Library-first**: No new dependency. `json` (stdlib), `re` only if regex word-boundaries are added later (not in v1). Aho-Corasick / `pyahocorasick` is *not* introduced — substring scan over ~1100 phrases is sub-millisecond and the planner is already LLM-bound.

## Relevant Files

Use these files to complete the task:

- `data/agent_routing_dictionaries_uk_en.json` — source-of-truth keyword dictionary. Read-only. Top-level keys: `metadata`, `agents.{lawyer_agent, common_support_agent, technical_support_agent}`. Each agent has `topic`, `official_uk/en`, `slang_uk/en`.
- `agents/planner.py:1-42` — Planner agent. `invoke_planner(query)` (line 33) is the integration point. `_load_system_prompt()` (line 15-20) must accept and substitute the keyword block. `_normalize_plan()` (line 23-30) is unaffected.
- `schemas.py:45-62` — `ResearchPlan`. Add optional `keyword_signals` field. Keep `validate_consistency` working — the new field is independent of `is_on_topic` / `needs_human` / `subtasks` invariants.
- `config.py:25-101, 103-138` — `Settings`. Add 5 new fields next to `planner_max_subtasks` (line 96). Follow the existing CSV-parser pattern (`_split_csv`) only if a list field is needed; here all new fields are scalars.
- `observability/langfuse_client.py:35-56` — `load_prompt(name, label, **kwargs)`. No code change here; the `__KEYWORD_SIGNALS__` substitution is done in `agents/planner.py` *after* `load_prompt` returns (same pattern as `__PLANNER_MAX_SUBTASKS__`), so Langfuse Mustache compilation is sidestepped.
- `tests/test_planner.py:74-280` — Existing planner unit tests. `test_load_system_prompt_uses_runtime_max_subtasks` (line 240) and all `test_planner_*_classification` tests will need additions or updates. None should regress.
- `tests/conftest.py:14-200` — Existing fixtures. Reuse `mock_research_plan_*` fixtures and add a `mock_keyword_signals` fixture.
- `tests/golden_dataset.json` — 15 records covering all topic combinations. Used for the (non-gating) routing-accuracy comparison in the PR description.
- `.env.example:66` — `PLANNER_MAX_SUBTASKS` neighborhood. New keys go here.
- `docs/ARCHITECTURE.md` — § 11 (Settings) and § Planner section need a one-paragraph note about the new pre-scoring step.
- `docs/DELIVERY_CHECKLIST.md` — append a checklist item under the appropriate phase ("Planner improvements" or post-Phase-2 polish).

### New Files

- `agents/keyword_router.py` — Pure scorer module. ~80 LOC. Exposes:
  - `KeywordSignals` dataclass / TypedDict with `raw_scores`, `normalized_scores`, `top_matches`.
  - `score_query(query: str) -> KeywordSignals`.
  - `format_signals_block(signals: KeywordSignals, top_n: int) -> str` — returns "" when no matches.
  - `_load_dictionaries()` — module-level cached load of the JSON file (uses `settings.routing_dictionaries_path`).
- `tests/test_keyword_router.py` — Unit tests for the scorer (see Testing Strategy).
- `prompts/procurement-planner.md` *(if `prompts/` directory does not yet exist, create it)* — backup copy of the updated Langfuse prompt with the new placeholder + instruction.

## Implementation Phases

- [ ] **Phase 1: Foundation (scorer module + schema + config)** — Pure code, no graph changes. Lands behind a default-true toggle but with the planner still ignoring its output until Phase 2.
  - Status:
  - Comments:

- [ ] **Phase 2: Planner integration** — `invoke_planner` calls `score_query`, formats the block, substitutes the placeholder, and persists signals on the returned plan. Update the Langfuse prompt + backup file.
  - Status:
  - Comments:

- [ ] **Phase 3: Tests, docs, ablation evidence** — New unit tests, expanded planner tests, ARCHITECTURE / DELIVERY_CHECKLIST notes, before/after golden-dataset routing-accuracy numbers for the PR description.
  - Status:
  - Comments:

## Step by Step Tasks

### 1. Schemas

- [ ] **Add `keyword_signals` field to `ResearchPlan`** — In `schemas.py` after line 52, add `keyword_signals: dict[str, float] = Field(default_factory=dict)`. Update the docstring of `ResearchPlan` (if any) to note the field is populated by the Planner pre-scorer and may be empty. Confirm `validate_consistency` does not need to inspect this field.
  - Status:
  - Comments:

### 2. Config

- [ ] **Add 5 settings + 1 env block to `config.py` and `.env.example`** — Place after `planner_max_subtasks` (line 96):
  ```python
  routing_dictionaries_path: str = "data/agent_routing_dictionaries_uk_en.json"
  planner_keyword_routing_enabled: bool = True
  planner_keyword_official_weight: float = 1.0
  planner_keyword_slang_weight: float = 0.7
  planner_keyword_top_matches: int = 3
  ```
  Mirror keys in `.env.example` with one comment line describing the toggle and the weights. No `SecretStr` (no secrets), no `field_validator` (all scalars).
  - Status:
  - Comments:

### 3. Scorer module

- [ ] **Create `agents/keyword_router.py`** — Implement:
  - Module-level lazy cache: `_DICTIONARIES: dict | None = None`. `_load_dictionaries()` reads `settings.routing_dictionaries_path`, validates that `agents` has the three expected agent keys mapped to the three known topics, raises a clear `RuntimeError` with the path if the file is missing or the schema is wrong.
  - `KeywordSignals` TypedDict with `raw_scores`, `normalized_scores`, `top_matches`.
  - `score_query(query: str) -> KeywordSignals` — returns all-zero / empty-list signals when `settings.planner_keyword_routing_enabled is False`, when `query` is empty / whitespace, or when no phrase matches. Implements the longest-first match-and-consume dedup described in Solution Approach.
  - `format_signals_block(signals: KeywordSignals, top_n: int) -> str` — returns `""` when every `raw_score` is `0.0`. Otherwise renders the Ukrainian header + sorted-descending topic lines as shown in Solution Approach. Percentage rounded to nearest int.
  - No I/O beyond the one-time JSON load. No logging at INFO; one DEBUG line per call summarising winners is fine.
  - Status:
  - Comments:

### 4. Planner integration

- [ ] **Refactor `_load_system_prompt` in `agents/planner.py`** — Change the signature to `_load_system_prompt(signals_block: str = "") -> str`. After `load_prompt(name="procurement-planner")` returns, perform two replacements: `__PLANNER_MAX_SUBTASKS__` (existing) and `__KEYWORD_SIGNALS__` (new — substituted even if `signals_block == ""`, in which case the placeholder collapses to empty string and the surrounding prompt structure remains valid).
  - Status:
  - Comments:

- [ ] **Wire scorer into `invoke_planner`** — In `agents/planner.py`:
  ```python
  signals = keyword_router.score_query(query)
  block = keyword_router.format_signals_block(signals, settings.planner_keyword_top_matches)
  llm = get_llm().with_structured_output(ResearchPlan)
  plan = llm.invoke([SystemMessage(content=_load_system_prompt(block)), HumanMessage(content=query)])
  plan = _normalize_plan(plan)
  return plan.model_copy(update={"keyword_signals": signals["normalized_scores"]})
  ```
  Add the import for the new module. Keep ordering: score → load prompt → invoke → normalize → attach signals. Signals are attached *after* `_normalize_plan` so the field survives the optional `subtasks` truncation.
  - Status:
  - Comments:

### 5. Langfuse prompt update

- [ ] **Update the `procurement-planner` Langfuse prompt (production label)** — Add a section near the top:
  > `__KEYWORD_SIGNALS__`
  >
  > Якщо блок вище присутній, це лише *лексична підказка*. Якщо лексика і семантика конфліктують — пріоритет за семантикою. Сигнали не повинні переважати правила `is_on_topic` чи `needs_human`.
  
  Verify the change in Langfuse UI before promoting the new label. The placeholder substitution is performed in Python, so Langfuse Mustache compilation is unaffected.
  - Status:
  - Comments:

- [ ] **Create / update `prompts/procurement-planner.md`** — Mirror the new Langfuse text exactly. If the `prompts/` directory does not yet exist, create it. Add a one-line header comment noting that the runtime source is Langfuse and this is a backup checked into git per `CLAUDE.md`.
  - Status:
  - Comments:

### 6. Tests

- [ ] **Create `tests/test_keyword_router.py`** — Cover:
  - Single-topic UA query: "Скільки штраф за статтею 164-14 КУпАП?" → `normalized_scores["legal"] == 1.0`, others `0.0`.
  - Single-topic EN query: "How does the open tender procedure work in Prozorro?" → `procurement_general > 0`.
  - Multi-topic mixed query: "Стаття 17 Закону 922 та помилка 500 КЕП" → both `legal > 0` and `technical_system > 0`, `procurement_general == 0`.
  - Off-topic-ish query (no dictionary phrase matches): "Який холодильник купити?" → all zeros, `format_signals_block` returns `""`.
  - Empty / whitespace query → all zeros, block is `""`, no crash.
  - Toggle off: `settings.planner_keyword_routing_enabled = False` (use monkeypatch) → all zeros even when phrases would match.
  - Longest-first dedup: query "тендерна документація" with both `"тендер"` and `"тендерна документація"` in the lawyer dictionary → only one match counted (`raw_scores["legal"]` equals the official weight, not double).
  - Slang weight: build a fixture query that matches one official + one slang phrase under a single topic → assert sum equals `official_weight + slang_weight`.
  - JSON missing: monkeypatch `settings.routing_dictionaries_path` to a non-existent path, force cache reset, call `score_query` → `RuntimeError` with the path in the message.
  - Status:
  - Comments:

- [ ] **Extend `tests/test_planner.py`** —
  - Update `test_load_system_prompt_uses_runtime_max_subtasks` (line 240) to call `_load_system_prompt("")` and still assert the `PLANNER_MAX_SUBTASKS` substitution; add a sibling test `test_load_system_prompt_substitutes_keyword_signals` that asserts the `__KEYWORD_SIGNALS__` placeholder is replaced.
  - Add `test_invoke_planner_attaches_keyword_signals` — patches `keyword_router.score_query` to return a known-shape signals dict, patches the LLM to return a valid `ResearchPlan`, asserts the returned plan's `keyword_signals` equals the patched normalized scores.
  - Add `test_invoke_planner_passes_signals_block_to_prompt` — patches `score_query` to return a non-empty match for `legal`, captures the `SystemMessage.content` passed to `llm.invoke` (via a fake LLM that records calls), asserts the formatted block appears verbatim.
  - Add `test_invoke_planner_with_toggle_off_passes_empty_block` — sets `planner_keyword_routing_enabled=False`, asserts no signals block is injected.
  - Status:
  - Comments:

- [ ] **Spot-check golden-dataset routing accuracy** — Add a one-off script (or a `pytest.mark.manual` test) that runs `invoke_planner` over every record in `tests/golden_dataset.json` twice: once with the toggle on, once off. Compare `predicted_topics` against `expected_topics` for each record. The numbers are reported in the PR description (not gated in CI) so the user can see the lift.
  - Status:
  - Comments:

### 7. Docs

- [ ] **Update `docs/ARCHITECTURE.md`** — In the Planner section, add a short paragraph: *"Pre-LLM lexical scoring against `data/agent_routing_dictionaries_uk_en.json` injects a hint block (`__KEYWORD_SIGNALS__`) into the system prompt. Toggleable via `PLANNER_KEYWORD_ROUTING_ENABLED`. Defense-in-depth (Planner gate / agent system prompts / Critic Structure) is unchanged."* Add an ADR row in § 15 noting the decision to keep this as a hint, not a gate.
  - Status:
  - Comments:

- [ ] **Update `docs/DELIVERY_CHECKLIST.md`** — Tick or append a checklist item for "Planner keyword routing hints (bilingual UK/EN)".
  - Status:
  - Comments:

### 8. Validation

- [ ] **Run validation suite** — Execute the commands in the Validation Commands section. All must pass; the deepeval suite should not regress on `test_planner_plan_quality` and `test_planner_off_topic_adherence`.
  - Status:
  - Comments:

## Testing Strategy

- **Unit (`tests/test_keyword_router.py`)** — 9 cases enumerated above. No LLM, no network, no Langfuse. Runs in milliseconds.
- **Integration (`tests/test_planner.py`)** — 4 new cases, all mocking the LLM via a fake that records the `SystemMessage` content. No Langfuse calls in tests: existing planner tests already monkeypatch `_load_system_prompt` or `load_prompt`; reuse that pattern.
- **Golden-dataset accuracy (informational)** — Two-run comparison, reported in the PR description. Acceptance: routing accuracy ≥ baseline. Regressions block merge.
- **DeepEval (existing)** — `test_planner_plan_quality` (test_eval_geval.py:117) and `test_planner_off_topic_adherence` (test_eval_geval.py:163) must continue to pass. The signals block in the prompt should not push the model toward false positives on off-topic queries — verify by including at least one off-topic query in the integration test set.
- **Manual smoke** — `python -c "from supervisor import build_graph; print(build_graph)"` followed by a REPL turn in `python main.py` with a mixed-topic Ukrainian query, verifying the trace in Langfuse shows the signals block.

## Acceptance Criteria

- New module `agents/keyword_router.py` exists with `score_query` and `format_signals_block` and is covered by `tests/test_keyword_router.py`.
- `ResearchPlan.keyword_signals` is populated on every plan returned by `invoke_planner` (empty dict when toggle is off or when no phrases match).
- The Langfuse `procurement-planner` prompt (production label) contains the `__KEYWORD_SIGNALS__` placeholder; the same text is mirrored in `prompts/procurement-planner.md`.
- All five new config fields appear in both `config.py` and `.env.example`.
- `pytest tests/ -q` passes, including the new tests.
- `deepeval test run tests/evaluations/` shows no regression on `test_planner_plan_quality` or `test_planner_off_topic_adherence`.
- `python -c "from supervisor import build_graph; print(build_graph)"` exits 0.
- Toggling `PLANNER_KEYWORD_ROUTING_ENABLED=false` and rerunning the planner returns the *exact same* plan shape as before the change (no signals block in prompt, `keyword_signals == {}`).
- `docs/ARCHITECTURE.md` and `docs/DELIVERY_CHECKLIST.md` updated; ADR row added.

## Validation Commands

Execute these commands to validate the task is complete:

- `python -m py_compile config.py schemas.py supervisor.py final_response.py language.py main.py` — root syntax check
- `python -m compileall -q agents tools ingest retrieval` — package syntax check (covers the new `agents/keyword_router.py`)
- `python -c "from supervisor import build_graph; print(build_graph)"` — graph imports cleanly
- `pytest tests/test_keyword_router.py -q` — new scorer unit tests
- `pytest tests/test_planner.py -q` — existing + new planner tests
- `pytest tests/ -q -m "not eval"` — full unit suite, no regressions
- `deepeval test run tests/evaluations/test_eval_geval.py::test_planner_plan_quality tests/evaluations/test_eval_geval.py::test_planner_off_topic_adherence` — planner LLM evals
- `python -c "from agents.keyword_router import score_query; print(score_query('стаття 164-14 КУпАП штраф'))"` — smoke check of the scorer on a known legal query

## Notes

- **No new dependencies.** stdlib `json` only. If word-boundary matching becomes necessary later (e.g. to stop `"тендер"` from matching inside an unrelated compound), switch to `re.findall(r"\\b" + re.escape(phrase) + r"\\b", q, flags=re.UNICODE)` — Ukrainian word boundaries work with the `re` module's Unicode mode. Aho-Corasick is *not* warranted at ~1100 phrases; revisit only if Planner latency budget tightens.
- **JSON path is configurable.** `settings.routing_dictionaries_path` defaults to the in-repo file but can be overridden in `.env` if the dictionary is ever moved out of the repo (e.g. into a shared bucket).
- **Bias from dictionary-size differences** (`technical_system` has 453 entries vs `lawyer` 316 vs `common_support` 322) is absorbed by the *normalized* scores used in the prompt and persisted on `ResearchPlan`. Raw scores are kept internal to the scorer for debugging only.
- **Backward compatibility.** A Langfuse prompt missing the `__KEYWORD_SIGNALS__` placeholder is still valid — the `.replace` call is a no-op, and behavior collapses to today's. This makes it safe to deploy the code first, then update the prompt, in any order.
- **Future v2 (out of scope here).** (a) Lemmatize the query with `pymorphy3-uk` so inflected forms match base phrases. (b) Add a Critic heuristic that flags plans where the chosen topic disagrees with the dominant lexical signal by more than `X%`. (c) Auto-derive the dictionary from corpus mining and version it in Langfuse.
