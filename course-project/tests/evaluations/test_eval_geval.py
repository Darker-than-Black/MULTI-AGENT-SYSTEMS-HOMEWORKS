"""DeepEval GEval test examples for observability."""

import pytest
from deepeval import evaluate
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

# We use @pytest.mark.eval so these can be run separately: `pytest -m eval`
@pytest.mark.eval
def test_lawyer_groundedness():
    """Test groundedness of the lawyer agent's response using GEval."""
    
    # Custom metric: groundedness in retrieval context
    groundedness = GEval(
        name="Groundedness",
        evaluation_steps=[
            "Extract every factual claim from 'actual output'",
            "For each claim, check if it can be directly supported by 'retrieval context'",
            "Claims not present in retrieval context count as ungrounded, even if true",
            "Score = number of grounded claims / total claims",
        ],
        evaluation_params=[
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.RETRIEVAL_CONTEXT,
        ],
        model="gpt-4o-mini",
        threshold=0.7,
    )

    test_case = LLMTestCase(
        input="Який штраф за порушення за статтею 164-14?",
        actual_output="За статтею 164-14 штраф для посадових осіб становить від 1500 до 3000 неоподатковуваних мінімумів.",
        retrieval_context=[
            "Стаття 164-14 КУпАП встановлює адміністративну відповідальність за порушення законодавства про закупівлі. Штраф становить від 1500 до 3000 неоподатковуваних мінімумів доходів громадян."
        ],
    )

    # evaluate() will assert that all metrics pass the threshold
    evaluate(test_cases=[test_case], metrics=[groundedness])
