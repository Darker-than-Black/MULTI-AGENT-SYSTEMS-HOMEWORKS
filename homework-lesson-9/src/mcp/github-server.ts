import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { GITHUB_MCP_HOST, GITHUB_MCP_PORT, GITHUB_TOKEN } from "../config/env";
import { githubGetFileContent } from "../tools/github-get-file-content";
import { githubListDirectory } from "../tools/github-list-directory";
import { GITHUB_MCP_RESOURCE_URI, type GitHubMcpStatus } from "./contracts";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REQUEST_TIMEOUT_MS = 20_000;

export function createGitHubMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "homework-lesson-9-github-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  server.registerTool(
    "github_list_directory",
    {
      title: "GitHub List Directory",
      description: "List files and directories in a GitHub repository path.",
      inputSchema: {
        owner: z.string().trim().min(1).describe("GitHub owner or organization."),
        repo: z.string().trim().min(1).describe("Repository name."),
        path: z.string().trim().min(1).describe("Directory path in the repository."),
        ref: z.string().trim().min(1).optional().describe("Git ref: branch, tag, or commit SHA."),
      },
    },
    async ({ owner, repo, path, ref }) =>
      toTextResult(await githubListDirectory({ owner, repo, path, ref })),
  );

  server.registerTool(
    "github_get_file_content",
    {
      title: "GitHub Get File Content",
      description: "Read a file from a GitHub repository.",
      inputSchema: {
        owner: z.string().trim().min(1).describe("GitHub owner or organization."),
        repo: z.string().trim().min(1).describe("Repository name."),
        path: z.string().trim().min(1).describe("File path in the repository."),
        ref: z.string().trim().min(1).optional().describe("Git ref: branch, tag, or commit SHA."),
      },
    },
    async ({ owner, repo, path, ref }) =>
      toTextResult(await githubGetFileContent({ owner, repo, path, ref })),
  );

  server.registerResource(
    "github-api-status",
    GITHUB_MCP_RESOURCE_URI,
    {
      title: "GitHub API Status",
      description: "Current GitHub MCP configuration status.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: GITHUB_MCP_RESOURCE_URI,
          mimeType: "application/json",
          text: JSON.stringify(readGitHubMcpStatus(), null, 2),
        },
      ],
    }),
  );

  return server;
}

export function readGitHubMcpStatus(): GitHubMcpStatus {
  return {
    apiBaseUrl: GITHUB_API_BASE_URL,
    tokenConfigured: Boolean(GITHUB_TOKEN.trim()),
    requestTimeoutMs: GITHUB_REQUEST_TIMEOUT_MS,
  };
}

export function createGitHubMcpApp() {
  const app = createMcpExpressApp({ host: GITHUB_MCP_HOST });

  app.post("/", async (req: IncomingMessage & { body?: unknown }, res: GitHubMcpResponse) => {
    await handleGitHubMcpRequest(req, res);
  });

  app.post("/mcp", async (req: IncomingMessage & { body?: unknown }, res: GitHubMcpResponse) => {
    await handleGitHubMcpRequest(req, res);
  });

  app.get("/", methodNotAllowed);
  app.get("/mcp", methodNotAllowed);
  app.delete("/", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}

async function handleGitHubMcpRequest(
  req: IncomingMessage & { body?: unknown },
  res: GitHubMcpResponse,
) {
  const server = createGitHubMcpServer();

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
  } catch (error) {
    console.error("GitHubMCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal GitHubMCP server error.",
        },
        id: null,
      });
    }
    await server.close().catch(() => undefined);
  }
}

function methodNotAllowed(
  _req: { method?: string },
  res: ServerResponse,
) {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    }),
  );
}

function toTextResult(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

type GitHubMcpResponse = ServerResponse & {
  headersSent: boolean;
  status: (code: number) => { json: (body: unknown) => void };
  on: (event: "close", listener: () => void) => void;
};

export async function startGitHubMcpServer(): Promise<void> {
  const app = createGitHubMcpApp();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(GITHUB_MCP_PORT, GITHUB_MCP_HOST, () => {
      console.log(`GitHubMCP listening on http://${GITHUB_MCP_HOST}:${GITHUB_MCP_PORT}`);
      resolve();
    });

    server.on("error", reject);
  });
}

const isEntrypoint = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  startGitHubMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown GitHubMCP startup error.";
    console.error(`GitHubMCP failed to start: ${message}`);
    process.exitCode = 1;
  });
}
