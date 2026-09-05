/* Minimal DOM stub for dsh-session-id-menu behavior tests.
 *
 * Supports exactly what client.js touches:
 *   - element tree (children / parentElement / parentNode / firstElementChild)
 *   - attributes, className, textContent (own + descendants), innerHTML (raw)
 *   - CSS-subset selectors: tag, [attr], [attr="value"], combinations
 *   - closest / querySelector / querySelectorAll / matches
 *   - events: addEventListener/removeEventListener/dispatchEvent with
 *     capture+bubble over the parent chain up to the element's document node
 *   - document.body / documentElement / createElement / execCommand
 *   - MutationObserver, rAF (manual flush), navigator.clipboard, KeyboardEvent
 *
 * Event dispatch is a single module-level implementation keyed off
 * `element.doc`, so stubs created in different tests never share closures.
 */

function parseSelector(sel) {
  const m = sel.match(/^([a-zA-Z][a-zA-Z0-9]*)?((?:\[[^\]]+\])*)$/)
  if (!m) throw new Error('dom-stub: unsupported selector: ' + sel)
  const tag = (m[1] || '').toUpperCase()
  const attrs = []
  const re = /\[([^\]=\]]+)(?:=([\w"-]+))?\]/g
  let a
  while ((a = re.exec(m[2] || '')) !== null) {
    attrs.push({ name: a[1], value: a[2] === undefined ? null : a[2].replace(/^"|"$/g, '') })
  }
  return { tag, attrs }
}

function matchesEl(el, sel) {
  if (!el || !el.tagName) return false
  const { tag, attrs } = parseSelector(sel)
  if (tag && el.tagName !== tag) return false
  for (const a of attrs) {
    const v = el.attributes[a.name]
    if (a.value === null) {
      if (v === undefined) return false
    } else if (v !== a.value) return false
  }
  return true
}

function fire(node, ev, cap) {
  const ls = node._listeners.get(ev.type)
  if (!ls) return
  for (const l of ls.slice(0)) {
    if (l.capture !== cap) continue
    l.fn(ev)
    if (ev._stopped) return
  }
}

export class El {
  constructor(tagName, doc) {
    this.tagName = String(tagName).toUpperCase()
    this.nodeType = 1
    this.doc = doc
    this.children = []
    this.parentElement = null
    this.parentNode = null
    this.attributes = {}
    this.className = ''
    this.lang = ''
    this.disabled = false
    this.type = ''
    this.value = ''
    this.style = {}
    this._ownText = ''
    this._innerHTML = ''
    this._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
    this._listeners = new Map()
  }

  get isConnected() {
    let n = this
    while (n.parentNode || n.parentElement) {
      n = n.parentNode || n.parentElement
      if (n === n.doc.body) return true
    }
    return this === this.doc.body
  }

  get firstElementChild() { return this.children[0] || null }

  get textContent() {
    let t = this._ownText
    for (const c of this.children) t += c.textContent
    return t
  }

  set textContent(v) {
    this._ownText = String(v)
    const old = this.children.slice(0)
    this.children.length = 0
    for (const c of old) { c.parentNode = null; c.parentElement = null }
  }

  get innerHTML() { return this._innerHTML }

  set innerHTML(v) { this._innerHTML = String(v) }

  setAttribute(name, value) { this.attributes[name] = String(value) }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) }
  removeAttribute(name) { delete this.attributes[name] }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child)
    child.parentNode = this
    child.parentElement = this
    this.children.push(child)
    return child
  }

  removeChild(child) {
    const i = this.children.indexOf(child)
    if (i !== -1) this.children.splice(i, 1)
    child.parentNode = null
    child.parentElement = null
    return child
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this)
  }

  select() { return true }

  matches(sel) { return matchesEl(this, sel) }

  closest(sel) {
    let n = this
    while (n && n.nodeType === 1) {
      if (matchesEl(n, sel)) return n
      n = n.parentElement || n.parentNode
    }
    return null
  }

  querySelector(sel) {
    const out = this.querySelectorAll(sel)
    return out.length > 0 ? out[0] : null
  }

  querySelectorAll(sel) {
    const out = []
    const walk = (node) => {
      for (const c of node.children) {
        if (matchesEl(c, sel)) out.push(c)
        walk(c)
      }
    }
    walk(this)
    return out
  }

  getBoundingClientRect() { return this._rect }
  setRect(r) { this._rect = Object.assign(this._rect, r) }

  addEventListener(type, fn, capture) {
    if (!this._listeners.has(type)) this._listeners.set(type, [])
    this._listeners.get(type).push({ fn, capture: !!capture })
  }

  removeEventListener(type, fn, capture) {
    const ls = this._listeners.get(type)
    if (!ls) return
    const i = ls.findIndex((l) => l.fn === fn && l.capture === !!capture)
    if (i !== -1) ls.splice(i, 1)
  }

  // Capture down the chain from the document node to the target, then
  // bubble back up. `path` = [doc, html, body, ..., target].
  dispatchEvent(ev) {
    ev.target = ev.target || this
    const path = []
    let n = this
    while (n && n.nodeType === 1) {
      path.unshift(n)
      n = n.parentNode || n.parentElement
    }
    if (n) path.unshift(n) // the document node
    for (const node of path) fire(node, ev, true)
    if (ev._stopped) return
    if (this.nodeType === 9) {
      // Target is the document itself: its own bubble-phase listeners still run.
      fire(this, ev, false)
    } else {
      for (const node of path.slice(1).reverse()) fire(node, ev, false)
      fire(path[0], ev, false)
    }
  }
}

