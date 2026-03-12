// scripts/ui.js

// Observer to cleanup intervals/observers when elements are removed
function setupCleanupObserver() {
  if (window.__jbe_cleanupObserverInited) return;
  window.__jbe_cleanupObserverInited = true;

  // Create a MutationObserver to watch for removed nodes
  const cleanupObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.removedNodes.length > 0) {
        mutation.removedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          const clockContainers = node.querySelectorAll ? node.querySelectorAll('.flip-clock-container') : [];
          clockContainers.forEach(container => {
            cleanupClockContainer(container);
          });
          if (node.classList && node.classList.contains('flip-clock-container')) {
            cleanupClockContainer(node);
          }
        });
      }
    });
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });
}

// Apply dark mode to the page
function applyDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

// Initialize dark mode based on saved settings
function initDarkMode() {
  chrome.storage.sync.get(['darkMode'], function(result) {
    if (result.darkMode !== undefined) {
      applyDarkMode(result.darkMode);
    }
  });
}

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'toggleDarkMode') {
    applyDarkMode(message.enabled);
  } else if (message.action === 'updateClockSettings') {
    // Handle clock settings (already implemented)
    if (typeof updateClockSettings === 'function') {
      updateClockSettings(message);
    }
  } else if (message.action === 'testParticleEffects') {
    // Test particle effects for debugging
    const clockContainers = document.querySelectorAll('.flip-clock-container');
    if (clockContainers.length === 0) {
      sendResponse({ success: false, message: 'No clock containers found' });
      return;
    }
    
    let effectsTriggered = 0;
    clockContainers.forEach(container => {
      if (typeof window.createParticleEffect === 'function') {
        window.createParticleEffect(container);
        effectsTriggered++;
        
        // Add burst effect after delay
        setTimeout(() => {
          if (typeof window.createBurstParticleEffect === 'function') {
            window.createBurstParticleEffect(container);
          }
        }, 300);
      }
    });
    
    sendResponse({ 
      success: true, 
      message: `Particle effects triggered on ${effectsTriggered} clock container(s)!` 
    });
  } else if (message.action === 'getDebugInfo') {
    // Get debug information
    const clockContainers = document.querySelectorAll('.flip-clock-container');
    const pushButtonSelectors = [
      '#adit-button-push',
      '.adit-button-push', 
      '[id*="push"]',
      '[class*="push"]',
      'button[onclick*="push"]',
      'input[type="submit"][value*="出勤"]',
      'input[type="submit"][value*="退勤"]'
    ];
    
    let pushButtonsFound = 0;
    pushButtonSelectors.forEach(selector => {
      const buttons = document.querySelectorAll(selector);
      pushButtonsFound += buttons.length;
    });
    
    const debugInfo = {
      clockContainers: clockContainers.length,
      pushButtons: pushButtonsFound,
      currentUrl: window.location.href,
      pageReady: document.readyState === 'complete',
      particleEffectFunctions: {
        createParticleEffect: typeof window.createParticleEffect === 'function',
        createBurstParticleEffect: typeof window.createBurstParticleEffect === 'function',
        addPushButtonParticleEffects: typeof window.addPushButtonParticleEffects === 'function'
      },
      buttonSelectors: pushButtonSelectors.map(selector => ({
        selector: selector,
        found: document.querySelectorAll(selector).length
      }))
    };
    
    sendResponse(debugInfo);
  }
});

// Clean up resources for a clock container
function cleanupClockContainer(container) {
  // Clear progress interval if it exists
  if (container.dataset.progressIntervalId) {
    clearInterval(parseInt(container.dataset.progressIntervalId, 10));
    container.dataset.progressIntervalId = '';
  }
  
  // Any other cleanup needed for the container
  console.log('Cleaned up resources for removed clock container');
}

// Fix duplicate side menus issue
function fixDuplicateSidemenus() {
  const sidemenus = document.querySelectorAll('#sidemenu, .sidemenu');
  if (sidemenus.length > 1) {
    let visibleFound = false;
    sidemenus.forEach((menu, index) => {
      if (index === 0 && getComputedStyle(menu).display !== 'none') {
        visibleFound = true;
        return;
      }
      if (visibleFound) {
        menu.style.display = 'none';
      } else if (getComputedStyle(menu).display !== 'none') {
        visibleFound = true;
      }
    });
  }
  const menuToggleButtons = document.querySelectorAll('[data-toggle="sidemenu"], .menu-toggle, .sidebar-toggle');
  menuToggleButtons.forEach(button => {
    const newButton = button.cloneNode(true);
    if (button.parentNode) {
      button.parentNode.replaceChild(newButton, button);
      newButton.addEventListener('click', function(e) {
        e.preventDefault();
        fixDuplicateSidemenus();
        setTimeout(fixDuplicateSidemenus, 300);
      });
    }
  });
}

