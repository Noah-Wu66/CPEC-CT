import {
  buildPagePayload,
  normalizeUrlArray,
  pickBestTitle,
  pickBestUrl
} from "@/lib/scraper/source-runners/helpers";
import { getScraperModelEnv } from "@/lib/scraper/env";
import { appendFunctionResults, callBailianAgent, extractBailianFunctionCalls, extractBailianText, extractModelContent } from "@/lib/scraper/agent/bailian";
import { getScraperSkillKeyByToolName, getScraperSkillPromptLines, getScraperToolDeclarations } from "@/lib/scraper/skills/registry";
import { runCrawl, runMap, runScrape, runSearch } from "@/lib/scraper/source-runners/xcrawl";
import { formatScraperSkillKey, SCRAPER_OUTPUT_FORMATS, SCRAPER_SKILL_KEYS, type ScraperRunDoc, type ScraperSkillKey, type ScraperSourceDoc } from "@/lib/scraper/types";
import { safeJsonParse } from "@/lib/scraper/utils";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function parseJsonText(value: unknown) {
  const raw = text(value);
  if (!raw) {
    return undefined;
  }

  const parsed = safeJsonParse<Record<string, unknown> | null>(raw, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON Schema 字符串不是合法对象");
  }

  return parsed;
}

function normalizeEnabledSkills(config: Record<string, unknown>) {
  const raw = Array.isArray(config.enabledSkills) ? config.enabledSkills : [];
  const enabled = raw
    .map((item) => String(item) as ScraperSkillKey)
    .filter((item) => SCRAPER_SKILL_KEYS.includes(item));

  return enabled.length > 0 ? enabled : [...SCRAPER_SKILL_KEYS];
}

function normalizeConstraints(config: Record<string, unknown>) {
  const raw =
    config.constraints && typeof config.constraints === "object" && !Array.isArray(config.constraints)
      ? (config.constraints as Record<string, unknown>)
      : {};

  return {
    maxToolCalls: numberValue(raw.maxToolCalls, 50),
    allowAsync: booleanValue(raw.allowAsync, true)
  };
}

function buildAgentPrompt(source: ScraperSourceDoc) {
  const config = (source.config || {}) as Record<string, unknown>;
  const goal = text(config.goal);
  if (!goal) {
    throw new Error("请先为采集任务设定目标");
  }

  const enabledSkills = normalizeEnabledSkills(config);
  const constraints = normalizeConstraints(config);
  const defaultInputs =
    config.defaultInputs && typeof config.defaultInputs === "object" && !Array.isArray(config.defaultInputs)
      ? (config.defaultInputs as Record<string, unknown>)
      : {};

  return {
    enabledSkills,
    constraints,
    prompt: [
      "你是 CPEC 的网页采集代理，需要通过 XCrawl Skills 完成网页发现、抓取和入库。",
      "你必须严格按技能边界选工具，不要把 Search、Map、Scrape、Crawl 混着解释。",
      "技能路由规则：",
      ...getScraperSkillPromptLines(enabledSkills),
      "执行规则：",
      constraints.allowAsync
        ? "- 允许使用 crawl 或 async scrape；系统会自动轮询 XCrawl 结果，不需要额外回调配置。"
        : "- 本次禁止使用 crawl 或 async scrape，只能使用同步 search / map / scrape。",
      `- 本次最大工具调用步数：${constraints.maxToolCalls}。系统会在每次请求时告知你剩余步数。`,
      "- 当剩余步数 ≤ 2 时，你应当停止调用新工具，立即根据已获取的结果整理并输出最终中文结论。",
      "- 如果已经获得足够结果，就停止继续调工具，直接输出中文结论。",
      "- 除非目标明确要求大范围站点批量抓取，否则不要动用 crawl。",
      "",
      `任务名称：${source.name}`,
      `任务目标：${goal}`,
      `默认输入：${JSON.stringify(defaultInputs)}`,
      `约束：${JSON.stringify(config.constraints || {})}`,
      "",
      "最终答复要求：用中文说明用了哪些 skill、做了什么、拿到了什么、结果是否已写入结果库。"
    ].join("\n")
  };
}

