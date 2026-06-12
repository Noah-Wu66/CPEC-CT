import { randomUUID } from "node:crypto";
import {
  buildQwenResponsesRequest,
  createBailianOpenAIClient,
  getResponsesOutputItems,
  getResponsesOutputText,
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

function agentContentsToResponsesInput(contents: AgentContent[]) {
  const input: Array<Record<string, unknown>> = [];

  for (const content of contents) {
    const parts = Array.isArray(content?.parts) ? content.parts : [];

    if (content.role === "model") {
      const text = parts
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
      if (text) {
        input.push({
          role: "assistant",
          content: [{ type: "output_text", text }],
        });
      }
      for (const part of parts) {
        if (!part.functionCall || typeof part.functionCall.name !== "string") continue;
        input.push({
          type: "function_call",
          name: String(part.functionCall.name),
          arguments: JSON.stringify(isPlainObject(part.functionCall.args) ? part.functionCall.args : {}),
          call_id: String(part.functionCall.id || randomUUID()),
          status: "completed",
        });
      }
      continue;
    }

    const functionResponses = parts.filter((part) => part.functionResponse);
    if (functionResponses.length > 0) {
      for (const part of functionResponses) {
        const response = part.functionResponse;
        input.push({
          type: "function_call_output",
          call_id: String(response?.id || ""),
          output: JSON.stringify(response?.response ?? {}),
          status: "completed",
        });
      }
      const text = parts
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
      if (text) {
        input.push({ role: "user", content: text });
      }
      continue;
    }

    const textPieces = parts
      .filter((part) => typeof part.text === "string" && part.text.trim())
      .map((part) => part.text as string);
    if (textPieces.length > 0) {
      input.push({ role: "user", content: textPieces.join("\n") });
    }
  }

  return input;
}

function agentToolsToOpenAITools(
  tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>
) {
  if (!Array.isArray(tools)) return undefined;
  const declarations = tools.flatMap((tool) => (Array.isArray(tool.functionDeclarations) ? tool.functionDeclarations : []));
  if (declarations.length === 0) return undefined;

  return declarations.map((decl) => ({
    type: "function",
    name: String(decl.name),
    description: typeof decl.description === "string" ? decl.description : "",
    parameters: normalizeJsonSchema(
      (decl.parameters as Record<string, unknown>) || { type: "object", properties: {} }
    ),
  }));
}

export async function callBailianAgent(input: {
  apiKey: string;
  model: string;
  contents: AgentContent[];
  tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>;
}) {
  const responseInput = agentContentsToResponsesInput(input.contents);
  const tools = agentToolsToOpenAITools(input.tools);
  const client = createBailianOpenAIClient();

  try {
    return (await client.responses.create(
      buildQwenResponsesRequest({
        model: input.model,
        input: responseInput,
        stream: false,
        tools,
        reasoningEffort: "high",
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
  return getResponsesOutputText(response);
}

export function extractBailianFunctionCalls(response: any) {
  return getResponsesOutputItems(response)
    .filter((item: any) => item?.type === "function_call" && typeof item.name === "string")
    .map((item: any) => {
      const rawArgs = typeof item.arguments === "string" ? item.arguments : "{}";
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(rawArgs);
        if (isPlainObject(parsed)) args = parsed;
      } catch {
        args = {};
      }
      return {
        id: String(item.call_id || item.id || randomUUID()),
        name: String(item.name),
        args,
      };
    });
}

export function extractModelContent(response: any): AgentContent {
  const parts: AgentPart[] = [];
  const text = getResponsesOutputText(response);
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
  const textParts = input.modelContent.parts.filter((part) => typeof part.text === "string" && part.text);
  if (textParts.length > 0) {
    input.contents.push({ role: "model", parts: textParts });
  }

  const calls = input.modelContent.parts.filter((part) => part.functionCall);
  for (const result of input.results) {
    const callPart = calls.find((part) => part.functionCall?.id === result.id && part.functionCall?.name === result.name);
    if (callPart) {
      input.contents.push({ role: "model", parts: [callPart] });
    }

    input.contents.push({
      role: "user",
      parts: [{
        functionResponse: {
          name: result.name,
          id: result.id,
          response: {
            result: result.result,
          },
        },
      }],
    });
  }
}
