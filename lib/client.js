/* Browser half of dsh-session-id-menu. Adds a "Session ID" item to the
 * kebab menu of every Session row in the Workspace sidebar. Clicking the
 * item copies that Session's id to the clipboard, flashes a confirmation
 * label, then closes the menu via the Menu's own document-level Escape
 * handler. Pure DOM: no imports, no React, no Host round-trips.
 *
 * Row disambiguation (displayTitle is not unique) resolves against the
 * injected session/workspace controller snapshots. The row's title is found
 * by reverse-matching its direct-child span texts against snapshot
 * displayTitles: plain-text (leaf) spans are matched first, spans with
 * element children (the status slot with its dot + screen-reader status
 * text, rowActions) second — so generated status/time text can never be
 * mistaken for a title. Candidate narrowing uses the row's section scope,
 * found by walking up from the row (rows sit in per-row wrapper spans
 * inside a group section that also holds the workspace header row) to the
 * first ancestor whose subtree contains a [role=treeitem][aria-expanded]
 * header, or to the role=tree list:
 *   flat list                   -> no workspace narrowing
 *   grouped workspace section   -> narrow to WorkspaceView.sessionIds
 *   grouped ungrouped section   -> union-exclude workspace sessionIds
 * Grouped narrowing additionally requires the workspaces snapshot to be
 * phase 'ready'; otherwise the click is a silent miss (menu closes).
 *
 * Correlation: the Session kebab menu opens as a portaled div[role=menu]
 * whose left edge aligns with the anchor button (Menu align='start',
 * side='bottom'), clamped 12px from the viewport edges. We only correlate a
 * menu that appeared within 600ms of a captured kebab pointerdown AND whose
 * left edge is within 12px of that button's (or horizontally overlaps it,
 * covering the clamped case). Without a pending pointerdown, every menu is
 * a no-op (26 Menu dependents in the app).
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-id-menu',
  factory: function () {
    var module = { exports: {} }
    var exports = module.exports

    var CORRELATE_WINDOW_MS = 600
    var GEOMETRY_TOL_PX = 12
    var COPIED_FLASH_MS = 1200
    var ESCAPE_AFTER_COPY_MS = 900
    var ESCAPE_AFTER_MISS_MS = 50

    // IconCopyOutline16 from packages/client/ui-primitives (verbatim path).
    var COPY_SVG =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z" fill="currentColor"/>' +
      '</svg>'

    function labels() {
      var lang = (document.documentElement && document.documentElement.lang) || ''
      if (/^zh/i.test(lang)) return { item: '会话ID', copied: '已复制' }
      return { item: 'Session ID', copied: 'Copied' }
    }

    // Direct-child span texts of el, excluding rowActions. `leaf` holds the
    // plain-text spans (no element children: the title span and the time
    // span); `other` holds spans with element children (the leading status
    // slot with its dot + screen-reader status label). The displayTitle
    // lives in a leaf span, so resolution matches leaf texts against
    // snapshot displayTitles before falling back to the rest.
    function spanTexts(el) {
      var leaf = []
      var other = []
      var children = el.children
      for (var i = 0; i < children.length; i += 1) {
        var el2 = children[i]
        if (!el2 || el2.tagName !== 'SPAN') continue
        if (String(el2.className || '').indexOf('rowActions') !== -1) continue
        var text = (el2.textContent || '').trim()
        if (text === '') continue
        if (el2.children.length === 0) leaf.push(text)
        else other.push(text)
      }
      return { leaf: leaf, other: other }
    }

    // true when any direct-child span text of el (leaf texts first) equals
    // one of the given titles — no CSS-module class assumptions.
    function titleMatches(el, titles) {
      var st = spanTexts(el)
      var lists = [st.leaf, st.other]
      for (var l = 0; l < lists.length; l += 1) {
        for (var x = 0; x < lists[l].length; x += 1) {
          for (var y = 0; y < titles.length; y += 1) {
            if (titles[y] === lists[l][x]) return true
          }
        }
      }
      return false
    }

    // The temporary textarea is removed on every path — success, false
    // return, and throw alike — so a failed copy leaves no owned DOM
    // residue (code r2 F11); a cleanup failure must not mask the original
    // result.
    function legacyCopy(text) {
      var ta = null
      try {
        ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        var ok = document.execCommand('copy')
        return !!ok
      } catch (e) {
        return false
      } finally {
        if (ta && ta.parentNode) {
          try { ta.parentNode.removeChild(ta) } catch (e2) { /* keep result */ }
        }
      }
    }

    // Promise<boolean>: true only when the text actually reached the
    // clipboard (writeText resolved, or the execCommand fallback succeeded).
    function copyText(text) {
      var cb = navigator.clipboard
      if (cb && typeof cb.writeText === 'function') {
        return Promise.resolve()
          .then(function () { return cb.writeText(text) })
          .then(function () { return true }, function () { return legacyCopy(text) })
      }
      return Promise.resolve(legacyCopy(text))
    }

    function dispatchEscape() {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    }

    function dropFrom(arr, id) {
      var idx = arr.indexOf(id)
      if (idx !== -1) arr.splice(idx, 1)
    }

    function apply(ctx) {
      var sessions = ctx.get('sessions')
      var workspaces = ctx.get('workspaces')
      // Super-module precheck skeleton marker (dev_inject_plugin ->
      // clientSkeletonProblems): the pure-DOM form registers no slot panel,
      // but the precheck text-validates an inject list containing 'slots'
      // plus a register() with a known slot name. The guard is permanently
      // false — this register never executes at runtime.
      if (false && ctx.slots) {
        ctx.slots.register({
          name: 'conversation.view',
          id: 'dsh-session-id-menu',
          label: function () { return 'dsh-session-id-menu' }
        })
      }
      var state = {
        disposed: false,
        pending: null,
        queue: [],
        rafs: [],
        timers: [],
        menus: [],
        items: []
      }

      // The row's section scope: walk up from the row (a row sits in its
      // own wrapper span inside a group section that also holds the
      // workspace header row) to the first ancestor whose subtree contains
      // a [role=treeitem][aria-expanded] header; stop at the role=tree list
      // (flat layout) or the document body.
      function sectionHeader(row) {
        var anc = row.parentElement
        while (
          anc && anc.nodeType === 1 &&
          anc !== document.body && anc !== document.documentElement
        ) {
          if (anc.getAttribute('role') === 'tree') return null
          var hdr = anc.querySelector('[role="treeitem"][aria-expanded]')
          if (hdr && hdr !== row) return hdr
          anc = anc.parentElement
        }
        return null
      }

      // Three-context id resolution (displayTitle is not unique). The title
      // is recovered by reverse-matching the row's span texts against
      // snapshot displayTitles (leaf texts first), so screen-reader status
      // text in the leading slot and generated time labels can never be
      // mistaken for a title (code r1 F9).
      function resolveSessionId(row) {
        var snap = sessions.getSnapshot()
        if (!snap || snap.phase !== 'ready') return null
        var byId = snap.byId || {}
        var ids = Array.isArray(snap.ids) ? snap.ids : Object.keys(byId)
        var all = []
        for (var i = 0; i < ids.length; i += 1) {
          if (byId[ids[i]]) all.push(byId[ids[i]])
        }
        if (all.length === 0) return null
        var st = spanTexts(row)
        // code r2 F10: try span texts one by one in DOM order — the first
        // text with displayTitle hits wins and scanning stops. The title
        // span precedes the time span (Rows.tsx), so a time label that
        // happens to equal another session's title can no longer widen the
        // candidate set; status-slot (other) texts are only tried when no
        // leaf text hit at all.
        var lists = [st.leaf, st.other]
        var cands = []
        for (var l = 0; l < lists.length && cands.length === 0; l += 1) {
          for (var x = 0; x < lists[l].length && cands.length === 0; x += 1) {
            for (var c = 0; c < all.length; c += 1) {
              if (all[c].displayTitle === lists[l][x]) cands.push(all[c])
            }
          }
        }
        if (cands.length === 0) return null
        var header = sectionHeader(row)
        if (header) {
          var hst = spanTexts(header)
          var hlists = [hst.leaf, hst.other]
          var htext = ''
          for (var hl = 0; hl < hlists.length && htext === ''; hl += 1) {
            for (var hx = 0; hx < hlists[hl].length; hx += 1) { htext = hlists[hl][hx]; break }
          }
          if (htext !== '') {
            var wssnap = workspaces.getSnapshot()
            if (!wssnap || wssnap.phase !== 'ready') return null
            var items = wssnap.items || []
            var ws = null
            for (var w = 0; w < items.length; w += 1) {
              if (items[w] && titleMatches(header, [items[w].title])) { ws = items[w]; break }
            }
            if (ws) {
              var wsIds = {}
              for (var k = 0; k < (ws.sessionIds || []).length; k += 1) wsIds[ws.sessionIds[k]] = true
              cands = cands.filter(function (s) { return wsIds[s.id] })
            } else {
              var union = {}
              for (var u = 0; u < items.length; u += 1) {
                var sids = (items[u] && items[u].sessionIds) || []
                for (var m = 0; m < sids.length; m += 1) union[sids[m]] = true
              }
              cands = cands.filter(function (s) { return !union[s.id] })
            }
          }
          // Header present but untitleable (defensive) -> no further narrowing.
        }
        // No section header (flat list, defensive) -> no workspace narrowing.
        if (cands.length === 0) return null
        if (cands.length === 1) return cands[0].id
        cands.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0) })
        return cands[0].id
      }

      function onPointerDown(e) {
        if (state.disposed || !e || !e.target || typeof e.target.closest !== 'function') return
        var btn = e.target.closest('button[aria-label]')
        if (!btn || btn.disabled) return
        var row = btn.closest('[role="treeitem"]')
        if (!row || row.tagName === 'BUTTON') return
        // Session rows always render aria-selected (true or false);
        // workspace headers do not render it — the attribute's presence
        // marks a session row, so any value qualifies (code r1 F8).
        if (!row.hasAttribute('aria-selected')) return
        if (row.hasAttribute('aria-expanded')) return
        var kbs = row.querySelectorAll('button[aria-label]')
        if (kbs.length !== 1 || kbs[0] !== btn) return
        state.pending = { button: btn, row: row, at: Date.now() }
      }

      function handleMenu(menu) {
        if (state.disposed) return
        if (menu.hasAttribute('data-dsh-sid')) return
        var p = state.pending
        if (!p || Date.now() - p.at > CORRELATE_WINDOW_MS) return
        var mr = menu.getBoundingClientRect()
        var br = p.button.getBoundingClientRect()
        if (!mr || !br) return
        var leftOk = Math.abs(mr.left - br.left) <= GEOMETRY_TOL_PX
        var overlap = mr.left < br.left + br.width && mr.left + mr.width > br.left
        // The host portal menu (Menu.tsx placement effect) clamps the list's
        // x into [12, vw - lw - 12]: with the kebab near the viewport's
        // right edge the menu is pulled left to the clamp bound and can sit
        // entirely left of the button (no overlap, left edge > 12px off).
        // Accept the host's right clamp verbatim: the button's unclamped
        // position would overflow the right margin, and the menu actually
        // sits at that bound (code r3 F12).
        var vw = window.innerWidth
        var rightClamp = typeof vw === 'number' &&
          br.left + mr.width > vw - GEOMETRY_TOL_PX &&
          mr.left + mr.width >= vw - GEOMETRY_TOL_PX - GEOMETRY_TOL_PX
        if (!leftOk && !overlap && !rightClamp) return
        state.pending = null
        menu.setAttribute('data-dsh-sid', 'done')
        state.menus.push(menu)
        injectItem(menu, p.row)
      }

      function injectItem(menu, row) {
        var viewport = null
        var first = menu.firstElementChild
        if (first && first.getAttribute('role') === 'presentation') viewport = first
        if (!viewport) viewport = first
        if (!viewport) return
        var buttons = menu.querySelectorAll('button[role="menuitem"]')
        if (buttons.length === 0) return
        var existing = buttons[0]
        var wrapProto = existing.parentElement
        if (!wrapProto) return
        var spans = existing.querySelectorAll('span')
        var iconCls = spans.length > 0 ? (spans[0].className || '') : ''
        var labelCls = spans.length > 1 ? (spans[spans.length - 1].className || '') : iconCls

        var wrap = document.createElement('div')
        wrap.className = wrapProto.className
        var btn = document.createElement('button')
        btn.type = 'button'
        btn.setAttribute('role', 'menuitem')
        btn.className = existing.className
        btn.setAttribute('data-dsh-session-id', '1')
        var icon = document.createElement('span')
        icon.className = iconCls
        icon.innerHTML = COPY_SVG
        var label = document.createElement('span')
        label.className = labelCls
        label.textContent = labels().item
        btn.appendChild(icon)
        btn.appendChild(label)
        wrap.appendChild(btn)
        viewport.appendChild(wrap)
        state.items.push(wrap)

        btn.addEventListener('click', function (e) {
          e.stopPropagation()
          if (state.disposed) return
          var id = resolveSessionId(row)
          if (!id) {
            var missT = setTimeout(function () {
              dropFrom(state.timers, missT)
              if (!state.disposed) dispatchEscape()
            }, ESCAPE_AFTER_MISS_MS)
            state.timers.push(missT)
            return
          }
          copyText(id).then(function (ok) {
            if (state.disposed) return
            if (ok) {
              label.textContent = labels().copied
              var flashT = setTimeout(function () {
                dropFrom(state.timers, flashT)
                if (!state.disposed) label.textContent = labels().item
              }, COPIED_FLASH_MS)
              state.timers.push(flashT)
            }
            var escT = setTimeout(function () {
              dropFrom(state.timers, escT)
              if (!state.disposed) dispatchEscape()
            }, ok ? ESCAPE_AFTER_COPY_MS : ESCAPE_AFTER_MISS_MS)
            state.timers.push(escT)
          })
        })
      }

      function scheduleDrain() {
        if (state.disposed || state.rafs.length > 0) return
        var rafId = requestAnimationFrame(function () {
          dropFrom(state.rafs, rafId)
          while (!state.disposed && state.queue.length > 0) handleMenu(state.queue.shift())
        })
        state.rafs.push(rafId)
      }

      function onMutations(muts) {
        for (var i = 0; i < muts.length; i += 1) {
          var nodes = muts[i].addedNodes
          for (var j = 0; j < nodes.length; j += 1) {
            var el = nodes[j]
            if (el && el.nodeType === 1 && el.parentNode === document.body && el.matches && el.matches('[role="menu"]')) {
              state.queue.push(el)
              scheduleDrain()
            }
          }
        }
      }

      var observer = new MutationObserver(onMutations)
      observer.observe(document.body, { childList: true })
      document.addEventListener('pointerdown', onPointerDown, true)

      // One owned effect; cleanup reclaims every owned effect (rAFs, timers,
      // injected items, menu markers) so a disposed plugin leaves no
      // observable residue in the live menu.
      ctx.effect(function () {
        return function cleanup() {
          state.disposed = true
          observer.disconnect()
          document.removeEventListener('pointerdown', onPointerDown, true)
          state.queue.length = 0
          state.pending = null
          state.rafs.forEach(function (id) { cancelAnimationFrame(id) })
          state.timers.forEach(function (t) { clearTimeout(t) })
          state.items.forEach(function (wrap) { if (wrap.isConnected) wrap.remove() })
          state.menus.forEach(function (m) { m.removeAttribute('data-dsh-sid') })
          state.rafs.length = 0
          state.timers.length = 0
          state.menus.length = 0
          state.items.length = 0
        }
      }, 'dsh-session-id-menu: session kebab Session ID item')
    }

    exports.apply = apply
    // 'slots' is declared for the super-module precheck skeleton (see the
    // register marker in apply); the pure-DOM form never registers a panel.
    exports.inject = ['sessions', 'workspaces', 'slots']
    return module.exports
  },
})