// Enhance sidemenu behavior to close when mouse moves outside
function enhanceSidemenuBehavior() {
  const closeButtons = document.querySelectorAll('.sidemenu-close, .jbc-sidemenu-close, [onclick*="closeSidemenu"]');
  closeButtons.forEach(button => { if (button) button.style.display = 'none'; });
  const sidemenu = document.querySelector('#sidemenu, .sidemenu, .jbc-sidemenu');
  const closedSideMenu = document.querySelector('#sidemenu-closed, .jbc-sidemenu-closed');
  if (closedSideMenu && !closedSideMenu.hasAttribute('onclick')) {
    closedSideMenu.setAttribute('onclick', 'openSidemenu()');
    closedSideMenu.style.cursor = 'pointer';
  }
  if (sidemenu) {
    sidemenu.addEventListener('mouseenter', function() {
      sidemenu.dataset.mouseInside = 'true';
    });
    // sidemenu.addEventListener('mouseleave', function() {
    //   sidemenu.dataset.mouseInside = 'false';
    //   if (typeof closeSidemenu === 'function') {
    //     setTimeout(() => {
    //       if (sidemenu.dataset.mouseInside !== 'true') closeSidemenu();
    //     }, 300);
    //   } else {
    //     setTimeout(() => {
    //       if (sidemenu.dataset.mouseInside !== 'true') {
    //         const closeTrigger = document.querySelector('[onclick*="closeSidemenu"]');
    //         if (closeTrigger) closeTrigger.click();
    //       }
    //     }, 300);
    //   }
    // });
  }
}

// Make header always visible and style navigation
function setupHeaderVisibility() {
  if (window.__jbe_headerVisibilityInited) return;
  window.__jbe_headerVisibilityInited = true;

  const header = document.querySelector('.jbcid-header');
  if (!header) return;
  const existingTrigger = document.querySelector('.jbcid-header-trigger');
  if (existingTrigger && existingTrigger.parentNode) existingTrigger.parentNode.removeChild(existingTrigger);
  header.classList.add('visible');
  header.classList.add('jbe-header-enhanced');
  const navbarMenu = header.querySelector('.jbcid-navbar-menu.jbcid-navbar-left');
  if (navbarMenu) {
    navbarMenu.classList.add('jbe-navbar-menu-enhanced');
    const navItems = navbarMenu.querySelectorAll('ul.nav li a');
    navItems.forEach(item => {
      item.classList.add('jbe-navbar-item');
      item.classList.toggle('jbe-navbar-item-active', item.classList.contains('active'));
    });
    const navContainer = navbarMenu.querySelector('ul.nav');
    if (navContainer) {
      navContainer.classList.add('jbe-navbar-list');
    }
  }
  header.onmouseenter = null;
  header.onmouseleave = null;
  const contentsArea = document.querySelector('.contentsArea');
  if (contentsArea) contentsArea.classList.add('jbe-header-spaced');
  const mainContent = document.querySelector('#main-content');
  if (mainContent) mainContent.classList.add('jbe-header-spaced');
}

