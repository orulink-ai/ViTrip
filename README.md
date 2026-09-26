# ViTrip

独立旅行规划桌面客户端：中间对话，右侧真实本地浏览器与可视化行程。

**AI Elements + Pi Agent SDK + Jev + Electron + React + TypeScript + SQLite**。不以 LibreChat 为运行依赖。AI Elements 由官方 CLI 安装，其依赖的基础 UI 组件一并保留。

## 打开与使用

双击项目里的 **ViTrip.app** 或 **启动 ViTrip.command**。

- 在左下角「模型设置」配置主模型与 Jev 密钥。密钥经操作系统加密保存在本机，不包含在源码或安装包中。
- 主模型默认：`deepseek-v4.1-flash`；百炼接口：`https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`。
- 浏览器决策模型：`typesafe/jev-1.13`；OpenRouter 接口：`https://openrouter.ai/api/v1/systemone`。它是结构化决策接口，不是 Chat Completions。
- 告诉助手目的地、出发时间和偏好。它可以查询网页，操作浏览器并更新右侧行程。
- 右侧可手动输入网址；点击「接管」暂停 AI，手动处理后「交还 AI」。模型会重新观察页面。
- 「行程」展示每日安排与来源，可导出独立 HTML。
- 对话中的「执行过程」复用 AI Elements Chain of Thought 和 Tool 组件，显示工具步骤、耗时、结果与错误；可折叠展开，记录随会话保存并在重启后恢复。中断的步骤明确标记，不生成虚构的思考内容。
- 选中 AI 回复文字后可「添加到对话」或「标记到笔记本」；引用会随问题发送，点击引用可回到来源。
- 「笔记本」按旅行共享：以连续的 Markdown 页面编辑/预览，引用、待办和本地 Excalidraw 画板作为页内可折叠内容。内容自动保存；取消标记不删除已经插入的笔记。
- 个人笔记和画板独立保存，不由 AI 自动改写，也不自动发送到模型。当前画板为单人本地使用，不含多人协作；HTML 行程导出暂不包含笔记和画板。
- 「查看示例行程」明确标注为静态示例，不代表实时查询。

## 架构与能力

- **Pi 0.87.1** 管理流式对话、工具调用、压缩与持久会话。每个旅行独立保存完整工具记录。只加载显式旅行工具，不开放 bash、文件读写或自动发现本机 Skills。
- **DeepSeek** 负责旅行规划、回答和填写字段所需的文字。
- **Jev** 从当前 DOM 快照选择操作和元素；执行前校验候选、概率和页面是否变化。一次最多12步，连续三次无进展停止。DONE 仍需要核实页面证据。
- **Electron WebContentsView** 显示真正的本机 Chromium 网页，CDP 执行鼠标点击、键盘输入。不是网页 iframe，也不依赖云端浏览器。
- 表单提交、Enter 和识别出的预订/支付等敏感点击需要逐次确认。密码和支付等敏感字段不进入快照，不允许 AI 填写。
- 接管先取消模型请求，再等待当前浏览器操作结束；恢复时读取最新页面，废弃旧引用。
- SQLite 保存对话与行程，Pi 保存工具历史。密钥通过 Electron safeStorage 加密；renderer 只收到已保存标记。
- 远程网页禁用 Node、启用 sandbox/contextIsolation，没有应用 preload API。交互行程由可信 React 组件呈现；旧手册预览与 HTML 导出转义内容并禁止脚本。

## 当前边界

这是可运行的早期版本，尚未完成真实酒店或机票站点的完整预订验收。

- 使用 ViTrip 自己的本地浏览器 Profile，需要在其中登录；不会读取系统 Chrome 的现有 Profile。
- 浏览器控制基于主文档 DOM 与 CDP，不是视觉驱动的全电脑操控。复杂 iframe、Canvas、验证码和部分登录弹窗需要接管。
- 当前共享一个浏览器页面；新窗口在当前页打开。暂不支持下载、硬件权限、原生 SELECT 操作；当前网址不随重启恢复。
- 敏感操作识别基于表单语义与文字规则，不能覆盖任意网站的所有交易入口。最终预订与付款宜人工完成。
- 网页正文、普通表单值和聊天内容会发送到对应模型服务。
- 无云端同步、多账号、路线导航 API、自动更新或应用商店发行。macOS 包使用本机 ad-hoc 签名，未公证。

## 开发

Node.js >= 22.19；当前验证平台为 macOS Apple Silicon。

```bash
npm ci
npm start
npm test
npm run build
npm run test:e2e
npm run package
npm run test:package
```

界面统一使用 AI Elements / shadcn 默认组件样式和中性色，不额外设计主题或装饰卡片。

AI Elements 是 React 源码组件，这里用 Vite 构建 renderer，无需运行 Next.js 服务。Pi 与 Jev 在 Electron 主进程运行，通过受校验的 IPC 推送 UI 事件。

- `src/main/agent.ts`：Pi 运行时、显式旅行工具、流式事件与持久会话。
- `src/main/activity.ts`：工具执行事件适配、结果截断、密钥脱敏与中断标记。
- `src/main/jev.ts`：决策协议、候选校验、浏览器循环及文字生成。
- `src/main/browser.ts`：真实浏览器、页面快照、元素引用与 CDP。
- `src/main/control.ts`：串行操作和接管。
- `src/main/storage.ts`：SQLite 与系统加密。
- `src/main/index.ts`：窗口、IPC、会话编排、确认与导出。
- `src/renderer/`：旅行工作区与官方 AI Elements 组件。
- `tests/`：核心测试及真实 Electron 端到端测试。

