import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createSessionMemory } from "./agent/memory.js";
import { runAgentTurn } from "./agent/run-agent.js";
import type { AgentMessage } from "./agent/types.js";
import { MAX_ITERATIONS } from "./config/env.js";
import { writeReport } from "./tools/write-report.js";
import { buildDatedReportFilename } from "./utils/filenames.js";

async function main(): Promise<void> {
  const sessionMemory = createSessionMemory();
  const cli = createInterface({ input, output });

  console.log("Research Agent CLI");
  console.log("Type your question, or 'exit'/'quit' to stop.\n");

  try {
    while (true) {
      const userInput = (await cli.question("You: ")).trim();

      if (!userInput) {
        continue;
      }

      const command = userInput.toLowerCase();
      if (["exit", "quit"].includes(command)) {
        break;
      }

      try {
        const previousLength = sessionMemory.messages.length;
        const response = await runAgentTurn({
          userInput,
          memory: sessionMemory.messages,
          maxIterations: MAX_ITERATIONS,
        });

        console.log(`Agent: ${response.finalAnswer}\n`);

        const turnMessages = sessionMemory.messages.slice(previousLength);
        if (!didWriteReportInTurn(turnMessages)) {
          const saveAnswer = (await cli.question(
            "Save this answer as markdown report? (y/N): ",
          ))
            .trim()
            .toLowerCase();

          if (["yes", "y"].includes(saveAnswer)) {
            const filenameInput = (
              await cli.question(
                "Optional filename suffix (default uses date only): ",
              )
            ).trim();
            const filename = buildDatedReportFilename(filenameInput);

            try {
              const saveResult = await writeReport({ filename, content: response.finalAnswer });
              console.log(`${saveResult}\n`);
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : "Unknown save error.";
              console.error(`Report save warning: ${message}\n`);
            }
          }
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown application error.";
        console.error(`Application warning: ${message}\n`);
      }
    }
  } finally {
    cli.close();
  }
}

function didWriteReportInTurn(messages: AgentMessage[]): boolean {
  return messages.some((message) => {
    if (message.role !== "tool" || message.name !== "write_report") {
      return false;
    }

    try {
      const payload = JSON.parse(message.content) as { ok?: unknown };
      return payload.ok === true;
    } catch {
      return false;
    }
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown fatal error.";
  console.error(`Application error: ${message}`);
  process.exitCode = 1;
});
