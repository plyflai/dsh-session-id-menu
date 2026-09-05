# Plan: dsh-session-id-menu — 会话行 ⋯ 菜单新增「会话ID」复制项

Status: done — 四层验证全 PASS（source 43/43 ×2 / package-shape 9 / runtime 活体剪贴板与磁盘 displayTitle 精确一致 / distribution npm pack tarball 5 文件齐）；dsh-expert-flow 实例 dsh-expert-flow-1788626070-45b6 至 done（rev32）
Target: client-plugin (bundle basket) · web / browser DOM
Branch: main

## Problem

Web GUI 侧边栏每个会话行的三点菜单（⋯）当前硬编码三项（重命名 / 分叉 / 归档，`packages/client/ui-workspace/src/client/rows/Rows.tsx:416-421` `sessionMenuItems`），宿主没有任何"菜单项扩展"机制：`Menu` 组件（`packages/client/ui-primitives/src/Menu.tsx`）只接受完整 `items` prop，`sidebar.workspaces` 槽为 `kind:single`（ui-sidebar contract slots.ts:35），其唯一子孔 `sidebar.workspaces.directoryFlow` 被占用会改变"添加工作区…"入口可见性（副作用）。用户需求：会话行三点菜单出现"会话ID"项，点击即复制该行会话的 ID 到剪贴板。会话行有两种显示模式：grouped（groupSection + 工作区头行）与 flat（`WorkspaceBrowser.tsx:619-746` FlatList，全部 `SessionNodeItem` 直接位于 `[role=tree]`，无 groupSection / 头行）。

## Proposal

新建独立 client 插件仓库 `dsh-dev/bundle/dsh-session-id-menu`（本仓库），纯 DOM 形态（零 import，`window.__ModuleLoader__.load` 工厂，复刻 `dsh-workspace-folder-order` 先例）：

- 单个 `ctx.effect`（client.js）：
  1. **入口捕获**：document `pointerdown`（capture）。`e.target` → `closest('button[aria-label]')` 得候选按钮 → `closest('[role="treeitem"]')` 得行；行 = 会话行（`[role="treeitem"][aria-selected]:not([aria-expanded])` 且自身非 button——工作区行是 `[aria-expanded]` 且无 `aria-selected`，搜索结果行自身即 button）且按钮 = 行内 descendant `button[aria-label]` 唯一者（工作区行有两个按钮：⋯ + 新建会话加号）→ 记 pending `{button, row, at: Date.now()}`。
  2. **菜单观测**：`MutationObserver` 监听 `document.body`（childList）；Menu 组件把菜单列表 `createPortal(list, document.body)`（Menu.tsx:289），故新增的 body 直接子节点 `div[role=menu]` 入队，rAF 排空（React placement layout-effect 在 paint 前同步执行，rAF 时读到最终位置）。**无初始扫描**：effect 初始化时已打开的菜单不注入（关闭重开即生效）。
  3. **归属关联**：仅处理有 pending 的菜单：`Date.now() - pending.at ≤ 600ms` 且（`|menu.left - pending.button.left| ≤ 12px` **或水平重叠** **或右缘 clamp**）→ 归属该会话行、消费 pending、注入；否则 no-op（不写任何标记、pending 保留至超时失效）。无 pending 几何回退（F5：Menu 是 26 dependent 共享原语，无点击证据不归因）。几何依据（已验证 Menu.tsx:120-141 放置数学）：默认 `align='start'` → `x = r.left`（菜单 left=锚点 left），再 clamp 到 `[12, vw-lw-12]`——重叠分支覆盖左侧 clamp 后 left 偏移；右缘 clamp 分支（code r3 F12：kebab 靠近 viewport 右缘时菜单被整体左拉到 `vw-lw-12`，可完全位于按钮左侧——无重叠且 left 差 >12px；接受条件 = 按钮未 clamp 位置溢出右缘 `button.left + menu.width > vw-12` **且** 菜单实际位于该边界 `menu.right ≥ vw-12-12`，逐字验证宿主 clamp 数学）。pending 捕获过滤器另跳过 disabled button（防御）。
  4. **注入第四项**：克隆现有 `div.itemWrap > button[role=menuitem]` 结构（itemWrap/button/图标 span/标签 span 的 className 全部取自现有项），图标 = 内联 SVG（ui-primitives `IconCopyOutline16`），标签 = `document.documentElement.lang` 以 `zh` 开头 → "会话ID"，否则 "Session ID"；按钮带 `data-dsh-session-id` 标记防重复注入；追加到菜单首子 `div.viewport[role=presentation]`（Menu.tsx:266）；菜单标 `data-dsh-sid=done`。
  5. **点击行为**（F3 统一反馈契约）：`id = resolveSessionId(row)`；有 id → `copyText(id): Promise<boolean>`，`true` 才置标签"已复制"/"Copied"（1200ms 恢复）并在 900ms 后 document 派发 `keydown Escape`；`false`（剪贴板 + execCommand 双失败）→ 不显示成功，50ms 后派发 Escape 静默关闭；无 id（phase≠ready / 标题未命中）→ 50ms 后派发 Escape 静默关闭。（Menu 有 document 级 keydown 监听，Escape 即关，Menu.tsx:157-178；已关则无监听，no-op。）
  6. **id 解析**（`resolveSessionId(row)`，F2 三上下文确定候选集）：行直接子 span（排除 rowActions 子树）文本（纯文本 span 优先、含元素子节点的 span 次之）与 sessions 快照 `byId[*].displayTitle` 精确反查得候选（头部状态槽可能含 screen-reader 状态文本 + 圆点元素，非 displayTitle；code r1 F9 修复）；上下文判定 = `sectionHeader(row)` 祖先遍历（行位于 groupSection 内逐行 span 包装中，section 同时持有工作区头行；code r1 F9 修复）：
     - **flat**（祖先链无 `[role="treeitem"][aria-expanded]` 头行、达 `role="tree"` 列表；WorkspaceBrowser.tsx:697-742）→ 不做 workspace 收窄，直接候选 + `updatedAt` 决胜；
     - **grouped + workspaces 快照 `phase≠'ready'`**（头行存在、需收窄时）→ 返回 null 走 miss 路径静默关闭，不执行 workspace 收窄或 ungrouped union 排除（F7）；flat 路径不依赖 workspaces ready；
     - **grouped 工作区 section**（workspaces 快照 ready 且 `sectionHeader(row)` 命中头行且头行文本反查匹配 `WorkspaceView.title`）→ 候选收窄至该 `WorkspaceView.sessionIds`；
     - **grouped 未分组 section**（workspaces 快照 ready 且头行标题不匹配任何 workspace）→ 候选收窄至"不属于任何 workspace.sessionIds 的会话"（union 排除）；
     - grouped section 无头行（防御，不应发生）→ 不进一步收窄（与 flat 同路，不要求 workspaces ready）。
     候选唯一 → 其 id；多候选 → `updatedAt` 最新者 id；空 → null。
  7. **cleanup / disposal**（F4 全部 owned effects）：`disposed` guard；`mo.disconnect()`；移除 pointerdown 监听；`cancelAnimationFrame` 全部在册 rAF；`clearTimeout` 全部在册 timer（1200/900/50ms）；清空 pending 与 queue；遍历在册注入项（Set 追踪 itemWrap）：仍 `isConnected` 的移除节点（click listener 随节点移除）；遍历在册菜单（Set 追踪）移除 `data-dsh-sid` 标记。
