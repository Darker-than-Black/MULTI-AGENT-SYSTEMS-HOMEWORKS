# Plan: Phase 1 — Vertical Slice #1: Single Lawyer Agent

## Task Description

Implement Phase 1 of the Prozorro procurement support assistant: a single Lawyer agent that
accepts Ukrainian legal questions via CLI, retrieves relevant procurement law chunks from Qdrant
using semantic search, and returns a structured answer with source citations.

**No orchestration (Planner/Critic/Escalation), no Slack, no multi-agent fan-out, no
checkpointer** — this is the minimal end-to-end path from query to structured answer.

Covers DELIVERY_CHECKLIST items **1.1 → 1.7** (7 sequential sub-tasks).

---

## Objective

`python main.py` accepts a Ukrainian natural-language question about public procurement law,
queries Qdrant (`laws` collection) via semantic search, and prints a structured `WorkerResponse`
with answer text, confidence score, and source citations. All code is strictly typed; all
inter-agent contracts are Pydantic models; the schema shape is correct for Phase 2–9 expansion.

---

## Problem Statement

Phase 0 left an echo-REPL in `main.py` and empty package stubs. Phase 1 must build the first
real end-to-end path: `data/law/procurement_legal_dataset.jsonl` → Qdrant → semantic retrieval
→ LLM reasoning → `WorkerResponse` → formatted REPL output. This path must honor all
architecture invariants — Pydantic contracts, two-collection RAG, no free text between
components — even without an orchestration layer.

---

## Solution Approach

Build strictly in dependency order: **schemas first** (downstream nodes depend on these types),
then retrieval infrastructure (embeddings + Qdrant client + ingestion pipeline), then the
retriever, then the RAG tool, then the Lawyer agent, finally main.py wiring. Each step is
independently testable before the next begins.

### Architecture Decisions

- **Affected graph nodes**: Only the Lawyer worker node. Planner, Critic, Supervisor, and
  Escalation are defined in `schemas.py` but are **not wired into a graph in Phase 1**. The full
  `StateGraph` is built in Phase 2.
- **Schemas**: `Source`, `WorkerResponse`, `SubTask`, `ResearchPlan`, `CritiqueResult`,
  `EscalationOutput` defined in `schemas.py`. `GraphState` (TypedDict) also defined now so Phase
  2 nodes have a correct contract to extend.
- **RAG collection(s)**: Only `laws` collection queried by the Lawyer agent. Infrastructure for
  `articles` collection is built (chunkers + pipeline support it) but the agent does not use it
  in Phase 1.
- **External calls**: OpenAI API for embeddings + LLM inference only. No Tavily, no Slack.
- **Sessions / persistence**: No checkpointer in Phase 1. The agent is called directly from
  `invoke_lawyer()` in `main.py`. `PostgresSaver` is introduced in Phase 2.
- **Prompt source**: Hardcoded `prompts/lawyer.md` file loaded at startup. Langfuse Prompt
  Management integration is Phase 3.

---

## Relevant Files

### Existing Files (read before implementing)

- `config.py` — Complete `Settings`; use `settings.embedding_model`, `settings.qdrant_url`,
  `settings.qdrant_laws_collection`, `settings.qdrant_articles_collection`, `settings.llm_model`,
  `settings.llm_provider`, `settings.rerank_top_k`
- `main.py` — Phase-0 echo REPL; updated in step 1.7
- `data/law/procurement_legal_dataset.jsonl` — 3.5 MB JSONL already chunked; fields:
  `id, doc_id, title, type, authority, domain, source, source_url, version_date, date_fetched,
  section_index, chunk_index, section_heading, breadcrumb, article_number, part_number,
  paragraph_number, doc_amendments_removed_count, text`
- `data/infobox/articles.jsonl` (and `faq.jsonl`, `courses.jsonl`) — 22 MB infobox export;
  fields: `id, doc_id, title, type, date_published, tags, chunk_index, text`
- `docs/ARCHITECTURE.md` — Binding spec in Ukrainian: § 4 (schemas), § 6 (RAG), § 11 (config)
- `docs/DELIVERY_CHECKLIST.md` — Phase 1 items 1.1–1.7
- `requirements.txt` — All deps pinned: `langchain>=1.2`, `langgraph>=0.6`,
  `qdrant-client>=1.13`, `langchain-openai>=0.4`, `sentence-transformers>=3.0`
- `scripts/setup_postgres_checkpointer.py` — Reference for `PostgresSaver` usage pattern

### New Files to Create

