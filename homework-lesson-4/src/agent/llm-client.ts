import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai";
import { MODEL_NAME, OPENAI_API_KEY } from "../config/env.js";
import { toolSchemas } from "../tools/schemas.js";
import { adaptProviderAssistantMessage } from "./llm-adapter.js";
import type { AgentMessage, LlmTurnResult } from "./types.js";

export interface LlmRequest {
  messages: AgentMessage[];
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export async function requestLlmTurn(input: LlmRequest): Promise<LlmTurnResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Configure .env before running agent.");
  }

  if (input.messages.length === 0) {
    throw new Error("LLM request requires at least one message.");
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: toOpenAiMessages(input.messages),
      tools: toolSchemas,
      tool_choice: "auto",
      temperature: 0.2,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error("Invalid provider response: choices[0].message is missing.");
    }

    return adaptProviderAssistantMessage(message);
  } catch (error: unknown) {
    throw mapLlmError(error);
  }
}

function toOpenAiMessages(messages: AgentMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "system") {
      return { role: "system", content: message.content } satisfies ChatCompletionMessageParam;
    }

    if (message.role === "user") {
      return { role: "user", content: message.content } satisfies ChatCompletionMessageParam;
    }

    if (message.role === "assistant") {
      if (message?.toolCalls?.length) {
        return {
          role: "assistant",
          content: message.content || "",
          tool_calls: message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          })),
        } satisfies ChatCompletionMessageParam;
      }

      return {
        role: "assistant",
        content: message.content,
      } satisfies ChatCompletionMessageParam;
    }

    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    } satisfies ChatCompletionMessageParam;
  });
}

function mapLlmError(error: unknown): Error {
  if (error instanceof RateLimitError) {
    return new Error(
      "LLM API rate limit reached (429). Please retry shortly or reduce request frequency.",
    );
  }

  if (error instanceof APIConnectionTimeoutError) {
    return new Error("LLM API request timed out. Please retry.");
  }

  if (error instanceof APIConnectionError) {
    return new Error("LLM API network error. Check internet connection and retry.");
  }

  if (error instanceof APIError) {
    const status = typeof error.status === "number" ? error.status : "unknown";
    return new Error(`LLM API error (${status}): ${error.message}`);
  }

  if (error instanceof Error) {
    if (error.message.startsWith("Invalid provider response:")) {
      return new Error(error.message);
    }
    return new Error(`LLM client failure: ${error.message}`);
  }

  return new Error("LLM client failure: unknown error.");
}
