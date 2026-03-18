from pathlib import Path
import trafilatura
from ddgs import DDGS
from langchain_core.tools import tool
from config import Settings

settings = Settings()
MAX_SNIPPET_LENGTH = 400

@tool
def web_search(query: str) -> list[dict]:
    """
    Search the web and return normalized results for the agent.

    Returns:
      [
        {"title": str, "url": str, "snippet": str},
        ...
      ]
    Error contract:
      [
        {"error": str}
      ]
    """
    normalized_query = query.strip()
    if not normalized_query:
        return [{"error": "web_search: query must not be empty."}]

    try:
        raw_results = list(
            DDGS().text(normalized_query, max_results=settings.max_search_results)
        )
    except Exception as exc:
        return [{"error": f"web_search failed: {exc}"}]

    normalized_results: list[dict] = []
    for item in raw_results:
        title = (item.get("title") or "").strip()
        url = (item.get("href") or "").strip()
        snippet = (item.get("body") or "").strip()

        if len(snippet) > MAX_SNIPPET_LENGTH:
            snippet = f"{snippet[:MAX_SNIPPET_LENGTH].rstrip()}..."

        normalized_results.append(
            {
                "title": title,
                "url": url,
                "snippet": snippet,
            }
        )

    return normalized_results

@tool
def read_url(url: str) -> str:
    """
    Read full page content for a URL and return plain text.

    Returns:
      Extracted plain text (possibly truncated to MAX_URL_CONTENT_LENGTH).
    Error contract:
      "ERROR: <human-readable message>"
    """
    normalized_url = url.strip()
    if not normalized_url:
        return "ERROR: read_url requires a non-empty URL."
    if not normalized_url.startswith("https://"):
        return "ERROR: URL must start with https://."

    try:
        downloaded = trafilatura.fetch_url(normalized_url)
        if not downloaded:
            return "ERROR: Failed to download page content."

        extracted = trafilatura.extract(downloaded)
        if not extracted:
            return "ERROR: Could not extract readable content from URL."
    except Exception as exc:
        return f"ERROR: read_url failed: {exc}"

    if len(extracted) > settings.max_url_content_length:
        return (
            f"{extracted[:settings.max_url_content_length].rstrip()}\n\n"
            "[TRUNCATED: content shortened for context window safety]"
        )

    return extracted

@tool
def write_report(filename: str, content: str) -> str:
    """
    Save final markdown report to output directory.

    Returns:
      "Report saved to: <absolute_or_relative_path>"
    Error contract:
      "ERROR: <human-readable message>"
    """
    normalized_filename = filename.strip()
    if not normalized_filename:
        return "ERROR: filename must not be empty."

    candidate = Path(normalized_filename)
    if candidate.is_absolute() or ".." in candidate.parts:
        return "ERROR: filename must be a safe relative file name."

    safe_name = candidate.name
    if not safe_name.lower().endswith(".md"):
        safe_name = f"{safe_name}.md"

    output_dir = Path(settings.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    target_path = output_dir / safe_name

    try:
        target_path.write_text(content, encoding="utf-8")
    except Exception as exc:
        return f"ERROR: write_report failed: {exc}"

    return f"Report saved to: {target_path.resolve()}"
