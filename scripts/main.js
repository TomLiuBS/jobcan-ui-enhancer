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

  window.__jbe_registerManagedObserver = function(key, observer) {
    if (!key || !observer) return;
    if (observers.has(key)) {
      try {
        observers.get(key).disconnect();
      } catch (error) {
        console.warn('Failed to disconnect existing observer:', key, error);
      }
      observers.delete(key);
    }
    observers.set(key, observer);
  };

  window.__jbe_cleanupManagedResources = function(prefix = '') {
    intervals.forEach((id, key) => {
      if (prefix && !key.startsWith(prefix)) return;
      clearInterval(id);
      intervals.delete(key);
    });

    observers.forEach((observer, key) => {
      if (prefix && !key.startsWith(prefix)) return;
      try {
        observer.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect observer:', key, error);
      }
      observers.delete(key);
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
    if (typeof fixDuplicateSidemenus === 'function') fixDuplicateSidemenus();
    if (typeof enhanceSidemenuBehavior === 'function') enhanceSidemenuBehavior();
    if (typeof setupHeaderVisibility === 'function') setupHeaderVisibility();
    if (typeof enhanceManagerNameDisplay === 'function') enhanceManagerNameDisplay();
    if (typeof enhanceUserDisplay === 'function') enhanceUserDisplay();
    if (typeof setupMenuOrderDropdown === 'function') setupMenuOrderDropdown();
  }

  // Flip clock and status
  if (isEmployeePage && typeof setupFlipClock === 'function') setupFlipClock();
  if (isEmployeePage && typeof setupScreenshotButton === 'function') setupScreenshotButton();
  if (isEmployeePage && typeof addFormScreenshotButton === 'function') addFormScreenshotButton();

  // Other enhancements
  if (isEmployeePage && typeof monitorUnmatchTime === 'function') monitorUnmatchTime();
  if (typeof fixSettingsIcon === 'function') fixSettingsIcon();
  if (isSignInPage && typeof foldSignInRightContainer === 'function') foldSignInRightContainer();
  if ((isEmployeePage || isSignInPage) && typeof removeLogoBorder === 'function') removeLogoBorder();

  // Man-hour modal and forms
  if (isManHourPage) {
    if (typeof setupManHourKeyboardShortcuts === 'function') setupManHourKeyboardShortcuts();
    if (typeof setupFormValidationObserver === 'function') setupFormValidationObserver();
    if (typeof convertManHourModalToSidePanel === 'function') convertManHourModalToSidePanel();
    if (typeof enhanceModalTitle === 'function') enhanceModalTitle();
    if (typeof enhanceManHourSelectLists === 'function') enhanceManHourSelectLists();
    if (typeof simplifyTableHeaders === 'function') simplifyTableHeaders();
    if (typeof setupTableFilterButtons === 'function') setupTableFilterButtons();
  }

  if (isSignInPage && typeof autoCollapseExternalPanelMisc === 'function') {
    autoCollapseExternalPanelMisc();
  }

  if ((isAttendancePage || isManHourPage) && typeof enhanceCollapseInfo === 'function') {
    enhanceCollapseInfo();
  }

  // Data extraction
  if (isAttendancePage && typeof setupCollapseInfoObserver === 'function') setupCollapseInfoObserver();
  if (isAttendancePage && typeof setupOvertimePageDisplay === 'function') setupOvertimePageDisplay();

  // Clock settings
  if (typeof applyClockSettings === 'function') applyClockSettings();

  // Floating work-time button
  if (isAttendancePage && typeof setupFloatingWorkTimeButton === 'function') setupFloatingWorkTimeButton();

  // Immediate data extract on specific page
  if (isManHourPage && typeof extractAndStoreCollapseInfoData === 'function') {
    extractAndStoreCollapseInfoData();
  }
  
  // Chart enhancer
  // if (typeof setupChartEnhancer === 'function') setupChartEnhancer();
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
  const MIN_INTERVAL_MS = 1200; // prevent too-frequent re-inits
  const DEBOUNCE_MS = 800;

  const ignoredSelectors = [
    '.flip-clock-container',
    '.work-progress-container',
    '.work-time-overlay',
    '.screenshot-notification',
    '.select-sidepanel',
    '#table-report-modal-overlay',
    '#fixed-table-filter-buttons',
    '#table-filter-buttons'
  ];

  function isIgnoredNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (ignoredSelectors.some(sel => node.matches && node.matches(sel))) return true;
    if (node.closest) {
      return !!node.closest(ignoredSelectors.join(','));
    }
    return false;
  }

  function scheduleApply() {
    const now = Date.now();
    if (now - lastRunTs < MIN_INTERVAL_MS) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        lastRunTs = Date.now();
        applyEnhancements();
      }, MIN_INTERVAL_MS - (now - lastRunTs));
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      lastRunTs = Date.now();
      applyEnhancements();
    }, DEBOUNCE_MS);
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
