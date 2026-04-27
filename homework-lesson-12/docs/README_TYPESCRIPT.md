# Домашнє завдання: Langfuse observability (TypeScript adaptation)

Цей документ описує, як виконувати `homework-lesson-12` у поточному TypeScript-проєкті.
Кореневий [README.md](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/README.md) формулює вимоги домашнього завдання, а тут зафіксовано TS-специфічний план інтеграції в наявну мультиагентну систему.

---

## Мета

Підключити `Langfuse` до поточної MAS-реалізації так, щоб:

- кожен запуск Supervisor workflow створював один верхньорівневий trace;
- усі вкладені LLM/tool/sub-agent виклики потрапляли в те саме trace-дерево;
- trace мав `sessionId`, `userId` і за потреби `tags`;
- system prompts більше не жили тільки в `src/config/prompts.ts`, а завантажувалися з Langfuse Prompt Management;
- нові traces автоматично оцінювалися через Langfuse Evaluators.

---

## Поточний стан проєкту

Станом на зараз `homework-lesson-12` уже має робочу TypeScript MAS:

- `Supervisor -> Planner -> Researcher -> Critic`
- `LangChain` / `LangGraph` orchestration
- `Qdrant` + локальний knowledge base
- HITL review для `write_report`
- smoke checks і базову regression-інфраструктуру з попереднього homework

Але для lesson 12 ще бракує таких речей:

- online evaluators налаштовуються в UI, але під них треба підготувати коректні traces і вже стабільні prompts;
- треба зібрати фінальні submission assets: traces, sessions, prompts, scores.

---

## Поточний стек

| Шар | Поточна технологія |
|---|---|
| Runtime | `Node.js` + `TypeScript` |
| Agent framework | `langchain` + `@langchain/langgraph` |
| LLM | `ChatOpenAI` |
| Retrieval | `Qdrant`, hybrid retrieval, optional rerank |
| Structured output | `zod` |
| CLI / orchestration | `src/main.ts`, `src/supervisor/*` |
| Validation | `npm run validate`, smoke scripts, DeepEval baseline |

Для lesson 12 до цього стеку треба додати щонайменше:

- `@langfuse/client`
- `@langfuse/langchain`
- `@langfuse/tracing`

---

## Де інтегрувати Langfuse в цьому коді

```text
src/
├── main.ts
├── main-batch.ts
├── supervisor/
│   ├── create-supervisor.ts
│   └── supervisor-tools.ts
├── agents/
│   ├── planner.ts
│   ├── researcher.ts
│   └── critic.ts
├── config/
│   ├── env.ts
│   └── prompts.ts
└── utils/
```

Ключові точки інтеграції:

- [src/config/env.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/config/env.ts)
  Тут мають читатися `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` і, за потреби, додаткові runtime-прапори для observability.

- [src/main.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/main.ts)
  Це головний interactive entrypoint. Тут зручно стартувати top-level trace, генерувати `sessionId`, `userId`, `tags` і передавати їх у весь workflow.

- [src/main-batch.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/main-batch.ts)
  Якщо batch-режим використовується для smoke/eval запусків, його теж потрібно обгорнути в Langfuse tracing, інакше частина запусків не потрапить у observability pipeline.

- [src/supervisor/create-supervisor.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/supervisor/create-supervisor.ts)
  Саме тут викликається `createAgent(...)` для Supervisor. Це одна з головних точок підключення LangChain `CallbackHandler`.

- `src/agents/planner.ts`, `src/agents/researcher.ts`, `src/agents/critic.ts`
  Усі агентні `createAgent(...)` виклики мають працювати з Langfuse callbacks і отримувати prompts уже не з hardcoded constants, а з Prompt Management.

- [src/config/prompts.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/config/prompts.ts)
  Це тимчасовий baseline. Після міграції цей файл або стає thin adapter над Langfuse client, або втрачає роль джерела prompt-текстів.

---

## Що саме змінюється в lesson 12

| Було | Стає |
|---|---|
| Prompts у коді | Prompts у Langfuse Prompt Management |
| Локальні smoke/eval перевірки | Додатково traces і online eval у Langfuse |
| CLI просто запускає workflow | CLI запускає workflow всередині Langfuse trace context |
| Якість видно лише з локальних тестів | Якість видно ще й через Traces, Sessions, Users, Scores |

---

## 1. Environment Variables

У `.env` вже є базові Langfuse ключі:

