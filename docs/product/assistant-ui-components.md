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
