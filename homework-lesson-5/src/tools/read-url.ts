import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { MAX_URL_CONTENT_LENGTH } from "../config/env.js";
import { truncateText } from "../utils/truncate.js";
import { ToolExecutionError, ToolInputError } from "./errors.js";

export interface ReadUrlArgs {
  url: string;
}

export async function readUrl(args: ReadUrlArgs): Promise<string> {
  const url = args.url.trim();

  if (!url) {
    throw new ToolInputError('read_url: "url" cannot be empty.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ToolInputError("read_url: provide a valid absolute URL.");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ToolInputError("read_url: only http/https URLs are supported.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; research-agent/1.0; +https://example.local)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new ToolExecutionError(
        `read_url: target responded with ${response.status} ${response.statusText}.`,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new ToolExecutionError(
        `read_url: expected text/html but received "${contentType || "unknown"}".`,
      );
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url: parsedUrl.toString() });
    const article = new Readability(dom.window.document).parse();
    const text = article?.textContent?.trim() || "";

    if (!text) {
      throw new ToolExecutionError(
        "read_url: unable to extract readable text from the page.",
      );
    }

    return truncateText(text, MAX_URL_CONTENT_LENGTH);
  } catch (error: unknown) {
    if (error instanceof ToolInputError || error instanceof ToolExecutionError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ToolExecutionError("read_url: request timed out after 15 seconds.");
    }
    const message = error instanceof Error ? error.message : "Unknown fetch failure.";
    throw new ToolExecutionError(`read_url: request failed (${message}).`);
  } finally {
    clearTimeout(timeout);
  }
}
