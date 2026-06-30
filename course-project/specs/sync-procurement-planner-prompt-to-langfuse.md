# Plan: Sync `procurement-planner` prompt to Langfuse (via reusable `scripts/sync_prompts.py`)

## Task Description

The previous feature ("Planner keyword-routing hints") added a new local backup of the Planner system prompt at `prompts/procurement-planner.md` containing a new `__KEYWORD_SIGNALS__` placeholder alongside the pre-existing `__PLANNER_MAX_SUBTASKS__` placeholder. The runtime source-of-truth for prompts in this project is **Langfuse Prompt Management** (`observability/langfuse_client.py:35-56`), and the live `procurement-planner` prompt in Langfuse does **not** yet contain the new placeholder. Until it does, `agents/planner.py` will call `prompt.replace(_KEYWORD_SIGNALS_PLACEHOLDER, signals_block)` as a no-op against the live template, so the keyword hint block never reaches the LLM in production.

This task delivers a small, idempotent CLI script (`scripts/sync_prompts.py`) that reads `prompts/*.md` and pushes each file's contents to Langfuse via `langfuse.create_prompt(...)` as a new version with the `production` label attached. The script is invoked once to update `procurement-planner` and remains usable for future prompt updates. Both `README.md:122` and `docs/ARCHITECTURE.md:784` already reference `python scripts/sync_prompts.py` as a quick-start step — this task fulfils that reference.

## Objective

After this change:

1. `scripts/sync_prompts.py` exists and is runnable as `python scripts/sync_prompts.py` (no required CLI args). It reads `prompts/*.md`, strips any leading HTML comment header, and pushes each file as a Langfuse prompt named after the filename stem with `labels=["production"]` attached. The result is a new immutable Langfuse version pointed at by the `production` label.
2. The script is idempotent: if the local file content equals the current `production` version on Langfuse, no new version is created (avoids version churn / cache busts).
3. After running the script once locally with `.env` configured, fetching `procurement-planner` via `langfuse.get_prompt("procurement-planner", label="production").prompt` returns text containing both `__PLANNER_MAX_SUBTASKS__` and `__KEYWORD_SIGNALS__` placeholders.
4. End-to-end: with `PLANNER_KEYWORD_ROUTING_ENABLED=true` and a known-matching query (e.g. "оскарження через OpenProcurement API"), the Langfuse trace for that run shows the keyword hint block (`Лексичні сигнали з користувацького запиту…`) embedded in the system message sent to the LLM.

## Problem Statement

Two coupled issues:

- The Langfuse-hosted `procurement-planner` prompt is the runtime source. The new `__KEYWORD_SIGNALS__` placeholder lives only in the local backup until pushed. Manual push via the Langfuse UI is error-prone (copy/paste, label-pointer mistakes, no diff visibility, no version history of WHY it changed).
- The project already documents `scripts/sync_prompts.py` as a quick-start step (`README.md:122`) but the script does not exist. Anyone following the README hits a missing-file error.

A reusable script solves both: it pushes the planner prompt today and stays available for every future prompt edit on any agent's backup file.

## Solution Approach

Create `scripts/sync_prompts.py` — a thin, well-typed CLI built on the existing Langfuse client singleton (`observability.langfuse_client.get_langfuse`). It loops over `prompts/*.md`, derives the Langfuse prompt name from the filename stem (e.g. `prompts/procurement-planner.md` → `procurement-planner` — exactly matching the name used in `agents/planner.py:16`), strips a leading `<!-- … -->` HTML comment block (the backup file header), and synchronizes via `langfuse.create_prompt(name=…, prompt=…, labels=["production"], tags=["procurement", <stem-without-prefix>], type="text", commit_message=…)`.