运行数据：`~/Library/Application Support/ViTrip/`；数据库 `vitrip.sqlite`；Pi 会话 `sessions/<trip-id>/`。删除该目录会清除聊天、模型设置和登录状态，请先备份。

## 验收

2026-09-26，核心测试、Electron 端到端测试和打包检查通过。覆盖真实输入/点击、行程更新、操作确认同意/拒绝、接管后重新观察、敏感字段排除、历史工具记录复用及重启恢复。

另用真实百炼和 OpenRouter 接口完成受控网页联调：Pi 委托 Jev 输入杭州、点击搜索，独立核实 DOM 中出现杭州搜索结果，并生成计划。此测试不等同于真实预订验收。

`scripts/live-check.ts` 是需真实凭据、会产生模型调用的手动联调脚本，不随 `npm test` 自动运行。凭据从 stdin 输入，输出仅含操作步骤和验证结果。

## 来源与许可

自有代码 MIT。AI Elements 许可证见 `docs/AI-ELEMENTS-LICENSE`；MapLibre 许可证见 `docs/MAPLIBRE-LICENSE`；其余依赖许可见 `docs/THIRD-PARTY-LICENSES.txt`。

Jev 动态操作与元素候选方案参考并适配自 [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)，保留其 MIT 许可证于 `docs/JEV-ULTRAFAST-LICENSE`。Pi 使用 [官方 SDK](https://pi.dev/docs/latest/sdk)。浏览器使用 Electron 官方 WebContentsView / debugger API。

之前下载的 LibreChat 完整工程保留在桌面的 `ViTrip-LibreChat-reference`，仅供研究，与本项目启动无关。

## 旅行文件夹与交互行程

「新的旅行」创建文件夹，每个文件夹可展开多个会话。旅行名称旁的“…”菜单可改旅行名或新建会话；会话的“…”菜单支持改名、移动及删除。手动设置的名称不会被首条消息覆盖。

右侧「行程」有三个视图：

- **页面**：React 渲染按天排列的活动与页内地图。点击活动的「在地图中查看」定位地点，地图的「查看行程条目」返回正文。AI 通过 `plan` 更新结构化数据，不生成可执行页面代码。
- **地图**：展开地图、按日期筛选、选择地点。与页面共享地点和选择状态；虚线仅表示相邻活动的顺序，不是道路导航。没有可靠坐标的活动保留为「待定位」。
- **已整理**：可以搜索偏好、已确认决定、问题答案、提醒和待核实事项。条目按稳定 ID 合并，修正同一个问题不删除其他事项，导出 HTML 时一并包含。

同一旅行的所有会话共享页面和已整理资料；每轮对话注入最新资料，必要时追加自动整理。不同旅行隔离。旧版数据首次启动会自动迁移，每个旧行程成为一个文件夹，原聊天与计划保留；之后可把会话移到同一文件夹。移动会话不会搬走或删除原旅行的共享手册。

真实百炼模型已验证两个独立会话连续编辑同一份手册：第一轮记录卡塔海滩、预算和偏好；第二轮沿用已有资料补充出海提醒，原条目保留。自动整理仍可能遗漏或误解，应检查已确认与待核实标记。


### 地图与旧版手册

地图使用 MapLibre GL JS（本地打包 Worker）和 OpenStreetMap 标准瓦片。只有当前视图请求底图，采用 Chromium HTTP 缓存与 ViTrip User-Agent；没有离线底图下载。底图失败时保留地点、顺序和正文，可点击重试。OSM 公共瓦片是尽力服务，规模化分发前需评估合适的瓦片服务商：[使用政策](https://operations.osmfoundation.org/policies/tiles/)。

活动可选 `location` 字段包含 WGS84 经纬度、地点名、`precision`（`place` / `approximate`）和可选坐标来源。它随 Plan 保存在 SQLite，跨会话共享。示例京都行程坐标标为大致位置，没有实时检索或导航含义。

已有 HTML 不删除：没有结构化行程时保留隔离预览和「整理成交互行程」入口；已有 Plan 时，旧内容可通过页尾「旧版手册」展开。导出仍为无脚本 HTML，包含当前计划、历史手册、离线地点摘要、在线位置链接及共享知识。交互地图本身不打包进导出文件。

地图验收包含真实 Electron / WebGL / MapLibre Worker、日期筛选、正文与地图双向定位、IPC 更新保留选择、失败后重试和重启恢复。自动测试只替代外部瓦片网络边界，不模拟地图引擎。

## 聊天组件与界面语言

聊天主体使用 assistant-ui 官方 Thread、Composer 和 Quote 组件，通过 ExternalStoreRuntime 连接 Electron IPC；SQLite、Agent 和浏览器控制仍由主进程管理。组件源码保留在 src/renderer/components/assistant-ui/elements，只增加中文文案与旅行功能插槽，保留原始样式。引用的来源、标记笔记、工具执行过程与审批流程继续使用现有业务数据。

侧栏底部支持简体中文 / English 即时切换，偏好保存在本地并在重启后恢复。切换只影响界面文案，不翻译已有聊天、旅行名称、笔记及生成的行程内容。消息编辑、重试生成、语音和附件等尚未接入的能力不作为可用功能开放。

assistant-ui 的 MIT 许可证保留于 docs/ASSISTANT-UI-LICENSE。依赖版本由 package-lock.json 锁定。
