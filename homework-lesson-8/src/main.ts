import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createSessionMemory } from "./agent/memory";
import { runAgentTurn } from "./agent/run-agent";
import { MAX_ITERATIONS } from "./config/env";
import { writeReport } from "./tools/write-report";
import { buildDatedReportFilename } from "./utils/filenames";
import {
  logAgentAnswer,
  logAgentProcessing,
  logCliHeader,
  logProgressEvent,
} from "./utils/logger";

async function main(): Promise<void> {
  const sessionMemory = createSessionMemory();
  const cli = createInterface({ input, output });

  logCliHeader();

  try {
    while (true) {
      const rawUserInput = await askQuestion(cli, "You: ");
      if (rawUserInput === null) {
        break;
      }

      const userInput = rawUserInput.trim();

      if (!userInput) {
        continue;
      }

      const command = userInput.toLowerCase();
      if (["exit", "quit"].includes(command)) {
        break;
      }

      try {
        logAgentProcessing();
        const response = await runAgentTurn({
          userInput,
          memory: sessionMemory.messages,
          maxIterations: MAX_ITERATIONS,
          onProgress: logProgressEvent,
        });

        logAgentAnswer(response.finalAnswer);

        if (!response.wroteReport) {
          const rawSaveAnswer = await askQuestion(
            cli,
            "Save this answer as markdown report? (y/N): ",
          );
          if (rawSaveAnswer === null) {
            break;
          }
          const saveAnswer = rawSaveAnswer.trim().toLowerCase();

          if (["yes", "y"].includes(saveAnswer)) {
            const rawFilenameInput = await askQuestion(
              cli,
              "Optional filename suffix (default uses date only): ",
            );
            if (rawFilenameInput === null) {
              break;
            }
            const filenameInput = rawFilenameInput.trim();
            const filename = buildDatedReportFilename(filenameInput);

            try {
              const saveResult = await writeReport({ filename, content: response.finalAnswer });
              console.log(`${saveResult}\n`);
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : "Unknown save error.";
              console.error(`Report save warning: ${message}\n`);
            }
          } else {
            console.log("Skipped report save.\n");
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown fatal error.";
  console.error(`Application error: ${message}`);
  process.exitCode = 1;
});

async function askQuestion(
  cli: ReturnType<typeof createInterface>,
  prompt: string,
): Promise<string | null> {
  try {
    return await cli.question(prompt);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.toLowerCase().includes("readline was closed")) {
      return null;
    }
    throw error;
  }
}
