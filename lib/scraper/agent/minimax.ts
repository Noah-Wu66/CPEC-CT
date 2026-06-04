import { randomUUID } from "node:crypto";
import {
  MINIMAX_ANTHROPIC_MESSAGES_PATH,
  buildMinimaxThinking,
  createMinimaxAnthropicHeaders,
  getAnthropicTextFromContent,
  getMinimaxMaxTokens,
  normalizeAnthropicJsonSchema,
  readAnthropicErrorMessage
} from "@/lib/ai/server/minimax/anthropic";

// 通过 MiniMax Anthropic 兼容接口调用 MiniMax-M3 驱动数据采集智能体。
// 工具调用轮次会完整回传 assistant content，保留 thinking/text/tool_use 上下文。

type AnthropicContentBlock = Record<string, any>;

type AgentPart = {
  text?: string;
  rawBlock?: AnthropicContentBlock;
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

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

function getBaseUrl() {
  return "https://api.minimaxi.com/anthropic/v1";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringifyToolResult(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function agentContentsToAnthropicMessages(contents: AgentContent[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  for (const content of contents) {
    const parts = Array.isArray(content?.parts) ? content.parts : [];

    if (content.role === "model") {
      const blocks: AnthropicContentBlock[] = [];
      for (const part of parts) {
        if (part.rawBlock && typeof part.rawBlock === "object") {
          blocks.push(part.rawBlock);
          continue;
        }
        if (typeof part.text === "string" && part.text.trim()) {
          blocks.push({ type: "text", text: part.text });
        }
        if (part.functionCall && typeof part.functionCall.name === "string") {
          blocks.push({
            type: "tool_use",
            id: String(part.functionCall.id || randomUUID()),
            name: part.functionCall.name,
            input: isPlainObject(part.functionCall.args) ? part.functionCall.args : {}
          });
        }
      }
      if (blocks.length > 0) {
        messages.push({ role: "assistant", content: blocks });
      }
      continue;
    }

    const functionResponses = parts.filter((p) => p.functionResponse);
    if (functionResponses.length > 0) {
      const blocks: AnthropicContentBlock[] = [];
      for (const part of functionResponses) {
        const fr = part.functionResponse!;
        blocks.push({
          type: "tool_result",
          tool_use_id: String(fr.id || ""),
          content: stringifyToolResult(fr.response ?? {})
        });
      }
      for (const part of parts) {
        if (typeof part.text === "string" && part.text.trim()) {
          blocks.push({ type: "text", text: part.text });
        }
      }
      messages.push({ role: "user", content: blocks });
      continue;
    }

    const textPieces = parts.filter((p) => typeof p.text === "string" && p.text.trim()).map((p) => p.text as string);
    if (textPieces.length > 0) {
      messages.push({ role: "user", content: textPieces.join("\n") });
    }
  }

  return messages;
}

function agentToolsToAnthropicTools(
  tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>
) {
  if (!Array.isArray(tools)) return undefined;
  const declarations = tools.flatMap((t) => (Array.isArray(t.functionDeclarations) ? t.functionDeclarations : []));
  if (declarations.length === 0) return undefined;

  return declarations.map((decl) => ({
    name: String(decl.name),
    description: typeof decl.description === "string" ? decl.description : "",
    input_schema: normalizeAnthropicJsonSchema(
      (decl.parameters as Record<string, unknown>) || { type: "object", properties: {} }
    )
  }));
}

export async function callMinimaxAgent(input: {
  apiKey: string;
  model: string;
  contents: AgentContent[];
  tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>;
  generationConfig?: Record<string, unknown>;
  toolConfig?: Record<string, unknown>;
}) {
  const messages = agentContentsToAnthropicMessages(input.contents);
  const tools = agentToolsToAnthropicTools(input.tools);
  const temperature = (input.generationConfig as { temperature?: number } | undefined)?.temperature;

  const requestBody: Record<string, unknown> = {
    model: input.model,
    messages,
    max_tokens: getMinimaxMaxTokens(),
    thinking: buildMinimaxThinking(),
    temperature: typeof temperature === "number" ? temperature : 1
  };
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }

  const response = await fetch(`${getBaseUrl()}${MINIMAX_ANTHROPIC_MESSAGES_PATH}`, {
    method: "POST",
    headers: createMinimaxAnthropicHeaders(input.apiKey),
    body: JSON.stringify(requestBody)
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    throw new Error(String(readAnthropicErrorMessage(data, response.status)).slice(0, 500));
  }

  return data;
}

export function extractMinimaxText(response: any) {
  return getAnthropicTextFromContent(response?.content);
}

export function extractMinimaxFunctionCalls(response: any) {
  const content = response?.content;
  if (!Array.isArray(content)) return [];

  return content
    .filter((block: any) => block?.type === "tool_use" && typeof block.name === "string")
    .map((block: any) => ({
      id: String(block.id || randomUUID()),
      name: String(block.name),
      args: isPlainObject(block.input) ? block.input : {}
    }));
}

export function extractModelContent(response: any): AgentContent {
  const content = response?.content;
  const parts: AgentPart[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === "object") {
        parts.push({ rawBlock: block });
      }
    }
  }

  if (parts.length === 0) {
    const text = getAnthropicTextFromContent(content);
    if (text) {
      parts.push({ text });
    }
  }

  return { role: "model", parts };
}

export function appendFunctionResults(input: {
  contents: AgentContent[];
  modelContent: any;
  results: Array<{
    id: string;
    name: string;
    result: Record<string, unknown>;
  }>;
}) {
  input.contents.push(input.modelContent);

  input.contents.push({
    role: "user",
    parts: input.results.map((r) => ({
      functionResponse: {
        name: r.name,
        id: r.id,
        response: {
          result: r.result
        }
      }
    }))
  });
}
