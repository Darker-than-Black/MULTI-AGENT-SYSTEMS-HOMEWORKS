# Delivery Checklist

> **Як читати:** план реалізації побудовано як **vertical slices** — на кожній фазі система запускається і працює end-to-end, просто з обмеженою функціональністю. Це дозволяє на будь-якому етапі мати "робочий продукт" і знизити ризик "не встигли інтегрувати".
>
> **Гранулярність:** кожен пункт ≈ одна сесія в Claude Code (30-60 хв). Підпункти — для відстеження прогресу всередині пункту.
>
> **Посилання:** деталі реалізації — у `ARCHITECTURE.md`. Цей документ — про *що зробити і в якому порядку*, не про *як саме*.

---

## Phase 0 — Foundation

> **Мета:** репозиторій, інфраструктура, базовий конфіг. Кінець фази: проєкт запускається з `python main.py` і виводить `Hello`.

### 0.1 Ініціалізація репозиторію
- [ ] Створити структуру директорій згідно з `ARCHITECTURE.md` § 3
- [ ] `.gitignore` (Python, .env, .venv, qdrant_data, pg_data, output/, __pycache__)
- [ ] `README.md` — заглушка зі схемою архітектури, посиланнями на ARCHITECTURE та DELIVERY_CHECKLIST
- [ ] `requirements.txt` — повний стек з ARCHITECTURE.md § 2 з фіксованими версіями
- [ ] Python venv, перевірити що `pip install -r requirements.txt` проходить чисто

### 0.2 Конфігурація через Pydantic Settings
- [ ] `config.py` — клас `Settings(BaseSettings)` з усіма полями з ARCHITECTURE § 11
- [ ] Валідатори для CSV-полів (`tech_support_allowed_domains`, `tech_support_tag_whitelist`)
- [ ] `.env.example` з повним переліком ключів і коментарями-описами
- [ ] Тест: `python -c "from config import settings; print(settings.llm_model)"` працює

### 0.3 Інфраструктура локально
- [ ] `docker-compose.yml` — Qdrant + Postgres
- [ ] Перевірити запуск: `docker compose up -d`, `curl localhost:6333/healthz`
- [ ] Ініціалізація Postgres: створення схеми для LangGraph checkpointer (через `PostgresSaver.setup()`)

### 0.4 Stub main.py
- [ ] Завантаження settings, простий REPL loop ("введіть питання → друкуємо назад")
- [ ] Перевірка: `python main.py` запускається, читає stdin, не падає

---

## Phase 1 — Vertical Slice #1: "Single agent, single topic, no fancy stuff"

> **Мета:** найпростіший шлях від запиту до відповіді. Один Lawyer Agent, RAG без hybrid/rerank, без Critic, без Slack. CLI-only.
>
> **Кінець фази:** `python main.py` приймає юридичне питання, шукає у векторній БД, повертає відповідь з джерелами.

### 1.1 Pydantic schemas (ядро)
- [ ] `schemas.py` — `Source`, `WorkerResponse`, `SubTask`, `ResearchPlan`, `CritiqueResult`, `EscalationOutput`, `GraphState`
- [ ] Валідатори узгодженості (з ARCHITECTURE § 4)
- [ ] Unit-тести на валідатори (pytest, мінімум по 1 тесту на схему)

### 1.2 Embeddings + Qdrant client
- [ ] `retrieval/embeddings.py` — обгортка над OpenAI embeddings з batch-підтримкою
- [ ] Qdrant client (singleton), створення колекцій з потрібним vector size
- [ ] Перевірка: вручну upsert тестового вектора → search → знайдено

### 1.3 Ingestion pipeline (мінімальна версія)
- [ ] `ingest/chunkers.py` — `chunk_law()` (вже готові chunks у JSONL — pass-through), `chunk_article()` (RecursiveCharacterTextSplitter)
- [ ] `ingest/pipeline.py` — читання JSONL → embedding text → embed → upsert у Qdrant
- [ ] `ingest/run_ingest.py` — CLI з `--collection` flag
- [ ] Тестовий прогін на mini-датасеті (10 законів, 10 статей)

