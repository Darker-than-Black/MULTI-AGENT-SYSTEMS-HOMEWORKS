import { readUrl } from "./read-url.js";
import { webSearch } from "./web-search.js";
import { writeReport } from "./write-report.js";
import { githubListDirectory } from "./github-list-directory.js";
import { githubGetFileContent } from "./github-get-file-content.js";
import { toolSchemas } from "./schemas.js";
import { requireStringArg } from "./validation.js";
import { ToolInputError } from "./errors.js";

export interface RegisteredTool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export const toolsByName: Record<string, RegisteredTool> = {
  web_search: {
    name: "web_search",
    execute: async (args) =>
      webSearch({
        query: requireStringArg("web_search", args, "query", { maxLength: 500 }),
      }),
  },
  read_url: {
    name: "read_url",
    execute: async (args) =>
      readUrl({
        url: requireStringArg("read_url", args, "url", { pattern: /^https?:\/\// }),
      }),
  },
  write_report: {
    name: "write_report",
    execute: async (args) =>
      writeReport({
        filename: requireStringArg("write_report", args, "filename", {
          maxLength: 255,
        }),
        content: requireStringArg("write_report", args, "content"),
      }),
  },
  github_list_directory: {
    name: "github_list_directory",
    execute: async (args) =>
      githubListDirectory({
        owner: requireStringArg("github_list_directory", args, "owner"),
        repo: requireStringArg("github_list_directory", args, "repo"),
        path: requireStringArg("github_list_directory", args, "path"),
        ref: getOptionalStringArg("github_list_directory", args, "ref"),
      }),
  },
  github_get_file_content: {
    name: "github_get_file_content",
    execute: async (args) =>
      githubGetFileContent({
        owner: requireStringArg("github_get_file_content", args, "owner"),
        repo: requireStringArg("github_get_file_content", args, "repo"),
        path: requireStringArg("github_get_file_content", args, "path"),
        ref: getOptionalStringArg("github_get_file_content", args, "ref"),
      }),
  },
};

export { toolSchemas };

function getOptionalStringArg(
  toolName: string,
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ToolInputError(`${toolName}: "${key}" must be a string when provided.`);
  }
  const normalized = value.trim();
  return normalized || undefined;
}
