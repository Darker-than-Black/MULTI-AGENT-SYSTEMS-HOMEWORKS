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

- [x] Запустити мінімум 3 різні user requests.
- [x] Перевірити, що кожен запуск створює окремий trace.
- [x] Перевірити, що trace name осмислений і стабільний.
- [x] Перевірити, що input/output trace читаються в UI.
- [x] Перевірити, що tool calls і LLM spans відображаються всередині дерева.
- [x] Перевірити, що хоча б один trace проходить через HITL write_report flow.

Definition of done:

- [x] У `Tracing -> Traces` видно 3-5 якісних traces, придатних для аналізу та evaluation.

Verification notes:

- `2026-04-28T07:12:08Z` -> `2026-04-28T07:16:25Z`: виконано 3 нові `mode=full` batch runs для різних user requests.
- Langfuse CLI підтвердив 3 окремі traces:
  - `bb5cabf8b435c009c10b359cc4cfa763`
  - `bbd5e0ca19bd9e2d87ab104b34379d54`
  - `a853facd9d01e41679e9da99c4d85040`
- Усі 3 traces мають стабільний trace name `mas-batch-full`, user `local-batch-user` і різні `sessionId`.
- `input` і `output` читаються на рівні trace:
  - trace input містить `mode` і `userRequest`
  - trace output містить `finalAnswer`, `plan`, `critique`, `toolExecutions`, `wroteReport`, `iterations`
- Через `observations list --trace-id ...` підтверджено повноцінне дерево observation'ів:
  - присутні `AGENT`, `TOOL`, `GENERATION`, `SPAN`
  - присутні `ChatOpenAI`, `supervisor`, `planner`, `researcher`, `critic`
  - присутні tool observations `plan_research`, `run_research`, `critique_findings`, `write_report`
- Для trace `bbd5e0ca19bd9e2d87ab104b34379d54` окремо підтверджено `HumanInTheLoopMiddleware.after_model` разом із `write_report`, тобто trace реально проходить через HITL write-report flow.

---

## Block 9. LLM-as-a-Judge Evaluators

Goal: увімкнути автоматичну оцінку нових traces у Langfuse.

- [x] Визначити 2-3 найбільш корисні критерії оцінки для цієї MAS.
- [x] Створити мінімум 2 evaluator'и в Langfuse UI.
- [x] Вибрати різні `score type`, якщо це доречно.
- [x] Налаштувати evaluator prompts через `{{input}}` і `{{output}}`.
- [x] Переконатися, що evaluator'и запускаються саме на потрібних traces.

Рекомендовані evaluator'и:

- [x] `answer_relevance`
- [ ] `groundedness`
- [x] `report_structure` або `completeness`

Definition of done:

- [x] Нові traces автоматично отримують evaluator scores.

Verification notes:

- Для Langfuse evaluation runtime створено project-level `LLM connection`:
  - provider: `openai`
  - adapter: `openai`
  - created at: `2026-04-28T08:02:49.890Z`
- Створено 2 project-owned custom evaluators з різними score types:
  - `homework-12-answer-relevance`
    - evaluator id: `cmoicbl7i00zvad074nkupoyu`
    - score type: `NUMERIC`
    - variables: `input`, `output`
    - model: `openai / gpt-4o-mini`
  - `homework-12-report-structure`
    - evaluator id: `cmoice6id00gnad078dn4a90j`
    - active version: `2`
    - score type: `BOOLEAN`
    - variables: `input`, `output`
    - model: `openai / gpt-4o-mini`
- Обидва evaluator prompts побудовані на `{{input}}` і `{{output}}`, без зайвих runtime-залежностей:
  - `answer_relevance` оцінює, наскільки фінальна відповідь прямо і достатньо закриває user request
  - `report_structure` дає boolean verdict, чи відповідь структурно delivery-ready
- Створено 2 active live evaluation rules:
  - `homework-12-answer-relevance-live`
    - rule id: `cmoicg3hs01agad08z7daa1oh`
    - target: `observation`
    - status: `active`
  - `homework-12-report-structure-live`
    - rule id: `cmoicg1yv00xlad0864sfsywp`
    - target: `observation`
    - status: `active`
- Обидва rules навмисно таргетують не весь trace, а фінальний `supervisor` observation всередині потрібних traces:
  - `traceName any of ["mas-batch-full"]`
  - `name any of ["supervisor"]`
  - `type any of ["AGENT"]`
- Variable mapping для обох rules:
  - `input <- observation.input` via `$.userRequest`
  - `output <- observation.output` via `$.finalAnswer`
- Це дає observation-level live evaluation саме на фінальному supervisor result у batch traces, які ми використовуємо для verification.
- Важливо: Langfuse evaluation rules не роблять historical backfill автоматично. Фактичне надходження scores на нові traces перевіряється окремо в `Block 10`.

---

## Block 10. Evaluator Result Verification

Goal: переконатися, що online evaluation справді спрацював після runtime запусків.

