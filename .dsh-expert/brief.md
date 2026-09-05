# Brief

## 2026-09-05 用户原始意图
- m00055（原文）："/dsh-expert 写一个插件，让每个session右侧的三个点点开以后有一个新的选项叫会话ID，点击以后就能复制这个对话的session ID，如何"
- 目标：Web GUI 侧边栏会话行 ⋯ 菜单增加"会话ID"项，点击复制该会话 ID 到剪贴板；GUI 语言 zh（兼容 en）。
- 形态决定：纯 DOM 外部 client 插件（先例 dsh-workspace-folder-order，零 import、`__ModuleLoader__.load` 工厂）；harness 源码只读（铁律）。
- 验证基线：活体 GUI http://127.0.0.1:3080（bili --port 8787 dsh web），本会话 id = session-c0406149-aa13-4279-85cf-a0f27336de34。
