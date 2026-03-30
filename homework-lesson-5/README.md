# Homework Lesson 5: Research Agent with RAG

`homework-lesson-5` extends the TypeScript research agent with a local knowledge base and hybrid retrieval.

The agent can now:

- search the web with `web_search`
- read pages with `read_url`
- write markdown reports with `write_report`
- search the local knowledge base with `knowledge_search`

## What Is Implemented

- `src/rag/ingest.ts`
  - loads PDF and TXT documents from `data/`
  - splits them into chunks
  - generates embeddings with OpenAI
  - stores dense vectors in Qdrant
  - persists a local corpus for BM25 retrieval
- `src/rag/retriever.ts`
  - semantic retrieval from Qdrant
  - BM25 lexical retrieval from the local corpus
  - hybrid fusion of both result sets
  - optional Cohere reranking when `COHERE_API_KEY` is configured
- `src/tools/knowledge-search.ts`
  - thin tool adapter for local knowledge retrieval
- agent prompt updates
  - the agent is instructed when to use `knowledge_search` vs `web_search`

## Project Structure

```text
homework-lesson-5/
├── src/
│   ├── agent/
│   ├── config/
│   ├── rag/
│   │   ├── ingest.ts
│   │   ├── retriever.ts
│   │   ├── store.ts
│   │   └── types.ts
│   ├── tools/
│   │   ├── knowledge-search.ts
│   │   └── langchain-tools.ts
│   └── main.ts
├── data/
├── docs/
├── scripts/
├── output/
└── .rag/
```

## Environment

Required:

```env
OPENAI_API_KEY=
QDRANT_URL=http://localhost:6333
```

Optional:

```env
GITHUB_TOKEN=
MODEL_NAME=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
QDRANT_COLLECTION=knowledge-base
COHERE_API_KEY=
RERANK_MODEL=rerank-v3.5
KNOWLEDGE_DATA_DIR=data
KNOWLEDGE_CORPUS_PATH=.rag/knowledge-corpus.json
CHUNK_SIZE=1200
CHUNK_OVERLAP=200
KNOWLEDGE_TOP_K=6
KNOWLEDGE_RERANK_TOP_N=4
MAX_ITERATIONS=10
TEMPERATURE=0.2
OUTPUT_DIR=output
```

Notes:

- `QDRANT_API_KEY` is not used in the current local setup.
- `COHERE_API_KEY` is optional. Without it, retrieval still works, but reranking is skipped.

## Run Locally

Install dependencies:

```bash
npm install
```

Start Qdrant locally, then run ingestion:

```bash
npm run ingest
```

Start the interactive CLI:

```bash
npm run dev
```

## Docker

The project includes:

- `Dockerfile.app`
- `Dockerfile.qdrant`
- `docker-compose.yml`

Run both services:

```bash
docker compose up --build
```

## Validation

Base checks:

```bash
npm run check
npm run invariant:check
```

RAG validation:

```bash
npm run smoke:rag:ingest
npm run smoke:rag:retrieval
npm run smoke:rag:agent
npm run rag:check
```

Legacy block validation is still available:

```bash
npm run block:check -- 6
```

## Current Result

The current implementation already supports:

- offline ingestion into Qdrant
- local BM25 corpus persistence
- hybrid retrieval
- agent integration through `knowledge_search`
- end-to-end smoke validation for ingestion, retrieval, and agent usage

Optional enhancement:

- enable Cohere reranking by setting `COHERE_API_KEY`
