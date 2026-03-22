const SAFE_CHARS_REGEX = /[^a-zA-Z0-9._-]+/g;

export function toSafeReportFilename(input: string): string {
  const normalized = input.trim().replace(SAFE_CHARS_REGEX, "_");
  const withExtension = normalized.endsWith(".md")
    ? normalized
    : `${normalized}.md`;

  return withExtension || "report.md";
}
