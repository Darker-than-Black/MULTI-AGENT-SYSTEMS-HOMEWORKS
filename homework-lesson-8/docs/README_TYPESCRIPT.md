# Домашнє завдання: мультиагентна дослідницька система (TypeScript adaptation)

Цей документ є TypeScript-адаптацією поточного `README.md`.
Кореневий `README.md` не змінюється: тут зібрано чернетку опису під реальний стек проєкту `homework-lesson-8`.

---

## Мета

Розширити поточного Research Agent з попереднього домашнього завдання до **мультиагентної системи** з Supervisor, який координує трьох спеціалізованих субагентів за патерном:

`Plan -> Research -> Critique`

---

## Що змінюється порівняно з попереднім станом

| Було | Стає |
| - | - |
| Один LangChain agent | Supervisor + 3 субагенти |
| Один агент виконує весь flow | Planner планує, Researcher досліджує, Critic перевіряє |
| Один прохід | Ітеративний цикл з можливістю revision |
| Звичайний запис звіту | HITL-підтвердження перед `write_report` |
| Текстовий вивід | Structured output для Planner і Critic |

---

## Поточний стек

- Мова: `TypeScript`
- Runtime: `Node.js`
- Agent framework: `langchain` JS
- Structured output: `zod`
- Model: `ChatOpenAI`
- Local knowledge layer: `Qdrant + BM25 + hybrid retrieval + optional Cohere rerank`
- CLI: `src/main.ts`
- Ingestion entrypoint: `src/rag/ingest.ts`

---

## Цільова архітектура

```text
User (CLI / REPL)
  |
  v
Supervisor Agent
  |
  +- 1. plan(request)      -> Planner Agent      -> structured ResearchPlan
  |
  +- 2. research(plan)     -> Research Agent     -> findings
  |
  +- 3. critique(findings) -> Critic Agent       -> structured CritiqueResult
  |      |
  |      +- verdict=APPROVE -> go to report writing
  |      \- verdict=REVISE  -> return to research with feedback
  |
  \- 4. write_report(...)   -> HITL gated
```

Ключовий патерн: **evaluator-optimizer**.  
Supervisor керує циклом, Critic валідовує результат, а Researcher доопрацьовує його за потреби.

---

## Що потрібно реалізувати

### 1. Planner Agent

Planner декомпозує user request у структурований план дослідження.

Для TypeScript-версії:

- використовується `createAgent(...)`
- structured output задається через `responseFormat`
- схема описується через `zod`

Приклад shape:

```ts
import { z } from "zod";

export const ResearchPlanSchema = z.object({
  goal: z.string(),
  searchQueries: z.array(z.string()),
  sourcesToCheck: z.array(z.enum(["knowledge_base", "web"])),
  outputFormat: z.string(),
});
```

Planner:

- може використовувати `web_search`
- може використовувати `knowledge_search`
- повертає `structuredResponse`

Supervisor має викликати Planner першим кроком.

### 2. Research Agent

Research Agent перевикористовує існуючий evidence-first flow.

Інструменти:

- `web_search`
- `read_url`
- `knowledge_search`

Research Agent:

- слідує плану Planner
- комбінує local knowledge base і web evidence
- повертає findings у стабільному форматі, який можна передати Critic

RAG layer з `src/rag/*` перевикористовується без перенесення логіки в agent layer.

### 3. Critic Agent

Critic виконує незалежну перевірку findings.

Він має перевіряти:

1. `freshness`
2. `completeness`
3. `structure`

Structured output для Critic:

```ts
import { z } from "zod";

export const CritiqueResultSchema = z.object({
  verdict: z.enum(["APPROVE", "REVISE"]),
  isFresh: z.boolean(),
  isComplete: z.boolean(),
  isWellStructured: z.boolean(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  revisionRequests: z.array(z.string()),
});
```

Critic використовує ті самі evidence tools, що й Research Agent:

- `web_search`
- `read_url`
- `knowledge_search`

