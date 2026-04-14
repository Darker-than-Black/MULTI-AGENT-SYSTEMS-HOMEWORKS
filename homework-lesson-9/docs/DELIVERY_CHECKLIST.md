# Delivery Checklist (Implementation Plan + Definition of Done)

This checklist reflects the implementation plan for `homework-lesson-9`.
It is aligned with the TypeScript target architecture based on MCP for tools and ACP for agent-to-agent delegation.

## Shared Gates

A change set is not complete until:

- `npm run validate` passes
- architecture sync checks pass in git hooks
- `docs/ARCHITECTURE.md` is updated when transport boundaries or contracts change
- relevant manual review of validation output was done, not only command execution

## Current Status

- [x] `Block 2. MCP Search Server` is implemented and validated
- [x] Local agents reach `SearchMCP` through a thin MCP client/proxy layer
- [x] The factual TS runtime also includes `GitHubMCP` for repository evidence used by `Researcher`
- [x] `Block 3. MCP Report Server` is implemented and validated
- [x] `Block 4. ACP server` is implemented and validated
- [x] `Block 7. Supervisor ACP delegation` is implemented and validated

## Block 0. Baseline Alignment

Goal: remove `hw8` assumptions from docs and runtime expectations before protocol work starts.

- [ ] Docs reference `homework-lesson-9`, not `homework-lesson-8`
- [ ] The target architecture is documented as MCP + ACP, not local subagent-tools
- [ ] Validation docs describe protocol-based runtime surfaces
- [ ] Environment/config docs include protocol runtime settings
- [ ] Runtime naming is aligned across docs, scripts, and package metadata

Definition of done:

- [ ] No documentation describes local-only supervisor-to-subagent wrappers as the target architecture

## Block 1. Protocol Architecture Design

Goal: formalize the runtime split between Supervisor, MCP servers, and ACP server.

- [ ] SearchMCP responsibilities are documented
- [ ] ReportMCP responsibilities are documented
- [ ] ACP server responsibilities are documented
- [ ] Supervisor responsibilities are documented separately from ACP agents
- [ ] Runtime topology and communication graph are documented
- [ ] Handoff contracts between Supervisor, ACP agents, and MCP servers are explicit
- [ ] Planner input contract is fixed to `userRequest`
- [ ] Researcher input contract is fixed to `userRequest + plan + critiqueFeedback?`
- [ ] Critic input contract is fixed to `userRequest + findings + plan`
- [ ] HITL ownership is fixed to local Supervisor only

Definition of done:

- [ ] `docs/ARCHITECTURE.md` is sufficient to implement the protocol topology without guessing

## Block 2. MCP Search Server

Goal: expose evidence tools through MCP instead of local registration.

- [x] SearchMCP server bootstrap exists
- [x] `web_search` is exposed through SearchMCP
- [x] `read_url` is exposed through SearchMCP
- [x] `knowledge_search` is exposed through SearchMCP
- [x] `resource://knowledge-base-stats` is exposed
- [x] `resource://knowledge-base-stats` computes `documentCount` from unique `source` values in `.rag/knowledge-corpus.json`
- [x] `resource://knowledge-base-stats` fails if the corpus is missing
- [x] SearchMCP reuses the existing RAG-backed `knowledge_search` logic
- [x] Existing local agents call SearchMCP through a thin MCP client/proxy layer
- [x] SearchMCP is built with `@modelcontextprotocol/sdk`, not a handwritten protocol server

Definition of done:

- [x] A client can discover and invoke all SearchMCP tools and resources
- [x] Current local agents can reach SearchMCP through the transitional proxy/client wiring

## Block 2a. MCP GitHub Server

Goal: move repository evidence access behind a dedicated MCP endpoint, aligned with the same transport boundary used for search evidence.

- [x] GitHubMCP server bootstrap exists
- [x] `github_list_directory` is exposed through GitHubMCP
- [x] `github_get_file_content` is exposed through GitHubMCP
- [x] `resource://github-api-status` is exposed
- [x] Researcher reaches GitHubMCP through a thin MCP client/proxy layer
- [x] GitHubMCP is built with `@modelcontextprotocol/sdk`, not a handwritten protocol server

Definition of done:

- [x] A client can discover and invoke all GitHubMCP tools and resources
- [x] Current local researcher wiring can reach GitHubMCP through the transitional proxy/client layer

## Block 3. MCP Report Server

Goal: move report persistence behind a dedicated MCP endpoint.

- [x] ReportMCP server bootstrap exists
- [x] `save_report` is exposed through ReportMCP
- [x] `resource://output-dir` is exposed
- [x] ReportMCP performs persistence only
- [x] Approval logic is not implemented inside ReportMCP

Definition of done:

- [x] Supervisor can save an approved report only through ReportMCP

## Block 4. ACP Agent Server

Goal: publish Planner, Researcher, and Critic as remote agents.

- [x] One ACP server hosts all three agents
- [x] Planner endpoint is registered
- [x] Researcher endpoint is registered
- [x] Critic endpoint is registered
- [x] Each ACP agent connects to SearchMCP through an MCP client
- [x] MCP tools are adapted for LangChain agent usage
- [x] Transitional Block 2 proxy-based MCP wiring is replaced with direct MCP interaction in the ACP agent runtime

Definition of done:

- [x] A client can discover and invoke all three ACP agent endpoints

## Block 5. Structured Contracts Across Protocols

Goal: preserve stable handoff shapes across ACP boundaries.

- [x] `ResearchPlan` remains defined in `src/schemas/*`
- [x] `FindingsEnvelope` is defined in `src/schemas/*`
- [x] `CritiqueResult` remains defined in `src/schemas/*`
- [x] Planner returns structured output through ACP
- [x] Researcher returns `FindingsEnvelope` through ACP
- [x] Critic returns structured output through ACP
- [x] Researcher findings format is explicit and stable
- [x] `FindingsEnvelope.markdown` is self-contained and critique-ready
- [x] `FindingsEnvelope.markdown` contains evidence-oriented sections
- [x] Serialization/deserialization rules are defined for ACP handoffs

Definition of done:

- [x] Structured outputs remain valid after transport serialization

## Block 6. Agent Implementations

Goal: preserve role behavior while swapping local tools for MCP-provided tools.

- [x] Planner is created via LangChain `createAgent`
- [x] Planner uses MCP-backed `web_search` and `knowledge_search`
- [x] Researcher is created via LangChain `createAgent`
- [x] Researcher uses MCP-backed `web_search`, `read_url`, and `knowledge_search`
- [x] Researcher produces markdown findings inside `FindingsEnvelope`
- [x] Critic is created via LangChain `createAgent`
- [x] Critic uses MCP-backed evidence tools
- [x] Critic consumes `plan` together with `findings`
- [x] Prompts stay role-specific and centralized

Definition of done:

- [x] Agent role behavior is preserved after the protocol migration

## Block 7. Supervisor ACP Delegation

Goal: replace local subagent-tool wrappers with ACP delegation wrappers.

- [x] Supervisor remains a local orchestration layer
- [x] Supervisor invokes Planner through ACP
- [x] Supervisor invokes Researcher through ACP
- [x] Supervisor invokes Critic through ACP
- [x] Supervisor passes `plan` into both Researcher and Critic
- [x] Supervisor does not instantiate role agents as local business logic
- [x] Supervisor keeps code-enforced revision-round limits
- [x] Supervisor prepares the final markdown report after approval from Critic

Definition of done:

- [x] The runtime supports `Plan -> Research -> Critique -> Research -> Critique -> Report` through ACP delegation

## Block 8. HITL + Report Save Flow

Goal: keep human approval local while persistence moves to ReportMCP.

- [ ] `save_report` is still gated by HITL middleware
- [ ] A checkpointer is configured for interrupt/resume behavior
- [ ] `thread_id` is stable across approve/edit/reject
- [ ] CLI surfaces pending save actions clearly
- [ ] `approve` resumes into ReportMCP persistence
- [ ] `edit` returns to Supervisor flow on the same thread
- [ ] `reject` aborts persistence cleanly
- [ ] ReportMCP does not contain approval logic

Definition of done:

- [ ] No report is persisted without explicit approval

## Block 9. Config + Runtime Hardening

Goal: centralize protocol configuration and keep boundaries explicit.

- [ ] `src/config/env.ts` includes MCP/ACP runtime settings
- [ ] `src/config/prompts.ts` remains the single prompt source
- [ ] `src/config/agent-policy.ts` remains the single workflow policy source
- [ ] Protocol endpoints are not hardcoded ad hoc across modules
- [ ] Logging and tracing can distinguish Supervisor, ACP, and MCP activity

Definition of done:

- [ ] Runtime configuration can be changed without hidden coupling across transport layers

## Block 10. Validation + Final Hardening

Goal: ensure the protocol-based architecture is testable end to end.

- [ ] `npm run validate` passes after MCP/ACP migration
- [ ] Validation covers ingestion
- [ ] Validation covers retrieval
- [ ] Validation covers SearchMCP tool/resource discovery
- [ ] Validation covers Block 2 local-agent integration through SearchMCP
- [x] Validation covers GitHubMCP tool/resource discovery
- [x] Validation covers local-agent integration through GitHubMCP
- [x] Validation covers ReportMCP tool/resource discovery
- [x] Validation covers ACP agent registration
- [x] Validation covers Planner structured output via ACP
- [x] Validation covers Critic structured output via ACP
- [x] Validation covers Supervisor orchestration through ACP
- [ ] Validation covers HITL interrupt/resume with ReportMCP save flow

Definition of done:

- [ ] The validation suite covers the critical protocol-based runtime path

## Explicit Review Checklist

During implementation review, verify these items explicitly:

- [ ] Supervisor orchestration is not mixed with retrieval implementation
- [ ] MCP transport is not mixed with tool business logic
- [ ] ACP transport is not mixed with agent role logic
- [ ] Planner, Researcher, and Critic remain separate role-specific agents
- [ ] Structured outputs live in `src/schemas/*`
- [ ] `FindingsEnvelope` is used as the Researcher -> Critic handoff
- [ ] `knowledge_search` still delegates to the RAG layer
- [ ] SearchMCP is shared across all ACP agents
- [ ] ReportMCP is used only for persistence concerns
- [ ] CLI/HITL logic remains in `src/main.ts`
- [x] Report persistence is gated by explicit approval

## Maintenance Rule

If the implementation plan changes materially, update this document in the same commit as the architectural or validation changes.
