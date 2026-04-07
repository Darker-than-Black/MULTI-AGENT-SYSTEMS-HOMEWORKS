import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { supervisorAgent } from "./supervisor.js";

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

async function main(): Promise<void> {
  const cli = createInterface({ input, output });
  const thread_id = randomUUID();
  const config = { configurable: { thread_id } };

  console.log("=========================================");
  console.log("🤖 Multi-Agent Supervisor (hw-8) Started");
  console.log("=========================================\n");

  try {
    while (true) {
      const rawUserInput = await askQuestion(cli, "\nYou: ");
      if (rawUserInput === null) break;
      const userInput = rawUserInput.trim();
      if (!userInput) continue;
      if (["exit", "quit"].includes(userInput.toLowerCase())) break;

      let isInvoking = true;
      let currentStateInput: any = { messages: [{ role: "user", content: userInput }] };

      while (isInvoking) {
        console.log("⏳ Processing graph...");
        
        // This will block until completion or interrupt
        const result = await supervisorAgent.invoke(currentStateInput, config);

        // LangGraph persists the state. We check if there are pending tasks (interrupts)
        const state = await supervisorAgent.getState(config);
        
        if (state.next && state.next.length > 0 && state.tasks && state.tasks.find((t: any) => t.interrupts && t.interrupts.length > 0)) {
          // Find the active interrupt
          const task = state.tasks.find((t: any) => t.interrupts && t.interrupts.length > 0);
          if (!task) {
            isInvoking = false;
            break;
          }
          const interruptValue = task.interrupts[0].value;
          
          if (interruptValue?.type === "save_report") {
            console.log("\n============================================================");
            console.log("⏸️  ACTION REQUIRES APPROVAL (HITL)");
            console.log("============================================================");
            console.log(`Tool: save_report`);
            console.log(`Args: ${JSON.stringify(interruptValue.args, null, 2)}\n`);

            const action = await askQuestion(cli, "👉 approve / edit / reject: ");
            if (action === null) break;

            const decisionType = action.trim().toLowerCase();

            if (decisionType === "edit") {
              const feedback = await askQuestion(cli, "✏️  Your feedback: ");
              currentStateInput = new Command({ 
                resume: { decisions: [{ type: "edit", edited_action: { feedback } }] } 
              });
            } else if (decisionType === "reject") {
              currentStateInput = new Command({ 
                resume: { decisions: [{ type: "reject" }] } 
              });
            } else {
              // Default approve
              currentStateInput = new Command({ 
                resume: { decisions: [{ type: "approve" }] } 
              });
            }
          } else {
            // General resume for unknown interrupts
            currentStateInput = new Command({ resume: null });
          }
        } else {
          // Finished flow
          isInvoking = false;
          const lastMessage = result.messages[result.messages.length - 1];
          console.log(`\nAgent: ${lastMessage.content}`);
        }
      }
    }
  } finally {
    cli.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Application error: ${message}`);
  process.exitCode = 1;
});
