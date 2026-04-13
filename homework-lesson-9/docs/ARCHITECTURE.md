# Architecture Contract (TypeScript MCP/ACP Multi-Agent System)

This document defines the target TypeScript architecture for `homework-lesson-9`.

## 1) Target Module Structure

```text
src/
├── main.ts
├── supervisor/
│   ├── create-supervisor.ts
│   └── acp-delegation-tools.ts
├── acp/
│   ├── server.ts
│   ├── client.ts
│   └── agent-handlers.ts
├── mcp/
│   ├── search-server.ts
│   ├── report-server.ts
│   ├── search-client.ts
│   └── report-client.ts
├── agents/
│   ├── planner.ts
│   ├── researcher.ts
│   └── critic.ts
├── schemas/
│   ├── research-plan.ts
│   ├── findings-envelope.ts
│   └── critique-result.ts
├── tools/
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
│   ├── agent-policy.ts
│   └── prompts.ts
└── utils/
```

File names may vary slightly, but the boundaries below are mandatory.

## 2) Module Boundaries

- `src/main.ts`
  - Owns CLI loop only.
  - Owns thread lifecycle, streaming output, HITL prompt handling, and resume flow.
  - Must not contain retrieval logic.
  - Must not define agent roles inline.

- `src/supervisor/*`
  - Owns orchestration only.
  - Coordinates `Plan -> Research -> Critique -> Save`.
  - Owns ACP client wrappers exposed as Supervisor tools.
  - May assemble HITL middleware and checkpointing.
  - Must not contain low-level MCP server/client setup details beyond what is needed for delegation.
  - Must not contain retrieval business logic.

- `src/acp/*`
  - Owns ACP transport layer.
  - Publishes Planner, Researcher, and Critic as remotely invokable agent endpoints.
  - Contains request/response mapping between ACP payloads and local agent functions.
  - Must not contain CLI logic.
  - Must not contain direct report-writing persistence.

- `src/mcp/*`
  - Owns MCP transport layer.
  - Exposes SearchMCP and ReportMCP servers.
  - Owns MCP client creation for ACP agents and Supervisor.
  - During `Block 2`, may also own a temporary compatibility layer so current local agents can route tool calls through SearchMCP before ACP migration is complete.
  - Must not contain Supervisor workflow logic.

- `src/agents/*`
  - Owns specialized LangChain agent construction.
  - Planner, Researcher, and Critic are each created via `createAgent`.
  - Agents receive tool adapters produced from MCP client connections, not local direct tool registration.
  - Must not contain CLI flow or ACP server bootstrap.

- `src/schemas/*`
  - Owns structured contracts such as `ResearchPlan`, `FindingsEnvelope`, and `CritiqueResult`.
  - Structured output is defined with `zod`.
  - Schema modules must stay free of orchestration and transport concerns.

- `src/tools/*`
  - Owns standalone business logic only.
  - `web-search`, `read-url`, `knowledge-search`, `write-report` stay transport-agnostic.
  - These files are the implementation behind MCP tools, not the place where MCP servers are bootstrapped.
  - Must not import Supervisor, ACP, or agent orchestration modules.

- `src/rag/*`
  - Owns ingestion, vector store access, hybrid retrieval, reranking, and retrieval-specific contracts.
  - `knowledge_search` delegates here.
  - Must not import `src/supervisor/*`, `src/acp/*`, or `src/agents/*`.

- `src/config/*`, `src/utils/*`
  - Own shared config, prompt text, guardrails, helpers, and logging.
  - `src/config/env.ts` is the single environment entrypoint.
  - `src/config/prompts.ts` owns role prompts only.
  - `src/config/agent-policy.ts` owns revision caps, recursion limits, and HITL decision policy.

## 3) Runtime Topology

The system is split into four runtime surfaces:

1. Supervisor CLI runtime
2. SearchMCP server
3. ReportMCP server
4. ACP server

Expected communication graph:

```text
CLI -> Supervisor
Supervisor -> ACP Client -> ACP Server
ACP Agent -> MCP Client -> SearchMCP
Supervisor -> MCP Client -> ReportMCP
```

SearchMCP is shared by Planner, Researcher, and Critic.
ReportMCP is used by Supervisor for persistence only.

Transitional rule:

- In `Block 2`, existing local agents are allowed to access SearchMCP through a thin MCP client/proxy layer.
- In `Block 4`, ACP agents must switch to direct MCP interaction as the steady-state architecture.

## 4) Core Flows

### Supervisor Runtime Flow

1. `main.ts` reads user input and creates a stable `thread_id`.
2. Supervisor starts the orchestration flow.
3. Supervisor calls Planner through ACP.
4. ACP Planner uses SearchMCP tools and returns structured `ResearchPlan`.
5. Supervisor calls Researcher through ACP.
6. ACP Researcher uses SearchMCP tools and returns `FindingsEnvelope`.
7. Supervisor calls Critic through ACP with `userRequest + findings + plan`.
8. ACP Critic uses SearchMCP tools and returns structured `CritiqueResult`.
9. If verdict is `REVISE`, Supervisor calls Researcher again with critic feedback.
10. If verdict is `APPROVE`, Supervisor prepares the final markdown report.
11. Before persistence, Supervisor triggers HITL review.
12. After `approve`, Supervisor saves through ReportMCP.
13. `edit` or `reject` must resume on the same `thread_id`.

### SearchMCP Flow

1. MCP server boots once.
2. It registers `web_search`, `read_url`, and `knowledge_search`.
3. It exposes `resource://knowledge-base-stats`.
4. During `Block 2`, local agents may reuse the same MCP endpoint through a compatibility proxy.
5. In the final architecture, ACP agents reuse the same MCP endpoint concurrently without local legacy wrappers.

