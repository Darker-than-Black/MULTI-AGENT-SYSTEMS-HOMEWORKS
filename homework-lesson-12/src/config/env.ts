import "dotenv/config";

function readStringEnv(key: string, fallback: string): string {
  const value = process.env[key];
  return typeof value === "string" ? value : fallback;
}

function readNumberEnv(key: string, fallback: number): number {
  const rawValue = process.env[key];
  if (typeof rawValue !== "string") {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
export const MODEL_NAME = readStringEnv("MODEL_NAME", "gpt-5.4-nano");
export const EMBEDDING_MODEL = readStringEnv("EMBEDDING_MODEL", "text-embedding-3-small");
export const QDRANT_URL = readStringEnv("QDRANT_URL", "http://localhost:6333");
export const QDRANT_COLLECTION = readStringEnv("QDRANT_COLLECTION", "knowledge-base");
export const COHERE_API_KEY = process.env.COHERE_API_KEY || "";
export const RERANK_MODEL = readStringEnv("RERANK_MODEL", "rerank-v3.5");
export const KNOWLEDGE_DATA_DIR = readStringEnv("KNOWLEDGE_DATA_DIR", "data");
export const KNOWLEDGE_CORPUS_PATH = readStringEnv(
  "KNOWLEDGE_CORPUS_PATH",
  ".rag/knowledge-corpus.json",
);
export const CHUNK_SIZE = readNumberEnv("CHUNK_SIZE", 1200);
export const CHUNK_OVERLAP = readNumberEnv("CHUNK_OVERLAP", 200);
export const KNOWLEDGE_TOP_K = readNumberEnv("KNOWLEDGE_TOP_K", 6);
export const KNOWLEDGE_RERANK_TOP_N = readNumberEnv("KNOWLEDGE_RERANK_TOP_N", 4);
export const MAX_ITERATIONS = readNumberEnv("MAX_ITERATIONS", 10);
export const MAX_SEARCH_RESULTS = readNumberEnv("MAX_SEARCH_RESULTS", 5);
export const MAX_URL_CONTENT_LENGTH = readNumberEnv("MAX_URL_CONTENT_LENGTH", 5000);
export const MAX_SESSION_MESSAGES = readNumberEnv("MAX_SESSION_MESSAGES", 80);
export const MAX_MESSAGE_CONTENT_CHARS = readNumberEnv("MAX_MESSAGE_CONTENT_CHARS", 4000);
export const TEMPERATURE = readNumberEnv("TEMPERATURE", 0.2);
export const OUTPUT_DIR = readStringEnv("OUTPUT_DIR", "output");
export const SUPERVISOR_MAX_RESEARCH_REVISIONS = readNumberEnv("SUPERVISOR_MAX_RESEARCH_REVISIONS", 2);
export const SUPERVISOR_MIN_RECURSION_LIMIT = readNumberEnv("SUPERVISOR_MIN_RECURSION_LIMIT", 30);
export const SUPERVISOR_RECURSION_MULTIPLIER = readNumberEnv("SUPERVISOR_RECURSION_MULTIPLIER", 7);
export const PLANNER_RECURSION_LIMIT = readNumberEnv("PLANNER_RECURSION_LIMIT", 8);
export const CRITIC_RECURSION_LIMIT = readNumberEnv("CRITIC_RECURSION_LIMIT", 8);
export const RESEARCH_WORKFLOW_MIN_RECURSION_LIMIT = readNumberEnv(
  "RESEARCH_WORKFLOW_MIN_RECURSION_LIMIT",
  14,
);
export const RESEARCH_WORKFLOW_QUERY_RECURSION_FACTOR = readNumberEnv(
  "RESEARCH_WORKFLOW_QUERY_RECURSION_FACTOR",
  4,
);
export const RESEARCH_WORKFLOW_QUERY_RECURSION_OFFSET = readNumberEnv(
  "RESEARCH_WORKFLOW_QUERY_RECURSION_OFFSET",
  2,
);
export const RESEARCH_TURN_MIN_RECURSION_LIMIT = readNumberEnv(
  "RESEARCH_TURN_MIN_RECURSION_LIMIT",
  10,
);
export const RESEARCH_TURN_RECURSION_MULTIPLIER = readNumberEnv(
  "RESEARCH_TURN_RECURSION_MULTIPLIER",
  3,
);