- `schemas.py` — All Pydantic inter-agent contracts + `GraphState`
- `retrieval/embeddings.py` — OpenAI embeddings wrapper with batch support
- `retrieval/qdrant_client.py` — Singleton `QdrantClient` + collection creation helper
- `retrieval/retriever.py` — `semantic_search(query, collection, filters, top_k) -> list[Chunk]`
- `ingest/chunkers.py` — `chunk_law()` pass-through, `chunk_article()` recursive splitter
- `ingest/pipeline.py` — `ingest_collection(collection)`: JSONL → embed → upsert
- `ingest/run_ingest.py` — CLI entry: `python -m ingest.run_ingest --collection laws|articles|all`
- `tools/rag.py` — `@tool rag_search(query: str, collection: str) -> str`
- `agents/lawyer.py` — `build_lawyer_agent()` using `create_react_agent` + structured output
- `prompts/lawyer.md` — Lawyer system prompt in Ukrainian
- `tests/test_schemas.py` — Pydantic model unit tests + validator edge cases
- `tests/test_retriever.py` — Semantic search unit tests with mocked Qdrant
- `tests/conftest.py` — Shared pytest fixtures

---

## Implementation Phases

- [ ] **Phase A: Foundation** — `schemas.py` with all contracts; `tests/test_schemas.py`
  - Status:
  - Comments:

- [ ] **Phase B: Data Pipeline** — `retrieval/embeddings.py`, `retrieval/qdrant_client.py`,
  `ingest/chunkers.py`, `ingest/pipeline.py`, `ingest/run_ingest.py`
  - Status:
  - Comments:

- [ ] **Phase C: Retrieval** — `retrieval/retriever.py` + `tests/test_retriever.py`
  - Status:
  - Comments:

- [ ] **Phase D: Agent Layer** — `tools/rag.py`, `prompts/lawyer.md`, `agents/lawyer.py`
  - Status:
  - Comments:

- [ ] **Phase E: Integration** — Update `main.py`; run ingestion; end-to-end test
  - Status:
  - Comments:

---

## Step by Step Tasks

### 1. Pydantic Schemas

- [ ] **Create `schemas.py` with all 7 contracts from ARCHITECTURE § 4** — Exact shapes below
  - `Source(BaseModel)`:
    ```python
    class Source(BaseModel):
        title: str
        url: str | None = None
        doc_id: str
        metadata: dict = Field(default_factory=dict)
    ```
  - `WorkerResponse(BaseModel)`:
    ```python
    class WorkerResponse(BaseModel):
        topic: Literal["legal", "procurement_general", "technical_system"]
        found: bool
        answer: str | None = None
        sources: list[Source] = Field(default_factory=list)
        confidence: float = Field(ge=0.0, le=1.0)
        needs_human: bool = False
        needs_human_reason: str | None = None
    ```
  - `SubTask(BaseModel)`:
    ```python
    class SubTask(BaseModel):
        topic: Literal["legal", "procurement_general", "technical_system"]
        query: str
        rationale: str
    ```
  - `ResearchPlan(BaseModel)` with `model_validator(mode="after")`:
    - If `not is_on_topic` → `subtasks` must be empty
    - If `needs_human` → `escalation_reason` must be set (not None)
    - If `is_on_topic and not needs_human` → `subtasks` must be non-empty
    ```python
    class ResearchPlan(BaseModel):
        is_on_topic: bool
        off_topic_reason: str | None = None
        language: Literal["uk", "en"] = "uk"
        original_query: str
        subtasks: list[SubTask] = Field(default_factory=list)
        needs_human: bool = False
        escalation_reason: str | None = None

        @model_validator(mode="after")
        def validate_consistency(self) -> "ResearchPlan":
            if not self.is_on_topic and self.subtasks:
                raise ValueError("off-topic plan must have empty subtasks")
            if self.needs_human and not self.escalation_reason:
                raise ValueError("needs_human=True requires escalation_reason")
            if self.is_on_topic and not self.needs_human and not self.subtasks:
                raise ValueError("on-topic plan must have at least one subtask")
            return self
    ```
  - `CritiqueResult(BaseModel)`:
    ```python
    class CritiqueResult(BaseModel):
        verdict: Literal["approve", "revise", "escalate"]
        revision_requests: list[dict] = Field(default_factory=list)
        dimensions: dict = Field(default_factory=dict)
        summary: str = ""
    ```
  - `EscalationOutput(BaseModel)`:
    ```python
    class EscalationOutput(BaseModel):
        reason: str
        original_query: str
        session_id: str
        timestamp: str
    ```
  - `GraphState(TypedDict)` — defined now, used from Phase 2:
    ```python
    from typing import Annotated
    import operator

    class GraphState(TypedDict):
        user_message: str
        session_id: str
        user_id: str
        plan: ResearchPlan | None
        worker_responses: Annotated[list[WorkerResponse], operator.add]
        critic_history: list[CritiqueResult]
        retry_count: int
        aggregated_response: str | None
        escalated: bool
        final_response: str | None
    ```
  - Status:
  - Comments:

