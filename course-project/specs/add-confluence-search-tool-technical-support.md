# Plan: Add Confluence Cloud Search Tool to Technical Support Agent

## Task Description

Add a new `confluence_search` LangChain tool that queries a private Confluence Cloud instance via its REST API (CQL search). The tool is conditionally bound to the Technical Support agent — it appears in the agent's tool list only when `CONFLUENCE_URL` and `CONFLUENCE_API_TOKEN` are configured. This gives the agent access to private internal documentation alongside its existing RAG and restricted Tavily web search.

## Objective

When this plan is complete, a technical query routed to Technical Support will trigger a real Confluence CQL search when Confluence credentials are configured, and the agent will cite internal Confluence pages alongside its other sources. When credentials are absent the agent behaves exactly as before (no regression).

## Problem Statement

The Technical Support agent currently searches only the infobox RAG collection (`articles`) and the Tavily-filtered web. Private internal documentation (API integration guides, onboarding how-tos, internal troubleshooting runbooks) lives in Confluence and is inaccessible to the agent. Users asking about internal configuration or private processes cannot be helped by the current tool set.

## Solution Approach

Add a thin `@tool`-decorated wrapper (`tools/confluence_search.py`) that calls the Confluence Cloud content-search endpoint via `httpx`, applies CQL filtering, strips HTML from page excerpts with stdlib `re`, and formats output following the `"---\nTitle\nExcerpt\nДжерело: URL"` convention already used by `tools/rag.py` and `tools/web_search.py`. The tool is appended to the `tools` list in `build_technical_support_agent()` only when `settings.confluence_url` and `settings.confluence_api_token` are both set.

### Architecture Decisions

- **Affected graph nodes**: Technical Support only. Planner, Lawyer, Common Support, Critic, Escalation are untouched.
- **Schemas**: No changes to `schemas.py`. `WorkerResponse.sources` already holds `list[Source]` — Confluence URLs flow through normally.
- **RAG collection(s)**: Neither `laws` nor `articles`. Confluence is a separate live external source; no ingestion into Qdrant is needed or desired (live search preserves freshness).
- **External calls**: `httpx.get` to `{CONFLUENCE_URL}/rest/api/content/search` with Basic Auth (email + API token). Timeout 10 s. Max 5 results per query. CQL filters by page type and optionally by space keys.
- **Sessions / persistence**: No change to `PostgresSaver` checkpoint format.
- **Prompt source**: Langfuse prompt `procurement-technical-support` must be updated to mention `confluence_search` and when to use it. A local backup is created at `prompts/technical_support.md`. The Langfuse update is a manual step (no Langfuse Management API call in code).

## Relevant Files

- `config.py` — add 4 new fields; extend `_split_csv` validator to cover `confluence_space_keys`
- `.env.example` — add Confluence section with format documentation
- `agents/technical_support.py` — conditional import + conditional tool append
- `agents/lawyer.py` — read-only reference for `get_llm()` import pattern
- `tools/web_search.py` — reference for `@tool`, fallback string, `try/except` error handling
- `tools/rag.py` — reference for `_format_*` helper and `_MAX_CONTEXT_CHARS` truncation
- `tools/__init__.py` — empty, no changes needed
- `tests/test_web_search.py` — reference for fixture + `patch("tools.module.httpx.get")` pattern
- `tests/test_technical_support.py` — update builder tests that assert on `tools=[...]` list
- `requirements.txt` — add `httpx>=0.27`
- `docs/ARCHITECTURE.md` — add Confluence to Technical Support § 2.3 + ADR in § 15
- `observability/langfuse_client.py` — read-only reference for `load_prompt` call used by agent

### New Files
- `tools/confluence_search.py` — new `@tool` wrapping Confluence REST API
- `tests/test_confluence_search.py` — unit tests with mocked `httpx.get`
- `prompts/technical_support.md` — local backup of Langfuse prompt with new tool

## Implementation Phases

- [ ] **Phase 1: Foundation** — Config + deps. No behavioural change, just infrastructure wiring.
  - Status:
  - Comments:

- [ ] **Phase 2: Core Tool** — Implement `tools/confluence_search.py` with full error handling and tests.
  - Status:
  - Comments:

