# CLAUDE.md

Chrome extension (Manifest V3) that restyles and extends Jobcan's employee pages.
No bundler, no build step, no tests — `scripts/*.js` run in the browser as-is.

See [README.md](README.md) for the file-by-file map. This file covers the things
that will bite you when changing code.

## Commands

```bash
npm run lint       # must stay at 0 problems
npm run lint:fix
```

There is no test suite and no build. To verify a change you must reload the
extension at `chrome://extensions/` (the ⟳ button) and reload the Jobcan page —
this applies to CSS too. `chrome://` pages cannot be automated, so ask the user
to reload; you cannot do it yourself.

## Architecture constraints

**Content scripts share one global scope.** The manifest concatenates
`scripts/*.js`; a `function foo()` in one file is called by bare name from
another. Two files declaring the same name is a silent, load-order-dependent
bug — it has happened twice in this repo (`showNotification`,
`cleanupClockContainer`). Before adding a top-level function, grep for the name.

**Manifest order is the dependency order.** `utils.js` first, `main.js` near the
end. If A calls B at load time, B's file must come first in `manifest.json`.

**`scripts/manHourEditSearch.js` runs in the MAIN world.** It needs the page's own
jQuery and jQuery-UI autocomplete instances. It therefore *cannot* see
`window.__jbe_*` or any other isolated-world global, and vice versa. Everything
else runs in the ISOLATED world.

**Never replace the man-hour project/task inputs.** Selections made outside
Jobcan's native autocomplete bypass its internal model, get rejected as 未入力,
and will not save. A custom side-panel picker was tried and reverted. Only widen
the native widget's `_search`.

Inspected on the live page, which is why programmatic fill is still unsolved:
the row has **no hidden inputs** (just checkbox + 2 text `.unit` + `.note` +
`.manhour`), `autocomplete('instance').options.select` is **null**, and Jobcan
tracks edits through its own `setupTrackingEvents`/`TRACK_SELECTORS` listening for
`change` and `autocompletechange`. So the chosen unit id lives only in opaque JS
state. The widget is also created **lazily on first real interaction** — it does
not exist on focus, and synthetic events do not create it. Any "copy a previous
day" feature must therefore drive the real widget, and must not be shipped without
a save-test on a throwaway day.

**Jobcan already ships an unsaved-changes guard** on the edit page
(`hasChanges` + `beforeunload`, verified firing). Do not add a second one.

**`applyEnhancements()` in `main.js` re-runs constantly** — a debounced body-wide
MutationObserver calls it roughly once a second while the DOM churns, plus on
every SPA `locationchange`. Anything it calls must be idempotent and guarded by a
`data-*` attribute or a `window.__jbe_*Inited` flag. Unguarded DOM writes here
feed the same observer and cost real CPU.

**Use the resource registry**, never bare `setInterval` / `new MutationObserver`:

```js
window.__jbe_startManagedInterval(key, cb, delayMs, { maxRuns })
window.__jbe_registerManagedObserver(key, observer, onCleanup)
```

Keys prefixed `watch:` are torn down on SPA navigation — pass `onCleanup` to reset
whatever init flag guards their setup, or they will never come back. Keys prefixed
`core:` persist.

**Re-registering a key disconnects the entry it replaces**, so anything registered
under a fixed key more than once must make `disconnect()` teardown *only its own*
resource. A `{ disconnect: stopFoo }` shim that stops "the current one" will tear down
the run it was just registered for — the second registration kills itself, and only
the first ever works (`attachClockBgPointer` in `clock.js` hit exactly this).

**`html2canvas` is not loaded on page load.** It is injected on first use via
`chrome.scripting.executeScript` from `background.js` (which is why the `scripting`
permission is needed). A `<script>` tag would land in the MAIN world and be
invisible to `screenshot.js` — go through `ensureHtml2Canvas()`.

## Lint model

`eslint.config.js` models the shared-global architecture explicitly. Cross-file
functions must be registered in **two** places:

