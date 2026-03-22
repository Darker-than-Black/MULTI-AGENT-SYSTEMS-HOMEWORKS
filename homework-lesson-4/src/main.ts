import "dotenv/config";
import { createInitialMemory } from "./agent/memory.js";
import { runAgentTurn } from "./agent/run-agent.js";
import { MAX_ITERATIONS } from "./config/env.js";

async function main(): Promise<void> {
  const memory = createInitialMemory();
  const userInput =
    process.argv.slice(2).join(" ").trim() ||
    "Поясни різницю між naive RAG та sentence-window retrieval.";

  const response = await runAgentTurn({
    userInput,
    memory,
    maxIterations: MAX_ITERATIONS,
  });

  console.log(response.finalAnswer);
}

main().catch((error: unknown) => {
  console.error("Application error:", error);
  process.exitCode = 1;
});
