/* Behavior tests for the dsh-session-id-menu browser half.
 * Runs client.js against a hand-rolled DOM stub (no jsdom). */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDom } from './dom-stub.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_SRC = readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

const tick = () => new Promise((r) => setImmediate(r))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function S(id, displayTitle, updatedAt) {
  return { id, displayTitle, updatedAt }
}
function sessionsSnap(sessions) {
  return {
    phase: 'ready',
    ids: sessions.map((s) => s.id),
    byId: Object.fromEntries(sessions.map((s) => [s.id, s])),
  }
}

function setup({ lang = 'en', sessions = [], workspaces = null, execCommand = true, clipboard = 'resolve', innerWidth = 1440 } = {}) {
  const dom = createDom({ lang, execCommand })
  const loaded = []
  const written = []
  let clipObj
  const writeTextImpl = (t) => {
    if (clipboard === 'resolve') {
      written.push(t)
      return Promise.resolve()
    }
    if (clipboard === 'reject') return Promise.reject(new Error('denied'))
    throw new Error('unexpected clipboard mode')
  }
  if (clipboard !== 'none') clipObj = { writeText: (t) => writeTextImpl(t) }

  globalThis.window = { __ModuleLoader__: { load: (desc) => { loaded.push(desc) } }, innerWidth }
  globalThis.document = dom.doc
  globalThis.MutationObserver = dom.MutationObserver
  globalThis.KeyboardEvent = dom.KeyboardEvent
  globalThis.requestAnimationFrame = dom.requestAnimationFrame
  globalThis.cancelAnimationFrame = dom.cancelAnimationFrame
  Object.defineProperty(globalThis, 'navigator', { value: clipboard === 'none' ? {} : { clipboard: clipObj }, configurable: true })

  const stores = {
    sessions: { getSnapshot: () => sessionsSnap(sessions) },
    workspaces: { getSnapshot: () => workspaces },
  }
  const ctx = {
    effects: [],
    get(name) { return stores[name] },
    effect(fn, label) { this.effects.push({ label, cleanup: fn() }) },
  }

  // --- fixtures ---
  const flatTree = dom.doc.createElement('div')
  flatTree.setAttribute('role', 'tree')
  dom.body.appendChild(flatTree)

  function makeRow(parent, { title = 'proj', selected = true, buttons = 1, statusText = null, wrapInSpan = false } = {}) {
    const row = dom.doc.createElement('div')
    row.setAttribute('role', 'treeitem')
    // React renders aria-selected on every session row ("true" for the
    // selected one, "false" otherwise); workspace headers do not render it.
    // Its presence marks a session row — any value qualifies (code r1 F8).
    row.setAttribute('aria-selected', selected ? 'true' : 'false')
    const slot = dom.doc.createElement('span')
    slot.className = 'slot'
    if (statusText !== null) {
      // SessionStatusDots (Rows.tsx): element dot + one visuallyHidden span
      // carrying the screen-reader status label, inside the leading slot.
      const sr = dom.doc.createElement('span')
      sr.className = 'visuallyHidden'
      sr.textContent = statusText
      slot.appendChild(sr)
    }
    const titleSpan = dom.doc.createElement('span')
    titleSpan.className = 'title'
    titleSpan.textContent = title
    const time = dom.doc.createElement('span')
    time.className = 'time'
    time.textContent = '2m'
    const actions = dom.doc.createElement('span')
    actions.className = 'rowActions'
    for (let i = 0; i < buttons; i += 1) {
      const b = dom.doc.createElement('button')
      b.setAttribute('aria-label', i === 0 ? `Session actions for ${title}` : `More for ${title}`)
      const inner = dom.doc.createElement('span')
      b.appendChild(inner)
      actions.appendChild(b)
    }
    row.appendChild(slot)
    row.appendChild(titleSpan)
    row.appendChild(time)
    row.appendChild(actions)
    let host = parent
    if (wrapInSpan) {
      // Live DOM: each session row sits in its own wrapper span inside the
      // group section (the section also holds the workspace header row).
      const wrapper = dom.doc.createElement('span')
      parent.appendChild(wrapper)
      host = wrapper
    }
    host.appendChild(row)
    const kebab = actions.children[0]
    kebab.setRect({ left: 240, top: 300, width: 24, height: 24 })
    return { row, kebab, kebabInner: kebab.children[0] }
  }

  function makeSection({ headerTitle = 'W1' } = {}) {
    const section = dom.doc.createElement('div')
    section.className = 'groupSection'
    dom.body.appendChild(section)
    let header = null
    if (headerTitle !== null) {
      header = dom.doc.createElement('div')
      header.setAttribute('role', 'treeitem')
      header.setAttribute('aria-expanded', 'true')
      const hslot = dom.doc.createElement('span')
      hslot.className = 'slot'
      const htext = dom.doc.createElement('span')
      htext.className = 'projectText'
      htext.textContent = headerTitle
      const hactions = dom.doc.createElement('span')
      hactions.className = 'rowActions'
      const hkb = dom.doc.createElement('button')
      hkb.setAttribute('aria-label', `Workspace actions for ${headerTitle}`)
      const hinner = dom.doc.createElement('span')
      hkb.appendChild(hinner)
      hactions.appendChild(hkb)
      header.appendChild(hslot)
      header.appendChild(htext)
      header.appendChild(hactions)
      const hwrap = dom.doc.createElement('span')
      hwrap.appendChild(header)
      section.appendChild(hwrap)
    }
    return { section, header }
  }

  function makeMenu({ left = 240, width = 180 } = {}) {
    const menu = dom.doc.createElement('div')
    menu.setAttribute('role', 'menu')
    const viewport = dom.doc.createElement('div')
    viewport.setAttribute('role', 'presentation')
    menu.appendChild(viewport)
    for (const label of ['Rename', 'Fork', 'Archive']) {
      const wrap = dom.doc.createElement('div')
      wrap.className = 'mw'
      const b = dom.doc.createElement('button')
      b.setAttribute('role', 'menuitem')
      b.className = 'mi'
      const ic = dom.doc.createElement('span')
      ic.className = 'miIcon'
      const lb = dom.doc.createElement('span')
      lb.className = 'miLabel'
      lb.textContent = label
      b.appendChild(ic)
      b.appendChild(lb)
      wrap.appendChild(b)
      viewport.appendChild(wrap)
    }
    dom.body.appendChild(menu)
    menu.setRect({ left, top: 400, width: 180, height: 140 })
    return { menu, viewport }
  }

  function pointerdown(rowFixture) {
    const ev = dom.makeEvent('pointerdown', {})
    rowFixture.kebabInner.dispatchEvent(ev)
  }

  function clickMenuItem(menu) {
    const buttons = menu.querySelectorAll('button[role="menuitem"]')
    const item = buttons[buttons.length - 1]
    item.dispatchEvent(dom.makeEvent('click', {}))
    return item
  }

  const escapes = []
  dom.doc.addEventListener('keydown', (e) => { escapes.push(e.key) })

  return {
    dom, written, escapes, ctx,
    flatTree, makeRow, makeSection, makeMenu, pointerdown, clickMenuItem,
    sessions, workspaces,
    flush: () => dom.flushRaf(),
    fireMenu: (menu) => { dom.fireMutation(menu) },
    menuItems: (menu) => menu.querySelectorAll('button[role="menuitem"]'),
    loaded: () => loaded,
  }
}