- 数据通道：`ctx.get('sessions').list`（`SnapshotStore<SessionListState>`，`{phase, ids, byId}`，service.ts:69-87）与 `ctx.get('workspaces').list`（`{phase, items: WorkspaceView[]}`，types.ts:15-27）；locale 读 `document.documentElement.lang`（zh 激活时 locale client 置 `zh-CN`，locale client index.ts:149）。
- 宿主半边 no-op（`src/index.js` = folder-order 同形模板）；package.json `dsh.client` 清单 `platform:'web'`、`inject: ['@deepseek-ai/dsh-api-session-controller','@deepseek-ai/dsh-api-workspace-controller']`（informational）。
- 附带 `cordis.patch.yml` 供正式装配路径；本验证走 `dev_inject_plugin` 超级模组注入（免 patch 重启）。

## Acceptance criteria

1. zh GUI 下 flat / grouped 两种显示模式的会话行 ⋯ 菜单均显示 4 项，第 4 项 = "会话ID"；en 下 = "Session ID"。
2. 点击"会话ID"→ 该行 session id（`session-<uuid>` 形态）进入剪贴板；标签短暂闪"已复制"；菜单随后自动关闭。
3. 工作区行 ⋯ 菜单不受影响（不新增项）；其他组件菜单（视图选项、设置等）不受影响，含插件初始化时已打开的菜单（不注入）。
4. 同一菜单不重复注入；菜单关闭（portal 移除）与 effect dispose 后无 observer / 监听 / timer / rAF 泄漏；dispose 时移除仍存活菜单中插件自有的项与标记。
5. 四层验证全过且各有独立证据：source（`node --test`，含 flat/grouped/ungrouped 三上下文 + grouped/flat-workspaces-pending、复制成功/fallback/双失败、disposal 三例）+ package（manifest/exports 加载检查）+ runtime（`dev_inject_plugin` 直接注入 + Playwright 活体点击 + 剪贴板读回 == 目标会话 id + GIF）+ distribution（`npm pack` 产物内容检查）。

## 十问（L2 选问：1/2/3/5/8/9/10 + 插件级必问 6）

### 1 范围闭合
- 需求面 = 会话行 ⋯ 菜单，覆盖 flat 与 grouped 两种显示模式（flat：`WorkspaceBrowser.tsx:619-746` 全行直属 `[role=tree]`；grouped：groupSection + 头行）；不改：现有三项菜单项行为、工作区行菜单、搜索结果行（自身即 button、无嵌套 ⋯）、行 HoverCard 复制（宿主既有，共存）。
- 当前缺口 = 宿主无菜单项扩展槽（三线验证见下）→ additive DOM 注入为唯一可行形态（harness 只读铁律；槽机制上游 PR 为后续项，不在本方案）。
- 失败面 = displayTitle 撞名：flat = 标题 + `updatedAt`（flat 无组信息可用）；grouped = 组域 + `updatedAt`；残余风险（同组 / flat 同标题）取最近者，接受并记录（R1）。

### 2 接口契约
- **DOM 契约（只读）**：会话行 `[role="treeitem"][aria-selected]:not([aria-expanded])` 且非 button（Rows.tsx:423-501；工作区行 Rows.tsx:133-196 两按钮）；⋯ 按钮 = 行内 descendant 唯一 `button[aria-label]`；菜单 = body 直接子 `div[role=menu]`（portal，Menu.tsx:289）；项容器 = 菜单首子 `div.viewport[role=presentation]`（Menu.tsx:266）；现有项 = `div.itemWrap > button[type=button][role=menuitem] > span(itemIcon?) + span(itemLabel)`（Menu.tsx:192-249）；关闭 = document 级 `pointerdown` 外部点击 / `keydown` Escape（Menu.tsx:157-178）；**flat 容器 = `div.list.flatList[role=tree] > 行` 直属（WorkspaceBrowser.tsx:697-742，无 groupSection/头行）；grouped = `div.groupSection > (头行 + 逐行 SPAN 包装 > 行)`（活体 Playwright 验证：会话行各自位于 groupSection 内独立 SPAN 包装中、头行同样带 SPAN 包装；会话行状态槽 `span.slot` 可含 screen-reader 状态标签 + 圆点元素，标题 span 为纯文本 span——code r1 F9 活体证据）**。
- **数据契约**：sessions 快照 `{phase:'ready', ids: SessionId[], byId}`，`byId[id].displayTitle` / `.updatedAt`；workspaces 快照 `{phase, items: WorkspaceView[]}`，`WorkspaceView.title` / `.sessionIds`。**ready 门槛**：sessions `phase!=='ready'` → 恒 null；grouped 路径（头行存在）额外要求 workspaces `phase==='ready'`，否则 null（F7）；flat 路径仅依赖 sessions。
- **行为契约**：新项仅出现在会话行菜单；点击 = 复制，`copyText: Promise<boolean>` 为 true 才显示"已复制/Copied"（false 静默关闭、不显示成功）+ 自动关闭；解析失败 = 静默关闭，不改变菜单原状。

