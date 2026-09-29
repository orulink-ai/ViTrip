# 笔记地图块

地图与正文保存在同一篇 Markdown 文件，预览复用现有 MapLibre 地图。地图仅维护笔记内的地点，不改动正式行程；连线表示访问顺序，不代表道路、航路或导航。

Pi 与 Codex 共用 `notebook` 工具：

1. `read` 读取文档及 `revision`。
2. `upsert_map` 传入 `name`、最新 `revision` 和完整 `map`。同一 `id` 更新原地图；新增可用 `afterHeading` 放在唯一匹配的标题后，省略则追加文末。
3. `remove_map` 传入 `name`、最新 `revision` 和 `blockId`。

地图字段为 `version: 1`、稳定 `id`、`title`、可选 `description`、`mode: places | sequence` 与 `points`。地点包含稳定 `id`、`name`、WGS84 `latitude` / `longitude`、`precision: place | approximate`，可选 `description` 和 HTTP(S) `sourceUrl`。最多 50 个地点；不允许重复 ID、无效坐标或危险来源 URL。版本冲突必须重读，不能覆盖用户新编辑。

地图存为顶层 `vitrip-map` JSON 代码块。用户也可以通过 Markdown 编辑修改；无效数据不能覆盖有效文件。普通代码示例内的嵌套 fence 不作为地图解析。预览保留跨地图的 Markdown 来源引用。

验证：

- `npx vitest run tests/notebook-map.test.ts`：持久化、版本冲突、数据校验、Markdown 解析。
- `npx playwright test tests/e2e/notebook-map.spec.ts`：真实 Electron / Pi 工具链增改删、地图交互、重启恢复；模型响应与底图边界使用受控数据。
- `node scripts/live-notebook-map-check.mjs --run /absolute/path/to/note.md`：显式调用已登录的真实 Codex，在隔离数据目录中读取笔记副本并插入两张路线地图。适用于含路线 A/B 及坐标的验证笔记；不会修改原文件。结果与截图输出到被忽略的 `artifacts/live-notebook-map`。

## 章节折叠

笔记预览的标题前提供展开/收起按钮，可用键盘操作。一个章节包含标题下的正文、地图及所有低级标题，直到下一个同级或更高级标题。代码示例和引用中的标题不参与章节分组。

折叠状态按笔记保存在本机；用户操作不会改写 Markdown。需要 Agent 将某个历史方案默认收起时，在对应标题下一行添加 `<!-- vitrip:collapsed -->`，之后空行继续写原内容。用户手动展开/收起的选择优先。修改正文或插入其他不同标题的章节不会重置已有状态；重命名标题会生成新的章节标识。

`tests/notebook-sections.test.ts` 验证分组与稳定标识；`tests/e2e/notebook-folding.spec.ts` 验证地图/子章节折叠、键盘、文档隔离、重启记忆和正文保持不变。
