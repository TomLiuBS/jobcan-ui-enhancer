// scripts/manHourApi.js
//
// Client for Jobcan's new man-hour-manage REST API (introduced ~2026-06, served
// from /st/new/js/common/man-hour-manage/). The old man-hour UI scraped the DOM
// and opened a modal per day; the rewritten pages expose a clean JSON API instead,
// which this module wraps. All endpoints are same-origin GETs and rely on the
// user's existing session cookie (credentials: 'include').
//
// Endpoints (base: /employee/man-hour-manage-api):
//   get-achievements-kinds-in-period?from=<unixSec>&to=<unixSec>&params=[]
//       -> { data: [{id, name}], status }   // ordered: [0]=project kind, [1]=task kind
//   get-achievements-list?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N
//       -> { data: [{id, date, tz_offset, note,
//                    manhours: [{ items:[{kind_id, unit_id}, ...], note, time }],
//                    last_updated_at}], next, status }
//       // `time` is in SECONDS (10800 === 3h === "03:00")
//   autocomplete-employee-units?kid=<kindUlid>&date=YYYY-MM-DD&tz_offset=<sec>&selected[]=<kindId>%20<unitId>&term=<q>&limit=N
//       -> { data: { "<unitUlid>": "(code)name", ... }, next, pager, status }
//   get-units?params=["<ulid>", ...]   -> resolves unit ulids to detail records