```env
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Що треба зробити в TypeScript:

1. Додати ці змінні в [src/config/env.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/config/env.ts).
2. Переконатися, що їхня відсутність або:
   - явно ламає Langfuse-enabled runtime, або
   - відключає tracing у контрольований спосіб.
3. Не дублювати читання `process.env` по всьому проєкту поза `src/config/env.ts`.

Рекомендовані нові exports:

```ts
export const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY || "";
export const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY || "";
export const LANGFUSE_BASE_URL = readStringEnv(
  "LANGFUSE_BASE_URL",
  "https://us.cloud.langfuse.com",
);
```

---

## 2. Tracing у LangChain / LangGraph

За офіційною документацією Langfuse для LangChain JS/TS tracing підключається через `CallbackHandler`, а top-level workflow зручно обгортати через `@langfuse/tracing`.

TS-орієнтована схема для цього проєкту:

1. Ініціалізувати Langfuse client один раз.
2. Створити `CallbackHandler` для LangChain.
3. На верхньому рівні запуску Supervisor створити root observation / trace.
4. Усередині trace викликати `propagateAttributes(...)`, щоб `sessionId`, `userId`, `tags`, `traceName` успадкувалися всіма дочірніми викликами.
5. Передавати `callbacks: [langfuseHandler]` у `agent.invoke(...)` / `chain.invoke(...)`.

Практично це означає:

- `main.ts` має відкривати top-level trace для кожного user request;
- `main-batch.ts` має робити те саме для batch requests;
- Supervisor і агенти мають виконуватися з підключеним handler.

Приблизна форма інтеграції:

```ts
import { CallbackHandler } from "@langfuse/langchain";
import { startActiveObservation, propagateAttributes } from "@langfuse/tracing";

const handler = new CallbackHandler();

await startActiveObservation("supervisor-run", async () => {
  await propagateAttributes(
    {
      traceName: "supervisor-run",
      sessionId,
      userId,
      tags: ["homework-12", "cli"],
    },
    async () => {
      await supervisor.invoke(input, {
        callbacks: [handler],
        configurable: { thread_id: threadId },
      });
    },
  );
});
```

Ключова вимога: trace wrapper має бути на вході у workflow, а не десь усередині окремого tool або одного агента.

---

## 3. Session і User tracking

У цьому проєкті вже є природні ідентифікатори:

- `threadId` для LangGraph resume flow;
- user input cycle у `main.ts`;
- batch request context у `main-batch.ts`.

Рекомендований mapping:

- `sessionId`
  Для interactive CLI або стабільний ID на одну CLI-сесію, або `threadId`, якщо кожен запит вважається окремою сесією.

- `userId`
  Для домашнього завдання достатньо технічного значення на кшталт `local-user` або `student-<name>`.

- `tags`
  Наприклад: `["homework-12", "cli"]`, `["homework-12", "batch"]`, `["homework-12", "rag"]`.

Важливо:

- `sessionId` треба прокидати рано, до першого LLM/tool call;
- `threadId` не обов’язково дорівнює `sessionId`, але обидва мають бути узгодженими;
- для HITL resume слід використовувати той самий `threadId` і той самий `sessionId`, щоб trace/session не розірвалися.

---

## 4. Prompt Management у TypeScript

Кореневий README описує Prompt Management загально, але в TypeScript-проєкті тут треба орієнтуватися на Langfuse JS/TS SDK, а не на Python-приклади.

Поточний стан:

- у [src/config/prompts.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/config/prompts.ts) лишився тільки metadata registry `key -> prompt name/type/required variables`;
- runtime loader вже існує в [src/lib/langfuse-prompts.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/lib/langfuse-prompts.ts) і робить `client.prompt.get(..., { label: "production" })`;
- локальний prompt text і fallback path прибрані з runtime-коду;
- prompts уже існують у Langfuse з label `production`, а runtime path підтверджений без `Prompt not found` warning для `plan` route.

Поточний inventory:

- `homework-12/supervisor-system`
  - type: `text`
  - variables: `{{max_research_revisions}}`
  - consumer: [src/supervisor/create-supervisor.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/supervisor/create-supervisor.ts)
- `homework-12/planner-system`
  - type: `text`
  - variables: none
  - consumer: [src/agents/planner.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/agents/planner.ts)
- `homework-12/researcher-system`
  - type: `text`
  - variables: none
  - consumers: [src/agents/researcher.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/agents/researcher.ts), [src/agent/memory.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/agent/memory.ts)
- `homework-12/critic-system`
  - type: `text`
  - variables: none
  - consumer: [src/agents/critic.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/agents/critic.ts)

Рекомендований підхід:

1. Підтримувати всі 4 prompts напряму в Langfuse UI або через зовнішній API workflow.
2. Для всіх робочих версій мати label `production`.
3. Для `supervisor` використовувати `prompt.compile({ max_research_revisions })`.
4. Для `planner`, `researcher`, `critic` використовувати прямий текстовий prompt без додаткової параметризації.

Приклад для JS/TS SDK:

```ts
import { LangfuseClient } from "@langfuse/client";

const langfuse = new LangfuseClient();

