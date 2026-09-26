# ViTrip 开发约定

- 独立桌面工程；不以 LibreChat 为运行依赖。
- AI 界面优先按已安装的 ai-elements Skill 使用官方组件。组件源码保留在 src/renderer/components/ai-elements，按需定制，不重写假组件。
- 使用 TypeScript 严格类型。主进程、浏览器控制、Agent、数据存储与 UI 分层。
- 核心行为先写失败测试，再实现；浏览器功能必须用真实 Electron 页面验证，不能只模拟浏览器。
- 提交前运行 npm test、npm run build、npm run test:e2e。新增测试应验证用户可观察行为。
- 密钥只存在于主进程，使用系统安全存储加密；远程网页不能获得 preload API。
- GitHub 操作使用本机 gh 账号；commit 使用规范、详细的中文描述。若涉及 PR 合入，使用 merge commit 并确认最终提交具有两个 parent。
