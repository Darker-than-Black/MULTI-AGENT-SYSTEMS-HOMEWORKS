import { ToolExecutionError, ToolInputError } from "./errors.js";
import { githubJsonRequest } from "./github-client.js";

interface GitHubDirectoryEntry {
  type: string;
  name: string;
  path: string;
  size?: number;
  sha?: string;
}

export interface GitHubListDirectoryArgs {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

export async function githubListDirectory(
  args: GitHubListDirectoryArgs,
): Promise<string> {
  validateArgs(args);

  try {
    const refQuery = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : "";
    const apiPath = `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/contents/${encodeURIComponentPath(args.path)}${refQuery}`;
    const payload = await githubJsonRequest<GitHubDirectoryEntry[] | GitHubDirectoryEntry>(
      apiPath,
    );

    if (!Array.isArray(payload)) {
      throw new ToolExecutionError(
        "github_list_directory: target path is a file, expected a directory.",
      );
    }

    const normalized = payload.map((entry) => ({
      type: entry.type,
      name: entry.name,
      path: entry.path,
      size: entry.size ?? 0,
      sha: entry.sha ?? "",
    }));

    return JSON.stringify(
      {
        owner: args.owner,
        repo: args.repo,
        ref: args.ref || "default",
        path: args.path,
        entries: normalized,
      },
      null,
      2,
    );
  } catch (error: unknown) {
    if (error instanceof ToolInputError || error instanceof ToolExecutionError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown API failure.";
    throw new ToolExecutionError(`github_list_directory: ${message}`);
  }
}

function validateArgs(args: GitHubListDirectoryArgs): void {
  if (!args.owner.trim()) {
    throw new ToolInputError('github_list_directory: "owner" cannot be empty.');
  }
  if (!args.repo.trim()) {
    throw new ToolInputError('github_list_directory: "repo" cannot be empty.');
  }
  if (!args.path.trim()) {
    throw new ToolInputError('github_list_directory: "path" cannot be empty.');
  }
}

function encodeURIComponentPath(pathValue: string): string {
  return pathValue
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}