export function createDom(opts = {}) {
  const doc = new El('document', null)
  doc.nodeType = 9
  doc.doc = doc
  doc.children = []
  doc._execCommandResult = opts.execCommand !== undefined ? opts.execCommand : true

  const html = new El('html', doc)
  html.lang = opts.lang || 'en'
  const body = new El('body', doc)
  html.appendChild(body)
  html.parentNode = doc // document is the root of the parent chain
  doc.documentElement = html
  doc.body = body

  doc.createElement = (tag) => new El(tag, doc)
  doc.execCommand = () => doc._execCommandResult

  // --- MutationObserver (single-instance; tests create one dom per test) ---
  const moState = { cb: null, target: null, disconnected: false }
  class MutationObserver {
    constructor(cb) { moState.cb = cb }
    observe(target) { moState.target = target; moState.disconnected = false }
    disconnect() { moState.disconnected = true }
  }
  const fireMutation = (node) => {
    if (moState.disconnected || !moState.cb) return
    moState.cb([{ addedNodes: [node] }])
  }

  // --- rAF (manual flush) ---
  let rafSeq = 0
  const rafs = new Map()
  const requestAnimationFrame = (cb) => { const id = ++rafSeq; rafs.set(id, cb); return id }
  const cancelAnimationFrame = (id) => { rafs.delete(id) }
  const flushRaf = () => {
    const entries = [...rafs.entries()]
    rafs.clear()
    for (const [, cb] of entries) cb()
  }

  class KeyboardEvent {
    constructor(type, init = {}) {
      this.type = type
      this.key = init.key
      this.bubbles = !!init.bubbles
      this.cancelable = !!init.cancelable
      this._stopped = false
      this.target = null
      this.stopPropagation = () => { this._stopped = true }
    }
  }

  const makeEvent = (type, extra = {}) => Object.assign({
    type,
    target: null,
    _stopped: false,
    stopPropagation() { this._stopped = true },
  }, extra)

  return {
    doc,
    body,
    html,
    El,
    MutationObserver,
    KeyboardEvent,
    requestAnimationFrame,
    cancelAnimationFrame,
    flushRaf,
    fireMutation,
    makeEvent,
    rafCount: () => rafs.size,
  }
}