- [ ] **Create `tests/conftest.py`** — Shared fixtures
  - `sample_source()` fixture returning a valid `Source` instance
  - `sample_worker_response()` fixture returning a valid `WorkerResponse(topic="legal", found=True, ...)`
  - Status:
  - Comments:

- [ ] **Create `tests/test_schemas.py`** — Unit tests for all validators
  - `test_worker_response_valid()` — confidence 0.0, 0.5, 1.0 all accepted
  - `test_worker_response_invalid_confidence()` — confidence 1.1 and -0.1 raise `ValidationError`
  - `test_research_plan_off_topic_with_subtasks_raises()` — `is_on_topic=False` + non-empty subtasks
  - `test_research_plan_needs_human_missing_reason_raises()` — `needs_human=True`, `escalation_reason=None`
  - `test_research_plan_on_topic_empty_subtasks_raises()` — `is_on_topic=True`, `needs_human=False`, `subtasks=[]`
  - `test_research_plan_valid_off_topic()` — `is_on_topic=False`, `subtasks=[]`, `off_topic_reason="..."` passes
  - `test_research_plan_valid_on_topic()` — `is_on_topic=True`, `needs_human=False`, one subtask passes
  - `test_source_optional_url()` — `Source(title=..., doc_id=...)` without url is valid
  - Status:
  - Comments:

### 2. Embeddings + Qdrant Client

- [ ] **Create `retrieval/embeddings.py`** — OpenAI embeddings wrapper
  - `class EmbeddingModel` wrapping `langchain_openai.OpenAIEmbeddings`
  - `embed_texts(texts: list[str]) -> list[list[float]]` — batches by 100 to respect rate limits;
    concatenates results
  - `embed_query(text: str) -> list[float]` — single query vector (uses `embed_query` of
    `OpenAIEmbeddings` for query-optimised path)
  - Reads `settings.embedding_model` and `settings.openai_api_key.get_secret_value()`
  - Module-level lazy singleton:
    ```python
    _embedder: EmbeddingModel | None = None

    def get_embedder() -> EmbeddingModel:
        global _embedder
        if _embedder is None:
            _embedder = EmbeddingModel()
        return _embedder
    ```
  - Status:
  - Comments:

- [ ] **Create `retrieval/qdrant_client.py`** — Singleton Qdrant client + collection setup
  - `_VECTOR_SIZES = {"text-embedding-3-small": 1536, "text-embedding-3-large": 3072}` —
    keyed by `settings.embedding_model`
  - `get_qdrant_client() -> QdrantClient` — lazy singleton reading `settings.qdrant_url` +
    `settings.qdrant_api_key` (extract with `.get_secret_value()` if not None)
  - `ensure_collections() -> None` — idempotent; for each of `[settings.qdrant_laws_collection,
    settings.qdrant_articles_collection]` calls `client.recreate_collection` only if it does not
    exist (check via `client.collection_exists(name)`); use:
    ```python
    VectorParams(
        size=_VECTOR_SIZES[settings.embedding_model],
        distance=Distance.COSINE,
    )
    ```
  - Status:
  - Comments:

### 3. Ingestion Pipeline

- [ ] **Create `ingest/chunkers.py`** — Two chunking strategies
  - `chunk_law(record: dict) -> list[dict]`:
    - Pass-through — the law JSONL is already chunked at ~2000 chars by
      `scripts/create_procurement_law_dataset.py`
    - Return `[record]` unchanged; do NOT regenerate the `id` field
  - `chunk_article(record: dict) -> list[dict]`:
    - Use `langchain_text_splitters.RecursiveCharacterTextSplitter(chunk_size=2000,
      chunk_overlap=300)`
    - Split `record["text"]`; for each chunk produce a new dict with all parent fields plus:
      - `chunk_index`: position in split sequence (overrides parent)
      - `id`: `hashlib.sha256(f"{record['doc_id']}-{chunk_index}".encode()).hexdigest()`
      - `text`: the split chunk text
    - If the text is short enough to not split, return `[record]` unchanged
  - Status:
  - Comments:

