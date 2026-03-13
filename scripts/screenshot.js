// scripts/screenshot.js

function getFabState() {
  if (!window.__jbe_fabState) {
    window.__jbe_fabState = {
      root: null,
      mainButton: null,
      actionsWrap: null,
      actions: new Map(),
      isOpen: false
    };
  }
  return window.__jbe_fabState;
}

function closeFloatingActionMenu() {
  const state = getFabState();
  if (!state.root) return;
  state.isOpen = false;
  state.root.classList.remove('open');
  if (state.mainButton) state.mainButton.setAttribute('aria-expanded', 'false');
}

function ensureFloatingActionMenu() {
  const state = getFabState();
  if (state.root && document.body.contains(state.root)) return state;

  const root = document.createElement('div');
  root.id = 'jobcan-fab-menu';

  // Keep this ID for compatibility with existing positioning logic.
  const mainButton = document.createElement('button');
  mainButton.id = 'screenshot-capture-btn';
  mainButton.className = 'jobcan-fab-main';
  mainButton.type = 'button';
  mainButton.title = 'クイックアクション';
  mainButton.setAttribute('aria-label', 'クイックアクション');
  mainButton.setAttribute('aria-expanded', 'false');
  mainButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'jobcan-fab-actions';

  root.appendChild(actionsWrap);
  root.appendChild(mainButton);
  document.body.appendChild(root);

  mainButton.addEventListener('click', (e) => {
    e.stopPropagation();
    state.isOpen = !state.isOpen;
    root.classList.toggle('open', state.isOpen);
    mainButton.setAttribute('aria-expanded', state.isOpen ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) closeFloatingActionMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFloatingActionMenu();
  });

  const modalObserver = new MutationObserver(() => {
    const modal = document.getElementById('man-hour-manage-modal');
    if (!modal) return;
    const isVisible = modal.classList.contains('show');
    root.style.display = isVisible ? 'none' : 'flex';
    if (isVisible) closeFloatingActionMenu();
  });

  if (typeof window.__jbe_registerManagedObserver === 'function') {
    window.__jbe_registerManagedObserver('watch:screenshot-modal', modalObserver);
  }

  if (typeof window.__jbe_startManagedInterval === 'function') {
    window.__jbe_startManagedInterval('watch:screenshot-modal-find', ({ stop }) => {
      const modal = document.getElementById('man-hour-manage-modal');
      if (!modal) return;
      stop();
      modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
      root.style.display = modal.classList.contains('show') ? 'none' : 'flex';
    }, 500, { maxRuns: 120 });
  } else {
    let attempts = 0;
    const checkForModal = setInterval(() => {
      attempts += 1;
      const modal = document.getElementById('man-hour-manage-modal');
      if (modal) {
        clearInterval(checkForModal);
        modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
        root.style.display = modal.classList.contains('show') ? 'none' : 'flex';
      } else if (attempts >= 120) {
        clearInterval(checkForModal);
      }
    }, 500);
  }

  state.root = root;
  state.mainButton = mainButton;
  state.actionsWrap = actionsWrap;
  return state;
}

function registerFloatingAction(options) {
  const state = ensureFloatingActionMenu();
  const { id, title, icon, onClick, order = 100 } = options;
  if (!id || typeof onClick !== 'function') return;

  let actionButton = state.actions.get(id);
  if (!actionButton) {
    actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'jobcan-fab-action';
    actionButton.dataset.actionId = id;
    state.actions.set(id, actionButton);
    state.actionsWrap.appendChild(actionButton);
  }

  actionButton.title = title || '';
  actionButton.setAttribute('aria-label', title || id);
  actionButton.dataset.title = title || id;
  actionButton.dataset.order = String(order);
  actionButton.innerHTML = icon || '';
  actionButton.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeFloatingActionMenu();
    onClick();
  };

  Array.from(state.actionsWrap.children)
    .sort((a, b) => Number(a.dataset.order || 100) - Number(b.dataset.order || 100))
    .forEach((node) => state.actionsWrap.appendChild(node));
}