let prevCtx = null
function loadModule(t) {
  if (prevCtx) {
    // Dispose the previous test's plugin instance. Its pending timers/rAFs
    // all reference the *current* global document, so an un-disposed
    // instance would fire Escape keydowns into this test's spies.
    for (const e of prevCtx.effects) e.cleanup()
    prevCtx = null
  }
  // client.js is a side-effecting script; evaluate it to register with the loader.
  new Function(CLIENT_SRC)()
  prevCtx = t.ctx
}

// ---------------------------------------------------------------------------

test('en: kebab pointerdown + menu appears -> Session ID item injected (4 items, svg icon, cloned classes, marker)', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  const { ctx } = t
  const mod = t.loaded()[0].factory()
  mod.apply(ctx)
  // 'slots' declared for the super-module precheck skeleton (pure-DOM form:
  // the register marker is guarded off — see lib/client.js).
  assert.deepEqual(mod.inject, ['sessions', 'workspaces', 'slots'])

  const { row, kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  const ev = t.dom.makeEvent('pointerdown', {})
  kebabInner.dispatchEvent(ev)
  t.fireMenu(menu)
  t.flush()

  const items = t.menuItems(menu)
  assert.equal(items.length, 4)
  const item = items[3]
  assert.equal(item.getAttribute('data-dsh-session-id'), '1')
  assert.equal(item.getAttribute('role'), 'menuitem')
  assert.equal(item.className, 'mi')
  const spans = item.querySelectorAll('span')
  assert.equal(spans.length, 2)
  assert.equal(spans[0].className, 'miIcon')
  assert.match(spans[0].innerHTML, /<svg[^>]*>[\s\S]*<path d="M6\.14929 4\.02032/)
  assert.equal(spans[1].className, 'miLabel')
  assert.equal(spans[1].textContent, 'Session ID')
  assert.equal(menu.getAttribute('data-dsh-sid'), 'done')
  // the item's wrap cloned the existing itemWrap class
  assert.equal(item.parentElement.className, 'mw')
  // item appended inside the viewport, after the last existing item
  const viewport = menu.firstElementChild
  assert.equal(viewport.children[3], item.parentElement)
  void row
})

test('zh lang: item label is 会话ID', () => {
  const t = setup({ lang: 'zh-CN', sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  const items = t.menuItems(menu)
  assert.equal(items[3].querySelectorAll('span')[1].textContent, '会话ID')
})

test('menu without pending pointerdown -> no injection, no marker', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { menu } = t.makeMenu()
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 3)
  assert.equal(menu.getAttribute('data-dsh-sid'), null)
})

test('pending older than 600ms -> no injection', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })

  const RealDate = globalThis.Date
  let fake = 1000
  globalThis.Date = class extends RealDate {
    static now() { return fake }
  }
  try {
    kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
    fake = 1700
    const { menu } = t.makeMenu()
    t.fireMenu(menu)
    t.flush()
    assert.equal(t.menuItems(menu).length, 3)
  } finally {
    globalThis.Date = RealDate
  }
})

