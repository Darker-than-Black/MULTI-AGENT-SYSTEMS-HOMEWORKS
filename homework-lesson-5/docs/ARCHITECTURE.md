# Architecture Contract (LangChain)

This document defines the minimal architecture for `homework-lesson-5`.

## 1) Module Boundaries

- `src/agent/*`
  - Owns agent setup via LangChain `createAgent`, prompt wiring, and session message conversion.
  - Must not contain tool business logic.
- `src/tools/*`
  - Contains standalone tool implementations only: `web_search`, `read_url`, `write_report`, `github_list_directory`, `github_get_file_content`.
  - Must not import `openai` or `src/agent/*`.
  - `src/tools/langchain-tools.ts` is the only allowed place to import `langchain` for tool registration.
- `src/main.ts`
  - CLI loop only: read input, call `runAgentTurn`, print answer, optional manual report save.
- `src/config/*`, `src/utils/*`
  - Env config and shared utility helpers.

## 2) Core Flow

1. `main.ts` collects user text.
2. `runAgentTurn(...)` appends user message to in-memory session.
3. LangChain agent (`createAgent`) runs model + tools with recursion limit.
4. Final AI message is returned to CLI.
5. CLI optionally saves markdown report if it was not saved by tool call.

## 3) Invariants

- `run-agent.ts` must initialize a LangChain agent with `createAgent`.
- Legacy manual-loop files must not exist:
  - `src/agent/llm-client.ts`
  - `src/agent/llm-adapter.ts`
  - `src/agent/tool-dispatcher.ts`
  - `src/tools/index.ts`
  - `src/tools/schemas.ts`
  - `src/tools/validation.ts`
- `src/tools/*` remains decoupled from agent/OpenAI dependencies.
- Only `src/tools/langchain-tools.ts` may import `langchain`.
- Session memory keeps bounded history (`MAX_SESSION_MESSAGES`) and truncates long message content.

## 4) Maintenance Rule

If boundaries, data flow, or agent contract change, update this document in the same commit.
