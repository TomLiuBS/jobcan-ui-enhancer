// scripts/manHourList.js
//
// Enhancements for the rebuilt man-hour list page
// (/employee/man-hour-manage/achievement-list). Jobcan now renders the list
// asynchronously via a Web Worker into <tbody id="list">, as a flat list of
// entries grouped by day (the date / 合計 / 総労働時間 / 最終更新 cells span the
// day's rows via rowspan). The old per-day "open the modal and scrape it" report
// is unnecessary now: every entry (project / task / per-entry hours) is already
// in the rendered table, so the report reads straight from the DOM.
//
// Features:
//   * waits for the worker-rendered rows before enhancing
//   * filter buttons: すべて / 工数不一致 / レポート
//   * highlights days whose 工数実績 (合計) differs from 総労働時間
//   * a report modal with KPIs and per-project / per-task aggregates, with a
//     month navigator that reads other months over the API without leaving the page

(function () {
  if (window.__jbe_manHourListModuleReady) return;
  window.__jbe_manHourListModuleReady = true;

  const getList = () => document.getElementById('list');

  // --- time helpers ----------------------------------------------------------

  function parseHHMMToMinutes(text) {
    const m = String(text == null ? '' : text).trim().match(/^(\d{1,4}):(\d{1,2})$/);
    return m ? (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0) : null;
  }

  function minutesToHHMM(minutes) {
    const v = Math.max(0, Math.round(minutes || 0));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  }

  function stripCode(label) {
    const api = window.JBE_ManHourApi;
    if (api && api.parseUnitLabel) {
      const parsed = api.parseUnitLabel(label);
      return parsed.name || label || '';
    }
    return String(label || '').replace(/^\([^)]*\)\s*/, '');
  }

  // --- parse the rendered list into day groups + entries ---------------------

  // Jobcan tags each date cell with a weekday class (sun … sat); weekends are
  // never "missing input", they are simply days that were not worked.
  const WEEKEND_CLASSES = ['sat', 'sun'];

  // The date cell is decorated in place by decorateDateCell — the date becomes an
  // .jbe-day-link and a mismatch day gains a "−0:43" .jbe-day-delta badge — so the
  // cell's whole textContent is no longer just the date. Reading it whole made
  // "08/04" + a "−1:23" badge parse as day 23 in the report's day-bar labels (and
  // would break dayEditUrl on any re-parse). Read the link when it is there.
  function dateCellText(cell) {
    if (!cell) return '';
    const link = cell.querySelector('.jbe-day-link');
    return ((link || cell).textContent || '').trim();
  }

  function parseListDays() {
    const list = getList();
    if (!list) return [];
    const days = [];
    let current = null;

    Array.from(list.querySelectorAll('tr')).forEach((tr) => {
      const dateCell = tr.querySelector('td.date');
      if (dateCell) {
        current = {
          dateText: dateCellText(dateCell),
          dateCell,
          isWeekend: WEEKEND_CLASSES.some((c) => dateCell.classList.contains(c)),
          sumMinutes: parseHHMMToMinutes((tr.querySelector('td.sum') || {}).textContent),
          workMinutes: parseHHMMToMinutes((tr.querySelector('td.work') || {}).textContent),
          lastUpdate: ((tr.querySelector('td.last_update') || {}).textContent || '').trim(),
          rows: [],
          entries: []
        };
        days.push(current);
      }
      if (!current) return;
      current.rows.push(tr);

      const unitCells = Array.from(tr.children).filter((td) => td.classList.contains('unit'));
      const timeCell = tr.querySelector('td.time');
      const project = unitCells[0] ? (unitCells[0].getAttribute('title') || unitCells[0].textContent).trim() : '';
      const task = unitCells[1] ? (unitCells[1].getAttribute('title') || unitCells[1].textContent).trim() : '';
      const minutes = timeCell ? parseHHMMToMinutes(timeCell.textContent) : null;
      if (project || task || minutes != null) {
        current.entries.push({ project, task, minutes: minutes || 0 });
      }
    });

    return days;
  }

  function dayIsMismatch(day) {
    const sum = day.sumMinutes == null ? 0 : day.sumMinutes;
    const work = day.workMinutes == null ? 0 : day.workMinutes;
    return sum !== work;
  }

  // Signed shortfall in minutes: >0 means 工数 is short of 総労働時間.
  function dayDeltaMinutes(day) {
    return (day.workMinutes || 0) - (day.sumMinutes || 0);
  }

  // A day you still owe input for: it was actually worked (総労働時間 > 0) but no
  // man-hours were entered. Weekends with no work never qualify.
  function dayIsMissing(day) {
    return (day.workMinutes || 0) > 0 && (day.sumMinutes || 0) === 0;
  }

  // "07/01" + the year from the search form -> the edit page for that day.
  function dayEditUrl(day) {
    const nums = String(day.dateText || '').match(/\d+/g);
    if (!nums || nums.length < 2) return null;
    const form = document.getElementById('search');
    const year = (form && (form.querySelector('[name="year"]') || {}).value) || String(new Date().getFullYear());
    const month = parseInt(nums[nums.length - 2], 10);
    const dayNum = parseInt(nums[nums.length - 1], 10);
    if (!month || !dayNum) return null;
    return `/employee/man-hour-manage/edit-achievement?year=${year}&month=${month}&day=${dayNum}`;
  }

  // --- filtering + highlighting ----------------------------------------------

  const FILTERS = [
    { key: 'all', label: 'すべて', title: '全ての日を表示' },
    { key: 'mismatch', label: '工数不一致', title: '工数実績と総労働時間が一致しない日のみ表示' },
    { key: 'report', label: 'レポート', title: '工数レポートを表示' }
  ];
  let currentFilter = 'all';

  function applyFilter() {
    parseListDays().forEach((day) => {
      const hide = currentFilter === 'mismatch' && !dayIsMismatch(day);
      day.rows.forEach((row) => { row.style.display = hide ? 'none' : ''; });
    });
  }

  function highlightMismatches() {
    parseListDays().forEach((day, index) => {
      const mismatch = dayIsMismatch(day);
      day.rows.forEach((row) => {
        row.classList.toggle('jbe-mismatch-row', mismatch);
        // Tag every row of the day with its group id so hovering any one of them
        // can light the whole day (see bindDayHover).
        row.dataset.jbeDay = String(index);
      });
      const dateCell = day.dateCell;
      if (dateCell) dateCell.classList.toggle('jbe-mismatch-date', mismatch);
      decorateDateCell(day, mismatch);
    });
  }

  // --- day-group hover --------------------------------------------------------
  //
  // A day's date / 合計 / 総労働時間 / 最終更新 cells are rowspan'd onto the day's
  // FIRST <tr>, so the browser's own tr:hover repaints only the single row under
  // the cursor: on a multi-entry day that reads as "one entry is highlighted"
  // rather than "this is the day I'm pointing at". Mirror the hover across every
  // row carrying the same data-jbe-day.
  let hoverBoundList = null;

  function setDayHover(key, on) {
    const list = getList();
    if (!list) return;
    Array.from(list.children).forEach((row) => {
      if (row.dataset && row.dataset.jbeDay === key) row.classList.toggle('jbe-day-hover', on);
    });
  }

  function bindDayHover() {
    const list = getList();
    // The worker refills #list rather than replacing it, so this normally binds
    // once; the identity check only matters if Jobcan ever swaps the tbody.
    if (!list || hoverBoundList === list) return;
    hoverBoundList = list;

    let activeKey = null;
    const clear = () => {
      if (activeKey === null) return;
      setDayHover(activeKey, false);
      activeKey = null;
    };

    list.addEventListener('mouseover', (event) => {
      const node = event.target;
      const row = node && node.closest ? node.closest('tr[data-jbe-day]') : null;
      const key = row && row.parentNode === list ? row.dataset.jbeDay : null;
      if (key === activeKey) return;
      clear();
      if (key != null) {
        activeKey = key;
        setDayHover(key, true);
      }
    });
    list.addEventListener('mouseleave', clear);
  }

  // --- per-day delta + jump-to-editor (feature 4) -----------------------------
  //
  // Jobcan renders the date as bare text, so the only way from "this day is off by
  // 1:30" to fixing it was to read the date, open the editor yourself and re-find
  // the day. Turn the cell into a link to that day's editor and print the signed
  // delta under it. Jobcan's own per-row 調整 button applies the balance once there.
  function decorateDateCell(day, mismatch) {
    const cell = day.dateCell;
    if (!cell) return;

    // Wrap the date text in a link exactly once; keyed on our own class so it is
    // idempotent across the worker's re-renders.
    let link = cell.querySelector('.jbe-day-link');
    if (!link) {
      const url = dayEditUrl(day);
      if (!url) return;
      const text = dateCellText(cell);
      link = document.createElement('a');
      link.className = 'jbe-day-link';
      link.href = url;
      link.textContent = text;
      link.title = `${text} の工数を編集`;
      cell.textContent = '';
      cell.appendChild(link);
    }

    decorateDayShotButton(day, cell);

    let badge = cell.querySelector('.jbe-day-delta');
    if (!mismatch) {
      if (badge) badge.remove();
      return;
    }

    const delta = dayDeltaMinutes(day);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'jbe-day-delta';
      // Above the camera, which decorateDayShotButton has already appended.
      cell.insertBefore(badge, cell.querySelector('.jbe-day-shot'));
    }
    // >0 => 工数 short of actual work (不足); <0 => over-entered (超過).
    badge.classList.toggle('jbe-day-delta--under', delta > 0);
    badge.classList.toggle('jbe-day-delta--over', delta < 0);
    const label = `${delta > 0 ? '−' : '+'}${minutesToHHMM(Math.abs(delta))}`;
    if (badge.textContent !== label) badge.textContent = label;
    badge.title = delta > 0
      ? `工数が ${minutesToHHMM(delta)} 不足しています`
      : `工数が ${minutesToHHMM(-delta)} 超過しています`;
  }

  // --- per-day 工数レポート screenshot ------------------------------------------
  //
  // The list already renders every entry of every day, so the same report the
  // editor's スクリーンショット button produces can be shot straight from here —
  // no round-trip through 工数実績入力. The camera sits in the date cell and is
  // revealed by the day-group hover (CSS keys off .jbe-day-hover).
  const CAMERA_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>'
    + '<circle cx="12" cy="13" r="4"/></svg>';

  function decorateDayShotButton(day, cell) {
    let shot = cell.querySelector('.jbe-day-shot');
    // A day with nothing entered has no report to shoot.
    if (!day.entries.length) {
      if (shot) shot.remove();
      return;
    }
    if (!shot) {
      shot = document.createElement('button');
      shot.type = 'button';
      shot.className = 'jbe-day-shot';
      shot.innerHTML = CAMERA_SVG;
      // The handler re-reads the day at click time: `day` here belongs to one
      // parse pass and goes stale as soon as the worker re-renders the list.
      shot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        captureDayReport(shot.dataset.jbeDate || '');
      });
      cell.appendChild(shot);
    }
    shot.dataset.jbeDate = day.dateText;
    shot.title = `${day.dateText} の工数レポートを作成`;
    shot.setAttribute('aria-label', shot.title);
  }

  function captureDayReport(dateText) {
    const day = parseListDays().find((d) => d.dateText === dateText);
    const entries = day ? day.entries : [];
    if (!entries.length) {
      showNotification('工数が入力されていません。', 2500);
      return;
    }
    const total = entries.reduce((sum, e) => sum + e.minutes, 0);
    if (typeof captureManHourReport !== 'function') {
      showNotification('スクリーンショット機能を読み込めませんでした。');
      return;
    }
    captureManHourReport({
      rows: entries.map((e) => ({
        project: stripCode(e.project),
        task: stripCode(e.task),
        work: minutesToHHMM(e.minutes)
      })),
      totalText: `合計: ${Math.floor(total / 60)}時間${total % 60}分`,
      subtitle: dateText
    });
  }

  // --- month completion header (feature 3) ------------------------------------
  //
  // The list is 31 rows; "which days do I still owe?" was a manual scan. Summarise
  // it once at the top, with a chip per outstanding day that scrolls to its row.
  function buildMonthHeader() {
    const days = parseListDays();
    if (!days.length) return;

    const bar = document.getElementById('jbe-manhour-list-filters');
    if (!bar) return;

    let host = document.getElementById('jbe-mh-monthstat');
    if (!host) {
      host = document.createElement('div');
      host.id = 'jbe-mh-monthstat';
      bar.parentNode.insertBefore(host, bar);
    }

    const worked = days.filter((d) => (d.workMinutes || 0) > 0);
    const missing = days.filter(dayIsMissing);
    const mismatched = days.filter((d) => dayIsMismatch(d) && !dayIsMissing(d));
    const filled = worked.length - missing.length;

    host.textContent = '';

    const summary = document.createElement('div');
    summary.className = 'jbe-mh-monthstat-summary';

    const count = document.createElement('span');
    count.className = 'jbe-mh-monthstat-count';
    count.textContent = `工数入力 ${filled}/${worked.length} 日`;
    summary.appendChild(count);

    const state = document.createElement('span');
    state.className = 'jbe-mh-monthstat-state';
    if (!worked.length) {
      state.textContent = '対象の稼働日がありません';
    } else if (!missing.length && !mismatched.length) {
      state.classList.add('is-done');
      state.textContent = 'すべて入力済み';
    } else {
      const parts = [];
      if (missing.length) parts.push(`${missing.length} 日未入力`);
      if (mismatched.length) parts.push(`${mismatched.length} 日不一致`);
      state.classList.add('is-todo');
      state.textContent = parts.join(' ・ ');
    }
    summary.appendChild(state);

    const track = document.createElement('div');
    track.className = 'jbe-mh-monthstat-track';
    const fill = document.createElement('div');
    fill.className = 'jbe-mh-monthstat-fill';
    fill.style.width = `${worked.length ? Math.round((filled / worked.length) * 100) : 0}%`;
    track.appendChild(fill);

    host.appendChild(summary);
    host.appendChild(track);

    const chipRow = document.createElement('div');
    chipRow.className = 'jbe-mh-monthstat-chips';
    const addChips = (list, cls, titleFor) => {
      list.forEach((day) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `jbe-mh-daychip ${cls}`;
        chip.textContent = day.dateText;
        chip.title = titleFor(day);
        chip.addEventListener('click', () => jumpToDay(day.dateText));
        chipRow.appendChild(chip);
      });
    };
    addChips(missing, 'jbe-mh-daychip--missing', (d) => `${d.dateText}: 工数未入力（総労働時間 ${minutesToHHMM(d.workMinutes || 0)}）`);
    addChips(mismatched, 'jbe-mh-daychip--mismatch', (d) => {
      const delta = dayDeltaMinutes(d);
      return `${d.dateText}: ${minutesToHHMM(Math.abs(delta))} ${delta > 0 ? '不足' : '超過'}`;
    });
    if (chipRow.children.length) host.appendChild(chipRow);
  }

  // Scroll a day's row into view and flash it, so a chip click lands somewhere
  // obvious in a 31-row table.
  function jumpToDay(dateText) {
    const day = parseListDays().find((d) => d.dateText === dateText);
    const row = day && day.rows[0];
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    day.rows.forEach((r) => {
      r.classList.remove('jbe-day-flash');
      // Force a reflow so re-adding the class restarts the animation.
      void r.offsetWidth;
      r.classList.add('jbe-day-flash');
    });
    setTimeout(() => day.rows.forEach((r) => r.classList.remove('jbe-day-flash')), 1800);
  }

  function buildFilterBar() {
    if (document.getElementById('jbe-manhour-list-filters')) return;
    const table = document.querySelector('table.jbc-table');
    if (!table) return;

    const bar = document.createElement('div');
    bar.id = 'jbe-manhour-list-filters';

    FILTERS.forEach((filter) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `jbe-list-filter-btn${filter.key === 'all' ? ' active' : ''}`;
      btn.textContent = filter.label;
      btn.title = filter.title;
      btn.dataset.filter = filter.key;
      btn.addEventListener('click', () => {
        if (filter.key === 'report') { openReport(); return; }
        currentFilter = filter.key;
        bar.querySelectorAll('.jbe-list-filter-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.filter === filter.key);
        });
        applyFilter();
      });
      bar.appendChild(btn);
    });

    // Place the bar directly above the table. The table sits in a CSS-grid
    // container (#dsbd), so insert it *inside* the table's wrapper (a grid cell)
    // rather than as a sibling — otherwise it lands in its own narrow grid cell.
    const wrapper = table.closest('.table-responsive');
    if (wrapper) {
      wrapper.insertBefore(bar, table);
    } else if (table.parentNode) {
      table.parentNode.insertBefore(bar, table);
    }
  }

  // --- dashboard action buttons ------------------------------------------------
  //
  // Jobcan scatters the three dashboard actions down the #dsbd grid: PDFダウンロード
  // gets a full-width row above the charts, CSVダウンロード + its ⚙ options toggle get
  // another one below them — ~600px and two graphs apart. Collect all three into
  // #dsbd-buttons (already `display:flex; justify-content:space-between`, so they
  // land right of the 集計軸 selects) and drop the two emptied grid rows.
  //
  // Two constraints, both read out of Jobcan's own bundle rather than guessed:
  //   * `const $dsbd = $("#dsbd, #dsbd-buttons")` then `$dsbd.on('click', '#pdf'…)`
  //     / `'#csv'` — the downloads are DELEGATED, and #dsbd-buttons is already one
  //     of the two roots, so moving the buttons there keeps them wired. exportPDF
  //     reads `$dsbd.find('.pie'|'.bar')`, which still resolves for the same reason.
  //   * the ⚙ handler is `$(t.currentTarget).next()` — #csv-options must stay the
  //     gear's IMMEDIATE next sibling or the toggle silently stops working
  //     (verified live: reorder it and nothing happens).
  // Hence the order below is load-bearing; #csv-options must come last.
  const DSBD_ACTION_IDS = ['pdf', 'csv', 'show-csv-options', 'csv-options'];

  function groupDashboardButtons() {
    const bar = document.getElementById('dsbd-buttons');
    if (!bar) return;

    // Whichever of the four Jobcan actually rendered — enhance() re-runs on every
    // worker re-render, so bail before touching the DOM once they are all home.
    const present = DSBD_ACTION_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    if (!present.length) return;

    let actions = document.getElementById('jbe-dsbd-actions');
    if (actions && actions.parentNode === bar && present.every((el) => el.parentNode === actions)) return;
    if (!actions) {
      actions = document.createElement('div');
      actions.id = 'jbe-dsbd-actions';
    }
    if (actions.parentNode !== bar) bar.appendChild(actions);

    present.forEach((el) => {
      const wrapper = el.parentNode;
      actions.appendChild(el);
      // An emptied wrapper is still a #dsbd grid item and still eats a row.
      if (wrapper && wrapper.parentNode && wrapper.parentNode.id === 'dsbd'
        && !wrapper.querySelector('button, input, select, a')) {
        wrapper.classList.add('jbe-dsbd-emptied');
      }
    });
  }

  // --- search bar ---------------------------------------------------------------
  //
  // The 表示月度 row is mostly air: a caption that repeats the 年 / 月度 already printed
  // between the selects, two 27px icon buttons next to 38px selects, and a wide empty
  // gap on the right. Tighten it and park the download actions in that gap.
  //
  // The actions ride along inside #dsbd-buttons rather than being moved on their own:
  // Jobcan delegates their clicks from `$("#dsbd, #dsbd-buttons")`, so #dsbd-buttons
  // has to stay their ancestor or the downloads go dead (see groupDashboardButtons).
  function restyleSearchBar() {
    const wrapper = document.querySelector('.search_wrapper');
    if (!wrapper) return;
    // Marker class: this module only runs on the list page, so it keeps the CSS off
    // any other page that happens to render a .search_wrapper.
    wrapper.classList.add('jbe-mh-searchbar');

    const bar = document.getElementById('dsbd-buttons');
    if (bar && bar.parentNode !== wrapper) wrapper.appendChild(bar);
  }

  // --- 集計軸 controls ------------------------------------------------------------
  //
  // Jobcan puts the two 集計軸 selects in a row of their own above the dashboard, far
  // from the charts they drive. Move them to the top of #dsbd, centred over the pie
  // and the bar, and turn 集計軸1 into a tab strip — it picks between two or three
  // named dimensions, which is a segmented control, not a dropdown.
  //
  // #axis1 itself stays in the DOM, hidden: Jobcan reads `$("#axis1").val()` and its
  // dsbd_render step does `$("#axis1").add($("#axis2")).empty()` then re-appends the
  // <option>s on EVERY summary render, so the tabs are rebuilt from the select rather
  // than the other way round. Both selects must also stay inside #dsbd or
  // #dsbd-buttons — that pair is the delegation root for their change handler.
  function axisOptions(select) {
    // Jobcan d-none's the option 集計軸1 has taken, so 集計軸2 cannot duplicate it.
    return Array.from(select.options).filter((option) => !option.classList.contains('d-none'));
  }

  function renderAxisTabs(select, tabs) {
    const options = axisOptions(select);
    // Jobcan's render step empties both selects before re-appending the <option>s;
    // don't wipe the strip if we happen to look during that window.
    if (!options.length) return;
    const signature = options.map((option) => `${option.value}${option.text}`).join('');
    if (tabs.dataset.jbeSig !== signature) {
      tabs.dataset.jbeSig = signature;
      tabs.textContent = '';
      options.forEach((option) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'jbe-axis-tab';
        tab.setAttribute('role', 'tab');
        tab.dataset.value = option.value;
        tab.textContent = option.text;
        tab.addEventListener('click', () => {
          if (select.value === option.value) return;
          select.value = option.value;
          // Jobcan's handler is a jQuery delegated one, i.e. a native listener on
          // #dsbd — a bubbling native change event reaches it.
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        tabs.appendChild(tab);
      });
    }
    Array.from(tabs.children).forEach((tab) => {
      const active = tab.dataset.value === select.value;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  // The 集計軸1 / 集計軸2 captions are bare text nodes inside the <label>s, so CSS
  // cannot hide them on their own. Take them out, and carry the wording over to the
  // controls as aria-label + title so removing the visible text does not also remove
  // the only thing naming them.
  function stripAxisCaption(label, targets) {
    if (!label || label.dataset.jbeCaption) return;
    const nodes = Array.from(label.childNodes).filter((node) => node.nodeType === 3);
    const caption = nodes.map((node) => node.textContent.trim()).filter(Boolean).join(' ');
    if (!caption) return;
    nodes.forEach((node) => node.remove());
    label.dataset.jbeCaption = caption;
    targets.filter(Boolean).forEach((target) => {
      target.setAttribute('aria-label', caption);
      target.title = caption;
    });
  }

  function setupAxisControls() {
    const axis1 = document.getElementById('axis1');
    const axis2 = document.getElementById('axis2');
    const dsbd = document.getElementById('dsbd');
    if (!dsbd || (!axis1 && !axis2)) return;

    const group = (axis1 || axis2).closest('.unload-no-track') || (axis1 || axis2).parentNode;

    let host = document.getElementById('jbe-axis-bar');
    if (!host) {
      host = document.createElement('div');
      host.id = 'jbe-axis-bar';
    }
    if (host.parentNode !== dsbd || dsbd.firstElementChild !== host) {
      dsbd.insertBefore(host, dsbd.firstChild);
    }
    if (group && group.parentNode !== host) host.appendChild(group);

    if (axis1) {
      const label = axis1.closest('label') || axis1.parentNode;
      let tabs = document.getElementById('jbe-axis1-tabs');
      if (!tabs) {
        tabs = document.createElement('div');
        tabs.id = 'jbe-axis1-tabs';
        tabs.setAttribute('role', 'tablist');
      }
      if (tabs.parentNode !== label) label.appendChild(tabs);
      stripAxisCaption(label, [tabs, axis1]);
      renderAxisTabs(axis1, tabs);
    }

    if (axis2) {
      stripAxisCaption(axis2.closest('label'), [axis2]);
      // With only two dimensions defined, 集計軸2 always has exactly one option left —
      // a dropdown that cannot be dropped. Strip the affordance instead.
      axis2.classList.toggle('jbe-axis-static', axisOptions(axis2).length <= 1);
    }

    if (!host.dataset.jbeAxisBound) {
      host.dataset.jbeAxisBound = '1';
      // Jobcan rebuilds both option lists while handling the change; re-read them
      // once its handler has run. enhance() re-syncs again when the list re-renders.
      host.addEventListener('change', () => { setTimeout(setupAxisControls, 0); });
    }

    watchAxisOptions(axis1, axis2);
  }

  // enhance() alone is not enough to keep the tab strip filled. Jobcan's showSummary
  // writes the table rows first (`await setAchievement()` → tableRender) and only then
  // fills the <option>s (`dsbd_render`), so the #list observer that drives enhance()
  // has already fired by the time the options exist — measured: the strip was created,
  // read zero options, and never ran again, leaving an empty 8px pill. Watch the
  // selects themselves so the tabs follow whenever Jobcan repopulates them.
  let axisWatchBound = false;

  function watchAxisOptions(axis1, axis2) {
    if (axisWatchBound) return;
    const targets = [axis1, axis2].filter(Boolean);
    if (!targets.length) return;
    axisWatchBound = true;

    // setupAxisControls never touches the selects' children, so this cannot re-trigger
    // itself. Both selects are emptied and refilled in one synchronous pass, and the
    // observer callback runs after it, so it always sees the finished list.
    const observer = new MutationObserver(() => setupAxisControls());
    targets.forEach((target) => observer.observe(target, { childList: true }));
    if (typeof window.__jbe_registerManagedObserver === 'function') {
      window.__jbe_registerManagedObserver('watch:manHourAxis', observer, () => {
        axisWatchBound = false;
      });
    }
  }

  // --- report ----------------------------------------------------------------

  // `options.hasWorkTime === false` means 総労働時間 is unknown for these days: the
  // man-hour API does not carry it, so a fetched month whose 出勤簿 request failed
  // has entry-side numbers only. Computing 不一致 / 未入力 against a zero would flag
  // every worked day, so those are left out instead — see buildKpis.
  function aggregate(days, options) {
    const hasWorkTime = !options || options.hasWorkTime !== false;
    const agg = {
      hasWorkTime,
      projectTotals: {},
      // Task names are the same dimension across projects (デザイン, その他 …), so
      // one colour per task holds for the whole report and the legend can live
      // once next to the section title.
      taskTotals: {},
      taskByProject: {},
      dayByProject: {},
      // project -> date -> task -> minutes, for the stacked day columns.
      dayTaskByProject: {},
      dayList: [],
      grandMinutes: 0,
      entryCount: 0,
      totalWork: 0,
      mismatchDays: 0,
      activeDays: 0,
      noInputDays: 0,
      unselectedProject: 0,
      unselectedTask: 0,
      dayCount: days.length
    };

    days.forEach((day) => {
      if (day.workMinutes) agg.totalWork += day.workMinutes;
      const mismatch = hasWorkTime && dayIsMismatch(day);
      const missing = hasWorkTime && dayIsMissing(day);
      if (mismatch) agg.mismatchDays += 1;
      const dayEntryMinutes = day.entries.reduce((sum, e) => sum + e.minutes, 0);
      if (dayEntryMinutes > 0) agg.activeDays += 1; else agg.noInputDays += 1;
      // The x-axis carries the days that were worked: those with entries, plus the
      // 未入力 ones — a day you owe input for is exactly what the graph should not
      // silently drop. Weekends with no work stay off the axis.
      if (dayEntryMinutes > 0 || missing) {
        agg.dayList.push({
          key: day.dateText,
          dayNumber: dayNumber(day.dateText),
          weekday: weekdayLabel(day),
          isWeekend: !!day.isWeekend,
          mismatch,
          missing,
          delta: dayDeltaMinutes(day)
        });
      }

      day.entries.forEach((entry) => {
        const project = stripCode(entry.project) || '(プロジェクト未選択)';
        const task = stripCode(entry.task) || '(タスク未選択)';
        agg.projectTotals[project] = (agg.projectTotals[project] || 0) + entry.minutes;
        if (!agg.taskByProject[project]) agg.taskByProject[project] = {};
        agg.taskByProject[project][task] = (agg.taskByProject[project][task] || 0) + entry.minutes;
        agg.taskTotals[task] = (agg.taskTotals[task] || 0) + entry.minutes;
        if (!agg.dayByProject[project]) agg.dayByProject[project] = {};
        agg.dayByProject[project][day.dateText] = (agg.dayByProject[project][day.dateText] || 0) + entry.minutes;
        if (!agg.dayTaskByProject[project]) agg.dayTaskByProject[project] = {};
        const perDay = agg.dayTaskByProject[project];
        if (!perDay[day.dateText]) perDay[day.dateText] = {};
        perDay[day.dateText][task] = (perDay[day.dateText][task] || 0) + entry.minutes;
        agg.grandMinutes += entry.minutes;
        agg.entryCount += 1;
        if (!entry.project || /未選択/.test(entry.project)) agg.unselectedProject += 1;
        if (!entry.task || /未選択/.test(entry.task)) agg.unselectedTask += 1;
      });
    });

    return agg;
  }

  function makeKpi(label, value, detail) {
    const card = document.createElement('div');
    card.className = 'jbe-report-kpi';
    const v = document.createElement('div');
    v.className = 'jbe-report-kpi-value';
    v.textContent = value;
    const l = document.createElement('div');
    l.className = 'jbe-report-kpi-label';
    l.textContent = label;
    card.appendChild(v);
    card.appendChild(l);
    if (detail) {
      const d = document.createElement('div');
      d.className = 'jbe-report-kpi-detail';
      d.textContent = detail;
      card.appendChild(d);
    }
    return card;
  }

  function buildProjectBars(agg) {
    const wrap = document.createElement('div');
    wrap.className = 'jbe-report-bars';
    const projects = Object.keys(agg.projectTotals).sort((a, b) => agg.projectTotals[b] - agg.projectTotals[a]);
    const max = projects.reduce((m, p) => Math.max(m, agg.projectTotals[p]), 1);

    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'jbe-report-empty';
      empty.textContent = '集計できる工数がありません';
      wrap.appendChild(empty);
      return wrap;
    }

    const taskColors = taskColorMap(agg);

    projects.forEach((project) => {
      const dayTaskMap = agg.dayTaskByProject[project] || {};
      const tasks = agg.taskByProject[project] || {};
      const taskNames = Object.keys(tasks).sort((a, b) => tasks[b] - tasks[a]);
      const expandable = !!(agg.dayList.length || taskNames.length);

      // The whole project row is the <summary>: name, total and track all toggle
      // the breakdown, with a caret at the left as the affordance. A row with
      // nothing to show stays a plain <div> so it gets no caret and no pointer.
      const row = document.createElement(expandable ? 'details' : 'div');
      row.className = expandable ? 'jbe-report-bar-row jbe-report-tasks' : 'jbe-report-bar-row';

      const head = document.createElement('div');
      head.className = 'jbe-report-bar-head';
      const name = document.createElement('span');
      name.className = 'jbe-report-bar-name';
      name.textContent = project;
      name.title = project;
      const time = document.createElement('span');
      time.className = 'jbe-report-bar-time';
      const pct = agg.grandMinutes ? Math.round((agg.projectTotals[project] / agg.grandMinutes) * 100) : 0;
      time.textContent = `${minutesToHHMM(agg.projectTotals[project])} (${pct}%)`;
      head.appendChild(name);
      head.appendChild(time);

      const track = document.createElement('div');
      track.className = 'jbe-report-bar-track';
      const fill = document.createElement('div');
      fill.className = 'jbe-report-bar-fill';
      fill.style.width = `${Math.max(2, (agg.projectTotals[project] / max) * 100)}%`;
      // Segment the fill by task in the same colours the detail columns stack in,
      // so the collapsed row already reads as the breakdown it expands into. A
      // single-task project just ends up a solid bar in that task's colour;
      // taskNames is sorted largest-first, matching the stack order below.
      const projectMinutes = agg.projectTotals[project];
      if (projectMinutes > 0) {
        taskNames.forEach((task) => {
          const seg = document.createElement('div');
          seg.className = `jbe-report-bar-seg ${taskColors[task] || 'jbe-task-c1'}`;
          seg.style.width = `${(tasks[task] / projectMinutes) * 100}%`;
          seg.title = `${task}: ${minutesToHHMM(tasks[task])}`;
          fill.appendChild(seg);
        });
      }
      track.appendChild(fill);

      const main = document.createElement('div');
      main.className = 'jbe-report-bar-main';
      main.appendChild(head);
      main.appendChild(track);

      if (!expandable) {
        row.appendChild(main);
        wrap.appendChild(row);
        return;
      }

      const summary = document.createElement('summary');
      summary.className = 'jbe-report-bar-summary';
      const caret = document.createElement('span');
      caret.className = 'jbe-report-bar-caret';
      caret.setAttribute('aria-hidden', 'true');
      summary.appendChild(caret);
      summary.appendChild(main);
      row.appendChild(summary);

      // Detail: the per-day graph. Each column is stacked by task, so the task
      // split is read off the bars themselves instead of a list under them.
      const detail = document.createElement('div');
      detail.className = 'jbe-report-bar-detail';
      if (agg.dayList.length) detail.appendChild(buildDayColumns(dayTaskMap, agg.dayList, taskColors));

      row.appendChild(detail);
      wrap.appendChild(row);
    });

    return wrap;
  }

  // Extract the day-of-month from a list date label ("06/02(火)", "2026/06/02"…)
  // for the compact x-axis labels under each column; the last number is the day.
  function dayNumber(dateText) {
    const nums = String(dateText == null ? '' : dateText).match(/\d+/g);
    return nums && nums.length ? String(parseInt(nums[nums.length - 1], 10)) : String(dateText || '');
  }

  // 曜日 for the x-axis. Jobcan tags the date cell with a weekday class, which is
  // the same signal WEEKEND_CLASSES reads; fall back to a "(火)" in the label for
  // layouts that print it and leave the class off.
  const WEEKDAY_BY_CLASS = { sun: '日', mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土' };

  function weekdayLabel(day) {
    // A day built from the API (another month — see loadApiMonth) has no cell and
    // carries its 曜日 outright, computed from the real date.
    if (day && day.weekday) return day.weekday;
    const cell = day && day.dateCell;
    if (cell) {
      const hit = Object.keys(WEEKDAY_BY_CLASS).find((c) => cell.classList.contains(c));
      if (hit) return WEEKDAY_BY_CLASS[hit];
    }
    const m = /[（(]\s*([日月火水木金土])\s*[）)]/.exec(String((day && day.dateText) || ''));
    return m ? m[1] : '';
  }

  // One colour per task name for the whole report. Task names are a shared
  // dimension (デザイン, その他 …), so the same task keeps its colour in every
  // project's chart and a single legend covers them all. The palette cycles.
  const TASK_COLOR_COUNT = 8;

  function taskColorMap(agg) {
    const map = {};
    Object.keys(agg.taskTotals)
      .sort((a, b) => agg.taskTotals[b] - agg.taskTotals[a])
      .forEach((task, i) => { map[task] = `jbe-task-c${(i % TASK_COLOR_COUNT) + 1}`; });
    return map;
  }

  // Vertical bar graph of one project's man-hours across the month's active days,
  // each column stacked by task. Column heights are normalised to that project's
  // own busiest day; days with no hours for the project keep a faint baseline stub
  // so the timeline reads cleanly.
  function buildDayColumns(dayTaskMap, dayList, taskColors) {
    const chart = document.createElement('div');
    chart.className = 'jbe-report-daybars';
    const dayTotal = (key) => Object.values(dayTaskMap[key] || {}).reduce((s, v) => s + v, 0);
    const max = dayList.reduce((m, d) => Math.max(m, dayTotal(d.key)), 1);

    dayList.forEach((day) => {
      const byTask = dayTaskMap[day.key] || {};
      const taskNames = Object.keys(byTask).sort((a, b) => byTask[b] - byTask[a]);
      const minutes = dayTotal(day.key);
      const col = document.createElement('div');
      col.className = 'jbe-report-daybar-col';
      // 不一致 / 未入力 are properties of the DAY, not of this project, so a day can
      // be flagged while this project's own bar is perfectly normal.
      if (day.missing) col.classList.add('is-missing');
      else if (day.mismatch) col.classList.add('is-mismatch');
      const flagNote = day.missing
        ? ' ・ 未入力'
        : (day.mismatch ? ` ・ 工数不一致 (${day.delta > 0 ? '−' : '+'}${minutesToHHMM(Math.abs(day.delta))})` : '');
      const taskNote = taskNames.map((t) => `\n  ${t}: ${minutesToHHMM(byTask[t])}`).join('');
      col.title = `${day.key}: ${minutesToHHMM(minutes)}${flagNote}${taskNote}`;

      const bar = document.createElement('div');
      bar.className = 'jbe-report-daybar-bar';
      const fill = document.createElement('div');
      fill.className = 'jbe-report-daybar-fill';
      // The value label is positioned above the fill and must not be the fill's
      // last child — that slot is what rounds the top segment.
      const value = document.createElement('span');
      value.className = 'jbe-report-daybar-value';
      if (minutes === 0) value.classList.add('is-zero');
      value.textContent = minutesToHHMM(minutes);
      fill.appendChild(value);
      if (minutes > 0) {
        // Cap at 82% so the value printed above the tallest bar still fits.
        fill.style.height = `${Math.max(6, (minutes / max) * 82)}%`;
        // Stacked segments, largest task at the bottom (the fill stacks upward).
        taskNames.forEach((task) => {
          const seg = document.createElement('div');
          seg.className = `jbe-report-daybar-seg ${taskColors[task] || 'jbe-task-c1'}`;
          seg.style.height = `${(byTask[task] / minutes) * 100}%`;
          seg.title = `${task}: ${minutesToHHMM(byTask[task])}`;
          fill.appendChild(seg);
        });
      } else {
        fill.classList.add('is-empty');
      }
      bar.appendChild(fill);

      const label = document.createElement('div');
      label.className = 'jbe-report-daybar-label';
      const num = document.createElement('span');
      num.className = 'jbe-report-daybar-day';
      num.textContent = day.dayNumber;
      label.appendChild(num);
      if (day.weekday) {
        const dow = document.createElement('span');
        dow.className = 'jbe-report-daybar-dow';
        if (day.isWeekend) dow.classList.add('is-weekend');
        dow.textContent = day.weekday;
        label.appendChild(dow);
      }
      col.appendChild(bar);
      col.appendChild(label);
      chart.appendChild(col);
    });

    return chart;
  }

  // One legend for the whole report, next to the section title: the task colours
  // used by the stacked columns, then the day flags. Both mean the same thing in
  // every project's chart. Null when there is nothing to explain.
  function buildReportLegend(agg, taskColors) {
    const taskNames = Object.keys(agg.taskTotals).sort((a, b) => agg.taskTotals[b] - agg.taskTotals[a]);
    const hasMissing = agg.dayList.some((d) => d.missing);
    const hasMismatch = agg.dayList.some((d) => d.mismatch && !d.missing);
    if (!taskNames.length && !hasMissing && !hasMismatch) return null;

    const legend = document.createElement('span');
    legend.className = 'jbe-report-daybar-legend';
    taskNames.forEach((task) => {
      legend.appendChild(makeLegendItem(taskColors[task] || 'jbe-task-c1', task, minutesToHHMM(agg.taskTotals[task])));
    });
    if (hasMismatch) legend.appendChild(makeLegendItem('is-mismatch', '工数不一致'));
    if (hasMissing) legend.appendChild(makeLegendItem('is-missing', '未入力'));
    return legend;
  }

  function makeLegendItem(variant, text, detail) {
    const item = document.createElement('span');
    item.className = 'jbe-report-daybar-legend-item';
    const swatch = document.createElement('span');
    // The variant class is the colour, and it is the same class the stacked
    // segments carry — so a legend swatch cannot drift from its bars.
    swatch.className = `jbe-report-daybar-swatch ${variant}`;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(text));
    if (detail) {
      const d = document.createElement('span');
      d.className = 'jbe-report-legend-detail';
      d.textContent = detail;
      item.appendChild(d);
    }
    item.title = detail ? `${text}: ${detail}` : text;
    return item;
  }

  // --- project taxonomy: category / client -----------------------------------
  //
  // Project labels are path-like and carry their own taxonomy in front of the
  // client: "アサイン/スマートリングアプリSHAPE/デザイン制作" is direct work for
  // アサイン, "【間接】事業部業務" is overhead with no client at all, and
  // "瑕疵/LDH JAPAN/…" is warranty work for LDH JAPAN. Pulling that apart is what
  // turns a list of long paths into a 直接/間接 ratio and a per-client total.
  //
  // The 【...】 rule is generic — any bracket tag becomes the category — but a bare
  // leading category segment has to be listed, and 瑕疵 is the only one observed on
  // this account. An unlisted one just reads as a client, which is the safe failure.
  const CATEGORY_SEGMENTS = ['瑕疵'];
  const DIRECT_CATEGORY = '直接';
  // Minutes whose project name could not be resolved (推移 only — see loadTrend).
  const UNRESOLVED_CATEGORY = '未分類';

  const CATEGORY_CLASS = {
    '直接': 'jbe-cat-direct',
    '間接': 'jbe-cat-indirect',
    '瑕疵': 'jbe-cat-defect',
    '未分類': 'jbe-cat-unknown'
  };
  // Categories outside the known set cycle the task palette rather than all
  // collapsing onto one colour; the legend names them either way.
  const CATEGORY_FALLBACK = ['jbe-task-c3', 'jbe-task-c5', 'jbe-task-c6', 'jbe-task-c7', 'jbe-task-c8'];

  function splitPath(name) {
    return String(name || '').split('/').map((part) => part.trim()).filter(Boolean);
  }

  function classifyProject(name) {
    const text = String(name || '').trim();
    const bracket = text.match(/^【\s*([^】]+?)\s*】\s*([\s\S]*)$/);
    if (bracket) {
      const rest = bracket[2].trim();
      return { category: bracket[1], client: '', detail: rest || text };
    }
    const parts = splitPath(text);
    if (parts.length && CATEGORY_SEGMENTS.indexOf(parts[0]) !== -1) {
      return { category: parts[0], client: parts[1] || '', detail: parts.slice(2).join(' / ') || parts[1] || text };
    }
    return { category: DIRECT_CATEGORY, client: parts[0] || text, detail: parts.slice(1).join(' / ') || text };
  }

  // ベネッセ and ベネッセコーポレーション are one client spelled two ways, and they
  // must not show up as two rows splitting one client's hours. Strip the legal-form
  // and corporate-suffix tokens and the two collapse to the same key — nothing else
  // is merged, so アサイン and (say) アサインナビ stay apart. Order matters: the
  // longer tokens have to go first or "co." leaves a stray "., ltd.".
  const CORP_TOKENS = [
    'コーポレーション', 'ホールディングス', 'ホールディング', 'カンパニー', 'グループ',
    '株式会社', '有限会社', '合同会社', '（株）', '(株)', '（有）', '(有)',
    'co.,ltd.', 'co., ltd.', 'inc.', 'inc', 'corp.', 'corp', 'co.', 'ltd.', 'ltd', 'llc'
  ];

  function normalizeClient(name) {
    const raw = String(name || '').trim();
    let text = raw.toLowerCase();
    CORP_TOKENS.forEach((token) => { text = text.split(token).join(''); });
    text = text.replace(/[\s・,，.。]/g, '');
    // A client actually named after a legal form would strip to nothing; keep the
    // original rather than merging every such name into one empty key.
    return text || raw.toLowerCase();
  }

  // 直接 leads, 未分類 trails, everything else by size — so the ratio reads the same
  // way in the stacked strip, the legend and the trend columns.
  function sortCategories(totals) {
    return Object.keys(totals).sort((a, b) => {
      if (a === b) return 0;
      if (a === DIRECT_CATEGORY) return -1;
      if (b === DIRECT_CATEGORY) return 1;
      if (a === UNRESOLVED_CATEGORY) return 1;
      if (b === UNRESOLVED_CATEGORY) return -1;
      return totals[b] - totals[a];
    });
  }

  function categoryClassMap(categories) {
    const map = {};
    let fallback = 0;
    categories.forEach((name) => {
      if (CATEGORY_CLASS[name]) {
        map[name] = CATEGORY_CLASS[name];
      } else {
        map[name] = CATEGORY_FALLBACK[fallback % CATEGORY_FALLBACK.length];
        fallback += 1;
      }
    });
    return map;
  }

  // A track whose fill is stacked by category, in the same colours the summary
  // strip and the trend columns use. `total` scales the fill against the biggest
  // row; the segments then split the fill itself.
  function buildCategoryTrack(byCategory, minutes, max, classes) {
    const track = document.createElement('div');
    track.className = 'jbe-report-bar-track';
    const fill = document.createElement('div');
    fill.className = 'jbe-report-bar-fill';
    fill.style.width = `${Math.max(2, (minutes / (max || 1)) * 100)}%`;
    if (minutes > 0) {
      sortCategories(byCategory).forEach((category) => {
        const seg = document.createElement('div');
        seg.className = `jbe-report-bar-seg ${classes[category] || 'jbe-cat-unknown'}`;
        seg.style.width = `${(byCategory[category] / minutes) * 100}%`;
        seg.title = `${category}: ${minutesToHHMM(byCategory[category])}`;
        fill.appendChild(seg);
      });
    }
    track.appendChild(fill);
    return track;
  }

  // --- クライアント別 ---------------------------------------------------------

  function aggregateClients(agg) {
    const groups = {};
    const order = [];
    const categoryTotals = {};
    let total = 0;

    Object.keys(agg.projectTotals).forEach((project) => {
      const minutes = agg.projectTotals[project];
      const info = classifyProject(project);
      categoryTotals[info.category] = (categoryTotals[info.category] || 0) + minutes;
      total += minutes;
      // Overhead has no client of its own, so the category stands in as the group —
      // 【間接】 becomes one row holding every 間接 project.
      const display = info.client || `【${info.category}】`;
      const key = info.client ? `c:${normalizeClient(info.client)}` : `k:${info.category}`;
      if (!groups[key]) {
        groups[key] = { name: display, variants: {}, minutes: 0, byCategory: {}, projects: [] };
        order.push(key);
      }
      const group = groups[key];
      group.minutes += minutes;
      group.variants[display] = (group.variants[display] || 0) + minutes;
      group.byCategory[info.category] = (group.byCategory[info.category] || 0) + minutes;
      group.projects.push({ name: project, detail: info.detail, category: info.category, minutes });
    });

    const list = order.map((key) => groups[key]);
    list.forEach((group) => {
      // The spelling that carries the most hours becomes the label; the merged
      // variants stay visible in the row's tooltip so nothing is silently renamed.
      const variants = Object.keys(group.variants).sort((a, b) => group.variants[b] - group.variants[a]);
      group.name = variants[0];
      group.variants = variants;
      group.projects.sort((a, b) => b.minutes - a.minutes);
    });
    list.sort((a, b) => b.minutes - a.minutes);

    return { groups: list, categoryTotals, categories: sortCategories(categoryTotals), total };
  }

  function buildCategorySummary(data, classes) {
    const wrap = document.createElement('div');
    wrap.className = 'jbe-report-catsummary';

    const bar = document.createElement('div');
    bar.className = 'jbe-report-catbar';
    data.categories.forEach((category) => {
      const seg = document.createElement('div');
      seg.className = `jbe-report-catbar-seg ${classes[category]}`;
      seg.style.width = `${(data.categoryTotals[category] / (data.total || 1)) * 100}%`;
      seg.title = `${category}: ${minutesToHHMM(data.categoryTotals[category])}`;
      bar.appendChild(seg);
    });
    wrap.appendChild(bar);

    const stats = document.createElement('div');
    stats.className = 'jbe-report-catstats';
    data.categories.forEach((category) => {
      const minutes = data.categoryTotals[category];
      const stat = document.createElement('div');
      stat.className = 'jbe-report-catstat';
      const swatch = document.createElement('span');
      swatch.className = `jbe-report-daybar-swatch ${classes[category]}`;
      const name = document.createElement('span');
      name.className = 'jbe-report-catstat-name';
      name.textContent = category;
      const value = document.createElement('span');
      value.className = 'jbe-report-catstat-value';
      value.textContent = minutesToHHMM(minutes);
      const pct = document.createElement('span');
      pct.className = 'jbe-report-catstat-pct';
      pct.textContent = `${data.total ? Math.round((minutes / data.total) * 100) : 0}%`;
      stat.appendChild(swatch);
      stat.appendChild(name);
      stat.appendChild(value);
      stat.appendChild(pct);
      stats.appendChild(stat);
    });
    wrap.appendChild(stats);
    return wrap;
  }

  function buildClientPanel(agg) {
    const wrap = document.createDocumentFragment();
    const data = aggregateClients(agg);

    const title = document.createElement('h4');
    title.className = 'jbe-report-section-title';
    const titleText = document.createElement('span');
    titleText.textContent = 'クライアント別工数';
    title.appendChild(titleText);
    wrap.appendChild(title);

    if (!data.groups.length) {
      const empty = document.createElement('div');
      empty.className = 'jbe-report-empty';
      empty.textContent = '集計できる工数がありません';
      wrap.appendChild(empty);
      return wrap;
    }

    const classes = categoryClassMap(data.categories);
    wrap.appendChild(buildCategorySummary(data, classes));

    const bars = document.createElement('div');
    bars.className = 'jbe-report-bars';
    const max = data.groups.reduce((m, g) => Math.max(m, g.minutes), 1);

    data.groups.forEach((group) => {
      const row = document.createElement('details');
      row.className = 'jbe-report-bar-row jbe-report-tasks';

      const head = document.createElement('div');
      head.className = 'jbe-report-bar-head';
      const name = document.createElement('span');
      name.className = 'jbe-report-bar-name';
      name.textContent = group.name;
      // Merged spellings are named here rather than in the row, so the number and
      // the thing it counts can always be checked against each other.
      name.title = group.variants.length > 1
        ? `${group.name}（表記ゆれをまとめています: ${group.variants.join(' / ')}）`
        : group.name;
      const time = document.createElement('span');
      time.className = 'jbe-report-bar-time';
      const pct = data.total ? Math.round((group.minutes / data.total) * 100) : 0;
      time.textContent = `${minutesToHHMM(group.minutes)} (${pct}%)`;
      head.appendChild(name);
      head.appendChild(time);

      const main = document.createElement('div');
      main.className = 'jbe-report-bar-main';
      main.appendChild(head);
      main.appendChild(buildCategoryTrack(group.byCategory, group.minutes, max, classes));

      const summary = document.createElement('summary');
      summary.className = 'jbe-report-bar-summary';
      const caret = document.createElement('span');
      caret.className = 'jbe-report-bar-caret';
      caret.setAttribute('aria-hidden', 'true');
      summary.appendChild(caret);
      summary.appendChild(main);
      row.appendChild(summary);

      const detail = document.createElement('div');
      detail.className = 'jbe-report-bar-detail jbe-report-sublist';
      const subMax = group.projects.reduce((m, p) => Math.max(m, p.minutes), 1);
      group.projects.forEach((project) => {
        const sub = document.createElement('div');
        sub.className = 'jbe-report-bar-main jbe-report-subrow';
        const subHead = document.createElement('div');
        subHead.className = 'jbe-report-bar-head';
        const subName = document.createElement('span');
        subName.className = 'jbe-report-bar-name';
        subName.textContent = project.detail;
        subName.title = project.name;
        const subTime = document.createElement('span');
        subTime.className = 'jbe-report-bar-time';
        subTime.textContent = minutesToHHMM(project.minutes);
        subHead.appendChild(subName);
        subHead.appendChild(subTime);
        sub.appendChild(subHead);
        const byCategory = {};
        byCategory[project.category] = project.minutes;
        sub.appendChild(buildCategoryTrack(byCategory, project.minutes, subMax, classes));
        detail.appendChild(sub);
      });
      row.appendChild(detail);
      bars.appendChild(row);
    });

    wrap.appendChild(bars);
    return wrap;
  }

  // --- 推移 -------------------------------------------------------------------
  //
  // The list page renders one month at a time through a Web Worker, so previous
  // months cannot be scraped — they come from the REST API (scripts/manHourApi.js).
  // Two facts shape the loading here:
  //
  //   * an achievement entry carries `unit_id` ULIDs, not names, so the category /
  //     client split needs a second call to resolve them. The monthly TOTAL does
  //     not — it is just a sum of `time` — so a failed resolve degrades to a
  //     totals-only chart instead of an error.
  //   * a month with no data (or a failed request) is a normal outcome. Months are
  //     fetched independently and a failed one is drawn as a gap, not thrown.
  const TREND_MONTHS = 6;
  const TREND_CLIENT_ROWS = 8;

  // Survives closing and reopening the report; the modal is rebuilt each time.
  // `attempted` holds unit ids the resolve endpoint has already answered about —
  // see loadTrend for why an unresolved id has to be remembered separately.
  const trendState = { months: new Map(), labels: {}, attempted: new Set() };

  function getAnchorMonth() {
    const form = document.getElementById('search');
    const read = (name) => Number((form && (form.querySelector(`[name="${name}"]`) || {}).value) || NaN);
    const now = new Date();
    const year = read('year');
    const month = read('month');
    return {
      year: year > 2000 ? year : now.getFullYear(),
      month: (month >= 1 && month <= 12) ? month : now.getMonth() + 1
    };
  }

  function monthsEndingAt(anchor, count) {
    const list = [];
    for (let back = count - 1; back >= 0; back -= 1) {
      const d = new Date(anchor.year, anchor.month - 1 - back, 1);
      list.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
      });
    }
    return list;
  }

  // Reopening the report after editing a day must not show the edited month's old
  // total next to the list's new one. Only the anchor month can have changed under
  // us — the others are closed periods — so just that one is dropped.
  function invalidateTrendMonth(anchor) {
    trendState.months.delete(`${anchor.year}-${anchor.month}`);
  }

  function fetchMonthRecords(api, month) {
    const key = `${month.year}-${month.month}`;
    if (!trendState.months.has(key)) {
      // Cache the promise, not the result, so six columns never fire the same
      // request twice — but drop a rejected one so 再試行 can actually retry.
      trendState.months.set(key, api.getMonthAchievements(month.year, month.month).catch((err) => {
        trendState.months.delete(key);
        throw err;
      }));
    }
    return trendState.months.get(key);
  }

  // Which of an entry's items is the project. With the project kind's whole unit
  // map in hand this is simply "the one the map knows", which holds even when the
  // kind lookup came back empty or the items are not in kind order — the two
  // assumptions that left every client reading as 名称不明.
  function projectUnitId(entry, projectKindId, projectLabels, taskLabels) {
    const items = (entry && entry.items) || [];
    if (projectLabels) {
      const known = items.find((item) => item && item.unit_id && projectLabels[item.unit_id]);
      if (known) return known.unit_id;
    }
    if (projectKindId) {
      const hit = items.find((item) => item && String(item.kind_id) === String(projectKindId));
      if (hit && hit.unit_id) return hit.unit_id;
    }
    // A project that has since expired is in no current unit list, so neither rule
    // above can find it. What the TASK dimension owns is definitely not it, which
    // is enough to pick the right item out of a two-item entry.
    if (taskLabels && Object.keys(taskLabels).length) {
      const notTask = items.find((item) => item && item.unit_id && !taskLabels[item.unit_id]);
      if (notTask) return notTask.unit_id;
    }
    return (items[0] && items[0].unit_id) || null;
  }

  async function loadTrend(anchor) {
    const api = window.JBE_ManHourApi;
    if (!api || !api.getMonthAchievements) throw new Error('工数APIが利用できません');

    const months = monthsEndingAt(anchor, TREND_MONTHS);
    const fetched = await Promise.all(months.map((month) => fetchMonthRecords(api, month)
      .then((records) => ({ month, records }))
      .catch(() => ({ month, records: null }))));
    if (fetched.every((entry) => !entry.records)) throw new Error('工数データを取得できませんでした');

    let kinds = {};
    try {
      kinds = await api.resolveKinds(new Date(anchor.year, anchor.month - 1, 1));
    } catch (e) {
      kinds = {};
    }
    const projectKindId = kinds.projectKindId || ((kinds.kinds || [])[0] || {}).id || null;

    // Both dimensions in one map each, usually straight out of the cache
    // manHourEditSearch.js fills on page load (it pre-warms every kind). The project
    // map is what actually puts names on six months of unit ids; the task map is
    // only used to rule items out. The per-id endpoint below mops up the residue.
    let projectLabels = {};
    let taskLabels = {};
    if (api.getKindUnitLabels) {
      const today = new Date();
      const taskKindId = kinds.taskKindId || ((kinds.kinds || [])[1] || {}).id || null;
      const maps = await Promise.all([
        api.getKindUnitLabels(projectKindId, today),
        api.getKindUnitLabels(taskKindId, today)
      ]);
      projectLabels = maps[0];
      taskLabels = maps[1];
    }
    Object.assign(trendState.labels, projectLabels);

    // Flatten once: the chosen unit id per entry is needed both to find what still
    // has no name and to bucket the minutes, and it must be the same id both times.
    const rows = [];
    fetched.forEach(({ month, records }, monthIndex) => {
      (records || []).forEach((day) => (day.manhours || []).forEach((entry) => {
        const minutes = api.secondsToMinutes(entry.time);
        if (!minutes) return;
        rows.push({
          monthIndex,
          month,
          dayKey: day.date || day.id,
          minutes,
          unitId: projectUnitId(entry, projectKindId, projectLabels, taskLabels)
        });
      }));
    });

    const missing = Array.from(new Set(rows.map((row) => row.unitId).filter(Boolean)))
      .filter((id) => !(id in trendState.labels) && !trendState.attempted.has(id));
    if (missing.length && api.getUnitLabels) {
      const resolved = await api.getUnitLabels(missing);
      Object.assign(trendState.labels, resolved);
      // An id the endpoint answered about but does not know will never resolve;
      // remember it, or every reopen re-requests it. A call that resolved nothing
      // at all is an outage rather than an answer — leave those retryable.
      if (Object.keys(resolved).length) missing.forEach((id) => trendState.attempted.add(id));
    }

    const categoryTotals = {};
    const clients = {};
    let unresolved = 0;

    const series = fetched.map(({ month, records }) => ({
      month, failed: !records, minutes: 0, days: 0, dayKeys: new Set(), byCategory: {}, byClient: {}
    }));

    rows.forEach((row) => {
      const bucket = series[row.monthIndex];
      const name = stripCode(trendState.labels[row.unitId] || '');
      // Same taxonomy as クライアント別 — one classifier, so a project cannot land
      // under one client there and another here.
      const info = name ? classifyProject(name) : { category: UNRESOLVED_CATEGORY, client: '' };
      if (!name) unresolved += row.minutes;
      const display = info.client || (name ? `【${info.category}】` : '(名称不明)');
      const key = info.client ? `c:${normalizeClient(info.client)}` : `k:${display}`;

      bucket.dayKeys.add(row.dayKey);
      bucket.minutes += row.minutes;
      bucket.byCategory[info.category] = (bucket.byCategory[info.category] || 0) + row.minutes;
      bucket.byClient[key] = (bucket.byClient[key] || 0) + row.minutes;
      categoryTotals[info.category] = (categoryTotals[info.category] || 0) + row.minutes;
      if (!clients[key]) clients[key] = { key, variants: {}, total: 0 };
      clients[key].total += row.minutes;
      clients[key].variants[display] = (clients[key].variants[display] || 0) + row.minutes;
    });
    series.forEach((bucket) => { bucket.days = bucket.dayKeys.size; delete bucket.dayKeys; });

    const clientRows = Object.keys(clients).map((key) => {
      const client = clients[key];
      const variants = Object.keys(client.variants).sort((a, b) => client.variants[b] - client.variants[a]);
      return { key, name: variants[0], variants, total: client.total };
    }).sort((a, b) => b.total - a.total);

    return {
      series,
      categories: sortCategories(categoryTotals),
      categoryTotals,
      clientRows,
      unresolved,
      failedMonths: series.filter((bucket) => bucket.failed).map((bucket) => bucket.month.label),
      anchorLabel: months[months.length - 1].label
    };
  }

  function buildTrendChart(data, classes) {
    const chart = document.createElement('div');
    chart.className = 'jbe-report-daybars jbe-report-trend-chart';
    const max = data.series.reduce((m, bucket) => Math.max(m, bucket.minutes), 1);

    data.series.forEach((bucket) => {
      const col = document.createElement('div');
      col.className = 'jbe-report-daybar-col';
      if (bucket.month.label === data.anchorLabel) col.classList.add('is-current');
      const direct = bucket.byCategory[DIRECT_CATEGORY] || 0;
      col.title = bucket.failed
        ? `${bucket.month.label}: 取得できませんでした`
        : `${bucket.month.label}: ${minutesToHHMM(bucket.minutes)} / ${bucket.days} 日`
          + sortCategories(bucket.byCategory).map((c) => `\n  ${c}: ${minutesToHHMM(bucket.byCategory[c])}`).join('');

      const bar = document.createElement('div');
      bar.className = 'jbe-report-daybar-bar';
      const fill = document.createElement('div');
      fill.className = 'jbe-report-daybar-fill';
      const value = document.createElement('span');
      value.className = 'jbe-report-daybar-value';
      if (!bucket.minutes) value.classList.add('is-zero');
      value.textContent = bucket.failed ? '—' : minutesToHHMM(bucket.minutes);
      fill.appendChild(value);
      if (bucket.minutes > 0) {
        // Same 82% cap as the day chart: the value printed above the tallest
        // column has to stay inside the plot.
        fill.style.height = `${Math.max(6, (bucket.minutes / max) * 82)}%`;
        sortCategories(bucket.byCategory).forEach((category) => {
          const seg = document.createElement('div');
          seg.className = `jbe-report-daybar-seg ${classes[category] || 'jbe-cat-unknown'}`;
          seg.style.height = `${(bucket.byCategory[category] / bucket.minutes) * 100}%`;
          seg.title = `${category}: ${minutesToHHMM(bucket.byCategory[category])}`;
          fill.appendChild(seg);
        });
      } else {
        fill.classList.add('is-empty');
      }
      bar.appendChild(fill);

      const label = document.createElement('div');
      label.className = 'jbe-report-daybar-label';
      const name = document.createElement('span');
      name.textContent = bucket.month.label;
      label.appendChild(name);
      const sub = document.createElement('span');
      sub.className = 'jbe-report-daybar-dow';
      sub.textContent = bucket.minutes ? `直接 ${Math.round((direct / bucket.minutes) * 100)}%` : '—';
      label.appendChild(sub);

      col.appendChild(bar);
      col.appendChild(label);
      chart.appendChild(col);
    });

    return chart;
  }

  // Clients down the side, months across: the one layout that answers "is this
  // client growing" at a glance. Everything past the top rows is folded into その他
  // so the table stays readable rather than complete.
  function buildTrendMatrix(data) {
    const scroller = document.createElement('div');
    scroller.className = 'jbe-report-matrix-scroll';
    const table = document.createElement('table');
    table.className = 'jbe-report-matrix';

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.textContent = 'クライアント';
    headRow.appendChild(corner);
    data.series.forEach((bucket) => {
      const th = document.createElement('th');
      th.textContent = bucket.month.label.slice(-2);
      th.title = bucket.month.label;
      if (bucket.month.label === data.anchorLabel) th.className = 'is-current';
      headRow.appendChild(th);
    });
    const totalHead = document.createElement('th');
    totalHead.textContent = '合計';
    headRow.appendChild(totalHead);
    head.appendChild(headRow);
    table.appendChild(head);

    const top = data.clientRows.slice(0, TREND_CLIENT_ROWS);
    const rest = data.clientRows.slice(TREND_CLIENT_ROWS);
    const body = document.createElement('tbody');

    const addRow = (name, title, byMonth, total, rowClass) => {
      const tr = document.createElement('tr');
      if (rowClass) tr.className = rowClass;
      const th = document.createElement('th');
      th.textContent = name;
      th.title = title || name;
      tr.appendChild(th);
      data.series.forEach((bucket) => {
        const td = document.createElement('td');
        const minutes = byMonth(bucket);
        td.textContent = minutes ? minutesToHHMM(minutes) : '·';
        if (!minutes) td.className = 'is-zero';
        tr.appendChild(td);
      });
      const totalCell = document.createElement('td');
      totalCell.className = 'is-total';
      totalCell.textContent = minutesToHHMM(total);
      tr.appendChild(totalCell);
      body.appendChild(tr);
    };

    top.forEach((client) => {
      const title = client.variants.length > 1
        ? `${client.name}（表記ゆれをまとめています: ${client.variants.join(' / ')}）`
        : client.name;
      addRow(client.name, title, (bucket) => bucket.byClient[client.key] || 0, client.total);
    });
    if (rest.length) {
      addRow(`その他 ${rest.length} 件`, rest.map((c) => c.name).join(' / '),
        (bucket) => rest.reduce((sum, c) => sum + (bucket.byClient[c.key] || 0), 0),
        rest.reduce((sum, c) => sum + c.total, 0));
    }
    addRow('合計', '合計', (bucket) => bucket.minutes,
      data.series.reduce((sum, bucket) => sum + bucket.minutes, 0), 'is-total');

    table.appendChild(body);
    scroller.appendChild(table);
    return scroller;
  }

  function renderTrend(data, title, host) {
    host.textContent = '';
    const oldLegend = title.querySelector('.jbe-report-daybar-legend');
    if (oldLegend) oldLegend.remove();

    const total = data.series.reduce((sum, bucket) => sum + bucket.minutes, 0);
    if (!total) {
      const empty = document.createElement('div');
      empty.className = 'jbe-report-empty';
      empty.textContent = '直近の工数データがありません';
      host.appendChild(empty);
      return;
    }

    const classes = categoryClassMap(data.categories);
    const legend = document.createElement('span');
    legend.className = 'jbe-report-daybar-legend';
    data.categories.forEach((category) => {
      legend.appendChild(makeLegendItem(classes[category], category, minutesToHHMM(data.categoryTotals[category])));
    });
    title.appendChild(legend);

    host.appendChild(buildTrendChart(data, classes));
    host.appendChild(buildTrendMatrix(data));

    const notes = [];
    if (data.failedMonths.length) notes.push(`取得できなかった月: ${data.failedMonths.join('、')}`);
    // Names come from a second endpoint. When it does not answer the hours are
    // still right and only the split is unknown — say so rather than showing a
    // silently mis-attributed chart.
    if (data.unresolved) notes.push(`プロジェクト名を解決できない工数: ${minutesToHHMM(data.unresolved)}`);
    if (notes.length) {
      const note = document.createElement('div');
      note.className = 'jbe-report-note';
      note.textContent = notes.join(' / ');
      host.appendChild(note);
    }
  }

  function buildTrendPanel(anchor) {
    const frag = document.createDocumentFragment();
    const title = document.createElement('h4');
    title.className = 'jbe-report-section-title';
    const titleText = document.createElement('span');
    titleText.textContent = `推移（直近${TREND_MONTHS}か月）`;
    title.appendChild(titleText);
    const host = document.createElement('div');
    host.className = 'jbe-report-trend';
    frag.appendChild(title);
    frag.appendChild(host);

    // The modal may be closed mid-flight; the nodes are simply detached by then and
    // writing to them is harmless, so there is nothing to cancel.
    const run = () => {
      host.textContent = '';
      const status = document.createElement('div');
      status.className = 'jbe-report-status';
      status.textContent = '読み込み中…';
      host.appendChild(status);
      loadTrend(anchor).then((data) => renderTrend(data, title, host)).catch((err) => {
        host.textContent = '';
        const fail = document.createElement('div');
        fail.className = 'jbe-report-status is-error';
        const message = document.createElement('span');
        message.textContent = (err && err.message) || '読み込みに失敗しました';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'jbe-report-retry';
        retry.textContent = '再試行';
        retry.addEventListener('click', run);
        fail.appendChild(message);
        fail.appendChild(retry);
        host.appendChild(fail);
      });
    };
    run();
    return frag;
  }

  // --- other months ----------------------------------------------------------
  //
  // The list page renders exactly one month, so the report used to be "whatever
  // the page shows". Both halves of what it needs are reachable for any other
  // month without navigating away:
  //
  //   * the entries come from get-achievements-list — the same call the 推移 tab
  //     already makes, through the same per-month promise cache, so stepping back
  //     over months the trend already fetched costs nothing.
  //   * the per-day 総労働時間 is NOT in the man-hour API at all. It comes from one
  //     fetch of the 出勤簿 for that month, read by column HEADER exactly as
  //     attendanceChart.js does (the column set varies by account, so an index
  //     would silently read 休憩時間 as 労働時間).
  //
  // The list's own month keeps being read from the DOM: it is free, it is already
  // rendered, and it is the one month whose numbers must agree with the table
  // right below the modal.

  const ATTENDANCE_URL = 'https://ssl.jobcan.jp/employee/attendance';
  const ATTENDANCE_DATE_COL = '日付';
  const ATTENDANCE_WORK_COL = '労働時間';
  const WEEKDAY_BY_INDEX = ['日', '月', '火', '水', '木', '金', '土'];
  const UNKNOWN_UNIT = '(名称不明)';

  const pad2 = (n) => String(n).padStart(2, '0');
  const monthKey = (month) => `${month.year}-${month.month}`;
  const monthLabelOf = (month) => `${month.year}/${pad2(month.month)}`;
  const monthIndexOf = (month) => month.year * 12 + month.month;
  const sameMonth = (a, b) => !!a && !!b && a.year === b.year && a.month === b.month;

  function shiftMonth(month, delta) {
    const d = new Date(month.year, month.month - 1 + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }

  // Forward limit: the list page's own month, or the real current month when the
  // page is showing an older one. There is nothing to report past that.
  function latestReportMonth() {
    const anchor = getAnchorMonth();
    const now = new Date();
    const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
    return monthIndexOf(anchor) > monthIndexOf(current) ? anchor : current;
  }

  // --- 出勤簿 for one month: the per-day 総労働時間 ------------------------------

  const attendanceCache = new Map();

  // Returns { "MM/DD": minutes } for the requested month, or null when the page
  // holds no table we recognise. Only rows of that month are kept: a 期間検索
  // account can render a range that straddles two months, and a day number alone
  // would let those collide.
  function parseAttendanceWorkTable(doc, month) {
    const tables = Array.from(doc.querySelectorAll('table'));
    for (const table of tables) {
      if (!table.tBodies.length) continue;
      const heads = Array.from(table.querySelectorAll('thead th'))
        .map((th) => String(th.textContent || '').replace(/\s+/g, ''));
      const dateIndex = heads.indexOf(ATTENDANCE_DATE_COL);
      const workIndex = heads.indexOf(ATTENDANCE_WORK_COL);
      if (dateIndex < 0 || workIndex < 0) continue;

      const byDate = {};
      Array.from(table.tBodies[0].rows).forEach((tr) => {
        const dateCell = tr.cells[dateIndex];
        const workCell = tr.cells[workIndex];
        if (!dateCell || !workCell) return;
        // The 日付 cell also carries Jobcan's 打刻修正 / 各種申請 dropdown, so its
        // whole textContent reads "09/01(火)打刻修正休暇申請…" — take the link.
        const link = dateCell.querySelector('a');
        const parts = String((link || dateCell).textContent || '').match(/(\d{1,2})\/(\d{1,2})/);
        if (!parts || Number(parts[1]) !== month.month) return;
        byDate[`${pad2(parts[1])}/${pad2(parts[2])}`] = parseHHMMToMinutes(workCell.textContent) || 0;
      });
      if (Object.keys(byDate).length) return byDate;
    }
    return null;
  }

  function fetchAttendanceMonth(month) {
    const key = monthKey(month);
    if (!attendanceCache.has(key)) {
      const url = `${ATTENDANCE_URL}?list_type=normal&search_type=month&year=${month.year}&month=${month.month}`;
      // Cache the promise so re-visiting a month is one request, and drop a
      // rejected one so 再試行 can actually retry.
      const load = Promise.resolve()
        .then(() => {
          if (typeof fetchJobcanDocument !== 'function') throw new Error('出勤簿を取得できません');
          return fetchJobcanDocument(url);
        })
        .then((doc) => {
          const byDate = parseAttendanceWorkTable(doc, month);
          if (!byDate) throw new Error('出勤簿を読み取れませんでした');
          return byDate;
        })
        .catch((err) => {
          attendanceCache.delete(key);
          throw err;
        });
      attendanceCache.set(key, load);
    }
    return attendanceCache.get(key);
  }

  // --- unit names --------------------------------------------------------------

  let labelMapsPromise = null;

  // Kind ids are stable dimension definitions and the maps are whole-kind, so one
  // resolve serves every month the report can show. Shape matches what
  // projectUnitId() above expects.
  function loadUnitLabelMaps() {
    if (!labelMapsPromise) {
      labelMapsPromise = (async () => {
        const api = window.JBE_ManHourApi;
        if (!api) return { projectKindId: null, projectLabels: {}, taskLabels: {} };
        let kinds = {};
        try {
          kinds = await api.resolveKinds(new Date());
        } catch (e) {
          kinds = {};
        }
        const projectKindId = kinds.projectKindId || ((kinds.kinds || [])[0] || {}).id || null;
        const taskKindId = kinds.taskKindId || ((kinds.kinds || [])[1] || {}).id || null;
        if (!api.getKindUnitLabels) return { projectKindId, projectLabels: {}, taskLabels: {} };
        const today = new Date();
        const maps = await Promise.all([
          api.getKindUnitLabels(projectKindId, today),
          api.getKindUnitLabels(taskKindId, today)
        ]);
        return { projectKindId, projectLabels: maps[0] || {}, taskLabels: maps[1] || {} };
      })().catch((err) => {
        labelMapsPromise = null;
        throw err;
      });
    }
    return labelMapsPromise;
  }

  // --- one month, in the shape parseListDays() hands back ----------------------

  // Measured: get-achievements-list dates are 'YYYY-MM-DD' — attendanceChart.js
  // matches them against the 出勤簿 rows by that exact string.
  function recordDayNumber(record) {
    const m = String((record && record.date) || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? Number(m[3]) : null;
  }

  async function loadApiMonth(month) {
    const api = window.JBE_ManHourApi;
    if (!api || !api.getMonthAchievements) throw new Error('工数APIが利用できません');

    // Only the entries are load-bearing. Names and 出勤簿 each degrade on their own:
    // an unnamed unit reads as (名称不明) and a missing 出勤簿 drops the work-time
    // KPIs, but the hours themselves are right either way.
    const emptyLabels = { projectKindId: null, projectLabels: {}, taskLabels: {} };
    const [records, labels, attendance] = await Promise.all([
      fetchMonthRecords(api, month),
      loadUnitLabelMaps().catch(() => emptyLabels),
      fetchAttendanceMonth(month).catch(() => null)
    ]);

    const { projectLabels, taskLabels } = labels;
    const rows = [];
    (records || []).forEach((record) => {
      const dayNum = recordDayNumber(record);
      if (!dayNum) return;
      (record.manhours || []).forEach((entry) => {
        const minutes = api.secondsToMinutes(entry.time);
        if (!minutes) return;
        const items = (entry && entry.items) || [];
        const projectId = projectUnitId(entry, labels.projectKindId, projectLabels, taskLabels);
        const taskId = (items.find((item) => item && item.unit_id && item.unit_id !== projectId) || {}).unit_id || null;
        rows.push({ dayNum, minutes, projectId, taskId });
      });
    });

    // A project that has since expired is in no current unit list. This is the same
    // residual per-id lookup loadTrend does, sharing its store so an id the
    // endpoint cannot name is asked about once per session, not once per month.
    const known = (id) => !!(id && (projectLabels[id] || taskLabels[id] || trendState.labels[id]));
    const ids = new Set();
    rows.forEach((row) => { ids.add(row.projectId); ids.add(row.taskId); });
    const missing = Array.from(ids).filter((id) => id && !known(id) && !trendState.attempted.has(id));
    if (missing.length && api.getUnitLabels) {
      try {
        const resolved = await api.getUnitLabels(missing);
        Object.assign(trendState.labels, resolved);
        if (Object.keys(resolved).length) missing.forEach((id) => trendState.attempted.add(id));
      } catch (e) { /* names stay unknown; the hours are still right */ }
    }
    const nameOf = (id) => {
      if (!id) return '';
      return projectLabels[id] || taskLabels[id] || trendState.labels[id] || UNKNOWN_UNIT;
    };

    // Every day of the month, so 対象 n 日 counts the same thing the list's own
    // month does. aggregate() puts only worked / 未入力 days on the x-axis.
    const dayCount = new Date(month.year, month.month, 0).getDate();
    const byDate = new Map();
    for (let d = 1; d <= dayCount; d += 1) {
      const date = new Date(month.year, month.month - 1, d);
      const key = `${pad2(month.month)}/${pad2(d)}`;
      byDate.set(key, {
        dateText: key,
        weekday: WEEKDAY_BY_INDEX[date.getDay()],
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        sumMinutes: 0,
        workMinutes: attendance ? (attendance[key] || 0) : null,
        lastUpdate: '',
        rows: [],
        entries: []
      });
    }
    rows.forEach((row) => {
      const day = byDate.get(`${pad2(month.month)}/${pad2(row.dayNum)}`);
      if (!day) return;
      day.entries.push({ project: nameOf(row.projectId), task: nameOf(row.taskId), minutes: row.minutes });
      day.sumMinutes += row.minutes;
    });

    return { days: Array.from(byDate.values()), hasWorkTime: !!attendance };
  }

  // --- report tabs ------------------------------------------------------------

  function buildProjectPanel(agg) {
    const frag = document.createDocumentFragment();
    const barsTitle = document.createElement('h4');
    barsTitle.className = 'jbe-report-section-title';
    const barsTitleText = document.createElement('span');
    barsTitleText.textContent = 'プロジェクト別工数';
    barsTitle.appendChild(barsTitleText);
    // The day-flag colours mean the same thing in every project's 日別内訳, so the
    // legend belongs once next to the section title rather than under each chart.
    const legend = buildReportLegend(agg, taskColorMap(agg));
    if (legend) barsTitle.appendChild(legend);
    frag.appendChild(barsTitle);
    frag.appendChild(buildProjectBars(agg));
    return frag;
  }

  // Panels are built on first activation and then kept: プロジェクト別 alone is
  // already a project x day x task chart per row, and 推移 fetches six months over
  // the network — neither belongs in the cost of opening the modal.
  function buildReportTabs(agg, month) {
    const frag = document.createDocumentFragment();
    const strip = document.createElement('div');
    strip.className = 'jbe-report-tabs';
    strip.setAttribute('role', 'tablist');
    const panels = document.createElement('div');
    panels.className = 'jbe-report-panels';

    const tabs = [
      { id: 'project', label: 'プロジェクト別', build: () => buildProjectPanel(agg) },
      { id: 'client', label: 'クライアント別', build: () => buildClientPanel(agg) },
      { id: 'trend', label: '推移', build: () => buildTrendPanel(month) }
    ];
    const built = {};

    function activate(id, focus) {
      reportState.tab = id;
      tabs.forEach((tab) => {
        const on = tab.id === id;
        tab.button.classList.toggle('is-active', on);
        tab.button.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.button.tabIndex = on ? 0 : -1;
        if (on && !built[tab.id]) {
          const panel = document.createElement('div');
          panel.className = 'jbe-report-panel';
          panel.id = `jbe-report-panel-${tab.id}`;
          panel.setAttribute('role', 'tabpanel');
          panel.setAttribute('aria-labelledby', tab.button.id);
          panel.appendChild(tab.build());
          panels.appendChild(panel);
          built[tab.id] = panel;
        }
        if (built[tab.id]) built[tab.id].hidden = !on;
      });
      if (focus) {
        const active = tabs.find((tab) => tab.id === id);
        if (active) active.button.focus();
      }
    }

    tabs.forEach((tab, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `jbe-report-tab-${tab.id}`;
      button.className = 'jbe-axis-tab jbe-report-tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `jbe-report-panel-${tab.id}`);
      button.textContent = tab.label;
      button.addEventListener('click', () => activate(tab.id));
      // Roving tabindex: the strip is one stop, arrows move between tabs.
      button.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : (e.key === 'ArrowLeft' ? -1 : 0);
        if (step) {
          e.preventDefault();
          activate(tabs[(index + step + tabs.length) % tabs.length].id, true);
        } else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          activate(tabs[e.key === 'Home' ? 0 : tabs.length - 1].id, true);
        }
      });
      tab.button = button;
      strip.appendChild(button);
    });

    frag.appendChild(strip);
    frag.appendChild(panels);
    // Stepping to another month rebuilds the panels; land on the tab the user was
    // reading rather than throwing them back to プロジェクト別.
    activate(tabs.some((tab) => tab.id === reportState.tab) ? reportState.tab : tabs[0].id);
    return frag;
  }

  // --- the modal --------------------------------------------------------------

  // `month` is what the modal is showing, which starts as the list's month and
  // then follows the ‹ › navigator. `tab` survives a month change; `token` voids
  // a fetch whose month is no longer on screen.
  const reportState = { month: null, tab: null, token: 0 };
  const reportRefs = { body: null, label: null, prev: null, next: null, reset: null };

  function buildKpis(agg) {
    const kpis = document.createElement('div');
    kpis.className = 'jbe-report-kpis';
    kpis.appendChild(makeKpi('工数実績', minutesToHHMM(agg.grandMinutes), `${agg.entryCount} 件`));
    if (agg.hasWorkTime) {
      kpis.appendChild(makeKpi('総労働時間', minutesToHHMM(agg.totalWork), `${agg.activeDays} 稼働日`));
      const diff = agg.totalWork - agg.grandMinutes;
      kpis.appendChild(makeKpi('差分', `${diff < 0 ? '+' : ''}${minutesToHHMM(Math.abs(diff))}`, diff > 0 ? '工数不足' : (diff < 0 ? '工数超過' : '一致')));
      kpis.appendChild(makeKpi('工数不一致', `${agg.mismatchDays} 日`, `対象 ${agg.dayCount} 日`));
    } else {
      // 総労働時間 lives on the 出勤簿, not in the man-hour API. Say it is unknown
      // rather than printing a difference measured against nothing.
      kpis.appendChild(makeKpi('総労働時間', '—', '出勤簿を取得できませんでした'));
      kpis.appendChild(makeKpi('稼働日', `${agg.activeDays} 日`, `対象 ${agg.dayCount} 日`));
    }
    if (agg.unselectedProject || agg.unselectedTask) {
      kpis.appendChild(makeKpi('未選択', `${agg.unselectedProject + agg.unselectedTask} 件`, `P:${agg.unselectedProject} / T:${agg.unselectedTask}`));
    }
    return kpis;
  }

  function paintReport(days, options) {
    const host = reportRefs.body;
    if (!host) return;
    const agg = aggregate(days, options);
    host.textContent = '';
    // The KPI row covers the whole month and stays above the tabs; each tab owns
    // its own section title and legend, because the colour dimension changes with it.
    host.appendChild(buildKpis(agg));
    host.appendChild(buildReportTabs(agg, reportState.month));
  }

  function reportStatus(text, onRetry) {
    const host = reportRefs.body;
    if (!host) return;
    host.textContent = '';
    const status = document.createElement('div');
    status.className = onRetry ? 'jbe-report-status is-error' : 'jbe-report-status';
    const message = document.createElement('span');
    message.textContent = text;
    status.appendChild(message);
    if (onRetry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'jbe-report-retry';
      retry.textContent = '再試行';
      retry.addEventListener('click', onRetry);
      status.appendChild(retry);
    }
    host.appendChild(status);
  }

  function updateMonthNav() {
    const month = reportState.month;
    if (!month || !reportRefs.label) return;
    const anchor = getAnchorMonth();
    reportRefs.label.textContent = monthLabelOf(month);
    reportRefs.next.disabled = monthIndexOf(month) >= monthIndexOf(latestReportMonth());
    // The list below the modal still shows the anchor month, so offer one click
    // back to the month whose numbers match it.
    reportRefs.reset.hidden = sameMonth(month, anchor);
    reportRefs.reset.textContent = monthLabelOf(anchor);
  }

  function renderReportMonth() {
    const month = reportState.month;
    if (!month || !reportRefs.body) return;
    updateMonthNav();
    const token = (reportState.token += 1);

    // The list's own month is already rendered in the table — no request, no
    // spinner, and the numbers are guaranteed to agree with it.
    if (sameMonth(month, getAnchorMonth()) && listHasRows()) {
      paintReport(parseListDays(), { hasWorkTime: true });
      return;
    }

    reportStatus(`${monthLabelOf(month)} を読み込み中…`);
    loadApiMonth(month).then((result) => {
      if (token !== reportState.token) return;
      paintReport(result.days, { hasWorkTime: result.hasWorkTime });
    }).catch((err) => {
      if (token !== reportState.token) return;
      reportStatus((err && err.message) || '読み込みに失敗しました', renderReportMonth);
    });
  }

  function showReportMonth(month) {
    reportState.month = month;
    renderReportMonth();
  }

  function buildMonthNav() {
    const nav = document.createElement('div');
    nav.className = 'jbe-report-monthnav';

    const step = (delta, label, glyph) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'jbe-report-monthstep';
      button.setAttribute('aria-label', label);
      button.title = label;
      button.textContent = glyph;
      button.addEventListener('click', () => showReportMonth(shiftMonth(reportState.month, delta)));
      return button;
    };

    const label = document.createElement('span');
    label.className = 'jbe-report-month';
    label.setAttribute('aria-live', 'polite');

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'jbe-report-month-reset';
    reset.title = '一覧の月に戻る';
    reset.addEventListener('click', () => showReportMonth(getAnchorMonth()));

    reportRefs.prev = step(-1, '前の月', '‹');
    reportRefs.next = step(1, '次の月', '›');
    reportRefs.label = label;
    reportRefs.reset = reset;

    nav.appendChild(reportRefs.prev);
    nav.appendChild(label);
    nav.appendChild(reportRefs.next);
    nav.appendChild(reset);
    return nav;
  }

  function openReport() {
    closeReport();
    reportState.month = getAnchorMonth();
    invalidateTrendMonth(reportState.month);

    const overlay = document.createElement('div');
    overlay.id = 'jbe-manhour-report';
    overlay.className = 'jbe-report-overlay';
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeReport(); });

    const modal = document.createElement('div');
    modal.className = 'jbe-report-modal';

    const header = document.createElement('div');
    header.className = 'jbe-report-header';
    const heading = document.createElement('div');
    heading.className = 'jbe-report-heading';
    const title = document.createElement('h3');
    title.textContent = '工数レポート';
    heading.appendChild(title);
    heading.appendChild(buildMonthNav());
    const closeBtn = document.createElement('button');
    closeBtn.className = 'jbe-report-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', closeReport);
    header.appendChild(heading);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'jbe-report-body';
    reportRefs.body = body;

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onReportKeydown);

    renderReportMonth();
  }

  function onReportKeydown(e) {
    if (e.key === 'Escape') closeReport();
  }

  function closeReport() {
    const existing = document.getElementById('jbe-manhour-report');
    if (existing) existing.remove();
    document.removeEventListener('keydown', onReportKeydown);
    // Void whatever month fetch is still in flight: its nodes are gone, and the
    // next open must not be painted by it.
    reportState.token += 1;
    Object.keys(reportRefs).forEach((key) => { reportRefs[key] = null; });
  }

  // --- orchestration: wait for the worker, then enhance ----------------------

  function enhance() {
    buildFilterBar();
    restyleSearchBar();
    groupDashboardButtons();
    setupAxisControls();
    highlightMismatches();
    bindDayHover();
    buildMonthHeader();
    applyFilter();
  }

  function listHasRows() {
    const list = getList();
    return !!(list && list.querySelector('tr'));
  }

  // Open the report when arriving via the floating "工数レポート" action
  // (overlay.js navigates here with ?jbe_open_report=1).
  let reportAutoOpenChecked = false;
  function maybeAutoOpenReport() {
    if (reportAutoOpenChecked) return;
    reportAutoOpenChecked = true;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('jbe_open_report') !== '1') return;
      openReport();
      params.delete('jbe_open_report');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    } catch (_) { /* no-op */ }
  }

  function setupManHourListPage() {
    if (window.__jbe_manHourListPageInited) return;
    window.__jbe_manHourListPageInited = true;

    // The search bar, the download buttons and the 集計軸 selects are all
    // server-rendered and do not wait on the worker, so lay them out now rather than
    // leaving them as-is for the ~40s the list can take. The poll below re-runs this
    // in case Jobcan injects any of it late.
    restyleSearchBar();
    groupDashboardButtons();
    setupAxisControls();

    const start = () => {
      if (!listHasRows()) return false;
      enhance();
      maybeAutoOpenReport();
      // Keep highlights/filters in sync if the worker re-renders the list.
      const list = getList();
      if (list) {
        const observer = new MutationObserver(() => {
          // Avoid reacting to our own style/class toggles.
          enhance();
        });
        observer.observe(list, { childList: true });
        if (typeof window.__jbe_registerManagedObserver === 'function') {
          window.__jbe_registerManagedObserver('manHourList:list', observer);
        }
      }
      return true;
    };

    if (start()) return;

    // The list renders asynchronously (Web Worker, spinner, several seconds).
    //
    // This used to be a bare 400ms poll capped at 30s. Measured on a real account
    // the worker can take ~40s, and when it overruns the cap the page silently
    // ends up with NO extension enhancements at all (verified live: no filter bar,
    // no highlighting). So watch #list directly — the observer fires whenever the
    // worker finally writes rows, however long that takes — and keep a slow poll
    // purely as a backstop in case the rows arrive without a childList mutation.
    const list = getList();
    if (list) {
      const readyObserver = new MutationObserver(() => {
        if (start()) {
          readyObserver.disconnect();
          if (typeof window.__jbe_clearManagedInterval === 'function') {
            window.__jbe_clearManagedInterval('watch:manHourListReady');
          }
        }
      });
      readyObserver.observe(list, { childList: true, subtree: true });
      if (typeof window.__jbe_registerManagedObserver === 'function') {
        window.__jbe_registerManagedObserver('watch:manHourListReady', readyObserver, () => {
          window.__jbe_manHourListPageInited = false;
          hoverBoundList = null;
        });
      }
    }

    if (typeof window.__jbe_startManagedInterval === 'function') {
      window.__jbe_startManagedInterval('watch:manHourListReady', (ctx) => {
        restyleSearchBar();
        groupDashboardButtons();
        setupAxisControls();
        if (start()) ctx.stop();
      }, 1000, { maxRuns: 120 });
    }
  }

  window.setupManHourListPage = setupManHourListPage;
  // Exposed so the floating "工数レポート" action (overlay.js) can open the report
  // directly when already on the list page.
  window.__jbe_openManHourReport = openReport;
})();
