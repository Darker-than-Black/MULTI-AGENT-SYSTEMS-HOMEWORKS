# Домашнє завдання: тестування мультиагентної системи (TypeScript adaptation)

Цей документ є TypeScript-адаптацією `README.md` для `homework-lesson-10`.  
Кореневий `README.md` описує завдання в загальному вигляді. Тут зібрано деталі, специфічні для стеку `homework-lesson-10` (TypeScript + Python test layer).

---

## Мета

Написати автоматизовані тести для мультиагентної системи з `homework-lesson-8`, використовуючи **DeepEval** та Python-тест-шар, що взаємодіє з TypeScript-агентами через subprocess.

```text
Python (deepeval test run)
  |
  v
tests/conftest.py  →  npm run batch  →  src/main-batch.ts
                                            |
                                        TypeScript agents
                                        (Planner / Researcher / Critic / Supervisor)
```

---

## Що змінюється порівняно з homework-lesson-8

| Було (homework-lesson-8)           | Стає (homework-lesson-10)                        |
|------------------------------------|--------------------------------------------------|
| Мультиагентна система без тестів   | Та сама система + покриття тестами               |
| Перевірка якості вручну            | Автоматизовані evals з метриками 0–1             |
| Немає golden dataset               | 15 golden examples для regression testing        |
| Немає CI-ready тестів              | `deepeval test run tests/` запускає всі тести    |
| Лише інтерактивний CLI (`npm run dev`) | Додано неінтерактивний batch-режим (`npm run batch`) |

---

## Поточний стек

| Шар         | Технологія                                                |
|-------------|-----------------------------------------------------------|
| Мова агентів | `TypeScript` / `Node.js`                                 |
| Agent framework | `langchain` JS                                       |
| Structured output | `zod`                                              |
| Model | `ChatOpenAI`                                                   |
| Local knowledge | `Qdrant + BM25 + hybrid retrieval + Cohere rerank`   |
| Тест-фреймворк | `DeepEval` (Python)                                 |
| Тест-runner | `pytest` + `deepeval test run`                           |
| TS↔Python bridge | `src/main-batch.ts` (stdin/stdout JSON)           |

---

## Нова TypeScript-структура проєкту

```text
homework-lesson-10/
├── src/
│   ├── main.ts                  # Інтерактивний CLI (незмінений з lesson-8)
│   ├── main-batch.ts            # НОВИЙ: неінтерактивний batch entrypoint для тестів
│   ├── supervisor/
│   │   ├── create-supervisor.ts
│   │   └── supervisor-tools.ts
│   ├── agents/
│   │   ├── planner.ts
│   │   ├── researcher.ts
│   │   └── critic.ts
│   ├── schemas/
│   │   ├── research-plan.ts
│   │   └── critique-result.ts
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
│   │   ├── env.ts
│   │   └── prompts.ts
│   └── utils/
├── tests/                       # НОВИЙ: Python тест-шар
│   ├── conftest.py              # Shared fixtures, subprocess runner, session cache
│   ├── golden_dataset.json      # 15 golden examples
│   ├── test_planner.py          # Planner agent tests
│   ├── test_researcher.py       # Researcher agent tests (groundedness)
│   ├── test_critic.py           # Critic agent tests + custom GEval metric
│   ├── test_tools.py            # Tool correctness tests
│   └── test_e2e.py              # End-to-end evaluation on golden dataset
├── data/
├── docs/
├── requirements.txt             # НОВИЙ: Python залежності
├── package.json
└── .env.example
```

---

## src/main-batch.ts — TypeScript↔Python bridge

`main-batch.ts` — це неінтерактивний entrypoint, спеціально написаний для тестів.  
Python-процес запускає `npm run batch`, передає JSON в `stdin` і читає JSON з `stdout`.

### Підтримувані режими

| `mode`             | Що виконується                                  | Що повертається                                              |
|--------------------|-------------------------------------------------|--------------------------------------------------------------|
| `"full"`           | Повний цикл Supervisor (auto-approve write_report) | `{ finalAnswer, plan, critique, toolExecutions, wroteReport }` |
| `"plan"`           | `planResearch(userRequest)`                     | `{ plan: ResearchPlan }`                                     |
| `"research"`       | `research({ userRequest, plan, critiqueFeedback? })` | `{ findings: string }`                                  |
| `"critique"`       | `critique({ userRequest, findings })`           | `{ critique: CritiqueResult }`                               |
| `"knowledge_search"` | `knowledgeSearch({ query })`                 | `{ results: string }`                                        |

