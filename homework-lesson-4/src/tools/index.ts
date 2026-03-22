import { readUrl } from "./read-url.js";
import { webSearch } from "./web-search.js";
import { writeReport } from "./write-report.js";
import { toolSchemas } from "./schemas.js";

export interface RegisteredTool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export const toolsByName: Record<string, RegisteredTool> = {
  web_search: {
    name: "web_search",
    execute: async (args) => webSearch({ query: String(args.query ?? "") }),
  },
  read_url: {
    name: "read_url",
    execute: async (args) => readUrl({ url: String(args.url ?? "") }),
  },
  write_report: {
    name: "write_report",
    execute: async (args) =>
      writeReport({
        filename: String(args.filename ?? "report.md"),
        content: String(args.content ?? ""),
      }),
  },
};

export { toolSchemas };
