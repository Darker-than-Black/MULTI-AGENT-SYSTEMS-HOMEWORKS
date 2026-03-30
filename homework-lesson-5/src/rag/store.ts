import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import {
  EMBEDDING_MODEL,
  KNOWLEDGE_CORPUS_PATH,
  OPENAI_API_KEY,
  QDRANT_COLLECTION,
  QDRANT_URL,
} from "../config/env.js";
import type { KnowledgeChunkRecord } from "./types.js";

let cachedEmbeddings: OpenAIEmbeddings | null = null;
let cachedVectorStore: QdrantVectorStore | null = null;
let cachedQdrantClient: QdrantClient | null = null;

export function getKnowledgeCorpusPath(): string {
  return path.resolve(process.cwd(), KNOWLEDGE_CORPUS_PATH);
}

export async function loadKnowledgeCorpus(): Promise<KnowledgeChunkRecord[]> {
  try {
    const raw = await readFile(getKnowledgeCorpusPath(), "utf8");
    return JSON.parse(raw) as KnowledgeChunkRecord[];
  } catch (error: unknown) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
}

export async function saveKnowledgeCorpus(records: KnowledgeChunkRecord[]): Promise<void> {
  const corpusPath = getKnowledgeCorpusPath();
  await mkdir(path.dirname(corpusPath), { recursive: true });
  await writeFile(corpusPath, JSON.stringify(records, null, 2), "utf8");
}

export async function deleteKnowledgeChunks(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  try {
    const vectorStore = await getKnowledgeVectorStore();
    await vectorStore.delete({ ids });
  } catch (error: unknown) {
    throw toQdrantError(error);
  }
}

export async function upsertKnowledgeChunks(records: KnowledgeChunkRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }

  try {
    const vectorStore = await getKnowledgeVectorStore();
    const documents = corpusToDocuments(records);

    await vectorStore.addDocuments(documents, { ids: records.map((record) => record.id) });
  } catch (error: unknown) {
    throw toQdrantError(error);
  }
}

export function corpusToDocuments(records: KnowledgeChunkRecord[]): Document[] {
  return records.map((record) =>
    new Document({
      id: record.id,
      pageContent: record.content,
      metadata: record.metadata,
    }),
  );
}

export async function getKnowledgeVectorStore(): Promise<QdrantVectorStore> {
  if (cachedVectorStore) {
    return cachedVectorStore;
  }

  try {
    cachedVectorStore = await QdrantVectorStore.fromExistingCollection(
      getEmbeddings(),
      {
        client: getQdrantClient(),
        collectionName: QDRANT_COLLECTION,
      },
    );
  } catch (error: unknown) {
    throw toQdrantError(error);
  }

  return cachedVectorStore;
}

function getEmbeddings(): OpenAIEmbeddings {
  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is required for embeddings and retrieval.");
  }

  if (!cachedEmbeddings) {
    cachedEmbeddings = new OpenAIEmbeddings({
      apiKey: OPENAI_API_KEY,
      model: EMBEDDING_MODEL,
    });
  }

  return cachedEmbeddings;
}

function getQdrantClient(): QdrantClient {
  if (!cachedQdrantClient) {
    cachedQdrantClient = new QdrantClient({
      url: QDRANT_URL,
      checkCompatibility: false,
    });
  }

  return cachedQdrantClient;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );
}

function toQdrantError(error: unknown): Error {
  const message = error instanceof Error ? error.message : "Unknown Qdrant error.";
  if (message.includes("fetch failed")) {
    return new Error(
      `Unable to reach Qdrant at ${QDRANT_URL}. Ensure the server is running and QDRANT_URL is correct.`,
    );
  }
  return new Error(message);
}
