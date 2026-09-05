# dsh-session-id-menu

给 Workspace 侧边栏每个会话行的 kebab 菜单追加一个 **Session ID** 复制项：点击后把该会话的
`session.id`（如 `session-c0406149-...`）写入系统剪贴板，标签短暂变为 `Copied`（zh 环境为 `已复制`）。

## 行为契约（plan v2，review r3 PASS；code r1 F8/F9 修复后更新）

- **注入点**：点击任意会话行（`aria-selected` 存在，true/false 均可）的
  `aria-label="Session actions for {name}"` kebab 按钮后，监听 `document.body` 下新出现的
  `[role="menu"]`（Menu 原语 portal 到 body），在菜单末尾追加一个
  `button[role="menuitem"][data-dsh-session-id="1"]`，结构与既有菜单项克隆一致（class /
  icon span / label span），icon 为 ui-primitives `IconCopyOutline16` 的内联 SVG。
  工作区头行（`aria-expanded`）与搜索结果行（button 自身）不捕获。
- **归属关联**：`pointerdown`（capture）记录 pending（按钮 + 时间戳，≤600ms 有效）；菜单出现时
  仅当存在 pending 且几何匹配（`|menu.left - button.left| ≤ 12px` 或水平重叠，兼容 Menu
  `align='start'` 的 12px clamp 偏移；或右缘 clamp——kebab 靠近 viewport 右缘时宿主把菜单左拉到
  `vw - menuWidth - 12`（`menu.right = vw - 12`），菜单可完全位于按钮左侧，接受条件 =
  `button.left + menu.width > vw - 12` 且 `menu.right ≥ vw - 12 - 12`，code r3 F12）才注入。
  无 pending 的菜单一律 no-op，不写任何标记（Menu 是 26 个 dependent 的共享原语，无点击证据不归因）。
- **ID 解析（三上下文）**：行标题以行直接子 span 文本对 `sessions.byId[*].displayTitle`
  反查取得（纯文本 span 优先、含元素子节点的 span 次之——头部状态槽可含 screen-reader
  状态文本 + 圆点元素，非 displayTitle；按 DOM 顺序逐文本尝试、首个命中即停，code r2 F10
  ——title span 先于 time span，time 标签撞名另一会话标题不再扩大候选）；
  上下文由 `sectionHeader(row)` 祖先遍历判定
  （行位于 groupSection 内逐行 span 包装中、section 同时持有工作区头行）：
  - 扁平列表（祖先链达 `role=tree`、无头行）：候选 + `updatedAt` 取最新；
  - 分组 workspace 段（头行文本反查匹配 `WorkspaceView.title`）：
    限定到该 workspace 的 `sessionIds`；**workspaces 快照必须 `phase === 'ready'`，否则静默 miss（F7）**；
  - 分组 ungrouped 段（头行文本不匹配任何 workspace）：从全局集合中排除所有 workspace `sessionIds` 的并集。
  - sessions 快照非 ready 同样静默 miss。
- **复制语义**：`navigator.clipboard.writeText` resolve → `Copied` 1200ms 后恢复 + 900ms 派发
  Escape 关闭菜单；reject/无 API → `document.execCommand('copy')` 回退（textarea + select，
  临时 textarea 在 finally 移除——success/false/throw 三路径无 DOM 残留，code r2 F11）；
  两者皆败 → 静默（无 `Copied` 标签），50ms 派发 Escape。
- **生命周期**：单个 `ctx.effect` 返回 cleanup：断开 observer、移除 pointerdown 监听、
  取消全部 rAF/定时器、移除已注入的菜单项与 `data-dsh-sid` 标记；disposed 后新菜单不再注入。

## 宿主侧

`src/index.js` 导出 `name`（稳定 id）+ 空 `apply`——纯 DOM 插件，宿主侧无状态。
`dsh.client` 声明 `platform: 'web'`，`inject: ['sessions', 'workspaces']`（信息性依赖，
fiber 等待这两个 store 就绪后激活 client 模块）。`cordis.patch.yml` 以
`insert: id: dsh-session-id-menu` 追加装配。

## 验证阶梯

1. **source**：`node --test tests/*.test.mjs` —— 33 个 behavior 用例（注入 / 归属关联 / 三上下文
   解析 / F7 / F8-F9 状态槽（Idle/Running/Completed）与未选中行 / F10 title-time 撞名 /
   F11 legacyCopy 残留（execCommand throw / select throw）/ F12 右缘 viewport clamp（菜单左拉至 clamp
   边界且完全位于按钮左侧 → 注入；clamp 边界下无关菜单 → no-op）/ 复制语义 / 生命周期）+ 9 个
   package-shape 断言，基于手写 DOM stub（无 jsdom）。
2. **package**：package-shape 测试覆盖 manifest / files / exports 与 dsh-workspace-folder-order
   先例的一致性。
3. **runtime**：`dev_inject_plugin`（超级模组直接注入）+ `dev_plugin_status` 列出 fiber 状态，
   再用 Playwright 对 3080 实况 GUI 断言：会话行 kebab 菜单含 `Session ID` 项、点击后
   `navigator.clipboard.readText()` 等于目标 session id、标签闪 `Copied`。
4. **distribution**：`npm pack` 产物解包断言 tarball 含 package.json / client.js /
   src/index.js / cordis.patch.yml / README.md。
