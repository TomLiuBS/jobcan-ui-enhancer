// scripts/attendanceChart.js
//
// 出勤簿 (/employee/attendance): a per-day bar chart of 労働時間 above the table.
//
// Everything it draws comes from the table — the page is server-rendered, so the
// chart itself needs no network at all. The one exception is the hover card's
// 工数入力状況 line, which the attendance page cannot know: that is a single
// get-achievements-list call fired after the chart is already on screen, and its
// failure costs one line of a tooltip.
//
// Columns are located by their HEADER TEXT, never by index. The column set is not
// fixed: it differs between accounts and between Jobcan's own list_type / 期間検索
// variants, and an index pointing one column over would silently draw 休憩時間 as
// if it were 労働時間 — a wrong chart that looks perfectly plausible.
//
// The bar is stacked 所定内 / シフト外, which is exactly (労働時間 − シフト外労働
// 時間) and シフト外労働時間. Both are read off the row; nothing is inferred from
// the shift window, which is a schedule rather than a measurement.
//
// Verified against the live page: the 日付 cell also contains Jobcan's 打刻修正 /
// 各種申請 dropdown, so its textContent is "09/01(火)打刻修正休暇申請…" — the date
// has to come from the <a>, not the cell. 退勤時刻 reads "(勤務中)" on a day still
// in progress, and 勤怠状況 carries 有 for a paid-leave day.

