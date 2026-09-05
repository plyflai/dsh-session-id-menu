/* Package-shape tests: the distribution surface must match the
 * dsh-workspace-folder-order precedent exactly. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

const pkg = JSON.parse(read('package.json'))

test('package.json: identity and module shape', () => {
  assert.equal(pkg.name, 'dsh-session-id-menu')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.main, 'src/index.js')
  assert.deepEqual(pkg.exports, {
    '.': './src/index.js',
    './client': './client.js',
    './package.json': './package.json',
  })
})

test('package.json: dsh manifest (bundle patch + web client inject)', () => {
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-api-workspace-controller',
  ])
})

test('package.json: files/engines/test script', () => {
  assert.ok(pkg.files.includes('src'))
  assert.ok(pkg.files.includes('client.js'))
  assert.ok(pkg.files.includes('cordis.patch.yml'))
  assert.ok(pkg.files.includes('README.md'))
  assert.equal(pkg.engines.node, '>=22')
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs')
})

test('files[] entries all exist on disk', () => {
  for (const f of pkg.files) {
    if (f === 'src') assert.ok(existsSync(path.join(ROOT, 'src', 'index.js')))
    else assert.ok(existsSync(path.join(ROOT, f)), f)
  }
})

test('src/index.js: stable name + no-op apply', async () => {
  const mod = await import('../src/index.js')
  assert.equal(mod.name, 'dsh-session-id-menu')
  assert.equal(typeof mod.apply, 'function')
  assert.equal(mod.apply(), undefined)
})

test('client.js: __ModuleLoader__ module, zero imports, sessions+workspaces inject', () => {
  const src = read('client.js')
  assert.match(src, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(src, /id: 'dsh-session-id-menu'/)
  assert.match(src, /exports\.apply = apply/)
  assert.match(src, /exports\.inject = \['sessions', 'workspaces'\]/)
  assert.match(src, /ctx\.effect\(/)
  assert.match(src, /data-dsh-session-id/)
  assert.match(src, /data-dsh-sid/)
  assert.doesNotMatch(src, /^\s*import\s/m)
  assert.doesNotMatch(src, /require\(/)
})

test('client.js: three-context id resolution + workspaces-ready gate', () => {
  const src = read('client.js')
  assert.match(src, /resolveSessionId/)
  assert.match(src, /aria-selected/)
  assert.match(src, /phase !== 'ready'/)
})

test('cordis.patch.yml: insert entry with stable id', () => {
  const src = read('cordis.patch.yml')
  assert.match(src, /^- insert:/m)
  assert.match(src, /id: dsh-session-id-menu/)
})

test('README.md: documents behavior and verification ladder', () => {
  const src = read('README.md')
  assert.match(src, /Session ID/)
  assert.match(src, /clipboard/i)
  assert.match(src, /playwright/i)
  assert.match(src, /npm pack/i)
})