// Enhance the manager name dropdown and add settings icon
function enhanceManagerNameDisplay() {
  const managerNameEl = document.querySelector('#manager-name'); if (!managerNameEl) return;
  if (managerNameEl.dataset.enhanced === 'true') return;
  managerNameEl.dataset.enhanced = 'true';
  const staffSettingsLink = managerNameEl.querySelector('.dropdown-item[href="/employee/edit-info/"]');
  if (!staffSettingsLink) return;
  const settingsButton = document.createElement('a');
  settingsButton.href = '/employee/edit-info/';
  settingsButton.className = 'staff-settings-btn';
  settingsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">` +
    `<path fill="currentColor" d="M19.14 12.94c.04 -.3 .06 -.61 .06 -.94 0 -.32 -.02 -.64 -.07 -.94l2.03 -1.58c.18 -.14 .23 -.41 .12 -.61l-1.92 -3.32c-.12 -.22 -.37 -.29 -.59 -.22l-2.39 .96c-.5 -.38 -1.03 -.7 -1.62 -.94l-.36 -2.54c-.04 -.24 -.24 -.41 -.47 -.41h-3.84c-.24 0 -.43 .17 -.47 .41l-.36 2.54c-.59 .24 -1.13 .57 -1.62 .94l-2.39 -.96c-.22 -.08 -.47 0 -.59 .22L2.74 8.87c-.12 .21 -.08 .47 .12 .61l2.03 1.58c-.05 .3 -.09 .63 -.09 .94s.02 .64 .07 .94l-2.03 1.58c-.18 .14 -.23 .41 -.12 .61l1.92 3.32c.12 .22 .37 .29 .59 .22l2.39 -.96c.5 .38 1.03 .7 1.62 .94l.36 2.54c.05 .24 .24 .41 .48 .41h3.84c.24 0 .44 -.17 .47 -.41l.36 -2.54c.59 -.24 1.13 -.56 1.62 -.94l2.39 .96c.22 .08 .47 0 .59 -.22l1.92 -3.32c.12 -.22 .07 -.47 -.12 -.61l-2.01 -1.58zM12 15.6c-1.98 0 -3.6 -1.62 -3.6 -3.6s1.62 -3.6 3.6 -3.6 3.6 1.62 3.6 3.6 -1.62 3.6 -3.6 3.6z"/></svg>`;
  settingsButton.title = '設定';
  managerNameEl.appendChild(settingsButton);
  const dropdownToggle = managerNameEl.querySelector('.dropdown-toggle');
  const dropdownMenu = managerNameEl.querySelector('.dropdown-menu');
  if (dropdownToggle && dropdownMenu) {
    dropdownMenu.classList.add('jbe-manager-dropdown-menu');
    const items = dropdownMenu.querySelectorAll('.dropdown-item');
    items.forEach(item => item.classList.add('jbe-manager-dropdown-item'));
    dropdownToggle.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      if (managerNameEl.classList.contains('show')) {
        managerNameEl.classList.remove('show');
      } else { managerNameEl.classList.add('show'); }
    });
    document.addEventListener('click', function(e) {
      if (!managerNameEl.contains(e.target) && managerNameEl.classList.contains('show')) {
        managerNameEl.classList.remove('show');
      }
    });
  }
}

// Make user name and staff code display horizontally in dropdown toggle
function enhanceUserDisplay() {
  const userToggleElements = document.querySelectorAll('a.dropdown-toggle[id="rollover-menu-link"]');
  userToggleElements.forEach(toggle => {
    if (toggle.dataset.enhanced === 'true') return;
    toggle.dataset.enhanced = 'true';
    toggle.classList.add('jbe-rollover-toggle');
    const content = toggle.innerHTML;
    if (content.includes('<br>') && content.includes('スタッフコード')) {
      const parts = content.split('<br>');
      const name = parts[0].trim();
      const staffCodeDiv = parts[1].trim();
      const wrapper = document.createElement('div');
      wrapper.className = 'jbe-rollover-user-wrapper';
      const nameElement = document.createElement('span'); nameElement.innerHTML = name;
      const tempDiv = document.createElement('div'); tempDiv.innerHTML = staffCodeDiv;
      const codeEl = document.createElement('span'); codeEl.className = 'jbe-rollover-user-code'; codeEl.innerHTML = tempDiv.firstChild.innerHTML;
      wrapper.appendChild(nameElement); wrapper.appendChild(codeEl);
      toggle.innerHTML = ''; toggle.appendChild(wrapper);
    }
  });
}

// Fix the menu_order dropdown functionality
function setupMenuOrderDropdown() {
  if (window.__jbe_menuOrderDropdownInited) return;
  window.__jbe_menuOrderDropdownInited = true;

  const menuTrigger = document.getElementById('menu_order_img');
  const menuDropdown = document.getElementById('menu_order');
  if (!menuTrigger || !menuDropdown) return;
  if (menuTrigger.dataset.enhanced === 'true') return;
  menuTrigger.dataset.enhanced = 'true';

  // Show the dropdown by default
  menuDropdown.classList.add('show');
  menuTrigger.setAttribute('aria-expanded', 'true');

  menuTrigger.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    menuDropdown.classList.toggle('show');
    if (menuDropdown.classList.contains('show')) menuTrigger.setAttribute('aria-expanded', 'true');
    else menuTrigger.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', function(e) {
    if (!menuTrigger.contains(e.target) && !menuDropdown.contains(e.target)) {
      // Don't close this specific dropdown when clicking outside, keep it shown
      // menuDropdown.classList.remove('show'); menuTrigger.setAttribute('aria-expanded', 'false');
    }
  });
}

