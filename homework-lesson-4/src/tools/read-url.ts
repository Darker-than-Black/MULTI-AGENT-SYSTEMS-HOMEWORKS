export interface ReadUrlArgs {
  url: string;
}

export async function readUrl(args: ReadUrlArgs): Promise<string> {
  return `Mock content extracted from ${args.url}\n\nReplace with real HTTP fetch and extraction.`;
}
