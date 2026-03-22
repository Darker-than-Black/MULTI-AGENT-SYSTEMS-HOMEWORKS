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

export const toolSchemas: ToolSchema[] = [
  webSearchSchema,
  readUrlSchema,
  writeReportSchema,
];
