export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const MODEL_NAME = process.env.MODEL_NAME || "gpt-4o-mini";
export const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS) || 10;
export const MAX_SEARCH_RESULTS = Number(process.env.MAX_SEARCH_RESULTS) || 5;
export const MAX_URL_CONTENT_LENGTH = Number(process.env.MAX_URL_CONTENT_LENGTH) || 5000;
export const MAX_SESSION_MESSAGES = Number(process.env.MAX_SESSION_MESSAGES) || 80;
export const MAX_MESSAGE_CONTENT_CHARS = Number(process.env.MAX_MESSAGE_CONTENT_CHARS) || 4000;
export const OUTPUT_DIR = process.env.OUTPUT_DIR || "output";
