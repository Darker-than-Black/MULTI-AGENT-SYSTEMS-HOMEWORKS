export const SEARCH_MCP_RESOURCE_URI = "resource://knowledge-base-stats";
export const GITHUB_MCP_RESOURCE_URI = "resource://github-api-status";
export const REPORT_MCP_RESOURCE_URI = "resource://output-dir";

export type SearchToolName = "web_search" | "read_url" | "knowledge_search";
export type GitHubToolName = "github_list_directory" | "github_get_file_content";
export type ReportToolName = "save_report";

export interface KnowledgeBaseStats {
  collection: string;
  corpusPath: string;
  documentCount: number;
  updatedAt: string;
}

export interface GitHubMcpStatus {
  apiBaseUrl: string;
  tokenConfigured: boolean;
  requestTimeoutMs: number;
}

export interface OutputDirStatus {
  outputDir: string;
  savedReports: string[];
  reportCount: number;
}
