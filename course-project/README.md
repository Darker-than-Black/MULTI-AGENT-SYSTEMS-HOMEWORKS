# Система підтримки користувачів електронної системи публічних закупівель України

## Опис

Мультиагентна система для обробки запитів користувачів електронної системи публічних закупівель України (далі — ЕСЗ). Система спеціалізується на трьох доменах:

1. **Технічна робота** з ЕСЗ та електронними майданчиками (як виконати дію в системі).
2. **Процедури проведення закупівель** (як правильно провести закупівлю згідно з регламентом).
3. **Законодавство та нормативні акти** (як вчинити правильно з точки зору закону).

Запити, що виходять за межі цих доменів, відхиляються. Запити, які система не може обробити автоматично (баги, ідеї покращення, складні випадки), ескалюються до людини-оператора через окремий Slack-канал.

**Мова комунікації:** українська (основна) та англійська. Web-пошук виконується виключно українською мовою.

## Архітектурний патерн

**Основний патерн:** Orchestrator-Workers + Evaluator-Optimizer (Anthropic).

- **Orchestrator-Workers:** Supervisor (orchestrator) делегує підзадачі спеціалізованим агентам (workers) — потенційно паралельно (fan-out), якщо запит охоплює кілька доменів.
- **Evaluator-Optimizer:** Critic оцінює сформовану відповідь і запускає цикл доопрацювання (revise loop) до досягнення якості або вичерпання ліміту ітерацій.

**Тип взаємодії:** ієрархічна з планувальним шаром. Planner декомпозує запит у структурований план, Supervisor виконує план через workers і Critic, та повертає агреговану відповідь. Ключовий виклик: якість декомпозиції на Planner і якість критики на Critic визначають загальну якість системи.

## Доменні обмеження

Система **відповідає виключно** на питання, що стосуються:
- технічної роботи з ЕСЗ та електронними майданчиками;
- процедур проведення публічних закупівель в Україні;
- законодавства та нормативно-правових актів у сфері публічних закупівель.

**Defense in depth (трирівневий захист від off-topic):**

1. **Planner gate** — Planner повертає `is_on_topic: bool`. Якщо `false`, Supervisor завершує цикл і повертає користувачу повідомлення про обмеження доменом.
2. **System prompts** — кожен агент у своєму system prompt має чітку директиву: "Ти відповідаєш виключно на питання, повʼязані з публічними закупівлями України. Якщо запит виходить за межі — поверни порожній результат із позначкою off-topic."
3. **Critic guardrail** — Critic у вимірі Structure валідує, що фінальна відповідь не містить відповідей на питання поза доменом, навіть якщо ті проскочили попередні фільтри.

## Агенти та інструменти

### Supervisor Agent

**Роль:** оркеструє увесь pipeline обробки запиту, приймає рішення на основі результатів Planner та Critic, керує сесіями.

**Поведінка:**
- Завжди починає з виклику Planner.
- Якщо Planner повертає `is_on_topic=false` — повертає користувачу повідомлення про обмеження доменом, цикл завершується.
- Якщо Planner повертає `needs_human=true` — одразу делегує до Escalation Agent (без запуску workers і Critic).
- Якщо план містить підзадачі — паралельно делегує їх відповідним worker-агентам (fan-out).
- Збирає результати від workers, формує агреговану відповідь по секціях.
- Передає агреговану відповідь Critic.
- На основі вердикту Critic: `approve` → повертає користувачу; `revise` → запускає доопрацювання тих workers, до яких є зауваження.
- Контролює retry-ліміт. Після його вичерпання — ескалація.
- Управляє сесіями користувача через LangGraph checkpointer (Postgres).

**Інструменти:** делегування до інших агентів через LangGraph nodes (не tool-calls).

### Planner Agent

**Роль:** декомпозує запит користувача у структурований план, фільтрує off-topic запити, ідентифікує запити, що потребують людини.

**Поведінка:**
- Класифікує запит за темами (одна або кілька з: `technical_system`, `procurement_general`, `legal`).
- Виявляє off-topic запити (`is_on_topic=false`).
- Виявляє запити, що одразу потребують ескалації: чітко описана бага системи, запит на функцію, якої система не має, або заявка на покращення (`needs_human=true`).
- Повертає структурований план у форматі `ResearchPlan` (Pydantic).

**Інструменти:** LLM structured output (`ResearchPlan`).

### Lawyer Agent

**Роль:** відповідає на питання "як правильно вчинити відповідно до закону".

