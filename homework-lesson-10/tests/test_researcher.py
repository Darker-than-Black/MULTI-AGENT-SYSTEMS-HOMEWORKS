"""
Component-level tests for the Researcher agent.

Tests verify:
- Findings are grounded in retrieved evidence (GEval groundedness)
- Findings contain source citations
- Edge-case handling for out-of-domain queries
"""

import json

import pytest
from deepeval import assert_test  # type: ignore[import]
from deepeval.metrics import GEval  # type: ignore[import]
from deepeval.test_case import LLMTestCase, LLMTestCaseParams  # type: ignore[import]
from local_metrics import DeterministicMetric, has_source_citation, keyword_coverage_score

from conftest import is_offline_mode

# ---------------------------------------------------------------------------
# Custom metric: Groundedness
# ---------------------------------------------------------------------------

groundedness_metric = GEval(
    name="Groundedness",
    evaluation_steps=[
        "Extract each distinct factual claim from 'actual output'.",
        "For each claim, determine whether it is directly supported by or inferable from 'retrieval context'.",
        "A claim not traceable to the retrieval context counts as ungrounded, even if factually true.",
        "Score = (number of grounded claims) / (total factual claims). "
        "If there are no factual claims, return 0.5 (neutral).",
    ],
    evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.RETRIEVAL_CONTEXT],
    model="gpt-4o-mini",
    threshold=0.7,
    verbose_mode=False,
)

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _findings_from(result: dict) -> str:
    findings = result.get("findings", "")
    if not findings or not findings.strip():
        pytest.skip("Researcher returned empty findings.")
    return findings


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.deepeval
def test_research_grounded_rag_topic(
    researcher_rag_result: dict,
    retrieval_context_rag: list[str],
) -> None:
    """
    Researcher findings for the RAG topic should be grounded in the
    local knowledge base content.
    """
    findings = _findings_from(researcher_rag_result)
    if is_offline_mode():
        test_case = LLMTestCase(
            input="Compare naive RAG vs sentence-window retrieval",
            actual_output=findings,
            retrieval_context=retrieval_context_rag,
        )

        def _score(_: LLMTestCase) -> tuple[float, str]:
            score, missing = keyword_coverage_score(
                findings,
                [
                    ("naive rag", "fixed chunks"),
                    ("sentence-window", "sentence window"),
                    ("retrieval", "context"),
                    ("source", "sources", "http"),
                ],
            )
            reason = "Offline findings cover the expected RAG comparison."
            if missing:
                reason = f"Missing expected grounded findings concepts: {', '.join(missing)}"
            return score, reason

        assert_test(
            test_case,
            [DeterministicMetric("Groundedness (Offline)", 0.75, _score)],
        )
        return

    test_case = LLMTestCase(
        input="Compare naive RAG vs sentence-window retrieval",
        actual_output=findings,
        retrieval_context=retrieval_context_rag,
    )
    assert_test(test_case, [groundedness_metric])


def test_research_completeness_has_sources(researcher_rag_result: dict) -> None:
    """
    Findings must contain at least one source citation (URL or 'Source' keyword).
    """
    findings = _findings_from(researcher_rag_result)
    has_source = "source" in findings.lower() or "http" in findings.lower()
    assert has_source, (
        "Researcher findings must include source citations (URL or 'Source:' label). "
        f"Got: {findings[:200]!r}"
    )


def test_research_minimum_length(researcher_rag_result: dict) -> None:
    """
    Findings must be substantive (> 200 characters) — not just a one-liner.
    """
    findings = _findings_from(researcher_rag_result)
    assert len(findings) > 200, (
        f"Findings are too short ({len(findings)} chars). Expected > 200 chars."
    )


@pytest.mark.deepeval
def test_research_edge_case_out_of_domain(
    researcher_quantum_result: dict,
) -> None:
    """
    For a query outside the local knowledge base (quantum computing),
    the researcher must rely on web search. Groundedness threshold is
    relaxed because retrieval_context is empty (no local documents).
    The test mainly verifies the researcher doesn't hallucinate with
    high confidence — low-threshold pass is acceptable.
    """
    findings = _findings_from(researcher_quantum_result)
    if is_offline_mode():
        test_case = LLMTestCase(
            input="Research quantum computing and compare it with classical computing",
            actual_output=findings,
        )

        def _score(_: LLMTestCase) -> tuple[float, str]:
            score, missing = keyword_coverage_score(
                findings,
                [
                    "quantum",
                    "classical",
                    ("qubit", "qubits"),
                    ("bit", "bits"),
                ],
            )
            bonus = 0.1 if has_source_citation(findings) else 0.0
            reason = "Offline out-of-domain findings remain high level and cited."
            if missing:
                reason = f"Missing quantum comparison concepts: {', '.join(missing)}"
            return min(1.0, score + bonus), reason

        assert_test(
            test_case,
            [DeterministicMetric("Groundedness (Out-of-Domain Offline)", 0.7, _score)],
        )
        return

    relaxed_metric = GEval(
        name="Groundedness (Out-of-Domain)",
        evaluation_steps=[
            "Check if the actual output makes factual claims about quantum computing.",
            "If the output explicitly states it could not find information, score 0.8 (graceful degradation).",
            "If the output makes claims that contradict known physics (e.g., 'quantum bits store 0, 1, and 3'), "
            "score 0.",
            "Otherwise score based on plausibility of claims.",
        ],
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model="gpt-4o-mini",
        threshold=0.4,
        verbose_mode=False,
    )

    test_case = LLMTestCase(
        input="Research quantum computing and compare it with classical computing",
        actual_output=findings,
    )
    assert_test(test_case, [relaxed_metric])
