import { GITHUB_TOKEN } from "../config/env.js";
import { ToolExecutionError } from "./errors.js";

const GITHUB_API_BASE = "https://api.github.com";
const USER_AGENT = "homework-lesson-5-research-agent";
const GITHUB_REQUEST_TIMEOUT_MS = 20000;

export async function githubJsonRequest<T>(path: string): Promise<T> {
  const response = await githubFetch(path, "application/vnd.github+json");

  if (!response.ok) {
    throw await toGithubError(response);
  }

  return (await response.json()) as T;
}

export async function githubTextRequest(path: string, accept: string): Promise<string> {
  const response = await githubFetch(path, accept);

  if (!response.ok) {
    throw await toGithubError(response);
  }

  return response.text();
}

async function githubFetch(path: string, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${GITHUB_API_BASE}${path}`, {
      method: "GET",
      headers: buildHeaders(accept),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ToolExecutionError(
        `GitHub API request timed out after ${GITHUB_REQUEST_TIMEOUT_MS} ms.`,
      );
    }

    const message = error instanceof Error ? error.message : "Unknown network error";
    throw new ToolExecutionError(`GitHub API request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function buildHeaders(accept: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": USER_AGENT,
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  return headers;
}

async function toGithubError(response: Response): Promise<ToolExecutionError> {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  const base = `GitHub API error ${response.status} ${response.statusText}`;

  if (response.status === 401) {
    return new ToolExecutionError(
      `${base}: invalid or expired GITHUB_TOKEN.`,
    );
  }

  if (response.status === 404) {
    return new ToolExecutionError(
      `${base}: repository/PR/file not found or private without access.`,
    );
  }

  if (response.status === 403 && remaining === "0") {
    return new ToolExecutionError(
      `${base}: rate limit exceeded. Reset at epoch ${reset || "unknown"}.`,
    );
  }

  let details = "";
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === "string") {
      details = payload.message;
    }
  } catch {
    // Ignore non-JSON error body.
  }

  return new ToolExecutionError(details ? `${base}: ${details}` : base);
}
