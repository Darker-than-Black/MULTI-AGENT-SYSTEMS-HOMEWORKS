const SAFE_CHARS_REGEX = /[^a-zA-Z0-9._-]+/g;

export function toSafeReportFilename(input: string): string {
  const normalized = input.trim().replace(SAFE_CHARS_REGEX, "_");
  const withExtension = normalized.endsWith(".md")
    ? normalized
    : `${normalized}.md`;

  return withExtension || "report.md";
}

export function buildDatedReportFilename(optionalUserFilename: string): string {
  const datePrefix = buildTimestampPrefix(new Date());
  const userPart = normalizeUserFilename(optionalUserFilename);

  if (!userPart) {
    return `${datePrefix}.md`;
  }

  return toSafeReportFilename(`${datePrefix}-${userPart}`);
}

function buildTimestampPrefix(date: Date): string {
  return date.toJSON().replace("T", "_").replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
}

function normalizeUserFilename(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const sanitized = trimmed.replace(SAFE_CHARS_REGEX, "_");
  return sanitized.replace(/\.md$/i, "").replace(/^[-_.]+|[-_.]+$/g, "");
}
