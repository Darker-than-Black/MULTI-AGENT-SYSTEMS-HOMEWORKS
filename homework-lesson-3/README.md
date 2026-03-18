# Research Agent (Homework Lesson 3)

CLI-агент для дослідження теми через веб-пошук, читання джерел і генерацію структурованого Markdown-звіту.

## Можливості

- Інтерактивний режим у терміналі (`python main.py`)
- Автономний вибір інструментів агентом (ReAct-поведінка)
- Збереження контексту діалогу в межах сесії (`MemorySaver`)
- Контроль максимальної кількості кроків (`MAX_ITERATIONS`)
- Обрізання великих результатів tools для захисту контекстного вікна
- Збереження фінального звіту у файл через tool `write_report`
- Fallback-збереження у CLI, якщо агент не викликав `write_report`

## Інструменти агента

1. `web_search(query: str) -> list[dict]`
Пошук через DuckDuckGo (`ddgs`) з нормалізацією у формат:
`{"title": "...", "url": "...", "snippet": "..."}`.

2. `read_url(url: str) -> str`
Завантаження й екстракція основного тексту сторінки через `trafilatura` з обрізанням до `MAX_URL_CONTENT_LENGTH`.

3. `write_report(filename: str, content: str) -> str`
Запис Markdown-звіту у директорію `OUTPUT_DIR`.

## Структура проєкту

```text
homework-lesson-3/
├── main.py               # CLI цикл, stream-вивід, spinner, fallback save
├── agent.py              # LLM + tools + memory + create_react_agent
├── tools.py              # Реалізація web_search/read_url/write_report
├── config.py             # Settings + SYSTEM_PROMPT
├── requirements.txt      # Залежності
├── example_output/
│   └── report.md         # Приклад звіту
└── output/               # Згенеровані звіти під час запуску
```

## Вимоги до середовища

- Python `3.11+` (рекомендовано)
- OpenAI API key
- Доступ до інтернету для `web_search`/`read_url`

## Встановлення

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Налаштування `.env`

Створіть `.env` у корені проєкту:

```env
OPENAI_API_KEY=sk-...
MODEL_NAME=gpt-4o-mini
MAX_SEARCH_RESULTS=5
MAX_URL_CONTENT_LENGTH=5000
OUTPUT_DIR=output
MAX_ITERATIONS=10
```

## Запуск

```bash
python main.py
```

Команди в інтерфейсі:
- введіть запит для дослідження;
- `exit` або `quit` для виходу.

## Як працює pipeline

1. Користувач ставить запит у CLI.
2. Агент планує кроки та викликає tools.
3. `web_search` знаходить релевантні URL.
4. `read_url` читає повні тексти джерел.
5. Агент формує Markdown-звіт із секцією джерел.
6. Агент викликає `write_report` для збереження файлу.
7. Якщо цього не сталося, `main.py` виконує fallback-збереження.

## Приклад результату

- Базовий приклад: `example_output/report.md`
- Реальні результати запусків: директорія `output/`

## Нотатки з безпеки

- Не комітьте `.env` у репозиторій.
- Якщо API-ключ потрапив у лог/чат, його потрібно негайно ротувати.
