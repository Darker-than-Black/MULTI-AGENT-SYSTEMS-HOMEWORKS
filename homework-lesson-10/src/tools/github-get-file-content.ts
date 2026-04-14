import { ToolExecutionError, ToolInputError } from "./errors";
import { githubJsonRequest } from "./github-client";
import { truncateText } from "../utils/truncate";

const MAX_FILE_CONTENT_CHARS = 60000;

interface GitHubFileResponse {
  type: string;
  encoding?: string;
  content?: string;
  path?: string;
  sha?: string;
}

export interface GitHubGetFileContentArgs {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

export async function githubGetFileContent(
  args: GitHubGetFileContentArgs,
): Promise<string> {
  validateArgs(args);

  try {
    const refQuery = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : "";
    const apiPath = `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/contents/${encodeURIComponentPath(args.path)}${refQuery}`;
    const file = await githubJsonRequest<GitHubFileResponse>(apiPath);

    if (file.type !== "file") {
      throw new ToolExecutionError("github_get_file_content: target is not a file.");
    }

    if (file.encoding !== "base64" || typeof file.content !== "string") {
      throw new ToolExecutionError(
        "github_get_file_content: unsupported content encoding.",
      );
    }

    const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString(
      "utf8",
    );
    const normalized = truncateText(decoded, MAX_FILE_CONTENT_CHARS);

    return JSON.stringify(
      {
        path: file.path || args.path,
        sha: file.sha || "",
        ref: args.ref || "default",
        content: normalized,
      },
      null,
      2,
    );
  } catch (error: unknown) {
    if (error instanceof ToolInputError || error instanceof ToolExecutionError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown API failure.";
    throw new ToolExecutionError(`github_get_file_content: ${message}`);
  }
}

function validateArgs(args: GitHubGetFileContentArgs): void {
  if (!args.owner.trim()) {
    throw new ToolInputError('github_get_file_content: "owner" cannot be empty.');
  }
  if (!args.repo.trim()) {
    throw new ToolInputError('github_get_file_content: "repo" cannot be empty.');
  }
  if (!args.path.trim()) {
    throw new ToolInputError('github_get_file_content: "path" cannot be empty.');
  }
}

function encodeURIComponentPath(pathValue: string): string {
  return pathValue
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}