// Fix settings icon appearance
function fixSettingsIcon() {
  if (window.__jbe_fixSettingsIconInited) return;
  window.__jbe_fixSettingsIconInited = true;

  const fixSettingsButtons = () => {
    const settingsButtons = document.querySelectorAll('.staff-settings-btn');
    settingsButtons.forEach(button => {
      if (button.hasAttribute('data-enhanced')) return;
      button.setAttribute('data-enhanced', 'true');
      const originalTitle = button.getAttribute('title') || '設定';
      if (!button.textContent.trim()) button.textContent = originalTitle;
    });
  };
  fixSettingsButtons();
  if (!window.__jbe_fixSettingsIconObserver) {
    const observer = new MutationObserver((mutations) => {
    let shouldFix = false;
    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && (node.classList?.contains('staff-settings-btn') || node.querySelector?.('.staff-settings-btn'))) {
            shouldFix = true;
          }
        });
      }
    });
    if (shouldFix) fixSettingsButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__jbe_fixSettingsIconObserver = observer;
  }
  if (window.__jbe_fixSettingsIconInterval) clearInterval(window.__jbe_fixSettingsIconInterval);
  window.__jbe_fixSettingsIconInterval = setInterval(fixSettingsButtons, 4000);
}

// Fold the sign-in right container by default
function foldSignInRightContainer() {
  const container = document.querySelector('.col-sm-6.sign-in-right-container'); if (!container || container.dataset.enhanced) return;
  container.dataset.enhanced = 'true';
  const parentElem = container.parentNode;
  if (parentElem && getComputedStyle(parentElem).position === 'static') parentElem.classList.add('jbe-signin-parent-positioned');
  container.classList.add('jbe-signin-right-container');
  container.classList.add('is-collapsed');
  const signInBg = document.querySelector('.sign-in-bg'); if (signInBg) signInBg.classList.add('jbe-hidden');
  Array.from(container.children).forEach(child => {
    if (child.classList) child.classList.add('jbe-signin-child');
  });
  const toggleButton = document.createElement('button'); toggleButton.className = 'sign-in-toggle-btn jbe-signin-toggle-btn is-collapsed'; toggleButton.textContent = '広告を表示'; toggleButton.type = 'button';
  toggleButton.addEventListener('click', () => {
    const isCollapsed = container.classList.contains('is-collapsed');
    if (!isCollapsed) {
      container.classList.add('is-collapsed');
      toggleButton.textContent = '広告を表示';
      toggleButton.classList.add('is-collapsed');
      toggleButton.classList.remove('is-expanded');
      container.parentNode.insertBefore(toggleButton, container);
    } else {
      container.classList.remove('is-collapsed');
      toggleButton.textContent = '×';
      toggleButton.classList.remove('is-collapsed');
      toggleButton.classList.add('is-expanded');
      container.appendChild(toggleButton);
    }
  });
  container.parentNode.insertBefore(toggleButton, container);
}

// Remove border from the logo
function removeLogoBorder() {
  const logoSelectors = ['.jbcid-logo', '.jbc-logo', '.logo', 'img.logo', '.jbcid-header img', '.jbcid-navbar-logo', '.brand-logo'];
  logoSelectors.forEach(selector => {
    const logoElements = document.querySelectorAll(selector);
    logoElements.forEach(logo => {
      logo.classList.add('jbe-logo-no-border');
    });
  });
}

function validateEnhancedSelects(form) {
  const enhancedSelects = form.querySelectorAll('select[data-enhanced="true"]');
  let hasError = false;
  let firstInvalidSelect = null;

  enhancedSelects.forEach((select) => {
    const wrapper = select.nextElementSibling;
    const hasWrapper = wrapper && wrapper.classList.contains('custom-select-wrapper');
    const isInvalid = select.required && (!select.value || select.value === '');

    if (hasWrapper && !isInvalid) {
      wrapper.style.borderColor = '';
      wrapper.style.boxShadow = '';
      wrapper.removeAttribute('data-invalid');
      const tooltip = wrapper.querySelector('.validation-tooltip');
      if (tooltip) tooltip.style.display = 'none';
    }

    if (!isInvalid) return;

    hasError = true;
    if (!firstInvalidSelect) firstInvalidSelect = select;
    if (!hasWrapper) return;

    wrapper.style.borderColor = 'var(--color-danger)';
    wrapper.style.boxShadow = '0 0 0 0.2rem var(--color-danger-light)';
    wrapper.setAttribute('data-invalid', 'true');
    const tooltip = wrapper.querySelector('.validation-tooltip');
    if (tooltip) {
      tooltip.style.display = 'block';
      setTimeout(() => { tooltip.style.display = 'none'; }, 3000);
    }
  });

  return { hasError, firstInvalidSelect };
}

