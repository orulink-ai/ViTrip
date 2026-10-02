# Codex 语音聊天

在聊天输入框选择 Codex，然后点击「开启语音聊天」。首次使用需要允许麦克风；通话以悬浮窗显示连接、聆听、思考、说话状态和计时，支持静音与挂断。连接就绪后可直接说出旅行需求；转写按轮次追加，通话中的文字消息在挂断后发送。切换旅行或关闭窗口会结束通话。

语音通过 Codex app-server 的实验性 realtime v3 / WebRTC 接入，身份验证和工具执行保留在主进程，渲染进程只处理音频与信令。复用当前 Codex 登录和 ViTrip 工具，工具执行仍走原有权限与执行记录。默认最长通话 30 分钟。浏览器工具不再受从接通时起计算的 140 秒查询时限限制；保留同站连续失败保护，每次新的语音请求重新计数。

已在本机随桌面应用附带的 Codex CLI 0.158.0-alpha.2.1 验证。不同 CLI 版本、账号权限和服务变更可能影响实验性接口；连接失败会显示错误并释放麦克风。模型列表、普通文字聊天和语音使用同一套 CLI 选择逻辑，优先使用本机已安装的较新版本，包括桌面应用附带的 CLI。每次请求新建 app-server 进程，由 Codex 读取当前本机登录；ViTrip 不保存 Codex 登录凭据。

## 验证

- `npm test -- --maxWorkers=2`
- `npm run build`
- `npm run test:e2e -- tests/e2e/voice.spec.ts tests/e2e/voice-permissions.spec.ts tests/e2e/codex.spec.ts`
- `node scripts/live-vitrip-voice-check.mjs --run /absolute/path/to/generated-speech.wav`

真实测试使用独立临时旅行和合成语音，不录制物理麦克风，不修改用户旅行。测试语音应要求读取「语音测试笔记」中的酒店及测试编号；工具返回需包含 `VTR-VOICE-7319`。测试报告保存到 artifacts 下。
