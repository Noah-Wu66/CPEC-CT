# 智创 AI 工作台

> AI 赋能数字融媒体创制 —— 面向内容创作流程的 AI 工作台。

本项目为「菁门·先锋行」AI 数字融媒体创制大赛 · 技术开发赛道参赛作品，定位为**互动融媒体产品 / AI 工具开发**。它把内容创制中最高频的三件事——AI 对话创作、音频配音与字幕、素材数据采集——整合到一个可独立部署、开箱即用的 Web 工作台中。

## 核心能力

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 人工智能 | `/ai` | 基于 MiniMax-M3 的对话，支持文件理解、联网搜索，以及 MiniMax image-01 图像生成。 |
| 音频工具 | `/audio` | 文本转语音（TTS）、声音克隆、火山引擎录音识别与字幕翻译，并沉淀声音库与历史记录。 |
| 数据采集 | `/scraper` | 用自然语言描述采集目标，由 AI 智能体执行搜索、抓取并产出结构化报告。 |

### 已集成的 AI 模型

- **对话** — MiniMax-M3（1M 上下文、原生多模态，默认自适应深度思考）
- **图像生成** — MiniMax `image-01`（文生图 / 人物主体参考图生图）
- **语音合成 / 声音克隆** — MiniMax Speech 系列
- **录音识别 / 字幕识别** — 火山引擎语音识别 `bigmodel`

AI 能力只保留两个国内平台：**MiniMax 官方国内版平台**（`platform.minimaxi.com`）和 **火山引擎语音识别**。MiniMax 使用 `MINIMAX_API_KEY`，火山录音识别使用 `VOLCENGINE_SPEECH_API_KEY`。

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19 + TypeScript
- **样式**：Tailwind CSS，支持浅色 / 深色 / 跟随系统主题
- **数据库**：MongoDB
- **账号**：邮箱 + 密码注册登录，scrypt 密码哈希，HttpOnly 会话 Cookie
- **AI 接入**：MiniMax 官方国内版平台（对话 `/v1/text/chatcompletion_v2`；图像 `/v1/image_generation`）+ 火山引擎语音识别

## 账号系统

- 任何人都可使用邮箱 + 密码**自助注册**并立即使用全部功能，无需依赖任何外部 / 企业系统。
- 密码使用 Node 内置 `scrypt` 加盐哈希存储，会话采用随机令牌 + 服务端校验，Cookie 为 `HttpOnly`。
- 单一角色体系：**首位注册用户**自动成为管理员（仅用于管理数据采集的系统级任务），其余为普通用户。

## 本地运行

环境要求：Node.js 24.x、可访问的 MongoDB 实例。

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，至少填入 MONGO_URI 与 AUTH_SECRET；
# 按需填入各 AI / 音频 / 采集服务的密钥（详见 .env.example 注释）

# 3. 启动开发服务器
npm run dev
# 打开 http://localhost:3000 ，首次访问会跳转到 /login 注册账号

# 生产构建
npm run build && npm run start
```

> 提示：未配置某个 AI / 音频服务的密钥时，对应能力会在调用时提示缺少配置，不影响其他模块使用。

## 目录结构

```
app/
  (auth)/login        邮箱密码注册 / 登录页
  (dashboard)/        总览看板、数据采集、设置
  ai/                 AI 多模型对话前端
  audio/              音频工具前端
  api/                后端接口（auth / ai / audio / scraper）
components/           UI 组件（布局、品牌、各模块组件）
lib/
  auth.ts             会话与注册 / 登录逻辑
  password.ts         scrypt 密码哈希
  validators.ts       表单校验（zod）
  ai/  audio/  scraper/   各模块服务端与共享逻辑
types/                领域与视图类型
```

## 改造说明（赛事提交参考）

本作品基于内部「编辑运营中台」重构而来，为参赛做了如下处理：

1. **移除企业相关内容**：删除海外社交账号管理、用户后台、企业 OA 单点登录、企业网盘 / OA 外链与多级 RBAC 权限体系。
2. **保留核心业务功能**：完整保留 AI 对话、音频工具、数据采集三大能力。
3. **重构账号系统**：由依赖内网 OA 的企业 SSO，改为可独立运行的邮箱 + 密码注册登录，评委可自助注册试用。
4. **统一 AI 平台**：只保留 MiniMax 官方国内版平台与火山引擎语音识别。
5. **整理仓库**：清除无用文件与依赖、统一品牌文案、移除企业标识，确保 `npm run build` 可直接通过。