function buildToolSource(source: ScraperSourceDoc, config: Record<string, unknown>): ScraperSourceDoc {
  return {
    ...source,
    config
  };
}

function summarizeDiscoveryResponse(payload: any) {
  return normalizeUrlArray(payload)
    .slice(0, 6)
    .map((item: any) => ({
      title: typeof item === "string" ? item : pickBestTitle(item, ""),
      url: typeof item === "string" ? item : pickBestUrl(item)
    }))
    .filter((item) => item.url);
}

function summarizeScrapeResponse(payload: any) {
  const page = buildPagePayload(payload?.data || {});
  const outputFormats = [
    page.markdown ? "markdown" : "",
    page.html ? "html" : "",
    page.rawHtml ? "raw_html" : "",
    page.summary ? "summary" : "",
    page.links.length > 0 ? "links" : "",
    page.extractedJson ? "json" : "",
    page.screenshot ? "screenshot" : ""
  ].filter(Boolean);

  return {
    final_url: payload?.url || page.finalUrl || "",
    title: typeof page.metadata.title === "string" ? page.metadata.title : "",
    summary: page.summary || "",
    json: page.extractedJson || null,
    status_code: page.statusCode,
    output_formats: outputFormats,
    markdown_preview: page.markdown ? String(page.markdown).slice(0, 1200) : ""
  };
}