1. `/* exported name */` at the top of the declaring file
2. `crossFileGlobals` in `eslint.config.js`

Miss #1 and lint calls it unused; miss #2 and lint calls the caller undefined.
Either way you find out. Keep lint at zero — the config only earns its keep if
real dead code stands out.

## CSS

Load order: `variables.css` → `base.css` → `styles.css` → `responsive.css` →
`manHourRebuild.css`. Everything is scoped under `html.jobcan-enhanced`,
`.jbe-*`, or `.dark-mode`.

**Do not bulk-remove `!important`.** Jobcan's own stylesheets carry ~1,300
`!important` declarations, overwhelmingly Bootstrap 4 utility classes
(`.d-flex`, `.text-center`, `.bg-white`, `.m-*`, `.p-*`) on exactly the properties
this extension needs to override: `display`, `color`, `background-color`, margin,
padding, flex alignment. Specificity never beats `!important`, so raising
specificity does not let you drop it. Measured: ~89% of the `!important` in `css/`
is load-bearing. Only SVG `fill`/`stroke`, `z-index`, `opacity`, `font-size` and a
few one-offs are genuinely removable, and each needs checking on the live page.

**The clock card's ambient background is one `z-index: -1` layer.**
`ensureClockBackground()` (clock.js) prepends a single `.jbe-clock-bg` to
`.flip-clock-container`; the six variants are all CSS keyed on `[data-variant]`.
Two couplings to know about:

* it colours itself from `--jbe-bg-tint` / `--jbe-bg-strength`, which CSS derives
  from the container's `[data-clock-color-class]` — the attribute
  `updateFlipClockColors()` writes from `#working_status`. Never hardcode a state
  colour in a variant.
* `z-index: -1` only paints above the card background because the card is a
  stacking context. Do not add `overflow: hidden` to the container to clip it —
  that clips the 打刻詳細設定 popover; the layer clips itself.

`screenshot.js` hides the layer in html2canvas's clone (`color-mix()` and
`mask-image` are past what it parses reliably). A new variant needs nothing there.

Dark mode is driven by `body.dark-mode`. Jobcan's Bootstrap/jQuery-UI widgets
(e.g. the autocomplete dropdown's `bg-white`) need `!important` overrides and must
be verified on the real page.

## Jobcan API

Jobcan rebuilt the man-hour pages around June 2026: the editor is a standalone
page, the list renders via a Web Worker, and both are backed by a REST API under
`/employee/man-hour-manage-api`. `scripts/manHourApi.js` documents and wraps the
endpoints. Times in API responses are in **seconds**.

**`get-achievements-kinds-in-period` answers for a *defined period*, not "any data
in range".** A month with no man-hour period yet returns `[]` — measured: 2026-08
returned `[]` while 2026-07 and 2026-06 each returned the 2 kinds, and a
multi-month window also returned `[]`. Anything that resolves kind ids must fall
back to earlier months; both `manHourEditSearch.js` and `manHourApi.resolveKinds`
walk back up to 3. Kind ids are stable dimension definitions, so a previous
month's id works fine for a current-month date.

**Three features call this API at runtime**; everything else reads the rendered
DOM. The report modal's 推移 tab fetches six months, its month navigator (‹ ›)
fetches one whole month whenever it leaves the month the list page is showing,
and the 出勤簿 chart's hover card fetches one for its 工数入力状況 line. Monthly
totals are a plain sum of
`get-achievements-list`'s `time`, so they never depend on names; months are
fetched independently and a failed one is drawn as a gap. Measured from
`/employee/attendance`: `get-achievements-list` answers on the session cookie
alone (that page has no `#token`), `to` is **exclusive** (`from=2026-08-01&
to=2026-09-01` returned August only), and its per-day `time` sums matched the
出勤簿's 労働時間 on all 18 worked days. `jsonFetch` appends `token=` from `#token`
when the page has one, which is what Jobcan's own workers do.

**The man-hour API carries no 総労働時間**, so the report's month navigator gets it
from one `fetch` of `/employee/attendance?list_type=normal&search_type=month&
year=&month=`, read by column HEADER (same rule as `attendanceChart.js`) and
filtered to rows whose MM matches the requested month — a 期間検索 account can
render a range that straddles two months. Re-measured 2026-09-08 for 2026-07 and
2026-08: ~530ms, 31 rows each, and August's per-day `time` sum (10193 min over 86
entries, 18 days) matched the 出勤簿 total exactly. A month whose 出勤簿 fetch
fails still renders — `aggregate(days, { hasWorkTime: false })` drops the
総労働時間 / 差分 / 不一致 KPIs and the day flags instead of computing them against
a zero, which would flag every worked day.

