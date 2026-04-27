# Delivery Checklist (Lesson 12 Langfuse Roadmap)

Цей документ є робочим планом для `homework-lesson-12`.
Його ціль: провести проєкт від поточного TypeScript-baseline до повністю виконаного домашнього завдання з `Langfuse observability`, без пропуску критичних кроків.

---

## Shared Gates

Робота не вважається завершеною, доки одночасно виконуються всі умови:

- `npm run validate` проходить повністю
- tracing у Langfuse працює для реальних запусків MAS
- traces мають `sessionId` і `userId`
- усі system prompts агентів завантажуються з Langfuse, а не живуть як final source of truth у коді
- налаштовано мінімум 2 Langfuse evaluator'и
- є 4 скріншоти для здачі

---

## Block 0. Baseline Freeze

Goal: зафіксувати стабільний стартовий стан перед Langfuse-інтеграцією.

- [x] Переконатися, що `npm ci` завершився без помилок.
- [x] Переконатися, що `npm run validate` проходить end-to-end.
- [x] Переконатися, що `Qdrant` піднімається автоматично через smoke suite.
- [x] Переконатися, що поточний Supervisor flow працює без Langfuse.
- [x] Зафіксувати, які саме файли будемо змінювати для lesson 12.

Definition of done:

- [x] Є зелений baseline, до якого можна повертатися після кожного етапу інтеграції.

Frozen baseline snapshot:

- `npm ci` успішно встановлює залежності.
- `npm run validate` проходить повністю станом на `2026-04-27`.
- `Qdrant` доступний через `scripts/ensure-qdrant.sh` і використовується RAG smoke suite.
- Поточний runtime pre-Langfuse: у `package.json` ще немає `@langfuse/*` залежностей.
- Поточний Supervisor/HITL flow підтверджено через `scripts/smoke-multi-agent-flow.sh`.
- Основні lesson-12 цільові файли для наступних етапів:
- `package.json`
- `src/config/env.ts`
- `src/main.ts`
- `src/main-batch.ts`
- `src/supervisor/create-supervisor.ts`
- `src/agents/planner.ts`
- `src/agents/researcher.ts`
- `src/agents/critic.ts`
- `src/config/prompts.ts`
- новий Langfuse helper модуль (`src/lib/langfuse.ts`)

---

## Block 1. Langfuse Cloud Setup

Goal: підготувати Langfuse project і ключі доступу.

- [x] Зареєструватися в `us.cloud.langfuse.com`.
- [x] Створити окремий project для `homework-12`.
- [x] Створити `Public Key` і `Secret Key`.
- [x] Записати `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` у `.env`.
- [x] Переконатися, що `.env.example` відображає потрібні Langfuse змінні.

Definition of done:

- [x] Локальний runtime має всі credentials, потрібні для Langfuse JS/TS SDK.

---

## Block 2. SDK Wiring у TypeScript

Goal: додати Langfuse в runtime як технічну залежність і централізований client layer.

- [x] Додати в `package.json` Langfuse JS/TS залежності.
- [x] Додати Langfuse env exports у `src/config/env.ts`.
- [x] Створити окремий модуль для ініціалізації Langfuse client.
- [x] Додати helper для створення LangChain `CallbackHandler`.
- [x] Визначити єдине місце, де runtime вирішує: tracing enabled чи disabled.

Рекомендовані цільові файли:

- `package.json`
- `src/config/env.ts`
- `src/lib/langfuse.ts`

Definition of done:

- [x] Код може створити Langfuse client без розкиданого `process.env` по різних модулях.

---

## Block 3. Root Trace Integration

Goal: кожен запуск MAS має створювати один top-level trace з повним деревом дочірніх викликів.

- [x] Обгорнути `main.ts` у top-level Langfuse trace/span.
- [x] Обгорнути `main-batch.ts` у top-level Langfuse trace/span.
- [x] Використати `propagateAttributes(...)` на старті workflow.
- [x] Передавати Langfuse callbacks у LangChain/LangGraph invoke path.
- [x] Переконатися, що trace не створюється занадто пізно, вже після першого LLM/tool call.

