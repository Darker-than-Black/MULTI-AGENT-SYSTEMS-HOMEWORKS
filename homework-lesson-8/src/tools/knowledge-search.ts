import { retrieveKnowledge } from "../rag/retriever";
import { truncateText } from "../utils/truncate";
import { ToolExecutionError, ToolInputError } from "./errors";

export interface KnowledgeSearchArgs {
  query: string;
}

export async function knowledgeSearch(args: KnowledgeSearchArgs): Promise<string> {
  const query = args.query.trim();
  if (!query) {
    throw new ToolInputError('knowledge_search: "query" cannot be empty.');
  }

  try {
    const result = await retrieveKnowledge(query);
    return JSON.stringify(
      result.candidates.map((candidate) => ({
        title: candidate.metadata.title,
        source: candidate.metadata.source,
        page: candidate.metadata.page,
        chunkId: candidate.metadata.chunkId,
        retrievalMethod: candidate.retrievalMethod,
        score: Number(candidate.score.toFixed(4)),
        snippet: truncateText(candidate.content.replace(/\s+/g, " ").trim(), 280),
      })),
      null,
      2,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown knowledge search failure.";
    throw new ToolExecutionError(`knowledge_search: ${message}`);
  }
}
