import { readdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { OUTPUT_DIR, REPORT_MCP_HOST, REPORT_MCP_PORT } from "../config/env";
import { writeReport } from "../tools/write-report";
import { REPORT_MCP_RESOURCE_URI, type OutputDirStatus } from "./contracts";

export function createReportMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "homework-lesson-9-report-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  server.registerTool(
    "save_report",
    {
      title: "Save Report",
      description: "Persist a markdown report into the output directory.",
      inputSchema: {
        filename: z.string().trim().min(1).max(255).describe("Report file name."),
        content: z.string().trim().min(1).describe("Markdown report content."),
      },
    },
    async ({ filename, content }) => toTextResult(await writeReport({ filename, content })),
  );

  server.registerResource(
    "output-dir",
    REPORT_MCP_RESOURCE_URI,
    {
      title: "Output Directory",
      description: "Current report output directory status.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: REPORT_MCP_RESOURCE_URI,
          mimeType: "application/json",
          text: JSON.stringify(await readOutputDirStatus(), null, 2),
        },
      ],
    }),
  );

  return server;
}

export async function readOutputDirStatus(): Promise<OutputDirStatus> {
  const outputDir = path.resolve(process.cwd(), OUTPUT_DIR);
  const entries = await readdir(outputDir, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissingDirectoryError(error)) {
      return [];
    }
    throw error;
  });

  const savedReports = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  return {
    outputDir,
    savedReports,
    reportCount: savedReports.length,
  };
}

export function createReportMcpApp() {
  const app = createMcpExpressApp({ host: REPORT_MCP_HOST });

  app.post("/", async (req: IncomingMessage & { body?: unknown }, res: ReportMcpResponse) => {
    await handleReportMcpRequest(req, res);
  });

  app.post("/mcp", async (req: IncomingMessage & { body?: unknown }, res: ReportMcpResponse) => {
    await handleReportMcpRequest(req, res);
  });

  app.get("/", methodNotAllowed);
  app.get("/mcp", methodNotAllowed);
  app.delete("/", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}

async function handleReportMcpRequest(
  req: IncomingMessage & { body?: unknown },
  res: ReportMcpResponse,
) {
  const server = createReportMcpServer();

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
    console.error("ReportMCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal ReportMCP server error.",
        },
        id: null,
      });
    }
    await server.close().catch(() => undefined);
  }
}

function isMissingDirectoryError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
  );
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

type ReportMcpResponse = ServerResponse & {
  headersSent: boolean;
  status: (code: number) => { json: (body: unknown) => void };
  on: (event: "close", listener: () => void) => void;
};

export async function startReportMcpServer(): Promise<void> {
  const app = createReportMcpApp();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(REPORT_MCP_PORT, REPORT_MCP_HOST, () => {
      console.log(`ReportMCP listening on http://${REPORT_MCP_HOST}:${REPORT_MCP_PORT}`);
      resolve();
    });

    server.on("error", reject);
  });
}

const isEntrypoint = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  startReportMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown ReportMCP startup error.";
    console.error(`ReportMCP failed to start: ${message}`);
    process.exitCode = 1;
  });
}
