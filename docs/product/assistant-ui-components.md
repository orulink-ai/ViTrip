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

### 地图引用预览（2026-09-27）

- 引入官方 `elements/sources.tsx`，来自 assistant-ui/assistant-ui 的同路径源码，只适配本地 import。
- 地图标记通过 React portal 装配 shadcn Popover 与官方 Sources；悬浮预览、点击固定、Escape 关闭，原文交给现有浏览器。
- 单地点支持 `sources` 多引用，兼容旧 `source` 和坐标来源；按安全 URL 去重，不生成缺失标题、照片或作者。
- 初版确认状态由用户点击，按旅行和安排内容保存在本机 localStorage；安排内容变化后重新确认。目前尚未与 Agent 对话中的确认语义同步。
- 绿色已确定、黄色待确定；日期使用文字，路线维持中性。确认不表示预订或完成。

### 地图作为行程主画布
- 行程地图铺满剩余工作区，去掉重复标题及日期下拉框；日期快捷切换悬浮在地图顶部。
- 地点列表默认收起，使用现有 Timeline 和 Button 组成可收起的悬浮面板，内容较少时按内容高度展示，较多时内部滚动。
- 状态图例、地图操作和底图加载提示悬浮展示，保留底部地图署名。展开列表不会改变地图尺寸。
- Electron 回归验证地图占画布高度超过 90%、列表展开/收起不改变地图宽度，以及日期、地点选择、引用讨论和浮动聊天功能。
