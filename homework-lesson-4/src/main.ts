import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createInitialMemory } from "./agent/memory.js";
import { runAgentTurn } from "./agent/run-agent.js";
import { MAX_ITERATIONS } from "./config/env.js";

async function main(): Promise<void> {
  const memory = createInitialMemory();
  const cli = createInterface({ input, output });

  console.log("Research Agent CLI");
  console.log("Type your question, or 'exit'/'quit' to stop.\n");

  async function chatLoop(): Promise<void> {
    const userInput = (await cli.question("You: ")).trim();
    if (!userInput) {
      return chatLoop();
    }

    if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
      cli.close();
      return;
    }

    try {
      const response = await runAgentTurn({
        userInput,
        memory,
        maxIterations: MAX_ITERATIONS,
      });

      console.log(`Agent: ${response.finalAnswer}\n`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown application error.";
      console.error(`Application warning: ${message}\n`);
    }

    return chatLoop();
  }

  await chatLoop();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown fatal error.";
  console.error(`Application error: ${message}`);
  process.exitCode = 1;
});