### 1.4 Базовий retriever (тільки semantic, без BM25/rerank)
- [ ] `retrieval/retriever.py` — функція `semantic_search(query, collection, filters, top_k)` яка повертає `list[Chunk]`
- [ ] Підтримка payload filters в Qdrant (для майбутнього `article_number` pre-filter)
- [ ] Unit-тест: search повертає очікувану структуру

### 1.5 RAG tool
- [ ] `tools/rag.py` — `rag_search` як LangChain `@tool` з docstring (для function calling)
- [ ] Параметри: `query`, `collection`. Внутрішньо викликає retriever
- [ ] Форматування результату під LLM context (з breadcrumb / source)

### 1.6 Lawyer Agent (мінімальна версія)
- [ ] `agents/lawyer.py` — `build_lawyer_agent()` з system prompt (поки локально, не Langfuse)
- [ ] Hardcoded system prompt у `prompts/lawyer.md`
- [ ] Tool: `rag_search` (тільки колекція `laws`)
- [ ] Output: `WorkerResponse` через `with_structured_output`

### 1.7 Скелет main.py з прямим викликом Lawyer
- [ ] REPL loop: input → invoke lawyer agent → print formatted response
- [ ] Перевірка: задаємо юридичне питання → отримуємо відповідь з джерелами

**🎯 Milestone 1:** `python main.py` працює end-to-end на юридичних запитах.

---

## Phase 2 — Vertical Slice #2: "All workers + Planner routing"

> **Мета:** додати Planner і двох інших workers. Поки **single-topic** routing (без fan-out), без Critic.
>
> **Кінець фази:** Planner класифікує запит → правильний worker відповідає → користувач отримує відповідь.

### 2.1 Tavily web_search tool
- [ ] `tools/web_search.py` — обгортка над Tavily API
- [ ] Pre-config: `language=uk`, `country=UA`
- [ ] Підтримка `allowed_domains` параметра
- [ ] Post-filter: language detection через `langdetect`, drop non-UA
- [ ] Trim snippets до N символів
- [ ] Unit-тест на mock Tavily response

### 2.2 Common Support Agent
- [ ] `agents/common_support.py`
- [ ] System prompt у `prompts/common_support.md` з доменними обмеженнями
- [ ] Tools: `rag_search` (колекція `articles`) + `web_search` (без whitelist)
- [ ] Output: `WorkerResponse`

### 2.3 Technical Support Agent
- [ ] `agents/technical_support.py`
- [ ] System prompt з логікою "повертай needs_human=True якщо це опис баги/відсутньої функції"
- [ ] Tools: `rag_search` з pre-filter за tags + `web_search` з `allowed_domains`
- [ ] Output: `WorkerResponse`

### 2.4 Planner Agent
- [ ] `agents/planner.py`
- [ ] System prompt з прикладами класифікації (off-topic / escalation / single subtask)
- [ ] Output: `ResearchPlan` через `with_structured_output`
- [ ] **На цьому етапі обмежити `subtasks` максимум 1 елементом** — це single-topic фаза
- [ ] Окремі тести для off-topic, escalation, on-topic кейсів

### 2.5 LangGraph: базовий граф (без fan-out, без Critic)
- [ ] `supervisor.py` — `build_graph()` з nodes: `planner`, `off_topic_response`, `lawyer`, `common_support`, `technical_support`, `final_response`
- [ ] Conditional edges: `route_after_planner` (off-topic / escalation / route to single worker)
- [ ] **Без** `escalation_node` поки що — заглушка, що друкує "TODO escalate"
- [ ] State: `GraphState` (без `worker_responses` reducer наразі — single value)

### 2.6 Інтеграція з main.py
- [ ] Замінити прямий виклик lawyer на `graph.invoke()`
- [ ] In-memory checkpointer (`MemorySaver`) — Postgres підключимо пізніше
- [ ] Перевірити 4 типи запитів: legal, general, technical, off-topic

### 2.7 Section labels (двомовність)
- [ ] `language.py` — мапа `topic → label` для UK і EN
- [ ] `final_response.py` — формування markdown з секціями (поки тільки 1 секція = 1 worker, але код готовий для багатьох)
- [ ] Skip пустих секцій (`found=False` без контенту)

**🎯 Milestone 2:** Planner-driven routing працює, всі 3 workers відповідають, off-topic відсіюється.

