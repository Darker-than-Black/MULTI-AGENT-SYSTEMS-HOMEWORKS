import { z } from "zod";

export const ResearchPlanSchema = z.object({
  goal: z.string().describe("What we are trying to answer"),
  search_queries: z.array(z.string()).describe("Specific queries to execute"),
  sources_to_check: z.array(z.enum(["knowledge_base", "web"])).describe("'knowledge_base', 'web', or both"),
  output_format: z.string().describe("What the final report should look like"),
});

export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

export const CritiqueResultSchema = z.object({
  verdict: z.enum(["APPROVE", "REVISE"]).describe("Outcome of critique"),
  is_fresh: z.boolean().describe("Is the data up-to-date and based on recent sources?"),
  is_complete: z.boolean().describe("Does the research fully cover the user's original request?"),
  is_well_structured: z.boolean().describe("Are findings logically organized and ready for a report?"),
  strengths: z.array(z.string()).describe("What is good about the research"),
  gaps: z.array(z.string()).describe("What is missing, outdated, or poorly structured"),
  revision_requests: z.array(z.string()).describe("Specific things to fix if verdict is REVISE"),
});

export type CritiqueResult = z.infer<typeof CritiqueResultSchema>;