Definition of done:

- [x] Один user request = один trace у Langfuse.
- [x] Усередині trace видно Supervisor, agent, tool, model виклики як єдине дерево.

Pending verification:

- [x] Ручно перевірити Langfuse UI після реальних запусків і підтвердити, що root trace та дочірні spans справді з’являються як очікується.

---

## Block 4. Supervisor / Agent Callback Coverage

Goal: жоден критичний агентний виклик не випадає з tracing coverage.

- [x] Підключити callback handler до Supervisor invoke path.
- [x] Перевірити Planner invoke path.
- [x] Перевірити Researcher invoke path.
- [x] Перевірити Critic invoke path.
- [x] Перевірити, що tool calls також відображаються у trace.
- [x] Перевірити, що HITL interrupt/resume не розриває trace context.

Definition of done:

- [x] Trace tree містить повну послідовність `plan -> research -> critique -> write`.

Verification notes:

- `main.ts` і `main-batch.ts` прокидають Langfuse callbacks у top-level workflow.
- `superviseResearchWithOptions(...)` і `resumeSupervisorWithOptions(...)` приймають callbacks і передають їх далі в Supervisor invoke path.
- `planResearch`, `research`, `runResearchTurn` і `critique` приймають `LangChainInvokeOptions` і використовують `callbacks` у `agent.invoke(...)`.
- `supervisor-tools.ts` прокидує callbacks у Planner / Researcher / Critic wrappers.
- Ручна перевірка в Langfuse UI вже показала root trace, `AGENT`, `GENERATION`, `TOOL`, `ChatOpenAI`, `LangGraph`, `knowledge_search`.
- Додатковий `mode=full` batch run підтвердив, що callback-enabled flow реально доходить до `supervisor`, `planner`, `researcher`, `critic`.
- Prompt Management blocker для callback coverage знято після sync у Langfuse; tracing тепер можна перевіряти без fallback warning як окрему наступну фазу.

---

## Block 5. Session / User / Tag Strategy

Goal: traces мають коректну атрибуцію на рівні session і user.

- [x] Визначити правило для `sessionId`.
- [x] Визначити правило для `userId`.
- [x] Визначити мінімальний набір `tags`.
- [x] Прокинути ці атрибути через `propagateAttributes(...)`.
- [x] Переконатися, що той самий `sessionId` зберігається під час HITL resume flow.

Затверджений mapping:

- `CLI sessionId`: один стабільний `randomUUID()` на весь lifecycle CLI-процесу, щоб кілька user turns групувалися в одну Langfuse session.
- `CLI userId`: `local-cli-user`.
- `CLI tags`: `homework-12`, `runtime:cli`.
- `Batch sessionId`: `requestId`, тобто окрема session на кожен batch run.
- `Batch userId`: `local-batch-user`.
- `Batch tags`: `homework-12`, `runtime:batch`, `mode:<batch-mode>`.

Definition of done:

- [x] У Langfuse `Sessions` видно згруповані traces.
- [x] У Langfuse `Users` видно user, який породив traces.

Verification notes:

- Mapping винесено в `src/lib/langfuse-attributes.ts`, щоб `sessionId`, `userId`, `tags` і trace metadata не дублювалися в entrypoints.
- `main.ts` використовує один `CLI_SESSION_ID` для всіх turn'ів поточного CLI runtime і прокидує атрибути як у root trace, так і в LangChain callback handler.
- `main-batch.ts` створює окремий `sessionId` на кожен batch request і додає mode-specific tag у форматі `mode:<batch-mode>`.
- `runWithLangfuseRootTrace(...)` викликає `propagateAttributes(...)` рано, до першого supervisor / agent / tool / model call.
- Під час CLI HITL resume використовується той самий `callbacks` array, а отже той самий `sessionId`, `userId` і набір tags не губляться всередині review flow.

---

## Block 6. Prompt Inventory

Goal: підготувати всі agent prompts до міграції в Langfuse Prompt Management.

