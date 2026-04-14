# Домашнє завдання: MCP + ACP для мультиагентної системи (TypeScript adaptation)

Цей документ є TypeScript-адаптацією поточного `README.md` для `homework-lesson-9`.
Кореневий `README.md` фіксує логіку завдання, а тут описано, як реалізовувати її в поточному TS-проєкті.

---

## Мета

Перевести поточний multi-agent baseline на **protocol-based architecture**:

- `MCP` для інструментів
- `ACP` для агентів
- локальний `Supervisor` як оркестратор

Ключовий flow не змінюється:

`Plan -> Research -> Critique -> HITL -> Save`

Змінюється спосіб взаємодії між компонентами: замість локальних викликів функцій система працює через окремі сервери та клієнти.

---

## Що змінюється порівняно з hw8

| Було в hw8 | Має стати в hw9 |
| - | - |
| Tools підключені локально в одному процесі | Tools винесені в окремі MCP servers |
| Planner / Researcher / Critic викликаються локально | Planner / Researcher / Critic доступні через ACP server |
| Supervisor працює з subagent wrappers | Supervisor делегує задачі через ACP client wrappers |
| Один runtime process | Кілька runtime endpoints: SearchMCP, GitHubMCP, ReportMCP, ACP server, Supervisor CLI |
| Прямий import tool adapters | MCP discovery + invocation |

---

## Поточний стек

- Мова: `TypeScript`
- Runtime: `Node.js`
- Agent framework: `langchain` JS
- Structured output: `zod`
- Model runtime: `ChatOpenAI`
- Local knowledge layer: `Qdrant + BM25 + hybrid retrieval + optional rerank`
- CLI entrypoint: `src/main.ts`
- Ingestion entrypoint: `src/rag/ingest.ts`

Додатково для цього завдання потрібні:

- MCP server/client layer, сумісний з Node.js
- ACP server/client layer, сумісний з Node.js

Тобто Python-орієнтовані ідеї з README зберігаються, але конкретні SDK та API мають бути JS/TS-сумісними.

---

## Цільова архітектура

```text
User (CLI / REPL)
  |
  v
Supervisor Agent (local)
  |
  +- delegate_to_planner(request)
  |      -> ACP Client -> ACP Server -> Planner Agent
  |                                      -> MCP Client -> SearchMCP
  |
  +- delegate_to_researcher(plan, feedback?)
  |      -> ACP Client -> ACP Server -> Researcher Agent
  |                                      -> MCP Client -> SearchMCP
  |                                      -> MCP Client -> GitHubMCP
  |
  +- delegate_to_critic(findings)
  |      -> ACP Client -> ACP Server -> Critic Agent
  |                                      -> MCP Client -> SearchMCP
  |
  \- save_report(filename, content)
         -> MCP Client -> ReportMCP
         -> HITL approval on Supervisor side
```

---

## MCP Layer

### SearchMCP

Призначення:

- expose `web_search`
- expose `read_url`
- expose `knowledge_search`
- expose resource `resource://knowledge-base-stats`

Очікування:

- один SearchMCP використовується усіма трьома ACP агентами
- MCP layer не містить orchestration logic
- `knowledge_search` продовжує делегувати в `src/rag/*`
- на етапі `Block 2` локальні агенти вже повинні викликати `SearchMCP`, але через thin proxy/client layer, сумісний з поточним `createAgent(...)` flow
- на етапі `Block 4` цей тимчасовий proxy layer має бути замінений на пряму MCP-взаємодію з боку agent runtime

Implementation status:

- реалізовано в `src/mcp/search-server.ts`
- локальні LangChain tools викликають `SearchMCP` через `src/mcp/search-client.ts`
- поточний runtime вимагає запущеного `SearchMCP`, що відповідає вимозі `Block 2`

### GitHubMCP

Призначення:

- expose `github_list_directory`
- expose `github_get_file_content`
- expose resource `resource://github-api-status`

Очікування:

- `GitHubMCP` не є вимогою оригінального homework contract, але є фактичною TS-реалізацією для repo evidence
- ним користується `Researcher`
- server містить лише transport bootstrap, а repo business logic лишається в `src/tools/github-*`
- локальні агенти викликають `GitHubMCP` через thin proxy/client layer, так само як `SearchMCP`

### ReportMCP

Призначення:

- expose `save_report`
- expose resource `resource://output-dir`

Очікування:

- server відповідає лише за persistence contract
- approval decision не приймається всередині MCP server
- HITL залишається на боці Supervisor

---

## ACP Layer

Один ACP server має публікувати три agent endpoints:

- `planner`
- `researcher`
- `critic`

Кожен ACP агент:

1. підключається до `SearchMCP`
2. отримує MCP tools у форматі, який можна передати в LangChain agent
3. створюється через `createAgent(...)`
4. повертає відповідь, придатну для Supervisor delegation flow

Planner і Critic зберігають structured output:

- `ResearchPlan`
- `CritiqueResult`

Researcher повертає `FindingsEnvelope`.

`FindingsEnvelope` на першій версії може мати простий shape, але він є окремим handoff contract, а не довільним рядком. Мінімальні вимоги:

- findings мають бути у `markdown`
- findings мають містити evidence-oriented sections
- findings мають бути придатні для Critic без додаткового контексту

Мінімально acceptable payload:

