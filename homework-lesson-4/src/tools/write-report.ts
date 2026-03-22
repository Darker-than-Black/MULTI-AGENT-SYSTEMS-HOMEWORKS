import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUTPUT_DIR } from "../config/env.js";
import { toSafeReportFilename } from "../utils/filenames.js";
import { ToolExecutionError, ToolInputError } from "./errors.js";

export interface WriteReportArgs {
  filename: string;
  content: string;
}

export async function writeReport(args: WriteReportArgs): Promise<string> {
  const filename = args.filename.trim();
  if (!filename) {
    throw new ToolInputError('write_report: "filename" cannot be empty.');
  }

  const content = args.content.trim();
  if (!content) {
    throw new ToolInputError('write_report: "content" cannot be empty.');
  }

  try {
    const outputDir = path.resolve(process.cwd(), OUTPUT_DIR);
    await mkdir(outputDir, { recursive: true });

    const safeFileName = toSafeReportFilename(filename);
    const fullPath = path.join(outputDir, safeFileName);
    await writeFile(fullPath, content, "utf8");

    return `Report saved to ${path.relative(process.cwd(), fullPath)}`;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown write failure.";
    throw new ToolExecutionError(`write_report: failed to save file (${message}).`);
  }
}
