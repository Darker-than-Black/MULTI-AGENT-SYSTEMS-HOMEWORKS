from final_response import format_response
from schemas import Source, WorkerResponse


def test_format_response_renders_single_section_with_sources() -> None:
    response = WorkerResponse(
        topic="legal",
        found=True,
        answer="Зміна істотних умов договору допускається лише у визначених випадках.",
        sources=[
            Source(
                title="Закон 922, стаття 41",
                doc_id="law-922-41",
                url="https://zakon.rada.gov.ua/laws/show/922-19#Text",
            )
        ],
        confidence=0.95,
    )

    result = format_response([response], "uk")

    assert "## Юридична консультація" in result
    assert "Зміна істотних умов договору" in result
    assert "**Джерела:**" in result
    assert "Закон 922, стаття 41" in result


def test_format_response_renders_multiple_sections() -> None:
    responses = [
        WorkerResponse(
            topic="procurement_general",
            found=True,
            answer="Відкриті торги включають оголошення, подання пропозицій і оцінку.",
            confidence=0.88,
        ),
        WorkerResponse(
            topic="technical_system",
            found=True,
            answer="Перевірте формат файлу та чинність КЕП.",
            confidence=0.82,
        ),
    ]

    result = format_response(responses, "uk")

    assert "## Загальна інформація про закупівлі" in result
    assert "## Технічна підтримка" in result
    assert "\n\n---\n\n" in result


def test_format_response_skips_not_found_sections() -> None:
    responses = [
        WorkerResponse(
            topic="legal",
            found=False,
            answer=None,
            confidence=0.2,
        ),
        WorkerResponse(
            topic="technical_system",
            found=True,
            answer="Спробуйте повторити вхід після перевірки КЕП.",
            confidence=0.78,
        ),
    ]

    result = format_response(responses, "uk")

    assert "## Юридична консультація" not in result
    assert "## Технічна підтримка" in result


def test_format_response_returns_no_answer_message_when_all_sections_empty() -> None:
    responses = [
        WorkerResponse(
            topic="legal",
            found=False,
            answer=None,
            confidence=0.1,
        )
    ]

    assert format_response(responses, "en") == "No answer found in the knowledge base."


def test_format_response_uses_english_section_labels() -> None:
    response = WorkerResponse(
        topic="technical_system",
        found=True,
        answer="Check the file format and your signature token.",
        confidence=0.84,
    )

    result = format_response([response], "en")

    assert "## Technical Support" in result