---

## Phase 3 — Vertical Slice #3: "Fan-out + Critic loop"

> **Мета:** multi-topic запити (паралельний fan-out), Critic loop з targeted re-dispatch.
>
> **Кінець фази:** запит "яка комісія на майданчику X і чи не порушує це закон Y" → паралельно technical + legal → агрегована відповідь → Critic approve/revise.

### 3.1 Planner: multi-topic
- [ ] Прибрати обмеження `max_subtasks=1`, дозволити до `PLANNER_MAX_SUBTASKS`
- [ ] Few-shot examples у prompt для multi-topic запитів
- [ ] Тести: запит охоплює 2-3 топіки → план містить відповідну кількість subtasks

### 3.2 Fan-out в LangGraph
- [ ] `fan_out_dispatcher` node з Send API (ARCHITECTURE § 5.4)
- [ ] State: `worker_responses: Annotated[list[WorkerResponse], operator.add]`
- [ ] Перевірка паралельного виконання (час ~ longest worker, не сумарний)

### 3.3 Aggregator
- [ ] `final_response.py` — `aggregate(worker_responses, language) -> str`
- [ ] Markdown секції в правильному порядку, скіп пустих
- [ ] Unit-тести: 1, 2, 3 секції; всі пусті; mix found/not-found

### 3.4 Critic Agent
- [ ] `agents/critic.py`
- [ ] System prompt з трьома вимірами (Freshness / Completeness / Structure)
- [ ] Tools: web_search (для fact-checking) — опційно для першої версії
- [ ] Output: `CritiqueResult`
- [ ] Логіка freshness: порівняння `version_date` / `date_published` з порогами з `.env`

### 3.5 Critic loop в графі
- [ ] `critic_node` після `aggregate_responses_node`
- [ ] `route_after_critic` conditional edge
- [ ] `targeted_redispatcher` — Send тільки тим workers, кому є `revision_requests`
- [ ] State: `retry_count` (увеличуємо на кожному revise), `critic_history: list[CritiqueResult]`
- [ ] При `retry_count >= CRITIC_MAX_RETRIES` → escalation

### 3.6 Worker з revision_feedback
- [ ] Кожен worker приймає опційний `revision_feedback` параметр
- [ ] Інжектиться у prompt як "Попередня версія отримала зауваження: ..."
- [ ] Worker зобовʼязаний врахувати feedback або обґрунтовано визнати, що не може

**🎯 Milestone 3:** multi-topic запит проходить fan-out → aggregate → critic → optional revise → final response.

---

## Phase 4 — Hybrid Search + Reranking

> **Мета:** замінити semantic-only retrieval на повний hybrid pipeline.
>
> **Кінець фази:** retrieval використовує semantic + BM25 + cross-encoder.

### 4.1 BM25 індекс
- [ ] `retrieval/retriever.py` — load корпусу при старті, побудова `BM25Okapi` instance per collection
- [ ] Singleton pattern (lazy init на першому запиті)
- [ ] Підтримка тих самих filters що й у semantic (через post-filter після BM25)

### 4.2 Ensemble (RRF merge)
- [ ] Reciprocal Rank Fusion з вагами `HYBRID_SEMANTIC_WEIGHT` / `HYBRID_BM25_WEIGHT`
- [ ] Unit-тест: відомий вхід → відомий ranked вихід

### 4.3 Reranker
- [ ] `retrieval/reranker.py` — load `BAAI/bge-reranker-base` (sentence-transformers CrossEncoder)
- [ ] Singleton, lazy load
- [ ] Функція `rerank(query, candidates, top_k, threshold) -> list[Chunk]`

### 4.4 Інтеграція в `hybrid_search`
- [ ] Замінити `semantic_search` на повний pipeline в `tools/rag.py`
- [ ] Pre-filtering за метаданими (article_number в Lawyer, tags в Technical)
- [ ] A/B вручну: semantic-only vs hybrid+rerank на 5-10 тестових запитах

**🎯 Milestone 4:** retrieval якість суттєво краща (manual eval). Pre-filter за `article_number` працює.

---

## Phase 5 — Sessions + Slack Integration

> **Мета:** перехід з REPL на Slack бота з persistent sessions.