- [ ] **Create `ingest/pipeline.py`** — JSONL → embed → Qdrant upsert
  - `ingest_collection(collection: Literal["laws", "articles"]) -> dict` returns
    `{"collection": ..., "chunks_ingested": N}`
  - **Source paths**:
    - `laws`: `data/law/procurement_legal_dataset.jsonl`
    - `articles`: union of `data/infobox/articles.jsonl`, `data/infobox/faq.jsonl`,
      `data/infobox/courses.jsonl`
  - **Chunker selection**: `chunk_law` for `laws`, `chunk_article` for `articles`
  - **Embedding text construction**:
    - laws: `f"{r.get('breadcrumb', '')}\n{r.get('section_heading', '')}\n{r['text']}"`
    - articles: `f"{r['title']}\n{' '.join(r.get('tags', []))}\n{r['text']}"`
  - **Upsert loop**:
    - Accumulate chunks into batches of 100
    - Embed batch via `get_embedder().embed_texts(texts)`
    - Build `list[PointStruct]` — use chunk `id` as Qdrant point ID (string UUID or hash string);
      set `vector=embedding`, `payload=record` (full dict)
    - `get_qdrant_client().upsert(collection_name=collection, points=points)` — idempotent
      (same ID overwrites)
  - Print progress every 500 chunks
  - Status:
  - Comments:

- [ ] **Create `ingest/run_ingest.py`** — CLI entry point
  - `argparse` with `--collection {laws,articles,all}` (required, or default `all`)
  - Calls `ensure_collections()` first
  - For `laws` or `articles`: calls `ingest_collection(collection)` and prints stats
  - For `all`: calls both in sequence
  - Runnable as: `python -m ingest.run_ingest --collection laws`
  - Status:
  - Comments:

### 4. Semantic Retriever

- [ ] **Create `retrieval/retriever.py`** — Semantic search (Phase 1: no BM25, no reranker)
  - `class Chunk(BaseModel)`:
    ```python
    class Chunk(BaseModel):
        id: str
        doc_id: str
        text: str
        metadata: dict
        score: float
    ```
  - `semantic_search(query: str, collection: Literal["laws", "articles"],
    filters: dict | None = None, top_k: int = 5) -> list[Chunk]`:
    - Call `get_embedder().embed_query(query)` → query vector
    - Build optional Qdrant filter: `Filter(must=[FieldCondition(key=k, match=MatchValue(value=v))])`
      for each `k,v` in `filters.items()` — supports simple equality filters
    - Call `get_qdrant_client().search(collection_name=collection, query_vector=query_vector,
      limit=top_k, with_payload=True, query_filter=qdrant_filter)`
    - Convert each `ScoredPoint` to `Chunk`: `id=str(p.id)`, `doc_id=p.payload["doc_id"]`,
      `text=p.payload["text"]`, `score=p.score`,
      `metadata={k: v for k, v in p.payload.items() if k not in ("text", "id", "doc_id")}`
    - Return `list[Chunk]`
  - Status:
  - Comments:

- [ ] **Create `tests/test_retriever.py`** — Unit tests with mocked Qdrant
  - Mock `retrieval.qdrant_client.get_qdrant_client` to return a `MagicMock`
  - Mock `retrieval.embeddings.get_embedder` to return a `MagicMock` with
    `embed_query` returning `[0.0] * 1536`
  - Build two fake `ScoredPoint` objects with a payload dict
  - Assert `semantic_search("test", "laws", top_k=2)` returns a list of 2 `Chunk` objects
  - Assert each `Chunk.score` is populated
  - Assert `metadata` does NOT contain `"text"`, `"id"`, or `"doc_id"` keys
  - Status:
  - Comments:

### 5. RAG Tool

- [ ] **Create `tools/rag.py`** — LangChain `@tool` for use by agents
  - ```python
    @tool
    def rag_search(query: str, collection: str = "laws") -> str:
        """Search the procurement knowledge base.
        Use collection='laws' for questions about Ukrainian procurement law and regulations.
        Use collection='articles' for procedural questions about Prozorro platform usage.
        Returns relevant text snippets with source citations.
        """
    ```
  - Calls `semantic_search(query, collection, top_k=settings.rerank_top_k)`
  - Formats each `Chunk` as:
    ```
    ---
    {chunk.metadata.get('breadcrumb') or chunk.metadata.get('title', chunk.doc_id)}
    {chunk.text}
    Джерело: {chunk.metadata.get('source_url') or chunk.doc_id}
    ```
  - Joins all blocks; truncates to 6000 chars if total exceeds limit (preserves first N blocks)
  - Returns the formatted string (consumed by LLM as context)
  - Status:
  - Comments:

