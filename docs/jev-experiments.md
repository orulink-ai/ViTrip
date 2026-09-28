# JEV 实验性功能

设置中可以分别启用 Pi JEV 浏览器控制、JEV 联网搜索、JEV 本地代码与文档搜索。默认均关闭；旧配置不会自动启用。现有 JEV OpenRouter 密钥继续使用并由系统安全存储加密，渲染器仅收到“已配置”标记。

- 浏览器：启用后 `computer_use` 使用固定版本 Pi Jev Browser 的上游循环、动作问题和文字候选构造，适配 ViTrip 当前 Electron 浏览器。保留取消、敏感操作确认、过期观察检查和停滞检测；结果为 `done_unverified` 时仍需核实页面。关闭后使用原来的浏览器实现。当前适配点击、文字填写、滚动和等待；不启用上游的宿主 macOS 应用控制，原生下拉框不在自动动作范围内。目标中无法提取的文字会交回主 Agent 处理。
- 联网搜索（Pi）：`jev_web_search` 复用 `pi-web-access` 搜索服务，再用 JEV 对来源片段排序。仍可调用原始 `web_search`；`fetch_content` / `get_search_content` 保持原用法。JEV 排序失败时显式返回原始结果，取消时不降级重试。
- 本地检索（Pi）：`jev_search` 默认搜索当前旅行笔记本，`path` 可指定任务涉及的本机代码或文档目录。支持纯文本代码、Markdown 等，不直接解析 PDF / Office。先有限本地召回，再把最多 48 个片段交给 JEV 排序，保留文件、行号、相关性和截断说明。跳过符号链接、隐藏目录、常见密钥与生成文件；该过滤不是全面的秘密检测器。精确搜索继续使用 Pi 自带 `grep` / `find` / `read`。

API 固定为 OpenRouter `https://openrouter.ai/api/v1/systemone`，模型 `typesafe/jev-1.13`。所有请求只从主进程发出。开关分别保存，关闭某项即不注册对应实验搜索工具；浏览器开关按每次任务配置选择实现。搜索实验暂不注入 Codex 引擎。

上游版本与许可见 `src/main/vendor/pi-jev-browser/NOTICE.md`。为保持应用内浏览器、用户当前页面和既有安全边界，复用其无界面依赖的核心，而不是另起一个独立 Chromium。

## 验证

- `npm test`：配置、加密存储、动作选择、真实本地文件检索、无效响应处理。
- `npm run build`：严格类型和生产构建。
- `npm run test:e2e`：真实 Electron 设置开关与重启、搜索工具、网页操作、停止、关闭回退。服务边界使用受控响应。
- `node scripts/live-jev-check.mjs --run`：使用已保存密钥的真实主模型、OpenRouter JEV 和联网搜索联调；复制加密配置到隔离目录，不更改用户数据。报告写入 `artifacts/live-jev/`。此命令会调用已配置服务并产生正常 API 用量。

## 开关对照测试

`node scripts/jev-ab-benchmark.mjs --run` 使用已保存的真实模型和 JEV 密钥，默认每种任务每组运行三次。每次使用隔离数据目录与全新会话，交替开启/关闭全部三个实验开关；固定构建副本保证中途代码改动不会改变测试版本。浏览器从同一已加载的受控页面开始，本地检索使用相同生成语料，联网搜索使用相同查询但保留真实网络波动。它会产生正常 API 用量。

结果保存在 `artifacts/jev-ab/<时间>/report.json` 和逐次截图。运行 `node scripts/jev-benchmark-summary.mjs <报告目录>` 可计算完成情况、耗时中位数、主模型调用与 token、JEV 可获取的费用；没有返回的费用不能视为免费。完整轮次计时包含自动笔记同步，另记回答就绪时间与相关工具耗时。小样本只能说明所测任务，不代表复杂网站、大型代码库的表现。浏览器实验关闭时仍使用原有 JEV 实现，不能解释为“完全不使用 JEV”。

计量解析校验：`node --test scripts/jev-benchmark-metrics.test.mjs`。浏览器未打开网页时会提示先调用 `navigate`，避免观察未初始化页面导致任务和停止操作挂起；真实 Electron 回归用例见 `tests/e2e/browser-empty-observation.spec.ts`。

## 性能结论（2026-09-28）

[开关对照实测](benchmarks/jev-2026-09-28.md)：三类任务开、关各 3 次，18 次正式任务全部成功。整轮耗时中位数：浏览器 21.4 → 22.3 秒，联网搜索 19.1 → 16.5 秒，本地代码/文档检索 20.2 → 22.6 秒。整体提升不明显，不承诺启用即可提速；联网搜索的改善主要来自减少一次主模型往返，JEV 排序自身增加耗时。小样本不证明普遍速度或质量提升，继续默认关闭并保留原工具。