### 5.1 Postgres checkpointer
- [ ] Замінити `MemorySaver` на `PostgresSaver`
- [ ] Setup схеми (одноразово через `PostgresSaver.setup()`)
- [ ] Тест: рестарт додатку — попередня сесія підвантажується по `thread_id`

### 5.2 Session ID generator
- [ ] `make_session_id(team_id, channel_id, user_id)` — формат з ARCHITECTURE § 8.2
- [ ] Опційний `:thread_ts` для Slack threads

### 5.3 Slack Bolt app
- [ ] `main.py` — Slack Bolt setup, токени з `.env`
- [ ] Handler на `app_mention` у `SLACK_USER_CHANNEL_ID`
- [ ] Виклик графа з `thread_id = session_id`
- [ ] Reply у thread оригінального message

### 5.4 Slack publisher для escalation
- [ ] `tools/slack_publisher.py` — функція `post_to_expert_channel(EscalationOutput)`
- [ ] Block Kit або markdown форматування з ARCHITECTURE § 9.3
- [ ] Error handling: якщо Slack недоступний — fallback до файлу

### 5.5 REPL fallback
- [ ] Прапор у main.py: `--mode=slack|repl`
- [ ] REPL читає stdin замість Slack events, все інше працює так само
- [ ] Корисно для розробки і демо

**🎯 Milestone 5:** Slack бот відповідає на питання в каналі, сесії живуть між рестартами.

---

## Phase 6 — Escalation Agent

> **Мета:** повноцінний Escalation flow.

### 6.1 Escalation Agent
- [ ] `agents/escalation.py` — формує `EscalationOutput`
- [ ] LLM-виклик для `summary` поля (стисле формулювання для оператора)
- [ ] Збереження report у `output/escalations/{session_id}_{timestamp}.json`

### 6.2 Інтеграція в граф
- [ ] `escalation_node` замість заглушки
- [ ] Тригери: `plan.needs_human=True`, `retry_count >= MAX_RETRIES`, технічні помилки

### 6.3 Static user-facing message
- [ ] Шаблон повідомлення для користувача (UK/EN), що "запит передано оператору"
- [ ] Без розкриття внутрішніх деталей

### 6.4 Slack publish + file save
- [ ] Виклик `slack_publisher.post_to_expert_channel`
- [ ] File save як аудит-trail (завжди, навіть якщо Slack ОК)

**🎯 Milestone 6:** ескалація працює end-to-end (планер → escalate, retry overflow → escalate, bug detection в technical → escalate).

---

## Phase 7 — Observability (Langfuse)

> **Мета:** повне трейсинг + Prompt Management + LLM-as-a-Judge.

### 7.1 Langfuse setup
- [ ] Account, project, API keys у `.env`
- [ ] `observability/langfuse_client.py` — singleton клієнт
- [ ] `observability/callbacks.py` — `CallbackHandler` factory

### 7.2 Tracing інтеграція
- [ ] Передача callback у `graph.invoke(config={"callbacks": [...]})`
- [ ] Metadata: `user_id`, `session_id`, `tags`
- [ ] Перевірка: 3-5 запусків → 3-5 traces у Langfuse UI з повним деревом

### 7.3 Prompt Management
- [ ] Створити промпти в Langfuse UI з label `production`
- [ ] Замінити `prompts/*.md` reading на `langfuse.get_prompt(...).compile(...)`
- [ ] Backup prompts в репо для git review (sync script — опційно)
- [ ] Перевірка: змінити prompt в Langfuse → перезапустити агент → нова поведінка без redeploy

### 7.4 Sessions + Users tracking
- [ ] Заповнення `session_id`, `user_id` у callback metadata
- [ ] Перевірка: Sessions / Users tabs у Langfuse містять дані

### 7.5 LLM-as-a-Judge evaluators
- [ ] Налаштувати в Langfuse UI мінімум 2 evaluators (Groundedness + Off-topic adherence)
- [ ] Зробити 3-5 нових запусків
- [ ] Перевірити автоматичні scores у traces

**🎯 Milestone 7:** усі traces у Langfuse, prompts завантажуються з prod label, evaluators запускаються автоматично.

---

## Phase 8 — Testing

> **Мета:** golden dataset + automated evals на всіх рівнях.

