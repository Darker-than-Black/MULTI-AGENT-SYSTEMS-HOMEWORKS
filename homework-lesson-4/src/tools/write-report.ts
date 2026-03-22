import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUTPUT_DIR } from "../config/env.js";
import { toSafeReportFilename } from "../utils/filenames.js";

export interface WriteReportArgs {
  filename: string;
  content: string;
}

export async function writeReport(args: WriteReportArgs): Promise<string> {
  const outputDir = path.resolve(process.cwd(), OUTPUT_DIR);
  await mkdir(outputDir, { recursive: true });

  const safeFileName = toSafeReportFilename(args.filename);
  const fullPath = path.join(outputDir, safeFileName);
  await writeFile(fullPath, args.content, "utf8");

  return `Report saved to ${path.relative(process.cwd(), fullPath)}`;
}
