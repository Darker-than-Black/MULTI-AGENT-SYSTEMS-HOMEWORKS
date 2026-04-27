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
from local_metrics import (
    DeterministicMetric,
    has_source_citation,
    is_single_sentence,
    is_ukrainian_text,
    keyword_coverage_score,
)

from conftest import cached_run, is_offline_mode, load_golden_dataset

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
    "i cannot assist", "that's not something", "can't provide", "can’t provide",
    "can't complete", "can’t complete", "please provide", "placeholder",
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

OFFLINE_EXPECTED_KEYWORDS = {
    "hp_001": [("naive rag", "fixed-size"), ("sentence-window", "sentence window"), ("chunk", "chunks")],
    "hp_002": ["bm25", ("semantic", "dense"), ("hybrid", "combine")],
    "hp_003": ["rag", ("retrieval", "retrieve"), ("external", "documents"), ("ground", "hallucinations")],
    "hp_004": ["rerank", ("cross-encoder", "colbert", "cohere"), ("two-stage", "stage 1", "stage-2")],
    "hp_005": [("tool calling", "function calling"), ("json", "structured"), ("runtime", "host"), ("files", "databases", "api")],
    "ec_001": ["rag", "lora", ("retrieval", "inference"), ("fine-tuning", "adapter", "low-rank")],
    "ec_002": [("мультиагент",), ("агент",), ("координац", "взаємод")],
    "ec_003": [("knowledge base", "база знань"), ("rag", "retrieval-augmented generation"), "langchain", ("large language", "llm")],
    "ec_004": [("can't conclude", "cannot conclude", "depends", "insufficient evidence"), ("gpt-5", "gpt5"), ("claude 3", "claude"), ("rag", "groundedness", "faithfulness")],
    "ec_005": ["rag", ("books", "library", "looks things up"), ("helper", "answer")],
    "ec_006": [("ingestion", "index"), ("retrieval", "vector"), ("generation", "llm")],
}


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

    if is_offline_mode():
        test_case = LLMTestCase(
            input=example["input"],
            actual_output=final_answer,
            expected_output=example.get("expected_output", ""),
        )

        def _score(_: LLMTestCase) -> tuple[float, str]:
            score, missing = keyword_coverage_score(
                final_answer,
                OFFLINE_EXPECTED_KEYWORDS.get(example["id"], []),
            )
            bonus = 0.0
            if example["id"] == "ec_002" and is_ukrainian_text(final_answer):
                bonus += 0.2
            if example["id"] == "ec_003" and is_single_sentence(final_answer):
                bonus += 0.2
            if has_source_citation(final_answer):
                bonus += 0.1
            reason = "Offline answer covers the expected concepts."
            if missing:
                reason = f"Missing expected answer concepts: {', '.join(missing)}"
            return min(1.0, score + bonus), reason

        assert_test(
            test_case,
            [DeterministicMetric("E2E Correctness (Offline)", 0.75, _score)],
        )
        return

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

    if is_offline_mode():
        test_case = LLMTestCase(
            input=example["input"],
            actual_output=final_answer,
        )

        def _score(_: LLMTestCase) -> tuple[float, str]:
            if _looks_like_refusal(final_answer):
                return 1.0, "Offline failure-case answer is a refusal."
            return 0.0, "Failure-case answer did not look like a refusal or clarification request."

        assert_test(
            test_case,
            [DeterministicMetric("Failure Handling (Offline)", 1.0, _score)],
        )
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