(function () {
  if (window.JBE_ManHourApi) return;

  const API_BASE = '/employee/man-hour-manage-api';
  // JST offset in seconds; mirrors what the page itself sends. Fall back to the
  // browser's actual offset so the client stays correct outside Japan.
  const TZ_OFFSET = (() => {
    const fromBrowser = -new Date().getTimezoneOffset() * 60;
    return Number.isFinite(fromBrowser) ? fromBrowser : 32400;
  })();

  const pad2 = (n) => String(n).padStart(2, '0');

  // Accepts a Date, a 'YYYY-MM-DD' string, or {year, month, day} (month 1-based).
  const toDate = (value) => {
    if (value instanceof Date) return value;
    if (value && typeof value === 'object' && 'year' in value) {
      return new Date(Number(value.year), Number(value.month) - 1, Number(value.day || 1));
    }
    if (typeof value === 'string') {
      const m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    return new Date(value);
  };

  const toYmd = (value) => {
    const d = toDate(value);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const toUnixSec = (value) => Math.floor(toDate(value).getTime() / 1000);

  // Jobcan's own workers append `token=<#token text>` to every GET on this API
  // (docs/jobcan-endpoints.md). The endpoints wrapped here have been observed to
  // answer on the session cookie alone, but sending the token matches what the
  // page does and costs nothing when it is ignored. Read per call — the list page
  // is an SPA and the node can be replaced under us.
  function pageToken() {
    const el = document.getElementById('token');
    return el ? String(el.textContent || '').trim() : '';
  }

  async function jsonFetch(path) {
    const token = pageToken();
    const url = `${API_BASE}${path}${token ? `${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`man-hour API ${res.status} for ${path.split('?')[0]}`);
    return res.json();
  }

  const encodeParams = (arr) => encodeURIComponent(JSON.stringify(arr || []));

  // ---- Kinds (dimensions) ---------------------------------------------------

  // Returns the ordered kind list for a period: [{id, name}], [0]=project, [1]=task.
  async function getKinds(from, to) {
    const f = toUnixSec(from);
    const t = toUnixSec(to);
    const res = await jsonFetch(`/get-achievements-kinds-in-period?from=${f}&to=${t}&params=%5B%5D`);
    return (res && Array.isArray(res.data)) ? res.data : [];
  }

  // get-achievements-kinds-in-period answers for a DEFINED man-hour period, not
  // "any data in this range": a month with no period yet returns [] (measured —
  // 2026-08 returned [] while 2026-07 and 2026-06 each returned the 2 kinds, and a
  // multi-month window also returned []). Kind ids are stable dimension
  // definitions, so an earlier month's id is valid for a current-month date —
  // walk back until one answers. manHourEditSearch.js does the same for the same
  // reason; without it resolveKinds() silently yields nulls on the 1st of a fresh
  // month, exactly when a timesheet is being filled.
  const KIND_LOOKBACK_MONTHS = 3;

  async function getKindsWithLookback(refDate) {
    const ref = toDate(refDate || new Date());
    for (let back = 0; back <= KIND_LOOKBACK_MONTHS; back += 1) {
      const from = new Date(ref.getFullYear(), ref.getMonth() - back, 1);
      const to = new Date(ref.getFullYear(), ref.getMonth() - back + 1, 1);
      let kinds = [];
      try {
        kinds = await getKinds(from, to);
      } catch (e) {
        kinds = [];
      }
      if (kinds.length) return kinds;
    }
    return [];
  }

  // Resolves and caches the project/task kind ids around a reference date.
  let _kindCache = null;
  async function resolveKinds(refDate) {
    if (_kindCache) return _kindCache;
    const kinds = await getKindsWithLookback(refDate);
    // Order is authoritative (project first, task second); also key by the
    // %project%/%task% name tokens as a fallback.
    const byToken = (token) => kinds.find((k) => String(k.name || '').includes(token));
    const resolved = {
      kinds,
      projectKindId: (byToken('project') || kinds[0] || {}).id || null,
      taskKindId: (byToken('task') || kinds[1] || {}).id || null
    };
    if (resolved.projectKindId && resolved.taskKindId) _kindCache = resolved;
    return resolved;
  }

  // Maps a unit input's `series` attribute (0-based column index) to a kind id.
  async function kindIdForSeries(series, refDate) {
    const { kinds } = await resolveKinds(refDate);
    const idx = Number(series);
    return kinds[idx] ? kinds[idx].id : null;
  }

  // ---- Achievements (the day/entry data) ------------------------------------

  // Returns the raw `data` array of day records for [from, to). A calendar month
  // has <= 31 days, so the default limit of 100 covers a full month with no paging.
  async function getAchievements(from, to, limit = 100) {
    const res = await jsonFetch(`/get-achievements-list?limit=${limit}&from=${toYmd(from)}&to=${toYmd(to)}`);
    return (res && Array.isArray(res.data)) ? res.data : [];
  }

  // Convenience: every man-hour entry for a calendar month (1-based month).
  async function getMonthAchievements(year, month, limit = 100) {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1); // exclusive end = first of next month
    return getAchievements(from, to, limit);
  }

  // ---- Unit autocomplete (project/task pickers) -----------------------------

  // `selected` entries scope the search across dimensions (e.g. pass the chosen
  // project when searching tasks). Each may be {kindId, unitId} or a "kindId unitId" string.
  // `next` is the pagination cursor returned by a previous call. Returns
  // { items: [{ id, label }], next: <cursor|null> }.
  async function fetchUnitsPage({ kid, date, term = '', selected = [], limit = 100, next = null } = {}) {
    if (!kid) return { items: [], next: null };
    let path = `/autocomplete-employee-units?kid=${encodeURIComponent(kid)}` +
      `&date=${toYmd(date || new Date())}&tz_offset=${TZ_OFFSET}` +
      `&term=${encodeURIComponent(term)}&limit=${limit}`;
    (selected || []).forEach((sel) => {
      const pair = (sel && typeof sel === 'object') ? `${sel.kindId} ${sel.unitId}` : String(sel);
      path += `&selected[]=${encodeURIComponent(pair)}`;
    });
    if (next) path += `&next=${encodeURIComponent(next)}`;
    const res = await jsonFetch(path);
    const data = (res && res.data && typeof res.data === 'object') ? res.data : {};
    return {
      items: Object.keys(data).map((id) => ({ id, label: String(data[id]) })),
      next: (res && res.next) ? res.next : null
    };
  }

  // Single-page convenience (back-compat): returns just the items array.
  async function autocompleteUnits(opts) {
    return (await fetchUnitsPage(opts)).items;
  }

  // Fetches EVERY matching unit by following the `next` cursor. Used to load the
  // full project list so the picker can do instant client-side substring search
  // (the server only matches by code/name prefix, so middle words never appear).
  async function getAllUnits({ kid, date, term = '', selected = [], maxPages = 20 } = {}) {
    if (!kid) return [];
    const all = [];
    let next = null;
    let pages = 0;
    do {
      const page = await fetchUnitsPage({ kid, date, term, selected, limit: 100, next });
      all.push(...page.items);
      next = page.next;
      pages += 1;
    } while (next && pages < maxPages);
    return all;
  }

  // ---- Unit detail resolution ----------------------------------------------

  async function getUnits(ulids) {
    const list = Array.isArray(ulids) ? ulids : [ulids];
    if (!list.length) return {};
    const res = await jsonFetch(`/get-units?params=${encodeParams(list)}`);
    return (res && res.data) ? res.data : res;
  }

  // ---- Whole-kind unit maps (the reliable name lookup) ----------------------
  //
  // manHourEditSearch.js pre-warms the FULL unit list for every kind on each
  // man-hour page load — the achievement-list page included — and caches it in
  // localStorage as { t, date, d: { ulid: "(code)name" } }. It runs in the MAIN
  // world, but localStorage is per-origin, so the isolated world reads the map the
  // picker already paid for: on a warm cache this resolves every unit id for free.
  //
  // Cold, we walk the same cursor-paginated endpoint ourselves (~9 requests /
  // ~3s on a real account, measured in manHourEditSearch.js). We deliberately do
  // NOT write the result back: that cache is keyed by kind alone with the date it
  // was built for kept as a revalidation hint, and seeding it from here for a
  // different date would feed the edit page's picker units that are not selectable
  // on the day being edited.
  const UNIT_LIST_CACHE_PREFIX = 'jbe_mh_units_v2:';

  function readSharedUnitCache(kid) {
    let raw;
    try {
      raw = localStorage.getItem(`${UNIT_LIST_CACHE_PREFIX}${kid}`);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    let record;
    try {
      record = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    const map = record && record.d;
    return (map && typeof map === 'object' && Object.keys(map).length) ? map : null;
  }

  const _kindUnitCache = {};

  // Returns { ulid: label } for every unit of one kind. Empty when the kind id is
  // unknown or the endpoint answers nothing — callers fall back, they do not fail.
  async function getKindUnitLabels(kid, date) {
    if (!kid) return {};
    if (_kindUnitCache[kid]) return _kindUnitCache[kid];
    const shared = readSharedUnitCache(kid);
    if (shared) {
      _kindUnitCache[kid] = shared;
      return shared;
    }
    let items = [];
    try {
      items = await getAllUnits({ kid, date: date || new Date() });
    } catch (e) {
      items = [];
    }
    const map = {};
    items.forEach((item) => { if (item && item.id) map[item.id] = item.label; });
    if (Object.keys(map).length) _kindUnitCache[kid] = map;
    return map;
  }

  // getUnits() returns whatever shape the backend feels like — the autocomplete
  // endpoint answers `{ ulid: "(code)name" }`, and the unit endpoints in
  // docs/jobcan-endpoints.md are described only as "resolve ids -> units". So
  // normalise here rather than at each call site: accepts a map of id -> string,
  // a map of id -> record, or an array of records, and always returns a flat
  // `{ ulid: label }`. Kept as the *residual* lookup only: a project that has since
  // expired is no longer in the whole-kind list above, and this is the only way to
  // put a name to it. Ids that do not resolve are simply absent.
  const UNIT_CHUNK = 100;

  function unitLabelOf(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
      const label = value.label || value.name || value.unit_name || value.title || '';
      const code = value.code || value.unit_code || '';
      const text = String(label).trim();
      if (!text) return '';
      return code && !text.startsWith('(') ? `(${code})${text}` : text;
    }
    return String(value).trim();
  }

  async function getUnitLabels(ulids) {
    const list = Array.from(new Set((Array.isArray(ulids) ? ulids : [ulids]).filter(Boolean)));
    const out = {};
    for (let i = 0; i < list.length; i += UNIT_CHUNK) {
      const chunk = list.slice(i, i + UNIT_CHUNK);
      let data;
      try {
        data = await getUnits(chunk);
      } catch (e) {
        continue;
      }
      if (Array.isArray(data)) {
        data.forEach((rec) => {
          const id = rec && (rec.id || rec.unit_id);
          const label = unitLabelOf(rec);
          if (id && label) out[id] = label;
        });
      } else if (data && typeof data === 'object') {
        Object.keys(data).forEach((id) => {
          const label = unitLabelOf(data[id]);
          if (label) out[id] = label;
        });
      }
    }
    return out;
  }

  // ---- Shared helpers exposed for the feature modules -----------------------

  // "(2605AaVz0369-01)瑕疵/..." -> { code: "2605AaVz0369-01", name: "瑕疵/..." }
  function parseUnitLabel(label) {
    const text = String(label || '').trim();
    const m = text.match(/^\(([^)]*)\)\s*([\s\S]*)$/);
    return m ? { code: m[1], name: m[2].trim() } : { code: '', name: text };
  }

  const secondsToHHMM = (seconds) => {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(safe / 60 / 60);
    const m = Math.round((safe - h * 3600) / 60);
    return `${pad2(h)}:${pad2(m)}`;
  };

  const secondsToMinutes = (seconds) => Math.round((Number(seconds) || 0) / 60);

  window.JBE_ManHourApi = {
    TZ_OFFSET,
    toYmd,
    toUnixSec,
    getKinds,
    getKindsWithLookback,
    resolveKinds,
    kindIdForSeries,
    getAchievements,
    getMonthAchievements,
    fetchUnitsPage,
    autocompleteUnits,
    getAllUnits,
    getUnits,
    getKindUnitLabels,
    getUnitLabels,
    parseUnitLabel,
    secondsToHHMM,
    secondsToMinutes,
    _clearKindCache() {
      _kindCache = null;
      Object.keys(_kindUnitCache).forEach((kid) => { delete _kindUnitCache[kid]; });
    }
  };
})();