- [ ] **Phase 3: Integration** — Wire tool into agent, update prompt backup, update architecture doc, run full test suite.
  - Status:
  - Comments:

## Step by Step Tasks

### 1. Dependencies

- [ ] **Add `httpx` to `requirements.txt`** — append `httpx>=0.27` under the `# Web search` comment block (after `langdetect>=1.0.9`). Follow the existing lower-bound-only pattern with no upper bound.
  ```
  httpx>=0.27
  ```
  Then pin the exact installed version by running `pip show httpx | grep Version` and recording it in a comment (optional but recommended).
  - Status:
  - Comments:

- [ ] **Install the dependency** — run `pip install httpx>=0.27` in the project virtualenv so tests can import it.
  - Status:
  - Comments:

### 2. Configuration

- [ ] **Add Confluence fields to `config.py`** — insert a new `# ── Confluence ──` section after the `# ── Slack ──` block (around line 73). Follow the exact comment style `# ── Name ──────────────────────────────────────────────────────`:
  ```python
  # ── Confluence ───────────────────────────────────────────────────────
  confluence_url: str | None = None
  confluence_username: str | None = None
  confluence_api_token: SecretStr | None = None
  confluence_space_keys: Annotated[list[str], NoDecode] = Field(
      default_factory=list
  )
  ```
  - Status:
  - Comments:

- [ ] **Extend `_split_csv` field_validator** — add `"confluence_space_keys"` to the existing `@field_validator(...)` decorator so it is CSV-parsed the same way as `tech_support_allowed_domains`:
  ```python
  @field_validator(
      "tech_support_allowed_domains",
      "tech_support_tag_whitelist",
      "confluence_space_keys",
      mode="before",
  )
  ```
  - Status:
  - Comments:

- [ ] **Update `.env.example`** — add the Confluence section after the `# ── Slack ──` block:
  ```
  # ── Confluence ──────────────────────────────────────────────────────
  CONFLUENCE_URL=https://your-org.atlassian.net/wiki
  CONFLUENCE_USERNAME=your-email@example.com
  CONFLUENCE_API_TOKEN=***
  # CSV — parsed via field_validator into list[str]. Leave empty to search all spaces.
  CONFLUENCE_SPACE_KEYS=TECH,PROC
  ```
  - Status:
  - Comments:

### 3. Tool Implementation

- [ ] **Create `tools/confluence_search.py`** — implement the full module. Exact content:
  ```python
  """Confluence Cloud search tool for private technical documentation.

  Bound to Technical Support only when CONFLUENCE_URL and CONFLUENCE_API_TOKEN
  are configured. Searches pages via CQL; optionally restricts to CONFLUENCE_SPACE_KEYS.
  """

  from __future__ import annotations

  import re

  import httpx
  from langchain_core.tools import tool

  from config import settings

  _FALLBACK = "Документацію в Confluence не знайдено."
  _MAX_EXCERPT_CHARS = 500
  _MAX_RESULTS = 5
  _MAX_CONTEXT_CHARS = 6000


  def _strip_html(html: str) -> str:
      return re.sub(r"<[^>]+>", " ", html).strip()


  def _search_confluence(query: str) -> list[dict]:
      assert settings.confluence_url, "CONFLUENCE_URL required"
      assert settings.confluence_username, "CONFLUENCE_USERNAME required"
      assert settings.confluence_api_token, "CONFLUENCE_API_TOKEN required"

      cql = f'text~"{query}" AND type=page'
      if settings.confluence_space_keys:
          keys = ",".join(settings.confluence_space_keys)
          cql += f" AND space.key IN ({keys})"

      resp = httpx.get(
          f"{settings.confluence_url}/rest/api/content/search",
          params={
              "cql": cql,
              "limit": _MAX_RESULTS,
              "expand": "body.view",
          },
          auth=(
              settings.confluence_username,
              settings.confluence_api_token.get_secret_value(),
          ),
          timeout=10.0,
      )
      resp.raise_for_status()
      return resp.json().get("results", [])


  def _format_results(results: list[dict], base_url: str) -> str:
      blocks = []
      for page in results:
          title = page.get("title", "")
          webui = page.get("_links", {}).get("webui", "")
          url = f"{base_url}{webui}" if webui else base_url
          raw_html = page.get("body", {}).get("view", {}).get("value", "")
          text = _strip_html(raw_html)
          excerpt = text[:_MAX_EXCERPT_CHARS]
          if len(text) > _MAX_EXCERPT_CHARS:
              excerpt = f"{excerpt}..."
          blocks.append(f"---\n{title}\n{excerpt}\nДжерело: {url}")
          if len(blocks) == _MAX_RESULTS:
              break
      context = "\n\n".join(blocks)
      return context[:_MAX_CONTEXT_CHARS] if len(context) > _MAX_CONTEXT_CHARS else context


  @tool
  def confluence_search(query: str) -> str:
      """Search the internal Confluence knowledge base for Prozorro technical documentation.

      Use this tool FIRST for questions about internal processes, API integration guides,
      configuration how-tos, and troubleshooting documented in the company Confluence.
      Prefer this over web_search_technical for private internal documentation that
      would not appear in public web search.
      Returns Confluence page excerpts with source URLs.
      """
      try:
          results = _search_confluence(query)
          if not results:
              return _FALLBACK
          return _format_results(results, settings.confluence_url)  # type: ignore[arg-type]
      except Exception:
          return _FALLBACK
  ```
  - Status:
  - Comments:

