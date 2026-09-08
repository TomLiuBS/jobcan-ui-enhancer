// scripts/main.js

function setupManagedResourceRegistry() {
  if (window.__jbe_managedResourcesReady) return;
  window.__jbe_managedResourcesReady = true;

  const intervals = new Map();
  const observers = new Map();

  window.__jbe_startManagedInterval = function(key, callback, delay, options = {}) {
    if (!key || typeof callback !== 'function') return null;

    if (intervals.has(key)) {
      clearInterval(intervals.get(key));
      intervals.delete(key);
    }

    let runCount = 0;
    const timerId = setInterval(() => {
      runCount += 1;
      callback({
        runCount,
        stop: () => {
          if (!intervals.has(key)) return;
          clearInterval(intervals.get(key));
          intervals.delete(key);
        }
      });

      if (options.maxRuns && runCount >= options.maxRuns && intervals.has(key)) {
        clearInterval(intervals.get(key));
        intervals.delete(key);
      }
    }, delay);

    intervals.set(key, timerId);
    return timerId;
  };

  window.__jbe_clearManagedInterval = function(key) {
    if (!intervals.has(key)) return;
    clearInterval(intervals.get(key));
    intervals.delete(key);
  };

  // `onCleanup` lets a page-scoped observer reset the module-level init flag that
  // guards its own setup. Without it, tearing an observer down on SPA navigation
  // would be permanent — the guard would refuse to re-create it.
  window.__jbe_registerManagedObserver = function(key, observer, onCleanup) {
    if (!key || !observer) return;
    if (observers.has(key)) {
      try {
        observers.get(key).observer.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect existing observer:', key, error);
      }
      observers.delete(key);
    }
    observers.set(key, {
      observer,
      onCleanup: typeof onCleanup === 'function' ? onCleanup : null
    });
  };

  window.__jbe_cleanupManagedResources = function(prefix = '') {
    intervals.forEach((id, key) => {
      if (prefix && !key.startsWith(prefix)) return;
      clearInterval(id);
      intervals.delete(key);
    });

    observers.forEach((entry, key) => {
      if (prefix && !key.startsWith(prefix)) return;
      try {
        entry.observer.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect observer:', key, error);
      }
      observers.delete(key);
      if (entry.onCleanup) {
        try {
          entry.onCleanup();
        } catch (error) {
          console.warn('Observer cleanup callback failed:', key, error);
        }
      }
    });
  };
}

// Main entry: apply all enhancements
function applyEnhancements() {
  setupManagedResourceRegistry();

  // Mark for CSS scoping
  document.documentElement.classList.add('jobcan-enhanced');

  const { origin, pathname } = window.location;
  const isSignInPage = origin === 'https://id.jobcan.jp' && pathname.startsWith('/users/sign_in');
  const isEmployeePage = origin === 'https://ssl.jobcan.jp' && (pathname === '/employee' || pathname.startsWith('/employee/'));
  const isAttendancePage = origin === 'https://ssl.jobcan.jp' && pathname.startsWith('/employee/attendance');
  const isManHourPage = origin === 'https://ssl.jobcan.jp' && pathname.startsWith('/employee/man-hour-manage');
  const isManHourEditPage = isManHourPage && pathname.startsWith('/employee/man-hour-manage/edit-achievement');
  const isManHourListPage = isManHourPage && pathname.startsWith('/employee/man-hour-manage/achievement-list');
  const isRequestListPage = origin === 'https://ssl.jobcan.jp' && /^\/employee\/(holiday|over-work|holidayworking)\b/.test(pathname);

  // Draggable tabs
  if (isEmployeePage && typeof setupTabsContainerDragObserver === 'function') {
    setupTabsContainerDragObserver();
  }

  // Clean up old observers and intervals
  if (typeof setupCleanupObserver === 'function') {
    setupCleanupObserver();
  }

  // Initialize dark mode
  if (typeof initDarkMode === 'function') {
    initDarkMode();
  }

  // UI tweaks
  if (isEmployeePage) {
    if (typeof setupHeaderVisibility === 'function') setupHeaderVisibility();
    if (typeof enhanceManagerNameDisplay === 'function') enhanceManagerNameDisplay();
    if (typeof enhanceUserDisplay === 'function') enhanceUserDisplay();
    if (typeof setupMenuOrderDropdown === 'function') setupMenuOrderDropdown();
  }

  // Flip clock and status
  if (isEmployeePage && typeof setupFlipClock === 'function') setupFlipClock();
  // After setupFlipClock: the status pill and the collapse panel are positioned
  // relative to the flip clock, so the clock has to exist first.
  if (isEmployeePage && typeof setupPunchCard === 'function') setupPunchCard();
  if (isEmployeePage && typeof setupScreenshotButton === 'function') setupScreenshotButton();

  // Other enhancements
  if (typeof fixSettingsIcon === 'function') fixSettingsIcon();
  if (isSignInPage && typeof foldSignInRightContainer === 'function') foldSignInRightContainer();
  if ((isEmployeePage || isSignInPage) && typeof removeLogoBorder === 'function') removeLogoBorder();

  // Man-hour pages were rebuilt by Jobcan (~2026-06): the edit screen is now a
  // standalone page (no modal) and the achievement list renders asynchronously
  // via a Web Worker, backed by a new REST API. These handlers target the new
  // DOM and API (see scripts/manHourApi.js, scripts/manHourEdit.js,
  // scripts/manHourList.js). The legacy modal/select-based handlers and the old
  // scripts/tableFilter.js report were removed in the cleanup after the rebuild,
  // since they targeted DOM that no longer exists.
  if (isManHourEditPage && typeof setupManHourEditPage === 'function') {
    setupManHourEditPage();
  }
  if (isManHourListPage && typeof setupManHourListPage === 'function') {
    setupManHourListPage();
  }

  if (isSignInPage && typeof autoCollapseExternalPanelMisc === 'function') {
    autoCollapseExternalPanelMisc();
  }

  if ((isAttendancePage || isManHourPage) && typeof enhanceCollapseInfo === 'function') {
    enhanceCollapseInfo();
  }

  // Data extraction
  if (isAttendancePage && typeof setupCollapseInfoObserver === 'function') setupCollapseInfoObserver();

  // Request-list enhancements (休暇 / 残業 / 休日出勤): status badges + empty states
  if (isRequestListPage && typeof setupRequestStatusBadges === 'function') setupRequestStatusBadges();
  if (isAttendancePage && typeof setupAttendanceChart === 'function') setupAttendanceChart();
  if (isRequestListPage && typeof setupRequestListEmptyState === 'function') setupRequestListEmptyState();
  if (isRequestListPage && typeof setupRequestHeaderActions === 'function') setupRequestHeaderActions();

  // Clock settings
  if (typeof applyClockSettings === 'function') applyClockSettings();

  // Floating work-time button
  if (isEmployeePage && typeof setupFloatingWorkTimeButton === 'function') setupFloatingWorkTimeButton();

  // Immediate data extract on specific page
  if (isManHourPage && typeof extractAndStoreCollapseInfoData === 'function') {
    extractAndStoreCollapseInfoData();
  }
}