**Naming a `unit_id` goes through the unit list, not through `get-units`.**
An achievement entry carries only ULIDs, and the per-id endpoint did not answer —
every client came out 名称不明. What works is the whole-kind map:
`manHourEditSearch.js` pre-warms the full unit list for *every* kind on each
man-hour page load (the achievement-list page included) and caches it in
localStorage as `jbe_mh_units_v2:<kid>` → `{ t, date, d: { ulid: "(code)name" } }`.
It runs in the MAIN world, but localStorage is per-origin, so
`manHourApi.getKindUnitLabels` reads the map the picker already paid for — free on
a warm cache, ~9 paged requests cold. **Do not change that record shape without
updating both modules, and do not write to that key from the isolated world**: it
is keyed by kind alone with the build date kept only as a revalidation hint, so
seeding it for another date would feed the edit page's picker units that are not
selectable on the day being edited.

Which item of an entry is the project is then decided by *the map that knows it*,
not by kind order — `items` is not reliably project-first and `resolveKinds` can
answer nothing. The task map is loaded only to rule items out, for an expired
project that has left the current list; `get-units` survives as the last-resort
lookup for exactly that residue.

**Attendance/punch data is mostly server-rendered**, so `dataExtraction.js` uses
`fetch` + `DOMParser` (see `fetchJobcanDocument`). Two exceptions, both measured:

* `/employee/adit/get-summary/?year=&month=&day=` returns one day's worked-time
  figures as JSON-wrapped HTML — session cookie only, no CSRF token. Wrapped by
  `scripts/aditApi.js`; the clock card's 本日勤務時間 tile reconciles against it.
  This is *not* the punch list, so it does not replace `loadPunchListData()`.
* The Excel export is a three-step async job, not a single download:
  `POST /employee/attendance/download` → `{processId, downloadId}`, poll
  `/employee/attendance/progress?processId=`, then
  `/employee/attendance/get-file?download_id=`.

**The 出勤簿 table is read by column HEADER, not by index** (`attendanceChart.js`).
The column set varies by account and by `list_type` / 期間検索, and an index
pointing one column over draws 休憩時間 as 労働時間 — a wrong chart that looks
right. Three things measured on the live page and easy to trip on: the 日付 cell
also contains Jobcan's 打刻修正/各種申請 dropdown, so its `textContent` is
`"09/01(火)打刻修正休暇申請…"` and the date must come from the `<a>`; 退勤時刻 reads
`(勤務中)` on a day still in progress; and 勤怠状況 carries `有` for paid leave while
休日区分 carries 公休 / 法休 / 祝日公休.

`docs/jobcan-endpoints.md` has the full map, recovered by reading Jobcan's own
public JS under `/st/` — that is the cheapest way to answer "is there an endpoint
for this" before writing a scraper. Do **not** reintroduce the hidden iframes
this replaced — measured, fetch is ~770ms for the attendance summary and ~230ms
for 打刻一覧, against an iframe's full page load plus fixed multi-second sleeps.

## Security

Login credentials are stored in `chrome.storage.local` (device-only) in plain
text, and `loginInjector.js` auto-submits them. Do not move this to
`storage.sync` — it was there once and would replicate the password to every
signed-in device. Do not add new credential storage; prefer Chrome's password
manager.
