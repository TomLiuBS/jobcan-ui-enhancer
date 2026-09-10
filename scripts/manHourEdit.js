// scripts/manHourEdit.js
//
// Isolated-world enhancements for the rebuilt man-hour edit page
// (/employee/man-hour-manage/edit-achievement):
//   * decimal-hour normalization on input.manhour ("3" -> "3:00", "3.5" -> "3:30"),
//     including unblocking the "." key that Jobcan's own keydown filter rejects
//   * プロジェクト cells: hide the "(code)" prefix, surface it in a hover popover
//   * compact summary header (実績 vs 実労働時間) and date navigation
//   * keyboard shortcuts (Shift+Enter = add row, Cmd/Ctrl+Enter = save)
//
// NOTE: project/task selection is handled by Jobcan's own native autocomplete.
// We do NOT replace those fields — an earlier custom side-panel picker did, but
// selections made that way bypass Jobcan's internal model and get rejected as
// 未入力/invalid (and would not save). Improving the project SEARCH (substring
// matching) is done by widening the native autocomplete's source in
// scripts/manHourEditSearch.js, which must run in the MAIN world to reach the
// page's jQuery + autocomplete instances.

(function () {
  if (window.__jbe_manHourEditModuleReady) return;
  window.__jbe_manHourEditModuleReady = true;

  function getEditTable() {
    return document.querySelector('table.jbc-table');
  }

  function parseHHMMToSeconds(text) {
    const m = String(text || '').trim().match(/^(\d{1,4}):(\d{1,2})$/);
    if (!m) return null;
    return ((parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0)) * 60;
  }

  function secondsToHHMM(seconds) {
    const v = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(v / 3600);
    const m = Math.round((v - h * 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // 1. Decimal-hour normalization on the man-hour (実績) input
  // ---------------------------------------------------------------------------

  // Hours are zero-padded to match how Jobcan renders the rest of the 実績 column
  // ("06:33", "00:30") — an unpadded "0:30" next to those reads as a typo.
  function formatMinutesAsHMM(totalMinutes) {
    const safe = Math.max(0, Math.round(Number(totalMinutes) || 0));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function normalizeTypedDecimalHours(raw) {
    // NFKC folds full-width digits / colon / period (１．５ ： ), which a JP IME
    // produces easily, into their ASCII forms before parsing.
    const text = String(raw == null ? '' : raw).normalize('NFKC').trim();
    if (!text) return text;

    const colon = text.match(/^(\d+)\s*:\s*(\d{1,2})$/);
    if (colon) {
      const h = parseInt(colon[1], 10) || 0;
      let mi = parseInt(colon[2], 10) || 0;
      if (mi > 59) mi = 59;
      return formatMinutesAsHMM(h * 60 + mi);
    }

    // A bare number is HOURS, not minutes: "1" -> 1:00, "1.5" -> 1:30, ".5" -> 0:30.
    // Jobcan's own field only accepts hh:mm and silently clears anything else, so
    // without this the natural "type 1 for one hour" is lost.
    if (/^(\d+(?:\.\d+)?|\.\d+)$/.test(text)) {
      const hours = parseFloat(text);
      if (Number.isFinite(hours) && hours >= 0) return formatMinutesAsHMM(hours * 60);
    }

    return text;
  }

  // A single delegated normalizer on the document, in CAPTURE phase.
  //
  // Why not per-input listeners (the previous approach): they were attached from
  // enhanceExistingRows(), which only sees rows present at init or reported by the
  // tbody MutationObserver. Jobcan REPLACES the tbody when it re-renders the
  // editor, orphaning that observer — so in practice no input ever got a listener
  // (verified live: not one had the data-attribute). Delegating from the document
  // is immune to re-renders and needs no per-row bookkeeping.
  //
  // Capture on the document also fixes the ordering problem: listeners bound to
  // the input itself can run AFTER Jobcan's own blur handler, which rejects a bare
  // "1" and wipes the cell. Document-capture runs before any target listener, so
  // Jobcan only ever sees the already-valid "1:00".
  function setupDecimalHoursNormalizer() {
    if (window.__jbe_manHourDecimalNormalizer) return;
    window.__jbe_manHourDecimalNormalizer = true;

    const isManHourInput = (el) => !!(
      el && el.classList && el.classList.contains('manhour')
      && el.closest && el.closest('table.jbc-table') && !el.closest('#template')
    );

    let committing = false;
    const commit = (input) => {
      if (committing) return; // our own synthetic change re-enters this handler
      const next = normalizeTypedDecimalHours(input.value);
      if (next === input.value) return;
      committing = true;
      try {
        input.value = next;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } finally {
        committing = false;
      }
    };

    // blur/focusout cover leaving the field by Tab, click-away or programmatic
    // blur; keydown covers committing with Enter (which may also trigger save).
    ['blur', 'focusout', 'change'].forEach((type) => {
      document.addEventListener(type, (e) => { if (isManHourInput(e.target)) commit(e.target); }, true);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && isManHourInput(e.target)) commit(e.target);
    }, true);

    // Let "." actually be typed.
    //
    // Jobcan filters keystrokes on input.manhour with a jQuery-delegated keydown on
    // the tbody whose whitelist is digits + Delete/Backspace/Enter/Tab/End/Home/
    // arrows + ":" — no ".". Returning false from a delegated jQuery handler
    // preventDefaults the event, so the decimal shorthand above was literally
    // untypeable however correct the parsing was.
    //
    // Jobcan's handler is delegated (bubble phase, on the tbody), so stopping the
    // event during the DOCUMENT's capture phase means it never reaches the tbody and
    // the browser's default insertion happens normally. stopPropagation — not
    // stopImmediatePropagation — so our own document-level listeners above, and any
    // other listener on document, still run. Scoped to the "." keys alone; every
    // other key still goes through Jobcan's filter untouched.
    const DECIMAL_KEYS = ['.', '．', 'Decimal']; // ASCII, full-width, numpad
    document.addEventListener('keydown', (e) => {
      if (!DECIMAL_KEYS.includes(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // leave shortcuts alone
      if (!isManHourInput(e.target)) return;
      e.stopPropagation();
    }, true);
  }

  // ---------------------------------------------------------------------------
  // 1b. プロジェクト cells: hide the "(code)" prefix, show it in the popover
  // ---------------------------------------------------------------------------
  //
  // A filled project field reads "(2607BfZz0601)アサイン/…/デザイン制作" — the code
  // eats the front of a narrow cell and pushes the part you actually read out of
  // view. We must NOT rewrite input.value: Jobcan validates and saves from that
  // exact string (see the header note). So the code is hidden VISUALLY — an
  // absolutely-positioned mask span covers the input and paints the name only.
  //
  // The mask stays up on hover; the code is surfaced in the hover popover instead,
  // together with the copy buttons, so the cell text never reflows. Only focus
  // drops the mask (CSS :focus-within), since editing needs the real value and a
  // visible caret. The popover is position:fixed and parented to <body> because
  // the man-hour table clips overflow.
  //
  // Scope: プロジェクト only, as asked. タスク uses the same "(4)デザイン" shape and
  // the same class, so flipping MASK_TASK_UNITS to true covers it too.
  const MASK_TASK_UNITS = false;

  function splitUnitValue(value) {
    const m = String(value == null ? '' : value).match(/^\(([^)]*)\)\s*([\s\S]*)$/);
    if (!m) return null;
    const code = m[1].trim();
    const name = m[2].trim();
    if (!code || !name) return null;
    return { code, name };
  }

  // The project field is the first input.unit in the row, the task field the second.
  function maskableUnitInputs(row) {
    const units = Array.from(row.querySelectorAll('input.unit'));
    return MASK_TASK_UNITS ? units : units.slice(0, 1);
  }

  // The mask is positioned in three explicit phases, because refreshUnitMasks()
  // runs from the table's MutationObserver — i.e. on every re-render — and the
  // old single-pass version interleaved a layout read (offsetLeft/offsetWidth)
  // with a style write per input, forcing a synchronous relayout per row.
  //
  //   prepare -> writes, but only on the first pass for a given input
  //   measure -> reads only, so the whole batch shares one layout flush
  //   paint   -> writes only, with no read in between

  // Phase 1. Create/remove the mask span and sync its text. Returns null when the
  // field has no "(code)name" value to mask.
  function prepareUnitMask(input) {
    const cell = input && input.parentElement;
    if (!cell) return null;
    const parts = splitUnitValue(input.value);
    let mask = cell.querySelector('.jbe-unit-mask');

    if (!parts) { // empty, or not the "(code)name" shape — leave the field alone
      if (mask) mask.remove();
      cell.classList.remove('jbe-unit-cell');
      input.classList.remove('jbe-unit-masked');
      return null;
    }

    if (!mask) {
      mask = document.createElement('span');
      mask.className = 'jbe-unit-mask';
      mask.setAttribute('aria-hidden', 'true'); // the input already carries the full value
      cell.appendChild(mask);
    }
    if (mask.textContent !== parts.name) mask.textContent = parts.name;
    mask.dataset.code = parts.code;
    mask.dataset.name = parts.name;
    cell.classList.add('jbe-unit-cell');
    input.classList.add('jbe-unit-masked');
    return { input, mask };
  }

  // Phase 2. Reads only. The getComputedStyle-derived text metrics are the
  // expensive half and only change when the input's box does, so they are cached
  // on the element and keyed on its measured size.
  function measureUnitMask(input) {
    const box = {
      left: input.offsetLeft,
      top: input.offsetTop,
      width: input.offsetWidth,
      height: input.offsetHeight
    };

    const cached = input.__jbeMaskText;
    if (cached && cached.width === box.width && cached.height === box.height) {
      return { box, text: cached };
    }

    const cs = window.getComputedStyle(input);
    const text = {
      width: box.width,
      height: box.height,
      font: cs.font,
      letterSpacing: cs.letterSpacing,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      textAlign: cs.textAlign,
      borderRadius: cs.borderRadius
    };
    input.__jbeMaskText = text;
    return { box, text };
  }

  // Phase 3. Writes only. Match the input's box and text metrics so the name sits
  // exactly where the real text would. Done here (not in CSS) because the input's
  // inset inside the cell varies with Jobcan's per-row markup.
  function paintUnitMask(mask, metrics) {
    const { box, text } = metrics;
    mask.style.left = `${box.left}px`;
    mask.style.top = `${box.top}px`;
    mask.style.width = `${box.width}px`;
    mask.style.height = `${box.height}px`;
    mask.style.font = text.font;
    mask.style.letterSpacing = text.letterSpacing;
    mask.style.paddingLeft = text.paddingLeft;
    mask.style.paddingRight = text.paddingRight;
    mask.style.textAlign = text.textAlign;
    mask.style.borderRadius = text.borderRadius;
  }

  // Single-input path, used by the delegated change/input handlers.
  function applyUnitMask(input) {
    const prepared = prepareUnitMask(input);
    if (!prepared) return;
    paintUnitMask(prepared.mask, measureUnitMask(prepared.input));
  }

  function collectMaskableInputs(root) {
    // When `root` IS a row (observer callback), a descendant query finds nothing.
    if (root && root.tagName === 'TR') {
      return root.id === 'template' ? [] : maskableUnitInputs(root);
    }
    const scope = root && root.querySelectorAll ? root : document;
    const inputs = [];
    scope.querySelectorAll('table.jbc-table tbody tr').forEach((row) => {
      if (row.id === 'template') return;
      maskableUnitInputs(row).forEach((input) => inputs.push(input));
    });
    return inputs;
  }

  function refreshUnitMasks(root) {
    const prepared = collectMaskableInputs(root)
      .map(prepareUnitMask)
      .filter(Boolean);
    if (!prepared.length) return;

    prepared.forEach((item) => { item.metrics = measureUnitMask(item.input); });
    prepared.forEach((item) => paintUnitMask(item.mask, item.metrics));
  }

  // --- hover popover: the code + copy buttons --------------------------------

  function copyText(text, btn) {
    const flash = (ok) => {
      btn.classList.add(ok ? 'is-copied' : 'is-failed');
      setTimeout(() => btn.classList.remove('is-copied', 'is-failed'), 1100);
    };
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        flash(ok);
      } catch (_) { flash(false); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => flash(true)).catch(fallback);
      } else fallback();
    } catch (_) { fallback(); }
  }

  const COPY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1V2zm1 1h5a2 2 0 0 1 2 2v6a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v1zM4 4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H4z"/></svg>';
  const PIN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .354.854L10.707 2H11.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-.5l-.5 4 1.5 1.5a.5.5 0 0 1-.354.854H8.5v3a.5.5 0 0 1-1 0v-3H4.354A.5.5 0 0 1 4 11.854L5.5 10.354 5 6h-.5A.5.5 0 0 1 4 5.5v-3a.5.5 0 0 1 .5-.5h.793L4.146.854A.5.5 0 0 1 4.146.146z"/></svg>';

  // --- pin store, shared with manHourEditSearch.js (MAIN world) ---------------
  //
  // Pinning used to require opening the dropdown to reach the pin button on an
  // option — so you could only pin a project you were in the middle of searching
  // for, which is backwards: the ones worth pinning are the ones already in your
  // rows. This popover is the ISOLATED-world half of the same store.
  //
  // Both worlds read the same localStorage key, but the MAIN world holds its copy
  // in a Set and a same-document write fires no `storage` event. So the writer
  // announces the change with a DOM event, which does cross the world boundary.
  // Keep the key and event name in sync with manHourEditSearch.js.
  const PIN_STORE_KEY = 'jbe_manhour_pins';
  const PIN_CHANGE_EVENT = 'jbe:manhour-pins-changed';

  function readPins() {
    try { return new Set(JSON.parse(localStorage.getItem(PIN_STORE_KEY) || '[]')); }
    catch (_) { return new Set(); }
  }

  // Keyed on the whole "(code)name" label, exactly as the dropdown keys it: the
  // input's value IS that label, and trim() folds the trailing U+3000 the API
  // sometimes appends (the dropdown side strips it the same way, so the two keys
  // agree). Deliberately NOT rebuilt from the mask's code/name, which are trimmed
  // separately and would drop any space between "(code)" and the name.
  const pinKeyForValue = (value) => String(value == null ? '' : value).trim();

  function isPinnedValue(value) {
    const key = pinKeyForValue(value);
    return !!key && readPins().has(key);
  }

  // Returns the new pinned state.
  function togglePinnedValue(value) {
    const key = pinKeyForValue(value);
    if (!key) return false;
    const pins = readPins();
    if (pins.has(key)) pins.delete(key); else pins.add(key);
    try { localStorage.setItem(PIN_STORE_KEY, JSON.stringify([...pins])); } catch (_) { /* quota */ }
    try { window.dispatchEvent(new CustomEvent(PIN_CHANGE_EVENT)); } catch (_) {}
    return pins.has(key);
  }

  function paintPinButton(btn, pinned) {
    if (!btn) return;
    btn.classList.toggle('is-pinned', pinned);
    btn.title = pinned ? 'ピン留めを解除' : 'ドロップダウンの上部にピン留め';
    const label = btn.querySelector('span');
    if (label) label.textContent = pinned ? 'ピン留め中' : 'ピン留め';
  }

  let unitPop = null;
  let unitPopHideTimer = null;

  function ensureUnitPopover() {
    if (unitPop && unitPop.isConnected) return unitPop;
    unitPop = document.createElement('div');
    unitPop.id = 'jbe-unit-idpop';
    unitPop.innerHTML =
      '<code class="jbe-unit-idpop-code"></code>'
      + `<button type="button" class="jbe-unit-idpop-btn jbe-unit-idpop-pin" data-jbe-pin>${PIN_ICON}<span>ピン留め</span></button>`
      + `<button type="button" class="jbe-unit-idpop-btn" data-jbe-copy="code">${COPY_ICON}<span>IDをコピー</span></button>`
      + `<button type="button" class="jbe-unit-idpop-btn" data-jbe-copy="name">${COPY_ICON}<span>プロジェクト名をコピー</span></button>`;

    unitPop.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus put
    unitPop.addEventListener('click', (e) => {
      const pinBtn = e.target.closest('[data-jbe-pin]');
      if (pinBtn) {
        e.preventDefault();
        e.stopPropagation();
        paintPinButton(pinBtn, togglePinnedValue(unitPop.dataset.pinKey));
        return;
      }
      const btn = e.target.closest('[data-jbe-copy]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const which = btn.dataset.jbeCopy;
      const value = which === 'code' ? unitPop.dataset.code : unitPop.dataset.name;
      if (value) copyText(value, btn);
    });
    unitPop.addEventListener('mouseenter', () => clearTimeout(unitPopHideTimer));
    unitPop.addEventListener('mouseleave', () => hideUnitPopover());
    document.body.appendChild(unitPop);
    return unitPop;
  }

  function hideUnitPopover() {
    clearTimeout(unitPopHideTimer);
    unitPopHideTimer = setTimeout(() => {
      if (unitPop) unitPop.classList.remove('is-open');
    }, 120); // grace period so the pointer can travel input -> popover
  }

  function showUnitPopover(input) {
    const mask = input.parentElement && input.parentElement.querySelector('.jbe-unit-mask');
    if (!mask) return;
    const pop = ensureUnitPopover();
    clearTimeout(unitPopHideTimer);
    pop.dataset.code = mask.dataset.code || '';
    pop.dataset.name = mask.dataset.name || '';
    pop.querySelector('.jbe-unit-idpop-code').textContent = pop.dataset.code;

    // Read the pinned state fresh: the dropdown's own pin buttons (MAIN world) may
    // have changed it since the last time this popover opened.
    pop.dataset.pinKey = pinKeyForValue(input.value);
    paintPinButton(pop.querySelector('[data-jbe-pin]'), isPinnedValue(input.value));

    const GAP = 6;
    const r = input.getBoundingClientRect();
    pop.classList.add('is-open'); // measure only once it has layout
    const pw = pop.offsetWidth || 260;
    const ph = pop.offsetHeight || 32;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));

    // Sit ABOVE the field. Below meant the popover covered the next row's project
    // cell, which is the thing you are usually comparing against. Flip back below
    // only when there isn't room above (first row, or a scrolled-to-top table).
    const above = r.top - ph - GAP;
    const top = above >= 8 ? above : r.bottom + GAP;

    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function setupUnitMaskInteractions() {
    if (window.__jbe_manHourUnitMaskReady) return;
    window.__jbe_manHourUnitMaskReady = true;

    const maskedInput = (el) => {
      const input = el && el.closest ? el.closest('input.unit') : null;
      return input && input.classList.contains('jbe-unit-masked') ? input : null;
    };

    // Delegated (survives re-renders). mouseover/out rather than enter/leave so a
    // single document-level pair covers every row.
    document.addEventListener('mouseover', (e) => {
      const cell = e.target.closest && e.target.closest('.jbe-unit-cell');
      if (!cell) return;
      const input = cell.querySelector('input.unit.jbe-unit-masked');
      if (input) showUnitPopover(input);
    });
    document.addEventListener('mouseout', (e) => {
      const cell = e.target.closest && e.target.closest('.jbe-unit-cell');
      if (!cell) return;
      const to = e.relatedTarget;
      if (to && (cell.contains(to) || (unitPop && unitPop.contains(to)))) return;
      hideUnitPopover();
    });

    // Re-mask whenever a value lands (native autocomplete selection fires change).
    ['change', 'input'].forEach((type) => {
      document.addEventListener(type, (e) => {
        const input = maskedInput(e.target) || (e.target.classList
          && e.target.classList.contains('unit') ? e.target : null);
        if (input && input.closest('table.jbc-table') && !input.closest('#template')) applyUnitMask(input);
      }, true);
    });

    // Jobcan re-renders rows (and swaps the tbody) — re-apply then. Keyed on the
    // mask's presence, so it is idempotent; disconnect while we write so our own
    // DOM changes don't re-trigger it.
    const table = getEditTable();
    if (!table) return;
    const obs = new MutationObserver(() => {
      obs.disconnect();
      try { refreshUnitMasks(document); } catch (_) { /* keep observing */ }
      obs.observe(table, { childList: true, subtree: true });
    });
    obs.observe(table, { childList: true, subtree: true });
    if (typeof window.__jbe_registerManagedObserver === 'function') {
      window.__jbe_registerManagedObserver('manHourEdit:unitMask', obs);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Day totals (feeds the summary header)
  // ---------------------------------------------------------------------------
  //
  // The "提案: h:mm" hover chips that used to live here were removed: Jobcan's
  // rebuilt editor ships a native 差分 column with a 調整 button that proposes and
  // applies the same balancing value, so the chips only duplicated it (and had to
  // be excluded from the DOM observer to avoid self-triggering). These two helpers
  // stay because updateSummary() computes 実績 vs 実労働時間 from them.

  function getActualWorkSeconds() {
    const labelCell = Array.from(document.querySelectorAll('th, td'))
      .find((c) => c.textContent.trim() === '実労働時間');
    if (labelCell && labelCell.nextElementSibling) {
      const secs = parseHHMMToSeconds(labelCell.nextElementSibling.textContent);
      if (secs != null) return secs;
    }
    return null;
  }

  function getEnteredSeconds() {
    let total = 0;
    document.querySelectorAll('table.jbc-table input.manhour').forEach((inp) => {
      const secs = parseHHMMToSeconds(inp.value);
      if (secs != null) total += secs;
    });
    return total;
  }

  // ---------------------------------------------------------------------------
  // 3. Keyboard shortcuts for the standalone edit page
  // ---------------------------------------------------------------------------

  function setupEditKeyboardShortcuts() {
    if (window.__jbe_manHourEditShortcuts) return;
    window.__jbe_manHourEditShortcuts = true;
    document.addEventListener('keydown', (e) => {
      if (!(window.location.pathname || '').startsWith('/employee/man-hour-manage/edit-achievement')) return;
      if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const addBtn = document.getElementById('add');
        if (addBtn) { e.preventDefault(); addBtn.click(); }
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const saveBtn = document.getElementById('save');
        if (saveBtn) { e.preventDefault(); saveBtn.click(); }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Action bar: group 追加 + スクリーンショット + 保存 into one row
  // ---------------------------------------------------------------------------

  // The rebuilt editor scatters its actions (保存 top-right, 追加 below the table)
  // and has no on-page screenshot button. Pull all three into one bottom action
  // bar. The native #save / #add are MOVED (never cloned) so their own click
  // handlers stay attached; the screenshot button reuses the shared capture tool.
  function setupEditActionBar() {
    const save = document.getElementById('save');
    const add = document.getElementById('add');
    if (!save || !add) return false;

    let bar = document.getElementById('jbe-mh-actionbar');
    if (bar) {
      // Re-assert membership if the page ever re-renders the native buttons.
      if (add.parentElement !== bar) bar.insertBefore(add, bar.firstChild);
      if (save.parentElement !== bar) bar.appendChild(save);
      return true;
    }

    const saveCol = save.parentElement;
    const addAnchor = add.closest('.row') || add.parentElement;

    bar = document.createElement('div');
    bar.id = 'jbe-mh-actionbar';

    const shot = document.createElement('button');
    shot.type = 'button';
    shot.id = 'jbe-mh-screenshot';
    shot.className = 'btn jbc-btn-outline-primary';
    shot.title = 'スクリーンショット';
    shot.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span>スクリーンショット</span>';
    shot.addEventListener('click', () => {
      // Auto-generate the day's 工数レポート (copy + download preview). Fall back to
      // the manual area-select capture only if the report builder isn't available.
      if (typeof captureManHourDayReport === 'function') captureManHourDayReport();
      else if (typeof initScreenshotCapture === 'function') initScreenshotCapture();
    });

    // Insert the bar where 追加 sat, then MOVE the native buttons into it.
    addAnchor.parentElement.insertBefore(bar, addAnchor);
    bar.appendChild(add);   // 追加 — pushed to the left by CSS (margin-right:auto)
    bar.appendChild(shot);  // スクリーンショット
    bar.appendChild(save);  // 保存 — primary, far right

    // Hide the now-empty original wrappers so they don't leave gaps.
    if (saveCol && !saveCol.querySelector('button, input, select, a')) saveCol.style.display = 'none';
    if (addAnchor && addAnchor !== bar && !addAnchor.querySelector('button, input, select, a')) addAnchor.style.display = 'none';

    return true;
  }

  // ---------------------------------------------------------------------------
  // 5. Compact summary header + date/nav row (replaces the native 工数情報 card)
  // ---------------------------------------------------------------------------
  //
  // Native layout inside #man-hour-manage-v2-body .card-body (top -> bottom):
  //   .row.pl-1.pr-1  -> #date_selector > form#search > .jbc-ymd-select (#year/#month/#day)
  //   .row.mt-3       -> .col-lg-6 (工数情報 card: td#actual_work / td#last_update)
  //                      .col-lg-6 (備考 card: textarea#note)
  //   .row.pl-1.pr-1  -> #template_buttons (#add_default_manhour, .btn-group>#add_from_template) + #remove
  //   .row.p-3        -> table.jbc-table
  //
  // We MOVE the native 備考 textarea, the date form, and テンプレート/削除 into our
  // own #jbe-mh-summary / #jbe-mh-nav containers (moved, never cloned, so their
  // handlers + Jobcan's model stay intact), hide the now-empty native rows, and
  // render a compact header reading the same live values the suggestion chips use.

  // Move a native node into one of our containers (no-op if absent/already there).
  function relocate(node, dest) {
    if (node && dest && node.parentElement !== dest) dest.appendChild(node);
    return !!node;
  }

  // Hide the Bootstrap .row that holds a native control we've emptied. Never hides
  // the editor row (the only .row carrying input.manhour) or our own containers.
  function hideRowOf(el) {
    const row = el && el.closest('.row');
    if (row && !row.querySelector('input.manhour') && !row.querySelector('#jbe-mh-summary, #jbe-mh-nav')) {
      row.style.display = 'none';
    }
  }

  function getLastUpdatedText() {
    const byId = document.getElementById('last_update');
    if (byId) { const t = (byId.textContent || '').replace(/\s+/g, ' ').trim(); if (t) return t; }
    const lbl = Array.from(document.querySelectorAll('th, td, dt, label, p, div, span'))
      .find((c) => /^最終更新/.test((c.textContent || '').trim()));
    if (lbl && lbl.nextElementSibling) {
      const t = (lbl.nextElementSibling.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
    return null;
  }

  // 工数実績 total from the native card (the saved total, computed at page load).
  // Used as the figure's value until the man-hour inputs finish populating.
  function getNativeManhourTotalSeconds() {
    const label = Array.from(document.querySelectorAll('th, td')).find((c) => (c.textContent || '').trim() === '工数実績');
    const cell = label && label.nextElementSibling;
    if (cell) {
      const m = (cell.textContent || '').match(/(\d{1,4}):(\d{2})/);
      if (m) return ((parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0)) * 60;
    }
    return null;
  }

  // Recompute the compact header from live values. No-op until the shell exists;
  // called on every edit / add / remove so it tracks live values.
  function updateSummary() {
    const root = document.getElementById('jbe-mh-summary');
    if (!root) return;
    // Prefer the live sum of the man-hour inputs; fall back to the native 工数実績
    // cell (the saved total) while the worker is still populating the inputs.
    let entered = getEnteredSeconds();
    if (entered === 0) {
      const nativeTotal = getNativeManhourTotalSeconds();
      if (nativeTotal != null) entered = nativeTotal;
    }
    const actual = getActualWorkSeconds();

    const fig = root.querySelector('.jbe-mh-figure-value');
    if (fig) fig.textContent = secondsToHHMM(entered);

    const sub = root.querySelector('.jbe-mh-subline');
    if (sub) sub.textContent = `実労働時間: ${actual == null ? '--:--' : secondsToHHMM(actual)}`;

    const badge = root.querySelector('.jbe-mh-badge');
    if (badge) {
      badge.classList.remove('jbe-mh-badge--over', 'jbe-mh-badge--under', 'jbe-mh-badge--match');
      if (actual == null) {
        badge.style.display = 'none';
      } else {
        badge.style.display = '';
        const diff = actual - entered; // <0 over-entered (超過), >0 short (不足)
        const mag = secondsToHHMM(Math.abs(diff));
        if (diff === 0) { badge.classList.add('jbe-mh-badge--match'); badge.textContent = '一致'; }
        else if (diff < 0) { badge.classList.add('jbe-mh-badge--over'); badge.textContent = `${mag}超過`; }
        else { badge.classList.add('jbe-mh-badge--under'); badge.textContent = `${mag}不足`; }
      }
    }

    const updated = root.querySelector('.jbe-mh-updated');
    if (updated) {
      const txt = getLastUpdatedText();
      if (txt) { updated.style.display = ''; updated.textContent = `最終更新: ${txt}`; }
      else { updated.style.display = 'none'; }
    }
  }

  // --- date navigation (前の日 / 次の日) -------------------------------------
  // The page carries the date in ?year/month/day (read by manHourEditSearch.js);
  // navigating there reloads cleanly to the adjacent day.
  function getCurrentEditDate() {
    const y = document.getElementById('year');
    const m = document.getElementById('month');
    const d = document.getElementById('day');
    let yy = y && parseInt(y.value, 10);
    let mm = m && parseInt(m.value, 10);
    let dd = d && parseInt(d.value, 10);
    if (!(yy && mm && dd)) {
      const p = new URLSearchParams(location.search);
      yy = parseInt(p.get('year'), 10) || yy;
      mm = parseInt(p.get('month'), 10) || mm;
      dd = parseInt(p.get('day'), 10) || dd;
    }
    return (yy && mm && dd) ? new Date(yy, mm - 1, dd) : null;
  }

  function navigateToDate(dateObj) {
    if (!dateObj) return;
    const p = new URLSearchParams(location.search);
    p.set('year', String(dateObj.getFullYear()));
    p.set('month', String(dateObj.getMonth() + 1));
    p.set('day', String(dateObj.getDate()));
    // ?aid is the achievement-record id of the day we arrived from (the list page
    // links in with it). It takes precedence over year/month/day for the row data,
    // so carrying it forward renders the OLD day's 工数 rows next to the NEW day's
    // 実労働時間 — with 保存 one click away. Drop it and let the date decide.
    p.delete('aid');
    location.search = p.toString();
  }

  function navigateToDay(delta) {
    const base = getCurrentEditDate();
    if (!base) return;
    base.setDate(base.getDate() + delta);
    navigateToDate(base);
  }

  function makeNavButton(label, handler, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn jbe-mh-nav-btn${extraClass ? ` ${extraClass}` : ''}`;
    btn.textContent = label;
    btn.addEventListener('click', () => { if (!btn.disabled) handler(); });
    return btn;
  }

  const NAV_CHEVRON = {
    prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>',
    next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>'
  };
  function makeNavIconButton(dir, handler, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn jbe-mh-nav-btn jbe-mh-nav-icon${extraClass ? ` ${extraClass}` : ''}`;
    btn.innerHTML = NAV_CHEVRON[dir];
    const label = dir === 'prev' ? '前の日' : '次の日';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', () => { if (!btn.disabled) handler(); });
    return btn;
  }

  // Disable 次の日 once the edit date reaches today (can't log future days) and
  // 今日 when already on today.
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function updateNavButtonStates() {
    const cur = getCurrentEditDate();
    if (!cur) return;
    const today = startOfDay(new Date()).getTime();
    const curTime = startOfDay(cur).getTime();
    const nextBtn = document.querySelector('.jbe-mh-nav-next');
    const todayBtn = document.querySelector('.jbe-mh-nav-today');
    if (nextBtn) nextBtn.disabled = curTime >= today;
    if (todayBtn) todayBtn.disabled = curTime === today;
  }

  function buildSummaryShell() {
    const summary = document.createElement('div');
    summary.id = 'jbe-mh-summary';
    const main = document.createElement('div');
    main.className = 'jbe-mh-summary-main';
    const figure = document.createElement('div');
    figure.className = 'jbe-mh-figure';
    const figVal = document.createElement('span');
    figVal.className = 'jbe-mh-figure-value';
    const badge = document.createElement('span');
    badge.className = 'jbe-mh-badge';
    figure.appendChild(figVal);
    figure.appendChild(badge);
    const subline = document.createElement('div');
    subline.className = 'jbe-mh-subline';
    const updated = document.createElement('div');
    updated.className = 'jbe-mh-updated';
    main.appendChild(figure);
    main.appendChild(subline);
    main.appendChild(updated);
    const aside = document.createElement('div');
    aside.className = 'jbe-mh-summary-aside';
    summary.appendChild(main);
    summary.appendChild(aside);
    return summary;
  }

  // Idempotent builder, shaped like setupEditActionBar(): build once, then on every
  // later call re-assert the relocations in case Jobcan re-rendered a native node.
  // The native テンプレートから追加 dropdown is wired by Jobcan's own JS at init and
  // breaks if moved out of #template_buttons, so we DON'T move it — instead the
  // native toolbar row (#template_buttons + 削除) is restyled in place as the nav row.
  function setupSummaryHeader() {
    const table = getEditTable();
    if (!table) return false;
    const tableWrap = table.closest('.row') || table.parentElement;
    if (!tableWrap || !tableWrap.parentElement) return false;

    const existing = document.getElementById('jbe-mh-summary');
    if (existing) {
      const aside = existing.querySelector('.jbe-mh-summary-aside');
      if (aside && !aside.querySelector('textarea')) relocate(document.getElementById('note'), aside);
      const navDate = document.querySelector('.jbe-mh-nav-date');
      const form = document.getElementById('search');
      if (navDate && form && form.parentElement !== navDate) {
        navDate.insertBefore(form, navDate.querySelector('.jbe-mh-nav-today'));
      }
      const def = document.getElementById('add_default_manhour');
      if (def) def.style.display = 'none';
      updateNavButtonStates();
      updateSummary();
      return true;
    }

    // --- build once ---
    const summary = buildSummaryShell();
    const aside = summary.querySelector('.jbe-mh-summary-aside');

    // Date controls: 前の日 | native date form | 次の日 | 今日.
    const navDate = document.createElement('div');
    navDate.className = 'jbe-mh-nav-date';
    navDate.appendChild(makeNavIconButton('prev', () => navigateToDay(-1)));
    const form = document.getElementById('search');
    if (form) navDate.appendChild(form);
    navDate.appendChild(makeNavButton('今日', () => navigateToDate(new Date()), 'jbe-mh-nav-today'));
    navDate.appendChild(makeNavIconButton('next', () => navigateToDay(1), 'jbe-mh-nav-next'));

    // Reuse the native toolbar row (#template_buttons + 削除) as the nav row so the
    // template dropdown keeps Jobcan's native wiring; slot the date controls in at
    // the front and drop デフォルト工数を追加.
    const tmplBtns = document.getElementById('template_buttons');
    const navRow = tmplBtns ? tmplBtns.closest('.row') : null;
    if (navRow) {
      navRow.classList.add('jbe-mh-navrow');
      navRow.insertBefore(navDate, navRow.firstChild);
      const def = document.getElementById('add_default_manhour');
      if (def) def.style.display = 'none';
      navRow.parentElement.insertBefore(summary, navRow);
    } else {
      // Fallback: standalone nav with just the date controls.
      const standalone = document.createElement('div');
      standalone.id = 'jbe-mh-nav';
      standalone.appendChild(navDate);
      tableWrap.parentElement.insertBefore(summary, tableWrap);
      tableWrap.parentElement.insertBefore(standalone, tableWrap);
    }

    // 備考 -> header aside; hide the cards row only once the textarea is safely moved.
    const note = document.getElementById('note');
    relocate(note, aside);
    const actualCell = document.getElementById('actual_work');
    if (actualCell && note && note.parentElement === aside) hideRowOf(actualCell);

    // Hide the original date row now that the date form lives in the nav.
    const dateSel = document.getElementById('date_selector');
    if (dateSel && form && form.parentElement === navDate) hideRowOf(dateSel);

    updateNavButtonStates();
    updateSummary();
    // The worker fills the inputs + native cells AFTER the table appears, so the
    // first updateSummary() sees empty values. Re-run for a few seconds until the
    // figure (live sum) and 最終更新 are populated.
    if (typeof window.__jbe_startManagedInterval === 'function') {
      window.__jbe_startManagedInterval('manHourEdit:summaryRefresh', (ctx) => {
        updateSummary();
        if (getEnteredSeconds() > 0 && getLastUpdatedText()) ctx.stop();
      }, 500, { maxRuns: 20 });
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // 6. Date lead-in on the page heading
  // ---------------------------------------------------------------------------
  //
  // The heading (`h2.mb-3`, a direct child of .jbc-container) reads only
  // 工数実績入力 — which day you are editing is stated nowhere above the fold
  // except in the ymd selects, which now sit inside the nav row below the summary
  // card. Prepend the date to the heading so the day is the first thing read.
  //
  // Source of truth is getCurrentEditDate() (the #year/#month/#day selects, URL
  // params as fallback). Those selects cannot drift from the rendered day: their
  // inline onchange calls Jobcan's adjustDate(), which navigates immediately.

  const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

  function getEditPageHeading() {
    const container = document.querySelector('.jbc-container');
    // Direct child only — the cards below carry their own 工数情報 / 備考 headings.
    return container ? container.querySelector(':scope > h2') : null;
  }

  // Idempotent: builds the spans once, then only rewrites their text.
  function setupEditTitleDate() {
    const heading = getEditPageHeading();
    if (!heading) return false;
    const date = getCurrentEditDate();
    if (!date) return false;

    let lead = heading.querySelector(':scope > .jbe-mh-title-date');
    if (!lead) {
      // Wrap the native title in a span of its own so the heading can be a flex
      // row whose two parts wrap as units instead of breaking mid-word.
      const text = document.createElement('span');
      text.className = 'jbe-mh-title-text';
      while (heading.firstChild) text.appendChild(heading.firstChild);

      lead = document.createElement('span');
      lead.className = 'jbe-mh-title-date';
      const ymd = document.createElement('span');
      ymd.className = 'jbe-mh-title-ymd';
      const dow = document.createElement('span');
      dow.className = 'jbe-mh-title-dow';
      lead.appendChild(ymd);
      lead.appendChild(dow);

      heading.classList.add('jbe-mh-title');
      heading.appendChild(lead);  // date first...
      heading.appendChild(text);  // ...then 工数実績入力
    }

    const ymd = lead.querySelector('.jbe-mh-title-ymd');
    const dow = lead.querySelector('.jbe-mh-title-dow');
    if (ymd) {
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      ymd.textContent = `${date.getFullYear()}/${m}/${d}`;
    }
    if (dow) {
      const day = date.getDay();
      dow.textContent = `(${WEEKDAY_JP[day]})`;
      dow.classList.toggle('is-weekend', day === 0 || day === 6);
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------------

  // Mirror a field's value into its title so the full project/task/note shows on
  // hover even when the (truncated) cell can't display all of it.
  function syncFieldTitle(input) {
    if (!input) return;
    if (input.value) input.title = input.value; else input.removeAttribute('title');
  }

  function enhanceExistingRows(root) {
    const scope = root && root.querySelectorAll ? root : document;
    // Decimal-hour handling is delegated from the document now (see
    // setupDecimalHoursNormalizer) — nothing to attach per row.
    scope.querySelectorAll('table.jbc-table input.unit, table.jbc-table input.note').forEach((input) => {
      if (!input.closest('#template')) syncFieldTitle(input);
    });
    refreshUnitMasks(root);
  }

  function setupManHourEditPage() {
    if (window.__jbe_manHourEditPageInited) return;
    window.__jbe_manHourEditPageInited = true;

    setupEditKeyboardShortcuts();
    // Delegated from the document, so it does not need the table to exist yet.
    setupDecimalHoursNormalizer();

    const init = () => {
      // Before the table check: the heading is server-rendered and its date comes
      // from the ymd selects / URL, so it never has to wait for the worker.
      setupEditTitleDate();
      const table = getEditTable();
      if (!table) return false;
      enhanceExistingRows(document);
      setupSummaryHeader();
      updateSummary();
      setupEditActionBar();
      setupUnitMaskInteractions();
      return true;
    };

    if (!init()) {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (init() || Date.now() - startedAt > 8000) clearInterval(timer);
      }, 300);
    }

    // React to rows being added/removed (追加 / 削除 / template clone). Observe the
    // tbody's direct children only — chips live deeper, so this won't self-trigger.
    const table = getEditTable();
    const tbody = table ? table.querySelector('tbody') : null;
    if (tbody) {
      const observer = new MutationObserver((mutations) => {
        let rowsChanged = false;
        mutations.forEach((m) => {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'TR' && node.id !== 'template') {
              enhanceExistingRows(node);
              rowsChanged = true;
            }
          });
          if (Array.from(m.removedNodes).some((n) => n.nodeType === Node.ELEMENT_NODE && n.tagName === 'TR')) {
            rowsChanged = true;
          }
        });
        if (rowsChanged) { updateSummary(); setupSummaryHeader(); setupEditActionBar(); }
      });
      observer.observe(tbody, { childList: true });
      if (typeof window.__jbe_registerManagedObserver === 'function') {
        window.__jbe_registerManagedObserver('manHourEdit:tbody', observer);
      }
    }

    document.addEventListener('change', (e) => {
      const t = e.target;
      if (!t || !t.classList) return;
      if (t.classList.contains('manhour')) updateSummary();
      if (t.classList.contains('unit') || t.classList.contains('note')) syncFieldTitle(t);
    });

    // Keep the hover titles current as the user types or picks from the autocomplete.
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.classList && (t.classList.contains('unit') || t.classList.contains('note'))
        && t.closest && t.closest('table.jbc-table')) {
        syncFieldTitle(t);
      }
    });
  }

  window.setupManHourEditPage = setupManHourEditPage;
})();