### 6. Lawyer Agent

- [ ] **Create `prompts/lawyer.md`** — Lawyer system prompt in Ukrainian
  - Role declaration: senior specialist in Ukrainian public procurement law
  - Laws in scope: Закон 922, КМУ 1178, КМУ 1275, КМУ 166, КМУ 822, Закон 808, ін.
  - Instruction: always call `rag_search(query=..., collection="laws")` before answering —
    never answer from memory alone
  - Instruction: cite article number and breadcrumb from the retrieved sources in the answer
  - Scope constraint: if the question is not about procurement law or Prozorro, respond with
    `found=false` and explain why it is out of scope
  - Output contract: produce a structured response with `topic="legal"`, `found` (bool),
    `answer` (text in Ukrainian), `sources` (list), `confidence` (0–1),
    `needs_human=true` only when the question requires a qualified human legal opinion
  - Status:
  - Comments:

- [ ] **Create `agents/lawyer.py`** — Lawyer agent factory
  - `get_llm() -> BaseChatModel`: reads `settings.llm_provider` + `settings.llm_model` +
    API key (`.get_secret_value()`)
    ```python
    def get_llm() -> BaseChatModel:
        if settings.llm_provider == "openai":
            return ChatOpenAI(
                model=settings.llm_model,
                api_key=settings.openai_api_key.get_secret_value(),
            )
        return ChatAnthropic(
            model=settings.llm_model,
            api_key=settings.anthropic_api_key.get_secret_value(),
        )
    ```
  - `_load_system_prompt() -> str`: reads `prompts/lawyer.md` relative to project root
  - `build_lawyer_agent() -> CompiledGraph`:
    ```python
    from langgraph.prebuilt import create_react_agent

    def build_lawyer_agent() -> CompiledGraph:
        return create_react_agent(
            model=get_llm(),
            tools=[rag_search],
            state_modifier=_load_system_prompt(),
            response_format=WorkerResponse,   # langgraph >= 0.6
        )
    ```
  - Module-level lazy singleton:
    ```python
    _lawyer: CompiledGraph | None = None

    def get_lawyer_agent() -> CompiledGraph:
        global _lawyer
        if _lawyer is None:
            _lawyer = build_lawyer_agent()
        return _lawyer
    ```
  - `invoke_lawyer(query: str) -> WorkerResponse`:
    ```python
    def invoke_lawyer(query: str) -> WorkerResponse:
        result = get_lawyer_agent().invoke(
            {"messages": [HumanMessage(content=query)]}
        )
        return result["structured_response"]   # set by response_format=WorkerResponse
    ```
  - **Fallback note**: if `response_format` is not supported by the installed langgraph version,
    replace with a two-step chain: run `create_react_agent` (no `response_format`), extract the
    final AI message text, then call
    `get_llm().with_structured_output(WorkerResponse).invoke(final_message)` to structure it.
  - Status:
  - Comments:

### 7. REPL Integration

- [ ] **Update `main.py`** — Wire Lawyer agent into the REPL loop
  - Import `invoke_lawyer` from `agents.lawyer`
  - Replace the echo `print(f"Echo: {user_input}")` with:
    ```python
    response = invoke_lawyer(user_input)
    if not response.found:
        print(f"Відповідь не знайдена. Тема поза межами бази знань.")
    else:
        print(f"\nВідповідь: {response.answer}")
        print(f"Впевненість: {response.confidence:.0%}")
        if response.sources:
            print("Джерела:")
            for src in response.sources:
                print(f"  • {src.title}  [{src.doc_id}]")
        if response.needs_human:
            print(f"\n⚠ Потрібна консультація фахівця: {response.needs_human_reason}")
    ```
  - Keep Phase-0 graceful exit handling unchanged (EOF, KeyboardInterrupt, `exit`/`quit`)
  - Status:
  - Comments:

### 8. Run Ingestion

- [ ] **Populate Qdrant `laws` collection** — prerequisite for end-to-end test
  - Prerequisites: `docker compose up -d` (Qdrant on port 6333), `OPENAI_API_KEY` in `.env`
  - Run: `python -m ingest.run_ingest --collection laws`
  - Expected output: progress logs + final `{"collection": "laws", "chunks_ingested": N}` with N
    in the thousands
  - Verify via Qdrant dashboard at `http://localhost:6333/dashboard`: `laws` collection exists
    with correct point count
  - Status:
  - Comments:

---

## Testing Strategy

**Unit tests (no external services, no API keys required):**
- `tests/test_schemas.py` — All Pydantic validators and edge cases; especially the three-branch
  `ResearchPlan` model_validator
- `tests/test_retriever.py` — Mock `QdrantClient.search` and `EmbeddingModel.embed_query`;
  verify `Chunk` conversion and metadata filtering

**Import/syntax checks (no services):**
```bash
python -m py_compile schemas.py retrieval/embeddings.py retrieval/qdrant_client.py \
  retrieval/retriever.py ingest/chunkers.py ingest/pipeline.py tools/rag.py \
  agents/lawyer.py main.py
```

**Integration test (requires Docker + `OPENAI_API_KEY`):**
- `python -m ingest.run_ingest --collection laws` — completes without error
- `python main.py` → ask "Що таке тендерна документація за Законом 922?" → expect structured
  answer with at least one source

---

## Acceptance Criteria

1. All Phase 1 files pass syntax check: `python -m py_compile <file>` exits 0 for every new file
2. `python -c "from schemas import WorkerResponse, ResearchPlan, GraphState; print('OK')"` prints OK
3. `pytest tests/test_schemas.py tests/test_retriever.py -q` — all tests pass, no external deps needed
4. `python -m ingest.run_ingest --collection laws` completes and reports >0 chunks ingested (requires Qdrant + OpenAI key)
5. `python main.py` accepts a Ukrainian procurement law question and prints a structured `WorkerResponse` with non-empty `answer` and at least one `Source` (requires Qdrant indexed + OpenAI key)
6. Response is a valid `WorkerResponse` model — confidence between 0–1, topic = "legal"

---

## Validation Commands

```bash
# 1. Syntax check all Phase 1 modules
python -m py_compile schemas.py \
  retrieval/embeddings.py retrieval/qdrant_client.py retrieval/retriever.py \
  ingest/chunkers.py ingest/pipeline.py \
  tools/rag.py agents/lawyer.py main.py

# 2. Schema import sanity check
python -c "
from schemas import Source, WorkerResponse, SubTask, ResearchPlan, \
                    CritiqueResult, EscalationOutput, GraphState
print('schemas OK')
"

# 3. Agent import check
python -c "from agents.lawyer import build_lawyer_agent; print('lawyer OK')"

# 4. Unit tests (no external deps)
pytest tests/test_schemas.py tests/test_retriever.py -q

# 5. Data ingestion (requires: docker compose up -d, OPENAI_API_KEY in .env)
python -m ingest.run_ingest --collection laws

# 6. End-to-end REPL (requires: Qdrant indexed, OPENAI_API_KEY)
python main.py
```

---

## Notes

- **Phase 1 has NO StateGraph / checkpointer**: `build_lawyer_agent()` uses LangGraph's
  `create_react_agent`, which returns a `CompiledGraph` internally, but the REPL calls it as a
  black-box via `invoke_lawyer()`. The full `StateGraph` with Planner + Critic edges is built in
  Phase 2.
- **`GraphState` defined now but unused in Phase 1**: Its shape is correct so Phase 2 graph nodes
  have a valid type contract. Do not simplify it or use `dict` shortcuts.
- **Law JSONL chunk IDs are final**: `scripts/create_procurement_law_dataset.py` already generates
  deterministic SHA256 IDs. `chunk_law()` must pass them through unchanged. Only `chunk_article()`
  generates new IDs for article sub-splits.
- **Qdrant point IDs**: The SHA256 hex strings from the JSONL are used directly as Qdrant point
  IDs (Qdrant accepts string IDs since v1.1). Do not convert to integers.
- **OpenAI key required for embeddings**: Even if `LLM_PROVIDER=anthropic`, embeddings use OpenAI
  (`text-embedding-3-small`). Ensure `OPENAI_API_KEY` is set in `.env`.
- **`langchain-text-splitters`**: Ships as a transitive dependency of `langchain>=1.2`. No extra
  pip install needed.
- **No new pip packages**: All Phase 1 dependencies are already in `requirements.txt`. Do not add
  new packages.
- **Langfuse**: Keys exist in `.env` and `config.py`, but are not wired in Phase 1. Do not add
  Langfuse callbacks yet (Phase 3).