// Run on initial load
document.addEventListener('DOMContentLoaded', applyEnhancements);
applyEnhancements();

// Debounced re-apply on relevant DOM changes (SPA support)
(function setupDebouncedDomObserver() {
  if (window.__jbe_domObserverSetup) return;
  window.__jbe_domObserverSetup = true;

  let debounceTimer = null;
  let lastRunTs = 0;
  let pendingSinceTs = 0;
  const MIN_INTERVAL_MS = 1200; // prevent too-frequent re-inits
  const DEBOUNCE_MS = 800;
  // Ceiling on how long a pending run may keep being pushed back. Measured on the
  // live top page: this observer had gone quiet for minutes. Every mutation cleared
  // the timer and set a new one, and on a page that mutates faster than the debounce
  // — Jobcan's own clock ticking, plus whatever other extensions are installed —
  // the timer never survived to fire, so applyEnhancements() simply stopped running
  // after the two direct calls at load. Anything that arrives late (the 以下の項目の確認
  // card is filled in by ajax) was therefore never picked up.
  const MAX_WAIT_MS = 2500;

  const ignoredSelectors = [
    '.flip-clock-container',
    '.work-progress-container',
    '.jbe-work-stats',
    '.jbe-notices',
    '.work-time-overlay',
    '.screenshot-notification',
    '#jbe-manhour-report',
    '#jbe-manhour-list-filters',
    '#jbe-mh-summary',
    '#jbe-mh-nav',
    '.jbe-mh-navrow',
    '.jbe-unit-mask',
    '#jbe-unit-idpop'
  ];

  function isIgnoredNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (ignoredSelectors.some(sel => node.matches && node.matches(sel))) return true;
    if (node.closest) {
      return !!node.closest(ignoredSelectors.join(','));
    }
    return false;
  }

  function runApply() {
    debounceTimer = null;
    pendingSinceTs = 0;
    lastRunTs = Date.now();
    applyEnhancements();
  }

  function scheduleApply() {
    const now = Date.now();
    if (!pendingSinceTs) pendingSinceTs = now;

    // Never let the debounce push a pending run past MAX_WAIT_MS — that starvation
    // is what stopped the observer entirely. The MIN_INTERVAL floor still applies,
    // so this cannot make the pass run more often than every 1.2s.
    const waited = now - pendingSinceTs;
    const sinceRun = now - lastRunTs;
    const floor = Math.max(0, MIN_INTERVAL_MS - sinceRun);
    const delay = waited >= MAX_WAIT_MS ? floor : Math.max(floor, DEBOUNCE_MS);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runApply, delay);
  }

  const domObserver = new MutationObserver(mutations => {
    // Only react when mutations are outside our own dynamic UI
    const hasRelevantMutation = mutations.some(m => {
      const targets = [m.target, ...Array.from(m.addedNodes || [])];
      return targets.some(t => !isIgnoredNode(t));
    });
    if (hasRelevantMutation) scheduleApply();
  });
  domObserver.observe(document.body, { childList: true, subtree: true, attributes: false });
  window.__jbe_domObserverRef = domObserver;
  // `core:` rather than `watch:` — this observer is the engine that re-applies
  // everything else, so it must survive SPA navigation.
  if (typeof window.__jbe_registerManagedObserver === 'function') {
    window.__jbe_registerManagedObserver('core:dom', domObserver);
  }
})();

// Re-apply on URL change using History API hooks
(function setupUrlChangeHooks() {
  if (window.__jbe_urlHooksSetup) return;
  window.__jbe_urlHooksSetup = true;

  const pushState = history.pushState;
  const replaceState = history.replaceState;
  function emitLocationChange() {
    window.dispatchEvent(new Event('locationchange'));
  }
  history.pushState = function() {
    const ret = pushState.apply(this, arguments);
    emitLocationChange();
    return ret;
  };
  history.replaceState = function() {
    const ret = replaceState.apply(this, arguments);
    emitLocationChange();
    return ret;
  };
  window.addEventListener('popstate', emitLocationChange);
  window.addEventListener('locationchange', () => {
    if (typeof window.__jbe_cleanupManagedResources === 'function') {
      window.__jbe_cleanupManagedResources('watch:');
    }
    applyEnhancements();
  });
})();
