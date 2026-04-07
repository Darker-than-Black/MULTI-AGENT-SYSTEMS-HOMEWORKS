export interface KnowledgeChunkMetadata {
  source: string;
  documentId: string;
  title: string;
  page: number;
  chunkIndex: number;
  chunkId: string;
}

export interface KnowledgeChunkRecord {
  id: string;
  content: string;
  metadata: KnowledgeChunkMetadata;
}

export interface RetrievalCandidate extends KnowledgeChunkRecord {
  score: number;
  retrievalMethod: "semantic" | "bm25" | "hybrid";
  rerankScore?: number;
}

export interface HybridRetrievalResult {
  query: string;
  rerankApplied: boolean;
  candidates: RetrievalCandidate[];
}

export interface IngestedDocumentSummary {
  source: string;
  documentId: string;
  pageCount: number;
  chunkCount: number;
}

export interface IngestSummary {
  processedDocuments: number;
  totalChunks: number;
  collectionName: string;
  corpusPath: string;
  documents: IngestedDocumentSummary[];
}
