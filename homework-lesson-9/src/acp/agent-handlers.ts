import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { tool } from "langchain";
import { z } from "zod";
import { critique, createCriticAgent } from "../agents/critic";
import { createPlannerAgent, planResearch } from "../agents/planner";
import {
  createResearcherAgent,
  researchToEnvelope,
} from "../agents/researcher";
import type { AgentToolSet } from "../agents/shared";
import { GITHUB_MCP_URL, SEARCH_MCP_URL } from "../config/env";
import { callMcpTextTool, connectMcpClient } from "../mcp/shared-client";
import type { GitHubToolName, SearchToolName } from "../mcp/contracts";
import { CritiqueResultSchema, type CritiqueResult } from "../schemas/critique-result";
import {
  FindingsEnvelopeSchema,
  type FindingsEnvelope,
} from "../schemas/findings-envelope";
import { ResearchPlanSchema, type ResearchPlan } from "../schemas/research-plan";
import {
  AcpAgentName,
  CriticRunInputSchema,
  PlannerRunInputSchema,
  ResearcherRunInputSchema,
} from "./contracts";

let searchClientPromise: Promise<Client> | null = null;
let githubClientPromise: Promise<Client> | null = null;

let plannerAcpAgent: ReturnType<typeof createPlannerAgent> | null = null;
let researcherAcpAgent: ReturnType<typeof createResearcherAgent> | null = null;
let criticAcpAgent: ReturnType<typeof createCriticAgent> | null = null;

const queryToolSchema = z.object({
  query: z.string().trim().min(1).max(500),
});

const urlToolSchema = z.object({
  url: z.string().trim().min(1).regex(/^https?:\/\//, "Must be an absolute HTTP/HTTPS URL."),
});

const githubDirectorySchema = z.object({
  owner: z.string().trim().min(1),
  repo: z.string().trim().min(1),
  path: z.string().trim().min(1),
  ref: z.string().trim().min(1).optional(),
});

const githubFileSchema = z.object({
  owner: z.string().trim().min(1),
  repo: z.string().trim().min(1),
  path: z.string().trim().min(1),
  ref: z.string().trim().min(1).optional(),
});

const plannerTools: AgentToolSet = [
  createSearchToolAdapter(
    "web_search",
    "Search the web for external or recent sources. Use when planning current or external evidence gathering.",
    queryToolSchema,
  ),
  createSearchToolAdapter(
    "knowledge_search",
    "Search the local ingested knowledge base with hybrid retrieval and reranking.",
    queryToolSchema,
  ),
];

const researcherTools: AgentToolSet = [
  createSearchToolAdapter(
    "web_search",
    "Search the web for external or recent sources.",
    queryToolSchema,
  ),
  createSearchToolAdapter(
    "read_url",
    "Read and extract text from a selected web page.",
    urlToolSchema,
  ),
  createGitHubToolAdapter(
    "github_list_directory",
    "List files and directories in a specific GitHub repository path.",
    githubDirectorySchema,
  ),
  createGitHubToolAdapter(
    "github_get_file_content",
    "Read a file content from a GitHub repository.",
    githubFileSchema,
  ),
  createSearchToolAdapter(
    "knowledge_search",
    "Search the local ingested knowledge base with hybrid retrieval and reranking.",
    queryToolSchema,
  ),
];

const criticTools: AgentToolSet = [
  createSearchToolAdapter(
    "web_search",
    "Search the web for external or recent sources.",
    queryToolSchema,
  ),
  createSearchToolAdapter(
    "read_url",
    "Read and extract text from a selected web page.",
    urlToolSchema,
  ),
  createSearchToolAdapter(
    "knowledge_search",
    "Search the local ingested knowledge base with hybrid retrieval and reranking.",
    queryToolSchema,
  ),
];

async function runPlannerAgent(input: unknown): Promise<ResearchPlan> {
  const parsedInput = PlannerRunInputSchema.parse(input);
  const output = await planResearch(parsedInput.userRequest, { agent: getPlannerAcpAgent() });
  return ResearchPlanSchema.parse(output);
}

async function runResearcherAgent(input: unknown): Promise<FindingsEnvelope> {
  const parsedInput = ResearcherRunInputSchema.parse(input);
  const output = await researchToEnvelope(parsedInput, { agent: getResearcherAcpAgent() });
  return FindingsEnvelopeSchema.parse(output);
}

async function runCriticAgent(input: unknown): Promise<CritiqueResult> {
  const parsedInput = CriticRunInputSchema.parse(input);
  const output = await critique(parsedInput, { agent: getCriticAcpAgent() });
  return CritiqueResultSchema.parse(output);
}

export async function runAcpAgent(agentName: AcpAgentName, input: unknown): Promise<unknown> {
  switch (agentName) {
    case "planner":
      return runPlannerAgent(input);
    case "researcher":
      return runResearcherAgent(input);
    case "critic":
      return runCriticAgent(input);
  }
}

function getPlannerAcpAgent() {
  if (!plannerAcpAgent) {
    plannerAcpAgent = createPlannerAgent({ tools: plannerTools });
  }

  return plannerAcpAgent;
}

function getResearcherAcpAgent() {
  if (!researcherAcpAgent) {
    researcherAcpAgent = createResearcherAgent({ tools: researcherTools });
  }

  return researcherAcpAgent;
}

function getCriticAcpAgent() {
  if (!criticAcpAgent) {
    criticAcpAgent = createCriticAgent({ tools: criticTools });
  }

  return criticAcpAgent;
}

function createSearchToolAdapter<TSchema extends z.ZodTypeAny>(
  name: SearchToolName,
  description: string,
  schema: TSchema,
) {
  return tool(
    async (args: z.infer<TSchema>) => {
      const client = await getSearchClient();
      return callMcpTextTool(client, name, args as Record<string, unknown>, "SearchMCP");
    },
    {
      name,
      description,
      schema,
    },
  );
}

function createGitHubToolAdapter<TSchema extends z.ZodTypeAny>(
  name: GitHubToolName,
  description: string,
  schema: TSchema,
) {
  return tool(
    async (args: z.infer<TSchema>) => {
      const client = await getGitHubClient();
      return callMcpTextTool(client, name, args as Record<string, unknown>, "GitHubMCP");
    },
    {
      name,
      description,
      schema,
    },
  );
}

async function getSearchClient(): Promise<Client> {
  if (!searchClientPromise) {
    searchClientPromise = connectSearchClient().catch((error) => {
      searchClientPromise = null;
      throw error;
    });
  }

  return searchClientPromise;
}

async function getGitHubClient(): Promise<Client> {
  if (!githubClientPromise) {
    githubClientPromise = connectGitHubClient().catch((error) => {
      githubClientPromise = null;
      throw error;
    });
  }

  return githubClientPromise;
}

async function connectSearchClient(): Promise<Client> {
  const client = await connectMcpClient({
    clientName: "homework-lesson-9-acp-search-client",
    serverLabel: "SearchMCP",
    serverUrl: SEARCH_MCP_URL,
  });

  client.onerror = () => {
    searchClientPromise = null;
  };

  return client;
}

async function connectGitHubClient(): Promise<Client> {
  const client = await connectMcpClient({
    clientName: "homework-lesson-9-acp-github-client",
    serverLabel: "GitHubMCP",
    serverUrl: GITHUB_MCP_URL,
  });

  client.onerror = () => {
    githubClientPromise = null;
  };

  return client;
}