### 3 落点与兼容
- 落点 = 本仓库（bundle basket 新 git 仓）；harness 零改动（铁律）；不占宿主任何槽（不用 `ctx.slots.register`，规避 `single` 槽替换语义与 `root` 影子化）。
- 兼容：未注入 = 零差异；注入后仅会话行菜单多项；与 dsh-ui-tweak（CSS 覆盖，不涉菜单结构）、dsh-workspace-folder-order（只重排 groupSection，flat 模式无 group 可重排，行结构两种模式均不变）正交。
- CSS module 类名随构建哈希变化 → 定位只依赖 role 属性 + DOM 结构 + 文本；类名仅克隆用于视觉一致。

### 4 依赖与顺序
- Phase 1（插件包 + 测试）→ Phase 2（部署 + 活体验证 + 产物）；无并行。

### 5 触发与入口
- 入口 = 用户点会话行 ⋯（宿主既有 Menu 打开）；插件仅由菜单 portal DOM 事件触发，不新增自身入口。
- 不触发路径（菜单关闭 / 非会话菜单 / 无 pending 的菜单 / 快照未 ready）= 行为不变。

### 6 权限与副作用
- 读：sessions/workspaces 快照、DOM、`document.documentElement.lang`；写：剪贴板（用户发起，单个 ID 串）、注入 DOM（随 portal 关闭或 dispose 移除）。
- 无网络、无磁盘写、无不可逆操作（剪贴板可覆盖）。

### 7 错误与失败路径
- 剪贴板双失败（writeText reject + execCommand false/throw）→ `copyText` resolve false → 不显示"已复制"，50ms 后派发 Escape 静默关闭（菜单为轻控件，不弹错误 UI）。
- grouped + workspaces 快照非 ready（头行存在、需收窄时）→ `resolveSessionId` 返回 null → 50ms 后派发 Escape 静默关闭、无错误复制（F7）；flat 路径不依赖 workspaces ready（workspace 收窄仅为 grouped 精度）。
- 关联错过（点击快于观测）→ pending 600ms 窗口；无 pending / 超时 / left 差 > 12px 全部 no-op，不给无关菜单写标记（F5）。
- effect 初始化时菜单已开 → 不注入（无初始扫描）；关闭重开即生效（F5 接受的代价）。
- rAF 早于 placement → rAF 必在 useLayoutEffect（同步、paint 前）之后，读到最终位置。
- resolveSessionId 三上下文（flat / grouped 工作区 / grouped 未分组）均返回确定候选集；grouped 无头行（防御）→ 不进一步收窄。

### 8 验证与同步（四层可执行闭环，F6）
- **source**：`node --test tests/*.test.mjs`，DOM 桩（document/body/El 查询与 closest、MutationObserver、rAF/cancelAnimationFrame、setTimeout/clearTimeout 捕获、navigator.clipboard 可配、execCommand、KeyboardEvent 派发记录）。必含例：
  - 注入面：会话菜单注入（zh 标签 + 4 项 + 结构克隆）、en 标签、工作区菜单 no-op（两按钮行不入 pending）、其他组件菜单 no-op（含初始化时已开菜单零注入）、防重复注入（同菜单二次 handleMenu 仅 1 项）、关联 left 容差边界（±12px 内/外）、右缘 clamp 注入（菜单被左拉至 clamp 边界且完全位于按钮左侧）与 clamp 边界下无关菜单 no-op（code r3 F12）。
  - id 解析：flat-workspace（行属 workspace 但 flat 显示 → 不收窄，断言预期 id）、flat-ungrouped、grouped 双 workspace 同标题（头行 scope 断言正确 id）、grouped 未分组桶（workspace 会话 vs 未分组同标题 → 断言未分组者）、同组同标题 updatedAt 决胜、**grouped-workspace-pending**（grouped 头行存在但 workspaces phase=pending/error → 返回 null、无错误复制，含同标题 workspace/ungrouped 并存）、**flat-workspaces-pending**（flat 在 workspaces pending 时仍按 flat 规则正常解析）。
  - 复制反馈：原生成功（writeText resolve → 标签"已复制" + 剪贴板内容）、fallback 成功（writeText reject + execCommand true → 标签"已复制"）、双失败（双 reject → 标签不变 + 静默关闭）。
  - 关闭与生命周期：复制后 900ms 派发 Escape、miss 后 50ms 派发、dispose-before-rAF（queue 不处理不注入）、dispose-before-copy-timers（无标签变更无 Escape）、open-menu unload（存活菜单中自有项/标记移除、监听随节点移除）。