async function executeAgentTool(input: {
  source: ScraperSourceDoc;
  run: ScraperRunDoc;
  toolName: string;
  args: Record<string, unknown>;
  allowAsync: boolean;
}) {
  const skillKey = getScraperSkillKeyByToolName(input.toolName);
  if (!skillKey) {
    throw new Error("采集过程中遇到无法识别的操作，请稍后重试");
  }

  if ((input.toolName === "xcrawl_crawl" || text(input.args.mode) === "async") && !input.allowAsync) {
    return {
      skillKey,
      requestPayload: input.args,
      responsePayload: { blocked: true },
      modelResult: {
        ok: false,
        error: "当前任务限制禁止 crawl 或 async scrape，请改用同步 search / map / scrape。"
      }
    };
  }

  switch (input.toolName) {
    case "xcrawl_search": {
      const requestConfig = {
        query: text(input.args.query),
        location: text(input.args.location) || "CN",
        language: text(input.args.language) || "zh",
        limit: numberValue(input.args.limit, 10),
        advancedParams: {}
      };
      const result = await runSearch(buildToolSource(input.source, requestConfig), input.run);
      return {
        skillKey,
        requestPayload: result.requestPayload,
        responsePayload: result.responsePayload,
        modelResult: {
          ok: true,
          skill: formatScraperSkillKey(skillKey),
          records_stored: result.stats?.total ?? 0,
          items: summarizeDiscoveryResponse(result.responsePayload)
        }
      };
    }
    case "xcrawl_map": {
      const requestConfig = {
        url: text(input.args.url),
        filter: text(input.args.filter),
        limit: numberValue(input.args.limit, 500),
        includeSubdomains: booleanValue(input.args.include_subdomains, false),
        ignoreQueryParameters: booleanValue(input.args.ignore_query_parameters, true),
        advancedParams: {}
      };
      const result = await runMap(buildToolSource(input.source, requestConfig), input.run);
      return {
        skillKey,
        requestPayload: result.requestPayload,
        responsePayload: result.responsePayload,
        modelResult: {
          ok: true,
          skill: formatScraperSkillKey(skillKey),
          records_stored: result.stats?.total ?? 0,
          items: summarizeDiscoveryResponse(result.responsePayload)
        }
      };
    }
    case "xcrawl":
    case "xcrawl_scrape": {
      const requestConfig = {
        url: text(input.args.url),
        deliveryMode: text(input.args.mode) === "async" ? "async" : "sync",
        device: text(input.args.device) || "desktop",
        locale: text(input.args.locale) || "zh-CN,zh;q=0.9",
        waitUntil: text(input.args.wait_until) || "networkidle",
        formats: stringArray(input.args.formats).filter((item) => SCRAPER_OUTPUT_FORMATS.includes(item as any)),
        jsonPrompt: text(input.args.json_prompt),
        jsonSchema: parseJsonText(input.args.json_schema_text),
        proxyLocation: text(input.args.proxy_location),
        stickySession: text(input.args.sticky_session),
        advancedParams: {}
      };
      const result = await runScrape(buildToolSource(input.source, requestConfig), input.run);
      const scrapePayload =
        result.responsePayload && typeof result.responsePayload === "object" && "result" in result.responsePayload
          ? (result.responsePayload.result as Record<string, unknown>)
          : (result.responsePayload as Record<string, unknown>);

      return {
        skillKey,
        requestPayload: result.requestPayload,
        responsePayload: result.responsePayload,
        modelResult: {
          ok: true,
          skill: formatScraperSkillKey(skillKey),
          records_stored: result.stats?.total ?? 0,
          task_id: result.stats?.taskId ?? null,
          page: summarizeScrapeResponse(scrapePayload)
        }
      };
    }
    case "xcrawl_crawl": {
      const requestConfig = {
        url: text(input.args.url),
        limit: numberValue(input.args.limit, 100),
        maxDepth: numberValue(input.args.max_depth, 3),
        include: stringArray(input.args.include),
        exclude: stringArray(input.args.exclude),
        device: text(input.args.device) || "desktop",
        locale: text(input.args.locale) || "zh-CN,zh;q=0.9",
        waitUntil: text(input.args.wait_until) || "networkidle",
        formats: stringArray(input.args.formats).filter((item) => SCRAPER_OUTPUT_FORMATS.includes(item as any)),
        jsonPrompt: text(input.args.json_prompt),
        jsonSchema: parseJsonText(input.args.json_schema_text),
        proxyLocation: text(input.args.proxy_location),
        stickySession: text(input.args.sticky_session),
        advancedParams: {}
      };
      const result = await runCrawl(buildToolSource(input.source, requestConfig), input.run);
      const crawlPayload =
        result.responsePayload && typeof result.responsePayload === "object" && "result" in result.responsePayload
          ? (result.responsePayload.result as Record<string, unknown>)
          : (result.responsePayload as Record<string, unknown>);
      const pages = Array.isArray(crawlPayload?.data) ? crawlPayload.data : [];

      return {
        skillKey,
        requestPayload: result.requestPayload,
        responsePayload: result.responsePayload,
        modelResult: {
          ok: true,
          skill: formatScraperSkillKey(skillKey),
          records_stored: result.stats?.total ?? 0,
          task_id: result.stats?.taskId ?? null,
          pages: pages
            .slice(0, 6)
            .map((page) => ({
              title: pickBestTitle(page, String(page?.url || page?.page_url || "")),
              url: String(page?.url || page?.page_url || "")
            }))
            .filter((page) => page.url)
        }
      };
    }
    default:
      throw new Error("采集过程中遇到不支持的操作类型");
  }
}

export type AgentProgressEvent =
  | { type: "thinking"; message: string }
  | { type: "tool_start"; toolName: string; args: Record<string, unknown>; step: number }
  | { type: "tool_done"; toolName: string; skillKey: string; result: Record<string, unknown>; step: number }
  | { type: "model_text"; text: string }
  | { type: "done"; finalText: string; stats: Record<string, unknown> }
  | { type: "error"; message: string };

