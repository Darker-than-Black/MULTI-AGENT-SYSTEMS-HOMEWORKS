import { JSDOM } from "jsdom";
import { MAX_SEARCH_RESULTS } from "../config/env";
import { ToolExecutionError, ToolInputError } from "./errors";

export interface WebSearchArgs {
  query: string;
}

export async function webSearch(args: WebSearchArgs): Promise<string> {
  const query = args.query.trim();
  if (!query) {
    throw new ToolInputError('web_search: "query" cannot be empty.');
  }

  const searchUrl = new URL("https://duckduckgo.com/html/");
  searchUrl.searchParams.set("q", query);

  const response = await fetch(searchUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; research-agent/1.0; +https://example.local)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new ToolExecutionError(
      `web_search: provider returned ${response.status} ${response.statusText}.`,
    );
  }

  const html = await response.text();
  const dom = new JSDOM(html);
  const resultNodes = Array.from(
    dom.window.document.querySelectorAll(".result"),
  ).slice(0, MAX_SEARCH_RESULTS);

  const normalizedResults = resultNodes
    .map((node) => {
      const linkNode = node.querySelector<HTMLAnchorElement>(".result__a");
      const snippetNode = node.querySelector<HTMLElement>(".result__snippet");

      if (!linkNode) {
        return null;
      }

      const title = linkNode.textContent?.trim() || "";
      const rawHref = linkNode.getAttribute("href") || "";
      const url = resolveDdgHref(rawHref);
      const snippet = snippetNode?.textContent?.replace(/\s+/g, " ").trim() || "";

      if (!title || !url) {
        return null;
      }

      return { title, url, snippet };
    })
    .filter((item): item is { title: string; url: string; snippet: string } =>
      Boolean(item),
    );

  if (normalizedResults.length === 0) {
    throw new ToolExecutionError(
      "web_search: no results found. Try a more specific query.",
    );
  }

  return JSON.stringify(normalizedResults, null, 2);
}

function resolveDdgHref(rawHref: string): string {
  if (!rawHref) {
    return "";
  }

  if (rawHref.startsWith("//")) {
    const parsed = new URL(`https:${rawHref}`);
    const redirectTarget = parsed.searchParams.get("uddg");
    return redirectTarget ? decodeURIComponent(redirectTarget) : parsed.toString();
  }

  if (rawHref.startsWith("http://") || rawHref.startsWith("https://")) {
    return rawHref;
  }

  return "";
}
