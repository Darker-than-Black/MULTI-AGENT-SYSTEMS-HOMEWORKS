"""
Component-level tests for the Critic agent.

Tests verify:
- Critique schema validity
- Critique quality (GEval)
- Verdict consistency with revision requests
- Actionability of revision requests (custom business-logic GEval metric)
"""

import json

import pytest
from deepeval import assert_test  # type: ignore[import]
from deepeval.metrics import GEval  # type: ignore[import]
from deepeval.test_case import LLMTestCase, LLMTestCaseParams  # type: ignore[import]

# ---------------------------------------------------------------------------
# Custom metric: Critique Quality
# ---------------------------------------------------------------------------

critique_quality_metric = GEval(
    name="Critique Quality",
    evaluation_steps=[
        "Check that the critique identifies specific issues, not vague complaints like 'needs improvement'.",
        "If verdict is REVISE, check that revisionRequests contains at least one item.",
        "If verdict is APPROVE, check that revisionRequests is empty or absent.",
        "Check that the gaps list describes concrete missing information, not abstract categories.",
        "Check that the strengths list acknowledges what the findings did well.",
    ],
    evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
    model="gpt-4o-mini",
    threshold=0.7,
    verbose_mode=False,
)

# ---------------------------------------------------------------------------
# Custom business-logic metric: Critique Actionability
#
# This is the required custom GEval metric for business logic.
# It evaluates whether the Critic's revision requests are specific enough
# for the Researcher agent to act on without further clarification.
# The Supervisor passes revisionRequests directly to the next Researcher
# invocation, so vague requests like "improve quality" cause the Researcher
# to produce another poor iteration — wasting LLM budget and degrading
# system output quality.
# ---------------------------------------------------------------------------

critique_actionability_metric = GEval(
    name="Critique Actionability",
    criteria=(
        "Evaluate whether a research critic's revision requests are actionable by a "
        "downstream Researcher agent. Each revision request should name specific information "
        "to gather, specific sources to check, or specific claims to verify — not abstract "
        "suggestions like 'improve quality' or 'add more details'."
    ),
    evaluation_steps=[
        "For each item in revisionRequests, determine if the Researcher can act on it without ambiguity.",
        "An actionable request specifies: what to search for, which source to check, or which claim to verify.",
        "A vague request like 'make it better', 'add sources', or 'improve completeness' is NOT actionable.",
        "Score = (number of actionable requests) / (total requests). "
        "If revisionRequests is empty (APPROVE verdict), return 1.0.",
    ],
    evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
    model="gpt-4o-mini",
    threshold=0.7,
    verbose_mode=False,
)

# ---------------------------------------------------------------------------
# Required schema fields
# ---------------------------------------------------------------------------

REQUIRED_CRITIQUE_FIELDS = {
    "verdict": str,
    "isFresh": bool,
    "isComplete": bool,
    "isWellStructured": bool,
    "strengths": list,
    "gaps": list,
    "revisionRequests": list,
}

VALID_VERDICTS = {"APPROVE", "REVISE"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _critique_from(result: dict) -> dict:
    c = result.get("critique")
    if not c:
        pytest.skip("Critic returned no critique object.")
    return c


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_critique_schema_valid(critique_approve_result: dict) -> None:
    """Critique object must contain all required fields with correct types."""
    c = _critique_from(critique_approve_result)
    for field, expected_type in REQUIRED_CRITIQUE_FIELDS.items():
        assert field in c, f"Missing required critique field: '{field}'."
        assert isinstance(c[field], expected_type), (
            f"Field '{field}' should be {expected_type.__name__}, got {type(c[field]).__name__}."
        )
    assert c["verdict"] in VALID_VERDICTS, (
        f"verdict must be one of {VALID_VERDICTS}, got '{c['verdict']}'."
    )


@pytest.mark.deepeval
def test_critique_approve_verdict(critique_approve_result: dict) -> None:
    """
    Critic should approve high-quality, complete findings and produce
    a high-quality critique explaining why.
    """
    c = _critique_from(critique_approve_result)
    assert c.get("verdict") == "APPROVE", (
        f"Expected verdict=APPROVE for high-quality findings, got '{c.get('verdict')}'."
    )
    test_case = LLMTestCase(
        input="Compare naive RAG vs sentence-window retrieval",
        actual_output=json.dumps(c, ensure_ascii=False),
    )
    assert_test(test_case, [critique_quality_metric])


@pytest.mark.deepeval
def test_critique_revise_verdict(critique_revise_result: dict) -> None:
    """
    Critic should request revision for shallow, unsupported findings and
    produce a quality critique explaining what is missing.
    """
    c = _critique_from(critique_revise_result)
    assert c.get("verdict") == "REVISE", (
        f"Expected verdict=REVISE for shallow findings, got '{c.get('verdict')}'."
    )
    assert len(c.get("revisionRequests", [])) >= 1, (
        "REVISE verdict must include at least one revision request."
    )
    test_case = LLMTestCase(
        input="Compare naive RAG vs sentence-window retrieval",
        actual_output=json.dumps(c, ensure_ascii=False),
    )
    assert_test(test_case, [critique_quality_metric])


@pytest.mark.deepeval
def test_critique_actionability(critique_revise_result: dict) -> None:
    """
    Revision requests from the Critic must be specific enough for the
    Researcher to act on (custom business-logic metric).
    """
    c = _critique_from(critique_revise_result)
    test_case = LLMTestCase(
        input="Compare naive RAG vs sentence-window retrieval",
        actual_output=json.dumps(c, ensure_ascii=False),
    )
    assert_test(test_case, [critique_actionability_metric])


def test_critique_approve_no_revision_requests(critique_approve_result: dict) -> None:
    """APPROVE verdict must have an empty revisionRequests list."""
    c = _critique_from(critique_approve_result)
    if c.get("verdict") == "APPROVE":
        requests = c.get("revisionRequests", [])
        assert requests == [], (
            f"APPROVE verdict must not have revision requests, got: {requests}"
        )