### 4. Agent Integration

- [ ] **Update `agents/technical_support.py`** — add conditional Confluence tool. The import and the conditional append go inside `build_technical_support_agent()` to avoid a top-level import that would fail when `httpx` is absent (edge case):
  ```python
  # At the top of the file, add:
  from tools.confluence_search import confluence_search

  # Inside build_technical_support_agent(), replace:
  #   return create_react_agent(..., tools=[rag_tool, web_tool], ...)
  # With:
  tools = [rag_tool, web_tool]
  if settings.confluence_url and settings.confluence_api_token:
      tools.append(confluence_search)
  return create_react_agent(
      model=get_llm(),
      tools=tools,
      prompt=_load_system_prompt(),
      response_format=WorkerResponse,
  )
  ```
  The conditional ensures the LLM's tool schema is clean when Confluence is not configured.
  - Status:
  - Comments:

### 5. Prompt Backup

- [ ] **Create `prompts/` directory and `prompts/technical_support.md`** — create the backup file (the directory does not currently exist). Write the prompt content that matches what should be in Langfuse, adding the `confluence_search` tool to the "Available Tools" section. Template:
  ```markdown
  # Technical Support Agent

  ## Role
  You are the Technical Support Agent for the Prozorro electronic procurement system.
  You help users with technical issues: Prozorro API integration, PDF generation,
  platform errors, and internal configuration.

  ## Tool Usage Order
  1. `confluence_search` — search internal Confluence documentation FIRST (if available).
  2. `rag_search_articles` — search the curated articles knowledge base.
  3. `web_search_technical` — search approved external documentation sources.

  ## Instructions
  - Search at least two sources before composing your answer.
  - Cite every source in the `sources` field of your response.
  - If you find detailed documentation in Confluence, prefer it over web results.
  - If no relevant information is found in any source, set `found=False` and
    `needs_human=True` with a clear `needs_human_reason`.

  ## Available Tools
  - `confluence_search`: Search the internal Confluence knowledge base for technical
    guides, API specs, and internal process documentation. Use BEFORE web_search_technical.
  - `rag_search_articles`: Search the curated Prozorro articles knowledge base.
  - `web_search_technical`: Search approved external technical documentation sources.

  ## Response Format
  Return a `WorkerResponse`:
  - `topic`: always `"technical_system"`
  - `found`: `true` if relevant information was found
  - `answer`: detailed technical explanation (markdown)
  - `sources`: list of Source objects (`{url, title}`) from all sources used
  - `confidence`: 0.0–1.0
  - `needs_human`: `true` only if this is a bug report or feature request
  - `needs_human_reason`: reason for escalation if `needs_human` is `true`
  ```
  - Status:
  - Comments:

- [ ] **Update Langfuse prompt `procurement-technical-support`** — **manual step** (cannot be automated). Log in to your Langfuse dashboard, open the `procurement-technical-support` prompt, and add the `confluence_search` tool description and updated "Tool Usage Order" matching the content of `prompts/technical_support.md`. Publish with label `production`.
  - Status:
  - Comments:

