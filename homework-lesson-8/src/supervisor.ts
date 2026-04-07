import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver, interrupt } from "@langchain/langgraph";
import { MODEL_NAME, TEMPERATURE, OPENAI_API_KEY } from "./config/env.js";

import { planTool } from "./agents/planner.js";
import { researchTool } from "./agents/research.js";
import { critiqueTool } from "./agents/critic.js";
import { writeReport } from "./tools/write-report.js";

const llm = new ChatOpenAI({
  model: MODEL_NAME,
  temperature: TEMPERATURE,
  apiKey: OPENAI_API_KEY,
});

export const saveReportTool = tool(
  async (input, config) => {
    // Interrupt execution to await user approval.
    // The payload emitted to the outside is the tool input so the user can see it.
    const userDecision = interrupt({
      type: "save_report",
      args: input
    }) as any;

    const decision = userDecision?.decisions?.[0];

    if (decision?.type === "approve") {
      return await writeReport(input);
    } else if (decision?.type === "edit") {
      return `USER FEEDBACK (REVISE REPORT): ${decision.edited_action?.feedback}`;
    } else if (decision?.type === "reject") {
      return "User rejected the report. Stop the process.";
    }

    return "Unknown decision.";
  },
  {
    name: "save_report",
    description: "Save a generated markdown report. Requires human-in-the-loop approval.",
    schema: z.object({
      filename: z.string().describe("Name of the file to save (e.g. report.md)"),
      content: z.string().describe("Markdown content of the report"),
    }),
  }
);

const supervisorPrompt = `You are a Supervisor Agent orchestrating a research team.
Follow this strict pattern:
1. Call 'plan' to decompose the user's request.
2. Call 'research' using the generated plan.
3. Call 'critique' to evaluate the findings from the research.
4. If the critique verdict is "REVISE", call 'research' again with the specific feedback to improve it (maximum 2 rounds of revision).
5. If the critique verdict is "APPROVE", create the final markdown report content and call 'save_report'.
6. If 'save_report' returns user feedback requesting revisions, incorporate the feedback and try again.

Ensure all markdown reports are comprehensive and well structured.`;

export const supervisorAgent = createReactAgent({
  llm,
  tools: [planTool, researchTool, critiqueTool, saveReportTool],
  stateModifier: supervisorPrompt,
  checkpointSaver: new MemorySaver(), // Important for interrupt/resume functionality
});