export async function runAgentSource(source: ScraperSourceDoc, run: ScraperRunDoc, onProgress?: (event: AgentProgressEvent) => void) {
  const config = (source.config || {}) as Record<string, unknown>;
  const modelEnv = getScraperModelEnv();
  const promptConfig = buildAgentPrompt(source);
  const model = text(config.model) || modelEnv.model;
  const toolDeclarations = getScraperToolDeclarations(promptConfig.enabledSkills);
  const contents = [
    {
      role: "user" as const,
      parts: [
        {
          text: promptConfig.prompt
        }
      ]
    }
  ];

  const artifacts: Array<{ artifactType: "model_request" | "model_response" | "tool_call"; payload: Record<string, unknown> }> = [
    {
      artifactType: "model_request",
      payload: {
        model,
        prompt: promptConfig.prompt,
        enabledSkills: promptConfig.enabledSkills,
        constraints: promptConfig.constraints
      }
    }
  ];

  const skillsUsed = new Set<ScraperSkillKey>();
  let toolCalls = 0;
  let finalText = "";

  const emit = onProgress || (() => {});

  const maxCalls = promptConfig.constraints.maxToolCalls;

  while (true) {
    const remaining = maxCalls - toolCalls;
    emit({ type: "thinking", message: `正在思考下一步操作…（剩余步数 ${remaining}/${maxCalls}）` });

    // 将剩余步数作为系统上下文注入，让模型实时感知配额
    if (toolCalls > 0) {
      contents.push({
        role: "user" as const,
        parts: [{ text: `[系统提示] 你已使用 ${toolCalls}/${maxCalls} 步，剩余 ${remaining} 步。${remaining <= 2 ? "步数即将耗尽，请停止调用工具，直接根据已有结果输出最终中文结论。" : ""}` }]
      });
    }

    // 步数耗尽时不传 tools，强制模型输出文本总结
    const callConfig: Record<string, unknown> = {
      apiKey: modelEnv.apiKey,
      model,
      contents
    };
    if (remaining > 0) {
      (callConfig as any).tools = [{ functionDeclarations: toolDeclarations }];
    }

    const response = await callBailianAgent(callConfig as any);

    artifacts.push({
      artifactType: "model_response",
      payload: response
    });

    const functionCalls = remaining > 0 ? extractBailianFunctionCalls(response) : [];
    if (functionCalls.length === 0) {
      finalText = extractBailianText(response) || "采集任务已完成。";
      emit({ type: "model_text", text: finalText });
      break;
    }

    const modelContent = extractModelContent(response);
    const functionResults: Array<{ id: string; name: string; result: Record<string, unknown> }> = [];

    for (const functionCall of functionCalls) {
      if (toolCalls >= maxCalls) {
        // 配额已耗尽，跳过剩余的函数调用
        emit({ type: "thinking", message: `步数已达上限（${maxCalls}），跳过剩余操作，准备生成总结…` });
        break;
      }

      toolCalls += 1;
      emit({ type: "tool_start", toolName: functionCall.name, args: functionCall.args, step: toolCalls });
      const execution = await executeAgentTool({
        source,
        run,
        toolName: functionCall.name,
        args: functionCall.args,
        allowAsync: promptConfig.constraints.allowAsync
      });

      skillsUsed.add(execution.skillKey);
      emit({ type: "tool_done", toolName: functionCall.name, skillKey: execution.skillKey, result: execution.modelResult, step: toolCalls });
      artifacts.push({
        artifactType: "tool_call",
        payload: {
          toolName: functionCall.name,
          args: functionCall.args,
          skillKey: execution.skillKey,
          requestPayload: execution.requestPayload,
          responsePayload: execution.responsePayload,
          modelResult: execution.modelResult
        }
      });

      functionResults.push({
        id: functionCall.id,
        name: functionCall.name,
        result: execution.modelResult
      });
    }

    // 对于模型请求了但被跳过的函数调用，补充一个拒绝响应
    for (const functionCall of functionCalls) {
      if (!functionResults.some((r) => r.id === functionCall.id)) {
        functionResults.push({
          id: functionCall.id,
          name: functionCall.name,
          result: { ok: false, error: "步数配额已耗尽，本次调用被跳过。请根据已有结果输出最终结论。" }
        });
      }
    }

    appendFunctionResults({
      contents,
      modelContent,
      results: functionResults
    });
  }

  const stats = {
    model,
    toolCalls,
    skillsUsed: Array.from(skillsUsed),
    finalText
  };

  emit({ type: "done", finalText, stats });

  return {
    requestPayload: null,
    responsePayload: null,
    artifacts,
    stats
  };
}