function bindFormValidation(form) {
  if (!form || form.dataset.validationEnhanced === 'true') return;
  form.dataset.validationEnhanced = 'true';

  form.addEventListener('submit', function(e) {
    const { hasError, firstInvalidSelect } = validateEnhancedSelects(form);
    if (!hasError) return;

    e.preventDefault();
    e.stopPropagation();

    if (firstInvalidSelect) {
      const wrapper = firstInvalidSelect.nextElementSibling;
      if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { wrapper.click(); }, 500);
      }
    }

    console.log('Form validation failed: Please select required fields before saving.');
    showNotification('項目をすべて選択してください。', 3000);
  });
}

// Setup form validation observer for required fields
function setupFormValidationObserver() {
  if (window.__jbe_formValidationObserverInited) return;
  window.__jbe_formValidationObserverInited = true;

  const attachValidationToForms = () => {
    document.querySelectorAll('form').forEach((form) => {
      bindFormValidation(form);
    });
  };

  const observer = new MutationObserver(() => {
    attachValidationToForms();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  attachValidationToForms();
}

// Monitor and preserve the un-match-time element
function monitorUnmatchTime() {
  // Let the original website handle un-match-time updates
  // This function has been removed to fix issues with 工数 column changes not updating the un-match-time
  return;
}

// Keyboard shortcuts within man-hour modal
function setupManHourKeyboardShortcuts() {
  if (window.__jbe_manHourShortcutsInited) return;
  window.__jbe_manHourShortcutsInited = true;

  document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('man-hour-manage-modal');
    if (!modal || !modal.classList.contains('show')) return;
    if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const addRecordBtn = document.querySelector('button[onclick*="addRecord"], a[onclick*="addRecord"]');
      if (addRecordBtn) addRecordBtn.click();
      else if (typeof addRecord === 'function') addRecord();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const saveBtn = document.querySelector('#save, button[type="submit"], input[type="submit"]');
      if (saveBtn) saveBtn.click();
      else if (typeof pushSave === 'function') pushSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      const closeBtn = modal.querySelector('.close, [data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      else {
        modal.classList.remove('show');
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        document.body.classList.remove('modal-open'); document.body.style.paddingRight = '';
      }
    }
  });
  if (window.addRecord && typeof window.addRecord === 'function') {
    const originalAddRecord = window.addRecord;
    window.addRecord = function() {
      originalAddRecord.apply(this, arguments);
      setTimeout(() => {
        const rows = document.querySelectorAll('.man-hour-table-edit tr, .jbc-table tr');
        if (rows.length > 0) {
          const lastRow = rows[rows.length - 1];
          const timeInput = lastRow.querySelector('input.man-hour-input[name="minutes[]"]');
          if (timeInput) {
            const event = new Event('change', { bubbles: true });
            timeInput.dispatchEvent(event);
          }
        }
      }, 100);
    };
  }
}