- [x] Зробити 3-5 нових запусків уже після налаштування evaluator'ів.
- [x] Дочекатися асинхронної обробки Langfuse.
- [x] Відкрити trace details і перевірити вкладку `Scores`.
- [x] Перевірити, що evaluator status показує оброблені traces.
- [x] Перевірити, що scores виглядають логічно, а не випадково.

Definition of done:

- [x] У кожного потрібного trace є автоматично проставлені scores.

Verification notes:

- `2026-04-28T08:48:34Z` -> `2026-04-28T08:52:11Z`: виконано 3 нові `mode=full` batch runs уже після активації live evaluation rules.
- Production traces, використані для перевірки:
  - `bd312bb0a061123d9a0a970e37bee41b`
  - `d8d1ef6e4eeb15a73045794cc9e8816e`
  - `755888c29aa33b1a2f7be9819cf9ca52`
- Для цих запусків підтверджені різні `sessionId`, а trace name лишився стабільним: `mas-batch-full`.
- Після запусків витримано окремий async wait і перевірено, що Langfuse створив evaluator execution traces в environment `langfuse-llm-as-a-judge`.
- Через `/api/public/unstable/evaluation-rules` підтверджено, що обидва live rules лишаються `active` під час перевірки.
- Через `traces get <trace-id> --fields scores` і `/api/public/v2/scores` підтверджено, що production traces реально отримали автоматичні scores:
  - `bd312bb0a061123d9a0a970e37bee41b`: `answer_relevance = 1`, `report_structure = True`
  - `d8d1ef6e4eeb15a73045794cc9e8816e`: `answer_relevance = 0.9/1`, `report_structure = False/True`
  - `755888c29aa33b1a2f7be9819cf9ca52`: `answer_relevance = 0.5/1`, `report_structure = False/True`
- Scores виглядають логічно, а не випадково:
  - більш чітка й структурована відповідь отримує `1` / `True`
  - weaker supervisor outputs у revision flow отримують нижчий relevance score або `False` для structure
- Важливий нюанс: scoring тут observation-level, а не trace-level. Тому один production trace може містити кілька score entries, якщо всередині було кілька `supervisor` observations, що матчаться під rule filter.

---

## Block 11. Regression Safety

Goal: не зламати наявний baseline під час observability-інтеграції.

- [x] Після кожного значущого етапу проганяти `npm run validate`.
- [x] Не ламати `main.ts` interactive flow.
- [x] Не ламати `main-batch.ts` batch flow.
- [x] Не ламати `threadId` resume semantics.
- [x] Не змішувати Langfuse runtime logic з RAG business logic без потреби.
- [x] Не втратити чинні smoke checks і DeepEval baseline.

Definition of done:

- [x] Після повної інтеграції baseline залишається робочим і перевіряється тим самим validation entrypoint.

Verification notes:

- `2026-04-28`: виконано повний `npm run validate` після observability/evaluator integration.
- Validation entrypoint пройшов повністю:
  - `tsc --noEmit`
  - architecture invariants
  - planner validation
  - researcher validation
  - critic validation
  - supervisor validation
  - deterministic multi-agent workflow smoke
  - RAG ingest/retrieval smoke suite
- `main.ts` interactive flow перевірений живим CLI запуском:
  - один user request успішно пройшов Planner -> Researcher -> Critic -> HITL review -> `write_report`
  - `approve` коректно відновив той самий supervisor thread
  - report збережений у `output/rag_short_report.md`
- `main-batch.ts` batch flow лишається робочим:
  - це підтверджено як `npm run validate`, так і production batch traces з `Block 8` / `Block 10`
  - traces `mas-batch-full` успішно створювалися вже після evaluator setup
- `threadId` resume semantics не зламані:
  - deterministic smoke script `scripts/smoke-multi-agent-flow.sh` перевіряє resume через той самий `thread_id`
  - живий CLI run також показав коректне resume після `approve`
- Розділення відповідальностей не зламане:
  - `scripts/check-architecture-invariants.sh` підтвердив, що tools лишаються decoupled від agent/OpenAI internals
  - RAG модулі не змішані з Langfuse runtime logic поза tracing/observability boundaries
- DeepEval baseline повернуто в робочий стан для offline mode:
  - системний `python3` у середовищі = `3.9.6` і не сумісний з установленим `deepeval`
  - під `python3.11` suite працює коректно
  - після відновлення missing offline fixtures в `output/` команда `DEEPEVAL_OFFLINE=1 python3.11 -m pytest -q` пройшла: `34 passed`

---

## Block 12. Submission Assets

Goal: зібрати все, що потрібно для фінальної здачі.

- [x] Зробити скріншот trace tree.
- [x] Зробити скріншот session view.
- [x] Зробити скріншот evaluator scores.
- [x] Зробити скріншот prompt management.
- [x] Покласти всі 4 скріншоти в `screenshots/`.
- [x] Перевірити, що скріншоти реально показують саме цей проєкт, а не сторонній demo.

Definition of done:

- [x] Є повний пакет артефактів для здачі lesson 12.

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
