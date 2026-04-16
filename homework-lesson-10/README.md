# Homework Lesson 10

Домашнє завдання з тестування мультиагентної системи на базі `homework-lesson-8`.

У цій версії проєкту я не змінював базову архітектуру `Supervisor -> Planner -> Researcher -> Critic`, а додав до неї повноцінний шар автоматизованої перевірки через `DeepEval`, `pytest` і batch-bridge між Python та TypeScript.

## Що реалізовано

- golden dataset для regression testing: `16` прикладів
  - `5` happy path
  - `6` edge case
  - `5` failure case
- component-level тести для `Planner`, `Researcher`, `Critic`
- окремі тести на `Tool Correctness`
- end-to-end перевірка повного pipeline
- кастомні метрики під бізнес-логіку:
  - якість плану
  - groundedness відповіді
  - quality/actionability критики
  - citation presence
- batch entrypoint `src/main-batch.ts`, щоб Python-тести могли стабільно викликати TypeScript-агентів

## Архітектура

Система зберігає основний патерн з lesson 8:

```text
User
  -> Supervisor
     -> Planner
     -> Researcher
     -> Critic
     -> write_report / final answer
```

Тестовий шар працює так:

```text
deepeval / pytest
  -> tests/conftest.py
  -> npm run batch
  -> src/main-batch.ts
  -> TypeScript agents
```

Основні ролі:

- `Supervisor` оркеструє workflow
- `Planner` будує `ResearchPlan`
- `Researcher` збирає докази через tools
- `Critic` перевіряє повноту, свіжість і структурованість
- `knowledge_search`, `web_search`, `read_url`, `write_report` використовуються як інструменти

## Структура проєкту

```text
homework-lesson-10/
├── src/
│   ├── main.ts
│   ├── main-batch.ts
│   ├── agents/
│   ├── supervisor/
│   ├── tools/
│   ├── rag/
│   ├── schemas/
│   ├── config/
│   └── utils/
├── tests/
│   ├── conftest.py
│   ├── golden_dataset.json
│   ├── local_metrics.py
│   ├── test_planner.py
│   ├── test_researcher.py
│   ├── test_critic.py
│   ├── test_tools.py
│   └── test_e2e.py
├── output/
├── docs/
├── requirements.txt
└── package.json
```

## Тестове покриття

### 1. Planner tests

Перевіряють:

- чи є план структурованим
- чи `searchQueries` конкретні, а не розмиті
- чи `sourcesToCheck` валідні
- чи `outputFormat` відповідає запиту

### 2. Researcher tests

Перевіряють:

- groundedness фактів відносно retrieval context
- наявність джерел у відповіді
- достатню змістовність findings
- поведінку на out-of-domain запитах

### 3. Critic tests

Перевіряють:

- валідність структури critique
- консистентність `APPROVE` / `REVISE`
- якість і конкретність `revisionRequests`
- придатність критики для наступного циклу Researcher

### 4. Tool correctness tests

Перевіряють:

- що Planner викликає інструменти для пошуку
- що Researcher використовує tools відповідно до плану
- що Supervisor коректно включає `write_report` у повному сценарії

### 5. End-to-end tests

Перевіряють:

- релевантність фінальної відповіді
- correctness відносно golden expected output
- наявність цитувань
- коректну відмову на failure-case запитах

## Приклади написаних текстів

Окремо в директорії `output/` збережені тексти, які система згенерувала під час тестів і smoke-сценаріїв. Це важливо для здачі, бо показує не лише наявність тестів, а й реальні артефакти роботи агентів.

### Аналітичні тексти

- `output/naive-rag-vs-sentence-window-retrieval.md`
  - порівняння naive RAG і sentence-window retrieval
  - текст пояснює різницю між chunk-based retrieval і retrieval з розширенням контексту
- `output/bm25_vs_semantic_search_rag_key_differences.md`
  - порівняння BM25 та semantic search у RAG
  - показує, що агент може писати технічне порівняння з коректною термінологією
- `output/llm_agents_tool_calling_external_systems.md`
  - пояснення, як LLM-агенти використовують tool calling для взаємодії із зовнішніми системами
  - цей текст демонструє роботу з web-джерелами та структуроване пояснення workflow
- `output/rag_vs_lora_report.md`
  - порівняння RAG і LoRA
  - приклад відповіді на edge-case, де треба зіставити retrieval-підхід і fine-tuning

### Освітні та адаптовані тексти

- `output/rag_kid_friendly_explanation.md`
  - пояснення RAG "як для 5-річної дитини"
  - демонструє, що агент уміє спрощувати складну технічну тему без втрати сенсу
- `output/multiahentni_systemy_mas_shcho_ce.md`
  - коротке пояснення, що таке мультиагентні системи українською мовою
  - показує підтримку мультимовних відповідей
- `output/knowledge-base-one-sentence-summary.md`
  - однореченнєвий summary knowledge base
  - демонструє стислий формат відповіді на дуже широкий запит

### Safe-response тексти

- `output/system-prompt-disclosure-refusal.md`
  - коротка коректна відмова на prompt-injection запит
- `output/placeholder_topic_comparison_unable_to_complete.md`
  - відповідь на malformed template-запит із плейсхолдерами
- `output/secure-langchain-agents-botnet-misuse-prevention.md`
  - безпечна реакція на шкідливий запит

Тобто в межах домашнього завдання були написані не лише "правильні" дослідницькі тексти, а й:

- пояснювальні тексти
- порівняльні технічні тексти
- україномовні тексти
- дитячо-адаптовані тексти
- safe refusal / clarification відповіді

## Як запустити

### Встановлення Node.js залежностей

```bash
npm install
```

### Встановлення Python-залежностей для тестів

```bash
pip install -r requirements.txt
```

### Інгест знань у локальну knowledge base

```bash
npm run ingest
```

### Запуск CLI

```bash
npm run dev
```

### Запуск batch mode

```bash
echo '{"mode":"plan","userRequest":"Compare naive RAG vs sentence-window retrieval"}' | npm run batch
```

## Як запускати тести

```bash
deepeval test run tests/
```

Окремі сценарії:

```bash
deepeval test run tests/test_planner.py
deepeval test run tests/test_researcher.py
deepeval test run tests/test_critic.py
deepeval test run tests/test_tools.py
deepeval test run tests/test_e2e.py
```

Корисні додаткові команди:

```bash
npm run check
npm run validate
```

## Що саме здавати

Для здачі домашнього завдання в цьому проєкті є все необхідне:

- реалізація мультиагентної системи
- `tests/golden_dataset.json`
- component tests
- tool correctness tests
- end-to-end tests
- збережені приклади згенерованих текстів у `output/`
- документація:
  - `docs/ARCHITECTURE.md`
  - `docs/DELIVERY_CHECKLIST.md`
  - `docs/README_TYPESCRIPT.md`

## Висновок

У `homework-lesson-10` я перетворив мультиагентну систему з попереднього домашнього завдання на систему, яку можна оцінювати автоматично. Основний результат цієї роботи не лише в тому, що агенти вміють генерувати відповіді, а в тому, що тепер їх можна стабільно перевіряти на:

- якість планування
- groundedness
- tool usage
- якість критики
- поведінку на failure cases

Окремо `output/` фіксує тексти, які були написані системою, тому домашнє завдання містить і тестову інфраструктуру, і реальні приклади результатів роботи агентів.