```ts
type FindingsEnvelope = {
  markdown: string;
};
```

Надалі цей envelope можна розширити metadata без ламання Supervisor/Critic contract.

---

## Agent Handoff Contracts

### Planner

- input:
  - `userRequest`
- output:
  - `ResearchPlan`

Для першої версії Planner не повинен отримувати зайвий runtime state.

### Researcher

- input:
  - `userRequest`
  - `plan`
  - `critiqueFeedback?`
- output:
  - `FindingsEnvelope`

### Critic

- input:
  - `userRequest`
  - `findings`
  - `plan`
- output:
  - `CritiqueResult`

---

## Supervisor

Supervisor не є ACP агентом.

Його відповідальність:

1. прийняти user request
2. делегувати planning через ACP client
3. делегувати research через ACP client
4. делегувати critique через ACP client
5. якщо verdict = `REVISE`, повторно делегувати research
6. якщо verdict = `APPROVE`, сформувати фінальний markdown
7. викликати `save_report` через `ReportMCP`
8. провести HITL approval / edit / reject

Supervisor:

- не містить retrieval logic
- не містить MCP tool business logic
- не виконує роль Planner / Researcher / Critic локально

Supervisor працює з такими handoff contracts:

- Planner receives only `userRequest`
- Researcher receives `userRequest + plan + critiqueFeedback?`
- Critic receives `userRequest + findings + plan`

---

## HITL для save_report

HITL залишається локальним runtime concern у Supervisor.

Очікуваний flow:

1. Supervisor отримує фінальний markdown
2. перед `save_report` виникає interrupt
3. CLI показує pending review
4. користувач обирає `approve`, `edit` або `reject`
5. лише після `approve` викликається успішне збереження через `ReportMCP`

`edit` має повертати систему назад у Supervisor flow, а не редагувати файл напряму поза агентним циклом.

---

## Рекомендована TS-структура

```text
homework-lesson-9/
├── src/
│   ├── main.ts
│   ├── supervisor/
│   │   ├── create-supervisor.ts
│   │   └── acp-delegation-tools.ts
│   ├── acp/
│   │   ├── server.ts
│   │   ├── client.ts
│   │   └── agent-handlers.ts
│   ├── mcp/
│   │   ├── search-server.ts
│   │   ├── github-server.ts
│   │   ├── report-server.ts
│   │   ├── search-client.ts
│   │   ├── github-client.ts
│   │   └── report-client.ts
│   ├── agents/
│   │   ├── planner.ts
│   │   ├── researcher.ts
│   │   └── critic.ts
│   ├── schemas/
│   │   ├── research-plan.ts
│   │   ├── findings-envelope.ts
│   │   └── critique-result.ts
│   ├── tools/
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
│   │   ├── prompts.ts
│   │   └── agent-policy.ts
│   └── utils/
├── docs/
├── data/
├── output/
└── package.json
```

Це не жорсткий контракт по назвах файлів, але transport boundaries мають бути саме такими:

- MCP server/client окремо
- ACP server/client окремо
- Supervisor orchestration окремо
- tool business logic окремо

Для `SearchMCP` приймається такий поетапний підхід:

- `Block 2`: агенти викликають MCP через `src/mcp/search-client.ts` або еквівалентний thin proxy
- Поточна фактична реалізація також використовує `src/mcp/github-client.ts` для GitHub-based repo evidence
- `Block 4`: ACP agents переходять на пряму взаємодію з MCP runtime без проміжної legacy-style tool wiring

---

## Важлива адаптація з Python на TypeScript

У README вимоги сформульовані в Python-термінах, але для цього проєкту вони читаються так:

- `Pydantic` -> `zod`
- `response_format` -> `responseFormat`
- `structured_response` -> `structuredResponse`
- `FastMCP server/client` -> JS/TS-compatible MCP server/client layer
- `acp-sdk` -> JS/TS-compatible ACP server/client layer
- `HumanInTheLoopMiddleware` -> `humanInTheLoopMiddleware(...)`
- `InMemorySaver` -> `MemorySaver`
- `main.py` -> `src/main.ts`

Суть завдання: не повторити Python-файли буквально, а зберегти той самий архітектурний контракт у TypeScript.

Практичне правило для цього проєкту:

- якщо потрібний server/client transport, спочатку перевіряємо можливості вже встановлених бібліотек
- self-written wrappers допускаються лише як thin composition layer, а не як повторна реалізація MCP protocol logic

---

## Очікуваний результат

1. `npm run ingest` готує knowledge base
2. `SearchMCP` обслуговує `web_search`, `read_url`, `knowledge_search`
3. `ReportMCP` обслуговує `save_report`
4. `ACP server` публікує `planner`, `researcher`, `critic`
5. `Supervisor` проходить цикл `Plan -> Research -> Critique`
6. якщо verdict = `REVISE`, запускається ще один research round через ACP
7. якщо verdict = `APPROVE`, формується markdown report
8. `save_report` проходить через HITL approval flow
9. після `approve` звіт фізично зберігається в `output/`

При цьому Researcher не повертає довільний текст, а повертає `FindingsEnvelope` з self-contained markdown findings.

---

## Цільові команди

Поточний публічний validation entrypoint лишається:

```bash
npm run validate
```

Для runtime має існувати окремий запуск для:

- ingest
- SearchMCP
- ReportMCP
- ACP server
- Supervisor CLI
