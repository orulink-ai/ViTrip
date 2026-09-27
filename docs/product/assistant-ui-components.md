# assistant-ui Elements 使用约定

用户指定：https://www.assistant-ui.com/elements

界面直接使用官方组件和默认样式，业务代码只负责来源数据、缓存、引用上下文与事件；不仿制一套外观相似的组件。

| 组件 | ViTrip 用途 | 本轮状态 |
| --- | --- | --- |
| Quote AUI | 右侧行程选中文字后加入左侧输入框；发送后保留原文与来源定位 | 使用现有官方 SelectionToolbar、ComposerQuotePreview、QuoteBlock |
| Image gallery | 酒店和景点来源照片、大图、左右切换与来源入口 | 接入官方 ImageGallery；本地缓存经 IPC 供图 |
| Timeline | 地图旁按天显示活动时间与先后顺序 | 已接入官方 Timeline；标题类型扩展为 ReactNode，装配现有 Button 用于定位，不改官方视觉样式 |
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

Timeline 同样来自上述上游 revision 的 `elements/timeline.tsx`，仅调整导入别名与业务标题槽位。计划中活动使用 `future`，不会将选中状态映射为 `now` 或把经过的时间当作已完成。地图展开后并排呈现时间线与地图，窄面板采用上下布局。

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

### 地图引用预览（2026-09-27）

- 引入官方 `elements/sources.tsx`，来自 assistant-ui/assistant-ui 的同路径源码，只适配本地 import。
- 地图标记通过 React portal 装配 shadcn Popover 与官方 Sources；悬浮预览、点击固定、Escape 关闭，原文交给现有浏览器。
- 单地点支持 `sources` 多引用，兼容旧 `source` 和坐标来源；按安全 URL 去重，不生成缺失标题、照片或作者。
- 初版确认状态由用户点击，按旅行和安排内容保存在本机 localStorage；安排内容变化后重新确认。目前尚未与 Agent 对话中的确认语义同步。
- 绿色已确定、黄色待确定；日期使用文字，路线维持中性。确认不表示预订或完成。

### 浮动聊天与地图选区（2026-09-27）

- 官方 `assistant-modal.aui.tsx` 保留窗口、气泡和缩放默认视觉；装配现有 Thread 内容槽，使用业务会话标题，补充标题栏拖动和键盘移动。旅行会话列表仍由原侧栏管理，不创建第二套 runtime。
- Thread 始终渲染到同一个 DOM portal 容器；切换停靠/浮动时仅移动容器，保留草稿、引用、附件和当前消息。
- Sidebar 使用官方 offcanvas 模式；顶栏提供常驻切换入口。
- 地图卡片通过官方 SelectionToolbar 添加引用，限定同一旅行，携带活动 ID 和版本；操作只打开聊天并填入引用，不发送、不修改行程。
- 地点点击聚焦：精确地点 zoom16、区域 zoom13，已更近则保留；重复点击仍有效。

### 地图卡片操作收敛

- 确认采用官方 Button 的 default/secondary 状态，Check 图标与 aria-pressed 同步，确认后可再次点击撤回。
- 移除重复的“查看详情”，改为“讨论或修改”，通过业务 Context 把对应活动引用交给现有浮动聊天，保留草稿，不自动发送或改计划。
- 来源卡片保持原有组件与展开方式。预订含义说明收进按钮提示，减少常驻文字干扰。

### 行程工作区收敛（2026-09-28）

- 只保留“行程地图”“准备待办”，默认地图；移除总览、参考资料及返回总览按钮。
- 活动详情、照片、原文引用留在地图时间线/选中地点；引用回跳定位地图活动，讨论入口直接引用该活动。
- 准备待办共享笔记本原有持久化 todos，新增勾选不会重建清单；packing 继续由用户选择加入。
- 历史知识条目和旧 HTML 未删除，但不再作为独立工作区页面展示。待办当前没有来源关联字段，未将无关联资料强行挂到待办。

### 地图作为行程主画布
- 行程地图铺满剩余工作区，去掉重复标题及日期下拉框；日期快捷切换悬浮在地图顶部。
- 地点列表默认收起，使用现有 Timeline 和 Button 组成可收起的悬浮面板，内容较少时按内容高度展示，较多时内部滚动。
- 状态图例、地图操作和底图加载提示悬浮展示，保留底部地图署名。展开列表不会改变地图尺寸。
- Electron 回归验证地图占画布高度超过 90%、列表展开/收起不改变地图宽度，以及日期、地点选择、引用讨论和浮动聊天功能。
