import { ToolInputError } from "./errors.js";

export function requireStringArg(
  toolName: string,
  args: Record<string, unknown>,
  key: string,
  options?: { maxLength?: number; pattern?: RegExp },
): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new ToolInputError(
      `${toolName}: "${key}" must be a string.`,
    );
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new ToolInputError(
      `${toolName}: "${key}" cannot be empty.`,
    );
  }

  if (options?.maxLength && normalized.length > options.maxLength) {
    throw new ToolInputError(
      `${toolName}: "${key}" exceeds ${options.maxLength} characters.`,
    );
  }

  if (options?.pattern && !options.pattern.test(normalized)) {
    throw new ToolInputError(
      `${toolName}: "${key}" has invalid format.`,
    );
  }

  return normalized;
}
