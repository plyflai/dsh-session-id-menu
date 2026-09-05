# Plan: dsh-session-id-menu — 会话行 ⋯ 菜单新增「会话ID」复制项

Status: active
Target: client-plugin (bundle basket) · web / browser DOM
Branch: main

## Problem

Web GUI 侧边栏每个会话行的三点菜单（⋯）当前硬编码三项（重命名 / 分叉 / 归档，`packages/client/ui-workspace/src/client/rows/Rows.tsx:416-421` `sessionMenuItems`），宿主没有任何"菜单项扩展"机制：`Menu` 组件（`packages/client/ui-primitives/src/Menu.tsx`）只接受完整 `items` prop，`sidebar.workspaces` 槽为 `kind:single`（ui-sidebar contract slots.ts:35），其唯一子孔 `sidebar.workspaces.directoryFlow` 被占用会改变"添加工作区…"入口可见性（副作用）。用户需求：会话行三点菜单出现"会话ID"项，点击即复制该行会话的 ID 到剪贴板。

## Proposal

新建独立 client 插件仓库 `dsh-dev/bundle/dsh-session-id-menu`（本仓库），纯 DOM 形态（零 import，`window.__ModuleLoader__.load` 工厂，复刻 `dsh-workspace-folder-order` 先例）：

- 单个 `ctx.effect`（client.js）：
  1. **入口捕获**：document `pointerdown`（capture）。命中"会话行 ⋯ 按钮"→ 记 pending 关联 `{button, row, at}`。会话行 = `[role="treeitem"][aria-selected]:not([aria-expanded])`（工作区行是 `[aria-expanded]` 且无 `aria-selected`）；⋯ 按钮 = 行内（descendant）唯一 `button[aria-label]`（工作区行有两个按钮：⋯ + 新建会话加号；搜索结果行自身即 button，行内无嵌套按钮 → 自然排除）。
  2. **菜单观测**：`MutationObserver` 监听 `document.body`（childList）；Menu 组件把菜单列表 `createPortal(list, document.body)`（Menu.tsx:289），故新出现的 body 直接子节点 `div[role=menu]` 入队，rAF 排空（React placement layout-effect 在 paint 前同步执行，rAF 时读到最终位置）。
  3. **归属关联**：600ms 窗口内 menu.left ≈ pending.button.left（容差 12px）→ 归属该会话行；无 pending 时几何回退（扫描全部会话行 ⋯ 按钮按 left 匹配、top 差最小者）。未归属的菜单（工作区菜单、设置等其他组件菜单）原样不动（`data-dsh-sid=skip`）。
  4. **注入第四项**：克隆现有 `div.itemWrap > button[role=menuitem]` 结构（itemWrap/button/图标 span/标签 span 的 className 全部取自现有项），图标 = 内联 SVG（ui-primitives `IconCopyOutline16` 双 path），标签 = `document.documentElement.lang` 以 `zh` 开头 → "会话ID"，否则 "Session ID"；按钮带 `data-dsh-session-id` 标记防重复注入；追加到菜单首子 `div.viewport[role=presentation]`（Menu.tsx:266）。
  5. **点击行为**：解析 session id → `navigator.clipboard.writeText`（失败回退 `execCommand('copy')`）→ 标签闪"已复制"/"Copied"（1200ms 恢复）→ 900ms 后 document 派发 `keydown Escape`（Menu 有 document 级 keydown 监听，Escape 即关，Menu.tsx:157-178；已关则无监听，no-op）；解析失败（phase≠ready / 标题未命中）时 50ms 后同样派发 Escape 静默关闭。
  6. **id 解析**（`resolveSessionId(row)`）：行直接子 span 的 textContent 与 sessions 快照 `byId[*].displayTitle` 精确匹配得候选 → 组域收窄（`row.parentElement` groupSection 的 `[role="treeitem"][aria-expanded]` 头行标题匹配 workspaces 快照 `WorkspaceView.title` → `sessionIds` 集；不匹配 = 未分组桶 = 不属于任何 workspace 的会话集）→ 多候选取 `updatedAt` 最新。
  7. **cleanup**：`observer.disconnect()` + 移除 pointerdown 监听。
