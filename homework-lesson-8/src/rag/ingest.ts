import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFParse } from "pdf-parse";
import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  KNOWLEDGE_CORPUS_PATH,
  KNOWLEDGE_DATA_DIR,
  QDRANT_COLLECTION,
} from "../config/env";
import {
  deleteKnowledgeChunks,
  loadKnowledgeCorpus,
  saveKnowledgeCorpus,
  upsertKnowledgeChunks,
} from "./store";
import type {
  IngestSummary,
  IngestedDocumentSummary,
  KnowledgeChunkMetadata,
  KnowledgeChunkRecord,
} from "./types";

export async function ingestKnowledgeBase(): Promise<IngestSummary> {
  const sourceDocuments = await loadSourceDocuments();
  if (sourceDocuments.length === 0) {
    throw new Error(`No supported knowledge files found in ${KNOWLEDGE_DATA_DIR}.`);
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const splitDocuments = await splitter.splitDocuments(sourceDocuments);
  const chunkRecords = buildChunkRecords(splitDocuments);

  const existingCorpus = await loadKnowledgeCorpus();
  const incomingDocumentIds = new Set(chunkRecords.map((record) => record.metadata.documentId));
  const idsToDelete = existingCorpus
    .filter((record) => incomingDocumentIds.has(record.metadata.documentId))
    .map((record) => record.id);

  await deleteKnowledgeChunks(idsToDelete);
  await upsertKnowledgeChunks(chunkRecords);

  const mergedCorpus = [
    ...existingCorpus.filter((record) => !incomingDocumentIds.has(record.metadata.documentId)),
    ...chunkRecords,
  ];
  await saveKnowledgeCorpus(mergedCorpus);

  return {
    processedDocuments: countUniqueDocuments(chunkRecords),
    totalChunks: chunkRecords.length,
    collectionName: QDRANT_COLLECTION,
    corpusPath: KNOWLEDGE_CORPUS_PATH,
    documents: summarizeIngestedDocuments(chunkRecords),
  };
}

async function loadSourceDocuments(): Promise<Document[]> {
  const dataDir = path.resolve(process.cwd(), KNOWLEDGE_DATA_DIR);
  const entries = await readdir(dataDir, { withFileTypes: true });
  const supportedFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().endsWith(".pdf") || name.toLowerCase().endsWith(".txt"))
    .sort();

  const documents: Document[] = [];

  for (const fileName of supportedFiles) {
    const absolutePath = path.join(dataDir, fileName);
    const loaded =
      fileName.toLowerCase().endsWith(".pdf")
        ? await loadPdfDocumentPages(absolutePath)
        : await loadTextDocument(absolutePath);

    documents.push(...loaded);
  }

  return documents.filter((document) => document.pageContent.trim().length > 0);
}

async function loadPdfDocumentPages(filePath: string): Promise<Document[]> {
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const documentId = toDocumentId(filePath);
    const title = path.basename(filePath, path.extname(filePath));
    const source = path.relative(process.cwd(), filePath);

    return result.pages
      .map((page) => ({ page: page.num, text: page.text.trim() }))
      .filter((page) => page.text.length > 0)
      .map(
        (page) =>
          new Document({
            pageContent: page.text,
            metadata: {
              source,
              documentId,
              title,
              page: page.page,
            },
          }),
      );
  } finally {
    await parser.destroy();
  }
}

async function loadTextDocument(filePath: string): Promise<Document[]> {
  const content = await readFile(filePath, "utf8");
  const documentId = toDocumentId(filePath);
  const title = path.basename(filePath, path.extname(filePath));
  const source = path.relative(process.cwd(), filePath);

  return [
    new Document({
      pageContent: content.trim(),
      metadata: {
        source,
        documentId,
        title,
        page: 1,
      },
    }),
  ];
}

function buildChunkRecords(documents: Document[]): KnowledgeChunkRecord[] {
  const chunkCounters = new Map<string, number>();

  return documents.map((document) => {
    const metadata = normalizeMetadata(document.metadata);
    const counterKey = `${metadata.documentId}:${metadata.page}`;
    const chunkIndex = chunkCounters.get(counterKey) ?? 0;
    chunkCounters.set(counterKey, chunkIndex + 1);

    const chunkId = `${metadata.documentId}::p${metadata.page}::c${chunkIndex}`;
    return {
      id: toQdrantPointId(chunkId),
      content: document.pageContent.trim(),
      metadata: {
        ...metadata,
        chunkIndex,
        chunkId,
      },
    };
  });
}

function normalizeMetadata(metadata: Record<string, unknown>): Omit<KnowledgeChunkMetadata, "chunkIndex" | "chunkId"> {
  return {
    source: String(metadata.source ?? ""),
    documentId: String(metadata.documentId ?? ""),
    title: String(metadata.title ?? ""),
    page: Number(metadata.page ?? 1),
  };
}

function summarizeIngestedDocuments(records: KnowledgeChunkRecord[]): IngestedDocumentSummary[] {
  const summaries = new Map<string, IngestedDocumentSummary>();

  for (const record of records) {
    const existing = summaries.get(record.metadata.documentId);
    if (existing) {
      existing.chunkCount += 1;
      existing.pageCount = Math.max(existing.pageCount, record.metadata.page);
      continue;
    }

    summaries.set(record.metadata.documentId, {
      source: record.metadata.source,
      documentId: record.metadata.documentId,
      pageCount: record.metadata.page,
      chunkCount: 1,
    });
  }

  return [...summaries.values()].sort((left, right) => left.documentId.localeCompare(right.documentId));
}

function countUniqueDocuments(records: KnowledgeChunkRecord[]): number {
  return new Set(records.map((record) => record.metadata.documentId)).size;
}

function toDocumentId(filePath: string): string {
  return path
    .basename(filePath, path.extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toQdrantPointId(value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectExecution) {
  ingestKnowledgeBase()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown ingestion error.";
      console.error(`Ingestion failed: ${message}`);
      process.exitCode = 1;
    });
}