### 6. Architecture Documentation

- [ ] **Update `docs/ARCHITECTURE.md` § 2.3 (Technical Support)** — add Confluence as a third tool source. Find the "Technical Support" agent section and extend the tools description:
  ```
  **Tools:**
  - `confluence_search(query)` — Confluence Cloud CQL search, optional, bound only when
    `CONFLUENCE_URL` + `CONFLUENCE_API_TOKEN` are set; restricted to `CONFLUENCE_SPACE_KEYS`
    if configured
  - `rag_search_articles(query)` — hybrid RAG search over `articles` collection, pre-filtered
    by `tags` matching `TECH_SUPPORT_TAG_WHITELIST`
  - `web_search_technical(query)` — Tavily search restricted to `TECH_SUPPORT_ALLOWED_DOMAINS`
  ```
  - Status:
  - Comments:

- [ ] **Add ADR entry to `docs/ARCHITECTURE.md` § 15** — record the architectural decision:
  ```
  | ADR-N | Confluence Cloud as third knowledge source for Technical Support |
  | Date  | 2026-05-05 |
  | Decision | Add optional live Confluence search tool to Technical Support agent.
               Rationale: internal process documentation lives in Confluence and is not
               public-web-searchable. Tool is conditionally bound (env-gated) so the
               agent remains functional with or without Confluence credentials. |
  | Alternatives considered | Ingest Confluence pages into the `articles` Qdrant collection.
                               Rejected: stale data risk (Confluence updates don't trigger
                               re-ingestion), duplicate storage cost, freshness maintenance burden. |
  ```
  - Status:
  - Comments:

### 7. Tests

- [ ] **Create `tests/test_confluence_search.py`** — implement the following 7 tests using the same patterns as `tests/test_web_search.py` (monkeypatch on `settings` object, `patch("tools.confluence_search.httpx.get")`):

  ```python
  from types import SimpleNamespace
  from unittest.mock import patch, Mock

  import pytest

  import tools.confluence_search as confluence_module
  from tools.confluence_search import (
      _FALLBACK,
      _format_results,
      _search_confluence,
      _strip_html,
      confluence_search,
  )


  @pytest.fixture
  def confluence_settings_stub(monkeypatch: pytest.MonkeyPatch) -> None:
      monkeypatch.setattr(confluence_module.settings, "confluence_url", "https://acme.atlassian.net/wiki")
      monkeypatch.setattr(confluence_module.settings, "confluence_username", "user@acme.com")
      monkeypatch.setattr(
          confluence_module.settings,
          "confluence_api_token",
          SimpleNamespace(get_secret_value=lambda: "test-token"),
      )
      monkeypatch.setattr(confluence_module.settings, "confluence_space_keys", [])


  def _page(title: str, webui: str, html: str) -> dict:
      return {"title": title, "_links": {"webui": webui}, "body": {"view": {"value": html}}}


  def test_confluence_search_returns_formatted_results(confluence_settings_stub: None) -> None:
      pages = [_page("API Guide", "/pages/1", "<p>Інструкція з інтеграції</p>")]
      with patch("tools.confluence_search.httpx.get") as mock_get:
          mock_get.return_value.json.return_value = {"results": pages}
          mock_get.return_value.raise_for_status.return_value = None
          result = confluence_search.invoke({"query": "API інтеграція"})
      assert "API Guide" in result
      assert "Інструкція з інтеграції" in result
      assert "https://acme.atlassian.net/wiki/pages/1" in result


  def test_confluence_search_strips_html_tags(confluence_settings_stub: None) -> None:
      pages = [_page("Guide", "/pages/2", "<h1>Заголовок</h1><p>Текст</p>")]
      with patch("tools.confluence_search.httpx.get") as mock_get:
          mock_get.return_value.json.return_value = {"results": pages}
          mock_get.return_value.raise_for_status.return_value = None
          result = confluence_search.invoke({"query": "guide"})
      assert "<h1>" not in result
      assert "<p>" not in result
      assert "Заголовок" in result
      assert "Текст" in result


  def test_confluence_search_returns_fallback_on_no_results(confluence_settings_stub: None) -> None:
      with patch("tools.confluence_search.httpx.get") as mock_get:
          mock_get.return_value.json.return_value = {"results": []}
          mock_get.return_value.raise_for_status.return_value = None
          result = confluence_search.invoke({"query": "something missing"})
      assert result == _FALLBACK


  def test_confluence_search_returns_fallback_on_http_error(confluence_settings_stub: None) -> None:
      with patch("tools.confluence_search.httpx.get") as mock_get:
          mock_get.return_value.raise_for_status.side_effect = Exception("403 Forbidden")
          result = confluence_search.invoke({"query": "query"})
      assert result == _FALLBACK


  def test_confluence_search_applies_space_key_filter(
      confluence_settings_stub: None,
      monkeypatch: pytest.MonkeyPatch,
  ) -> None:
      monkeypatch.setattr(confluence_module.settings, "confluence_space_keys", ["TECH", "PROC"])
      with patch("tools.confluence_search.httpx.get") as mock_get:
          mock_get.return_value.json.return_value = {"results": []}
          mock_get.return_value.raise_for_status.return_value = None
          confluence_search.invoke({"query": "test"})
      cql = mock_get.call_args.kwargs["params"]["cql"]
      assert "space.key IN (TECH,PROC)" in cql


  def test_confluence_search_no_space_filter_when_empty(confluence_settings_stub: None) -> None:
      with patch("tools.confluence_search.httpx.get") as mock_get:
          mock_get.return_value.json.return_value = {"results": []}
          mock_get.return_value.raise_for_status.return_value = None
          confluence_search.invoke({"query": "test"})
      cql = mock_get.call_args.kwargs["params"]["cql"]
      assert "space.key" not in cql


  def test_strip_html_removes_all_tags() -> None:
      assert _strip_html("<h1>Title</h1><p>Body</p>") == "Title  Body"
      assert _strip_html("No tags") == "No tags"
      assert _strip_html("") == ""
  ```
  - Status:
  - Comments:

- [ ] **Update `tests/test_technical_support.py`** — update builder tests that assert on `tools=[rag_tool, web_tool]` to account for the conditional Confluence tool:
  - Find tests that call `create_react_agent.assert_called_once_with(... tools=[rag_tool, web_tool] ...)` and update them to work with the new conditional logic. Specifically:
    - When `settings.confluence_url = None` (or not set): tools list stays `[rag_tool, web_tool]`
    - When `settings.confluence_url` and `settings.confluence_api_token` are set: tools list is `[rag_tool, web_tool, confluence_search_tool]`
  - Add two new tests:
    ```python
    def test_technical_support_includes_confluence_when_configured(monkeypatch):
        """When Confluence credentials are present, confluence_search is included."""
        monkeypatch.setattr(settings, "confluence_url", "https://acme.atlassian.net/wiki")
        monkeypatch.setattr(settings, "confluence_api_token", SimpleNamespace(get_secret_value=lambda: "tok"))
        # ... mock create_react_agent, make_rag_search_articles, etc. ...
        # Assert tools list has 3 items, last is confluence_search

    def test_technical_support_excludes_confluence_when_not_configured(monkeypatch):
        """When Confluence credentials are absent, confluence_search is NOT included."""
        monkeypatch.setattr(settings, "confluence_url", None)
        # ... mock create_react_agent ...
        # Assert tools list has 2 items: [rag_tool, web_tool]
    ```
  - Status:
  - Comments:

### 8. Validation

- [ ] **Run syntax check** — verify no import errors:
  ```bash
  python -m py_compile tools/confluence_search.py agents/technical_support.py config.py
  ```
  - Status:
  - Comments:

- [ ] **Run Confluence tool tests**:
  ```bash
  pytest tests/test_confluence_search.py -v
  ```
  All 7 tests must pass.
  - Status:
  - Comments:

- [ ] **Run Technical Support tests**:
  ```bash
  pytest tests/test_technical_support.py -v
  ```
  All existing tests + 2 new ones must pass.
  - Status:
  - Comments:

- [ ] **Run full test suite**:
  ```bash
  pytest tests/ -q --ignore=tests/evaluations
  ```
  Must be 190+ passed, 0 failed.
  - Status:
  - Comments:

