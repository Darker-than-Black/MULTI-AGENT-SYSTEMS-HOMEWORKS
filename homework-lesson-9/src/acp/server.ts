import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { ACP_HOST, ACP_PORT } from "../config/env";
import { runAcpAgent } from "./agent-handlers";
import {
  ACP_AGENT_DESCRIPTORS,
  AcpRunRequestSchema,
} from "./contracts";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

export function startAcpServer() {
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ACP server error.";
      writeJson(response, 500, { error: message });
    }
  });

  server.listen(ACP_PORT, ACP_HOST, () => {
    console.log(`ACP server listening on http://${ACP_HOST}:${ACP_PORT}`);
  });

  return server;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${ACP_HOST}:${ACP_PORT}`);

  if (method === "GET" && url.pathname === "/agents") {
    writeJson(response, 200, { agents: ACP_AGENT_DESCRIPTORS });
    return;
  }

  if (method === "POST" && url.pathname === "/runs") {
    const payload = AcpRunRequestSchema.parse(await readJsonBody(request));
    const output = await runAcpAgent(payload.agentName, payload.input);
    writeJson(response, 200, {
      agentName: payload.agentName,
      output,
    });
    return;
  }

  writeJson(response, 404, { error: `Unknown ACP route: ${method} ${url.pathname}` });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error.";
    throw new Error(`ACP request body is not valid JSON: ${message}`);
  }
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(payload, null, 2));
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  startAcpServer();
}
