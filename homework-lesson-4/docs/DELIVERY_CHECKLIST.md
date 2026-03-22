# Delivery Checklist (Definition of Done + Automation)

This checklist operationalizes Section 5 of `docs/ARCHITECTURE.md`.

A block can be marked as completed only after:
- `npm run check` passes,
- architecture invariants pass (`npm run invariant:check`),
- block-specific smoke/E2E passes.

## How to Validate a Block

Run:

```bash
npm run block:check -- <block-id>
```

Example:

```bash
npm run block:check -- 0
```

## Block Closure Checklist

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

## Explicit Code Review Invariant Checks

During code review, verify and annotate these items explicitly:
- [ ] ReAct loop control remains only in `src/agent/run-agent.ts`.
- [ ] `src/tools/*` remains decoupled from direct LLM execution concerns.
- [ ] `src/agent/tool-dispatcher.ts` remains the single tool execution entrypoint.
