# Delivery Checklist (Definition of Done + Automation)

This checklist operationalizes `docs/ARCHITECTURE.md`.

## Shared Gates

A change set is not complete until:

- `npm run check` passes
- architecture invariants pass (`npm run invariant:check`)
- architecture sync checks pass
- relevant smoke checks pass

## Base Agent Validation

The existing block-based validation remains valid for the pre-RAG agent baseline.

Run:

```bash
npm run block:check -- <block-id>
```

Example:

```bash
npm run block:check -- 6
```

## Base Block Closure Checklist

### Block 0
- [ ] Base contract implementation completed.
- [ ] `npm run block:check -- 0` passed.
- [ ] Block-specific smoke output reviewed.

### Block 1
- [ ] Tools + JSON Schema implementation completed.
- [ ] `npm run block:check -- 1` passed.
- [ ] Block-specific smoke/E2E output reviewed.

### Block 2
- [ ] LLM client integration completed.
- [ ] `npm run block:check -- 2` passed.
- [ ] Block-specific smoke/E2E output reviewed.

### Block 3
- [ ] ReAct loop core completed.
- [ ] `npm run block:check -- 3` passed.
- [ ] Block-specific smoke/E2E output reviewed.

### Block 4
- [ ] Memory + interactive CLI completed.
- [ ] `npm run block:check -- 4` passed.
- [ ] Block-specific smoke/E2E output reviewed.

### Block 5
- [ ] Prompt engineering iteration completed.
- [ ] `npm run block:check -- 5` passed.
- [ ] Block-specific smoke/E2E output reviewed.

### Block 6
- [ ] Hardening + end-to-end validation completed.
- [ ] `npm run block:check -- 6` passed.
- [ ] Final E2E output reviewed.

## RAG Extension Checklist

The RAG layer can be marked as completed only after all items below are done.

### Contract + Structure
- [ ] `README.md` reflects the TypeScript RAG architecture.
- [ ] `docs/ARCHITECTURE.md` reflects `src/rag/*`, `knowledge_search`, and the offline ingestion flow.
- [ ] `src/config/env.ts` documents and exposes the new RAG-related env variables.
- [ ] `scripts/check-architecture-invariants.sh` reflects the new module boundaries.

### Ingestion
- [ ] A dedicated ingestion entrypoint exists.
- [ ] Documents from `data/` are loaded and chunked.
- [ ] Embeddings are generated with the configured embedding model.
- [ ] Dense vectors are stored in the selected vector database.
- [ ] A lexical corpus for BM25 is persisted locally.
- [ ] Re-running ingestion is supported without uncontrolled duplication.

### Retrieval
- [ ] Semantic retrieval works independently of the agent.
- [ ] BM25 retrieval works independently of the agent.
- [ ] Hybrid fusion combines both result sets.
- [ ] Reranking is applied before returning final candidates when rerank config is provided.
- [ ] Retrieval returns source-rich metadata suitable for final answers and reports.

### Agent Integration
- [ ] `knowledge_search` exists as a standalone tool implementation.
- [ ] `knowledge_search` is registered in `src/tools/langchain-tools.ts`.
- [ ] Agent prompts describe when to use `knowledge_search` vs `web_search`.
- [ ] Agent can combine local and web evidence in one run.

### RAG Smoke Checks
- [ ] A smoke check covers ingestion.
- [ ] A smoke check covers standalone retrieval.
- [ ] A smoke check covers agent integration with `knowledge_search`.
- [ ] `npm run rag:check` passes.
- [ ] Smoke output was reviewed manually, not only executed.

## Explicit Code Review Invariant Checks

During code review, verify and annotate these items explicitly:

- [ ] `src/agent/run-agent.ts` uses LangChain `createAgent` and not a custom manual ReAct loop.
- [ ] `src/tools/*` remains decoupled from direct LLM execution concerns.
- [ ] `src/rag/*` remains decoupled from `src/agent/*`.
- [ ] `knowledge_search` delegates to the RAG layer instead of embedding retrieval logic directly inside the tool file.
- [ ] Legacy manual-loop files (`llm-client`, `llm-adapter`, `tool-dispatcher`, `tools/index`, `tools/schemas`, `tools/validation`) are absent.
