import { z } from "zod";

const ResearchSourceSchema = z.enum(["knowledge_base", "web"]);

export const ResearchPlanSchema = z.object({
  goal: z.string().trim().min(1),
  searchQueries: z.array(z.string().trim().min(1)).min(1),
  sourcesToCheck: z.array(ResearchSourceSchema).min(1),
  outputFormat: z.string().trim().min(1),
});

export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;
