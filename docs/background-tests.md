# 后台运行页面测试

设置了 `VITRIP_TEST_DATA` 的独立 Electron 测试实例默认隐藏窗口，不接收焦点，也不在 macOS Dock 中显示。测试页面关闭后台限速，仍能进行真实页面交互、截图与图片采集。深链接不会将测试窗口带到前台。正常启动 ViTrip 不受影响。

修改主进程源码后先构建，再运行测试：

```sh
npm run build
npm run test:e2e
```

需要观察窗口调试时显式开启：

```sh
VITRIP_TEST_SHOW=1 npm run test:e2e
```

已经运行的旧测试进程不会自动切换为后台模式。不要使用系统级鼠标键盘自动化代替隐藏页面内的 Playwright 操作；系统原生对话框和焦点行为需要单独安排可见测试。

回归覆盖位于 `tests/test-window-policy.test.ts` 和 `tests/e2e/background-window.spec.ts`。