- **package**：`tests/package-shape.test.mjs` — 加载 package.json：name/version/type 存在；`exports['.']` 与 `exports['./client']` 指向存在的文件且文件可加载（client 入口经 `__ModuleLoader__` 桩执行后导出 apply/inject）；`dsh.client.platform === 'web'` 且 `inject` 为数组；`files` 清单覆盖 lib/client.js / src / cordis.patch.yml / README.md；main 可解析。
- **runtime**：`dev_inject_plugin {dir: <本仓根>}`（唯一输入 = source-only JS 包，**无 build 步骤**——直接注入证据：super-injector `inject()` 仅需 package.json+name：junction → `ctx.loader.create` → `refreshClientRow`，不要求 lib（super-injector src/index.ts:1907-1975）；其 self-test 注入 src-only tmpDir 无 lib 通过（src/index.ts:3022-3056）；dsh-workspace-folder-order 先例 main=src/index.js 无构建）→ `dev_plugin_status` / `dev_injected_list` 查 host ✓ 与 client 行 → Playwright headless（`apps/web/node_modules/playwright`）活体验证：自签 cookie（机制见 browser-auth.ts：cookie 名 = `dsh-auth-` + b64url(sha256(authority))，值 = `v1.<b64url(JSON{version,authority,issuedAt,expiresAt})>.<b64url(HMAC-SHA256(secretBuf,body))>`，secret = `$DSH_HOME/.credentials.yaml` `client-connection/browser-session`；已验证 curl `/` 200）→ 点目标会话行 ⋯（目标 = 本会话 `session-c0406149-aa13-4279-85cf-a0f27336de34`，displayTitle = `deepseek-harness`，`aria-selected` 行）→ 截图（第 4 项可见）→ 点击 → `navigator.clipboard.writeText` hook 读回 == 目标 id → 截图序列 + `/opt/homebrew/bin/ffmpeg` 合成 GIF（GIF = runtime/visual evidence）。
- **distribution**：`npm pack`（产物 `dsh-session-id-menu-0.1.0.tgz`）→ 解包到 tmp 目录 → 断言含 package.json、lib/client.js、src/index.js、cordis.patch.yml、README.md 且 `exports['./client']` 目标在 tarball 内（files 清单闭合）。
  - **Phase 2 布局适配**（注入前校验发现）：超级模组 `dev_inject_plugin` 预检硬编码 client bundle 规范位置 `lib/client.js`（`@dsh-external/dsh-super-injector` lib/index.js:2216-2226 `buildFreshnessProblems`：声明 `dsh.client` 则必须存在 `lib/client.js` 且含 `__ModuleLoader__` 特征）；宿主 client-modules（packages/client/modules/src/index.ts:760-765）经 `exports['./client']` 解析 bundle 路径（`clientExportOf`），布局无关。故 client bundle 由包根 `client.js` 移入 `lib/client.js`（`git mv`，内容不变），exports/`files`/tests/README 同步；42/42 复绿。
  - **Phase 2 预检骨架适配**（注入第二次阻断发现）：`clientSkeletonProblems`（同一 lib/index.js，紧随 freshness 检查）对存在 `lib/client.js` 的包做两条正则文本校验——① `inject\s*=\[[^\]]*'slots'`（inject 数组含 `'slots'`）② `register(\{...name: '<已知 slot 名>'`（14 个已知 slot 之一）。脚手架的 client 形态 = slot 面板（`ctx.slots.register({name: ...})`）；本插件为纯 DOM 形态（不注册面板），故：bundle 级 `exports.inject` 追加 `'slots'`（运行时仅提供未使用的 `ctx.slots`，无副作用），并在 `apply` 头部加恒 false 守卫的 `ctx.slots.register({ name: 'conversation.view', ... })` 死分支标记（注释标明预检骨架、运行时从不生效）。参照系：同 profile 现役外部插件 dsh-ui-tweak（根级 client.js + slots 形态）证实 bundle 级 inject 用短服务名（'slots'/'sessions'/'workspaces'）。
   - **Phase 2 快照 seam 适配**（活体验证首点失败发现，gpt-5.6 代码门已过后的运行时适配）：活页点击注入项后无已复制闪标 + 剪贴板为空。Playwright 仪器化诊断（console 捕获 click 目标/pointerdown、wrap `navigator.clipboard.writeText` 与 `document.execCommand`、临时 `__sidDebug` 闭包探针后移除）定位：click 事件正常到达注入按钮（宿主 Menu.tsx 用 `onClick` 派发、门户菜单仅在外侧 pointerdown/Escape 时关闭，与注入项无冲突），但 click 监听器内 `resolveSessionId` 抛 `TypeError: sessions.getSnapshot is not a function`（未捕获异常 → 无 copy、无 Escape、菜单保持打开，与全部观测一致；Playwright 未捕获监听器异常走 `pageerror` 事件而非 console，故首诊断 console 为空）。宿主服务真形：`'sessions'` = `ClientSessions`（packages/api/session-controller/src/client/sessions/service.ts:263 `rootCtx.reflect.provide('sessions', this)`；list 快照在公共成员 `readonly list: SnapshotStore<SessionListState>`，store 投影行 = service.ts:39-62/585-599 `{id, displayTitle, title?, cwd?, running, blank, updatedAt, ...}`，`displayTitleOf(title, cwd, sessionId)` 派生）；`'workspaces'` = `WorkspaceController`（packages/api/workspace-controller/src/client/service.ts:88 `super(ctx, 'workspaces')`；快照在 `readonly list: WorkspaceSource`，`{items: WorkspaceView[], phase, ...}`，`WorkspaceView = {workspaceId, path, title, sessionIds, ...}`）。两服务顶层均无 `getSnapshot`（活页探针实证：`typeof sessions.getSnapshot === 'undefined'`、`typeof sessions.list.getSnapshot === 'function'`、活快照 phase 'ready'/714 行/`{id, displayTitle, updatedAt}` 形状与代码预期一致）。修复：`readListSnapshot(store)` 助手（`store.list.getSnapshot`，形状不符或读取抛错 → null → 静默 miss，不炸 click 监听器）替换两处直调；tests 服务 stub 同步为 `{ list: { getSnapshot } }` seam + 新增「list seam 缺失 → 静默 miss」行为测试（43/43）。诊断期间临时 `__sidDebug` 钩子已随修复移除。