- 数据通道：`ctx.get('sessions').list`（`SnapshotStore<SessionListState>`，`{phase, ids, byId}`，service.ts:69-87）与 `ctx.get('workspaces').list`（`{phase, items: WorkspaceView[]}`，types.ts:15-27）；locale 读 `document.documentElement.lang`（zh 激活时 locale client 置 `zh-CN`，locale client index.ts:149）。
- 宿主半边 no-op（`src/index.js` = folder-order 同形模板）；package.json `dsh.client` 清单 `platform:'web'`、`inject: ['@deepseek-ai/dsh-api-session-controller','@deepseek-ai/dsh-api-workspace-controller']`（informational）。
- 附带 `cordis.patch.yml` 供正式装配路径；本验证走 `dev_inject_plugin` 超级模组注入（免 patch 重启）。

## Acceptance criteria

1. zh GUI 下任意会话行 ⋯ 菜单显示 4 项，第 4 项 = "会话ID"；en 下 = "Session ID"。
2. 点击"会话ID"→ 该行 session id（`session-<uuid>` 形态）进入剪贴板；标签短暂闪"已复制"；菜单随后自动关闭。
3. 工作区行 ⋯ 菜单不受影响（不新增项）；其他组件菜单（视图选项、设置等）不受影响。
4. 同一菜单不重复注入；菜单关闭（portal 移除）后无 observer/监听泄漏。
5. `node --test tests/*.test.mjs` 全绿；`dev_inject_plugin` 成功且运行态可查；headless GUI（Playwright 活体 127.0.0.1:3080）点击目标会话 ⋯ → "会话ID"，剪贴板读回 == 该会话 id；截图序列合成 GIF 存证。

## 十问（L2 选问：1/2/3/5/8/9/10 + 插件级必问 6）

### 1 范围闭合
- 需求面 = 会话行 ⋯ 菜单；不改：现有三项菜单项行为、工作区行菜单、搜索结果行（自身即 button、无嵌套 ⋯）、行 HoverCard 复制（宿主既有，共存）。
- 当前缺口 = 宿主无菜单项扩展槽（三线验证见下）→ additive DOM 注入为唯一可行形态（harness 只读铁律；槽机制上游 PR 为后续项，不在本方案）。
- 失败面 = displayTitle 撞名：组域收窄 + `updatedAt` 决胜；残余风险（同组同标题）取最近者，接受并记录（R1）。

### 2 接口契约
- **DOM 契约（只读）**：会话行 `[role="treeitem"][aria-selected]:not([aria-expanded])`（Rows.tsx:423-501；工作区行 Rows.tsx:133-196 两按钮）；⋯ 按钮 = 行内 descendant 唯一 `button[aria-label]`；菜单 = body 直接子 `div[role=menu]`（portal，Menu.tsx:289）；项容器 = 菜单首子 `div.viewport[role=presentation]`（Menu.tsx:266）；现有项 = `div.itemWrap > button[type=button][role=menuitem] > span(itemIcon?) + span(itemLabel)`（Menu.tsx:192-249）；关闭 = document 级 `pointerdown` 外部点击 / `keydown` Escape（Menu.tsx:157-178）。
- **数据契约**：sessions 快照 `{phase:'ready', ids: SessionId[], byId}`，`byId[id].displayTitle` / `.updatedAt`；workspaces 快照 `{phase, items: WorkspaceView[]}`，`WorkspaceView.title` / `.sessionIds`。
- **行为契约**：新项仅出现在会话行菜单；点击 = 复制 + 反馈 + 自动关闭；解析失败 = 静默关闭，不改变菜单原状。

### 3 落点与兼容
- 落点 = 本仓库（bundle basket 新 git 仓）；harness 零改动（铁律）；不占宿主任何槽（不用 `ctx.slots.register`，规避 `single` 槽替换语义与 `root` 影子化）。
- 兼容：未注入 = 零差异；注入后仅会话行菜单多项；与 dsh-ui-tweak（CSS 覆盖，不涉菜单结构）、dsh-workspace-folder-order（只重排 groupSection，行结构不变）正交。
- CSS module 类名随构建哈希变化 → 定位只依赖 role 属性 + DOM 结构 + 文本；类名仅克隆用于视觉一致。

### 4 依赖与顺序
- Phase 1（仓库 + client.js + 测试）→ Phase 2（部署 + 活体验证）；无并行。

### 5 触发与入口
- 入口 = 用户点会话行 ⋯（宿主既有 Menu 打开）；插件仅由菜单 portal DOM 事件触发，不新增自身入口。
- 不触发路径（菜单关闭 / 非会话菜单 / 快照未 ready）= 行为不变。

