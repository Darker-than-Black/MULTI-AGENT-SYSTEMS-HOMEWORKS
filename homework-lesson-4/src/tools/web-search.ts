export interface WebSearchArgs {
  query: string;
}

export async function webSearch(args: WebSearchArgs): Promise<string> {
  const mockResults = [
    {
      title: `Mock result for "${args.query}"`,
      url: "https://example.com/mock-result",
      snippet: "Placeholder search result. Replace with real provider later.",
    },
  ];

  return JSON.stringify(mockResults, null, 2);
}