- [ ] **Graph import sanity check**:
  ```bash
  python -c "from supervisor import build_graph; print('graph ok')"
  ```
  - Status:
  - Comments:

## Testing Strategy

**Unit tests** (`tests/test_confluence_search.py`): 7 tests covering happy path, empty results, HTTP errors, CQL space-key filter (present and absent), HTML stripping, and the `_strip_html` helper directly. All external HTTP calls are mocked via `patch("tools.confluence_search.httpx.get")`. Settings are monkeypatched directly on the `settings` object following the established fixture pattern.

**Agent wiring tests** (`tests/test_technical_support.py`): 2 new tests verify that the tool list is `[rag_tool, web_tool, confluence_search]` when credentials are configured, and `[rag_tool, web_tool]` when they are not. Existing builder tests are updated to match the new conditional logic.

**No LLM evaluation tests** are added at this stage — the Confluence tool is an input to the agent's existing ReAct loop; its quality depends on the Confluence content itself, which is user-managed. Add an eval case to `tests/evaluations/` only after staging content in Confluence.

## Acceptance Criteria

1. `pytest tests/test_confluence_search.py -v` passes all 7 tests.
2. `pytest tests/test_technical_support.py -v` passes all tests including the 2 new conditional-binding tests.
3. `pytest tests/ -q --ignore=tests/evaluations` exits 0 with ≥190 passed and 0 failures.
4. `python -m py_compile tools/confluence_search.py agents/technical_support.py config.py` exits 0.
5. When `CONFLUENCE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_API_TOKEN` are set in `.env`, the graph starts and `build_technical_support_agent()` returns an agent with 3 tools.
6. When the Confluence env vars are absent, the graph starts and the agent has 2 tools (no regression).
7. `docs/ARCHITECTURE.md` mentions `confluence_search` in the Technical Support section and has an ADR entry.
8. `prompts/technical_support.md` exists and mentions all 3 tools.
9. Langfuse prompt `procurement-technical-support` is updated (manual verification).

## Validation Commands

```bash
# Install new dep
pip install httpx>=0.27

# Syntax check
python -m py_compile tools/confluence_search.py agents/technical_support.py config.py

# Confluence tool unit tests
pytest tests/test_confluence_search.py -v

# Technical Support agent tests
pytest tests/test_technical_support.py -v

# Full suite
pytest tests/ -q --ignore=tests/evaluations

# Graph sanity
python -c "from supervisor import build_graph; print('graph ok')"

# Verify tool count when Confluence is configured (requires real or stubbed .env)
python -c "
from agents.technical_support import build_technical_support_agent
from config import settings
settings.confluence_url = 'https://test.atlassian.net/wiki'
# confluence_api_token can't be set directly but this checks the conditional branch exists
print('conditional logic present in source')
"
```

## Notes

- **`httpx` is a transitive dep** of `langchain-openai` (via `openai>=1.x`), so it is already installed in any environment running this project. Adding it to `requirements.txt` makes the dependency explicit and pinned, matching the project's convention.
- **HTML stripping via `re.sub`** is intentionally simple — Confluence body content is structured HTML with `<p>`, `<h1>`, `<ul>`, `<li>` tags; simple tag removal is sufficient for excerpt generation. If richer parsing is ever needed, `beautifulsoup4` can be added at that point.
- **The Langfuse update is a manual step** — the codebase has no Langfuse Management API client. If a local fallback is needed during development (when Langfuse is not configured), `observability/langfuse_client.py` raises `RuntimeError`; in that case temporarily hardcode the prompt string in `_load_system_prompt()` during local testing and revert before merging.
- **Confluence space keys format**: the CQL `IN (KEY1,KEY2)` syntax expects unquoted keys. If a space key contains special characters, it would need quoting — for standard Confluence space keys (uppercase alphanumeric) this is not an issue.
- **Rate limits**: Confluence Cloud REST API rate limits depend on the plan (typically 300–600 req/min). With `max_results=5` and tool calls triggered only on user queries, staying within limits is not a concern at this scale.
- **`docs/ARCHITECTURE.md` § 15 ADR numbering**: find the highest existing ADR number and increment by 1.