test('geometry: left off by 40px without overlap -> no injection', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  // button spans 240..264; menu at 280 is 40px off (>12px) and past the
  // button's right edge (no horizontal overlap).
  const { menu } = t.makeMenu({ left: 280 })
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 3)
})

test('geometry: 30px offset but horizontal overlap (clamped placement) -> injected', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  const { menu } = t.makeMenu({ left: 210 }) // menu 210..390 overlaps button 240..264
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
})

test('geometry: right viewport clamp (menu pulled left of the button) -> injected', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)], innerWidth: 252 })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  // F12: vw=252, button 240..264, menu 180 wide. The host clamps x into
  // [12, 252-180-12=60], so the menu lands at 60..240 — entirely left of the
  // button (no overlap, left edge 180px off), yet button.left + width
  // (240+180=420) overflows the right margin (252-12=240) and the menu sits
  // at the clamp bound (right edge 240 = vw-12).
  const { menu } = t.makeMenu({ left: 60 })
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
})

test('geometry: unrelated menu near right edge but below the clamp bound -> no injection', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)], innerWidth: 252 })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  // menu 10..110 (100 wide): no left proximity (230px off), no overlap, and
  // its right edge (110) is far below the clamp bound (vw-12=240) — the
  // button overflows the right margin, but the menu is not at the bound.
  const { menu } = t.makeMenu({ left: 10, width: 100 })
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 3)
})

test('workspace row (aria-expanded) -> no pending -> no injection', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { header } = t.makeSection()
  const kb = header.querySelector('button[aria-label]')
  const { menu } = t.makeMenu()
  kb.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 3)
})

test('F8: unselected session row (aria-selected=false) -> injected, copies that row id', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj', selected: false })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  const { menu } = t.makeMenu()
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['s1'])
})

test('F9: status slot holds screen-reader text -> title still resolved, correct id copied', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj', statusText: 'Running' })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  const { menu } = t.makeMenu()
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['s1'])
})

test('F9: idle status slot text -> title still resolved, correct id copied', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj', statusText: 'Idle' })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  const { menu } = t.makeMenu()
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['s1'])
})

test('F10: title leaf and time leaf match different displayTitles -> only title candidates', async () => {
  const t = setup({ sessions: [S('a', 'proj', 100), S('b', '2m', 900)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  // Fixture row: title span 'proj' (first leaf), time span '2m' (second
  // leaf) — session 'b' is titled exactly like the time label and is
  // newer, so the old all-leaves scan would tie-break to the wrong row.
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  const { menu } = t.makeMenu()
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['a'])
})

test('F8+F9: unselected row with completed status -> injected, copies that row id', async () => {
  const t = setup({
    sessions: [S('s1', 'proj', 100), S('s2', 'other', 50)],
  })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj', selected: false, statusText: 'Completed' })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  const { menu } = t.makeMenu()
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['s1'])
})

test('F9: status text equals another session displayTitle -> leaf title span wins', async () => {
  const t = setup({
    sessions: [S('a', 'proj', 100), S('b', 'Running', 900)],
  })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj', statusText: 'Running' })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  const { menu } = t.makeMenu()
  t.fireMenu(menu)
  t.flush()
  t.clickMenuItem(menu)
  await tick()
  // leaf span texts [proj, 2m] match 'a' before the non-leaf slot text
  // 'Running' could match the newer 'b'
  assert.deepEqual(t.written, ['a'])
})

test('grouped section without header (defensive) -> flat semantics, no narrowing', async () => {
  const t = setup({
    sessions: [S('a', 'proj', 1000), S('b', 'proj', 2000)],
    workspaces: { phase: 'ready', items: [{ title: 'W1', sessionIds: ['a'] }] },
  })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { section } = t.makeSection({ headerTitle: null })
  const { kebabInner } = t.makeRow(section, { title: 'proj', wrapInSpan: true })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  const { menu } = t.makeMenu()
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['b'])
})