**Поведінка:**
- Активується для підзадач з topic `legal`.
- Шукає виключно у векторній колекції `laws` (закони та нормативні акти).
- Якщо релевантної інформації не знайдено — повертає `found=false`, не намагається доповнити з інших джерел.

**Інструменти:** RAG (semantic search по колекції `laws`).

### Common Support Agent

**Роль:** відповідає на питання "як це працює" (процедури, регламенти, тарифи, політика повернень).

**Поведінка:**
- Активується для підзадач з topic `procurement_general`.
- Шукає у векторній колекції `articles` (статті, FAQ, документація сервісу).
- За потреби доповнює пошуком в інтернеті (Tavily, лише UA).

**Інструменти:** RAG (semantic search по колекції `articles`), Web Search (Tavily).

### Technical Support Agent

**Роль:** відповідає на питання "як виконати конкретну дію в системі чи на майданчику".

**Поведінка:**
- Активується для підзадач з topic `technical_system`.
- Шукає у векторній колекції `articles` (з фільтром по `subcategory=tutorial`) та в інтернеті по whitelist-у доменів технічної документації майданчиків.
- Якщо нічого не знайдено і запит виглядає як опис баги/відсутньої функції — повертає прапорець, що потребує людської валідації (це підхопить Critic або Supervisor як сигнал до ескалації).

**Інструменти:** RAG (semantic search по колекції `articles`), Web Search (Tavily з `allowed_domains` whitelist).

### Critic Agent

**Роль:** оцінює якість агрегованої відповіді через незалежну верифікацію та повертає вердикт.

**Поведінка:**
- Активується для відповідей від Lawyer / Common Support / Technical Support агентів (одного або кількох — у випадку fan-out).
- **НЕ активується** для off-topic та для прямої ескалації від Planner.
- Оцінює відповідь по трьох вимірах:
  1. **Freshness** — чи базуються знахідки на актуальних даних? Чи є ознаки застарілої інформації (особливо критично для законодавства)?
  2. **Completeness** — чи повністю покрито всі підзадачі з плану? Чи є непокриті аспекти?
  3. **Structure** — чи відповідь чітко структурована, чи дотримано формату секцій, чи немає off-topic вкраплень?
- Повертає `CritiqueResult(verdict, gaps, revision_requests)`.
- На `revise` вказує **які саме секції/підзадачі** потребують доопрацювання — Supervisor перезапускає лише відповідних workers, не весь цикл.

**Інструменти:** LLM structured output (`CritiqueResult`). Опційно — Web Search для fact-checking (рекомендується для виміру Freshness).

### Escalation Agent

**Роль:** обробляє критичні випадки, де автоматична відповідь неможлива або непотрібна.

**Тригери ескалації:**
- Planner ідентифікував багу системи / ідею покращення / запит на нову функцію (`needs_human=true`).
- Critic тричі поспіль (або інший ліміт з `.env`) повернув `revise` — система не може досягти якісної відповіді.
- Технічна помилка в pipeline.

**Поведінка:**
- Формує `EscalationOutput` з повним контекстом (оригінальний запит, plan, всі відповіді workers, critic feedback, причина ескалації).
- Зберігає escalation report у файл (audit trail).
- Надсилає нотифікацію в експертний Slack-канал з повним контекстом.
- Користувачу повертає **статичне повідомлення-інформування**, що запит буде оброблено людиною (HITL approval не використовується).

**Інструменти:** Slack API (publish у експертний канал), File System tool (збереження report).

## Structured Output контракти (Pydantic)

```python
class SubTask(BaseModel):
    topic: Literal["legal", "procurement_general", "technical_system"]
    query: str               # перефразований під цей topic суб-запит
    rationale: str           # чому Planner так розклав

class ResearchPlan(BaseModel):
    is_on_topic: bool
    off_topic_reason: str | None
    language: Literal["uk", "en"]
    original_query: str
    subtasks: list[SubTask]  # 0 якщо off-topic, 1+ якщо on-topic
    needs_human: bool        # пряма ескалація: бага / ідея / нова фіча
    escalation_reason: str | None

class WorkerResponse(BaseModel):
    topic: Literal["legal", "procurement_general", "technical_system"]
    found: bool
    answer: str | None
    sources: list[str]
    confidence: float
    needs_human: bool = False         # для technical_support: бага виявлена
    needs_human_reason: str | None = None

class CritiqueResult(BaseModel):
    verdict: Literal["approve", "revise"]
    freshness_score: float            # 0-1
    completeness_score: float         # 0-1
    structure_score: float            # 0-1
    gaps: list[str]                   # перелік виявлених проблем
    revision_requests: list[dict]     # [{topic, request}] — кому що переробити

class EscalationOutput(BaseModel):
    summary: str
    category: Literal["bug", "feature_request", "unanswerable", "max_retries_exceeded"]
    customer_message: str
    attempted_resolution: str
    full_context: dict                # plan + worker responses + critic history
```

