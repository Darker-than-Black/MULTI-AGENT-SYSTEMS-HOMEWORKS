# Delivery Checklist (Lesson 12 Baseline + Definition of Done)

This checklist tracks the baseline validation and regression expectations for `homework-lesson-12`: TypeScript checks, architecture invariants, RAG smoke coverage, and the existing DeepEval regression suite.

## Shared Gates

A change set is not complete until:

- `deepeval test run tests/` passes
- the golden dataset was manually reviewed, not only generated
- thresholds were set to a realistic baseline instead of being overfit
- failing cases were reviewed manually, not only by metrics
- the test harness can invoke the TypeScript agents through `npm run batch`

## Block 0. Test Harness Alignment

Goal: keep the Python test layer and the TypeScript batch bridge in sync.

- [ ] `src/main-batch.ts` supports the test modes required by the suite.
- [ ] `tests/conftest.py` provides a stable subprocess runner and shared fixtures.
- [ ] `requirements.txt` includes the DeepEval test dependencies.
- [ ] `package.json` exposes the batch entrypoint used by the tests.
- [ ] `tests/` contains the expected component, tool, and e2e test files.

Definition of done:

- [ ] The Python tests can invoke the TypeScript runtime without manual setup steps beyond the documented environment.

## Block 1. Golden Dataset

Goal: create a regression dataset that covers normal, ambiguous, and unsafe inputs.

- [ ] `tests/golden_dataset.json` contains 15-20 examples.
- [ ] The dataset includes `happy_path`, `edge_case`, and `failure_case` entries.
- [ ] Happy-path examples cover typical research questions.
- [ ] Edge cases cover narrow, broad, multilingual, or otherwise ambiguous queries.
- [ ] Failure cases cover off-domain, nonsensical, or prohibited requests.
- [ ] Each example includes the fields needed by the test suite, including the expected output and tool expectations where relevant.
- [ ] The dataset was manually reviewed and cleaned up after generation.

Definition of done:

- [ ] The golden dataset can be used for repeatable regression evaluation without requiring edits during test execution.

## Block 2. Planner Component Tests

Goal: verify that the Planner produces a structured and useful plan.

- [ ] Planner output contains the required structured fields.
- [ ] The plan includes specific search queries, not vague topic labels.
- [ ] `sourcesToCheck` contains valid sources for the query.
- [ ] `outputFormat` matches the user request and downstream workflow.
- [ ] `test_planner.py` includes a custom GEval metric for plan quality.
- [ ] Planner behavior is checked for a multilingual query.
- [ ] Planner behavior is checked for an off-domain request.

Definition of done:

- [ ] The Planner can turn a user request into a structured plan that downstream agents can consume without guessing.

## Block 3. Researcher Component Tests

Goal: verify that the Researcher stays grounded in evidence.

- [ ] Researcher findings are evaluated against retrieval context.
- [ ] Findings include source citations or named references.
- [ ] Researcher outputs are substantive enough to be useful, not a one-line summary.
- [ ] `test_researcher.py` includes a groundedness metric.
- [ ] Researcher behavior is checked for an out-of-domain query.

Definition of done:

- [ ] Research findings are supported by retrievable evidence and degrade gracefully when the topic is out of scope.

## Block 4. Critic Component Tests

Goal: verify that the Critic produces actionable review feedback.

- [ ] Critic output contains the required structured fields.
- [ ] `verdict` is consistent with the quality of the findings.
- [ ] `APPROVE` implies no revision requests.
- [ ] `REVISE` includes at least one actionable revision request.
- [ ] `test_critic.py` includes a custom GEval metric for critique quality.
- [ ] `test_critic.py` includes a second custom GEval metric for revision-request actionability.

Definition of done:

- [ ] The Critic can distinguish acceptable findings from ones that need targeted follow-up work.

## Block 5. Tool Correctness

Goal: verify that each role uses the tools expected by the workflow.

- [ ] Planner tool usage is checked for search-oriented exploration.
- [ ] Researcher tool usage matches the requested sources from the plan.
- [ ] Supervisor tool usage includes `write_report` after approval.
- [ ] `test_tools.py` contains at least 3 tool-correctness test cases.
- [ ] Tool checks use `ToolCorrectnessMetric` rather than only string assertions.

Definition of done:

- [ ] The role-to-tool mapping is validated directly by the test suite.

## Block 6. End-to-End Regression

Goal: validate the full Supervisor -> Planner -> Researcher -> Critic pipeline on the golden dataset.

- [ ] `test_e2e.py` runs the full pipeline on happy-path and edge-case examples.
- [ ] `test_e2e.py` includes at least two metrics for the full answer.
- [ ] Failure cases are evaluated separately and must refuse or score low on relevancy.
- [ ] The e2e suite records results for regression review.
- [ ] The output is checked manually when the score changes materially.

Definition of done:

- [ ] The full pipeline is covered by regression tests that can be rerun on the same dataset.

## Block 7. Thresholds + Hardening

Goal: keep the evaluation suite useful as the implementation evolves.

- [ ] Thresholds are set to a realistic baseline, not an artificially high target.
- [ ] Threshold changes are documented when the system improves.
- [ ] Metric choices match the behavior being evaluated.
- [ ] The suite remains green on a clean run of `deepeval test run tests/`.
- [ ] `npm run validate` passes end-to-end, including the Docker-backed RAG smoke suite.
- [ ] Any skipped tests have an explicit reason and do not hide real regressions.

Definition of done:

- [ ] The test suite is stable enough to serve as a regression gate for the lesson-12 baseline before Langfuse integration work begins.

## Explicit Review Checklist

During implementation review, verify these items explicitly:

- [ ] The golden dataset has the expected category mix.
- [ ] Planner, Researcher, and Critic are tested independently.
- [ ] Researcher findings are grounded in retrieved evidence.
- [ ] Critic revision requests are concrete enough to act on.
- [ ] Tool-correctness checks match the intended role behavior.
- [ ] Failure cases do not produce confident answers.
- [ ] The final e2e run was reviewed manually, not only accepted by score.

## Maintenance Rule

If the test strategy, dataset shape, metric set, or acceptance thresholds change materially, update this document in the same commit as the test changes.