test('search-result button row (tagName BUTTON) -> no injection', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const rowBtn = t.dom.doc.createElement('button')
  rowBtn.setAttribute('role', 'treeitem')
  rowBtn.setAttribute('aria-selected', 'true')
  rowBtn.setAttribute('aria-label', 'proj')
  const titleSpan = t.dom.doc.createElement('span')
  titleSpan.textContent = 'proj'
  rowBtn.appendChild(titleSpan)
  t.flatTree.appendChild(rowBtn)
  const { menu } = t.makeMenu()
  rowBtn.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 3)
})

test('row with two kebab buttons -> no injection', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj', buttons: 2 })
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  const { menu } = t.makeMenu()
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 3)
})

test('same menu processed twice -> single injected item', () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
  assert.equal(menu.querySelectorAll('[data-dsh-session-id]').length, 1)
})

test('copy success: writeText(id), label Copied -> restore after 1200ms, Escape at 900ms', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  const item = t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['s1'])
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Copied')
  await sleep(700)
  assert.equal(t.escapes.length, 0)
  await sleep(250)
  assert.deepEqual(t.escapes, ['Escape'])
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Copied')
  await sleep(550)
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Session ID')
})

test('writeText reject + execCommand true -> fallback path still reports Copied', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)], clipboard: 'reject', execCommand: true })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  const item = t.clickMenuItem(menu)
  await tick()
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Copied')
  assert.equal(t.written.length, 0)
  assert.equal(t.dom.body.querySelector('textarea'), null) // F11: no residue on success
})

test('writeText reject + execCommand false -> no Copied, Escape at 50ms, silent', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)], clipboard: 'reject', execCommand: false })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  const item = t.clickMenuItem(menu)
  await tick()
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Session ID')
  assert.equal(t.written.length, 0)
  assert.equal(t.dom.body.querySelector('textarea'), null) // F11: no residue on false
  await sleep(70)
  assert.deepEqual(t.escapes, ['Escape'])
})

test('F11: execCommand throws -> no textarea residue, no Copied, Escape at 50ms', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)], clipboard: 'reject', execCommand: true })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  t.dom.doc.execCommand = () => { throw new Error('execCommand boom') }
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  const item = t.clickMenuItem(menu)
  await tick()
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Session ID')
  assert.equal(t.dom.body.querySelector('textarea'), null)
  assert.equal(t.written.length, 0)
  await sleep(70)
  assert.deepEqual(t.escapes, ['Escape'])
})

test('F11: select() throws -> no textarea residue, no Copied, Escape at 50ms', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)], clipboard: 'reject', execCommand: true })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const El = t.dom.El
  const origSelect = El.prototype.select
  El.prototype.select = function () { throw new Error('select boom') }
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  const item = t.clickMenuItem(menu)
  // legacyCopy runs in a later microtask (writeText reject -> fallback),
  // so keep the patch armed until the chain settles, then restore it for
  // the other tests that share the module-level El.
  await tick()
  El.prototype.select = origSelect
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Session ID')
  assert.equal(t.dom.body.querySelector('textarea'), null)
  assert.equal(t.written.length, 0)
  await sleep(70)
  assert.deepEqual(t.escapes, ['Escape'])
})

test('no clipboard API + execCommand true -> legacy copy succeeds', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)], clipboard: 'none', execCommand: true })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  const item = t.clickMenuItem(menu)
  await tick()
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Copied')
  assert.equal(t.dom.body.querySelector('textarea'), null) // F11: no residue on success
})

test('flat: same-title workspace + ungrouped sessions -> newer updatedAt wins, no workspace narrowing', async () => {
  const t = setup({
    sessions: [S('a', 'proj', 1000), S('b', 'proj', 2000)],
    workspaces: { phase: 'ready', items: [{ title: 'W1', sessionIds: ['a'] }] },
  })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['b'])
})

