import { z } from "zod";
import { CritiqueResultSchema } from "../schemas/critique-result";
import { FindingsEnvelopeSchema } from "../schemas/findings-envelope";
import { ResearchPlanSchema } from "../schemas/research-plan";

const nonEmptyText = z.string().trim().min(1);

export const AcpAgentNameSchema = z.enum(["planner", "researcher", "critic"]);

export type AcpAgentName = z.infer<typeof AcpAgentNameSchema>;

export const PlannerRunInputSchema = z.object({
  userRequest: nonEmptyText,
});

export const ResearcherRunInputSchema = z.object({
  userRequest: nonEmptyText,
  plan: ResearchPlanSchema,
  critiqueFeedback: z.array(nonEmptyText).optional(),
});

export const CriticRunInputSchema = z.object({
  userRequest: nonEmptyText,
  findings: FindingsEnvelopeSchema,
  plan: ResearchPlanSchema,
});

export const AcpRunRequestSchema = z.object({
  agentName: AcpAgentNameSchema,
  input: z.unknown(),
});

export const AcpAgentDescriptorSchema = z.object({
  name: AcpAgentNameSchema,
  description: nonEmptyText,
  inputContract: nonEmptyText,
  outputContract: nonEmptyText,
});

export const AcpAgentsResponseSchema = z.object({
  agents: z.array(AcpAgentDescriptorSchema),
});

export const AcpRunResponseSchema = z.object({
  agentName: AcpAgentNameSchema,
  output: z.union([ResearchPlanSchema, FindingsEnvelopeSchema, CritiqueResultSchema]),
});

export type PlannerRunInput = z.infer<typeof PlannerRunInputSchema>;
export type ResearcherRunInput = z.infer<typeof ResearcherRunInputSchema>;
export type CriticRunInput = z.infer<typeof CriticRunInputSchema>;
export type AcpRunRequest = z.infer<typeof AcpRunRequestSchema>;
export type AcpAgentDescriptor = z.infer<typeof AcpAgentDescriptorSchema>;
export type AcpAgentsResponse = z.infer<typeof AcpAgentsResponseSchema>;
export type AcpRunResponse = z.infer<typeof AcpRunResponseSchema>;

export const ACP_AGENT_DESCRIPTORS: AcpAgentDescriptor[] = [
  {
    name: "planner",
    description: "Planner agent that turns a user request into a structured ResearchPlan.",
    inputContract: "{ userRequest: string }",
    outputContract: "ResearchPlan",
  },
  {
    name: "researcher",
    description: "Researcher agent that executes the plan and returns findings markdown in FindingsEnvelope.",
    inputContract: "{ userRequest: string, plan: ResearchPlan, critiqueFeedback?: string[] }",
    outputContract: "FindingsEnvelope",
  },
  {
    name: "critic",
    description: "Critic agent that reviews findings against the user request and the agreed plan.",
    inputContract: "{ userRequest: string, findings: FindingsEnvelope, plan: ResearchPlan }",
    outputContract: "CritiqueResult",
  },
];
