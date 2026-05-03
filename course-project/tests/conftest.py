import pytest

from schemas import ResearchPlan, Source, SubTask, WorkerResponse


@pytest.fixture
def sample_source() -> Source:
    return Source(title="Закон 922, стаття 1", doc_id="law-922")


@pytest.fixture
def sample_worker_response(sample_source: Source) -> WorkerResponse:
    return WorkerResponse(
        topic="legal",
        found=True,
        answer="Тендерна документація — це...",
        sources=[sample_source],
        confidence=0.9,
    )


@pytest.fixture
def mock_tavily_results() -> list[dict[str, str]]:
    return [
        {
            "title": "Інструкція щодо подання тендерної пропозиції",
            "content": "Учасник завантажує документи через електронну систему закупівель.",
            "url": "https://example.gov.ua/prozorro/instruction",
        },
        {
            "title": "Роз'яснення щодо технічних помилок",
            "content": "Якщо майданчик повертає помилку, слід перевірити КЕП та формат файлів.",
            "url": "https://example.gov.ua/prozorro/errors",
        },
        {
            "title": "Оновлення правил роботи в ЕСЗ",
            "content": "Замовник публікує зміни до оголошення та повідомляє учасників через систему.",
            "url": "https://example.gov.ua/prozorro/updates",
        },
    ]


@pytest.fixture
def mock_worker_response_common() -> WorkerResponse:
    return WorkerResponse(
        topic="procurement_general",
        found=True,
        answer="Замовник може уточнювати умови закупівлі через оголошення та роз'яснення в ЕСЗ.",
        sources=[
            Source(
                title="Стаття про роз'яснення в ЕСЗ",
                doc_id="article-general-1",
                url="https://example.gov.ua/articles/general-1",
            )
        ],
        confidence=0.86,
    )


@pytest.fixture
def mock_worker_response_technical() -> WorkerResponse:
    return WorkerResponse(
        topic="technical_system",
        found=True,
        answer="Для подання пропозиції потрібно перевірити КЕП, формат файлів та доступність майданчика.",
        sources=[
            Source(
                title="Технічна довідка щодо роботи майданчика",
                doc_id="article-tech-1",
                url="https://example.gov.ua/articles/tech-1",
            )
        ],
        confidence=0.88,
    )


@pytest.fixture
def mock_research_plan_legal() -> ResearchPlan:
    return ResearchPlan(
        is_on_topic=True,
        original_query="Чи можна змінити істотні умови договору про закупівлю?",
        subtasks=[
            SubTask(
                topic="legal",
                query="Підстави для зміни істотних умов договору про закупівлю",
                rationale="Потрібно знайти правові підстави та обмеження у профільному законодавстві.",
            )
        ],
    )


@pytest.fixture
def mock_research_plan_off_topic() -> ResearchPlan:
    return ResearchPlan(
        is_on_topic=False,
        off_topic_reason="Запит стосується побутової техніки, а не публічних закупівель.",
        original_query="Який холодильник краще купити для дому?",
        subtasks=[],
    )


@pytest.fixture
def mock_research_plan_escalation() -> ResearchPlan:
    return ResearchPlan(
        is_on_topic=True,
        original_query="Потрібна оцінка ризиків для нестандартної оборонної закупівлі.",
        subtasks=[],
        needs_human=True,
        escalation_reason="Запит потребує експертної юридичної оцінки та контексту, якого немає в системі.",
    )
