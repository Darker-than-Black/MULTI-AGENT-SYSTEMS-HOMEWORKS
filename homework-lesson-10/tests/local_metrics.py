import re
from typing import Callable, Iterable, Sequence

from deepeval.metrics import BaseMetric  # type: ignore[import]
from deepeval.test_case import LLMTestCase  # type: ignore[import]


class DeterministicMetric(BaseMetric):
    def __init__(
        self,
        name: str,
        threshold: float,
        scorer: Callable[[LLMTestCase], tuple[float, str]],
    ) -> None:
        self.name = name
        self.threshold = threshold
        self.scorer = scorer
        self.async_mode = False
        self.verbose_mode = False
        self.include_reason = True
        self.evaluation_model = "deterministic-offline"
        self._required_params = []

    def measure(self, test_case: LLMTestCase, *args, **kwargs) -> float:
        score, reason = self.scorer(test_case)
        self.score = max(0.0, min(1.0, float(score)))
        self.reason = reason
        self.success = self.score >= self.threshold
        self.evaluation_cost = 0
        return self.score

    async def a_measure(self, test_case: LLMTestCase, *args, **kwargs) -> float:
        return self.measure(test_case, *args, **kwargs)

    def is_successful(self) -> bool:
        return bool(self.success)

    @property
    def __name__(self) -> str:
        return self.name


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def keyword_coverage_score(
    text: str,
    keyword_groups: Sequence[str | Sequence[str]],
) -> tuple[float, list[str]]:
    normalized = normalize_text(text)
    matched = 0
    missing: list[str] = []

    for group in keyword_groups:
        options = [group] if isinstance(group, str) else list(group)
        if any(normalize_text(option) in normalized for option in options):
            matched += 1
        else:
            missing.append(options[0])

    total = len(keyword_groups) or 1
    return matched / total, missing


def has_source_citation(text: str) -> bool:
    normalized = normalize_text(text)
    return any(
        marker in normalized
        for marker in ("http://", "https://", "source:", "sources:", "джерела:")
    )


def looks_like_refusal(text: str) -> bool:
    normalized = normalize_text(text)
    return any(
        snippet in normalized
        for snippet in (
            "cannot",
            "can't",
            "cannot assist",
            "can’t",
            "i can’t",
            "i can't",
            "outside",
            "not provide",
            "not disclose",
            "placeholders are still empty",
            "please restate",
            "please provide",
            "harm",
            "malware",
            "botnet",
        )
    )


def is_ukrainian_text(text: str) -> bool:
    cyrillic_count = len(re.findall(r"[А-Яа-яІіЇїЄєҐґ]", text))
    latin_count = len(re.findall(r"[A-Za-z]", text))
    return cyrillic_count > latin_count


def is_single_sentence(text: str) -> bool:
    stripped = " ".join(line.strip() for line in text.splitlines() if line.strip())
    sentences = [part for part in re.split(r"(?<=[.!?])\s+", stripped) if part]
    return len(sentences) <= 1


def tool_names(tools_called: Iterable[object]) -> list[str]:
    names: list[str] = []
    for tool in tools_called or []:
        name = getattr(tool, "name", None)
        if isinstance(name, str) and name:
            names.append(name)
    return names