- [x] Зібрати повний список system prompts у коді.
- [x] Перевірити, які з них статичні, а які потребують template variables.
- [x] Визначити назви prompts у Langfuse.
- [x] Зафіксувати, які поля потрібно параметризувати через `compile(...)`.

Мінімальний inventory:

- [x] `supervisor-system`
- [x] `planner-system`
- [x] `researcher-system`
- [x] `critic-system`

Definition of done:

- [x] Є повна мапа: prompt у коді -> prompt name у Langfuse.

Inventory map:

- `SYSTEM_PROMPT_DEFINITIONS.supervisor` in `src/config/prompts.ts`
  - Langfuse name: `homework-12/supervisor-system`
  - Type: `text`
  - Variables for `compile(...)`: `max_research_revisions`
  - Runtime consumers: `src/supervisor/create-supervisor.ts`
- `SYSTEM_PROMPT_DEFINITIONS.planner` in `src/config/prompts.ts`
  - Langfuse name: `homework-12/planner-system`
  - Type: `text`
  - Variables for `compile(...)`: none
  - Runtime consumers: `src/agents/planner.ts`
- `SYSTEM_PROMPT_DEFINITIONS.researcher` in `src/config/prompts.ts`
  - Langfuse name: `homework-12/researcher-system`
  - Type: `text`
  - Variables for `compile(...)`: none
  - Runtime consumers: `src/agents/researcher.ts`, `src/agent/memory.ts`
- `SYSTEM_PROMPT_DEFINITIONS.critic` in `src/config/prompts.ts`
  - Langfuse name: `homework-12/critic-system`
  - Type: `text`
  - Variables for `compile(...)`: none
  - Runtime consumers: `src/agents/critic.ts`

Verification notes:

- Runtime metadata registry exists in `src/config/prompts.ts` as `SYSTEM_PROMPT_DEFINITIONS`.
- Runtime loading path resolves prompts through `src/lib/langfuse-prompts.ts` with `label: "production"`.
- Only the `supervisor` prompt currently requires template variables. The other three prompts are static text prompts and can be migrated directly without extra preprocessing.

---

## Block 7. Prompt Management Migration

Goal: system prompts більше не є hardcoded source of truth у TypeScript.

- [x] Створити prompts у Langfuse UI.
- [x] Додати label `production` для робочих версій.
- [x] Реалізувати в коді prompt loader через Langfuse JS/TS SDK.
- [x] Замінити пряме використання prompt constants на Langfuse-backed loading.
- [x] Якщо потрібні змінні, підключити `prompt.compile({...})`.
- [x] Якщо використовуються LangChain templates, за потреби застосувати `getLangchainPrompt()`.
- [x] Залишити в коді лише adapter logic, без локального prompt content fallback.

Definition of done:

- [x] У Langfuse UI видно всі prompts.
- [x] Runtime реально завантажує prompts із Langfuse.
- [x] У коді немає робочих hardcoded system prompts як основного джерела.

Verification notes:

- Runtime loader already uses `client.prompt.get(name, { label: "production" })` in `src/lib/langfuse-prompts.ts`.
- The four production prompts already exist in Langfuse:
  - `homework-12/researcher-system`
  - `homework-12/planner-system`
  - `homework-12/critic-system`
  - `homework-12/supervisor-system`
- Strict runtime verification succeeded:
  - `mode=plan` batch run completed without `Prompt not found` warnings.
  - Direct `resolveSystemPrompt("supervisor", { max_research_revisions: "2" })` returned `isFallback: false` and prompt `version: 1`.
- `src/config/prompts.ts` now contains metadata only: prompt names, types, and required variables.
- Full prompt text and local fallback content were removed from the codebase; Langfuse `production` prompts are the only operational source.

---

## Block 8. Trace Quality Verification

Goal: перевірити, що traces не просто існують, а дійсно корисні для observability.

- [ ] Запустити мінімум 3 різні user requests.
- [ ] Перевірити, що кожен запуск створює окремий trace.
- [ ] Перевірити, що trace name осмислений і стабільний.
- [ ] Перевірити, що input/output trace читаються в UI.
- [ ] Перевірити, що tool calls і LLM spans відображаються всередині дерева.
- [ ] Перевірити, що хоча б один trace проходить через HITL write_report flow.

