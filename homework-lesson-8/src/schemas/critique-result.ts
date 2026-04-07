import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

export const CritiqueVerdictSchema = z.enum(["APPROVE", "REVISE"]);

export const CritiqueResultSchema = z
  .object({
    verdict: CritiqueVerdictSchema,
    isFresh: z.boolean(),
    isComplete: z.boolean(),
    isWellStructured: z.boolean(),
    strengths: z.array(nonEmptyText),
    gaps: z.array(nonEmptyText),
    revisionRequests: z.array(nonEmptyText),
  })
  .superRefine((value, context) => {
    if (value.verdict === "REVISE" && value.revisionRequests.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["revisionRequests"],
        message: "revisionRequests must contain at least one item when verdict is REVISE.",
      });
    }

    if (value.verdict === "APPROVE" && value.revisionRequests.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["revisionRequests"],
        message: "revisionRequests must be empty when verdict is APPROVE.",
      });
    }
  });

export type CritiqueVerdict = z.infer<typeof CritiqueVerdictSchema>;
export type CritiqueResult = z.infer<typeof CritiqueResultSchema>;