Idempotency is achieved by fetching the current `production` version first (`langfuse.get_prompt(name, label="production", cache_ttl_seconds=0)`) and skipping if `.prompt` equals the new content. A `--force` flag overrides skip. A `--dry-run` flag prints the unified diff between live and local and exits without writing. A `--prompt <name>` flag restricts the sync to a single prompt (today's use case: `--prompt procurement-planner`). A `--label <label>` flag overrides the default `production` to support staging promotion (e.g. push to `dev`, then promote in the UI).

The script:

- Imports `settings` from `config.py` — no direct `os.environ` reads.
- Uses the same `get_langfuse()` singleton as the rest of the codebase (`observability/langfuse_client.py:21-32`) so credentials and the host URL come from one place.
- Calls `langfuse.flush()` before exit so the writes are not lost in a short-lived process — this is the exact pitfall called out in `docs/patterns/langfuse_integration.md`.
- After each push, re-fetches the prompt (bypassing the SDK cache via `cache_ttl_seconds=0`) and asserts the live content matches. Asserts the planner-specific placeholders are present when syncing `procurement-planner`.

This is the only piece of infrastructure required to fulfil the user's ask. No schema change, no graph change, no config change, no test runner change.

### Architecture Decisions

- **Affected graph nodes**: None. The Planner already calls `load_prompt(name="procurement-planner")` and replaces `__KEYWORD_SIGNALS__` in Python. After the sync, the Langfuse-stored template carries the placeholder and the `.replace` call substitutes real content. No code change to `agents/planner.py`.
- **Schemas**: None. The script is operational, not a graph node.
- **RAG collection(s)**: None.
- **External calls**: One `create_prompt` per changed file + one `get_prompt` per file (re-verify after push) + one `flush()` at exit. All against Langfuse Cloud at `settings.langfuse_base_url`. Rate limiting is not a concern (single-digit calls). Network errors propagate as exit code 1 with a clear message.
- **Sessions / persistence**: None.
- **Prompt source**: This task **is** the prompt source update. After the script runs successfully, Langfuse's `procurement-planner` prompt (production label) is the new canonical version. The local `prompts/procurement-planner.md` remains the git-tracked mirror per CLAUDE.md.

### Library-first justification

The Langfuse Python SDK (4.5.1, pinned via `langfuse>=2.50` in `requirements.txt`) already exposes `create_prompt`, `get_prompt`, and `update_prompt`. No custom HTTP client. No new dependency. No hand-rolled retry — the SDK handles transport.

### Edge cases handled

- **Langfuse not configured**: `get_langfuse()` returns `None` when public/secret keys are missing. The script exits 2 with a message naming the missing env variables.
- **Prompt does not exist in Langfuse yet** (first-ever push): `get_prompt(...)` raises (404 / `NotFoundError`). The script catches it, treats this as "needs create", and proceeds. Idempotency check is therefore best-effort, not required.
- **Empty prompt file**: Refuse to push. Exit 1 with a message.
- **HTML header is not at the top**: Stripping uses a non-greedy regex anchored at `^\s*<!--`. If no header is present, nothing is stripped. Safe no-op.
- **Multiple prompts changed in one run**: Loop processes them all. A failure on one continues to the next; the final exit code is the worst of all individual results (non-zero if any failed).
- **`commit_message` traceability**: Defaults to `"sync from prompts/<filename> @ <git-short-sha-of-file>"` when git is available; falls back to a UTC timestamp otherwise. Overridable via `--message`.
- **Label move semantics**: Langfuse moves the `production` label off the previous version to the new one automatically when `labels=["production"]` is passed to `create_prompt`. No manual `update_prompt` call needed in the happy path. Re-verify by fetching and comparing.

## Relevant Files

Use these files to complete the task:

- `prompts/procurement-planner.md` — the local backup that needs to land in Langfuse. Already contains both placeholders and a leading HTML comment header that must be stripped on push.
- `agents/planner.py:9, 12-20, 33-46` — consumer of the prompt. After the sync, the runtime call `load_prompt(name="procurement-planner")` returns text containing `__KEYWORD_SIGNALS__`, and the Python-side `.replace()` substitutes real content. No code change.
- `observability/langfuse_client.py:21-32, 35-56` — singleton + `load_prompt` wrapper. The new script reuses `get_langfuse()` and shares its credential resolution.
- `config.py:99-101` — `langfuse_public_key`, `langfuse_secret_key`, `langfuse_base_url`. Source of truth for credentials. The new script imports `settings` from here.
- `requirements.txt` (langfuse pin `>=2.50`, currently installed 4.5.1) — confirms `create_prompt` / `get_prompt` / `update_prompt` signatures (see Notes for verified signatures).
- `docs/patterns/langfuse_integration.md` — canonical pattern reference. Calls out the `flush()` pitfall the script must respect.
- `README.md:122` — already references `python scripts/sync_prompts.py` as a one-time quick-start step. The wording does not need to change once the script exists, but is worth a one-line clarification (see Step-by-step).
- `docs/ARCHITECTURE.md:784, 599-621` — `scripts/sync_prompts.py` is referenced in the deployment section; § 10.2 documents the six prompt names.
- `CLAUDE.md` (Reference patterns from lectures + Development principles) — confirms "Prompts → `langfuse.get_prompt(...).compile(...)` not hardcoded strings" library-first rule. The new script aligns with this rule by being a thin wrapper around the SDK.

### New Files

- `scripts/sync_prompts.py` — the CLI script (~120 LOC including help text + diff rendering).
- `tests/test_sync_prompts.py` *(optional, recommended)* — unit tests for the pure helpers (`_strip_header`, `_derive_prompt_name`, `_unified_diff`, content comparison). Network calls are not exercised; the SDK is mocked. Without these tests the script is implicitly covered by manual smoke only.

## Implementation Phases

- [ ] **Phase 1: Script foundation** — Pure helpers (header stripping, prompt-name derivation, unified-diff rendering) + the CLI skeleton (argparse, exit codes, logging). No Langfuse calls yet — easy to unit-test in isolation.
  - Status:
  - Comments:

- [ ] **Phase 2: Langfuse integration** — Wire the Langfuse client, implement the per-prompt sync (`get_prompt` → compare → `create_prompt` → re-fetch → assert), `flush()` on exit, single-prompt and all-prompts modes, `--dry-run`, `--force`.
  - Status:
  - Comments:

- [ ] **Phase 3: One-shot execution + verification** — Run `python scripts/sync_prompts.py --dry-run --prompt procurement-planner` locally to confirm the diff is what you want, then re-run without `--dry-run`. Confirm in Langfuse UI that a new version exists and the `production` label moved. End-to-end smoke a Planner query and inspect the trace.
  - Status:
  - Comments:

## Step by Step Tasks

### 1. Script — pure helpers

- [ ] **Create `scripts/sync_prompts.py` skeleton** — Top-of-file docstring (one paragraph: purpose + usage), `from __future__ import annotations`, stdlib imports (`argparse`, `difflib`, `logging`, `re`, `subprocess`, `sys`, `pathlib.Path`, `datetime`), `from config import settings`, `from observability.langfuse_client import get_langfuse`. Module-level `logger = logging.getLogger(__name__)` and a `logging.basicConfig(level=logging.INFO, format="%(message)s")` call inside `main()`. Argparse with flags: `--dry-run`, `--force`, `--prompt NAME` (repeatable), `--label LABEL` (default `"production"`), `--message MESSAGE`, `--prompts-dir DIR` (default `"prompts"`). Exit codes: 0 = success / no-op, 1 = at least one prompt failed, 2 = misconfiguration (Langfuse keys missing, empty `prompts/`, unknown `--prompt`).
  - Status:
  - Comments:

- [ ] **Implement `_strip_header(text: str) -> str`** — Removes a single leading `<!-- … -->` block (DOTALL, non-greedy), then trims leading whitespace. If no header, returns the input unchanged. Unit-testable with: header-only file → empty body; no-header file → unchanged; header followed by content → content only.
  - Status:
  - Comments:

- [ ] **Implement `_derive_prompt_name(path: Path) -> str`** — Returns `path.stem`. Validates the stem matches `^[a-z][a-z0-9-]+$` so a stray file like `prompts/.DS_Store.md` is rejected. Raises `ValueError` otherwise; the caller logs and skips the offending file.
  - Status:
  - Comments:

- [ ] **Implement `_unified_diff(old: str, new: str, name: str) -> str`** — Wraps `difflib.unified_diff` with `fromfile=f"langfuse:{name}@production"`, `tofile=f"local:prompts/{name}.md"`, `lineterm=""`. Returns "" when texts are identical. Used for `--dry-run` output and post-push verification messages.
  - Status:
  - Comments:

- [ ] **Implement `_default_commit_message(path: Path) -> str`** — Tries `git log -1 --format=%h -- <path>` via `subprocess.run(check=False, capture_output=True, text=True)`. If git returns a short SHA, returns `"sync from prompts/<filename> @ <sha>"`. Otherwise returns `"sync from prompts/<filename> @ <iso-utc-timestamp>"`. Never raises — the message is decorative.
  - Status:
  - Comments:

### 2. Script — Langfuse integration

- [ ] **Implement `_fetch_live(client, name, label) -> str | None`** — Calls `client.get_prompt(name, label=label, cache_ttl_seconds=0).prompt`. Catches `Exception` (Langfuse SDK raises a few different exception types across versions; tolerate all) and returns `None` if the fetch fails, with a debug log naming the exception class. The caller treats `None` as "no live version, push anyway".
  - Status:
  - Comments:

- [ ] **Implement `_sync_one(client, path, label, dry_run, force, message) -> bool`** — Returns `True` on success or no-op, `False` on failure. Workflow:
  1. Read `path.read_text(encoding="utf-8")` → `_strip_header(...)` → `body`. If `body.strip() == ""` log error and return False.
  2. `name = _derive_prompt_name(path)`.
  3. `live = _fetch_live(client, name, label)`.
  4. If `live == body` and not `force`: log `"✓ {name} — up to date, skipping"` and return True.
  5. If `dry_run`: print the unified diff (or `"new prompt {name}"` if `live is None`) and return True.
  6. `client.create_prompt(name=name, prompt=body, labels=[label], tags=["procurement", name.removeprefix("procurement-")], type="text", commit_message=message)`. Log `"→ pushed {name} (new version)"`.
  7. Verify: `verify = _fetch_live(client, name, label)`. Assert `verify == body`. If mismatch, log a diff against `verify` and return False.
  8. Planner-specific guard: if `name == "procurement-planner"`, assert `"__PLANNER_MAX_SUBTASKS__" in verify and "__KEYWORD_SIGNALS__" in verify`; on miss, log and return False.
  9. Return True.
  - Status:
  - Comments:

- [ ] **Implement `main()`** — Parse args. If `--prompt` is specified, build the file list from those names: `[prompts_dir / f"{n}.md" for n in args.prompt]`; assert each exists or exit 2. Else, glob `prompts_dir.glob("*.md")` (sorted). If list is empty, exit 2 with a message. Resolve the Langfuse client via `get_langfuse()`; if `None`, exit 2. Loop, accumulating success / failure counts. After the loop, call `client.flush()`. Log a summary line `"synced N / failed M / skipped K"`. Exit code 0 if `failed == 0`, else 1.
  - Status:
  - Comments:

### 3. Tests (optional but recommended)

- [ ] **Create `tests/test_sync_prompts.py`** — Pure-helper tests. No network. Cases:
  - `_strip_header` removes a leading HTML comment, leaves body trimmed.
  - `_strip_header` no-op when no header.
  - `_strip_header` does not remove a comment that is not at file start.
  - `_derive_prompt_name` returns stem for valid name, raises `ValueError` for `_load.md`, `.hidden.md`, `Uppercase.md`.
  - `_unified_diff` returns "" for identical inputs, non-empty for different inputs.
  - `_default_commit_message` returns a string starting with `"sync from prompts/"`.
  Optional: `_sync_one` with a stubbed client (records `create_prompt` kwargs, returns a fake `live` value). Exercises the skip / dry-run / push paths.
  - Status:
  - Comments:

### 4. Execute the actual sync

- [ ] **Dry-run on `procurement-planner`** — `python scripts/sync_prompts.py --dry-run --prompt procurement-planner`. Confirm the printed diff shows the new `__KEYWORD_SIGNALS__` placeholder being added (or a "new prompt" notice if no version exists yet). If the diff is unexpected, edit `prompts/procurement-planner.md` and re-run.
  - Status:
  - Comments:

- [ ] **Real push** — `python scripts/sync_prompts.py --prompt procurement-planner`. Expect: `"→ pushed procurement-planner (new version)"` followed by `"✓ procurement-planner — verified"`. Exit code 0.
  - Status:
  - Comments:

- [ ] **Smoke trace in Langfuse** — In the Langfuse UI, open `Prompts → procurement-planner`. Confirm a new version is listed with the `production` label and that `__KEYWORD_SIGNALS__` appears in the body. Then run a Planner query with a known-matching phrase (e.g. `python -c "from main import respond; print(respond('оскарження через OpenProcurement API', session_id='smoke'))"` — adjust to whatever the REPL entry expects, see `main.py`) and inspect the trace: the system message sent to the LLM must contain `Лексичні сигнали з користувацького запиту`.
  - Status:
  - Comments:

### 5. Docs

- [ ] **Add one-line usage note to `README.md` quick-start** — Right next to line 122, add a sentence: `# одноразово після зміни будь-якого файлу в prompts/`. Keep the command line itself unchanged.
  - Status:
  - Comments:

- [ ] **Add a §10.2 note to `docs/ARCHITECTURE.md`** — After the existing "Локальний backup в `prompts/*.md`…" sentence (line 621), append: `Sync via \`python scripts/sync_prompts.py [--prompt NAME] [--dry-run]\` — idempotent push from local backups into Langfuse, `production` label moves to the new version automatically.`
  - Status:
  - Comments:

### 6. Validation

- [ ] **Run the project's validation suite** — Execute the commands in the Validation Commands section. The new script is operational tooling — it should not affect any unit or eval tests. Confirm pytest counts are unchanged from the prior change.
  - Status:
  - Comments:

## Testing Strategy

- **Unit tests** — `tests/test_sync_prompts.py` covers the four pure helpers with no Langfuse network calls. Optionally exercises `_sync_one` with a stubbed client. Total: 8-10 fast tests.
- **Manual smoke** — The actual push is verified by re-fetching from Langfuse inside the script itself; no separate test runs the SDK against the live host. The Langfuse UI is the human-eyes confirmation.
- **End-to-end** — After the push, a manual Planner invocation with a matching query inspects the Langfuse trace for the hint block in the system message. This is the only check that proves the round-trip works.
- **Regression** — Re-running the script with no local changes must produce `"✓ ... up to date, skipping"` and exit 0 with no new Langfuse version. This is the idempotency guarantee and the most important non-functional property.

## Acceptance Criteria

- `scripts/sync_prompts.py` exists, runs with `python scripts/sync_prompts.py --help`, and prints sensible help text including all CLI flags.
- `python scripts/sync_prompts.py --dry-run --prompt procurement-planner` exits 0 and prints either a unified diff or a "new prompt" notice for `procurement-planner` (depending on whether the prompt already exists in Langfuse).
- `python scripts/sync_prompts.py --prompt procurement-planner` exits 0, creates a new Langfuse version of `procurement-planner`, and the verification re-fetch confirms the live content matches `_strip_header(prompts/procurement-planner.md)`.
- The newly-live `procurement-planner` prompt contains both `__PLANNER_MAX_SUBTASKS__` and `__KEYWORD_SIGNALS__` (verified by the script's post-push assertion and by manual inspection in the Langfuse UI).
- Re-running the same command immediately afterwards logs `"✓ procurement-planner — up to date, skipping"` and creates no new version.
- `python scripts/sync_prompts.py` (no args) loops over every `.md` in `prompts/`. Today that is one file; the script is forward-compatible with future backups for `procurement-lawyer`, `procurement-common-support`, etc.
- A Planner query with a matching keyword (e.g. "оскарження через OpenProcurement API") shows the keyword hint block in the Langfuse-traced system message.
- `pytest tests/ -q -m "not eval"` continues to pass with the same count as before the change (the new script is operational, not part of the graph).

## Validation Commands

Execute these commands to validate the task is complete:

- `python -m py_compile scripts/sync_prompts.py` — syntax check on the new script.
- `python scripts/sync_prompts.py --help` — prints CLI help and exits 0.
- `python scripts/sync_prompts.py --dry-run --prompt procurement-planner` — diff preview, exit 0.
- `python scripts/sync_prompts.py --prompt procurement-planner` — actual push, exit 0.
- `python scripts/sync_prompts.py --prompt procurement-planner` (second run) — must log "up to date, skipping", exit 0.
- `python -c "from observability.langfuse_client import load_prompt; p = load_prompt('procurement-planner'); print('PLACEHOLDER_PRESENT' if '__KEYWORD_SIGNALS__' in p else 'MISSING')"` — end-to-end check via the same code path the Planner uses at runtime. Must print `PLACEHOLDER_PRESENT`.
- `PYTHONPATH=. pytest tests/test_sync_prompts.py -q` — if unit tests were added (Step 3).
- `PYTHONPATH=. pytest tests/ -q -m "not eval"` — full unit suite, no regression.

## Notes

- **Langfuse SDK signatures verified locally** (`langfuse==4.5.1`):
  ```
  create_prompt(*, name, prompt, labels=[], tags=None, type='text', config=None, commit_message=None)
  get_prompt(name, *, version=None, label=None, type='text', cache_ttl_seconds=None, fallback=None, ...)
  update_prompt(*, name, version, new_labels=[])
  ```
  `update_prompt` is intentionally NOT used in the happy path — passing `labels=["production"]` to `create_prompt` is the supported way to attach AND move the label in one call. Keep `update_prompt` in mind only as a fallback if SDK behaviour ever diverges.
- **No new dependency.** `langfuse>=2.50` is already pinned in `requirements.txt`.
- **Why not store prompts in git as canonical and skip Langfuse altogether?** The project's architectural decision (ADR #10 in `docs/ARCHITECTURE.md:819`) is "Langfuse Prompt Mgmt over hardcoded prompts" because Langfuse provides A/B testing, versioning, and label-based promotion without redeploy. The sync script preserves that decision while making the backup-to-runtime promotion auditable and reproducible.
- **Label promotion workflow (future)**: For multi-stage prompt rollout, push with `--label dev` first, validate via eval suite against the `dev` label, then promote in the Langfuse UI (or by another `--label production` push that uses the same body). The script supports this flow today via `--label`.
- **Why strip the HTML header?** The local backup carries a maintainer-facing comment block at the top documenting the placeholder substitution mechanism. That comment is noise to the LLM and would burn ~500 tokens per Planner call if left in. Stripping happens at sync time so the local file stays human-readable in git while the live prompt is lean.
- **Why one script for all prompts instead of a planner-specific script?** Five other prompts (`procurement-lawyer`, `procurement-common-support`, `procurement-technical-support`, `procurement-critic`, `procurement-escalation`) will eventually want backups too. A single script that loops by glob is the smallest forward-compatible surface. Each future backup file is added with no script change.
- **Out of scope**: pulling prompts FROM Langfuse INTO `prompts/`. That would be the symmetric `--pull` operation. Not needed for this task and would add round-tripping noise (Langfuse versions are immutable; pulls would create churn in git). Add as a future task if the workflow shifts to Langfuse-UI-first editing.