Definition of done:

- [ ] У `Tracing -> Traces` видно 3-5 якісних traces, придатних для аналізу та evaluation.

---

## Block 9. LLM-as-a-Judge Evaluators

Goal: увімкнути автоматичну оцінку нових traces у Langfuse.

- [ ] Визначити 2-3 найбільш корисні критерії оцінки для цієї MAS.
- [ ] Створити мінімум 2 evaluator'и в Langfuse UI.
- [ ] Вибрати різні `score type`, якщо це доречно.
- [ ] Налаштувати evaluator prompts через `{{input}}` і `{{output}}`.
- [ ] Переконатися, що evaluator'и запускаються саме на потрібних traces.

Рекомендовані evaluator'и:

- [ ] `answer_relevance`
- [ ] `groundedness`
- [ ] `report_structure` або `completeness`

Definition of done:

- [ ] Нові traces автоматично отримують evaluator scores.

---

## Block 10. Evaluator Result Verification

Goal: переконатися, що online evaluation справді спрацював після runtime запусків.

- [ ] Зробити 3-5 нових запусків уже після налаштування evaluator'ів.
- [ ] Дочекатися асинхронної обробки Langfuse.
- [ ] Відкрити trace details і перевірити вкладку `Scores`.
- [ ] Перевірити, що evaluator status показує оброблені traces.
- [ ] Перевірити, що scores виглядають логічно, а не випадково.

Definition of done:

- [ ] У кожного потрібного trace є автоматично проставлені scores.

---

## Block 11. Regression Safety

Goal: не зламати наявний baseline під час observability-інтеграції.

- [ ] Після кожного значущого етапу проганяти `npm run validate`.
- [ ] Не ламати `main.ts` interactive flow.
- [ ] Не ламати `main-batch.ts` batch flow.
- [ ] Не ламати `threadId` resume semantics.
- [ ] Не змішувати Langfuse runtime logic з RAG business logic без потреби.
- [ ] Не втратити чинні smoke checks і DeepEval baseline.

Definition of done:

- [ ] Після повної інтеграції baseline залишається робочим і перевіряється тим самим validation entrypoint.

---

## Block 12. Submission Assets

Goal: зібрати все, що потрібно для фінальної здачі.

- [ ] Зробити скріншот trace tree.
- [ ] Зробити скріншот session view.
- [ ] Зробити скріншот evaluator scores.
- [ ] Зробити скріншот prompt management.
- [ ] Покласти всі 4 скріншоти в `screenshots/`.
- [ ] Перевірити, що скріншоти реально показують саме цей проєкт, а не сторонній demo.

Definition of done:

- [ ] Є повний пакет артефактів для здачі lesson 12.

---

## Final Definition of Done

Домашнє завдання виконано лише тоді, коли:

- [ ] `npm run validate` зелений
- [ ] `Langfuse` інтегрований у TypeScript runtime
- [ ] кожен MAS запуск створює повний trace
- [ ] traces мають `sessionId` і `userId`
- [ ] prompts мігровані в Langfuse Prompt Management
- [ ] evaluator'и налаштовані й автоматично ставлять scores
- [ ] `screenshots/` містить 4 потрібні скріншоти
- [ ] документація синхронізована з фактичною реалізацією

---

## Recommended Execution Order

Щоб рухатися без хаосу, працюємо саме в такій послідовності:

1. `Baseline Freeze`
2. `Langfuse Cloud Setup`
3. `SDK Wiring у TypeScript`
4. `Root Trace Integration`
5. `Supervisor / Agent Callback Coverage`
6. `Session / User / Tag Strategy`
7. `Prompt Inventory`
8. `Prompt Management Migration`
9. `Trace Quality Verification`
10. `LLM-as-a-Judge Evaluators`
11. `Evaluator Result Verification`
12. `Submission Assets`

---

## Maintenance Rule

Якщо змінюється порядок робіт, структура інтеграції Langfuse, source of truth для prompts, або acceptance criteria для lesson 12, цей документ треба оновити в тому самому коміті.
