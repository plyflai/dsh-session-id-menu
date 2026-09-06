# dsh-session-id-menu

[English](./README.md) | [中文](./README.zh-CN.md)

<p align="center">
<strong>在 Workspace 侧边栏直接复制会话 ID</strong>
<br />
一个 ⋯ 菜单项 —— <em>零依赖、纯 DOM、失败静默缺席</em>
</p>

<p align="center">
<a href="https://github.com/plyflai/dsh-session-id-menu/releases"><img src="https://img.shields.io/badge/version-0.1.0-181717?style=flat-square" alt="version"></a>
<a href="https://github.com/plyflai/dsh-session-id-menu/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-181717?style=flat-square" alt="license"></a>
<a href="https://github.com/plyflai/dsh-session-id-menu"><img src="https://img.shields.io/badge/GitHub-plyflai%2Fdsh--session--id--menu-181717?style=flat-square&logo=github" alt="GitHub"></a>
</p>

<p align="center">
<code>dsh plugin --profile &lt;name&gt; add https://github.com/plyflai/dsh-session-id-menu/releases/download/v0.1.0/dsh-session-id-menu-0.1.0.tgz</code>
</p>

---

`dsh-session-id-menu` 在 DeepSeek Harness Web GUI 的 Workspace 侧边栏里，为每条会话行的 `⋯`（kebab）菜单加一个 **Session ID（会话ID）** 项。点它即把该行会话的 id 复制到剪贴板，标签闪一下 "Copied（已复制）"，然后自动关菜单。

## 为什么

会话 id（如 `s-066d994e...`）目前只有在点进会话后才会出现在状态栏，UI 上没有第二条路径能拿到它。复制一次需要：点进会话 → 找状态栏 → 选中 id → 手动复制。这个插件把它变成一步：`⋯` → **会话ID** → 剪贴板。

## 工作原理

这是一个**纯 DOM 客户端插件**：无 React、零 npm 依赖、无构建步骤。浏览器侧（`lib/client.js`，`window.__ModuleLoader__.load` 工厂，零 import）只观察宿主 DOM 并关联自己的事件：

```
[kebab 按下] ─► 关联 portal 到 document.body 的 [role=menu]（600ms 窗口 + 12px 几何）
                └► 注入 Session ID 菜单项
[点 Session ID] ─► 从 sessions / workspaces 控制器快照反解该行会话 id
                └► navigator.clipboard.writeText（execCommand 回退）
                └► 标签闪 "已复制"，借宿主自己的 Escape 处理器关菜单
```

- **行消歧** —— `displayTitle` 不唯一，所以 id 靠「行内 span 文本 反向匹配 快照 displayTitle」恢复（纯文本 span 优先，状态槽/时间文本永远不会被误当标题），再用该行的工作区分组（对照 `workspaces` 快照的 `sessionIds`）收窄；同名候选仍在时按最新 `updatedAt` 兜底。
- **按设计静默降级** —— 快照缺失 / 非 `ready`、或宿主 DOM 不再匹配契约时，退化为**静默 miss**（菜单照常关闭，不向宿主渲染路径抛错）。不兼容宿主上的最坏结果是「菜单项不出现」，而不是「GUI 坏了」。插件卸载时，全部自持效果（观察者、rAF、定时器、注入项、菜单标记）都会回收，不留 DOM 残骸。

## 安装

前置条件：**Node ≥ 22**、PATH 上有 `pnpm`、一个 DSH profile（`~/.dsh/profiles/<name>/`）。

**版本锁定（推荐）** —— release tgz 是字节级冻结的工件，任何机器上比特一致：

```bash
dsh plugin --profile <name> add https://github.com/plyflai/dsh-session-id-menu/releases/download/v0.1.0/dsh-session-id-menu-0.1.0.tgz
```

**跟随最新（git）** —— 永远取 `main` HEAD（无基线承诺）：

```bash
dsh plugin --profile <name> add github:plyflai/dsh-session-id-menu
```

升级 / 卸载（同样式）：

```bash
dsh plugin --profile <name> update dsh-session-id-menu
dsh plugin --profile <name> remove dsh-session-id-menu
```

两点须知：

- 安装落在 **profile 目录**（`~/.dsh/profiles/<name>/node_modules`），不是你的任何源码仓库。你的仓库叫什么名、什么布局，对这个插件都无关。
- 装完**必须重启 DSH**（fiber 在装配时加载，不走热更）。

## 验证

重启后三步：

1. 会话行的 `⋯` 菜单里出现 **会话ID**（英文界面为 Session ID）。
2. 点它 —— 标签闪 **已复制**（Copied）。
3. 粘贴 —— 剪贴板里是这行的会话 id。

回归验证跑在 Playwright 里的真机 DSH GUI（真实 kebab 菜单 + 真实快照 seam）上；包本身带 `npm pack` + `node --test`（行为 + 包形状用例，零依赖，手写 DOM stub，不依赖 jsdom）。

## 可移植性与排障

**已测试基线：** DeepSeek Harness commit `8541330cde`（2026-09-05，v0.1.3-alpha.1）。插件行为异常时，先拿你的 harness commit 跟这个基线比对。

| 现象 | 可能原因 |
|---|---|
| `⋯` 菜单里始终没有该项 | DOM 契约漂移 —— 行 / kebab / Menu 结构在上游变了；比对 harness commit |
| 项在，但点了只关菜单 | 快照 seam 漂移 —— `sessions.list.getSnapshot()` / `workspaces.list.getSnapshot()` 的布局或 `phase` 变了 |
| 插件列表里有，但没有任何行为 | fiber 未激活 —— `dsh --profile <name> --dump-config` 看装配行，然后重启 DSH |

GUI devtools 控制台快速断言（刚打开 `⋯` 菜单时）：

```js
document.querySelector('[data-dsh-session-id]') // 注入成功则非 null
```

**为什么它不会搞坏你的机器：** 产物零 npm 依赖（无版本冲突、无构建脚本会被 pnpm 拦截）、发布代码零 import、无绝对路径 —— 它从不引用你的源码仓库，安装落在 profile 目录。唯一的跨机依赖是宿主运行时本身，而所有宿主 seam 都是防御性读取；不匹配时是静默 miss，不是崩溃。

## 开发

```bash
cd plugin/dsh-session-id-menu
npm test            # node --test tests/*.test.mjs
npm pack            # 打可分发的 tgz（files: src、lib/client.js、cordis.patch.yml、README）
```

在 dsh-dev checkout 里也可以装本地副本：`dsh plugin --profile web add plugin/dsh-session-id-menu`（相对路径以调用者 cwd 为锚点）。

## 状态

早期（v0.1.0）。行为针对上面钉住的 harness 基线验证过；快照 seam 与 DOM 契约可能随宿主演进漂移 —— 届时预期是插件侧发新版，而不是宿主侧修。

## 许可证

MIT