### 6 权限与副作用
- 读：sessions/workspaces 快照、DOM、`document.documentElement.lang`；写：剪贴板（用户发起，单个 ID 串）、注入 DOM（随 portal 关闭移除）。
- 无网络、无磁盘写、无不可逆操作（剪贴板可覆盖）。

### 7 错误与失败路径
- 剪贴板失败（非 secure context / 拒绝）→ `execCommand` 回退；双失败 → 静默（不弹错误 UI，菜单为轻控件）。
- 关联错过（点击快于观测）→ pending 600ms 窗口 + 几何回退。
- effect 初始化时菜单已开 → 初始扫描 `body > [role=menu]`。
- rAF 早于 placement → rAF 必在 useLayoutEffect（同步、paint 前）之后，读到最终位置。

### 8 验证与同步
- source：`node --test tests/*.test.mjs`（DOM 桩 ≥7 例：会话菜单注入、id 解析（组域 + 同组撞名 updatedAt 决胜）、工作区菜单 no-op、en/zh 标签、防重复注入、剪贴板调用、escape 派发）。
- package：package.json 形态对照 folder-order 先例（`exports["./client"]` + `dsh.client` 清单）。
- runtime：`dev_inject_plugin` → `dev_plugin_status` / `dev_injected_list` 查装配。
- distribution/GUI：Playwright headless 活体验证（cookie 自签，只读计算不改盘，机制见 browser-auth.ts：`dsh-auth-<authority>` = `v1.<b64url(JSON{version,authority,issuedAt,expiresAt})>.<b64url(HMAC-SHA256(secret,body))>`，secret = `$DSH_HOME/.credentials.yaml` `client-connection/browser-session`）→ 截图 + ffmpeg GIF。

### 9 完成定义
- Acceptance criteria 1–5 全过；`dsh_expert_audit` 无阻断发现；两段式提交完成；方案归档。

### 10 风险与回滚
- R1 标题撞名 → 组域 + `updatedAt`（残余：同组同标题取最近，接受）。
- R2 宿主升级改 Menu DOM（portal 目标 / 结构）→ 选择器以 role 属性为主 + 运行时克隆现有项（不硬编码项数/类名）；失效模式 = 插件静默不注入（不破坏宿主菜单）。
- R3 HMR / 自动刷新 → 菜单为瞬态 UI，无状态需保持。
- 回滚 = `dev_uninject_plugin`（超级模组路径）或摘 patch 条目（正式路径）；无数据迁移。

## 实现契约（client.js）

```
window.__ModuleLoader__.load({ id: 'dsh-session-id-menu', factory() })
module.exports = { apply(ctx), inject: ['sessions','workspaces'] }

apply(ctx):
  sessions = ctx.get('sessions').list
  workspaces = ctx.get('workspaces').list
  ctx.effect(() => {
    onPointerDown(e)      // 命中会话行 ⋯ → pending = {button, row, at: Date.now()}
    new MutationObserver(muts)  // body 直接子 [role=menu] 新增 → queue
      .observe(document.body, {childList: true})
    初始扫描 body 直接子 [role=menu]
    requestAnimationFrame 排空 → handleMenu(menu)
    handleMenu(menu): 已标记(done/skip) → 返回；row = correlate(menu)；
      未归属 → mark skip；归属 → mark done + injectItem(menu, row)
    injectItem(menu, row): 首子 viewport[role=presentation] + 首个现有 button[role=menuitem]
      缺失 → 返回；克隆结构（className 取自现有项）+ 内联 copy SVG + 标签 +
      data-dsh-session-id 标记；click → e.stopPropagation()
    click(e): id = resolveSessionId(row)
      id → copyText(id)；label = copied；1200ms 恢复；900ms 后 dispatch Escape
      !id → 50ms 后 dispatch Escape
    resolveSessionId(row): 见 Proposal §6
    copyText(text): navigator.clipboard.writeText → catch → legacyCopy（textarea + execCommand）
    return cleanup()      // mo.disconnect() + document.removeEventListener('pointerdown', …)
  }, 'dsh-session-id-menu: session kebab 会话ID item')

常量：CORRELATE_WINDOW_MS=600 / GEOMETRY_TOL_PX=12 / COPIED_FLASH_MS=1200 /
ESCAPE_AFTER_COPY_MS=900 / ESCAPE_AFTER_MISS_MS=50 / 菜单标记 data-dsh-sid(=done|skip) /
项标记 data-dsh-session-id
```

