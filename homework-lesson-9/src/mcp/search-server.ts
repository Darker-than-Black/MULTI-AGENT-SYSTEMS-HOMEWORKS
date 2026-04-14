import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { QDRANT_COLLECTION, SEARCH_MCP_HOST, SEARCH_MCP_PORT } from "../config/env";
import { getKnowledgeCorpusPath, loadKnowledgeCorpus } from "../rag/store";
import { knowledgeSearch } from "../tools/knowledge-search";
import { readUrl } from "../tools/read-url";
import { webSearch } from "../tools/web-search";
import { SEARCH_MCP_RESOURCE_URI, type KnowledgeBaseStats } from "./contracts";

export function createSearchMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "homework-lesson-9-search-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  server.registerTool(
    "web_search",
    {
      title: "Web Search",
      description: "Search the web for recent or external evidence.",
      inputSchema: {
        query: z.string().trim().min(1).max(500).describe("Search query."),
      },
    },
    async ({ query }) => toTextResult(await webSearch({ query })),
  );

  server.registerTool(
    "read_url",
    {
      title: "Read URL",
      description: "Read and extract readable HTML content from a web page.",
      inputSchema: {
        url: z.string().trim().min(1).describe("Absolute HTTP/HTTPS URL."),
      },
    },
    async ({ url }) => toTextResult(await readUrl({ url })),
  );

  server.registerTool(
    "knowledge_search",
    {
      title: "Knowledge Search",
      description: "Search the local RAG knowledge base.",
      inputSchema: {
        query: z.string().trim().min(1).max(500).describe("Question or search query for the local knowledge base."),
      },
    },
    async ({ query }) => toTextResult(await knowledgeSearch({ query })),
  );

  server.registerResource(
    "knowledge-base-stats",
    SEARCH_MCP_RESOURCE_URI,
    {
      title: "Knowledge Base Stats",
      description: "Metadata about the ingested local knowledge base.",
      mimeType: "application/json",
    },
    async () => {
      const stats = await readKnowledgeBaseStats();
      return {
        contents: [
          {
            uri: SEARCH_MCP_RESOURCE_URI,
            mimeType: "application/json",
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    },
  );

  return server;
}

export async function readKnowledgeBaseStats(): Promise<KnowledgeBaseStats> {
  const corpusPath = getKnowledgeCorpusPath();
  const corpusFileStat = await stat(corpusPath).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown corpus error.";
    throw new Error(`Knowledge corpus is missing at ${corpusPath}: ${message}`);
  });

  const corpus = await loadKnowledgeCorpus();
  const uniqueSources = new Set(
    corpus
      .map((record) => record.metadata?.source?.trim())
      .filter((source): source is string => Boolean(source)),
  );

  return {
    collection: QDRANT_COLLECTION,
    corpusPath,
    documentCount: uniqueSources.size,
    updatedAt: corpusFileStat.mtime.toISOString(),
  };
}

export function createSearchMcpApp() {
  const app = createMcpExpressApp({ host: SEARCH_MCP_HOST });

  app.post("/", async (req: IncomingMessage & { body?: unknown }, res: SearchMcpResponse) => {
    await handleSearchMcpRequest(req, res);
  });

  app.post("/mcp", async (req: IncomingMessage & { body?: unknown }, res: SearchMcpResponse) => {
    await handleSearchMcpRequest(req, res);
  });

  app.get("/", methodNotAllowed);
  app.get("/mcp", methodNotAllowed);
  app.delete("/", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}

async function handleSearchMcpRequest(
  req: IncomingMessage & { body?: unknown },
  res: SearchMcpResponse,
) {
  const server = createSearchMcpServer();

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
    console.error("SearchMCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal SearchMCP server error.",
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

type SearchMcpResponse = ServerResponse & {
  headersSent: boolean;
  status: (code: number) => { json: (body: unknown) => void };
  on: (event: "close", listener: () => void) => void;
};

export async function startSearchMcpServer(): Promise<void> {
  const app = createSearchMcpApp();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(SEARCH_MCP_PORT, SEARCH_MCP_HOST, () => {
      console.log(`SearchMCP listening on http://${SEARCH_MCP_HOST}:${SEARCH_MCP_PORT}`);
      resolve();
    });

    server.on("error", reject);
  });
}

const isEntrypoint = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  startSearchMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown SearchMCP startup error.";
    console.error(`SearchMCP failed to start: ${message}`);
    process.exitCode = 1;
  });
}