// Add screenshot capture functionality
function setupScreenshotButton() {
  if (window.__jbe_screenshotButtonSetup) return;
  window.__jbe_screenshotButtonSetup = true;

  registerFloatingAction({
    id: 'capture',
    title: 'スクリーンショット',
    order: 10,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>',
    onClick: initScreenshotCapture
  });
}

// Initialize screenshot capture selection overlay and handlers
function initScreenshotCapture() {
  // Store scroll position when starting the capture
  const startScrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const startScrollY = window.pageYOffset || document.documentElement.scrollTop;
  
  // Create overlay for area selection
  const overlay = document.createElement('div');
  overlay.id = 'screenshot-selection-overlay';
  overlay.className = 'screenshot-selection-overlay';
  document.body.appendChild(overlay);
  
  // Create selection area
  const selection = document.createElement('div');
  selection.id = 'screenshot-selection';
  selection.className = 'screenshot-selection';
  selection.style.display = 'none';
  
  // Add span for CSS corners
  const span = document.createElement('span');
  selection.appendChild(span);
  
  overlay.appendChild(selection);

  let isOverlayDisposed = false;

  const cleanupSelectionOverlay = () => {
    if (isOverlayDisposed) return;
    isOverlayDisposed = true;
    document.removeEventListener('keydown', handleEscapeKey);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  const handleEscapeKey = (e) => {
    if (e.key === 'Escape') cleanupSelectionOverlay();
  };

  document.addEventListener('keydown', handleEscapeKey);
  
  // Variables to track selection
  let startX, startY, isSelecting = false;
  let currentX, currentY;
  
  // Handle mouse down event
  overlay.addEventListener('mousedown', function(e) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    
    // Position the selection div at the starting point
    selection.style.left = `${startX}px`;
    selection.style.top = `${startY}px`;
    selection.style.width = '0';
    selection.style.height = '0';
    selection.style.display = 'block';
  });
  
  // Handle mouse move event
  overlay.addEventListener('mousemove', function(e) {
    if (!isSelecting) return;
    currentX = e.clientX;
    currentY = e.clientY;
    
    // Calculate width and height of selection
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    // Determine position based on drag direction
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    
    // Update selection div dimensions
    selection.style.left = `${left}px`;
    selection.style.top = `${top}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
  });
  
  // Handle mouse up event to finalize selection
  overlay.addEventListener('mouseup', function() {
    if (!isSelecting) return;
    isSelecting = false;
    
    const width = parseInt(selection.style.width);
    const height = parseInt(selection.style.height);
    
    if (width > 10 && height > 10) {
      const area = {
        x: parseInt(selection.style.left),
        y: parseInt(selection.style.top),
        w: width,
        h: height,
        scrollX: startScrollX,
        scrollY: startScrollY
      };
      captureScreenshot(area);
    }

    cleanupSelectionOverlay();
  });
}

// Capture screenshot of the selected area and handle preview and clipboard
function captureScreenshot(area) {
  // Remove the selection overlay before capturing
  const overlay = document.getElementById('screenshot-selection-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }

  // Fix flip clock transformations
  const flipCards = document.querySelectorAll('.flip-card');
  flipCards.forEach(flipCard => {
    flipCard.style.transform = 'rotateX(0deg)';
    flipCard.classList.remove('flipping');
    const front = flipCard.querySelector('.flip-card-front');
    if (front) {
      front.style.visibility = 'visible';
      front.style.opacity = '1';
    }
    const back = flipCard.querySelector('.flip-card-back');
    if (back) {
      back.style.visibility = 'hidden';
      back.style.opacity = '0';
    }
  });

  // --- FIX: More robust check for html2canvas ---
  if (typeof html2canvas !== 'function') {
    console.error('html2canvas is not defined');
    
    // Try to load html2canvas dynamically if not available
    const loadHtml2Canvas = () => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Try to use chrome.runtime if available, otherwise use a direct path
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          script.src = chrome.runtime.getURL('html2canvas.min.js');
        } else {
          // Fallback to direct path (might work in some contexts)
          script.src = '/html2canvas.min.js';
        }
        script.onload = () => resolve();
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
      });
    };
    
    // Try to load and then retry
    loadHtml2Canvas()
      .then(() => {
        showNotification('Loading html2canvas, please try again...');
        if (overlay) {
          document.body.removeChild(overlay);
        }
      })
      .catch(() => {
        showNotification('Cannot load html2canvas. Screenshot is not available.');
        if (overlay) {
          document.body.removeChild(overlay);
        }
      });
    
    return;
  }

  // Create an empty layoutElem variable to prevent reference errors
  let layoutElem = null;

  // Use html2canvas without window prefix
  html2canvas(document.body, {
    useCORS: true,
    allowTaint: true,
    foreignObjectRendering: true,
    scale: window.devicePixelRatio,
    scrollX: -window.scrollX,
    scrollY: -window.scrollY,
    windowWidth: document.documentElement.offsetWidth,
    windowHeight: document.documentElement.offsetHeight,
    onclone: function(clonedDoc) {
      const clonedFlipCards = clonedDoc.querySelectorAll('.flip-card');
      clonedFlipCards.forEach(card => {
        card.style.transform = 'rotateX(0deg)';
        const cardBack = card.querySelector('.flip-card-back');
        if (cardBack) {
          cardBack.style.visibility = 'hidden';
          cardBack.style.opacity = '0';
        }
      });
    }
  }).then(canvas => {
    // Remove the custom layout element from the DOM
    if (layoutElem && layoutElem.parentNode) {
      layoutElem.parentNode.removeChild(layoutElem);
    }
    // Remove any existing notification
    const notification = document.querySelector('.screenshot-notification');
    if (notification) {
      notification.remove();
    }
    
    // Crop to the selected area
    const croppedCanvas = document.createElement('canvas');
    const ctx = croppedCanvas.getContext('2d');
    croppedCanvas.width = area.w;
    croppedCanvas.height = area.h;

    const centerX = area.x + (area.w / 2);
    const centerY = area.y + (area.h / 2);
    const elementAtCenter = document.elementFromPoint(centerX, centerY);
    let isFixed = false;
    let el = elementAtCenter;
    while (el && !isFixed) {
      const position = window.getComputedStyle(el).getPropertyValue('position');
      if (position === 'fixed') {
        isFixed = true;
      }
      el = el.parentElement;
    }

    let cropX, cropY;
    if (isFixed) {
      cropX = area.x * window.devicePixelRatio;
      cropY = area.y * window.devicePixelRatio;
    } else {
      cropX = (area.x + area.scrollX) * window.devicePixelRatio;
      cropY = (area.y + area.scrollY) * window.devicePixelRatio;
    }

    ctx.drawImage(
      canvas,
      cropX,
      cropY,
      area.w * window.devicePixelRatio,
      area.h * window.devicePixelRatio,
      0, 0, area.w, area.h
    );

    // Convert to data URL
    const imageData = croppedCanvas.toDataURL('image/png');

    // --- FIX: ClipboardItem feature detection ---
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function') {
      croppedCanvas.toBlob(function(blob) {
        try {
          const item = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([item]).then(
            () => {
              showNotification('スクリーンショットがコピーされました。');
            },
            (err) => {
              console.error('Could not copy to clipboard: ', err);
              showNotification('Could not copy to clipboard. See console for details.');
            }
          );
        } catch (err) {
          console.error('ClipboardItem not supported or other clipboard error: ', err);
          showNotification('Copy to clipboard not supported in this browser.');
        }
      });
    } else {
      showNotification('このブラウザは画像のクリップボードコピーに対応していません。');
    }

    // Show preview with download option
    showScreenshotPreview(imageData);
  })
  .catch(error => {
    console.error('Screenshot capture failed:', error);
    showNotification('キャプチャに失敗しました');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  });
}

// Show a small preview of the captured screenshot with controls
function showScreenshotPreview(imageData) {
  // Remove existing preview if any
  const existingPreview = document.getElementById('screenshot-preview-container');
  if (existingPreview) {
    existingPreview.remove();
  }
  
  // Create preview container
  const previewContainer = document.createElement('div');
  previewContainer.id = 'screenshot-preview-container';
  
  // Create preview wrapper (for positioning the close button)
  const previewWrapper = document.createElement('div');
  previewWrapper.className = 'preview-wrapper';
  
  // Create image preview
  const previewImage = document.createElement('img');
  previewImage.src = imageData;
  previewImage.alt = 'Screenshot preview';
  previewImage.className = 'screenshot-preview-image';
  
  // Add click event listener to preview image
  previewImage.addEventListener('click', () => {
    showFullSizeImage(imageData);
  });
  
  // Create preview close button
  const previewCloseBtn = document.createElement('button');
  previewCloseBtn.className = 'sidepanel-close';
  previewCloseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4L4 12M4 4L12 12"/></svg>';
  previewCloseBtn.title = 'Close preview';
  previewCloseBtn.classList.add('screenshot-preview-close');
  
  // Close button click handler
  previewCloseBtn.addEventListener('click', () => {
    previewContainer.classList.add('closing');
    setTimeout(() => {
      if (previewContainer.parentNode) {
        previewContainer.parentNode.removeChild(previewContainer);
      }
    }, 300);
  });
  
  // Add image and close button to wrapper
  previewWrapper.appendChild(previewImage);
  previewWrapper.appendChild(previewCloseBtn);
  
  // Create controls container
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'screenshot-preview-controls';
  
  // Create download button
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'screenshot-preview-btn download-btn';
  downloadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 保存';
  
  // Download button click handler
  downloadBtn.addEventListener('click', () => {
    const date = new Date();
    const timestamp = date.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `screenshot-${timestamp}.png`;
    
    const link = document.createElement('a');
    link.href = imageData;
    link.download = filename;
    link.click();
    
    showNotification('Screenshot downloaded');
  });
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'screenshot-preview-btn close-btn';
  closeBtn.innerText = 'Close';
  
  // Close button click handler
  closeBtn.addEventListener('click', () => {
    previewContainer.classList.add('closing');
    setTimeout(() => {
      if (previewContainer.parentNode) {
        previewContainer.parentNode.removeChild(previewContainer);
      }
    }, 300);
  });
  
  // Add controls to container
  controlsContainer.appendChild(downloadBtn);
  controlsContainer.appendChild(closeBtn);
  
  // Add wrapper and controls to preview container
  previewContainer.appendChild(previewWrapper);
  previewContainer.appendChild(controlsContainer);
  
  // Add preview to body
  document.body.appendChild(previewContainer);
  
  // Position preview in the bottom right corner
  const captureBtn = document.getElementById('screenshot-capture-btn');
  let rightPosition = 20;
  let bottomPosition = 20;
  if (captureBtn && captureBtn.style.display !== 'none') {
    const captureBtnRect = captureBtn.getBoundingClientRect();
    rightPosition = window.innerWidth - captureBtnRect.right;
    bottomPosition = window.innerHeight - captureBtnRect.top + 10;
  }
  previewContainer.style.right = `${rightPosition}px`;
  previewContainer.style.bottom = `${bottomPosition}px`;
  
  // Animate opening
  setTimeout(() => {
    previewContainer.classList.add('open');
  }, 10);
}

// Show full-size screenshot in a modal overlay
function showFullSizeImage(imageData) {
  // Remove existing modal if any
  const existingModal = document.getElementById('screenshot-fullsize-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'screenshot-fullsize-modal';
  
  // Create full-size image
  const fullImage = document.createElement('img');
  fullImage.src = imageData;
  fullImage.alt = 'Full size screenshot';
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6L18 18"/></svg>';
  closeBtn.title = 'Close fullscreen view';
  
  // Create a small hint for keyboard shortcut
  const hint = document.createElement('div');
  hint.className = 'fullsize-hint';
  hint.textContent = 'ESCキーで戻る';
  
  // Close button click handler
  closeBtn.addEventListener('click', () => {
    closeModal();
  });
  
  // Click outside the image to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
  
  // Close modal function
  function closeModal() {
    modal.style.opacity = '0';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      document.removeEventListener('keydown', handleKeyDown);
    }, 300);
  }
  
  // Keyboard support - close on Escape key
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }
  
  document.addEventListener('keydown', handleKeyDown);
  
  // Add elements to modal
  modal.appendChild(fullImage);
  modal.appendChild(closeBtn);
  modal.appendChild(hint);
  
  // Add modal to body
  document.body.appendChild(modal);
  
  // Animate opening
  setTimeout(() => {
    modal.style.opacity = '1';
  }, 10);
}

// Utility to show toast notifications
function showNotification(message, duration = 3000) {
  // Check if there's already a notification and remove it
  const existingNotification = document.querySelector('.screenshot-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'screenshot-notification';
  notification.textContent = message;
  
  // Add to document
  document.body.appendChild(notification);
  
  // Auto-hide after delay (if duration > 0)
  if (duration > 0) {
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.classList.add('hiding');
        setTimeout(() => {
          if (document.body.contains(notification)) {
            notification.remove();
          }
        }, 500);
      }
    }, duration);
  }
  
  return notification;
}

// Add screenshot button to forms
function addFormScreenshotButton() {
  // Prevent on login page (by URL or DOM)
  const isLoginPage =
    window.location.pathname.includes('/login') ||
    window.location.pathname.includes('/auth') ||
    document.getElementById('new_user') ||
    document.querySelector('.login-page-container');
  if (isLoginPage) return;

  // Look for form containers
  const formContainers = document.querySelectorAll('.jbc-form, .edit-form, form.form');
  
  formContainers.forEach(form => {
    // Skip if already enhanced
    if (form.dataset.screenshotEnhanced === 'true') return;
    form.dataset.screenshotEnhanced = 'true';
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'form-screenshot-button';
    
    // Create button
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-outline-secondary form-capture-btn';
    button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>';
    button.title = 'Capture form screenshot';
    
    // Add click handler
    button.addEventListener('click', () => {
      captureElementScreenshot(form);
    });
    
    // Add button to container and container to form
    buttonContainer.appendChild(button);
    
    // Position the form relatively if not already
    const position = window.getComputedStyle(form).position;
    if (position === 'static') {
      form.style.position = 'relative';
    }
    
    form.appendChild(buttonContainer);
  });
  
  // Add screenshot button to modal footers before save button
  const observer = new MutationObserver((mutations) => {
    const modalFooters = document.querySelectorAll('.modal-footer, .jbc-modal-footer');
    modalFooters.forEach(footer => {
      // Skip if screenshot button already added to this footer
      if (footer.dataset.screenshotEnhanced === 'true') return;
      footer.dataset.screenshotEnhanced = 'true';
      let saveButton = footer.querySelector('#save, button[type="submit"], input[type="submit"]');
      if (!saveButton) {
        // Fallback to first button in footer
        saveButton = footer.querySelector('button');
      }
      if (!saveButton) return;
      const screenshotBtn = document.createElement('button');
      screenshotBtn.type = 'button';
      screenshotBtn.className = 'btn jbc-btn-secondary form-screenshot-btn';
      screenshotBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> キャプチャ';
      screenshotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const modal = footer.closest('.modal, .modal-content, .jbc-modal');
        let formElement;
        if (modal) {
          formElement = modal.querySelector('form');
        }
        if (!formElement) {
          formElement = document.getElementById('save-form');
        }
        if (!formElement) {
          const forms = document.querySelectorAll('form');
          for (const form of forms) {
            if (form.querySelector('[type="submit"], #save')) {
              formElement = form;
              break;
            }
          }
        }
        if (formElement) {
          captureElementScreenshot(formElement);
        } else {
          showNotification('フォームの要素が見つかりません');
        }
      });
      saveButton.parentNode.insertBefore(screenshotBtn, saveButton);
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // Initial run for existing modal footers
  document.querySelectorAll('.modal-footer, .jbc-modal-footer').forEach(footer => {
    // Skip if screenshot button already added to this footer
    if (footer.dataset.screenshotEnhanced === 'true') return;
    footer.dataset.screenshotEnhanced = 'true';
    // Find save button or fallback to first button
    let saveButton = footer.querySelector('#save, button[type="submit"], input[type="submit"]');
    if (!saveButton) {
      saveButton = footer.querySelector('button');
    }
    if (!saveButton) return;
    const screenshotBtn = document.createElement('button');
    screenshotBtn.type = 'button';
    screenshotBtn.className = 'btn jbc-btn-secondary form-screenshot-btn';
    screenshotBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> キャプチャ';
    screenshotBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = footer.closest('.modal, .modal-content, .jbc-modal');
      let formElement;
      if (modal) {
        formElement = modal.querySelector('form');
      }
      if (!formElement) {
        formElement = document.getElementById('save-form');
      }
      if (!formElement) {
        const forms = document.querySelectorAll('form');
        for (const form of forms) {
          if (form.querySelector('[type="submit"], #save')) {
            formElement = form;
            break;
          }
        }
      }
      if (formElement) {
        captureElementScreenshot(formElement);
      } else {
        showNotification('フォームの要素が見つかりません');
      }
    });
    saveButton.parentNode.insertBefore(screenshotBtn, saveButton);
  });
}

// Capture screenshot of a specific element
function captureElementScreenshot(element) {
  if (!element) return;
  
  // Show loading notification
  if (typeof window.showNotification === 'function') {
    window.showNotification('Capturing form...', 0);
  }
  
  // Build and render custom layout for screenshot
  const cloned = element.cloneNode(true);
  cleanupAndEnhanceContent(cloned);
  const layoutElem = buildScreenshotLayout(cloned);
  layoutElem.style.position = 'fixed';
  layoutElem.style.top = '0';
  layoutElem.style.left = '0';
  layoutElem.style.zIndex = '9999';
  document.body.appendChild(layoutElem);

  // --- FIX: More consistent check for html2canvas ---
  if (typeof html2canvas !== 'function') {
    showNotification('html2canvasが読み込まれていません。キャプチャできません。');
    if (layoutElem && layoutElem.parentNode) layoutElem.parentNode.removeChild(layoutElem);
    return;
  }

  // Capture screenshot of the custom layout
  html2canvas(layoutElem, {
    allowTaint: true,
    useCORS: true,
    backgroundColor: '#ffffff',
    scale: 2,
    logging: false,
    ignoreElements: (node) => {
      // Ignore screenshot buttons and unnecessary elements
      return node.classList && (
        node.classList.contains('form-screenshot-button') ||
        node.classList.contains('btn-close') ||
        node.classList.contains('close')
      );
    }
  }).then(canvas => {
    // Remove the custom layout element from the DOM
    if (layoutElem && layoutElem.parentNode) {
      layoutElem.parentNode.removeChild(layoutElem);
    }
    // Remove any existing notification
    const notification = document.querySelector('.screenshot-notification');
    if (notification) {
      notification.remove();
    }
    
    // Convert canvas to image
    const imageData = canvas.toDataURL('image/png');
    
    // --- FIX: ClipboardItem feature detection for form screenshot ---
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function') {
      canvas.toBlob(function(blob) {
        try {
          const item = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([item]).then(
            () => {
              showNotification('フォームのスクリーンショットがコピーされました。');
            },
            (err) => {
              console.error('Could not copy form screenshot to clipboard: ', err);
              showNotification('フォームの画像をクリップボードにコピーできません。');
            }
          );
        } catch (err) {
          console.error('ClipboardItem not supported or other clipboard error: ', err);
          showNotification('Copy to clipboard not supported in this browser.');
        }
      });
    } else {
      showNotification('このブラウザは画像のクリップボードコピーに対応していません。');
    }
    
    // Show preview
    showScreenshotPreview(imageData);
  }).catch(error => {
    console.error('Error capturing form screenshot:', error);
    
    // Show error notification
    if (typeof window.showNotification === 'function') {
      window.showNotification('Failed to capture form', 2000);
    }
  });
}

// Clean up and enhance content for screenshot
function cleanupAndEnhanceContent(element) {
  if (!element) return;
  
  // Hide buttons that shouldn't be visible in screenshot
  const buttonsToHide = element.querySelectorAll(
    '.btn-close, .close, .cancel-btn, .form-screenshot-button'
  );
  
  buttonsToHide.forEach(button => {
    if (button.style) {
      button.style.display = 'none';
    }
  });
  
  // Convert interactive elements to static representations
  convertInteractiveElements(element);
  
  return element;
}

// Convert interactive elements to static representations for screenshots
function convertInteractiveElements(container) {
  if (!container) return;
  
  // Convert select elements
  const selects = container.querySelectorAll('select');
  selects.forEach(select => {
    const selectedOption = select.options[select.selectedIndex];
    const text = selectedOption ? selectedOption.textContent : '';
    
    // Create a div to replace the select
    const div = document.createElement('div');
    div.className = select.className;
    div.classList.add('select-replacement');
    div.style.border = '1px solid var(--color-gray-300)';
    div.style.borderRadius = '4px';
    div.style.padding = '6px 12px';
    div.style.backgroundColor = 'var(--color-gray-100)';
    div.textContent = text;
    
    // Replace select with div
    if (select.parentNode) {
      select.parentNode.insertBefore(div, select);
      select.style.display = 'none';
    }
  });
  
  // Convert checkboxes and radio buttons
  const checkables = container.querySelectorAll('input[type="checkbox"], input[type="radio"]');
  checkables.forEach(input => {
    const isChecked = input.checked;
    
    // Create replacement span
    const span = document.createElement('span');
    span.className = 'checkable-replacement';
    span.style.display = 'inline-block';
    span.style.width = '18px';
    span.style.height = '18px';
    span.style.border = '1px solid var(--color-gray-300)';
    span.style.borderRadius = input.type === 'radio' ? '50%' : '3px';
    span.style.backgroundColor = 'var(--color-white)';
    span.style.position = 'relative';
    
    // Add check mark if checked
    if (isChecked) {
      const inner = document.createElement('span');
      inner.style.position = 'absolute';
      inner.style.top = '50%';
      inner.style.left = '50%';
      inner.style.transform = 'translate(-50%, -50%)';
      inner.style.width = '10px';
      inner.style.height = '10px';
      inner.style.backgroundColor = 'var(--color-primary)';
      inner.style.borderRadius = input.type === 'radio' ? '50%' : '1px';
      
      span.appendChild(inner);
    }
    
    // Replace input with span
    if (input.parentNode) {
      input.parentNode.insertBefore(span, input);
      input.style.display = 'none';
    }
  });
  
  // Convert textareas
  const textareas = container.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    const div = document.createElement('div');
    div.className = textarea.className;
    div.classList.add('textarea-replacement');
    div.style.border = '1px solid var(--color-gray-300)';
    div.style.borderRadius = '4px';
    div.style.padding = '8px 12px';
    div.style.backgroundColor = 'var(--color-white)';
    div.style.minHeight = '80px';
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = textarea.value;
    
    // Replace textarea with div
    if (textarea.parentNode) {
      textarea.parentNode.insertBefore(div, textarea);
      textarea.style.display = 'none';
    }
  });
}

// Build a custom layout showing only total, project list, tasks, and work hours.
function buildScreenshotLayout(element) {
  const container = document.createElement('div');
  container.style.padding = '32px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#333333';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  container.style.borderRadius = '8px';
  container.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
  container.style.maxWidth = '900px';

  // Total sum
  const sumElem = element.querySelector('.man-hour-sum');
  const totalText = sumElem ? sumElem.textContent : '';
  const totalDiv = document.createElement('div');
  
  // Create a nicer header with logo and total
  const headerDiv = document.createElement('div');
  headerDiv.style.display = 'flex';
  headerDiv.style.justifyContent = 'space-between';
  headerDiv.style.alignItems = 'center';
  headerDiv.style.marginBottom = '24px';
  headerDiv.style.borderBottom = '1px solid #eaeaea';
  headerDiv.style.paddingBottom = '20px';
  
  // Add title
  const titleDiv = document.createElement('div');
  titleDiv.textContent = '工数レポート';
  titleDiv.style.fontSize = '20px';
  titleDiv.style.fontWeight = '600';
  titleDiv.style.color = '#1a73e8';
  
  // Style the total text
  totalDiv.textContent = totalText;
  totalDiv.style.fontSize = '26px';
  totalDiv.style.fontWeight = 'bold';
  totalDiv.style.color = '#1a73e8';
  totalDiv.style.padding = '6px 16px';
  totalDiv.style.backgroundColor = '#f1f8ff';
  totalDiv.style.borderRadius = '6px';
  
  // Add to header
  headerDiv.appendChild(titleDiv);
  headerDiv.appendChild(totalDiv);
  container.appendChild(headerDiv);

  // Create grid layout
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '4fr 1fr 0.8fr';
  grid.style.gap = '0';
  grid.style.borderRadius = '8px';
  grid.style.overflow = 'hidden';
  grid.style.border = '1px solid #eaeaea';
  grid.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';

  // Add headers
  const headerBgColors = ['#f6f8fa', '#f0f4f9', '#ebf1f5'];
  let i = 0;
  ['プロジェクト一覧', 'タスク', '工数'].forEach(headerText => {
    const headerCell = document.createElement('div');
    headerCell.textContent = headerText;
    headerCell.style.fontSize = '14px';
    headerCell.style.fontWeight = '600';
    headerCell.style.backgroundColor = headerBgColors[i++];
    headerCell.style.color = '#3c4043';
    headerCell.style.padding = '12px 16px';
    headerCell.style.borderBottom = '1px solid #eaeaea';
    grid.appendChild(headerCell);
  });

  let rowIndex = 0;
  // Add data rows by iterating each man-hour table row
  const rows = element.querySelectorAll('table.man-hour-table-edit tbody tr, table.jbc-table tbody tr');
  rows.forEach(row => {
    // Skip rows without content
    const hasInputs = row.querySelector('input, select');
    if (!hasInputs) return;
    
    // Project name: prefer custom-select-wrapper, fallback to select-replacement or raw select
    let projectText = '';
    const customProj = row.querySelector('.custom-select-wrapper.project-select .select-display');
    if (customProj) {
      projectText = customProj.textContent.trim();
    } else {
      const repProj = row.querySelector('.select-replacement');
      if (repProj) projectText = repProj.textContent.trim();
      else {
        const selProj = row.querySelector('select[name*="project"]');
        projectText = selProj?.selectedOptions[0]?.textContent.trim() || '';
      }
    }
    // Task name: similar fallback
    let taskText = '';
    const customTask = row.querySelector('.custom-select-wrapper.task-select .select-display');
    if (customTask) {
      taskText = customTask.textContent.trim();
    } else {
      const repTask = row.querySelectorAll('.select-replacement')[1];
      if (repTask) taskText = repTask.textContent.trim();
      else {
        const selTask = row.querySelector('select[name*="task"]');
        taskText = selTask?.selectedOptions[0]?.textContent.trim() || '';
      }
    }
    // Work hours input
    const workInput = row.querySelector('input.man-hour-input[name="minutes[]"]');
    const workText = workInput?.value.trim() || '';
    
    if (!projectText && !taskText && !workText) return;
    
    const rowBgColor = rowIndex % 2 === 0 ? '#ffffff' : '#f9fafc';
    rowIndex++;
    
    [projectText, taskText, workText].forEach((text, index) => {
      const cell = document.createElement('div');
      cell.textContent = text;
      cell.style.fontSize = '14px';
      cell.style.padding = '12px 16px';
      cell.style.borderBottom = '1px solid #eaeaea';
      cell.style.backgroundColor = rowBgColor;
      cell.style.color = index === 2 ? '#137333' : '#202124';
      
      if (index === 0) {
        cell.style.fontWeight = '500';
      } else if (index === 2) { // Work hours
        cell.style.fontWeight = '600';
        cell.style.textAlign = 'center';
      }
      grid.appendChild(cell);
    });
  });

  // Add date at the bottom
  const footerDiv = document.createElement('div');
  footerDiv.style.marginTop = '16px';
  footerDiv.style.fontSize = '12px';
  footerDiv.style.color = '#5f6368';
  footerDiv.style.textAlign = 'right';
  footerDiv.textContent = `作成日時: ${new Date().toLocaleString('ja-JP')}`;
  
  container.appendChild(grid);
  container.appendChild(footerDiv);
  return container;
}

// Expose the functions globally
window.registerFloatingAction = registerFloatingAction;
window.closeFloatingActionMenu = closeFloatingActionMenu;
window.setupScreenshotButton = setupScreenshotButton;
window.addFormScreenshotButton = addFormScreenshotButton; 