test('grouped workspace section: same title in two workspaces -> resolves to the section workspace', async () => {
  const t = setup({
    sessions: [S('s1', 'proj', 100), S('s2', 'proj', 900)],
    workspaces: { phase: 'ready', items: [{ title: 'W1', sessionIds: ['s1'] }, { title: 'W2', sessionIds: ['s2'] }] },
  })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { section } = t.makeSection({ headerTitle: 'W1' })
  const { kebabInner } = t.makeRow(section, { title: 'proj', wrapInSpan: true })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['s1'])
})

test('grouped ungrouped section: same title workspace + ungrouped -> resolves to the ungrouped one', async () => {
  const t = setup({
    sessions: [S('s1', 'proj', 100), S('s2', 'proj', 900)],
    workspaces: { phase: 'ready', items: [{ title: 'W1', sessionIds: ['s1'] }] },
  })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { section } = t.makeSection({ headerTitle: 'Ungrouped' })
  const { kebabInner } = t.makeRow(section, { title: 'proj', wrapInSpan: true })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['s2'])
})

test('grouped + workspaces pending -> silent miss, no copy (F7)', async () => {
  const t = setup({
    sessions: [S('s1', 'proj', 100), S('s2', 'proj', 900)],
    workspaces: { phase: 'pending', items: [] },
  })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { section } = t.makeSection({ headerTitle: 'W1' })
  const { kebabInner } = t.makeRow(section, { title: 'proj', wrapInSpan: true })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  assert.equal(t.menuItems(menu).length, 4)
  t.clickMenuItem(menu)
  await tick()
  assert.equal(t.written.length, 0)
  await sleep(70)
  assert.deepEqual(t.escapes, ['Escape'])
})

test('flat + workspaces pending -> still resolves by flat rules', async () => {
  const t = setup({
    sessions: [S('s1', 'proj', 100)],
    workspaces: { phase: 'pending', items: [] },
  })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['s1'])
})

test('sessions snapshot pending -> silent miss', async () => {
  const t = setup({ sessions: [], workspaces: { phase: 'ready', items: [] } })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  t.ctx.get('sessions').getSnapshot = () => ({ phase: 'pending', ids: [], byId: {} })
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  t.clickMenuItem(menu)
  await tick()
  assert.equal(t.written.length, 0)
  await sleep(70)
  assert.deepEqual(t.escapes, ['Escape'])
})

test('grouped workspace: same workspace, same title -> newer updatedAt wins', async () => {
  const t = setup({
    sessions: [S('s1', 'proj', 100), S('s2', 'proj', 900)],
    workspaces: { phase: 'ready', items: [{ title: 'W1', sessionIds: ['s1', 's2'] }] },
  })
  loadModule(t)
  t.loaded()[0].factory().apply(t.ctx)
  const { section } = t.makeSection({ headerTitle: 'W1' })
  const { kebabInner } = t.makeRow(section, { title: 'proj', wrapInSpan: true })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  t.clickMenuItem(menu)
  await tick()
  assert.deepEqual(t.written, ['s2'])
})

test('cleanup reclaims owned effects: rAF canceled, timers cleared, item removed, marker removed', async () => {
  const t = setup({ sessions: [S('s1', 'proj', 100)] })
  loadModule(t)
  const mod = t.loaded()[0].factory()
  mod.apply(t.ctx)
  const { kebabInner } = t.makeRow(t.flatTree, { title: 'proj' })
  const { menu } = t.makeMenu()
  kebabInner.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu)
  t.flush()
  const item = t.clickMenuItem(menu)
  await tick()
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Copied')
  // schedule a pending rAF, then dispose
  const { menu: menu2 } = t.makeMenu({ left: 500 })
  t.fireMenu(menu2)
  assert.ok(t.dom.rafCount() >= 1)
  const cleanup = t.ctx.effects[0].cleanup
  cleanup()
  assert.equal(t.dom.rafCount(), 0)
  assert.equal(menu2.getAttribute('data-dsh-sid'), null)
  assert.equal(item.parentElement.isConnected, false)
  assert.equal(menu.getAttribute('data-dsh-sid'), null)
  // timers were cleared: label stays Copied, no Escape fires
  await sleep(1300)
  assert.equal(item.querySelectorAll('span')[1].textContent, 'Copied')
  assert.equal(t.escapes.length, 0)
  // disposed: a fresh menu is not injected
  const { menu: menu3 } = t.makeMenu()
  const { kebabInner: kb3 } = t.makeRow(t.flatTree, { title: 'proj' })
  kb3.dispatchEvent(t.dom.makeEvent('pointerdown', {}))
  t.fireMenu(menu3)
  t.flush()
  assert.equal(t.menuItems(menu3).length, 3)
})
