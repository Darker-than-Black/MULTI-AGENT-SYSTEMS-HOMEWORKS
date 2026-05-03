import pytest
from pydantic import ValidationError

from schemas import ResearchPlan, Source, SubTask, WorkerResponse


def _subtask() -> SubTask:
    return SubTask(topic="legal", query="test", rationale="test")


class TestWorkerResponse:
    def test_valid_confidence_bounds(self) -> None:
        for v in (0.0, 0.5, 1.0):
            r = WorkerResponse(topic="legal", found=True, confidence=v)
            assert r.confidence == v

    def test_confidence_above_one_raises(self) -> None:
        with pytest.raises(ValidationError):
            WorkerResponse(topic="legal", found=True, confidence=1.1)

    def test_confidence_below_zero_raises(self) -> None:
        with pytest.raises(ValidationError):
            WorkerResponse(topic="legal", found=True, confidence=-0.1)


class TestResearchPlan:
    def test_off_topic_with_subtasks_raises(self) -> None:
        with pytest.raises(ValidationError, match="off-topic"):
            ResearchPlan(
                is_on_topic=False,
                original_query="test",
                subtasks=[_subtask()],
            )

    def test_needs_human_missing_reason_raises(self) -> None:
        with pytest.raises(ValidationError, match="escalation_reason"):
            ResearchPlan(
                is_on_topic=True,
                original_query="test",
                needs_human=True,
                subtasks=[_subtask()],
            )

    def test_on_topic_empty_subtasks_raises(self) -> None:
        with pytest.raises(ValidationError, match="at least one subtask"):
            ResearchPlan(is_on_topic=True, original_query="test", subtasks=[])

    def test_valid_off_topic(self) -> None:
        plan = ResearchPlan(
            is_on_topic=False,
            off_topic_reason="Not procurement",
            original_query="test",
        )
        assert not plan.is_on_topic
        assert plan.subtasks == []

    def test_valid_on_topic(self) -> None:
        plan = ResearchPlan(
            is_on_topic=True,
            original_query="test",
            subtasks=[_subtask()],
        )
        assert plan.subtasks

    def test_valid_needs_human(self) -> None:
        plan = ResearchPlan(
            is_on_topic=True,
            original_query="test",
            needs_human=True,
            escalation_reason="Needs specialist",
        )
        assert plan.needs_human


class TestSource:
    def test_url_is_optional(self) -> None:
        src = Source(title="Закон 922", doc_id="law-922")
        assert src.url is None

    def test_with_url(self) -> None:
        src = Source(title="Закон 922", doc_id="law-922", url="https://example.com")
        assert src.url == "https://example.com"
