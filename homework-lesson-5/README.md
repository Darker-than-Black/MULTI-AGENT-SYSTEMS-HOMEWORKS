# Homework Lesson 5 (TypeScript): LangChain Research Agent

TypeScript CLI research agent built on LangChain `createAgent` with a compact architecture and real tools.

## Implemented Scope

- LangChain agent orchestration (`createAgent`) with recursion guard.
- Multi-turn CLI with in-memory session context.
- Real tools:
  - `web_search`
  - `read_url`
  - `write_report`
  - `github_list_directory` (code review helper for a target repository path)
  - `github_get_file_content` (read file content from a target repository path)
- Tool contracts via LangChain tools + Zod schemas.
- Report generation to `output/` with date-based file names.

## Project Setup

Requirements:

- Node.js `>=20`
- npm `>=10`

Install:

```bash
cd homework-lesson-5
npm ci
```

Environment:

```bash
cp .env.example .env
```

Required:

- `OPENAI_API_KEY` for LLM calls.

Optional:

- `GITHUB_TOKEN` for higher GitHub API limits (public repository read may work without it, but with stricter rate limits).

## Run

Development CLI:

```bash
npm run dev
```

Type check:

```bash
npm run check
```

Build + start:

```bash
npm run build
npm run start
```

## Validation and Definition of Done

Architecture contract and acceptance criteria are fixed in:

- `docs/ARCHITECTURE.md`
- `docs/DELIVERY_CHECKLIST.md`

Validation commands:

```bash
npm run invariant:check
npm run block:check -- 0
npm run block:check -- 1
npm run block:check:all
```

Each block is considered complete only after:

- `npm run check`
- invariants pass
- block-specific smoke/E2E check pass

## Architecture Change Enforcement

The repository enforces architecture sync when boundaries/contracts change:

- PR template checkbox: update `docs/ARCHITECTURE.md` when needed.
- Local git hooks (`pre-commit`, `pre-push`) verify sync + invariants.

Install hooks locally:

```bash
npm run hooks:install
```

Manual architecture sync checks:

```bash
npm run arch:check:staged
npm run arch:check:upstream
```

## GitHub Actions (CI)

CI validates the same quality gates on `push`/`pull_request` for `homework-lesson-5`:

- dependency install
- `npm run check`
- `npm run invariant:check`
- `npm run block:check:all`

Workflow file:

- `.github/workflows/homework-lesson-4-ci.yml`

## Notes for Code Review Use-Case

To review a public repository subpath (for example `.../tree/main/homework-lesson-5`), the agent should:

1. call `github_list_directory` for the target path;
2. call `github_get_file_content` for selected files;
3. produce findings and optionally save a markdown report via `write_report`.
