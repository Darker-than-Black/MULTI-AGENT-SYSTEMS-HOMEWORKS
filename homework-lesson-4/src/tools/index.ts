import { readUrl } from "./read-url.js";
import { webSearch } from "./web-search.js";
import { writeReport } from "./write-report.js";
import { toolSchemas } from "./schemas.js";
import { requireStringArg } from "./validation.js";

export interface RegisteredTool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export const toolsByName: Record<string, RegisteredTool> = {
  web_search: {
    name: "web_search",
    execute: async (args) =>
      webSearch({
        query: requireStringArg("web_search", args, "query", { maxLength: 500 }),
      }),
  },
  read_url: {
    name: "read_url",
    execute: async (args) =>
      readUrl({
        url: requireStringArg("read_url", args, "url", { pattern: /^https?:\/\// }),
      }),
  },
  write_report: {
    name: "write_report",
    execute: async (args) =>
      writeReport({
        filename: requireStringArg("write_report", args, "filename", {
          maxLength: 255,
        }),
        content: requireStringArg("write_report", args, "content"),
      }),
  },
};

export { toolSchemas };
