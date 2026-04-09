# Homework Lesson 8

TypeScript-реалізація мультиагентної дослідницької системи з патерном `Plan -> Research -> Critique -> Write` поверх homework-lesson-5.

У проєкті є:

- `Supervisor`, який оркеструє workflow
- `Planner`, який повертає structured `ResearchPlan`
- `Researcher`, який збирає evidence через tools
- `Critic`, який повертає structured `CritiqueResult`
- HITL review для `write_report`
- RAG ingestion + retrieval для локальної knowledge base

## Реалізований flow

```text
User (REPL)
  -> Supervisor
     -> plan_research
     -> run_research
     -> critique_findings
        -> if REVISE: run_research + critique_findings again
        -> if APPROVE or revision limit reached: write_report
     -> HITL interrupt on write_report
        -> approve | edit | reject
```

Поточна семантика review:

- `approve`: зберегти звіт
- `edit`: перезапустити повний supervisor workflow на тому ж `thread_id` з урахуванням людського feedback
- `reject`: не зберігати звіт і завершити поточний run

## Структура

```text
src/
├── main.ts
├── supervisor/
│   ├── create-supervisor.ts
│   └── supervisor-tools.ts
├── agents/
│   ├── planner.ts
│   ├── researcher.ts
│   └── critic.ts
├── schemas/
│   ├── research-plan.ts
│   └── critique-result.ts
├── tools/
│   ├── langchain-tools.ts
│   ├── web-search.ts
│   ├── read-url.ts
│   ├── knowledge-search.ts
│   ├── write-report.ts
│   ├── github-list-directory.ts
│   └── github-get-file-content.ts
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

## Prompt vs Guardrails

Межа відповідальності така:

- `src/config/prompts.ts`: роль, стиль, очікувана поведінка агента
- `src/config/agent-policy.ts`: code-enforced guardrails
- `src/supervisor/create-supervisor.ts`: фактичний orchestration, HITL wiring, interrupt/resume

Тобто prompts підказують моделі, що робити, але не є джерелом істини для інваріантів workflow. Ліміти recursion, кількість revision rounds і allowed HITL decisions забезпечуються кодом.

## Конфігурація

Скопіюй `.env.example` у `.env` і заповни мінімум:

```bash
OPENAI_API_KEY=...
```

Опційно:

- `GITHUB_TOKEN` для GitHub tools
- `COHERE_API_KEY` для reranking
- параметри RAG, recursion limits і supervisor policy з `.env.example`

Ключові env-параметри:

- `MODEL_NAME`
- `MAX_ITERATIONS`
- `QDRANT_URL`
- `QDRANT_COLLECTION`
- `KNOWLEDGE_TOP_K`
- `KNOWLEDGE_RERANK_TOP_N`
- `SUPERVISOR_MAX_RESEARCH_REVISIONS`
- `SUPERVISOR_MIN_RECURSION_LIMIT`
- `PLANNER_RECURSION_LIMIT`
- `CRITIC_RECURSION_LIMIT`

## Встановлення

```bash
npm install
```

## Запуск

Інгест knowledge base:

```bash
npm run ingest
```

Інтерактивний REPL:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run start
```

## Validation

Доступні команди:

```bash
npm run check
npm run invariant:check
npm run rag:check
npm run validate
```

Що покриває validation:

- TypeScript typecheck
- архітектурні інваріанти
- Planner structured output
- Critic path з `REVISE`
- deterministic multi-agent workflow
- HITL interrupt/resume для `write_report`
- RAG ingestion
- RAG retrieval

`rag:check` навмисно використовує deterministic smoke для Supervisor/HITL, а не flaky live LLM сценарій.

## Приклад interaction

```text
You: Explain RAG and save a report.

Supervisor
  Planner started
  Planner finished
  Researcher started
  Researcher finished
  Critic started
  Critic finished
  Waiting for human review

Human Review Required
File: rag_report.md
Allowed decisions: approve, edit, reject

Review decision (approve/edit/reject): edit
Your feedback: add stronger evidence and tighten the summary

Supervisor
  Supervisor restarted the full revision cycle
  ...
  Waiting for human review
```

## Важливі деталі

- `Researcher` не має доступу до `write_report`; збереженням керує тільки `Supervisor`
- `Planner` і `Critic` працюють через structured schemas з `zod`
- HITL interrupt/resume використовує `MemorySaver` і стабільний `thread_id`
- `edit` у review не редагує файл вручну в CLI, а запускає новий supervisor cycle

## Корисні файли

- Архітектурний контракт: `docs/ARCHITECTURE.md`
- Delivery checklist: `docs/DELIVERY_CHECKLIST.md`
- TypeScript notes: `docs/README_TYPESCRIPT.md`
