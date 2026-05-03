"""Bilingual topic-to-section-label mapping helper for response formatting."""

_LABELS: dict[str, dict[str, str]] = {
    "legal": {
        "uk": "Юридична консультація",
        "en": "Legal Advice",
    },
    "procurement_general": {
        "uk": "Загальна інформація про закупівлі",
        "en": "General Procurement Info",
    },
    "technical_system": {
        "uk": "Технічна підтримка",
        "en": "Technical Support",
    },
}

_NO_ANSWER: dict[str, str] = {
    "uk": "Відповідь не знайдена в базі знань.",
    "en": "No answer found in the knowledge base.",
}


def get_section_label(topic: str, language: str = "uk") -> str:
    return _LABELS.get(topic, {}).get(language, topic)


def get_no_answer_message(language: str = "uk") -> str:
    return _NO_ANSWER.get(language, _NO_ANSWER["uk"])
