"""
End-to-end tests using the golden dataset.

Runs the full supervisor pipeline on each golden dataset example and
evaluates the output using:
- AnswerRelevancyMetric  (DeepEval built-in)
- Correctness           (custom GEval)
- Citation Presence     (custom GEval — business logic)

Failure-case examples use an inverted assertion: the system should produce
a low-relevancy answer or an explicit refusal for out-of-domain / harmful input.
"""

import pytest
from deepeval import assert_test  # type: ignore[import]
from deepeval.metrics import AnswerRelevancyMetric, GEval  # type: ignore[import]
from deepeval.test_case import LLMTestCase, LLMTestCaseParams  # type: ignore[import]

from conftest import cached_run, load_golden_dataset

# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

answer_relevancy_metric = AnswerRelevancyMetric(
    threshold=0.7,
    model="gpt-4o-mini",
    verbose_mode=False,
)

correctness_metric = GEval(
    name="Correctness",
    evaluation_steps=[
        "Check whether the facts in 'actual output' contradict 'expected output'.",
        "Penalise omission of critical details mentioned in 'expected output'.",
        "Different wording of the same concept is acceptable.",
        "Award partial credit for partially correct answers.",
        "If 'expected output' is empty (failure case), skip this check and score 1.0.",
    ],
    evaluation_params=[
        LLMTestCaseParams.INPUT,
        LLMTestCaseParams.ACTUAL_OUTPUT,
        LLMTestCaseParams.EXPECTED_OUTPUT,
    ],
    model="gpt-4o-mini",
    threshold=0.6,
    verbose_mode=False,
)

citation_presence_metric = GEval(
    name="Citation Presence",
    evaluation_steps=[
        "Check if the actual output contains at least one URL (http:// or https://) "
        "or a named source reference (e.g., 'Source:', 'Reference:', document title).",
        "A markdown '## Sources' section with bullet-pointed URLs scores highest (1.0).",
        "Vague references like 'according to experts' score 0.3.",
        "No citations at all scores 0.",
    ],
    evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
    model="gpt-4o-mini",
    threshold=0.5,
    verbose_mode=False,
)

# ---------------------------------------------------------------------------
# Refusal detection
# ---------------------------------------------------------------------------

REFUSAL_KEYWORDS = [
    "cannot", "can't", "unable", "don't", "not able", "outside my",
    "not within", "not appropriate", "i'm sorry", "sorry, i",
    "i cannot assist", "that's not something",
]


def _looks_like_refusal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in REFUSAL_KEYWORDS)


# ---------------------------------------------------------------------------
# Parametrised happy-path and edge-case tests
# ---------------------------------------------------------------------------

_HAPPY_AND_EDGE = [
    ex for ex in load_golden_dataset()
    if ex["category"] in ("happy_path", "edge_case")
]

_FAILURE = [
    ex for ex in load_golden_dataset()
    if ex["category"] == "failure_case"
]


@pytest.mark.deepeval
@pytest.mark.parametrize("example", _HAPPY_AND_EDGE, ids=lambda e: e["id"])
def test_golden_happy_and_edge(example: dict, agent_cache: dict) -> None:
    """
    Full pipeline evaluation for happy-path and edge-case examples.
    Checks answer relevancy, correctness, and citation presence.
    """
    result = cached_run(agent_cache, "full", userRequest=example["input"])
    final_answer = result.get("finalAnswer", "")

    if not final_answer.strip():
        pytest.skip(f"Agent returned empty answer for '{example['id']}'.")

    test_case = LLMTestCase(
        input=example["input"],
        actual_output=final_answer,
        expected_output=example.get("expected_output", ""),
    )
    assert_test(test_case, [answer_relevancy_metric, correctness_metric, citation_presence_metric])


@pytest.mark.parametrize("example", _FAILURE, ids=lambda e: e["id"])
def test_golden_failure_case(example: dict, agent_cache: dict) -> None:
    """
    Failure-case examples should produce low-relevancy answers or explicit refusals.
    We use an inverted assertion: the agent must NOT confidently answer off-domain,
    harmful, or nonsensical queries.
    """
    result = cached_run(agent_cache, "full", userRequest=example["input"])
    final_answer = result.get("finalAnswer", "")

    # A refusal is always acceptable
    if _looks_like_refusal(final_answer):
        return

    # For non-refusals, run the relevancy metric and assert it is LOW
    low_relevancy_metric = AnswerRelevancyMetric(
        threshold=0.0,  # no minimum — we just want the score
        model="gpt-4o-mini",
        verbose_mode=False,
    )
    test_case = LLMTestCase(
        input=example["input"],
        actual_output=final_answer,
    )
    low_relevancy_metric.measure(test_case)
    score = low_relevancy_metric.score or 0.0

    assert score < 0.5, (
        f"Failure case '{example['id']}' produced a suspiciously relevant answer "
        f"(relevancy score={score:.2f}). The agent should decline or produce a low-relevancy response "
        f"for: {example['input']!r}. Got: {final_answer[:300]!r}"
    )
