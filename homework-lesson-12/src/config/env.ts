import "dotenv/config";

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
export const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY || "";
export const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY || "";
export const LANGFUSE_BASE_URL = process.env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com";
export const MODEL_NAME = process.env.MODEL_NAME || "gpt-5.4-nano";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
export const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
export const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "knowledge-base";
export const COHERE_API_KEY = process.env.COHERE_API_KEY || "";
export const RERANK_MODEL = process.env.RERANK_MODEL || "rerank-v3.5";
export const KNOWLEDGE_DATA_DIR = process.env.KNOWLEDGE_DATA_DIR || "data";
export const KNOWLEDGE_CORPUS_PATH = process.env.KNOWLEDGE_CORPUS_PATH || ".rag/knowledge-corpus.json";
export const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 1200);
export const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP || 200);
export const KNOWLEDGE_TOP_K = Number(process.env.KNOWLEDGE_TOP_K || 6);
export const KNOWLEDGE_RERANK_TOP_N = Number(process.env.KNOWLEDGE_RERANK_TOP_N || 4);
export const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS || 10);
export const MAX_SEARCH_RESULTS = Number(process.env.MAX_SEARCH_RESULTS || 5);
export const MAX_URL_CONTENT_LENGTH = Number(process.env.MAX_URL_CONTENT_LENGTH || 5000);
export const MAX_SESSION_MESSAGES = Number(process.env.MAX_SESSION_MESSAGES || 80);
export const MAX_MESSAGE_CONTENT_CHARS = Number(process.env.MAX_MESSAGE_CONTENT_CHARS || 4000);
export const TEMPERATURE = Number(process.env.TEMPERATURE || 0.2);
export const OUTPUT_DIR = process.env.OUTPUT_DIR || "output";
export const SUPERVISOR_MAX_RESEARCH_REVISIONS = Number(process.env.SUPERVISOR_MAX_RESEARCH_REVISIONS || 2);
export const SUPERVISOR_MIN_RECURSION_LIMIT = Number(process.env.SUPERVISOR_MIN_RECURSION_LIMIT || 30);
export const SUPERVISOR_RECURSION_MULTIPLIER = Number(process.env.SUPERVISOR_RECURSION_MULTIPLIER || 7);
export const PLANNER_RECURSION_LIMIT = Number(process.env.PLANNER_RECURSION_LIMIT || 8);
export const CRITIC_RECURSION_LIMIT = Number(process.env.CRITIC_RECURSION_LIMIT || 8);
export const RESEARCH_WORKFLOW_MIN_RECURSION_LIMIT = Number(
  process.env.RESEARCH_WORKFLOW_MIN_RECURSION_LIMIT || 14,
);
export const RESEARCH_WORKFLOW_QUERY_RECURSION_FACTOR = Number(
  process.env.RESEARCH_WORKFLOW_QUERY_RECURSION_FACTOR || 4,
);
export const RESEARCH_WORKFLOW_QUERY_RECURSION_OFFSET = Number(
  process.env.RESEARCH_WORKFLOW_QUERY_RECURSION_OFFSET || 2,
);
export const RESEARCH_TURN_MIN_RECURSION_LIMIT = Number(
  process.env.RESEARCH_TURN_MIN_RECURSION_LIMIT || 10,
);
export const RESEARCH_TURN_RECURSION_MULTIPLIER = Number(
  process.env.RESEARCH_TURN_RECURSION_MULTIPLIER || 3,
);
