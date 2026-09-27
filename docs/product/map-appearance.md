# 行程地图外观

「地图外观」只提供四个完整模式，不再分别选择风格和视角：

| 名称 | 官方底图 | 视角 |
| --- | --- | --- |
| 平面 | OpenFreeMap Liberty | 平面地图，默认选项 |
| 倾斜 | OpenFreeMap Bright | 45° 倾斜，无建筑高度 |
| 倾斜立体 | OpenFreeMap Liberty | 45° 倾斜，放大到街区查看建筑 |
| 3D | OpenFreeMap Liberty | 可旋转、缩放的地球 |

进入倾斜模式时至少放大至 zoom 15；切换 3D 时缩小至全球视野。点击地点或地点簇可以重新拉近。「查看全部地点」恢复 Liberty 平面行程全貌。建筑高度受当地数据覆盖影响。

偏好按旅行保存在本机，不按日期拆分；日期筛选、地点选择和行程数据独立于底图。可将当前模式设为新旅行默认值。旧版风格偏好迁移：平面统一为 Liberty，地球统一为 Liberty，倾斜保留 Liberty 立体或转为 Bright。损坏和未知偏好回退默认。

样式切换请求可以取消，避免旧请求覆盖新选择。下载失败保留旧底图并提示重试。样式加载后重建行程图层，保留地点选择；底图失败时地点列表仍可使用。相机移动后重新显示加载状态，地图完成绘制后结束提示。

当前模板来自 OpenFreeMap，不是 Mapbox Default、Faded、Cool 原版，不含卫星影像。不向用户暴露访问令牌。

## 验证

单元测试验证偏好隔离、默认值、旧偏好迁移与损坏存储。Electron 测试验证四个选项、选择保留、加载失败回退、地球拖动、跨日期及重启恢复、缩放按钮真实点击与加载状态。

运行 `npm run build` 后执行 `node scripts/check-map-appearance.mjs`，以临时旅行数据和独立构建副本检查四个模式的真实外部底图。输出 `artifacts/map-appearance/audit/index.html`、`four-modes.png` 和 `results.json`。截图不替换底图或地图引擎；结果针对本次网络环境及京都示例区域。

外部底图首次加载速度有波动，验收允许最多 90 秒等待，失败会记录为失败。`networkFailures` 也记录切换和缩放取消的请求。

来源：
- https://openfreemap.org/quick_start/
- https://openfreemap.org/
- https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/