### ReportMCP Flow

1. MCP server boots once.
2. It registers `save_report`.
3. It exposes `resource://output-dir`.
4. It performs persistence only after Supervisor approval.

### Offline Ingestion Flow

1. A dedicated ingestion command runs `src/rag/ingest.ts`.
2. Documents from `data/` are chunked and indexed.
3. Vector and lexical retrieval state are persisted.
4. Interactive runtime never performs full ingestion during an agent turn.

## 5) Structured Output Contract

The following structured outputs must exist in `src/schemas/*`:

- `ResearchPlan`
  - goal
  - search queries
  - sources to check
  - desired output format

- `FindingsEnvelope`
  - markdown findings payload
  - evidence-oriented sections
  - self-contained content suitable for Critic without extra hidden context

- `CritiqueResult`
  - verdict
  - freshness assessment
  - completeness assessment
  - structure assessment
  - strengths
  - gaps
  - revision requests

Planner, Researcher, and Critic must preserve these semantics across ACP boundaries.

## 6) Transport Contract

### MCP Contract

- SearchMCP tools:
  - `web_search`
  - `read_url`
  - `knowledge_search`

- SearchMCP resources:
  - `resource://knowledge-base-stats`
  - payload fields:
    - `collection`
    - `corpusPath`
    - `documentCount`
    - `updatedAt`

- ReportMCP tools:
  - `save_report`

- ReportMCP resources:
  - `resource://output-dir`

### ACP Contract

ACP server must expose three distinct remote roles:

- `planner`
- `researcher`
- `critic`

Expected handoffs:

- Supervisor -> Planner: original user request
- Planner -> Supervisor: `ResearchPlan`
- Supervisor -> Researcher: user request + `ResearchPlan` + optional revision requests
- Researcher -> Supervisor: `FindingsEnvelope`
- Supervisor -> Critic: original user request + `FindingsEnvelope` + `ResearchPlan`
- Critic -> Supervisor: `CritiqueResult`

Canonical first-version contracts:

- `PlannerInput`
  - `userRequest: string`

- `ResearcherInput`
  - `userRequest: string`
  - `plan: ResearchPlan`
  - `critiqueFeedback?: string[]`

- `CriticInput`
  - `userRequest: string`
  - `findings: FindingsEnvelope`
  - `plan: ResearchPlan`

## 7) Library Reuse Rule

Use already installed libraries before introducing custom transport code.

Current findings from the local environment:

- `@langchain/openai@1.4.3` already includes MCP-related support via `tools.mcp(...)` for OpenAI remote MCP integration.
- Current project dependencies do not yet include `@modelcontextprotocol/sdk`.
- Current codebase does not expose a ready-made generic LangChain adapter that replaces the need for our own thin MCP client wiring in the current `createAgent(...)` flow.

Therefore:

- SearchMCP server should be built on `@modelcontextprotocol/sdk`.
- Existing `src/tools/*` business logic should be reused as-is.
- Any project-local MCP client layer should remain thin and focused on adapting protocol calls to the current agent/tool runtime.
- We should not re-implement MCP protocol behavior manually if the SDK already provides the server/client primitives.

## 8) Configuration Contract

The following categories of config must exist in `src/config/env.ts`:

- agent runtime config
  - example: `OPENAI_API_KEY`, `MODEL_NAME`

- ingestion and retrieval config
  - example: `EMBEDDING_MODEL`, `CHUNK_SIZE`, `QDRANT_URL`, `QDRANT_COLLECTION`

- workflow policy config
  - example: revision round caps, recursion limits, HITL decision config

- protocol runtime config
  - example: MCP ports, ACP port, host names, endpoint URLs, output directory

Role prompts for Supervisor, Planner, Researcher, and Critic must remain centralized.

## 9) Invariants

- Supervisor orchestration is isolated from retrieval implementation.
- Tool business logic is isolated from MCP transport bootstrap.
- Agent role logic is isolated from ACP transport bootstrap.
- Planner, Researcher, and Critic are each instantiated via LangChain `createAgent`.
- Planner and Critic structured outputs come from `zod` schemas in `src/schemas/*`.
- Researcher output is a structured `FindingsEnvelope`, not an arbitrary string.
- `knowledge_search` remains an adapter over the RAG layer.
- `src/rag/*` remains decoupled from Supervisor and transport modules.
- SearchMCP serves all three ACP agents.
- SearchMCP stats compute `documentCount` from unique `source` values in `.rag/knowledge-corpus.json`.
- If the knowledge corpus is missing, `resource://knowledge-base-stats` must fail rather than return a fake empty success state.
- ReportMCP is used only for report persistence concerns.
- `save_report` remains gated by HITL before persistence.
- HITL lives only in local Supervisor orchestration, never inside ReportMCP.
- Resume flow preserves `thread_id`.
- Transitional `Block 2` MCP proxies are allowed, but they must be removed or bypassed in favor of direct MCP interaction by `Block 4`.

## 10) Validation Expectations

The public validation entrypoint remains:

- `npm run validate`

Validation coverage must include:

- ingestion
- retrieval
- SearchMCP tool registration
- ReportMCP tool registration
- MCP resource exposure
- Block 2 local-agent integration through SearchMCP proxy/client wiring
- ACP agent registration
- Planner structured output across ACP
- Critic structured output across ACP
- Supervisor orchestration through ACP delegation
- HITL save flow through ReportMCP

## 11) Maintenance Rule

If transport boundaries, runtime topology, handoff contracts, or validation scope change, update this document in the same commit.