### 8.1 Golden dataset
- [ ] `tests/golden_dataset.json` — 15-20 прикладів (5 happy / 5 edge / 5 failure)
- [ ] Manual review кожного прикладу
- [ ] Структура з ARCHITECTURE § 13.2

### 8.2 Unit tests
- [ ] `tests/conftest.py` — фікстури (settings, mock LLM, sample chunks)
- [ ] Тести на чисті функції: chunkers, RRF merge, language detection, section formatting

### 8.3 Component tests (DeepEval)
- [ ] `test_planner.py` — Plan Quality (GEval) на 3-5 кейсах
- [ ] `test_lawyer.py` — Groundedness на юридичних кейсах
- [ ] `test_common_support.py` — Groundedness + Answer Relevancy
- [ ] `test_technical_support.py` — escalation detection (Tool Correctness + GEval)
- [ ] `test_critic.py` — Critique Quality (custom GEval)
- [ ] `test_escalation.py` — EscalationOutput completeness

### 8.4 Tool correctness tests
- [ ] `test_tools.py` — мінімум 3 кейси (Planner викликає правильні tools, Lawyer тільки `rag_search`, Technical Support викликає `web_search` з whitelist)

### 8.5 E2E tests
- [ ] `test_e2e.py` — прогін golden dataset через `graph.invoke()`
- [ ] Метрики: Correctness (vs `expected_output`), Answer Relevancy
- [ ] Збереження результатів у файл для baseline

### 8.6 CI integration (опційно)
- [ ] GitHub Actions workflow `deepeval test run tests/`
- [ ] Запуск на PR

**🎯 Milestone 8:** `deepeval test run tests/` проходить, baseline scores зафіксовані.

---

## Phase 9 — Polish + Demo prep

> **Мета:** все що залишилось до здачі.

### 9.1 README
- [ ] Опис проєкту, архітектурна діаграма (Mermaid або PNG)
- [ ] Quick start guide (з ARCHITECTURE § 14)
- [ ] Опис доменних обмежень
- [ ] Приклади запитів (happy / off-topic / escalation)
- [ ] Лінки на ARCHITECTURE.md та DELIVERY_CHECKLIST.md

### 9.2 Демо
- [ ] Сценарій 1: happy path multi-topic (legal + technical)
- [ ] Сценарій 2: off-topic refusal
- [ ] Сценарій 3: escalation (bug report)
- [ ] Запис відео або GIF (3-5 хв)

### 9.3 Скріншоти Langfuse
- [ ] Trace tree з повним деревом викликів
- [ ] Sessions view
- [ ] Evaluator scores
- [ ] Prompt Management

### 9.4 Звіт baseline-метрик
- [ ] Зведена таблиця DeepEval scores
- [ ] Аналіз провалів і найслабших місць

### 9.5 Cleanup
- [ ] Видалити dead code, TODO без власника
- [ ] Перевірити що `.env.example` синхронізований з реальним кодом
- [ ] Перевірити що `requirements.txt` точний і встановлюється з нуля

**🎯 Milestone 9:** проєкт готовий до здачі і захисту.

---

## Опційні розширення (якщо є час)

- [ ] Cleanup сесій по TTL (background task)
- [ ] Migration BM25 на Qdrant native sparse vectors
- [ ] HITL approval перед публікацією у Slack expert channel
- [ ] Multilingual prompt versions (UK/EN) у Langfuse
- [ ] A/B prompt testing через Langfuse labels
- [ ] Метрика "Citation accuracy" (custom GEval) — чи правильно агенти цитують джерела

---

## Як працювати з цим документом у Claude Code

1. **На початку сесії:** показати Claude поточний пункт чекліста, наприклад: *"Працюємо над 1.6 Lawyer Agent (мінімальна версія). Деталі — у ARCHITECTURE.md § 4 і § 6."*
2. **Завершуючи пункт:** ставити `[x]`, коммітити з префіксом `[1.6]`.
3. **Якщо з'являються відкриття/зміни архітектури:** оновлювати `ARCHITECTURE.md` — це live-документ.
4. **Не йти вперед** до завершення поточного milestone. Якщо вертикальний slice не працює — це сигнал зупинитись і доробити.