const supervisorPrompt = await langfuse.prompt.get("homework-12/supervisor-system", {
  label: "production",
});
const compiledSupervisorPrompt = supervisorPrompt.compile({
  max_research_revisions: "2",
});
```

Для цього конкретного кодбейсу найпростіше:

- залишити `src/config/prompts.ts` лише як metadata registry;
- не дублювати новий naming окремо в коді, бо він уже зафіксований у `SYSTEM_PROMPT_DEFINITIONS`;
- агенти мають отримувати вже resolved/compiled prompt text із `resolveSystemPrompt(...)`.

Після міграції важливо, щоб у `src/config/prompts.ts` не лишався жоден локальний дубль prompt-контенту.

---

## 5. Які файли найімовірніше доведеться змінити

- [package.json](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/package.json)
  Додати Langfuse залежності.

- [src/config/env.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/config/env.ts)
  Додати Langfuse env vars.

- `src/lib/langfuse.ts`
  Новий модуль для singleton client, handler factory, prompt access helpers.

- [src/config/prompts.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/config/prompts.ts)
  Перетворити на Langfuse-backed prompt loader.

- [src/main.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/main.ts)
  Додати top-level trace wrapper, `sessionId`, `userId`.

- [src/main-batch.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/main-batch.ts)
  Повторити те саме для batch-запусків.

- [src/supervisor/create-supervisor.ts](/Users/demon/Desktop/mas/MULTI-AGENT-SYSTEMS-HOMEWORKS/homework-lesson-12/src/supervisor/create-supervisor.ts)
  Підключити Langfuse callbacks у Supervisor invoke path.

- `src/agents/*.ts`
  Підключити Langfuse-backed prompts і переконатися, що callbacks доходять до кожного агентного invoke.

---

## 6. Online Evaluation через Langfuse

Ця частина переважно налаштовується в UI, але код повинен дати якісні traces.

Що потрібно від рантайму:

- зрозумілий trace input;
- зрозумілий final output;
- стабільні `sessionId` / `userId`;
- осмислена назва trace, наприклад `supervisor-cli-run` або `supervisor-batch-run`;
- без розірваних піддерев між supervisor, tools і subagents.

Що потрібно в Langfuse UI:

1. Створити мінімум 2 evaluator'и.
2. Налаштувати prompts evaluator'ів через `{{input}}` і `{{output}}`.
3. Запустити 3-5 нових traces.
4. Перевірити появу scores у trace details.

Для цього проєкту логічні evaluator-и:

- `answer_relevance`
- `groundedness`
- `report_structure`

DeepEval із попереднього homework можна залишити як локальний regression gate, але lesson 12 вимагає саме Langfuse online evaluation поверх нових traces.

---

## 7. Валідація після інтеграції

Базові команди залишаються такими:

```bash
npm ci
npm run validate
```

Після додавання Langfuse треба перевірити ще й runtime-сценарії:

```bash
npm run dev
```

Мінімальний acceptance checklist:

1. Зробити 3-5 запусків через CLI або batch.
2. У Langfuse `Tracing -> Traces` побачити 3-5 traces.
3. Усередині trace побачити LLM/tool/sub-agent дерево.
4. У `Sessions` побачити групування traces.
5. У `Users` побачити `userId`.
6. У `Prompts` побачити всі agent prompts.
7. У `Scores` побачити автоматичні evaluator results.

---

## 8. Що не треба ламати

Під час lesson 12 не слід руйнувати наявний baseline:

- `npm run validate` має залишитися зеленим;
- HITL review для `write_report` має працювати як і раніше;
- `threadId` resume flow не можна зламати tracing-обгорткою;
- RAG ingestion/retrieval path не повинен змішувати observability-код із retrieval business logic;
- prompts не повинні дублюватися в двох місцях як рівноправні джерела істини.

---

## 9. Відповідність README.md -> TypeScript реалізація

| Вимога homework | Де реалізовувати в TS-проєкті |
|---|---|
| Tracing | `main.ts`, `main-batch.ts`, `src/supervisor/*`, `src/agents/*` |
| Session/User tracking | top-level runtime wrapper + Langfuse attribute propagation |
| Prompt Management | `src/config/prompts.ts` + Langfuse prompt store |
| LLM-as-a-Judge | Langfuse UI evaluators + коректні trace input/output |
| Screenshots | вручну після реальних запусків |

---

## Джерела

Цей документ спирається на офіційну документацію Langfuse для JS/TS:

- LangChain tracing integration: https://langfuse.com/integrations/frameworks/langchain
- Prompt Management get started: https://langfuse.com/docs/prompt-management/get-started
- Sessions / attribute propagation: https://langfuse.com/docs/observability/features/sessions
- TypeScript instrumentation: https://langfuse.com/docs/observability/sdk/instrumentation

---

## Maintenance Rule

Якщо змінюється спосіб підключення Langfuse, source of truth для prompts, схема `sessionId` / `userId`, або runtime entrypoints, цей документ треба оновлювати в тому самому коміті.
