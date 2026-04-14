import { ACP_URL } from "../config/env";
import type {
  AcpAgentName,
  AcpRunRequest,
  AcpRunResponse,
} from "./contracts";
import { AcpRunResponseSchema } from "./contracts";

const ACP_REQUEST_TIMEOUT_MS = 60_000;

export async function runAcpAgent(
  agentName: AcpAgentName,
  input: AcpRunRequest["input"],
): Promise<AcpRunResponse> {
  console.log(`  🌐 [ACP Client] Delegating to remote agent: ${agentName}...`);
  let response: Response;
  try {
    response = await fetch(`${ACP_URL}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ agentName, input }),
      signal: AbortSignal.timeout(ACP_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch failure.";
    throw new Error(
      `ACP server is unreachable at ${ACP_URL}. Start it with "npm run acp:server" or use "npm run dev:stack". Original error: ${message}`,
    );
  }

  if (!response.ok) {
    const message = await readErrorResponse(response);
    throw new Error(`ACP run failed for ${agentName}: ${message}`);
  }

  return AcpRunResponseSchema.parse(await response.json());
}

async function readErrorResponse(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error?.trim() || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}