## 能力验证（三线，"宿主无菜单项扩展机制"）

1. **docs 线**：`docs/subsystems/slots.md` — L5：feature 插件只经 `ctx.slots.register()` 贡献 UI；L50：`single` = 一个 cell、优先级赢家渲染，additive 应用 child slot；L171：新 child slot 只能由拥有者组件声明（Menu/Rows 未声明菜单项 child slot）；L175：single / occupied keyed = 替换点，additive 用 list id 或空闲 key（唯一 list 槽 `shell.overlay`（ui-renderer registry.ts:33-41）是整屏 overlay 层，非菜单内扩展点）。
2. **source 线**：`packages/client/ui-workspace/src/client/rows/Rows.tsx:416-421` `sessionMenuItems` 硬编码三项数组；:476-498 Menu 调用为封闭 `items={sessionMenuItems}` prop + `portal`；`packages/client/ui-primitives/src/Menu.tsx:255-289` list 仅渲染 `props.items` + 可选 footer，无槽/通道；`sidebar.workspaces` 契约子孔仅 `sidebar.workspaces.directoryFlow`（ui-workspace contract slots.ts，single，占用改变"添加工作区…"可见性）。
3. **live 线**：运行服务器（127.0.0.1:3080；`bili --port 8787 dsh web --no-open` PID 39332 → node PID 39333）服务 `apps/web/dist`：`/assets/index-eaoyilRb.js` 免 token 200、`/` 需认证 401（与 browser-auth cookie/launch-token 机制一致）；运行宿主已装配 ui-workspace（`dev_plugin_status`），其构建 client 产物 `packages/client/ui-workspace/lib/client.js` 含三项菜单文案（分叉会话×2 / Fork session×1 / Ungrouped×9）——运行页面正渲染该硬编码菜单。

## CodeGraph Facts

- mode: create
- index: ready（宿主 checkout /Users/rexroth/Documents/github_proj/deepseek-harness：files=5227 nodes=57540 edges=335086，"Index is up to date"；宿主侧事实用宿主索引，目标仓库为新仓无索引——新建产物）
- scope: 新仓文件（client.js、src/index.js、tests/、package.json、cordis.patch.yml、README.md、AGENTS.md、.gitignore、.dsh-expert/*）；宿主侧只读引用：packages/client/ui-workspace/src/client/rows/Rows.tsx（SessionNodeItem 379 / ProjectRowItem 112）、packages/client/ui-primitives/src/Menu.tsx（Menu 80）
- impact: `impact Menu -d 1` → 26 dependents（Settings 行 / WorkspacePickFlow / Rows / WorkspaceBrowser 等 10+ 组件共用 Menu 原语）——本方案不改 Menu，仅 additive 读其生成 DOM，impact 面为佐证
- affected: `impact sessionMenuItems` → not found（模块内局部 const 未入索引）——宿主依赖面止于 Row 组件自身
- blast-radius: create 豁免（新产物，无既有能力面）；宿主引用面只读覆盖
- uncertainty: 目标仓无索引（create 新仓）；宿主侧 DOM 契约由源码 file:line 交叉核对 + 运行产物文案证据支撑（Menu.tsx / Rows.tsx / lib/client.js），非索引推导

## Phases

### Phase 1：仓库骨架 + client.js + 测试
- 目标：交付完整插件包，测试全绿
- 范围：client.js（实现契约全部）、src/index.js、package.json、cordis.patch.yml、README.md、tests/（DOM 桩：host 形态 / client 形态 / 行为 7 例）
- 依赖：无
- 完成判据：`node --test tests/*.test.mjs` 全绿；package 形态对照 folder-order 先例（`exports["./client"]` + `dsh.client` 清单 + `files` 清单）

### Phase 2：部署 + 活体验证 + 存证
- 目标：插件在运行 GUI 生效并产生证据
- 范围：`dev_inject_plugin`（纯 JS 包；若注入器要求构建产物则先 `dev_build_plugin`）→ `dev_plugin_status` / `dev_injected_list` 查装配 → Playwright headless 活体验证（cookie 自签）→ 截图序列 + ffmpeg GIF
- 依赖：Phase 1 审查 PASS
- 完成判据：Acceptance criteria 1–5 全过（含 headless 点击 + 剪贴板读回 + GIF）

## Review Log

（空，由审查门填写）

## Commits

（空，由两段式提交回填）
