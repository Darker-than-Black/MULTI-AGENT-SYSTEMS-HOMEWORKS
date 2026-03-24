export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export const webSearchSchema: ToolSchema = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search web results by query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query.",
          minLength: 1,
          maxLength: 500,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

export const readUrlSchema: ToolSchema = {
  type: "function",
  function: {
    name: "read_url",
    description: "Read and extract text from a URL.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Absolute HTTP/HTTPS URL to read.",
          minLength: 1,
          format: "uri",
          pattern: "^https?://",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

export const writeReportSchema: ToolSchema = {
  type: "function",
  function: {
    name: "write_report",
    description: "Save markdown report to output directory.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Report file name (markdown).",
          minLength: 1,
          maxLength: 255,
        },
        content: {
          type: "string",
          description: "Markdown report content.",
          minLength: 1,
        },
      },
      required: ["filename", "content"],
      additionalProperties: false,
    },
  },
};

export const githubListDirectorySchema: ToolSchema = {
  type: "function",
  function: {
    name: "github_list_directory",
    description: "List files and directories in a specific GitHub repository path.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub owner/org.", minLength: 1 },
        repo: { type: "string", description: "Repository name.", minLength: 1 },
        path: { type: "string", description: "Directory path in repository.", minLength: 1 },
        ref: {
          type: "string",
          description: "Git ref (branch/tag/commit SHA). Optional.",
          minLength: 1,
        },
      },
      required: ["owner", "repo", "path"],
      additionalProperties: false,
    },
  },
};

export const githubGetFileContentSchema: ToolSchema = {
  type: "function",
  function: {
    name: "github_get_file_content",
    description: "Read a file content from a GitHub repository.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub owner/org.", minLength: 1 },
        repo: { type: "string", description: "Repository name.", minLength: 1 },
        path: { type: "string", description: "File path in repository.", minLength: 1 },
        ref: {
          type: "string",
          description: "Git ref (branch/tag/commit SHA). Optional.",
          minLength: 1,
        },
      },
      required: ["owner", "repo", "path"],
      additionalProperties: false,
    },
  },
};

export const toolSchemas: ToolSchema[] = [
  webSearchSchema,
  readUrlSchema,
  writeReportSchema,
  githubListDirectorySchema,
  githubGetFileContentSchema,
];