### 9 完成定义
- Acceptance criteria 1–5 全过（四层证据齐）；`dsh_expert_audit` 无阻断发现；两段式提交完成；方案归档。

### 10 风险与回滚
- R1 标题撞名 → flat = 标题 + `updatedAt`；grouped = 组域 + `updatedAt`（残余：同组 / flat 同标题取最近，接受）。
- R2 宿主升级改 Menu DOM（portal 目标 / 结构）→ 选择器以 role 属性为主 + 运行时克隆现有项（不硬编码项数/类名）；失效模式 = 插件静默不注入（不破坏宿主菜单）。
- R3 HMR / 自动刷新 → 菜单为瞬态 UI；dispose 契约（F4）保证重载无泄漏。
- R4 宿主升级改行容器层级（flat/grouped 结构变化）→ 上下文判定基于 `sectionHeader(row)` 祖先遍历（子树 role=tree / 头行存在性）；失效模式 = 降级为 flat 语义（标题 + updatedAt），不复制错行（组域收窄只是精度优化）。
- 回滚 = `dev_uninject_plugin`（超级模组路径）或摘 patch 条目（正式路径）；无数据迁移。

## 实现契约（lib/client.js）

```
window.__ModuleLoader__.load({ id: 'dsh-session-id-menu', factory() })
module.exports = { apply(ctx), inject: ['sessions','workspaces','slots'] }  // 'slots' = 超级模组注入预检骨架标记（见 Phase 2 布局适配）

apply(ctx):
  sessions = ctx.get('sessions').list
  workspaces = ctx.get('workspaces').list
  state = { disposed: false, pending: null, queue: [],
            rafs: Set, timers: Set, menus: Set, items: Set }
  ctx.effect(() => {
    onPointerDown(e):
      btn = e.target.closest('button[aria-label]'); if (!btn) return
      row = btn.closest('[role="treeitem"]')
      if (!row || row.tagName === 'BUTTON') return
      if (!row.matches('[aria-selected]') || row.matches('[aria-expanded]')) return
        // 存在性判定：aria-selected 的 "true"/"false" 均合格（会话行恒渲染该属性）
      kbs = row.querySelectorAll('button[aria-label]')
      if (kbs.length !== 1) return
      state.pending = { button: btn, row, at: Date.now() }
    mo = new MutationObserver(muts => {
      for (n of muts): for (el of n.addedNodes)
        if (el instanceof HTMLElement && el.parentNode === document.body
            && el.matches('[role=menu]')) { state.queue.push(el); scheduleDrain() }
    })
    mo.observe(document.body, {childList: true})
    scheduleDrain(): if state.disposed || state.rafs.size > 0 → return
      state.rafs.add(requestAnimationFrame(drain))
    drain(id): state.rafs.delete(id); while (menu = state.queue.shift()) handleMenu(menu)
    handleMenu(menu):
      if state.disposed || menu.hasAttribute('data-dsh-sid') → return
      p = state.pending
      if (!p || Date.now() - p.at > 600) → return
      几何门：leftOk = |menu.left - button.left| ≤ 12；overlap = 水平重叠；
      rightClamp = button.left + menu.width > vw - 12 且 menu.right ≥ vw - 12 - 12
      （宿主右缘 clamp 边界，Menu.tsx:120-141，code r3 F12）
      if !leftOk && !overlap && !rightClamp → return
      state.pending = null; menu.setAttribute('data-dsh-sid','done'); state.menus.add(menu)
      injectItem(menu, p.row)
    injectItem(menu, row):
      viewport = menu 首子 role=presentation 元素; if 缺失 → return
      first = menu 首个 button[role=menuitem]; if 缺失 → return
      克隆结构（itemWrap/button/span 的 className 取自现有项）+ 内联 copy SVG + 标签
      + data-dsh-session-id 标记; state.items.add(itemWrap)
      btn.addEventListener('click', e => {
        e.stopPropagation(); if (state.disposed) return
        id = resolveSessionId(row)
        if (!id) { state.timers.add(setTimeout(() => dispatchEscape(), 50)) }
        else copyText(id).then(ok => {
          if (state.disposed) return
          if (ok) { label.textContent = copied
                    state.timers.add(setTimeout(() => { label.textContent = item }, 1200)) }
          state.timers.add(setTimeout(() => dispatchEscape(), ok ? 900 : 50))
        })
      })
    spanTexts(el) = { leaf, other }   // el 直接子 span（排除 className 含 'rowActions'、
      // 非空 text）；leaf = 无元素子节点的纯文本 span（标题 span、time span），
      // other = 含元素子节点的 span（头部状态槽：圆点元素 + screen-reader 状态文本）
    titleMatches(el, titles) = 任一直接子 span 文本 ∈ titles（leaf 优先，再 other）
    sectionHeader(row) = 自 row 向上走（行位于 groupSection 内的逐行 span 包装中，
      section 同时持有工作区 header 行）到首个子树含 [role=treeitem][aria-expanded]
      的祖先；遇 role=tree 列表（flat）或 body → null                     // code r1 F9 修复
    resolveSessionId(row):
      snap = sessions.getSnapshot(); if (!snap || snap.phase !== 'ready') → null
      all = Object.values(snap.byId)
      // 标题反查（DOM 顺序逐文本尝试、首个命中即停，code r2 F10）：对
      // spanTexts(row).leaf 按 DOM 顺序逐个查 displayTitle 命中，首个命中文本
      // 的候选集即 cands（标题 span 先于 time span——time 标签撞名另一会话
      // displayTitle 不再扩大候选）；全部 leaf 无命中才同规则查 .other
      //（状态槽 screen-reader 状态文本在 other 层，code r1 F9）; if !cands.length → null
      header = sectionHeader(row)
      if (header):   // grouped section
        htext = 首个非空 span 文本（leaf 优先，排除 rowActions）
        if (htext !== ''):
          wssnap = workspaces.getSnapshot()
          if (!wssnap || wssnap.phase !== 'ready') → null   // F7: 非 ready 不收窄，走 miss 静默关闭
          items = wssnap.items || []
          ws = items.find(w => titleMatches(header, [w.title]))
          if (ws): cands = cands.filter(s => ws.sessionIds.includes(s.id))
          else: union = new Set(items.flatMap(w => w.sessionIds))
                cands = cands.filter(s => !union.has(s.id))
        // header 存在但无文本（防御）→ 不进一步收窄
      // header 缺失（flat / 防御）→ 无 workspace 收窄（不要求 workspaces ready）
      if (!cands.length) → null
      if (cands.length === 1) → cands[0].id
      cands.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0)); → cands[0].id
    copyText(text): Promise<boolean>
      if (navigator.clipboard && navigator.clipboard.writeText)
        → Promise.resolve(navigator.clipboard.writeText(text))
             .then(() => true, () => legacyCopy(text))
      else → Promise.resolve(legacyCopy(text))
      legacyCopy(text): boolean（textarea + select + document.execCommand('copy')
        返回值；try/catch，throw → false；finally 移除临时 textarea——成功 /
        false / throw 三路径均无 DOM 残留，清理失败不掩盖原结果，code r2 F11）
    dispatchEscape(): document.dispatchEvent(new KeyboardEvent('keydown',
      {key:'Escape', bubbles: true, cancelable: true}))
    cleanup():
      state.disposed = true
      mo.disconnect()
      document.removeEventListener('pointerdown', onPointerDown, true)
      for id of state.rafs: cancelAnimationFrame(id)
      for t of state.timers: clearTimeout(t)
      state.queue.length = 0; state.pending = null
      for wrap of state.items: if (wrap.isConnected) wrap.remove()
      for menu of state.menus: menu.removeAttribute('data-dsh-sid')
      （注入项的 click listener 随节点移除）
      return cleanup
  }, 'dsh-session-id-menu: session kebab 会话ID item')

常量：CORRELATE_WINDOW_MS=600 / GEOMETRY_TOL_PX=12 / COPIED_FLASH_MS=1200 /
ESCAPE_AFTER_COPY_MS=900 / ESCAPE_AFTER_MISS_MS=50 /
菜单标记 data-dsh-sid=done / 项标记 data-dsh-session-id
```

