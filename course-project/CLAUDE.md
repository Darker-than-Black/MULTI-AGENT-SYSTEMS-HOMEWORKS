# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is a course-project scaffold for a Ukrainian public-procurement (ЕСЗ / Prozorro) support assistant. The README is the source of truth for the *target* design — most Python modules at the repo root (`agent.py`, `ingest.py`, `retriever.py`, `tools.py`) are intentional stubs (`...` / `pass`) waiting to be implemented against that design. Don't treat them as the working system; treat them as named slots. The data-pipeline scripts under `scripts/` are real and runnable.

When asked to implement something, work from the architecture in `README.md` rather than inferring from the empty modules. The README is in Ukrainian; the design intent is binding even where code does not yet exist.

## Common commands

```bash
# Python deps (Python 3.11+ recommended; LangChain >=1.2 and pydantic >=2.12 are pinned)
pip install -r requirements.txt

# Source MariaDB (Prozorro infobox dump) used only by the export script
docker compose up -d        # starts local-prozorro-db on :3306
docker compose down

# Build datasets for ingestion (writes JSONL into data/)
python scripts/create_procurement_law_dataset.py   # → data/law/procurement_legal_dataset.jsonl
python scripts/export_infobox_db.py --output-dir data/infobox  # needs the docker DB running

# Application entry points (currently stubs)
python ingest.py            # build vector index from data/
python main.py              # REPL loop over the LangGraph agent
```

The README also references `deepeval test run tests/` for evaluation, but no `tests/` directory exists yet — create it before running.

## Architecture (target)

The system is a **LangGraph multi-agent pipeline** following Anthropic's *Orchestrator-Workers + Evaluator-Optimizer* pattern. The flow is hierarchical with a planning layer; quality of decomposition (Planner) and quality of critique (Critic) determine overall system quality.

```
Supervisor → Planner ──(off-topic)──→ static refusal → END
                    └─(needs_human)─→ Escalation → END
                    │
                    ▼ fan-out by SubTask.topic
            ┌───────┼────────────┐
         Lawyer  Common      Technical
         (laws) Support      Support
                (articles) (articles+web)
            └───────┼────────────┘
                    ▼
             aggregate sections
                    ▼
                 Critic ──(approve)──→ user
                       └─(revise, retries<N)─→ targeted re-run
                       └─(retries==N)────────→ Escalation
```

Key invariants to preserve when editing:

- **Three-domain scope** (technical / procurement_general / legal). Off-topic filtering is *defense in depth* — Planner gate (`is_on_topic`), per-agent system prompts, and Critic's Structure dimension. Don't collapse these layers; each catches what the previous misses.
- **Inter-agent contracts are Pydantic models** (`ResearchPlan`, `SubTask`, `WorkerResponse`, `CritiqueResult`, `EscalationOutput`). These belong in `schemas.py`. Agents communicate via these structured outputs, not free text.
- **Two RAG collections, not one**: `laws` (large chunks, article-level) for the Lawyer, `articles` (smaller chunks with overlap) for Common/Technical Support. Technical Support filters `articles` by `subcategory=tutorial`. Don't merge them.
- **Critic's `revise` is targeted** — it returns `revision_requests=[{topic, request}]` and the Supervisor only re-runs the named workers, not the whole graph.
- **Escalation has two trigger paths**: Planner sets `needs_human=true` (skip workers/Critic entirely), or Critic exhausts `CRITIC_MAX_RETRIES`. Both produce the same `EscalationOutput` to a Slack expert channel + audit-trail file.
- **Sessions** use `langgraph-checkpoint-postgres` (`PostgresSaver`); session ID is `team_id:channel_id:user_id[:thread_ts]`.
- **Web search** is Tavily, hardcoded `language=uk, country=UA`, with post-filter for non-Ukrainian results. Technical Support uses an `allowed_domains` whitelist; Common Support does not.
- **Prompts live in Langfuse Prompt Management**, not in code. The `prompts/` directory is a backup copy, not the source of truth at runtime.

## Data pipeline

`data/law/procurement_legal_dataset.jsonl` is built by `scripts/create_procurement_law_dataset.py`, which scrapes `zakon.rada.gov.ua` for a fixed list of laws/resolutions (Закон 922, КМУ 1178, 1275, 166, ...) and chunks them at ~2000 chars (sized for cl100k Ukrainian tokenization, leaving headroom under the 512-token limits of BGE-M3 / multilingual-e5).

`data/infobox/*.jsonl` is built by `scripts/export_infobox_db.py`, which shells out to `docker compose exec mariadb mysql ...` against the `prozorro` database loaded from `prozorro_backup.sql` (this SQL dump is *not* in the repo — it must be placed alongside `docker-compose.yml` for the DB to initialize).

Ingestion (`ingest.py`) is the bridge from these JSONLs into the vector store; it's currently a TODO list of steps in a docstring.

## Configuration

`config.py` declares a Pydantic `Settings` (`BaseSettings`) class loaded from `.env`. Per the README the full target env surface includes Tavily, Postgres, Slack tokens, Langfuse keys, and tunables (`CRITIC_MAX_RETRIES`, `WORKER_TIMEOUT_SECONDS`, `PLANNER_MAX_SUBTASKS`) — the current `Settings` only has a small subset. Extend it rather than introducing parallel config loaders. There is no `.env.example` yet; the README lists the canonical keys.