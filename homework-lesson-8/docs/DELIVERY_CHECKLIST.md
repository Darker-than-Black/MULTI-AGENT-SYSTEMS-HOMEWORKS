# Delivery Checklist (Implementation Plan + Definition of Done)

This checklist reflects the agreed implementation plan for `homework-lesson-8`.
It is aligned with the current TypeScript target architecture and the single public validation entrypoint: `npm run validate`.

## Shared Gates

A change set is not complete until:

- `npm run validate` passes
- architecture sync checks pass in git hooks
- `docs/ARCHITECTURE.md` is updated when module boundaries or contracts change
- relevant manual review of validation output was done, not only command execution

## Block 0. Tech Debt + Alignment

Goal: stabilize the project baseline before multi-agent work starts.

- [ ] Automation scripts are aligned with `homework-lesson-8` and do not point to previous lessons.
- [ ] Validation surface is minimized to one public npm command: `npm run validate`.
- [ ] Unused or duplicated validation scripts are removed.
- [ ] `package.json` scripts reflect the current validation model.
- [ ] `README`-level TypeScript draft exists under `docs/`.
- [ ] `docs/ARCHITECTURE.md` reflects the current target TypeScript architecture.
- [ ] `docs/DELIVERY_CHECKLIST.md` reflects the current implementation plan.

Definition of done:

- [ ] No broken references to removed validation scripts remain.
- [ ] `npm run validate` passes on the current baseline.

## Block 1. Target Architecture Design

Goal: formalize the TypeScript module layout and responsibilities.

- [ ] The target module structure is fixed in documentation.
- [ ] Supervisor responsibilities are separated from agent role responsibilities.
- [ ] Planner, Researcher, and Critic ownership boundaries are documented.
- [ ] The location of `schemas`, `prompts`, `tools`, `rag`, and `config` is fixed.
- [ ] The expected handoff contracts between agents are described.

Definition of done:

- [ ] `docs/ARCHITECTURE.md` is sufficient to implement the agreed file structure without guessing.

## Block 2. Structured Output Layer

Goal: define stable structured contracts for planning and critique.

- [ ] A `ResearchPlan` schema is defined in `src/schemas/*`.
- [ ] A `CritiqueResult` schema is defined in `src/schemas/*`.
- [ ] Schema naming follows TypeScript conventions while preserving the required semantics.
- [ ] Findings format passed from Researcher to Critic is explicitly defined.
- [ ] Structured outputs are designed for LangChain JS `responseFormat` usage.

Definition of done:

- [ ] Planner and Critic structured outputs can be validated independently of orchestration.

## Block 3. Planner Agent

Goal: implement the planning role as a dedicated agent.

- [ ] Planner agent is created via LangChain `createAgent`.
- [ ] Planner prompt is role-specific and not mixed with other agents.
- [ ] Planner can use `web_search` and `knowledge_search`.
- [ ] Planner returns `ResearchPlan` as structured output.
- [ ] Supervisor-facing `plan(...)` wrapper contract is defined.

Definition of done:

- [ ] A user request can be decomposed into a structured plan suitable for downstream research.

## Block 4. Research Agent Refactor

Goal: convert the current single-agent runtime into the Researcher role.

- [ ] Existing evidence-first behavior is preserved.
- [ ] Research Agent is isolated as a dedicated subagent.
- [ ] Research Agent uses `web_search`, `read_url`, and `knowledge_search`.
- [ ] Research Agent can consume the initial plan from Planner.
- [ ] Research Agent can consume revision requests from Critic.
- [ ] RAG integration remains delegated through tool adapters.

Definition of done:

- [ ] Research findings can be generated from both the first-pass plan and critic revision feedback.

## Block 5. Critic Agent

Goal: add an evaluator that independently validates research quality.

- [ ] Critic agent is created via LangChain `createAgent`.
- [ ] Critic prompt explicitly evaluates freshness, completeness, and structure.
- [ ] Critic can use the same evidence tools as Research Agent.
- [ ] Critic receives the original user request together with findings.
- [ ] Critic returns `CritiqueResult` as structured output.
- [ ] Verdict rules for `APPROVE` vs `REVISE` are explicit.

Definition of done:

- [ ] Critic can issue concrete revision requests instead of generic comments.

## Block 6. Supervisor Orchestration

Goal: implement the multi-agent control loop.

- [ ] Supervisor agent is created as the orchestration layer.
- [ ] Supervisor always starts with Planner.
- [ ] Supervisor passes plan output into Researcher.
- [ ] Supervisor passes findings plus original request into Critic.
- [ ] Supervisor handles `REVISE` by re-invoking Researcher with critic feedback.
- [ ] Supervisor enforces the maximum number of revision rounds.
- [ ] Supervisor prepares the final markdown report when critique is approved.

Definition of done:

- [ ] The runtime supports at least one full cycle of `Plan -> Research -> Critique -> Research -> Critique -> Report`.

## Block 7. HITL Save Flow

Goal: gate persistence behind explicit user approval.

- [ ] `write_report` is protected with HITL middleware.
- [ ] A checkpointer is configured for interrupt/resume behavior.
- [ ] `thread_id` is used consistently across the interaction.
- [ ] CLI surfaces pending save actions clearly.
- [ ] CLI supports `approve`, `edit`, and `reject`.
- [ ] `edit` re-enters the Supervisor flow rather than mutating files outside the agent loop.

Definition of done:

- [ ] The report is not saved until the user explicitly approves it.

## Block 8. Prompts + Config Hardening

Goal: centralize and harden prompts and runtime configuration.

- [ ] Supervisor, Planner, Researcher, and Critic prompts are centralized.
- [ ] Prompt responsibilities are not duplicated inline across multiple modules.
- [ ] `src/config/env.ts` remains the single environment entrypoint.
- [ ] Any new multi-agent runtime config is documented in code and docs.
- [ ] Prompt wording is aligned with tool availability and orchestration rules.

Definition of done:

- [ ] Prompts and config can be updated independently from the orchestration code without hidden coupling.

## Block 9. Validation + Final Hardening

Goal: ensure the multi-agent implementation is testable and reviewable.

- [ ] `npm run validate` still passes after multi-agent changes.
- [ ] Validation covers ingestion.
- [ ] Validation covers retrieval.
- [ ] Validation covers agent integration with `knowledge_search`.
- [ ] Validation is extended to cover Supervisor orchestration.
- [ ] Validation is extended to cover HITL interrupt/resume behavior.
- [ ] Validation output is manually reviewed.

Definition of done:

- [ ] The validation suite covers the critical runtime path for the current implementation stage.

## Explicit Review Checklist

During implementation review, verify these items explicitly:

- [ ] Supervisor orchestration is not mixed with low-level retrieval logic.
- [ ] Planner, Researcher, and Critic are separate role-specific agents.
- [ ] Structured outputs live in `src/schemas/*`.
- [ ] `knowledge_search` delegates to the RAG layer.
- [ ] `src/tools/*` remains decoupled from agent orchestration concerns.
- [ ] `src/rag/*` remains decoupled from `src/supervisor/*` and `src/agents/*`.
- [ ] CLI/HITL logic lives in `src/main.ts` and not inside the retrieval layer.
- [ ] Report persistence is gated by explicit approval.

## Maintenance Rule

If the implementation plan changes materially, update this document in the same commit as the architectural or validation changes