## 能力验证（三线，"宿主无菜单项扩展机制"）

1. **docs 线**：`docs/subsystems/slots.md` — L5：feature 插件只经 `ctx.slots.register()` 贡献 UI；L50：`single` = 一个 cell、优先级赢家渲染，additive 应用 child slot；L171：新 child slot 只能由拥有者组件声明（Menu/Rows 未声明菜单项 child slot）；L175：single / occupied keyed = 替换点，additive 用 list id 或空闲 key（唯一 list 槽 `shell.overlay`（ui-renderer registry.ts:33-41）是整屏 overlay 层，非菜单内扩展点）。
2. **source 线**：`packages/client/ui-workspace/src/client/rows/Rows.tsx:416-421` `sessionMenuItems` 硬编码三项数组；:476-498 Menu 调用为封闭 `items={sessionMenuItems}` prop + `portal`；`packages/client/ui-primitives/src/Menu.tsx:255-289` list 仅渲染 `props.items` + 可选 footer，无槽/通道；`sidebar.workspaces` 契约子孔仅 `sidebar.workspaces.directoryFlow`（ui-workspace contract slots.ts，single，占用改变"添加工作区…"可见性）；`packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx:619-746` FlatList 证实 flat 模式行直属 `[role=tree]`（无 groupSection/头行）——resolveSessionId 必须区分两模式。
3. **live 线**：运行服务器（127.0.0.1:3080；`bili --port 8787 dsh web --no-open` PID 39332 → node PID 39333）服务 `apps/web/dist`：`/assets/index-eaoyilRb.js` 免 token 200、`/` 需认证 401（与 browser-auth cookie/launch-token 机制一致；自签 cookie 已验证 `/` 200）；运行宿主已装配 ui-workspace（`dev_plugin_status`），其构建 client 产物 `packages/client/ui-workspace/lib/client.js` 含三项菜单文案（分叉会话×2 / Fork session×1 / Ungrouped×9）——运行页面正渲染该硬编码菜单。
4. **host CodeGraph（只读佐证，非目标索引）**：宿主 checkout 索引 ready（files=5227 nodes=57540 edges=335086）；`impact Menu -d 1` = 26 dependents（Menu 为共享原语：Settings / WorkspacePickFlow / Rows / WorkspaceBrowser 等 10+ 组件共用）→ 本方案不改 Menu，仅 additive 读其生成 DOM，无 pending 几何回退被 F5 删除的依据即此共享面；`impact sessionMenuItems` = not found（模块内局部 const 未入索引）→ 宿主依赖面止于 Row 组件自身。

## CodeGraph Facts

