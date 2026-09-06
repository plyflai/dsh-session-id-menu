# dsh-session-id-menu

[English](./README.md) | [中文](./README.zh-CN.md)

<p align="center">
<strong>Copy a session's id straight from the Workspace sidebar</strong>
<br />
One kebab-menu item — <em>zero dependencies, pure DOM, degrades silently</em>.
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

`dsh-session-id-menu` adds a **Session ID** item to the `⋯` (kebab) menu of every session row in the DeepSeek Harness Web GUI. Clicking it copies that session's id to the clipboard, flashes a confirmation label, then closes the menu.

## Why

The session id (e.g. `s-066d994e...`) currently only appears in the status bar after you click into a session — no other UI path exposes it. Copying one requires clicking the session, finding the status bar, selecting the id, and copying by hand. `dsh-session-id-menu` puts it one click away: `⋯` → **Session ID** → clipboard.

## How it works

The plugin is a **pure-DOM client plugin**: no React, no npm dependencies, no build step. The browser half (`lib/client.js`, a `window.__ModuleLoader__.load` factory with zero imports) observes the host's DOM and correlates its own events:

```
[kebab pointerdown] ─► correlate the portaled [role=menu] (600ms window + 12px geometry)
                       └► inject a Session ID menu item
[Session ID click]  ─► resolve the id from the sessions / workspaces controller snapshots
                       └► navigator.clipboard.writeText (execCommand fallback)
                       └► flash "Copied", close the menu via the host's own Escape handler
```

- **Row disambiguation** — `displayTitle` is not unique, so the row's id is recovered by reverse-matching the row's span texts against the `sessions` snapshot `displayTitles` (leaf texts first, so status-slot/time text can never be mistaken for a title), narrowed by the row's workspace section against the `workspaces` snapshot (`sessionIds`), with a latest-`updatedAt` tie-break when duplicates survive.
- **Graceful degradation by design** — a missing or not-`ready` snapshot, or a host DOM that no longer matches the contract, degrades to a **silent miss** (the menu just closes; nothing is thrown into the host's render path). The worst case on an incompatible host is "the item never appears", never "the GUI breaks". On dispose, every owned effect (observers, rAFs, timers, injected items, menu markers) is reclaimed, leaving no DOM residue.

## Install

Prerequisites: **Node ≥ 22**, `pnpm` on PATH, and one DSH profile (`~/.dsh/profiles/<name>/`).

**Version-pinned (recommended)** — the release tgz is a byte-frozen artifact, identical on every machine:

```bash
dsh plugin --profile <name> add https://github.com/plyflai/dsh-session-id-menu/releases/download/v0.1.0/dsh-session-id-menu-0.1.0.tgz
```

**Latest (git)** — always tracks the `main` HEAD (no baseline guarantee):

```bash
dsh plugin --profile <name> add github:plyflai/dsh-session-id-menu
```

Update / remove (same spec syntax):

```bash
dsh plugin --profile <name> update dsh-session-id-menu
dsh plugin --profile <name> remove dsh-session-id-menu
```

Two things worth knowing:

- Install lands in the **profile directory** (`~/.dsh/profiles/<name>/node_modules`) — not in any source repo of yours. What your repo is named, or how it is laid out, is irrelevant to this plugin.
- **Restart DSH** after installing (the fiber loads at assembly time; it does not hot-reload).

## Verify

Three steps after the restart:

1. The `⋯` menu of a session row shows **Session ID** (「会话ID」 in a zh locale).
2. Click it — the label flashes **Copied** (「已复制」).
3. Paste — the clipboard holds that row's session id.

Regressions are verified against a live DSH GUI running in Playwright (real kebab menu + real snapshot seam); the package itself ships `npm pack` + `node --test` (behavior + package-shape suites, zero deps, hand-rolled DOM stub — no jsdom).

## Portability & troubleshooting

**Tested against:** DeepSeek Harness commit `8541330cde` (2026-09-05, v0.1.3-alpha.1). If the plugin misbehaves, compare your harness commit to that baseline first.

| Symptom | Likely cause |
|---|---|
| Item never appears in the `⋯` menu | DOM contract drift — the row / kebab / Menu structure changed upstream; compare harness commits |
| Item appears, but clicking just closes the menu | Snapshot seam drift — `sessions.list.getSnapshot()` / `workspaces.list.getSnapshot()` layout or `phase` changed |
| Plugin is listed, but nothing happens | Fiber not activated — `dsh --profile <name> --dump-config`, then restart DSH |

Quick assertion in the GUI devtools console (right after opening a `⋯` menu):

```js
document.querySelector('[data-dsh-session-id]') // non-null when the item was injected
```

**Why this can't break your machine:** the artifact has zero npm dependencies (no version conflicts, no build scripts to intercept), zero imports in shipped code, and no absolute paths — it never references your source repo, and install lands in the profile directory. The only cross-machine dependency is the host runtime itself, and every host seam is read defensively; a mismatch is a silent miss, never a crash.

## Development

```bash
cd plugin/dsh-session-id-menu
npm test            # node --test tests/*.test.mjs
npm pack            # produce the distributable tgz (files: src, lib/client.js, cordis.patch.yml, README)
```

From a dsh-dev checkout you can also install the local copy: `dsh plugin --profile web add plugin/dsh-session-id-menu` (relative path is anchored to the caller's cwd).

## Status

Early (v0.1.0). Behavior is verified against the pinned harness baseline above; the snapshot seam and DOM contract may drift as the harness evolves — when that happens, expect a plugin-side update, not a host-side fix.

## License

MIT
