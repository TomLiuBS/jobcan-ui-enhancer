// ESLint flat config (ESLint 9+).  Setup:  npm install   then:  npm run lint
//
// This extension has no bundler and no modules: the manifest concatenates
// scripts/*.js into one shared global scope, so a `function foo()` declared in one
// file is called by name from another. Previously that made `no-undef` and
// `no-unused-vars` unusable — every cross-file entry point looked "unused" and
// every cross-file call looked undefined — so `no-undef` was off and the 20
// resulting unused-var warnings were all false positives. Lint could not tell you
// anything about dead code, which is the one thing this codebase most needs.
//
// It is now modelled properly, in two halves:
//
//   1. Each script declares its cross-file entry points with an `/* exported … */`
//      directive at the top of the file. Anything NOT listed there and not used
//      within its own file is genuinely dead, and `no-unused-vars` says so.
//   2. Those same entry points are enumerated in `crossFileGlobals` below, so
//      `no-undef` can be ON to catch typo'd identifiers.
//
// When you add a new cross-file function, add it to BOTH places. If you forget the
// `/* exported */` half, lint tells you it is unused; if you forget the globals
// half, lint tells you the caller is undefined. Either way you find out.

const js = require('@eslint/js');

// Functions deliberately shared across content scripts via the global scope.
// Grouped by the file that declares them.
const crossFileGlobals = {
  // scripts/utils.js
  showNotification: 'readonly',
  // scripts/main.js
  applyEnhancements: 'readonly',
  // scripts/ui.js
  setupCleanupObserver: 'readonly',
  initDarkMode: 'readonly',
  setupHeaderVisibility: 'readonly',
  enhanceManagerNameDisplay: 'readonly',
  enhanceUserDisplay: 'readonly',
  setupMenuOrderDropdown: 'readonly',
  fixSettingsIcon: 'readonly',
  foldSignInRightContainer: 'readonly',
  removeLogoBorder: 'readonly',
  autoCollapseExternalPanelMisc: 'readonly',
  // scripts/clock.js
  setupFlipClock: 'readonly',
  cleanupClockContainer: 'readonly',
  applyClockSettings: 'readonly',
  updateClockSettings: 'readonly',
  // scripts/punchCard.js
  setupPunchCard: 'readonly',
  syncPunchStatusBadge: 'readonly',
  // scripts/screenshot.js
  registerFloatingAction: 'readonly',
  closeFloatingActionMenu: 'readonly',
  setupScreenshotButton: 'readonly',
  initScreenshotCapture: 'readonly',
  captureManHourDayReport: 'readonly',
  captureManHourReport: 'readonly',
  // scripts/dataExtraction.js
  extractAndStoreCollapseInfoData: 'readonly',
  fetchJobcanDocument: 'readonly',
  loadAttendanceData: 'readonly',
  loadPunchListData: 'readonly',
  setupCollapseInfoObserver: 'readonly',
  // scripts/overlay.js
  showWorkTimeOverlay: 'readonly',
  setupFloatingWorkTimeButton: 'readonly',
  // scripts/draggable.js
  setupTabsContainerDragObserver: 'readonly',
  // scripts/formEnhancer.js
  enhanceCollapseInfo: 'readonly',
  // IIFE modules that publish only through `window.<name>` but are called by
  // bare identifier from main.js.
  setupManHourEditPage: 'readonly',
  setupManHourListPage: 'readonly',
  setupRequestStatusBadges: 'readonly',
  // scripts/attendanceChart.js
  setupAttendanceChart: 'readonly',
  setupRequestListEmptyState: 'readonly',
  setupRequestHeaderActions: 'readonly',
  JBE_ManHourApi: 'readonly'
};

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'writable',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  Node: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Blob: 'readonly',
  ClipboardItem: 'readonly',
  FileReader: 'readonly',
  Image: 'readonly',
  getComputedStyle: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  performance: 'readonly',
  DOMParser: 'readonly',
  AbortController: 'readonly'
};

const vendorGlobals = {
  // Loaded before our scripts (confetti via the manifest, html2canvas injected
  // on demand by background.js).
  html2canvas: 'readonly',
  confetti: 'readonly',
  // Page-world libraries, reachable only from scripts/manHourEditSearch.js.
  jQuery: 'readonly',
  $: 'readonly'
};

const sharedRules = {
  // Now meaningful: `/* exported */` marks the real entry points, so anything
  // else that goes unused is dead code rather than a false positive.
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  // This codebase legitimately uses full-width spaces (U+3000) inside regex
  // literals for Japanese text (e.g. /　+$/ to trim ideographic spaces), which
  // ESLint can't distinguish from an accidental invisible char — so this is a
  // warning, not an error. Still skips comments/strings to cut the noise.
  'no-irregular-whitespace': ['warn', { skipComments: true, skipStrings: true, skipTemplates: true, skipRegExps: true }],
  // Redundant escapes (e.g. \/ inside a char class) are harmless style nits.
  'no-useless-escape': 'warn',
  // Each cross-file function is BOTH declared in its own file and listed in
  // `crossFileGlobals` so its callers resolve — which is a "redeclaration of a
  // global" by default. Turning off `builtinGlobals` accepts that (it is the whole
  // architecture) while still catching a genuine duplicate declaration within one
  // file. Note ESLint lints file-by-file, so it can never catch the same name
  // being declared in two different scripts; grep is the tool for that.
  'no-redeclare': ['error', { builtinGlobals: false }],
  // High-value correctness checks.
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-func-assign': 'error',
  'no-unreachable': 'error',
  'no-cond-assign': ['error', 'always'],
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-constant-condition': ['warn', { checkLoops: false }],
  'use-isnan': 'error',
  'valid-typeof': 'error'
};

module.exports = [
  {
    // Vendored / minified third-party libraries — never lint these.
    ignores: [
      'html2canvas.min.js',
      'confetti.min.js',
      'gif.js',
      'gif.worker.js'
    ]
  },
  js.configs.recommended,
  {
    // Content scripts: one shared global scope, hence crossFileGlobals.
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals, ...vendorGlobals, ...crossFileGlobals, chrome: 'readonly' }
    },
    rules: sharedRules
  },
  {
    // Popup page: its own document, no content-script globals.
    files: ['popup.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals, chrome: 'readonly' }
    },
    rules: sharedRules
  },
  {
    // MV3 service worker: no DOM.
    files: ['background.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        chrome: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        URL: 'readonly'
      }
    },
    rules: sharedRules
  },
  {
    // This config file itself is CommonJS running under Node.
    files: ['eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' }
    },
    rules: sharedRules
  }
];