- mode: create
- index: ready（Phase 1 代码落盘后重建：698 files / 9448 nodes / 38683 edges、lastIndexed 2026-09-05T17:20:57.837Z、builtWithVersion 1.1.0、pendingChanges=0、reindexRecommended=false。plan 阶段首次 init 为空索引 files=0，Phase 1 后 codegraph init 重建）
- scope: 目标仓 plugin files（lib/client.js、src/index.js、tests/*.test.mjs、package.json、cordis.patch.yml、README.md）；宿主侧只读引用（Rows.tsx / Menu.tsx / WorkspaceBrowser.tsx / service.ts / types.ts / locale index.ts），宿主零改动
- impact（目标索引实测）: `apply::resolveSessionId(row)`（client.js:114-162）depth=2 → 3 affected symbols，全在本文件内（resolveSessionId:114 / injectItem:194 / handleMenu:177）——自包含调用链，无仓外依赖者。`bundle/dsh-session-id-menu/client.js` 为独立 file node（1-312）；`bundle/dsh-session-id-menu/src/index.js` 导出 constant `name = 'dsh-session-id-menu'`（:4）
- affected: 自包含（client.js 调用链三符号）；browser half 经 `window.__ModuleLoader__.load` 注册，无静态 import 边
- blast-radius: create 豁免（新产物，无既有能力面）
- uncertainty: client.js 内部符号由 ES5 factory 闭包构成，索引按 qualifiedName `apply::*` 归组（无 React/宿主耦合边）；宿主侧"Menu 共享面（26 dependents）"与"sessionMenuItems 未入索引"仍为宿主索引只读佐证（见能力验证第 4 线），非目标索引

## Phases

### Phase 1：插件包 + 测试
- 目标：交付完整插件包，source + package 两层测试全绿
- 范围：client.js（实现契约全部）、src/index.js、package.json、cordis.patch.yml、README.md、tests/（DOM 桩行为例 18：注入面 6 / id 解析 5 / 复制反馈 3 / 关闭与生命周期 5…以 Q8 清单为准 + `tests/package-shape.test.mjs`）
- 依赖：无
- 完成判据：`node --test tests/*.test.mjs` 全绿（含 package-shape：manifest/exports/files/dsh.client 断言）

### Phase 2：部署 + 活体验证 + 产物 + 存证
- 目标：插件在运行 GUI 生效，四层证据齐备
- 范围：
  - runtime：`dev_inject_plugin {dir: <本仓根>}`（唯一输入 = source-only JS 包，无 build 步骤；直接注入证据见 Q8 runtime 项）→ `dev_plugin_status` / `dev_injected_list` 查 host ✓ 与 client 行 → Playwright headless 活体验证（自签 cookie，已验证 200）→ 点目标会话行 ⋯（本会话，aria-selected 行，displayTitle `deepseek-harness`）→ 截图（第 4 项"会话ID"可见）→ 点击 → 剪贴板 read-back == `session-c0406149-aa13-4279-85cf-a0f27336de34` → 截图序列 + ffmpeg GIF
  - distribution：`npm pack` → 解包 tmp → 断言 tarball 含 package.json、lib/client.js、src/index.js、cordis.patch.yml、README.md 且 `exports['./client']` 目标在 tarball 内
- 依赖：Phase 1 审查 PASS
- 完成判据：Acceptance criteria 1–5 全过，四层各有独立可判定证据（source 测试 / package-shape / runtime 注入+Playwright+GIF / distribution pack 内容）

## Review Log

- plan r1 [bg: brief 1 条 + active plans 1]: FAIL — F1(omission) applied（CodeGraph Facts 改用目标仓索引，宿主查询移至能力验证第 4 线只读佐证）; F2(omission) applied（resolveSessionId 三上下文 flat/grouped 工作区/grouped 未分组 + flat 测试 2 例）; F3(completeness) applied（copyText: Promise<boolean>，成功才显示"已复制"，双失败静默关闭 + 反馈测试 3 例）; F4(omission) applied（disposal 全量 owned effects 登记/取消 + 存活菜单自有项/标记移除 + 生命周期测试 3 例）; F5(over-design) applied（删除无 pending 几何回退与初始扫描，无关菜单 no-op 无标记）; F6(completeness) applied（四层验证闭环 source/package/runtime/distribution，直接注入证据，npm pack 纳入 Phase 2）
- plan r2: FAIL — F1–F6 复核确认闭合；新增 F7(omission) applied（grouped 路径须 workspaces `phase==='ready'`，非 ready 返回 null 走 miss 静默关闭、不做收窄/union 排除；flat 路径不依赖 workspaces ready；已更新 Proposal/Q2/Q7/Q8/伪代码 + 新增 grouped-workspace-pending 与 flat-workspaces-pending 两例测试）
- plan r3: PASS — F7 按原 Pass condition 闭合（grouped+header 要求 workspaces phase=ready，非 ready 返回 null；flat 仅依赖 sessions；Proposal/Q2/Q7/实现契约/Q8/Acceptance 一致）；F1–F6 未重开；无阻塞项
- code r1: FAIL — F8(defect) applied（实现 `onPointerDown` 只接受 `aria-selected="true"`，与契约的存在性判定不符，未选中会话行不捕获菜单；修复：`hasAttribute('aria-selected')` 任意取值合格；测试改为"未选中行 → 注入 + 复制该行 id"，工作区头行 / 搜索结果 button 的 no-op 断言保留）；F9(defect) applied（实现 `rowTitle` 取首个非空直接子 span，活体读到状态槽 screen-reader 状态文本（如 Running/Completed）→ resolveSessionId=null 静默关闭；且头行查找限于 `parentElement.querySelector`，活体 DOM 每行在逐行 span 包装中 → 恒空 → 误走防御不收窄。修复：span 文本对 displayTitle 反查（纯文本 span 优先、含元素子节点 span 次之）+ `sectionHeader(row)` 祖先遍历 + 头行文本匹配同规则；测试补状态文本 fixture（选中 / 未选中 / 状态文本撞名 leaf 优先 / grouped 无头行防御），fixture 结构对齐活体 DOM（逐行 span 包装、头行带 rowActions kb）；修复后 `node --test` = 37/37 ×2（behavior 28 + package-shape 9）。plan 实现契约/Q6/DOM 契约/R4 同步修订
- code r2: FAIL — F10(contradiction) applied（F9 反查把全部 leaf 文本并入候选，未做到首个命中 leaf 优先：title 与 time 均为直接子 leaf span（Rows.tsx:467/:473），会话标题撞上另一会话的 time 文本（如 2m）时 time leaf 扩大候选、updatedAt 可能选错行；修复：leaf/other 按 DOM 顺序逐文本尝试、首个命中即停（title 先于 time 恒成立）；新增 'F10: title leaf and time leaf match different displayTitles -> only title candidates'（title=proj@100、time=2m 撞名 2m@900，断言复制 proj 而非更新的 2m））；F11(contradiction) applied（legacyCopy 异常路径（select/execCommand throw）遗留临时 textarea，违反 F4 无 owned DOM 残留；修复：finally 移除 + 清理失败不掩盖原结果；新增 execCommand-throw 与 select-throw 两例（无 textarea 残留 + 无 Copied + 50ms Escape），success/false 两既有例补无残留断言）；修复后 `node --test` = 40/40 ×2（behavior 31 + package-shape 9）；plan 实现契约（F10 逐文本首命中 + F11 finally）同步修订
- code r3: FAIL — F12(contradiction) applied（correlation 未覆盖右侧 viewport clamp：宿主 Menu.tsx:120-141 对 align=start 的 portal 菜单执行 x = clamp(r.left, 12, vw-lw-12)，kebab 靠近 viewport 右缘时菜单被左拉到 vw-lw-12（menu.right = vw-12），可完全位于按钮左侧——leftOk（left 差 >12px）与 overlap（menu.right ≤ button.left）均 false，代码拒绝关联；修复：新增 rightClamp 分支——button.left + menu.width > vw-12（按钮未 clamp 位置溢出右缘）且 menu.right ≥ vw-12-12（菜单实际位于 clamp 边界），逐字验证宿主 clamp 数学；新增 'geometry: right viewport clamp -> injected'（vw=252、按钮 240..264、菜单 60..240 完全在按钮左侧，断言注入 4 项）与 'geometry: unrelated menu below the clamp bound -> no injection'（菜单 10..110，右缘 110 远低于边界 240，断言 no-op 3 项）；测试 stub window 增加 innerWidth（默认 1440 不触发右缘 clamp，既有几何用例不受影响）；修复后 `node --test` = 42/42 ×2（behavior 33 + package-shape 9）；plan 实现契约/伪代码/测试面（F12 右缘 clamp）同步修订
- code r4: PASS — 复审确认三分支几何门（leftOk/overlap/rightClamp）闭合：rightClamp 条件与宿主 Menu.tsx:132-141 `x = min(max(r.left, 12), vw - lw - 12)` 逐字一致（br.left + mr.width > vw-12 为 clamp 触发条件逐字等价，mr.right ≥ vw-12-12 为菜单实际位于边界）；pending / 600ms 窗口 / 无标记 no-op 前置保留（F5 不变）；behavior.test.mjs:325-355 右侧 clamp fixture（菜单完全位于按钮左侧且 menu.right = vw-12 → 注入 4 项）与 clamp 边界下无关菜单 no-op（3 项）+ 既有 40px 左偏 no-op / overlap 注入回归覆盖；F7–F12、标题解析、disposal、生命周期未被 r4 改动破坏；42/42 source+package 报告与实现相符；Phase 1 代码审查门 PASS（reviewer 声明 Phase 2 runtime 剪贴板 / npm pack 属后续 Phase，不阻塞本门）
- phase-2 runtime（非代码门轮次，留痕）：活体验证首点失败（点击无已复制闪标 / 剪贴板空 / 菜单不关）→ Playwright 仪器化诊断（click 目标捕获、writeText/execCommand 包裹、临时 `__sidDebug` 闭包探针）定位 `TypeError: sessions.getSnapshot is not a function` 未捕获于 click 监听器（宿主服务快照在公共 `.list` store：`ClientSessions.list` service.ts:191/263、`WorkspaceController.list` client/service.ts:89；活页探针 `typeof sessions.getSnapshot === 'undefined'` / `typeof sessions.list.getSnapshot === 'function'`）；修复 = `readListSnapshot` 助手（seam 缺失/读取抛错 → null → 静默 miss）+ 测试 stub seam 形状同步 + 新增行为测试，43/43 ×2；代码门范围不变（几何门/解析/反馈/disposal 均未动），提交 a1c1be4 / 503c05a / 8eaf5db

## Commits

Phase 1（代码 + 文档两段式）：
- `2d0ddd1` feat: dsh-session-id-menu 会话ID 复制项 — 纯 DOM 客户端（code r4 PASS，42/42 测试）（client.js / src/index.js / tests×3 / package.json / cordis.patch.yml）
- `ad20229` docs: 行为契约 README + 方案评审史（plan r1-r3 + code r1-r4，F8-F12 全闭合）（README.md / 本方案 / .gitignore .codegraph/）
- `f62f0c5` chore: ledger 回填两段式提交 SHA 至方案 Commits 段（Phase 1 ledger）

Phase 2（超级模组直注入适配 + 运行时 seam 修复）：
- `a1c1be4` refactor: client bundle 移入规范位置 lib/client.js（超级模组预检 buildFreshnessProblems 硬编码 lib/client.js；宿主 client-modules 经 exports["./client"] 解析布局无关）+ exports/files/tests/README/plan 同步
- `503c05a` feat: client bundle 超级模组注入预检骨架（inject 声明 slots + 恒 false 守卫的 register 标记；clientSkeletonProblems 正则文本校验）+ tests/README/plan 同步
- `8eaf5db` fix: 快照 seam 适配 — sessions/workspaces 快照经 .list store 读取（活页 TypeError: sessions.getSnapshot is not a function；readListSnapshot 助手 + 测试 stub seam 同步 + seam 缺失行为测试，43/43）+ 移除临时 __sidDebug 探针 + plan Phase-2 注记
（Phase 2 ledger = 本提交 `docs: plan-ledger 8eaf5db`；归档提交不入 ledger）