Critic не просто коментує текст, а проводить незалежну верифікацію через ті ж джерела.

### 4. Supervisor Agent

Supervisor координує цикл:

1. виклик `plan`
2. виклик `research`
3. виклик `critique`
4. якщо `REVISE` -> ще один виклик `research` з feedback
5. якщо `APPROVE` -> формування фінального markdown report
6. виклик `write_report`

Обмеження:

- максимум 2 раунди доопрацювання після critic feedback

Supervisor не повинен містити retrieval logic. Його роль: orchestration.

### 5. HITL для `write_report`

Операція запису має бути захищена Human-in-the-Loop middleware.

У JS/TS-стеку це виглядає через:

- `humanInTheLoopMiddleware(...)`
- `MemorySaver`
- `Command({ resume: ... })`

Очікуваний flow:

- Supervisor готує фінальний report
- при спробі викликати `write_report` виникає interrupt
- CLI показує preview звіту
- користувач обирає:
  - `approve`
  - `edit`
  - `reject`
- після `edit` Supervisor отримує feedback і генерує нову версію звіту

### 6. Prompts та config

Prompts усіх ролей мають жити окремо від orchestration logic.

Рекомендовано винести:

- prompt Supervisor
- prompt Planner
- prompt Researcher
- prompt Critic

у `src/config/*` або `src/agents/prompts/*`.

Конфігурація середовища залишається в:

- `src/config/env.ts`
- `.env`

---

## Рекомендована TS-структура проєкту

Нижче наведено цільову структуру саме для TypeScript-реалізації:

```text
homework-lesson-8/
├── src/
│   ├── main.ts
│   ├── supervisor/
│   │   ├── create-supervisor.ts
│   │   └── supervisor-tools.ts
│   ├── agents/
│   │   ├── planner.ts
│   │   ├── researcher.ts
│   │   ├── critic.ts
│   │   └── prompts.ts
│   ├── schemas/
│   │   ├── research-plan.ts
│   │   ├── critique-result.ts
│   │   └── index.ts
│   ├── tools/
│   │   ├── langchain-tools.ts
│   │   ├── web-search.ts
│   │   ├── read-url.ts
│   │   ├── knowledge-search.ts
│   │   └── write-report.ts
│   ├── rag/
│   │   ├── ingest.ts
│   │   ├── retriever.ts
│   │   ├── store.ts
│   │   └── types.ts
│   ├── config/
│   │   └── env.ts
│   └── utils/
├── docs/
├── data/
├── output/
└── package.json
```

Це не жорсткий контракт по іменах файлів, а рекомендований напрямок для структурування відповідальностей.

---

## Важлива адаптація з Python на TypeScript

У Python-версії вимоги описані через:

- `Pydantic`
- `response_format`
- `HumanInTheLoopMiddleware`
- `InMemorySaver`
- `main.py`

У TypeScript-версії відповідники такі:

- `Pydantic` -> `zod`
- `response_format` -> `responseFormat`
- `structured_response` -> `structuredResponse`
- `HumanInTheLoopMiddleware` -> `humanInTheLoopMiddleware(...)`
- `InMemorySaver` -> `MemorySaver`
- `main.py` -> `src/main.ts`

Тобто логіка завдання зберігається, але API та організація коду мають відповідати JS/TS стеку.

---

## Очікуваний результат

1. Ingestion працює через `npm run ingest`
2. Planner повертає структурований `ResearchPlan`
3. Researcher виконує план із використанням local + web evidence
4. Critic повертає структурований `CritiqueResult`
5. Якщо verdict=`REVISE`, Supervisor запускає ще один research round
6. Якщо verdict=`APPROVE`, Supervisor готує markdown report
7. `write_report` проходить через HITL approval flow
8. Після `approve` звіт зберігається в `output/`

---

## Команди валідації

Поточний основний entrypoint:

```bash
npm run validate
```

Всередині `scripts/` можуть існувати допоміжні leaf validations, але публічна команда для повного локального прогону одна: `npm run validate`.
