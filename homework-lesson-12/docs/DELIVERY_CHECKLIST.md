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

- [ ] Переконатися, що `npm ci` завершився без помилок.
- [ ] Переконатися, що `npm run validate` проходить end-to-end.
- [ ] Переконатися, що `Qdrant` піднімається автоматично через smoke suite.
- [ ] Переконатися, що поточний Supervisor flow працює без Langfuse.
- [ ] Зафіксувати, які саме файли будемо змінювати для lesson 12.

Definition of done:

- [ ] Є зелений baseline, до якого можна повертатися після кожного етапу інтеграції.

---

## Block 1. Langfuse Cloud Setup

Goal: підготувати Langfuse project і ключі доступу.

- [ ] Зареєструватися в `us.cloud.langfuse.com`.
- [ ] Створити окремий project для `homework-12`.
- [ ] Створити `Public Key` і `Secret Key`.
- [ ] Записати `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` у `.env`.
- [ ] Переконатися, що `.env.example` відображає потрібні Langfuse змінні.

Definition of done:

- [ ] Локальний runtime має всі credentials, потрібні для Langfuse JS/TS SDK.

---

## Block 2. SDK Wiring у TypeScript

Goal: додати Langfuse в runtime як технічну залежність і централізований client layer.

- [ ] Додати в `package.json` Langfuse JS/TS залежності.
- [ ] Додати Langfuse env exports у `src/config/env.ts`.
- [ ] Створити окремий модуль для ініціалізації Langfuse client.
- [ ] Додати helper для створення LangChain `CallbackHandler`.
- [ ] Визначити єдине місце, де runtime вирішує: tracing enabled чи disabled.

Рекомендовані цільові файли:

- `package.json`
- `src/config/env.ts`
- `src/config/langfuse.ts` або `src/lib/langfuse.ts`

Definition of done:

- [ ] Код може створити Langfuse client без розкиданого `process.env` по різних модулях.

---

## Block 3. Root Trace Integration

Goal: кожен запуск MAS має створювати один top-level trace з повним деревом дочірніх викликів.

- [ ] Обгорнути `main.ts` у top-level Langfuse trace/span.
- [ ] Обгорнути `main-batch.ts` у top-level Langfuse trace/span.
- [ ] Використати `propagateAttributes(...)` на старті workflow.
- [ ] Передавати Langfuse callbacks у LangChain/LangGraph invoke path.
- [ ] Переконатися, що trace не створюється занадто пізно, вже після першого LLM/tool call.

Definition of done:

- [ ] Один user request = один trace у Langfuse.
- [ ] Усередині trace видно Supervisor, agent, tool, model виклики як єдине дерево.

---

## Block 4. Supervisor / Agent Callback Coverage

Goal: жоден критичний агентний виклик не випадає з tracing coverage.

- [ ] Підключити callback handler до Supervisor invoke path.
- [ ] Перевірити Planner invoke path.
- [ ] Перевірити Researcher invoke path.
- [ ] Перевірити Critic invoke path.
- [ ] Перевірити, що tool calls також відображаються у trace.
- [ ] Перевірити, що HITL interrupt/resume не розриває trace context.

Definition of done:

- [ ] Trace tree містить повну послідовність `plan -> research -> critique -> write`.

---

## Block 5. Session / User / Tag Strategy

Goal: traces мають коректну атрибуцію на рівні session і user.

- [ ] Визначити правило для `sessionId`.
- [ ] Визначити правило для `userId`.
- [ ] Визначити мінімальний набір `tags`.
- [ ] Прокинути ці атрибути через `propagateAttributes(...)`.
- [ ] Переконатися, що той самий `sessionId` зберігається під час HITL resume flow.

Рекомендований стартовий mapping:

- `sessionId`: або стабільний CLI session id, або узгоджений runtime id
- `userId`: технічний локальний user id
- `tags`: `homework-12`, `cli`, `batch`, `rag`

Definition of done:

- [ ] У Langfuse `Sessions` видно згруповані traces.
- [ ] У Langfuse `Users` видно user, який породив traces.

---

## Block 6. Prompt Inventory

Goal: підготувати всі agent prompts до міграції в Langfuse Prompt Management.

- [ ] Зібрати повний список system prompts у коді.
- [ ] Перевірити, які з них статичні, а які потребують template variables.
- [ ] Визначити назви prompts у Langfuse.
- [ ] Зафіксувати, які поля потрібно параметризувати через `compile(...)`.

Мінімальний inventory:

- [ ] `supervisor-system`
- [ ] `planner-system`
- [ ] `researcher-system`
- [ ] `critic-system`

Definition of done:

- [ ] Є повна мапа: prompt у коді -> prompt name у Langfuse.

---

## Block 7. Prompt Management Migration

Goal: system prompts більше не є hardcoded source of truth у TypeScript.

- [ ] Створити prompts у Langfuse UI.
- [ ] Додати label `production` для робочих версій.
- [ ] Реалізувати в коді prompt loader через Langfuse JS/TS SDK.
- [ ] Замінити пряме використання prompt constants на Langfuse-backed loading.
- [ ] Якщо потрібні змінні, підключити `prompt.compile({...})`.
- [ ] Якщо використовуються LangChain templates, за потреби застосувати `getLangchainPrompt()`.
- [ ] Залишити в коді лише fallback або adapter logic, але не дублювати реальний source of truth.

Definition of done:

- [ ] У Langfuse UI видно всі prompts.
- [ ] Runtime реально завантажує prompts із Langfuse.
- [ ] У коді немає робочих hardcoded system prompts як основного джерела.

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