### Формат запиту / відповіді

```bash
# Приклад: запустити Planner
echo '{"mode":"plan","userRequest":"Compare naive RAG vs sentence-window retrieval"}' \
  | npm run batch
```

```json
// Успішна відповідь
{ "success": true, "mode": "plan", "plan": { "goal": "...", "searchQueries": [...], ... } }

// Помилка
{ "success": false, "error": "mode=plan requires userRequest." }
```

### Auto-approve HITL у режимі "full"

У batch-режимі HITL interrupt для `write_report` підтверджується автоматично:

```typescript
let result = await superviseResearchWithOptions(query, { threadId, maxIterations });
if (result.status === "interrupted") {
  result = await resumeSupervisorWithOptions({ type: "approve" }, { threadId, maxIterations });
}
```

---

## Python тест-шар

### Встановлення залежностей

```bash
pip install -r requirements.txt
```

`requirements.txt`:
```
deepeval>=2.5.0
pytest>=8.3.0
python-dotenv>=1.1.0
httpx>=0.28.0
```

### conftest.py — ключові утиліти

| Функція / fixture        | Призначення                                                  |
|--------------------------|--------------------------------------------------------------|
| `run_agent(mode, **kw)`  | Запускає `npm run batch` через subprocess; на помилку — `pytest.skip` |
| `agent_cache` (session)  | Кеш результатів агента на рівні сесії; уникає повторних LLM-викликів |
| `cached_run(cache, ...)`  | Запускає агента тільки якщо ключ відсутній у кеші           |
| `load_golden_dataset()`  | Читає `tests/golden_dataset.json`                            |
| `parse_tool_calls(traces)` | Конвертує `ToolExecutionTrace[]` у `deepeval.test_case.ToolCall[]` |

Session fixtures (для повторного використання між тест-файлами):
- `planner_rag_result` — план для RAG-запиту
- `planner_multilingual_result` — план для україномовного запиту
- `planner_off_domain_result` — план для off-domain запиту
- `researcher_rag_result` — findings для RAG-теми
- `critique_approve_result` — критика якісних findings
- `critique_revise_result` — критика поверхневих findings

---

## Метрики та тести

### test_planner.py

- **`plan_quality_metric`** (GEval) — перевіряє специфічність запитів, валідні джерела, відповідність меті
- Структурні перевірки: `len(searchQueries) >= 2`, валідні `sourcesToCheck`, наявність усіх полів

### test_researcher.py

- **`groundedness_metric`** (GEval) — кожне фактичне твердження має бути підкріплене `retrieval_context`
- Структурна перевірка: findings мають містити джерела (URL або `Source:`)

### test_critic.py

- **`critique_quality_metric`** (GEval) — специфічність критики, консистентність вердикту
- **`critique_actionability_metric`** (GEval) — **кастомна бізнес-логічна метрика**: кожен `revisionRequest` має бути конкретним і виконуваним Researcher-агентом (не "покращити якість", а "знайти X у джерелі Y")
- Структурні перевірки: усі обов'язкові поля, `APPROVE → revisionRequests == []`

### test_tools.py

Використовує `ToolCorrectnessMetric` від DeepEval. Мінімум 3 тест-кейси:
1. Planner викликає пошуковий інструмент
2. Researcher використовує інструменти відповідно до `sourcesToCheck` в плані
3. Supervisor викликає `write_report` (режим `"full"`, auto-approve)

`ToolExecutionTrace` з TypeScript-сторони:
```typescript
interface ToolExecutionTrace {
  call: string;         // напр. 'web_search(query="LangChain RAG")'
  resultSummary: string;
}
```

### test_e2e.py

Метрики на повному golden dataset:
- `AnswerRelevancyMetric` (DeepEval built-in, threshold 0.7)
- `Correctness` (GEval, threshold 0.6)
- `Citation Presence` (кастомна GEval, threshold 0.5) — наявність URL або named source

