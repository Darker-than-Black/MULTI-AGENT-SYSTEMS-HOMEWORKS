## Summary

<!-- Briefly describe what changed and why -->

## Checklist

- [ ] I updated `docs/ARCHITECTURE.md` if module boundaries or type contracts changed.
- [ ] Block Definition of Done is completed (`npm run check` + block-specific smoke/E2E).
- [ ] I explicitly reviewed architectural invariants:
  - [ ] ReAct loop control is implemented only in `src/agent/run-agent.ts` (CLI input loop in `src/main.ts` is allowed).
  - [ ] `src/tools/*` is decoupled from direct LLM execution concerns.
  - [ ] `src/agent/tool-dispatcher.ts` is the single tool execution entrypoint.
