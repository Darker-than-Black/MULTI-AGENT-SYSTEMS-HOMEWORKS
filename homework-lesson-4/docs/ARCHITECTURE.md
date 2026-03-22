# Architecture Contract (MVP)

This document defines the target minimal architecture for `homework-lesson-4` (TypeScript) and serves as a technical implementation contract.

## 1) Module Boundaries

- `src/agent/*`
  - Owns the ReAct loop orchestration, message lifecycle, `tool_calls` handling, and iteration termination.
  - Must not contain tool-specific business logic.
- `src/tools/*`
  - Contains only tool implementations: `web_search`, `read_url`, `write_report`, e.g.
  - Must not manage agent iteration flow or call the LLM directly.
- `src/config/*`
  - Centralized environment variable loading and normalization.
- `src/utils/*`
  - Cross-cutting utilities (logging, truncation, filename sanitization).
- `src/main.ts`
  - CLI entry point: captures user input, invokes the agent, prints results.

## 2) Core Interfaces (Source of Truth)

The following types define the canonical system contract:

- `AgentMessage` (discriminated union):
  - `system`: `{ role: "system", content }`
  - `user`: `{ role: "user", content }`
  - `assistant`: `{ role: "assistant", content, toolCalls? }`
  - `tool`: `{ role: "tool", name, toolCallId, content, isError? }`
- `ToolCall` (function tool call payload):
  - `{ id, type: "function", function: { name, arguments } }`
- `ToolExecutionResult`:
  - `{ toolCallId, toolName, ok, output, toolMessage }`
- `LlmTurnResult`
- `RunAgentTurnInput`
- `RunAgentTurnOutput`

Source file: `src/agent/types.ts`.

## 3) Data Flow (Baseline Scenario)

1. `main.ts` receives user input.
2. `runAgentTurn(...)` appends a user message to session memory.
3. `llm-client` sends `messages` + JSON Schema tools to the provider API (`tool_choice: "auto"`) and returns an `assistantMessage` (optionally with `assistantMessage.toolCalls`).
4. `tool-dispatcher` resolves and executes tools via `tools/index.ts`.
5. Tool execution results are normalized and appended to `messages` as canonical role `tool` messages.
6. The loop continues until final answer or `MAX_ITERATIONS`.
7. `main.ts` outputs the final assistant response.

## 4) Architectural Invariants (Non-Negotiable)

- Only `run-agent.ts` controls ReAct loop iterations.
- `tools/*` are decoupled from LLM API concerns and conversation memory.
- `llm-client.ts` must never execute tools; it only adapts provider responses to `LlmTurnResult`.
- All tool arguments must be routed through `tool-dispatcher.ts`.
- Every tool call must be logged: tool name, arguments, result/error.
- Tool/API failures must not crash the process; termination must remain controlled.

## 5) Definition of Done by Delivery Block

### Block 0: Base Contract
- File/module structure is aligned with this document.
- `npm run check` passes.

### Block 1: Tools + JSON Schema
- All three tools are implemented.
- JSON Schemas are synchronized with runtime argument contracts.
- `write_report` persists files to `output/`.

### Block 2: LLM Client Integration
- A real provider API call path is operational (`src/agent/llm-client.ts`).
- `messages` and `tools` are sent in a single API request.
- Provider responses are normalized to internal `LlmTurnResult` (`assistant text` + validated `tool_calls`).
- An adapter layer (`src/agent/llm-adapter.ts`) isolates raw provider payload parsing from client transport logic.
- API error handling covers rate limits, connection failures/timeouts, and invalid response shape.

### Block 3: ReAct Loop Core
- End-to-end loop `LLM -> tools -> LLM` is functional.
- `MAX_ITERATIONS` guardrail is enforced.
- Explicit stop conditions prevent infinite loops (e.g., repeated identical tool-call plans).
- At least one scenario demonstrates 3-5+ tool calls in a single request.
- Loop termination is deterministic: final answer fallback is provided even when assistant text is empty.
- Block validation includes:
  - static guardrail checks for loop limit and anti-loop stop conditions,
  - an optional live multi-step scenario when API credentials are available.

### Block 4: Memory + Interactive CLI
- Interactive multi-turn CLI is functional.
- In-session conversational memory is preserved across turns.

### Block 5: Prompt Engineering
- System prompt is upgraded with explicit role, structured directives, and behavioral constraints.
- Tool-usage quality is measurably improved vs. baseline prompt.

### Block 6: Hardening + E2E Validation
- Step-level logging is complete and readable.
- Error handling prevents unhandled crashes.
- End-to-end scenario completes with report generation in `output/`.

## 6) Document Maintenance Rule

If any of the following change:
- module boundaries,
- type contracts,
- data flow,

then `docs/ARCHITECTURE.md` must be updated in the same commit.

## 7) Operational Enforcement

- Block closure must follow `docs/DELIVERY_CHECKLIST.md`.
- Use `npm run block:check -- <block-id>` to enforce:
  - `npm run check`
  - `npm run invariant:check`
  - block-specific smoke/E2E
- Local git hooks (`pre-commit`, `pre-push`) enforce architecture sync and invariant checks.