Failure cases перевіряються інвертовано: агент **не повинен** видати релевантну відповідь (очікується refusal або score < 0.5).

---

## Адаптація з Python на TypeScript

Метрики DeepEval описані в README.md у Python-нотації. Відповідники у TypeScript-проєкті:

| README.md (Python)               | homework-lesson-10 (реалізація)                          |
|----------------------------------|----------------------------------------------------------|
| `planResearch(request)`          | `src/agents/planner.ts` → `planResearch(userRequest)`   |
| `research({ userRequest, plan })` | `src/agents/researcher.ts` → `research(input)`          |
| `critique({ userRequest, findings })` | `src/agents/critic.ts` → `critique(input)`        |
| Supervisor full pipeline         | `src/supervisor/create-supervisor.ts` → `superviseResearchWithOptions` |
| `ToolExecutionTrace`             | `src/agent/types.ts` → `{ call: string, resultSummary: string }` |
| Python subprocess invocation     | `echo '<JSON>' \| npm run batch`                        |

---

## Запуск тестів

```bash
# Встановити Python залежності (один раз)
pip install -r requirements.txt

# Запустити всі тести
deepeval test run tests/

# Запустити окремий файл
deepeval test run tests/test_planner.py

# Verbose output
deepeval test run tests/ -v

# Пропустити live agent invocation (тільки якщо є кеш)
DEEPEVAL_OFFLINE=1 deepeval test run tests/
```

> **Важливо:** перед запуском тестів Qdrant має бути запущений (`docker compose up qdrant`) і знання базу проіндексовано (`npm run ingest`). Змінні середовища зчитуються з `.env`.

---

## Команди TypeScript частини

```bash
# Запуск інтерактивного CLI (незмінений з lesson-8)
npm run dev

# Інгестація PDF у Qdrant
npm run ingest

# Batch-режим для тестів (stdin → stdout JSON)
echo '{"mode":"plan","userRequest":"What is RAG?"}' | npm run batch

# Перевірка типів
npm run check

# Повна валідація
npm run validate
```

---

## Очікуваний результат

```
$ deepeval test run tests/

Running 5 test files...

tests/test_planner.py
  ✅ test_plan_quality_happy_path       (Plan Quality: 0.85, threshold: 0.7)
  ✅ test_plan_has_specific_queries     (structural)
  ✅ test_plan_sources_valid            (structural)
  ✅ test_plan_schema_fields_present    (structural)
  ✅ test_plan_quality_edge_case_multilingual (Plan Quality: 0.72, threshold: 0.5)
  ✅ test_plan_failure_case_off_domain  (structural — empty plan or refusal)

tests/test_researcher.py
  ✅ test_research_grounded_rag_topic   (Groundedness: 0.78, threshold: 0.7)
  ✅ test_research_completeness_has_sources (structural)
  ✅ test_research_minimum_length       (structural)
  ✅ test_research_edge_case_out_of_domain (Groundedness: 0.55, threshold: 0.4)

tests/test_critic.py
  ✅ test_critique_schema_valid         (structural)
  ✅ test_critique_approve_verdict      (Critique Quality: 0.91, threshold: 0.7)
  ✅ test_critique_revise_verdict       (Critique Quality: 0.88, threshold: 0.7)
  ✅ test_critique_actionability        (Critique Actionability: 0.80, threshold: 0.7)
  ✅ test_critique_approve_no_revision_requests (structural)

tests/test_tools.py
  ✅ test_planner_uses_search_tools     (structural)
  ✅ test_researcher_uses_tools_per_plan (Tool Correctness: 1.0, threshold: 0.5)
  ✅ test_supervisor_calls_write_report (structural)

tests/test_e2e.py
  ✅ test_golden_happy_and_edge[hp_001] (Relevancy: 0.88, Correctness: 0.76, Citation: 0.90)
  ...
  ✅ test_golden_failure_case[fc_001]   (relevancy score < 0.5 or refusal detected)

==============================================
Overall: passing rate ≥ 80% is the baseline target
```

> Деякі тести можуть fail — це нормально. Мета не 100%, а мати **baseline** для подальших покращень.
