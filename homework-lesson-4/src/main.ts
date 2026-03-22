import "dotenv/config";
import { createInitialMemory } from "./agent/memory.js";
import { runAgentTurn } from "./agent/run-agent.js";
import { MAX_ITERATIONS } from "./config/env.js";

async function main(): Promise<void> {
  const memory = createInitialMemory();
  const userInput =
    process.argv.slice(2).join(" ").trim() ||
    "Поясни різницю між naive RAG та sentence-window retrieval.";

  try {
    const response = await runAgentTurn({
      userInput,
      memory,
      maxIterations: MAX_ITERATIONS,
    });

    console.log(response.finalAnswer);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown application error.";
    console.error(`Application warning: ${message}`);
    console.error(
      "Next step: implement src/agent/llm-client.ts integration with your LLM provider.",
    );
  }
}

main();
