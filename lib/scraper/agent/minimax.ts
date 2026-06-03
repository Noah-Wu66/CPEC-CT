import { randomUUID } from "node:crypto";

// 通过 MiniMax 官方国内版平台调用 MiniMax-M3 驱动数据采集智能体。
// 内部使用统一的智能体消息结构，再转换为 MiniMax chat-completions 请求。

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

type MinimaxToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type MinimaxMessage =
  | { role: "system" | "user" | "assistant"; content: string; tool_calls?: MinimaxToolCall[] }
  | { role: "assistant"; content: string | null; tool_calls?: MinimaxToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

function getBaseUrl() {
  return "https://api.minimaxi.com/v1";
}

function agentContentsToMinimaxMessages(contents: AgentContent[]): MinimaxMessage[] {
  const messages: MinimaxMessage[] = [];

  for (const content of contents) {
    const parts = Array.isArray(content?.parts) ? content.parts : [];

    if (content.role === "model") {
      const textPieces: string[] = [];
      const toolCalls: MinimaxToolCall[] = [];
      for (const part of parts) {
        if (typeof part.text === "string" && part.text.trim()) {
          textPieces.push(part.text);
        }
        if (part.functionCall && typeof part.functionCall.name === "string") {
          toolCalls.push({
            id: String(part.functionCall.id || randomUUID()),
            type: "function",
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          });
        }
      }
      const assistantMsg: MinimaxMessage = {
        role: "assistant",
        content: textPieces.join("\n") || null,
      };
      if (toolCalls.length > 0) {
        (assistantMsg as { tool_calls?: MinimaxToolCall[] }).tool_calls = toolCalls;
      }
      messages.push(assistantMsg);
      continue;
    }

    // role === "user"：可能是普通文本，也可能是函数执行结果
    const functionResponses = parts.filter((p) => p.functionResponse);
    if (functionResponses.length > 0) {
      for (const part of functionResponses) {
        const fr = part.functionResponse!;
        messages.push({
          role: "tool",
          tool_call_id: String(fr.id || ""),
          name: fr.name,
          content: JSON.stringify(fr.response ?? {}),
        });
      }
      // 同一条 user content 里若还混有文本，也带上
      const textPieces = parts.filter((p) => typeof p.text === "string" && p.text!.trim()).map((p) => p.text as string);
      if (textPieces.length > 0) {
        messages.push({ role: "user", content: textPieces.join("\n") });
      }
      continue;
    }

    const textPieces = parts.filter((p) => typeof p.text === "string" && p.text!.trim()).map((p) => p.text as string);
    if (textPieces.length > 0) {
      messages.push({ role: "user", content: textPieces.join("\n") });
    }
  }

  return messages;
}

function agentToolsToMinimaxTools(
  tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>
) {
  if (!Array.isArray(tools)) return undefined;
  const declarations = tools.flatMap((t) => (Array.isArray(t.functionDeclarations) ? t.functionDeclarations : []));
  if (declarations.length === 0) return undefined;
  return declarations.map((decl) => ({
    type: "function" as const,
    function: {
      name: String(decl.name),
      description: typeof decl.description === "string" ? decl.description : "",
      parameters: (decl.parameters as Record<string, unknown>) || { type: "object", properties: {} },
    },
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
  const messages = agentContentsToMinimaxMessages(input.contents);
  const tools = agentToolsToMinimaxTools(input.tools);

  const requestBody: Record<string, unknown> = {
    model: input.model,
    messages,
    // 默认自适应思考（官方推荐）
    thinking: { type: "adaptive" },
    max_completion_tokens: 8192,
    top_p: 0.95,
  };
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = "auto";
  }
  const temperature = (input.generationConfig as { temperature?: number } | undefined)?.temperature;
  requestBody.temperature = typeof temperature === "number" ? temperature : 1;

  const response = await fetch(`${getBaseUrl()}/text/chatcompletion_v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const message =
      (typeof data === "object" && data && ((data as any).error?.message || (data as any).message)) ||
      (typeof data === "string" ? data : "") ||
      `MiniMax 官方请求失败 (${response.status})`;
    throw new Error(String(message).slice(0, 500));
  }

  return data;
}

export function extractMinimaxText(response: any) {
  const message = response?.choices?.[0]?.message;
  const content = message?.content;
  if (Array.isArray(content)) {
    return content.map((part: any) => (typeof part === "string" ? part : part?.text || "")).join("").trim();
  }
  return typeof content === "string" ? content.trim() : "";
}

export function extractMinimaxFunctionCalls(response: any) {
  const toolCalls = response?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .filter((tc: any) => tc?.function && typeof tc.function.name === "string")
    .map((tc: any) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function.arguments || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
      return {
        id: String(tc.id || randomUUID()),
        name: String(tc.function.name),
        args,
      };
    });
}

export function extractModelContent(response: any): AgentContent {
  const message = response?.choices?.[0]?.message;
  const parts: AgentPart[] = [];

  const content = message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: any) => p?.text || "").join("") : "";
  if (text && text.trim()) {
    parts.push({ text });
  }

  const toolCalls = message?.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      if (!tc?.function?.name) continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
      parts.push({
        functionCall: {
          id: String(tc.id || randomUUID()),
          name: String(tc.function.name),
          args,
        },
      });
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
          result: r.result,
        },
      },
    })),
  });
}
