import { randomUUID } from "node:crypto";
import {
  buildQwenChatRequest,
  createBailianOpenAIClient,
  getOpenAIMessageText,
  getQwenMaxCompletionTokens,
  normalizeOpenAIError,
} from "@/lib/ai/server/bailian/openai";

type AgentPart = {
  text?: string;
  functionCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    id?: string;
    response: Record<string, unknown>;
  };
};

type AgentContent = {
  role: "user" | "model";
  parts: AgentPart[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonSchema(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === "type" && typeof raw === "string") {
      next[key] = raw.toLowerCase();
      continue;
    }
    next[key] = normalizeJsonSchema(raw);
  }
  return next;
}

function agentContentsToOpenAIMessages(contents: AgentContent[]) {
  const messages: Array<Record<string, unknown>> = [];

  for (const content of contents) {
    const parts = Array.isArray(content?.parts) ? content.parts : [];

    if (content.role === "model") {
      const text = parts
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
      const toolCalls = parts
        .filter((part) => part.functionCall && typeof part.functionCall.name === "string")
        .map((part) => ({
          id: String(part.functionCall?.id || randomUUID()),
          type: "function",
          function: {
            name: String(part.functionCall?.name),
            arguments: JSON.stringify(isPlainObject(part.functionCall?.args) ? part.functionCall?.args : {}),
          },
        }));

      if (text || toolCalls.length > 0) {
        const message: Record<string, unknown> = {
          role: "assistant",
          content: text || null,
        };
        if (toolCalls.length > 0) message.tool_calls = toolCalls;
        messages.push(message);
      }
      continue;
    }

    const functionResponses = parts.filter((part) => part.functionResponse);
    if (functionResponses.length > 0) {
      for (const part of functionResponses) {
        const response = part.functionResponse;
        messages.push({
          role: "tool",
          tool_call_id: String(response?.id || ""),
          content: JSON.stringify(response?.response ?? {}),
        });
      }
      const text = parts
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
      if (text) {
        messages.push({ role: "user", content: text });
      }
      continue;
    }

    const textPieces = parts
      .filter((part) => typeof part.text === "string" && part.text.trim())
      .map((part) => part.text as string);
    if (textPieces.length > 0) {
      messages.push({ role: "user", content: textPieces.join("\n") });
    }
  }

  return messages;
}

function agentToolsToOpenAITools(
  tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>
) {
  if (!Array.isArray(tools)) return undefined;
  const declarations = tools.flatMap((tool) => (Array.isArray(tool.functionDeclarations) ? tool.functionDeclarations : []));
  if (declarations.length === 0) return undefined;

  return declarations.map((decl) => ({
    type: "function",
    function: {
      name: String(decl.name),
      description: typeof decl.description === "string" ? decl.description : "",
      parameters: normalizeJsonSchema(
        (decl.parameters as Record<string, unknown>) || { type: "object", properties: {} }
      ),
    },
  }));
}

export async function callBailianAgent(input: {
  apiKey: string;
  model: string;
  contents: AgentContent[];
  tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>;
}) {
  const messages = agentContentsToOpenAIMessages(input.contents);
  const tools = agentToolsToOpenAITools(input.tools);
  const client = createBailianOpenAIClient();

  try {
    return (await client.chat.completions.create(
      buildQwenChatRequest({
        model: input.model,
        messages,
        stream: false,
        tools,
        maxCompletionTokens: getQwenMaxCompletionTokens(),
      }) as any
    )) as unknown as Record<string, unknown>;
  } catch (error) {
    const normalized = normalizeOpenAIError(error);
    if (normalized instanceof Error) {
      normalized.message = normalized.message.slice(0, 500);
    }
    throw normalized;
  }
}

export function extractBailianText(response: any) {
  return getOpenAIMessageText(response?.choices?.[0]?.message);
}

export function extractBailianFunctionCalls(response: any) {
  const toolCalls = response?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(toolCalls)) return [];

  return toolCalls
    .filter((toolCall: any) => toolCall?.type === "function" && typeof toolCall.function?.name === "string")
    .map((toolCall: any) => {
      const rawArgs = typeof toolCall.function?.arguments === "string" ? toolCall.function.arguments : "{}";
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(rawArgs);
        if (isPlainObject(parsed)) args = parsed;
      } catch {
        args = {};
      }
      return {
        id: String(toolCall.id || randomUUID()),
        name: String(toolCall.function.name),
        args,
      };
    });
}

export function extractModelContent(response: any): AgentContent {
  const message = response?.choices?.[0]?.message;
  const parts: AgentPart[] = [];
  const text = getOpenAIMessageText(message);
  if (text) {
    parts.push({ text });
  }

  const calls = extractBailianFunctionCalls(response);
  for (const call of calls) {
    parts.push({ functionCall: call });
  }

  return { role: "model", parts };
}

export function appendFunctionResults(input: {
  contents: AgentContent[];
  modelContent: AgentContent;
  results: Array<{
    id: string;
    name: string;
    result: Record<string, unknown>;
  }>;
}) {
  input.contents.push(input.modelContent);

  input.contents.push({
    role: "user",
    parts: input.results.map((result) => ({
      functionResponse: {
        name: result.name,
        id: result.id,
        response: {
          result: result.result,
        },
      },
    })),
  });
}
