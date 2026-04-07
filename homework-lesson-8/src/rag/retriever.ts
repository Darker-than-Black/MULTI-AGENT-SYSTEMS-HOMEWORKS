import { Document } from "@langchain/core/documents";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";
import { CohereRerank } from "@langchain/cohere";
import {
  COHERE_API_KEY,
  KNOWLEDGE_RERANK_TOP_N,
  KNOWLEDGE_TOP_K,
  RERANK_MODEL,
} from "../config/env.js";
import { corpusToDocuments, getKnowledgeVectorStore, loadKnowledgeCorpus } from "./store.js";
import type { HybridRetrievalResult, KnowledgeChunkMetadata, RetrievalCandidate } from "./types.js";
import { OPENAI_API_KEY } from "../config/env.js";

export async function retrieveKnowledge(query: string): Promise<HybridRetrievalResult> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("Query cannot be empty.");
  }

  const corpus = await loadKnowledgeCorpus();
  if (corpus.length === 0) {
    throw new Error("Knowledge corpus is empty. Run `npm run ingest` first.");
  }

  const [semanticCandidates, lexicalCandidates] = await Promise.all([
    semanticRetrieve(normalizedQuery),
    lexicalRetrieve(normalizedQuery, corpus),
  ]);

  const fused = fuseCandidates(semanticCandidates, lexicalCandidates);
  const reranked = await rerankCandidates(normalizedQuery, fused);

  return {
    query: normalizedQuery,
    rerankApplied: reranked.applied,
    candidates: reranked.candidates.slice(0, KNOWLEDGE_RERANK_TOP_N),
  };
}

async function semanticRetrieve(query: string): Promise<RetrievalCandidate[]> {
  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is required for semantic retrieval.");
  }

  const vectorStore = await getKnowledgeVectorStore();

  const results = await vectorStore.similaritySearchWithScore(
    query,
    Math.max(KNOWLEDGE_TOP_K * 2, KNOWLEDGE_RERANK_TOP_N),
  );

  return results.map(([document, score]) =>
    toCandidate(document, score, "semantic"),
  );
}

async function lexicalRetrieve(
  query: string,
  corpus: Array<{ id: string; content: string; metadata: KnowledgeChunkMetadata }>,
): Promise<RetrievalCandidate[]> {
  const retriever = BM25Retriever.fromDocuments(corpusToDocuments(corpus), {
    k: Math.max(KNOWLEDGE_TOP_K * 2, KNOWLEDGE_RERANK_TOP_N),
    includeScore: true,
  });

  const documents = await retriever.invoke(query);
  return documents.map((document) =>
    toCandidate(document, Number(document.metadata.bm25Score ?? 0), "bm25"),
  );
}

function fuseCandidates(
  semanticCandidates: RetrievalCandidate[],
  lexicalCandidates: RetrievalCandidate[],
): RetrievalCandidate[] {
  const byId = new Map<string, RetrievalCandidate>();
  const reciprocalRankOffset = 60;

  const merge = (candidate: RetrievalCandidate, rank: number) => {
    const current = byId.get(candidate.id);
    const contribution = 1 / (reciprocalRankOffset + rank + 1);

    if (!current) {
      byId.set(candidate.id, {
        ...candidate,
        score: contribution,
      });
      return;
    }

    current.score += contribution;
    if (current.retrievalMethod !== candidate.retrievalMethod) {
      current.retrievalMethod = "hybrid";
    }
  };

  semanticCandidates.forEach((candidate, index) => merge(candidate, index));
  lexicalCandidates.forEach((candidate, index) => merge(candidate, index));

  return [...byId.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(KNOWLEDGE_TOP_K * 2, KNOWLEDGE_RERANK_TOP_N));
}

async function rerankCandidates(
  query: string,
  candidates: RetrievalCandidate[],
): Promise<{ applied: boolean; candidates: RetrievalCandidate[] }> {
  if (candidates.length <= 1 || !COHERE_API_KEY.trim()) {
    return { applied: false, candidates };
  }

  try {
    const reranker = new CohereRerank({
      apiKey: COHERE_API_KEY,
      model: RERANK_MODEL,
      topN: Math.min(KNOWLEDGE_RERANK_TOP_N, candidates.length),
    });

    const reranked = await reranker.rerank(
      candidates.map((candidate) => candidate.content),
      query,
      {
        model: RERANK_MODEL,
        topN: Math.min(KNOWLEDGE_RERANK_TOP_N, candidates.length),
      },
    );

    return {
      applied: true,
      candidates: reranked.map(({ index, relevanceScore }) => ({
        ...candidates[index],
        score: relevanceScore,
        rerankScore: relevanceScore,
      })),
    };
  } catch {
    return { applied: false, candidates };
  }
}

function toCandidate(
  document: Document,
  score: number,
  retrievalMethod: RetrievalCandidate["retrievalMethod"],
): RetrievalCandidate {
  const metadata = document.metadata as KnowledgeChunkMetadata;

  return {
    id: document.id ?? metadata.chunkId,
    content: document.pageContent,
    metadata,
    score,
    retrievalMethod,
  };
}