// Auto-collapse certain panels on man-hour page
function autoCollapseExternalPanelMisc() {
  if (window.__jbe_autoCollapseExternalPanelInited) return;
  window.__jbe_autoCollapseExternalPanelInited = true;
  // Process existing external-panel-misc elements
  const processExternalPanels = () => {
    const panels = document.querySelectorAll('.external-panel-misc');
    panels.forEach(panel => {
      if (panel && !panel.dataset.enhanced) {
        // Mark as enhanced to prevent duplicate processing
        panel.dataset.enhanced = 'true';
        
        // Store original styling
        const originalDisplay = getComputedStyle(panel).display;
        const originalPosition = getComputedStyle(panel).position;
        const originalZIndex = getComputedStyle(panel).zIndex;
        
        // Create wrapper for positioning
        const wrapper = document.createElement('div');
        wrapper.className = 'external-panel-wrapper';
        wrapper.style.position = 'relative';
        
        // Move panel to wrapper and adjust its styling
        if (panel.parentNode) {
          panel.parentNode.insertBefore(wrapper, panel);
          wrapper.appendChild(panel);
          
          // Style panel for floating
          panel.style.position = 'absolute';
          panel.style.bottom = '100%'; // Position above instead of below
          panel.style.left = '0';
          panel.style.zIndex = '1000';
          panel.style.boxShadow = '0 -4px 12px rgba(0, 0, 0, 0.15)'; // Adjust shadow for upward position
          panel.style.borderRadius = 'var(--border-radius-md)';
          panel.style.backgroundColor = 'white';
          panel.style.padding = '15px';
          panel.style.marginBottom = '5px'; // Use margin-bottom instead of margin-top
          panel.style.border = '1px solid var(--color-gray-200)';
          panel.style.minWidth = '250px';
          panel.style.maxWidth = '100%';
          
          // Hide initially
          panel.style.display = 'none';
        }
        
        // Create header/toggle element
        const toggleHeader = document.createElement('div');
        toggleHeader.className = 'external-panel-toggle';
        toggleHeader.textContent = '言語設定と他のログイン方法';
        toggleHeader.style.cssText = `
          padding: 8px 12px;
          background-color: var(--color-gray-100);
          border: 1px solid var(--color-gray-200);
          border-radius: var(--border-radius-md);
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          color: var(--color-secondary);
          text-align: center;
          transition: all 0.2s ease;
          position: relative;
        `;
        
        // Add hover effect
        toggleHeader.addEventListener('mouseenter', () => {
          toggleHeader.style.backgroundColor = 'var(--color-gray-200)';
        });
        
        toggleHeader.addEventListener('mouseleave', () => {
          toggleHeader.style.backgroundColor = 'var(--color-gray-100)';
        });
        
        // Add click handler to toggle visibility
        toggleHeader.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent click from reaching document
          const isVisible = panel.style.display !== 'none';
          
          if (isVisible) {
            // Collapse panel
            panel.style.display = 'none';
            toggleHeader.classList.remove('active');
          } else {
            // Expand panel
            panel.style.display = originalDisplay;
            toggleHeader.classList.add('active');
            
            // Position adjustment if needed
            const toggleRect = toggleHeader.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            
            // Check if panel would go off the top of viewport
            if (panelRect.top < 0) {
              // If it would go off the top, position it below instead
              panel.style.bottom = 'auto';
              panel.style.top = '100%';
              panel.style.marginBottom = '0';
              panel.style.marginTop = '5px';
              
              // Add a class to handle the arrow direction in CSS
              panel.classList.add('position-below');
            } else {
              panel.classList.remove('position-below');
            }
            
            // Check if panel would go off the right edge of viewport
            if (panelRect.right > window.innerWidth) {
              panel.style.left = 'auto';
              panel.style.right = '0';
              
              // Adjust arrow position if it's on the right side
              if (panel.classList.contains('position-below')) {
                panel.style.setProperty('--arrow-position', `calc(100% - 20px)`);
              } else {
                panel.style.setProperty('--arrow-position', `calc(100% - 20px)`);
              }
            } else {
              panel.style.setProperty('--arrow-position', '20px');
            }
          }
        });
        
        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
          if (panel.style.display !== 'none' && 
              !panel.contains(e.target) && 
              e.target !== toggleHeader) {
            panel.style.display = 'none';
            toggleHeader.classList.remove('active');
          }
        });
        
        // Add toggleHeader to wrapper
        wrapper.insertBefore(toggleHeader, panel);
      }
    });
  };
  
  // Process any existing external-panel-misc elements
  processExternalPanels();
  
  // Set up mutation observer to watch for dynamically added external-panel-misc elements
  const observer = new MutationObserver((mutations) => {
    let panelAdded = false;
    
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          // Check if the added node is an element
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the node itself is an external-panel-misc
            if (node.classList && node.classList.contains('external-panel-misc')) {
              panelAdded = true;
            }
            
            // Check if it contains any external-panel-misc elements
            const panels = node.querySelectorAll ? 
              node.querySelectorAll('.external-panel-misc') : [];
            
            if (panels.length > 0) {
              panelAdded = true;
            }
          }
        });
      }
    });
    
    // If a panel was added, process all panels again
    if (panelAdded) {
      processExternalPanels();
    }
  });
  
  // Start observing document for added nodes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
