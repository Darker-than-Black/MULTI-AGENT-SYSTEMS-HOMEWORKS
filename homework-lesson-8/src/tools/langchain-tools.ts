import { tool } from "langchain";
import { z } from "zod";
import type { ProgressLogger } from "../utils/logger";
import { readUrl } from "./read-url";
import { webSearch } from "./web-search";
import { writeReport } from "./write-report";
import { githubListDirectory } from "./github-list-directory";
import { githubGetFileContent } from "./github-get-file-content";
import { knowledgeSearch } from "./knowledge-search";

let progressLogger: ProgressLogger | undefined;

export function setToolProgressLogger(logger?: ProgressLogger): void {
  progressLogger = logger;
}

function emitToolProgress(
  phase: "start" | "success" | "error",
  message: string,
  detail?: string,
): void {
  progressLogger?.({
    scope: "tool",
    phase,
    message,
    detail,
  });
}

function summarizeToolResult(result: unknown): string | undefined {
  if (typeof result === "string") {
    const normalized = result.trim();
    if (!normalized) {
      return undefined;
    }
    return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
  }

  if (Array.isArray(result)) {
    return `${result.length} item(s)`;
  }

  if (typeof result === "object" && result !== null) {
    return "Completed.";
  }

  if (result === undefined || result === null) {
    return undefined;
  }

  return String(result);
}

async function withToolProgress<T>(
  toolName: string,
  inputLabel: string,
  action: () => Promise<T>,
): Promise<T> {
  emitToolProgress("start", `${toolName} started`, inputLabel);

  try {
    const result = await action();
    emitToolProgress("success", `${toolName} finished`, summarizeToolResult(result));
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown tool error.";
    emitToolProgress("error", `${toolName} failed`, message);
    throw error;
  }
}

export const webSearchTool = tool(
  async ({ query }) =>
    withToolProgress(
      "web_search",
      `query=${JSON.stringify(query)}`,
      () => webSearch({ query }),
    ),
  {
    name: "web_search",
    description: "Search the web for external or recent sources. Use when the user asks for current information, web comparison, or web references.",
    schema: z.object({
      query: z.string().trim().min(1).max(500).describe("Search query."),
    }),
  },
);

export const readUrlTool = tool(
  async ({ url }) =>
    withToolProgress(
      "read_url",
      `url=${url}`,
      () => readUrl({ url }),
    ),
  {
    name: "read_url",
    description: "Read and extract text from a selected web page. Use after web_search when the user asks to inspect or compare source content.",
    schema: z.object({
      url: z
        .string()
        .trim()
        .min(1)
        .regex(/^https?:\/\//, "Must be an absolute HTTP/HTTPS URL.")
        .describe("Absolute HTTP/HTTPS URL to read."),
    }),
  },
);

export const writeReportTool = tool(
  async ({ filename, content }) =>
    withToolProgress(
      "write_report",
      `filename=${filename}`,
      () => writeReport({ filename, content }),
    ),
  {
    name: "write_report",
    description: "Save a markdown report to the output directory. Use when the user asks to save or export the result.",
    schema: z.object({
      filename: z.string().trim().min(1).max(255).describe("Report file name (markdown)."),
      content: z.string().trim().min(1).describe("Markdown report content."),
    }),
  },
);

export const githubListDirectoryTool = tool(
  async ({ owner, repo, path, ref }) =>
    withToolProgress(
      "github_list_directory",
      `owner=${owner}, repo=${repo}, path=${path}${ref ? `, ref=${ref}` : ""}`,
      () => githubListDirectory({ owner, repo, path, ref }),
    ),
  {
    name: "github_list_directory",
    description: "List files and directories in a specific GitHub repository path.",
    schema: z.object({
      owner: z.string().trim().min(1).describe("GitHub owner/org."),
      repo: z.string().trim().min(1).describe("Repository name."),
      path: z.string().trim().min(1).describe("Directory path in repository."),
      ref: z.string().trim().min(1).optional().describe("Git ref (branch/tag/commit SHA)."),
    }),
  },
);

export const githubGetFileContentTool = tool(
  async ({ owner, repo, path, ref }) =>
    withToolProgress(
      "github_get_file_content",
      `owner=${owner}, repo=${repo}, path=${path}${ref ? `, ref=${ref}` : ""}`,
      () => githubGetFileContent({ owner, repo, path, ref }),
    ),
  {
    name: "github_get_file_content",
    description: "Read a file content from a GitHub repository.",
    schema: z.object({
      owner: z.string().trim().min(1).describe("GitHub owner/org."),
      repo: z.string().trim().min(1).describe("Repository name."),
      path: z.string().trim().min(1).describe("File path in repository."),
      ref: z.string().trim().min(1).optional().describe("Git ref (branch/tag/commit SHA)."),
    }),
  },
);

export const knowledgeSearchTool = tool(
  async ({ query }) =>
    withToolProgress(
      "knowledge_search",
      `query=${JSON.stringify(query)}`,
      () => knowledgeSearch({ query }),
    ),
  {
    name: "knowledge_search",
    description: "Search the local ingested knowledge base with hybrid retrieval and reranking.",
    schema: z.object({
      query: z.string().trim().min(1).max(500).describe("Question or search query for the local knowledge base."),
    }),
  },
);
