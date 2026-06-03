import type { ScraperSkillKey } from "@/lib/scraper/types";

export const SCRAPER_SKILLS_REPO_URL = "https://github.com/xcrawl-api/xcrawl-skills";

type ScraperToolDefinition = {
  skillKey: ScraperSkillKey;
  toolName: string;
  title: string;
  sourceUrl: string;
  description: string;
  declaration: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const sharedScrapeProperties = {
  url: {
    type: "STRING",
    description: "要抓取的页面 URL"
  },
  mode: {
    type: "STRING",
    enum: ["sync", "async"],
    description: "执行模式，默认 sync"
  },
  formats: {
    type: "ARRAY",
    items: {
      type: "STRING"
    },
    description: "输出格式数组，可选 markdown、html、raw_html、links、summary、screenshot、json"
  },
  json_prompt: {
    type: "STRING",
    description: "当需要结构化提取时使用的 JSON 提示词"
  },
  json_schema_text: {
    type: "STRING",
    description: "JSON Schema 的字符串形式"
  },
  device: {
    type: "STRING",
    enum: ["desktop", "mobile"],
    description: "设备类型"
  },
  locale: {
    type: "STRING",
    description: "请求 locale"
  },
  wait_until: {
    type: "STRING",
    enum: ["load", "domcontentloaded", "networkidle"],
    description: "页面等待策略"
  },
  proxy_location: {
    type: "STRING",
    description: "代理国家或地区代码，比如 US、JP、SG"
  },
  sticky_session: {
    type: "STRING",
    description: "XCrawl sticky session"
  }
};

const SKILL_DEFINITIONS: ScraperToolDefinition[] = [
  {
    skillKey: "xcrawl",
    toolName: "xcrawl",
    title: "XCrawl 默认入口",
    sourceUrl: `${SCRAPER_SKILLS_REPO_URL}/blob/main/skills/xcrawl/SKILL.md`,
    description: "默认单页抽取入口，适合明确 URL 的页面抓取请求。",
    declaration: {
      name: "xcrawl",
      description: "XCrawl 默认技能。适合已经有明确 URL 的页面抓取，底层走 XCrawl Scrape。",
      parameters: {
        type: "OBJECT",
        properties: sharedScrapeProperties,
        required: ["url"]
      }
    }
  },
  {
    skillKey: "xcrawl-search",
    toolName: "xcrawl_search",
    title: "XCrawl Search",
    sourceUrl: `${SCRAPER_SKILLS_REPO_URL}/blob/main/skills/xcrawl-search/SKILL.md`,
    description: "关键词发现技能，适合先找候选链接。",
    declaration: {
      name: "xcrawl_search",
      description: "XCrawl Search 技能。按 query、location、language 搜索候选链接。",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "搜索词"
          },
          location: {
            type: "STRING",
            description: "搜索地区，比如 CN、US 或城市名"
          },
          language: {
            type: "STRING",
            description: "语言代码，比如 zh、en"
          },
          limit: {
            type: "NUMBER",
            description: "结果上限，1 到 100"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    skillKey: "xcrawl-map",
    toolName: "xcrawl_map",
    title: "XCrawl Map",
    sourceUrl: `${SCRAPER_SKILLS_REPO_URL}/blob/main/skills/xcrawl-map/SKILL.md`,
    description: "站点 URL 发现技能，适合摸清网站结构。",
    declaration: {
      name: "xcrawl_map",
      description: "XCrawl Map 技能。对站点做 URL 发现和范围规划。",
      parameters: {
        type: "OBJECT",
        properties: {
          url: {
            type: "STRING",
            description: "站点 URL"
          },
          filter: {
            type: "STRING",
            description: "只保留匹配这个正则的 URL"
          },
          limit: {
            type: "NUMBER",
            description: "URL 上限"
          },
          include_subdomains: {
            type: "BOOLEAN",
            description: "是否包含子域名"
          },
          ignore_query_parameters: {
            type: "BOOLEAN",
            description: "是否忽略 query 参数"
          }
        },
        required: ["url"]
      }
    }
  },
  {
    skillKey: "xcrawl-scrape",
    toolName: "xcrawl_scrape",
    title: "XCrawl Scrape",
    sourceUrl: `${SCRAPER_SKILLS_REPO_URL}/blob/main/skills/xcrawl-scrape/SKILL.md`,
    description: "单页抓取技能，适合正文、摘要、JSON 提取。",
    declaration: {
      name: "xcrawl_scrape",
      description: "XCrawl Scrape 技能。适合抓单页正文、摘要、JSON、截图等。",
      parameters: {
        type: "OBJECT",
        properties: sharedScrapeProperties,
        required: ["url"]
      }
    }
  },
  {
    skillKey: "xcrawl-crawl",
    toolName: "xcrawl_crawl",
    title: "XCrawl Crawl",
    sourceUrl: `${SCRAPER_SKILLS_REPO_URL}/blob/main/skills/xcrawl-crawl/SKILL.md`,
    description: "站点批量抓取技能，适合大范围爬取。",
    declaration: {
      name: "xcrawl_crawl",
      description: "XCrawl Crawl 技能。对站点做批量抓取，通常会返回异步 crawl_id。",
      parameters: {
        type: "OBJECT",
        properties: {
          url: {
            type: "STRING",
            description: "起始 URL"
          },
          limit: {
            type: "NUMBER",
            description: "抓取页数上限"
          },
          max_depth: {
            type: "NUMBER",
            description: "最大深度"
          },
          include: {
            type: "ARRAY",
            items: {
              type: "STRING"
            },
            description: "只包含这些正则"
          },
          exclude: {
            type: "ARRAY",
            items: {
              type: "STRING"
            },
            description: "排除这些正则"
          },
          formats: {
            type: "ARRAY",
            items: {
              type: "STRING"
            },
            description: "输出格式数组"
          },
          json_prompt: {
            type: "STRING",
            description: "结构化提取提示词"
          },
          json_schema_text: {
            type: "STRING",
            description: "JSON Schema 的字符串形式"
          },
          device: {
            type: "STRING",
            enum: ["desktop", "mobile"],
            description: "设备类型"
          },
          locale: {
            type: "STRING",
            description: "请求 locale"
          },
          wait_until: {
            type: "STRING",
            enum: ["load", "domcontentloaded", "networkidle"],
            description: "页面等待策略"
          },
          proxy_location: {
            type: "STRING",
            description: "代理国家或地区代码"
          },
          sticky_session: {
            type: "STRING",
            description: "XCrawl sticky session"
          }
        },
        required: ["url"]
      }
    }
  }
];

export function getScraperToolDeclarations(enabledSkills?: ScraperSkillKey[]) {
  const allowed = new Set(enabledSkills && enabledSkills.length > 0 ? enabledSkills : SKILL_DEFINITIONS.map((item) => item.skillKey));
  return SKILL_DEFINITIONS.filter((item) => allowed.has(item.skillKey)).map((item) => item.declaration);
}

export function getScraperSkillPromptLines(enabledSkills?: ScraperSkillKey[]) {
  const allowed = new Set(enabledSkills && enabledSkills.length > 0 ? enabledSkills : SKILL_DEFINITIONS.map((item) => item.skillKey));
  return SKILL_DEFINITIONS.filter((item) => allowed.has(item.skillKey)).map(
    (item) => `- ${item.toolName}: ${item.description}（来源：${item.sourceUrl}）`
  );
}

export function getScraperSkillKeyByToolName(toolName: string) {
  return SKILL_DEFINITIONS.find((item) => item.toolName === toolName)?.skillKey ?? null;
}
