# AI 业务工具

> AI 赋能数字融媒体创制 —— 面向内容创作流程的 AI 工作台。

本项目为「菁门·先锋行」AI 数字融媒体创制大赛 · 技术开发赛道参赛作品，整合 AI 对话创作、图像与视频生成、语音合成、声音复刻、录音识别和字幕处理。

## 部署形态

本仓库只面向 **Zeabur Pro** 部署，使用 Zeabur ZBPack 原生构建 Node.js 服务。生产环境由三个部分组成：

```text
用户 ── example.com ── Next.js 服务（Zeabur 注入 PORT）── MongoDB
                              │
                              └── Zeabur Volume（/data/cpec-ct）
```

- **应用服务**：运行网页、接口、AI 调用和本地附件解析。
- **MongoDB**：保存账号、会话、聊天记录、生成历史和文件元数据。
- **Zeabur Volume**：保存上传文件、生成图片、视频、音频和字幕文件。
- **访问域名**：网页、接口和 `/files/**` 文件读取共用同一个 HTTPS 域名，例如 `https://example.com`。

Volume 直接挂载到应用服务，本项目应保持 **1 个运行实例**。扩容到多个实例前，必须先把文件存储改成共享对象存储，并把限流改成共享状态。

## 核心能力

| 模块 | 路径 | 能力 |
| --- | --- | --- |
| 人工智能 | `/ai` | 多模型对话、附件理解、联网搜索、图片和视频生成 |
| 语音合成 | `/speech` | MiniMax 文本转语音、声音复刻、声音库与生成历史 |
| 录音识别 | `/transcribe` | Fun-ASR 录音转写、字幕识别、字幕翻译与历史记录 |

当前服务接入：

- **阿里云百炼新加坡端点**：Qwen3.7-Max、DeepSeek V4 Pro、Kimi K2.6、GLM 5.2、Qwen-Image 3.0 Pro、HappyHorse 1.1、Fun-ASR。
- **MiniMax**：Speech 2.8 / 2.6 语音合成和声音复刻。
- **Firecrawl**：AI 对话联网搜索和网页正文读取。

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript
- Tailwind CSS
- MongoDB
- Node.js 24
- Python 3 本地附件解析器
- 邮箱密码账号、scrypt 密码哈希、HttpOnly 会话 Cookie

## Zeabur 首次部署

### 1. 创建服务

1. 在 Zeabur 新建项目并添加 MongoDB 服务。本项目按全新数据库启动，不读取旧平台数据。
2. 添加 Git 服务并选择本仓库。Zeabur 会识别 Node.js、Next.js 和根目录的 `zbpack.json`。
3. ZBPack 会安装 Node.js 与文档解析依赖，依次执行代码检查、生产构建和启动命令；应用自动监听 Zeabur 注入的 `PORT`。

### 2. 挂载持久化 Volume

在应用服务中新增一个 Volume：

| 项目 | 值 |
| --- | --- |
| Volume ID | `cpec-files`（名称可自定） |
| 服务挂载路径 | `/data/cpec-ct` |

存储路径已经固定为 `/data/cpec-ct`，不需要配置环境变量，因此 Volume 必须准确挂载到这个路径。部署、重启和更新服务时都必须保留这个 Volume。删除 Volume 会同时删除项目中的所有上传文件与生成文件。

### 3. 绑定访问域名

给应用服务的 `web` 端口绑定一个 HTTPS 域名，可以使用 Zeabur 自动分配的域名，也可以绑定自己的域名，例如：

- `example.com`

文件地址会自动使用同域 `/files/**` 路径，不需要单独绑定文件域名，也不需要在环境变量中填写公开网址。

### 4. 配置环境变量

在应用服务的变量页面填写：

```dotenv
MONGO_URI=MongoDB 服务提供的完整连接地址，并在地址中指定数据库名
DASHSCOPE_API_KEY=阿里云百炼 API Key
MINIMAX_API_KEY=MiniMax API Key
FIRECRAWL_API_KEY=Firecrawl API Key
```

所有变量都是必填项。应用启动时会检查变量格式、MongoDB 连接、数据库索引和 Volume 写入权限；任何一项不合格都会直接停止启动，避免带病运行。

### 5. 部署与检查

部署完成后检查：

- `https://example.com/api/health` 返回 `200`：应用进程正常。
- `https://example.com/api/ready` 返回 `200`：MongoDB、索引和 Volume 均可用。
- 首位注册用户成为管理员，之后注册的用户为普通用户。

## 文件系统规则

- 普通聊天附件、图片和文档最大 `20 MB`。
- 录音识别源文件最大 `500 MB`。
- 上传过程采用流式写入，先保存到 `.incoming` 临时区，校验大小、扩展名、MIME 和文件头后再原子移动到正式目录。
- 文件正文保存在 Volume，MongoDB 只保存所有者、用途、大小、哈希、解析状态和公开文件编号。
- 文件公开地址使用不可预测编号；用户提交的文件编号会在服务端再次核对所有权。
- PDF、Office、文本等附件在应用服务内以受限 Python 子进程解析，设置内存、CPU、进程数、输出大小和超时上限。
- 视频和音频读取支持 HTTP Range，便于浏览器拖动播放进度。

## 上线验收清单

正式开放前必须在 Zeabur 预发布环境完成：

1. 注册、登录、退出和首次管理员身份检查。
2. AI 对话、联网搜索、图片附件、文档附件及文档解析检查。
3. 文生图、参考图生成、文生视频和图生视频检查。
4. MiniMax 语音合成、声音复刻、音频试听与历史删除检查。
5. Fun-ASR 录音识别、字幕下载、翻译和历史删除检查。
6. 上传一个接近 `500 MB` 的真实音频，确认入口网关、上传进度、识别提交和持久化都成功。
7. 重启并重新部署应用，确认历史文件仍可读取，以验证 Volume 确实挂载。
8. 为 MongoDB 和 Volume 启用备份，并实际验证一次恢复流程。

其中第 6 项是硬性上线门槛：代码已经支持 `500 MB` 流式上传，但最终可用上限仍受所选 Zeabur 区域入口网关约束，必须用真实部署验证。

## 健康检查与日志

- `/api/health`：轻量存活检查，供 Zeabur 判断应用进程是否正常。
- `/api/ready`：依赖就绪检查，会验证 MongoDB 与 Volume。
- 服务端错误日志采用单行 JSON，便于在 Zeabur 日志页面按模块、动作和请求编号定位问题。

## 目录结构

```text
app/                       页面与 API
lib/storage/               Volume 文件存储、校验、授权与元数据
lib/ai/                    对话、附件解析、联网搜索
lib/audio/                 语音合成、声音复刻、录音识别
lib/media/                 图片与视频生成
scripts/parser/            本地 Python 附件解析器
zbpack.json                Zeabur 原生安装、构建与启动配置
instrumentation.ts         启动时环境、数据库和存储检查
```

Zeabur 相关操作可对照官方文档：[Node.js 部署](https://zeabur.com/docs/en-US/guides/nodejs)、[Volume 持久化](https://zeabur.com/docs/en-US/data-management/volumes)、[域名与端口](https://zeabur.com/docs/en-US/deploy/networking/public-networking)和[环境变量](https://zeabur.com/docs/en-US/deploy/config/environment-variables)。
