# Architecture Contract (LangChain + Multi-Agent RAG)

This document defines the target TypeScript architecture for `homework-lesson-8`.

## 1) Target Module Structure

```text
src/
├── main.ts
├── supervisor/
│   ├── create-supervisor.ts
│   └── supervisor-tools.ts
├── agents/
│   ├── planner.ts
│   ├── researcher.ts
│   └── critic.ts
├── schemas/
│   ├── research-plan.ts
│   └── critique-result.ts
├── tools/
│   ├── langchain-tools.ts
│   ├── web-search.ts
│   ├── read-url.ts
│   ├── knowledge-search.ts
│   └── write-report.ts
├── rag/
│   ├── ingest.ts
│   ├── retriever.ts
│   ├── store.ts
│   └── types.ts
├── config/
│   ├── env.ts
│   └── prompts.ts
└── utils/
```

This is the architectural target state. File names may vary slightly, but responsibilities and boundaries must stay aligned with this structure.

## 2) Module Boundaries

- `src/supervisor/*`
  - Owns top-level orchestration only.
  - Coordinates the `Plan -> Research -> Critique -> Write` cycle.
  - Owns `Planner`, `Researcher`, and `Critic` agent-as-tool wrappers inside `src/supervisor/supervisor-tools.ts`.
  - May assemble HITL middleware wiring.
  - Must not contain retrieval logic.
  - Must not embed raw schema definitions inline if they belong in `src/schemas/*`.
- `src/agents/*`
  - Owns specialized agent construction: `Planner`, `Researcher`, `Critic`.
  - Each agent is created through LangChain `createAgent`.
  - Each agent owns its own prompt wiring and role-specific behavior.
  - Must not contain low-level retrieval implementation.
  - Must not contain CLI control flow.
- `src/schemas/*`
  - Owns structured output contracts such as `ResearchPlan` and `CritiqueResult`.
  - Structured output must be defined with `zod`.
  - Schema files must remain free of agent orchestration logic.
- `src/tools/*`
  - Contains standalone tool implementations only: `web_search`, `read_url`, `write_report`, `github_list_directory`, `github_get_file_content`, `knowledge_search`.
  - Tool files remain thin integration wrappers over business logic that lives elsewhere.
  - Must not import `openai`, `src/supervisor/*`, or `src/agents/*`.
  - `src/tools/langchain-tools.ts` is the only allowed place to import `langchain` inside `src/tools/*` for tool registration.
- `src/rag/*`
  - Owns ingestion, vector-store access, hybrid retrieval, reranking, and retrieval-specific data contracts.
  - May use LangChain integrations and third-party retrieval libraries when needed.
  - Must not import `src/supervisor/*` or `src/agents/*`.
  - Must not be invoked directly from `src/main.ts`; the runtime path goes through tools.
- `src/main.ts`
  - CLI loop only.
  - Owns user input, streaming/output display, interrupt handling, and resume flow.
  - Must not contain retrieval logic.
  - Must not contain agent role definitions.
- `src/config/*`, `src/utils/*`
  - Shared environment config, prompt config, helpers, and presentation utilities.
  - `src/config/env.ts` is the single entry point for environment loading.

## 3) Core Flows

### Supervisor Runtime Flow

1. `main.ts` collects user input and provides a stable `thread_id`.
2. `src/supervisor/*` initializes the Supervisor agent with middleware and checkpointer.
3. Supervisor invokes Planner first.
4. Planner returns a structured `ResearchPlan`.
5. Supervisor invokes Researcher with the approved plan.
6. Researcher gathers evidence through `knowledge_search`, `web_search`, and `read_url`.
7. Supervisor invokes Critic with the original request plus findings.
8. Critic returns structured `CritiqueResult`.
9. If verdict is `REVISE`, Supervisor invokes Researcher again with revision feedback.
10. If verdict is `APPROVE`, Supervisor prepares the final markdown report and calls `write_report`.
11. If `write_report` is interrupted by HITL middleware, `main.ts` surfaces the pending action and resumes with `approve`, `edit`, or `reject`.
12. Resume must reuse the same `thread_id`; the runtime must not restart the research cycle from scratch.

### Offline Ingestion Flow

1. A dedicated ingestion command starts the RAG pipeline.
2. `src/rag/ingest.ts` loads documents from `data/`.
3. Documents are chunked, embedded, and stored in the vector database.
4. A local lexical corpus and metadata are persisted for BM25 retrieval.
5. The interactive runtime never performs full ingestion during an agent turn.

## 4) Structured Output Contract

The following structured outputs must exist in `src/schemas/*`:

- `ResearchPlan`
  - goal
  - search queries
  - sources to check
  - desired output format
- `CritiqueResult`
  - verdict
  - freshness assessment
  - completeness assessment
  - structure assessment
  - strengths
  - gaps
  - revision requests

Naming may follow TypeScript conventions such as `searchQueries`, `isFresh`, `isComplete`, and `isWellStructured`, but the semantics above are mandatory.

## 5) Configuration Contract

The following categories of configuration must be represented in `src/config/env.ts`:

- agent runtime config
  - example: `OPENAI_API_KEY`, `MODEL_NAME`, `MAX_ITERATIONS`
- ingestion config
  - example: `EMBEDDING_MODEL`, `CHUNK_SIZE`, `CHUNK_OVERLAP`
- vector store config
  - example: `QDRANT_URL`, `QDRANT_COLLECTION`
- retrieval and rerank config
  - example: `KNOWLEDGE_TOP_K`, `KNOWLEDGE_RERANK_TOP_N`, `COHERE_API_KEY`, `RERANK_MODEL`
- runtime interaction config
  - example: `MAX_SESSION_MESSAGES`, `MAX_URL_CONTENT_LENGTH`, output directory settings

Role prompts for Supervisor, Planner, Researcher, and Critic must be centralized in config-oriented modules rather than duplicated inline across agent files.

## 6) Invariants

- Supervisor orchestration must be isolated from retrieval implementation details.
- Planner, Researcher, and Critic must each be instantiated via LangChain `createAgent`.
- Structured output for Planner and Critic must come from `zod` schemas in `src/schemas/*`.
- `knowledge_search` must remain a tool-level adapter, not the home of retrieval business logic.
- `src/tools/*` remains decoupled from agent/OpenAI orchestration dependencies.
- `src/rag/*` remains decoupled from `src/supervisor/*` and `src/agents/*`.
- Only `src/tools/langchain-tools.ts` may import `langchain` inside `src/tools/*`.
- `src/main.ts` must remain a CLI and HITL entrypoint, not the place where agent role logic is defined.
- The report-writing path must be HITL-gated before persistence.
- Session memory and thread state must support interrupt/resume flows.

## 7) Validation Expectations

The base TypeScript checks remain mandatory:

- `npm run check`
- `npm run validate`

Validation coverage must include:

- ingestion
- retrieval
- agent integration with `knowledge_search`
- structured validation for Planner and Critic
- supervisor orchestration validation through subagent-tools
- Supervisor/HITL flow once multi-agent implementation is added

Shell scripts under `scripts/` may still exist as internal building blocks, but the public project validation entrypoint is `npm run validate`.

## 8) Maintenance Rule

If module boundaries, agent responsibilities, structured output contracts, validation entrypoints, or agent-to-RAG interaction change, update this document in the same commit.
