# Architecture Contract (LangChain + RAG)

This document defines the minimal architecture for `homework-lesson-8`.

## 1) Module Boundaries

- `src/agent/*`
  - Owns agent setup via LangChain `createAgent`, explicit chat model initialization, prompt wiring, and session message conversion.
  - Decides how the model interacts with tools.
  - Must not contain retrieval or ingestion business logic.
- `src/tools/*`
  - Contains standalone tool implementations only: `web_search`, `read_url`, `write_report`, `github_list_directory`, `github_get_file_content`, `knowledge_search`.
  - Tool files remain thin integration wrappers over business logic that lives elsewhere.
  - Must not import `openai` or `src/agent/*`.
  - `src/tools/langchain-tools.ts` is the only allowed place to import `langchain` inside `src/tools/*` for tool registration.
- `src/rag/*`
  - Owns ingestion, vector-store access, hybrid retrieval, reranking, and retrieval-specific data contracts.
  - May use LangChain integrations and third-party retrieval libraries when needed.
  - Must not import `src/agent/*`.
  - Must not be invoked directly from `src/main.ts`; the runtime path goes through tools.
- `src/main.ts`
  - CLI loop only: read input, call `runAgentTurn`, print answer, optional manual report save.
  - Must not contain retrieval logic or ingestion logic.
- `src/config/*`, `src/utils/*`
  - Env config and shared utility helpers.
  - `src/config/env.ts` is the single entry point for loading environment variables for both agent and RAG subsystems.

## 2) Core Flows

### Runtime Flow

1. `main.ts` collects user text.
2. `runAgentTurn(...)` appends the user message to in-memory session state.
3. LangChain agent (`createAgent`) runs an explicitly initialized chat model plus registered tools.
4. The system prompt decides whether the run requires local evidence, web evidence, or both.
5. When local knowledge is needed, the agent calls `knowledge_search`.
6. When the user explicitly requests web sources or recent external comparison, the agent must use `web_search` and then `read_url` for relevant results before finishing.
7. When the user explicitly requests a saved report, the agent must call `write_report` before finishing.
8. `knowledge_search` delegates to `src/rag/retriever.ts`.
9. Retrieval and web evidence return to the agent as tool output.
10. Final AI message is returned to the CLI.
11. CLI optionally saves a markdown report if it was not saved by tool call.

### Offline Ingestion Flow

1. A dedicated ingestion command starts the RAG pipeline.
2. `src/rag/ingest.ts` loads documents from `data/`.
3. Documents are chunked, embedded, and stored in the vector database.
4. A local lexical corpus and metadata are persisted for BM25 retrieval.
5. The runtime agent never performs full ingestion during an interactive turn.

## 3) Configuration Contract

The following categories of configuration must be represented in `src/config/env.ts`:

- agent runtime config
  - example: `OPENAI_API_KEY`, `MODEL_NAME`, `MAX_ITERATIONS`
- ingestion config
  - example: `EMBEDDING_MODEL`, `CHUNK_SIZE`, `CHUNK_OVERLAP`
- vector store config
  - example: `QDRANT_URL`, `QDRANT_COLLECTION`
- retrieval and rerank config
  - example: `KNOWLEDGE_TOP_K`, `KNOWLEDGE_RERANK_TOP_N`, `COHERE_API_KEY`, `RERANK_MODEL`

## 4) Invariants

- `run-agent.ts` must initialize a LangChain agent with `createAgent`.
- `run-agent.ts` must use an explicit chat model configured from `src/config/env.ts`.
- `run-agent.ts` must allow enough recursion budget for multi-tool runs that combine local search, web search, page reads, and report writing.
- `src/tools/*` remains decoupled from agent/OpenAI dependencies.
- `src/rag/*` remains decoupled from `src/agent/*`.
- `knowledge_search` must remain a tool-level adapter, not the home of retrieval business logic.
- Only `src/tools/langchain-tools.ts` may import `langchain` inside `src/tools/*`.
- Legacy manual-loop files must not exist:
  - `src/agent/llm-client.ts`
  - `src/agent/llm-adapter.ts`
  - `src/agent/tool-dispatcher.ts`
  - `src/tools/index.ts`
  - `src/tools/schemas.ts`
  - `src/tools/validation.ts`
- Session memory keeps bounded history (`MAX_SESSION_MESSAGES`) and truncates long message content.

## 5) Validation Expectations

The base TypeScript checks remain mandatory:

- `npm run check`
- `npm run invariant:check`
- `npm run arch:check:staged`

RAG extension work must add dedicated smoke validation for:

- ingestion
- retrieval
- agent integration with `knowledge_search`

These smoke checks may be implemented as shell scripts under `scripts/`, but the public validation entrypoints remain:

- `npm run block:check -- <block-id>`
- `npm run rag:check`

Direct `smoke:*` npm scripts are not part of the public contract.

## 6) Maintenance Rule

If boundaries, data flow, env contract, or agent-to-RAG interaction change, update this document in the same commit.
