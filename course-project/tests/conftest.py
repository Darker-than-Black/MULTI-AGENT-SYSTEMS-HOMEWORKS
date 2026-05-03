import pytest

from schemas import Source, WorkerResponse


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