## База знань для RAG

**Дві колекції в одному інстансі векторної БД:**

| Колекція | Вміст | Стратегія chunking |
|---|---|---|
| `laws` | Закони та нормативно-правові акти у сфері публічних закупівель | Більші чанки (стаття цілісна за змістом) |
| `articles` | Статті, FAQ, технічна документація сервісу та майданчиків | Менші чанки з overlap |

**Метадані (мінімум):**
- `source_type`: `law` / `article`
- `source_url`
- `published_date`
- `last_updated`
- `law_number` (для законів — для прямого пошуку за номером)
- `subcategory` (для articles): `faq` / `tutorial` / `policy`
- `chunk_index`

**Які агенти куди шукають:**
- Lawyer Agent → `laws` (виключно).
- Common Support Agent → `articles`.
- Technical Support Agent → `articles` з фільтром `subcategory=tutorial`.

**Готові датасети** (від користувача):
- статті та матеріали внутрішнього сервісу про публічні закупівлі;
- закони та нормативні акти.

## Web Search

**Бекенд:** Tavily API.

**Конфігурація:**
- Мова пошуку: `language=uk`, `country=UA`.
- Пост-фільтр результатів за мовою (через `langdetect` або LLM-фільтр у tool wrapper) — викидаємо не-UA результати.
- Для Technical Support Agent — параметр `allowed_domains` (whitelist доменів технічної документації майданчиків).

**Доступ:**
- Common Support Agent — Tavily без обмежень доменів.
- Technical Support Agent — Tavily з `allowed_domains` whitelist.
- Critic — Tavily для fact-checking (опційно).

## Сесії та память

**Backend:** PostgreSQL через `langgraph-checkpoint-postgres` (`PostgresSaver`).

**Session ID:** комбінація `team_id:channel_id:user_id` (для Slack-інтеграції) або `:thread_ts` для тримання контексту в threads.

**TTL сесії:** автоматичне закриття після N годин неактивності (значення в `.env`). Нова сесія = новий `thread_id`.

## Workflow (LangGraph)

```
START
  │
  ▼
Supervisor → Planner
  │
  ├─ if is_on_topic=false       → STATIC off-topic message → END
  ├─ if needs_human=true        → Escalation Agent → END
  │
  ▼
Fan-out по subtasks (паралельно):
  ├─ Lawyer Agent          (для topic=legal)
  ├─ Common Support Agent  (для topic=procurement_general)
  └─ Technical Support Agent (для topic=technical_system)
  │
  ▼
Aggregate by sections
  │
  ▼
Critic
  │
  ├─ if approve  → final response → END
  ├─ if revise && retries < N
  │     → re-run targeted workers with feedback → Aggregate → Critic
  └─ if revise && retries == N → Escalation Agent → END
```

**Агрегація відповіді** — простий збирач секцій (без LLM-виклику). Секції з порожніми відповідями (`found=false` без контенту) **не показуються** користувачу. Формат:

```markdown
### Юридичний аспект
[відповідь Lawyer Agent]

### Загальна процедура
[відповідь Common Support Agent]

### Технічна реалізація
[відповідь Technical Support Agent]
```

## Конфігурація через .env

Усі параметри додатку виносяться в `.env` через **Pydantic Settings** (`BaseSettings`). У репозиторії — `.env.example` із заглушками і повним переліком.

**Мінімальний перелік:**

```
# LLM
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
OPENAI_API_KEY=...
EMBEDDING_MODEL=text-embedding-3-small

# Web search
TAVILY_API_KEY=...
TECH_SUPPORT_ALLOWED_DOMAINS=domain1.ua,domain2.ua,...

# Vector DB
VECTOR_DB_URL=...
VECTOR_DB_LAWS_COLLECTION=laws
VECTOR_DB_ARTICLES_COLLECTION=articles

# Postgres (sessions)
POSTGRES_URL=postgresql://...
SESSION_TTL_HOURS=24

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_USER_CHANNEL_ID=C...
SLACK_EXPERT_CHANNEL_ID=C...

# Agent behavior
CRITIC_MAX_RETRIES=3
WORKER_TIMEOUT_SECONDS=60
PLANNER_MAX_SUBTASKS=3

# Observability
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASE_URL=...
```

