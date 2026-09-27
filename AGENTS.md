# ViTrip 开发约定

- 独立桌面工程；不以 LibreChat 为运行依赖。
- AI 界面直接使用用户指定的 assistant-ui Elements 官方组件（https://www.assistant-ui.com/elements），源码保留在 src/renderer/components/assistant-ui/elements；只做业务数据、状态和事件装配，不自造视觉组件。
- 使用 TypeScript 严格类型。主进程、浏览器控制、Agent、数据存储与 UI 分层。
- 核心行为先写失败测试，再实现；浏览器功能必须用真实 Electron 页面验证，不能只模拟浏览器。
- 提交前运行 npm test、npm run build、npm run test:e2e。新增测试应验证用户可观察行为。
- 密钥只存在于主进程，使用系统安全存储加密；远程网页不能获得 preload API。
- GitHub 操作使用本机 gh 账号；commit 使用规范、详细的中文描述。若涉及 PR 合入，使用 merge commit 并确认最终提交具有两个 parent。
- 全项目界面直接采用 assistant-ui Elements / shadcn 官方默认组件样式与中性色主题；不自行增加主题配色、装饰插画、定制卡片或覆盖组件样式。只添加必要的布局与交互样式。笔记本按旅行文件夹保存多篇独立 Markdown 文档，支持 Agent 整理和用户选择编辑；原有随手笔记保留引用、待办和画板作为页内内容。
