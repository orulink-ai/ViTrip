# assistant-ui Elements 使用约定

用户指定：https://www.assistant-ui.com/elements

界面直接使用官方组件和默认样式，业务代码只负责来源数据、缓存、引用上下文与事件；不仿制一套外观相似的组件。

| 组件 | ViTrip 用途 | 本轮状态 |
| --- | --- | --- |
| Quote AUI | 右侧行程选中文字后加入左侧输入框；发送后保留原文与来源定位 | 使用现有官方 SelectionToolbar、ComposerQuotePreview、QuoteBlock |
| Image gallery | 酒店和景点来源照片、大图、左右切换与来源入口 | 接入官方 ImageGallery；本地缓存经 IPC 供图 |
| Sources / Document reference | 查询依据、原始攻略和引文定位 | 适合作为后续来源呈现组件，本轮未替换现有来源入口 |
| Tool timeline / Tool group | 查询、看图、写入行程的执行过程 | 已将执行过程接到官方 ToolGroup 与 ToolFallback，保留真实状态、参数和输出 |
| Approval card | 浏览器实际操作授权 | 使用官方 ApprovalCard，绑定已有允许/拒绝接口，不增加行程编辑确认 |
| Geo map | 地图位置列表和选中地点呈现 | 已评估；官方版本使用 Leaflet。当前 MapLibre 已承载聚合、视角恢复和顺序线，本轮未切换地图引擎 |

## 组件来源

ImageGallery、ApprovalCard、surfaces、href、range 来自 `assistant-ui/assistant-ui`：

- 上游 revision：`19eb2eb3fa94248c40f1945ec7a5fe6ae3a27d60`
- 路径：`packages/ui/src/components/react/assistant-ui/elements/image-gallery.tsx`
- 本地仅调整导入别名；源码放在 `src/renderer/components/assistant-ui`。
- 官方文档：https://www.assistant-ui.com/elements/image-gallery
- Quote 文档：https://www.assistant-ui.com/elements/quote

## 行程引用行为

选中文本只进入待发送引用，不发消息、不改行程，保留输入框草稿。引用记录旅行 ID、活动 ID、日期、活动标题及当时版本；它是讨论上下文，不是修改命令。Pi 根据用户问题及最新共享行程自主判断：可以仅解释，也可以查询后通过 plan 更新。点击引用回到对应行程活动；被删除的旅行保留引用原文并提示来源失效。


## 生成中的补充输入

Thread 仍使用官方 ComposerPrimitive.Input / Cancel 和 Attachment；通过 ComposerInterrupt 槽位装配默认 shadcn Button。输入框生成中保持可编辑，Enter 与「打断并发送」共用 runtime composer.send，Shift+Enter 保留换行，中文输入法组合期间不发送。

主进程先验证文本、引用与附件，再取消当前运行、等待工具结束并在同一会话启动补充请求；不回滚已完成的行程写入。Pi 和 Codex 均采用此中断续聊行为，尚未接入原生 steer 或等待队列。独立停止保留输入草稿、已有回复和工具状态。

真实 Electron 测试覆盖生成中上传、Enter 补充、Codex 点击补充、后续回复顺序、已中断工具、停止保留草稿及重启持久化。模型使用可控测试替身；这些断言验证交互与协议，不替代真实模型质量评测。截图：artifacts/conversation-interrupt.png。

## 笔记本文档

顶部文档选择、新建、另存为使用现有 shadcn Select / Input / Button 默认样式；正文复用现有 NotebookPanel 的 Markdown 编辑和预览，不新增定制视觉主题。每个旅行对应独立 `.md` 文件目录，Agent 通过 notebook list/read/write 操作，保存事件刷新目录和未修改的编辑器；编辑中的草稿不会被远端更新覆盖。原先随手笔记、引用、待办和画板保留为单独入口。

## 工具与回复的交错顺序

新消息持久化有序 `parts`：文字正文和工具 ID 引用按首次出现顺序追加。工具进度、完成、失败和中断只更新对应活动，既不重新插入，也不移动到消息头。纯文本 `content` 保留为对话检索、复制和 Agent 上下文摘要；展示通过 runtime 的文本 / tool-call parts 读取同一顺序，重新生成的各分支也保留自己的顺序。

正常调用直接使用官方 [Tool call](https://www.assistant-ui.com/elements/tool-call)，源文件来自 `https://r.assistant-ui.com/elements-tool-call.json`（2026-09-27 获取），只调整项目导入别名；参数与结果默认折叠。错误和中断沿用官方 Tool fallback。取消原消息头的工具汇总盒，工具分组槽位透传子内容，不跨文字归并工具。

旧消息没有记录文字与工具的相对顺序，兼容显示正文后接已有工具记录，不伪造交错历史。Electron 测试验证流式期间的真实位置、工具完成后无重复、展开详情和重启后的顺序，截图为 `artifacts/tool-order.png`。

## 文档过程与回复操作的精简

连续 notebook / journal 调用通过官方 ToolGroup 的 ghost 样式汇总，默认收起，不跨正文段落分组。摘要按成功写入的不同文件名计数；失败和中断优先显示，默认展开详情。展开后的 notebook 调用根据 action 显示读取、保存或查看目录，目标显示文档名；耗时仅在单项展开或异常状态显示，避免重复的「已完成 · 0.0 秒」。ToolGroup 仅新增业务 label 属性，保留默认样式。

助手回复操作保留复制、重新生成、更多；复制本机链接移到官方更多菜单，移除常驻点赞/点踩入口。用户消息的链接入口保留。验证覆盖保存数量、折叠详情、三个按钮、链接复制、分支重生成和原有工具顺序。截图：artifacts/document-activity-summary.png、artifacts/document-activity-expanded.png。