## Інтеграція зі Slack

**Два канали:**

1. **Користувацький канал** — користувач задає питання, бот відповідає (агрегована відповідь або статичне off-topic / escalation повідомлення).
2. **Експертний канал** — Escalation Agent публікує повідомлення з повним контекстом для людини-оператора.

**Контракт повідомлення в експертний канал:**
- Оригінальний запит
- Категорія ескалації (bug / feature_request / unanswerable / max_retries_exceeded)
- Структурований план (від Planner)
- Спроби workers (повний контекст)
- Critic feedback (якщо ескалація після max_retries)
- Suggested next steps

## Моніторинг та тестування

### Langfuse (обов'язково)

Кожен запуск pipeline трейситься в Langfuse:
- Дерево викликів усіх агентів і tools (Planner → workers → Critic → Escalation).
- Latency, токени, cost для кожного LLM-виклику.
- Metadata: agent name, topic, urgency, confidence, session_id, retry count.
- Sessions і users tracking.
- System prompts усіх агентів винесено в Langfuse Prompt Management — у коді жодного захардкодженого промпту.
- Online evaluation через LLM-as-a-Judge (мінімум 2 evaluators).

### Тестування через DeepEval

**Golden dataset:** 15-20 прикладів (happy path + edge cases + failure cases) у `tests/golden_dataset.json`.

**Component tests:**

| Компонент | Що тестується | Метрика |
|---|---|---|
| Planner | Правильна класифікація topic, виявлення off-topic, виявлення needs_human | GEval (Plan Quality) + Tool Correctness |
| Lawyer Agent | Знаходить релевантні закони, не галюцинує, повертає `found=false` коли треба | Groundedness (GEval) |
| Common Support Agent | Знаходить релевантні статті, відповідь підкріплена джерелами | Groundedness + Answer Relevancy |
| Technical Support Agent | Правильно визначає коли потрібна ескалація на людину | Tool Correctness + GEval |
| Critic | Виявляє реальні gaps, формулює дієві revision_requests, не пропускає off-topic | GEval (Critique Quality) |
| Escalation | EscalationOutput містить повний контекст для оператора | GEval (Escalation Completeness) |

**End-to-end tests** на golden dataset з метриками:
- Correctness (GEval)
- Answer Relevancy
- Citation Presence (custom GEval)

**Запуск:** `deepeval test run tests/`.

## Структура проєкту

```
procurement-support/
├── main.py                  # Entry point — Slack bot + REPL fallback
├── supervisor.py            # Supervisor logic + LangGraph definition
├── agents/
│   ├── planner.py
│   ├── lawyer.py
│   ├── common_support.py
│   ├── technical_support.py
│   ├── critic.py
│   └── escalation.py
├── tools/
│   ├── rag.py               # RAG search by collection
│   ├── web_search.py        # Tavily wrapper з UA-фільтром
│   └── slack.py             # Slack publishing
├── retriever.py             # Hybrid search + reranking
├── ingest.py                # Ingestion pipeline → laws + articles collections
├── schemas.py               # Pydantic models (ResearchPlan, CritiqueResult, ...)
├── final_response.py        # Aggregator: workers → user-facing response
├── config.py                # Pydantic Settings — all .env vars
├── prompts/                 # Backup промптів (live версія в Langfuse)
├── tests/
│   ├── golden_dataset.json
│   ├── test_planner.py
│   ├── test_lawyer.py
│   ├── test_common_support.py
│   ├── test_technical_support.py
│   ├── test_critic.py
│   ├── test_escalation.py
│   └── test_e2e.py
├── data/                    # Source documents для ingestion
│   ├── laws/
│   └── articles/
├── output/                  # Escalation reports
├── requirements.txt
├── .env.example
└── README.md
```

## Що здавати

- Вихідний код у Git-репозиторії.
- README з діаграмою архітектури, інструкцією запуску, описом доменних обмежень, прикладами використання.
- `.env.example` з повним переліком змінних.
- Записане демо роботи системи (відео або GIF) — мінімум 3 сценарії: happy path, off-topic refusal, escalation.
- Скріншоти Langfuse: trace tree, session, evaluator scores, prompt management.
- Тести (DeepEval) з результатами запуску.
- Звіт про baseline-метрики системи.