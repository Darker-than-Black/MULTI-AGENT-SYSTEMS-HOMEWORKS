import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

export const FindingsEnvelopeSchema = z.object({
  markdown: nonEmptyText,
});

export type FindingsEnvelope = z.infer<typeof FindingsEnvelopeSchema>;