(function () {
  'use strict';

  if (window.__jbe_attendanceChartModuleReady) return;
  window.__jbe_attendanceChartModuleReady = true;

  const HOST_ID = 'jbe-att-chart';
  // Same cap as the man-hour day chart: the tallest bar stops at 82% so the value
  // printed above it stays inside the plot.
  const BAR_CAP = 0.82;
  // 定時 = the 8-hour standard day. It also floors the plot's scale (see render):
  // in a month where nothing reached 8h, scaling to the longest day alone would
  // put the 定時 line above the top of the chart.
  const STANDARD_MINUTES = 8 * 60;

  const COLUMNS = {
    date: '日付',
    holiday: '休日区分',
    shift: 'シフト時間',
    start: '出勤時刻',
    end: '退勤時刻',
    work: '労働時間',
    outside: 'シフト外労働時間',
    overtime: '残業時間',
    night: '深夜時間',
    rest: '休憩時間',
    status: '勤怠状況'
  };

  const clean = (text) => String(text == null ? '' : text).replace(/\s+/g, '').trim();

  function parseHHMM(text) {
    const m = clean(text).match(/^(\d{1,3}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }

  function toHHMM(minutes) {
    const v = Math.max(0, Math.round(minutes || 0));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  }

  // --- reading the table ------------------------------------------------------

  // The attendance table is the one whose header carries both 日付 and 労働時間;
  // the page also holds several summary tables with the same jbc-table classes.
  function findAttendanceTable() {
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      if (!table.tBodies.length || !table.tBodies[0].rows.length) continue;
      const heads = Array.from(table.querySelectorAll('thead th')).map((th) => clean(th.textContent));
      if (heads.indexOf(COLUMNS.date) !== -1 && heads.indexOf(COLUMNS.work) !== -1) {
        return { table, heads };
      }
    }
    return null;
  }

  function parseAttendanceRows(table, heads) {
    const index = {};
    Object.keys(COLUMNS).forEach((key) => { index[key] = heads.indexOf(COLUMNS[key]); });
    const cellText = (tr, key) => {
      const cell = index[key] >= 0 ? tr.cells[index[key]] : null;
      return cell ? clean(cell.textContent) : '';
    };

    return Array.from(table.tBodies[0].rows).map((tr) => {
      const dateCell = index.date >= 0 ? tr.cells[index.date] : null;
      const link = dateCell && dateCell.querySelector('a');
      // Jobcan's own 打刻修正 link, taken off the row's dropdown instead of built
      // from a guessed URL — every row carries one (verified live), and reading it
      // means the destination follows Jobcan if they ever move it.
      const menu = dateCell && dateCell.querySelector('.dropdown-menu');
      const modify = menu
        ? Array.from(menu.querySelectorAll('a')).find((a) => /打刻修正/.test(a.textContent))
        : null;
      const raw = clean(((link || dateCell || {}).textContent) || '');
      const parts = raw.match(/(\d{1,2})\/(\d{1,2})(?:[(（]([^)）]*)[)）])?/);
      if (!parts) return null;

      const end = cellText(tr, 'end');
      const work = parseHHMM(cellText(tr, 'work'));
      // Clamp rather than trust: a シフト外 larger than 労働時間 would give the
      // stack a negative 所定内 segment.
      const outside = Math.min(parseHHMM(cellText(tr, 'outside')), work);
      const weekday = parts[3] || '';

      return {
        label: `${parts[1]}/${parts[2]}`,
        month: Number(parts[1]),
        day: Number(parts[2]),
        weekday,
        isWeekend: /[土日]/.test(weekday),
        holiday: cellText(tr, 'holiday'),
        status: cellText(tr, 'status'),
        start: cellText(tr, 'start'),
        end,
        inProgress: /勤務中/.test(end),
        work,
        outside,
        inShift: work - outside,
        modifyUrl: modify ? modify.getAttribute('href') : '',
        overtime: parseHHMM(cellText(tr, 'overtime')),
        night: parseHHMM(cellText(tr, 'night')),
        rest: parseHHMM(cellText(tr, 'rest'))
      };
    }).filter(Boolean);
  }

  // The displayed month, so "today" is only marked when the page is actually
  // showing this month — MM/DD alone would light up the same day in any year.
  function displayedMonth() {
    const form = document.getElementById('search');
    const read = (name) => Number(((form && form.querySelector(`[name="${name}"]`)) || {}).value);
    const year = read('year');
    const month = read('month');
    return (year > 2000 && month >= 1 && month <= 12) ? { year, month } : null;
  }

  function isTodayRow(row, shown) {
    if (!shown) return false;
    const now = new Date();
    return shown.year === now.getFullYear()
      && shown.month === now.getMonth() + 1
      && row.month === now.getMonth() + 1
      && row.day === now.getDate();
  }

  // The same facts the hover card shows, flattened into one line for the column's
  // aria-label — a screen reader gets the day read out on focus.
  function rowSummary(row) {
    const parts = [`${row.label}${row.weekday ? `(${row.weekday})` : ''}`];
    if (row.holiday) parts.push(row.holiday);
    if (row.status) parts.push(row.status);
    if (row.work > 0) {
      parts.push(`労働 ${toHHMM(row.work)}`);
      if (row.outside > 0) parts.push(`所定内 ${toHHMM(row.inShift)} / シフト外 ${toHHMM(row.outside)}`);
      if (row.overtime > 0) parts.push(`残業 ${toHHMM(row.overtime)}`);
      if (row.night > 0) parts.push(`深夜 ${toHHMM(row.night)}`);
      if (row.rest > 0) parts.push(`休憩 ${toHHMM(row.rest)}`);
      if (row.start) parts.push(`${row.start}→${row.end || ''}`);
    } else if (!row.holiday && !row.status) {
      parts.push('記録なし');
    }
    return parts.join(' ・ ');
  }

  // --- 工数入力状況 (the one thing not already on the page) ---------------------
  //
  // The attendance table knows nothing about 工数. One request per view fills that
  // in: get-achievements-list returns a record per day whose `time` values are
  // SECONDS, and the day counts as 入力済み when they sum to that day's 労働時間 —
  // the same rule the man-hour report's 不一致 flag uses.
  //
  // Measured from this page: the endpoint answers on the session cookie alone
  // (/employee/attendance carries no #token), and for 2026-08 all 18 worked days
  // summed to exactly the table's 労働時間. It is an extra, never load-bearing:
  // the fetch is fired after the chart is already drawn, and a failure just leaves
  // the line off the card.
  const manHours = { key: null, byDate: null, pending: false };

  const ymd = (year, month, day) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // The rows are in date order, so a month that goes backwards means a 期間検索
  // rolled over into the next year.
  function rowRange(rows, shown) {
    if (!shown || !rows.length) return null;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const endYear = last.month < first.month ? shown.year + 1 : shown.year;
    // `to` is exclusive — measured: from=2026-08-01&to=2026-09-01 returned August
    // only, and the 1st of September had entries of its own.
    const end = new Date(endYear, last.month - 1, last.day + 1);
    return {
      from: ymd(shown.year, first.month, first.day),
      to: ymd(end.getFullYear(), end.getMonth() + 1, end.getDate()),
      startYear: shown.year,
      endYear
    };
  }

  // null = not loaded (say nothing); a number = loaded, and 0 means 未入力.
  function manHourFor(row) {
    if (!manHours.byDate || !row.isoDate) return null;
    return manHours.byDate[row.isoDate] || 0;
  }

  function loadManHours(range, onReady) {
    const api = window.JBE_ManHourApi;
    if (!api || !api.getAchievements || !range) return;
    const key = `${range.from}~${range.to}`;
    if (manHours.key === key && manHours.byDate) {
      onReady();
      return;
    }
    if (manHours.pending) return;
    manHours.pending = true;
    api.getAchievements(range.from, range.to).then((records) => {
      const byDate = {};
      records.forEach((record) => {
        if (!record || !record.date) return;
        // Sum the seconds and convert once: rounding each entry first can drift a
        // minute away from the total the table shows.
        const seconds = (record.manhours || []).reduce((sum, entry) => sum + (Number(entry.time) || 0), 0);
        byDate[record.date] = (byDate[record.date] || 0) + Math.round(seconds / 60);
      });
      manHours.byDate = byDate;
    }).catch(() => {
      manHours.byDate = null;
    }).then(() => {
      manHours.key = key;
      manHours.pending = false;
      onReady();
    });
  }

  // --- drawing ----------------------------------------------------------------

  // --- hover card -------------------------------------------------------------
  //
  // A native `title` cannot show the split, arrives a second late, and lands
  // wherever the OS decides. This is a small card anchored to the hovered column.
  // It flips to whichever side has room so it never sits on the bar it describes,
  // and it is pointer-events: none so it cannot chase the cursor away.

  function tipRow(label, value, variant) {
    const row = document.createElement('div');
    row.className = 'jbe-att-tip-row';
    if (variant) {
      const swatch = document.createElement('span');
      swatch.className = `jbe-att-tip-swatch ${variant}`;
      row.appendChild(swatch);
    }
    const name = document.createElement('span');
    name.className = 'jbe-att-tip-name';
    name.textContent = label;
    const amount = document.createElement('span');
    amount.className = 'jbe-att-tip-amount';
    amount.textContent = value;
    row.appendChild(name);
    row.appendChild(amount);
    return row;
  }

  // null when the day is settled (or the answer has not arrived yet) — see the
  // call site. Otherwise a banner, not a row: 未入力 and 不一致 are the two things
  // on this card you might have to act on.
  function buildManHourFlag(row) {
    const entered = manHourFor(row);
    if (entered === null || row.work <= 0 || entered === row.work) return null;

    const flag = document.createElement('div');
    flag.className = 'jbe-att-tip-flag';
    const label = document.createElement('span');
    label.className = 'jbe-att-tip-flag-label';
    const amount = document.createElement('span');
    amount.className = 'jbe-att-tip-flag-amount';

    if (entered === 0) {
      flag.classList.add('is-missing');
      label.textContent = '工数 未入力';
      amount.textContent = toHHMM(row.work);
    } else {
      flag.classList.add('is-mismatch');
      // Same sign convention as the man-hour report: + / − is how far 工数 sits
      // from the day's 労働時間.
      const gap = row.work - entered;
      label.textContent = '工数 不一致';
      amount.textContent = `${toHHMM(entered)}（${gap > 0 ? '−' : '+'}${toHHMM(Math.abs(gap))}）`;
    }
    flag.appendChild(label);
    flag.appendChild(amount);
    return flag;
  }

  function fillTipCard(card, row) {
    card.textContent = '';

    const head = document.createElement('div');
    head.className = 'jbe-att-tip-head';
    const date = document.createElement('span');
    date.className = 'jbe-att-tip-date';
    date.textContent = `${row.label}${row.weekday ? `(${row.weekday})` : ''}`;
    head.appendChild(date);
    const badge = row.inProgress ? '勤務中' : (row.status || row.holiday);
    if (badge) {
      const chip = document.createElement('span');
      chip.className = 'jbe-att-tip-badge';
      if (row.inProgress) chip.classList.add('is-active');
      chip.textContent = badge;
      head.appendChild(chip);
    }
    card.appendChild(head);

    if (row.work <= 0) {
      const none = document.createElement('div');
      none.className = 'jbe-att-tip-none';
      none.textContent = (row.holiday || row.status) ? '労働時間なし' : '記録なし';
      card.appendChild(none);
      return;
    }

    const main = document.createElement('div');
    main.className = 'jbe-att-tip-main';
    const big = document.createElement('span');
    big.className = 'jbe-att-tip-big';
    big.textContent = toHHMM(row.work);
    main.appendChild(big);
    // 残業. The table has a 残業時間 column of its own and that wins when it is
    // filled in — it is the employer's figure, computed under rules this extension
    // cannot see. Only when it is blank (as it is on this account, where シフト外
    // carries the load) does the card fall back to the excess over 定時.
    const overtime = row.overtime > 0 ? row.overtime : Math.max(0, row.work - STANDARD_MINUTES);
    const chip = document.createElement('span');
    if (overtime > 0) {
      chip.className = 'jbe-att-tip-delta is-over';
      chip.textContent = `残業 ${toHHMM(overtime)}`;
    } else {
      // A short day says how much is left rather than a negative 残業.
      chip.className = 'jbe-att-tip-delta is-under';
      chip.textContent = `定時まで ${toHHMM(STANDARD_MINUTES - row.work)}`;
    }
    main.appendChild(chip);
    card.appendChild(main);

    // 工数 only speaks up when something is owed. A day that is already entered
    // says nothing: the useful signal is the exception, and a row that reads
    // 入力済み on 18 days out of 18 trains you to stop reading it.
    const flag = buildManHourFlag(row);
    if (flag) card.appendChild(flag);

    const detail = document.createElement('div');
    detail.className = 'jbe-att-tip-rows';
    if (row.outside > 0) {
      detail.appendChild(tipRow('所定内', toHHMM(row.inShift), 'jbe-att-c-inshift'));
      detail.appendChild(tipRow('シフト外', toHHMM(row.outside), 'jbe-att-c-outside'));
    }
    if (row.night > 0) detail.appendChild(tipRow('深夜', toHHMM(row.night)));
    if (row.rest > 0) detail.appendChild(tipRow('休憩', toHHMM(row.rest)));
    if (detail.children.length) card.appendChild(detail);

    const foot = document.createElement('div');
    foot.className = 'jbe-att-tip-foot';
    if (row.start) {
      // 在社 is 労働 + 休憩 by construction, and it checks out against the page:
      // 08/18 reads 09:53→24:01 = 14:08, and 11:16 + 02:52 is the same number.
      foot.appendChild(tipRow(`${row.start} → ${row.end || '—'}`, `在社 ${toHHMM(row.work + row.rest)}`));
    }
    foot.appendChild(tipRow('月累計', toHHMM(row.cumulative)));
    card.appendChild(foot);
  }

  function attachHover(host, plot, bars, labels, rows) {
    const card = document.createElement('div');
    card.className = 'jbe-att-tip';
    card.hidden = true;
    host.appendChild(card);

    let active = -1;
    let roving = Math.max(0, rows.findIndex((row) => row.work > 0));

    const nodeIndex = (target) => {
      const node = target && target.closest ? target.closest('.jbe-att-col, .jbe-att-label') : null;
      return node ? Number(node.dataset.jbeIndex) : -1;
    };

    const markHover = (index, on) => {
      const col = bars.children[index];
      const label = labels.children[index];
      if (col) col.classList.toggle('is-hover', on);
      if (label) label.classList.toggle('is-hover', on);
    };

    function place(index) {
      const col = bars.children[index];
      if (!col) return;
      const hostBox = host.getBoundingClientRect();
      const colBox = col.getBoundingClientRect();
      const plotBox = plot.getBoundingClientRect();
      const width = card.offsetWidth;  // the card is already visible by now
      // Anchored to the column's EDGES, not its centre: measured from the centre,
      // a 12px offset put the card's left edge 2px inside a 33px-wide column, i.e.
      // on top of the bar it was describing.
      const GAP = 12;
      const rightOf = colBox.right - hostBox.left + GAP;
      const leftOf = colBox.left - hostBox.left - width - GAP;
      // Right of the column by default, left when that would overflow.
      let left = rightOf;
      if (left + width > hostBox.width - 6) left = leftOf;
      card.style.left = `${Math.max(6, Math.min(left, hostBox.width - width - 6))}px`;
      card.style.top = `${plotBox.top - hostBox.top}px`;
    }

    function show(index) {
      if (index < 0 || index >= rows.length) return;
      if (index !== active) {
        markHover(active, false);
        active = index;
        fillTipCard(card, rows[index]);
        markHover(index, true);
      }
      card.hidden = false;
      place(index);
    }

    function hide() {
      if (active === -1 && card.hidden) return;
      markHover(active, false);
      active = -1;
      card.hidden = true;
    }

    host.addEventListener('mouseover', (event) => {
      const index = nodeIndex(event.target);
      if (index >= 0) show(index); else hide();
    });
    host.addEventListener('mouseleave', hide);

    // One tab stop for the whole chart, arrows walking the days: 31 separate tab
    // stops would bury the rest of the page behind the graph.
    const setRoving = (index) => {
      roving = index;
      Array.from(bars.children).forEach((col, i) => { col.tabIndex = i === index ? 0 : -1; });
    };
    setRoving(roving);

    bars.addEventListener('focusin', (event) => {
      const index = nodeIndex(event.target);
      if (index >= 0) {
        setRoving(index);
        show(index);
      }
    });
    bars.addEventListener('focusout', hide);
    bars.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : (event.key === 'ArrowLeft' ? -1 : 0);
      let next = -1;
      if (step) next = Math.min(rows.length - 1, Math.max(0, roving + step));
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = rows.length - 1;
      else if (event.key === 'Escape') { hide(); return; }
      else return;
      event.preventDefault();
      setRoving(next);
      const col = bars.children[next];
      if (col) col.focus();
    });

    return {
      // Re-fill whatever card is open, for facts that arrive after the render.
      refresh() {
        if (active < 0) return;
        fillTipCard(card, rows[active]);
        place(active);
      }
    };
  }


  function addSwatchItem(legend, variant, text) {
    const item = document.createElement('span');
    item.className = 'jbe-report-daybar-legend-item';
    const swatch = document.createElement('span');
    swatch.className = `jbe-report-daybar-swatch ${variant}`;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(text));
    legend.appendChild(item);
  }

  function buildStat(label, value, detail) {
    const stat = document.createElement('div');
    stat.className = 'jbe-att-stat';
    const v = document.createElement('span');
    v.className = 'jbe-att-stat-value';
    v.textContent = value;
    const l = document.createElement('span');
    l.className = 'jbe-att-stat-label';
    l.textContent = label;
    stat.appendChild(l);
    stat.appendChild(v);
    if (detail) {
      const d = document.createElement('span');
      d.className = 'jbe-att-stat-detail';
      d.textContent = detail;
      stat.appendChild(d);
    }
    return stat;
  }

  // A horizontal reference line in the plot's own coordinate space — the same
  // percentage-of-scale the fills use, so the line cannot drift away from the bars
  // it describes. 平均 is a figure in the stats row, not a line: two neutral rules
  // a centimetre apart read as a grid rather than as two different facts.
  function buildReferenceLine(variant, minutes, scale) {
    const line = document.createElement('div');
    line.className = `jbe-att-ref ${variant}`;
    line.style.bottom = `${(minutes / scale) * BAR_CAP * 100}%`;
    return line;
  }

  function addSegment(fill, variant, fraction) {
    if (!(fraction > 0)) return;
    const seg = document.createElement('div');
    seg.className = `jbe-report-daybar-seg ${variant}`;
    seg.style.height = `${fraction * 100}%`;
    fill.appendChild(seg);
  }

  function render(host, rows, worked) {
    const shown = displayedMonth();
    const busiest = worked.reduce((m, row) => Math.max(m, row.work), 1);
    // The scale never drops below 定時, so the 8h line always has somewhere to sit;
    // a month of short days then reads as short against it rather than being
    // re-normalised to look full.
    const scale = Math.max(busiest, STANDARD_MINUTES);
    const total = worked.reduce((sum, row) => sum + row.work, 0);
    const average = total / worked.length;
    const longest = worked.reduce((best, row) => (row.work > best.work ? row : best), worked[0]);
    const outsideTotal = worked.reduce((sum, row) => sum + row.outside, 0);
    // Month-to-date at each day, for the card's 月累計 line.
    let running = 0;
    rows.forEach((row) => { running += row.work; row.cumulative = running; });

    const range = rowRange(rows, shown);
    if (range) {
      rows.forEach((row) => {
        const year = row.month < rows[0].month ? range.endYear : range.startYear;
        row.isoDate = ymd(year, row.month, row.day);
      });
    }

    const head = document.createElement('div');
    head.className = 'jbe-att-head';
    const title = document.createElement('span');
    title.className = 'jbe-att-title';
    title.textContent = '労働時間の推移';
    head.appendChild(title);

    const stats = document.createElement('div');
    stats.className = 'jbe-att-stats';
    stats.appendChild(buildStat('合計', toHHMM(total), `${worked.length} 日`));
    stats.appendChild(buildStat('平均', toHHMM(average)));
    stats.appendChild(buildStat('最長', toHHMM(longest.work), longest.label));
    head.appendChild(stats);

    const legend = document.createElement('span');
    legend.className = 'jbe-report-daybar-legend';
    addSwatchItem(legend, 'jbe-att-c-inshift', '所定内');
    if (outsideTotal > 0) addSwatchItem(legend, 'jbe-att-c-outside', 'シフト外');
    if (rows.some((row) => row.status && row.work === 0)) addSwatchItem(legend, 'is-leave', '休暇');
    // The line carries no text of its own: a label pinned to either end of the plot
    // lands on top of whatever bar happens to be there, so the legend names it.
    addSwatchItem(legend, 'is-standard', `定時 ${toHHMM(STANDARD_MINUTES)}`);
    head.appendChild(legend);
    host.appendChild(head);

    const plot = document.createElement('div');
    plot.className = 'jbe-att-plot';

    plot.appendChild(buildReferenceLine('is-standard', STANDARD_MINUTES, scale));

    const bars = document.createElement('div');
    bars.className = 'jbe-att-bars';
    const labels = document.createElement('div');
    labels.className = 'jbe-att-labels';

    rows.forEach((row, index) => {
      const today = isTodayRow(row, shown);

      // A day with a 打刻修正 link IS that link: a real anchor, so it is focusable,
      // Enter-activatable and announced as a link without any of that being
      // re-implemented on a div.
      const col = document.createElement(row.modifyUrl ? 'a' : 'div');
      col.className = 'jbe-att-col';
      col.dataset.jbeIndex = String(index);
      if (row.modifyUrl) col.href = row.modifyUrl;
      if (row.holiday || row.isWeekend) col.classList.add('is-off');
      // A 休暇 day is a day accounted for, not a gap — it gets the same hollow
      // dotted marker the man-hour report uses for a flagged day with no bar.
      if (row.status && row.work === 0) col.classList.add('is-leave');
      if (today) col.classList.add('is-today');
      // No `title`: the hover card carries the detail, and the two would stack.
      if (!row.modifyUrl) col.setAttribute('role', 'img');
      col.setAttribute('aria-label', row.modifyUrl
        ? `${rowSummary(row)} ・ 打刻修正`
        : rowSummary(row));

      const fill = document.createElement('div');
      fill.className = 'jbe-att-fill';
      if (row.work > 0) {
        fill.style.height = `${Math.max(3, (row.work / scale) * BAR_CAP * 100)}%`;
        const value = document.createElement('span');
        value.className = 'jbe-att-value';
        value.textContent = toHHMM(row.work);
        fill.appendChild(value);
        // column-reverse: 所定内 stacks at the bottom, シフト外 above it.
        addSegment(fill, 'jbe-att-c-inshift', row.inShift / row.work);
        addSegment(fill, 'jbe-att-c-outside', row.outside / row.work);
      } else {
        fill.classList.add('is-empty');
      }
      col.appendChild(fill);
      bars.appendChild(col);

      const label = document.createElement(row.modifyUrl ? 'a' : 'div');
      label.className = 'jbe-att-label';
      label.dataset.jbeIndex = String(index);
      // A duplicate of the bar's link: out of the tab order and out of the
      // accessibility tree, so it is a click target and nothing more.
      label.setAttribute('aria-hidden', 'true');
      if (row.modifyUrl) {
        label.href = row.modifyUrl;
        label.tabIndex = -1;
      }
      if (row.holiday || row.isWeekend) label.classList.add('is-off');
      if (today) label.classList.add('is-today');
      const dayNum = document.createElement('span');
      dayNum.className = 'jbe-att-label-day';
      dayNum.textContent = String(row.day);
      label.appendChild(dayNum);
      if (row.weekday) {
        const dow = document.createElement('span');
        dow.className = 'jbe-att-label-dow';
        if (row.isWeekend) dow.classList.add('is-weekend');
        dow.textContent = row.weekday;
        label.appendChild(dow);
      }
      labels.appendChild(label);
    });

    plot.appendChild(bars);
    host.appendChild(plot);
    host.appendChild(labels);
    const hover = attachHover(host, plot, bars, labels, rows);
    // Fired after the chart is already on screen; the card picks the answer up
    // whenever it arrives.
    if (range) loadManHours(range, hover.refresh);
  }

  // Whether a per-bar value still fits is a question about the COLUMN width, which
  // depends on the container rather than the viewport — the table sits inside a
  // card inside a sidebar layout, so a media query on the window answers the wrong
  // question. Thresholds are measured, not guessed: a value label renders at most
  // 22.4px wide ("10:19" at 9px) and a 曜日 at 9px, both plus the 2px column gap.
  // The rect read costs one measurement per call, and the class is only written
  // when it changes, so a re-render is never fed back to the observer that
  // triggered this.
  const VALUE_MIN_COLUMN = 25;
  const DOW_MIN_COLUMN = 12;

  function applyDensity(host, columns) {
    const bars = host.querySelector('.jbe-att-bars');
    if (!bars || !columns) return;
    const width = bars.getBoundingClientRect().width;
    if (!width) return;
    const perColumn = width / columns;
    const set = (cls, on) => {
      if (host.classList.contains(cls) !== on) host.classList.toggle(cls, on);
    };
    set('is-dense', perColumn < VALUE_MIN_COLUMN);
    set('is-tight', perColumn < DOW_MIN_COLUMN);
  }

  // --- entry point ------------------------------------------------------------

  function removeChart() {
    const existing = document.getElementById(HOST_ID);
    if (existing) existing.remove();
  }

  function setupAttendanceChart() {
    const found = findAttendanceTable();
    if (!found) {
      removeChart();
      return;
    }

    const rows = parseAttendanceRows(found.table, found.heads);
    const worked = rows.filter((row) => row.work > 0);
    // A month with nothing recorded yet gets no chart rather than an empty frame.
    if (!worked.length) {
      removeChart();
      return;
    }

    // applyEnhancements() re-runs about once a second while the DOM churns, and
    // this module is called from it. Redrawing 31 columns each time would feed the
    // very observer that triggered it, so the render is keyed on the table's own
    // content and skipped when nothing moved.
    const signature = rows
      .map((row) => [row.label, row.work, row.outside, row.holiday, row.status, row.end].join(','))
      .join(';');

    let host = document.getElementById(HOST_ID);
    if (host && host.dataset.jbeSig === signature && host.isConnected) {
      // The data has not moved, but the window may have — density is re-checked
      // on every call, the render is not.
      applyDensity(host, rows.length);
      return;
    }

    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.className = 'jbe-att-chart';
    }
    const anchor = found.table.closest('.table-responsive') || found.table;
    if (host.parentNode !== anchor.parentNode || host.nextElementSibling !== anchor) {
      anchor.parentNode.insertBefore(host, anchor);
    }

    host.dataset.jbeSig = signature;
    host.textContent = '';
    render(host, rows, worked);
    applyDensity(host, rows.length);
  }

  window.setupAttendanceChart = setupAttendanceChart;
})();
