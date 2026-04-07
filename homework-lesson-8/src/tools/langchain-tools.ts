import { tool } from "langchain";
import { z } from "zod";
import { readUrl } from "./read-url.js";
import { webSearch } from "./web-search.js";
import { writeReport } from "./write-report.js";
import { githubListDirectory } from "./github-list-directory.js";
import { githubGetFileContent } from "./github-get-file-content.js";
import { knowledgeSearch } from "./knowledge-search.js";

export const webSearchTool = tool(
  async ({ query }) =>
    webSearch({
      query,
    }),
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
    readUrl({
      url,
    }),
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
    writeReport({
      filename,
      content,
    }),
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
    githubListDirectory({
      owner,
      repo,
      path,
      ref,
    }),
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
    githubGetFileContent({
      owner,
      repo,
      path,
      ref,
    }),
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
    knowledgeSearch({
      query,
    }),
  {
    name: "knowledge_search",
    description: "Search the local ingested knowledge base with hybrid retrieval and reranking.",
    schema: z.object({
      query: z.string().trim().min(1).max(500).describe("Question or search query for the local knowledge base."),
    }),
  },
);
