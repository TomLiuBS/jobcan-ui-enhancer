// scripts/clock.js

// Constants for colors and styles
const COLORS = {
  primary: {
    gradient: 'linear-gradient(135deg, var(--color-primary-darker) 0%, var(--color-primary) 100%)',
    solid: 'var(--color-primary)',
    shadow: 'var(--shadow-primary)'
  },
  working: {
    gradient: 'linear-gradient(135deg, var(--color-primary-darker) 0%, var(--color-primary) 100%)',
    colon: 'var(--color-primary)'
  },
  notWorking: {
    gradient: 'linear-gradient(135deg, var(--color-gray-600) 0%, var(--color-gray-700) 100%)',
    colon: 'var(--color-gray-600)'
  },
  progress: {
    complete: {
      color: 'var(--color-success)',
      shadow: 'var(--shadow-success, 0 0 8px var(--color-success-border))'
    },
    good: {
      color: 'var(--color-info, #17a2b8)',
      shadow: 'var(--shadow-info, 0 0 8px var(--color-info-border, rgba(23, 162, 184, 0.3)))'
    },
    halfway: {
      color: 'var(--color-warning)',
      shadow: 'var(--shadow-warning, 0 0 8px var(--color-warning-border))'
    },
    starting: {
      color: 'var(--color-orange, var(--color-warning))',
      shadow: 'var(--shadow-orange, 0 0 8px var(--color-warning-border))'
    },
    inactive: {
      color: 'var(--color-black-70)',
      shadow: 'none'
    }
  },
  timeIndicator: {
    color: 'var(--color-danger)',
    shadow: {
      normal: 'var(--shadow-danger-sm, 0 0 4px var(--color-danger-border))',
      pulse: 'var(--shadow-danger, 0 0 8px var(--color-danger-border))'
    }
  }
};

// Work hours configuration
const WORK_HOURS = {
  start: 6,   // 06:00
  end: 24,    // 24:00
  get totalMinutes() {
    return (this.end - this.start) * 60;
  }
};

// Animation durations
const ANIMATION = {
  flip: 600, // Slightly longer for smoother animation
  pulse: 2000,
  transition: 300, // Slightly longer for smoother transitions
  progressBar: 800 // New animation duration for progress bar
};

// Initialize flip clock and progress bar
function setupFlipClock() {
  // Find clock elements
  const clockElements = document.querySelectorAll('#clock, #display-time, .display-2 > div:not(.flip-clock-container)');
  clockElements.forEach(clockElement => {
    if (clockElement.dataset.enhanced === 'true') return;
    clockElement.dataset.enhanced = 'true';
    createSelfAnimatingClock(clockElement);
  });
  
  // Add animation styles to the document
  addFlipClockStyles();

  if (!window.__jbe_punchStorageListenerInited && chrome?.storage?.onChanged) {
    window.__jbe_punchStorageListenerInited = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.jobcanPunchListData) return;
      document.querySelectorAll('.flip-clock-container').forEach((container) => {
        refreshPunchMarkers(container, true);
      });
    });
  }
}

// Add required styles for enhanced animations
function addFlipClockStyles() {
  if (document.getElementById('enhanced-flip-clock-styles')) return;
  
  const styleEl = document.createElement('style');
  styleEl.id = 'enhanced-flip-clock-styles';
  styleEl.textContent = `

    
    .flip-card.flipping {
      animation: flipAnimationOptimized ${ANIMATION.flip}ms cubic-bezier(0.455, 0.03, 0.515, 0.955) forwards;
    }
    
    .work-progress-fill {
      transition: width ${ANIMATION.progressBar}ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .time-scale-marker {
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 500ms ease, transform 500ms ease;
    }
    
    .time-scale-marker.visible {
      opacity: 1;
      transform: scale(1);
    }
    
    .work-progress-indicator {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: var(--color-danger);
      box-shadow: 0 0 5px rgba(220, 53, 69, 0.5);
      z-index: 3;
      transition: left ${ANIMATION.progressBar}ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .work-progress-indicator::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: white;
    }

    .work-punch-marker {
      position: absolute;
      top: 50%;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      z-index: 4;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.85);
      pointer-events: auto;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .work-punch-marker:hover {
      transform: translate(-50%, -50%) scale(1.15);
      box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
    }
    
    .colon {
      animation: colonPulseOptimized 2s infinite;
      opacity: 1;
    }

    /* Clock status color classes */
    .flip-clock-digit.style-gradient .flip-card-front,
    .flip-clock-digit.style-gradient .flip-card-back {
      background: linear-gradient(135deg, var(--color-primary-darker) 0%, var(--color-primary) 100%) !important;
    }
    .flip-clock-digit.style-working .flip-card-front,
    .flip-clock-digit.style-working .flip-card-back {
      background: linear-gradient(135deg, var(--color-primary-darker) 0%, var(--color-primary) 100%) !important;
    }
    .flip-clock-digit.style-not-working .flip-card-front,
    .flip-clock-digit.style-not-working .flip-card-back {
      background: linear-gradient(135deg, var(--color-gray-600) 0%, var(--color-gray-700) 100%) !important;
    }

    /* Colon colors based on status */
    .colon-default { color: var(--color-clock-text, white) !important; }
    .colon-working { color: var(--color-primary) !important; }
    .colon-not-working { color: var(--color-gray-600) !important; }

    /* Clock celebration effect */
    .flip-clock-container.celebrating {
      animation: clockCelebrate 0.6s ease-out;
    }

    @keyframes clockCelebrate {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
  `;
  
  document.head.appendChild(styleEl);
}

// Create a new self-animating clock that's more efficient
function createSelfAnimatingClock(clockElement) {
  const parentElement = clockElement.parentElement;
  if (!parentElement) return;
  
  // Clean up any existing clock containers in this parent
  const existingContainers = parentElement.querySelectorAll('.flip-clock-container');
  existingContainers.forEach(container => {
    cleanupClockContainer(container);
    container.remove();
  });
  
  const flipClockContainer = document.createElement('div');
  flipClockContainer.className = 'flip-clock-container';
  const clockDigitsContainer = document.createElement('div');
  clockDigitsContainer.className = 'flip-clock-digits-container';
  flipClockContainer.appendChild(clockDigitsContainer);
  const progressContainer = document.createElement('div');
  progressContainer.className = 'work-progress-container';
  const progressTrack = document.createElement('div');
  progressTrack.className = 'work-progress-track';
  const progressFill = document.createElement('div');
  progressFill.className = 'work-progress-fill';
  progressTrack.appendChild(progressFill);
  
  // Moving progress indicator
  const progressIndicator = document.createElement('div');
  progressIndicator.className = 'work-progress-indicator';
  progressTrack.appendChild(progressIndicator);
  
  const createTimeMarker = (percent, time) => {
    const marker = document.createElement('div');
    marker.className = `time-scale-marker marker-position-${percent}`;
    marker.title = time;
    marker.style.position = 'absolute';
    marker.style.left = `${percent}%`;
    marker.style.top = '-1px';
    marker.style.width = '1px';
    marker.style.height = '10px';
    marker.style.backgroundColor = 'var(--color-black-40)';
    marker.style.opacity = '0.45';
    marker.style.borderRadius = '999px';
    return marker;
  };
  
  progressTrack.appendChild(createTimeMarker(0, '06:00'));
  progressTrack.appendChild(createTimeMarker(16.67, '09:00'));
  progressTrack.appendChild(createTimeMarker(33.33, '12:00'));
  progressTrack.appendChild(createTimeMarker(50, '15:00'));
  progressTrack.appendChild(createTimeMarker(66.67, '18:00'));
  progressTrack.appendChild(createTimeMarker(83.33, '21:00'));
  progressTrack.appendChild(createTimeMarker(100, '24:00'));
  
  // Fade in markers sequentially with delay
  setTimeout(() => {
    const markers = progressTrack.querySelectorAll('.time-scale-marker');
    markers.forEach((marker, index) => {
      setTimeout(() => {
        marker.classList.add('visible');
      }, index * 150);
    });
  }, 500);
  
  const startMarker = document.createElement('div');
  startMarker.className = 'work-progress-marker start-marker';
  const endMarker = document.createElement('div');
  endMarker.className = 'work-progress-marker end-marker';
  const percentageIndicator = document.createElement('div');
  percentageIndicator.className = 'work-progress-percentage';
  progressContainer.appendChild(progressTrack);
  progressContainer.appendChild(percentageIndicator);
  chrome.storage.sync.get(['showProgressBar'], function(result) {
    const showProgressBar = result.showProgressBar !== false;
    progressContainer.classList.toggle('hidden', !showProgressBar);
  });
  flipClockContainer.appendChild(progressContainer);
  const initialTime = clockElement.textContent.trim();
  flipClockContainer.dataset.clockTime = initialTime;
  flipClockContainer.dataset.lastUpdated = Date.now().toString();
  setupSelfAnimatingClockDigits(clockDigitsContainer, initialTime);
  parentElement.appendChild(flipClockContainer);
  syncProgressContainerWidth(flipClockContainer);
  // Initial color sync (apply working status color on load)
  updateFlipClockColors(flipClockContainer);
  // Start self-updating clock (optimized)
  startSelfUpdatingClock(flipClockContainer);
  refreshPunchMarkers(flipClockContainer, true);
  triggerPunchListRefresh();
  updateWorkProgressBar(flipClockContainer);
  
  // Optimized progress bar updates - every 30 seconds instead of every minute
  const progressInterval = setInterval(() => {
    if (!document.body.contains(flipClockContainer)) { 
      clearInterval(progressInterval); 
      return; 
    }
    updateWorkProgressBar(flipClockContainer);
  }, 30000); // Update every 30 seconds for better responsiveness
  
  flipClockContainer.dataset.progressIntervalId = progressInterval;
}

// Cleanup function to prevent memory leaks
function cleanupClockContainer(container) {
  // Clear update interval
  const updateIntervalId = container.dataset.updateIntervalId;
  if (updateIntervalId) {
    clearInterval(parseInt(updateIntervalId));
  }
  
  // Clear progress interval
  const progressIntervalId = container.dataset.progressIntervalId;
  if (progressIntervalId) {
    clearInterval(parseInt(progressIntervalId));
  }
  
  // Clear any cached elements
  const progressContainer = container.querySelector('.work-progress-container');
  if (progressContainer && progressContainer._cachedElements) {
    delete progressContainer._cachedElements;
  }
}

// Setup a self-animating clock that updates digits automatically
function setupSelfAnimatingClockDigits(container, timeString) {
  container.innerHTML = '';
  const normalizedTime = normalizeTimeFormat(timeString);
  for (let i = 0; i < normalizedTime.length; i++) {
    const char = normalizedTime[i];
    if (char === ':') {
      const colonElement = document.createElement('div');
      colonElement.className = 'colon';
      colonElement.textContent = ':';
      if (i >= 5) colonElement.dataset.position = 'seconds-colon';
      container.appendChild(colonElement);
    } else {
      const digitElement = createSelfAnimatingDigit(char);
      if (i >= 6) digitElement.dataset.position = 'seconds';
      digitElement.dataset.index = i;
      container.appendChild(digitElement);
    }
  }
  setTimeout(() => applyClockSettings(container.parentElement), 0);
}

// Create a self-animating digit element
function createSelfAnimatingDigit(digit) {
  const digitElement = document.createElement('div');
  digitElement.className = 'flip-clock-digit self-animating';
  digitElement.dataset.currentValue = digit;
  digitElement.dataset.nextValue = digit;
  const flipCard = document.createElement('div');
  flipCard.className = 'flip-card';
  const flipCardFront = document.createElement('div');
  flipCardFront.className = 'flip-card-front';
  flipCardFront.textContent = digit;
  const flipCardBack = document.createElement('div');
  flipCardBack.className = 'flip-card-back';
  flipCardBack.textContent = digit;
  digitElement.style.position = 'relative';
  digitElement.style.width = '80px';
  digitElement.style.height = '120px';
  digitElement.style.margin = '0 4px';
  digitElement.style.perspective = '1000px'; // Increased perspective for more dramatic effect
  flipCard.style.position = 'relative';
  flipCard.style.width = '100%';
  flipCard.style.height = '100%';
  flipCard.style.transformStyle = 'preserve-3d';
  // Removed transition as we're using animation now
  flipCardFront.style.position = 'absolute';
  flipCardFront.style.width = '100%';
  flipCardFront.style.height = '100%';
  flipCardFront.style.backfaceVisibility = 'hidden';
  flipCardFront.style.display = 'flex';
  flipCardFront.style.alignItems = 'center';
  flipCardFront.style.justifyContent = 'center';
  flipCardFront.style.background = 'linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)';
  flipCardFront.style.color = 'var(--color-clock-text, white)';
  flipCardFront.style.fontSize = '3.5rem';
  flipCardFront.style.fontWeight = 'bold';
  flipCardFront.style.borderRadius = '8px';
  flipCardFront.style.boxShadow = 'var(--shadow-sm)';
  flipCardBack.style.position = 'absolute';
  flipCardBack.style.width = '100%';
  flipCardBack.style.height = '100%';
  flipCardBack.style.backfaceVisibility = 'hidden';
  flipCardBack.style.display = 'flex';
  flipCardBack.style.alignItems = 'center';
  flipCardBack.style.justifyContent = 'center';
  flipCardBack.style.background = 'linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)';
  flipCardBack.style.color = 'var(--color-clock-text, white)';
  flipCardBack.style.fontSize = '3.5rem';
  flipCardBack.style.fontWeight = 'bold';
  flipCardBack.style.transform = 'rotateX(180deg)';
  flipCardBack.style.borderRadius = '8px';
  flipCardBack.style.boxShadow = 'var(--shadow-sm)';
  flipCard.appendChild(flipCardFront);
  flipCard.appendChild(flipCardBack);
  digitElement.appendChild(flipCard);
  return digitElement;
}

// Begin optimized self-updating clock function
function startSelfUpdatingClock(container) {
  const now = new Date();
  const currentTimeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  container.dataset.systemTime = now.getTime().toString();
  container.dataset.displayTime = currentTimeStr;
  
  // Cache DOM elements to avoid repeated queries
  const digitsContainer = container.querySelector('.flip-clock-digits-container');
  if (!digitsContainer) return;
  
  const digitElements = Array.from(digitsContainer.querySelectorAll('.flip-clock-digit'));
  const cachedElements = digitElements.map(el => ({
    element: el,
    flipCard: el.querySelector('.flip-card'),
    front: el.querySelector('.flip-card-front'),
    back: el.querySelector('.flip-card-back'),
    currentValue: el.dataset.currentValue,
    isAnimating: false
  }));
  
  // Use setInterval for more efficient updates - only run when needed
  let updateInterval = setInterval(() => {
    if (!document.body.contains(container)) {
      clearInterval(updateInterval);
      return;
    }
    
    const now = new Date();
    const hours = String(now.getHours()).padStart(2,'0');
    const minutes = String(now.getMinutes()).padStart(2,'0');
    const seconds = String(now.getSeconds()).padStart(2,'0');
    const newTimeStr = `${hours}:${minutes}:${seconds}`;
    
    // Only update if time actually changed
    if (newTimeStr !== container.dataset.displayTime) {
      container.dataset.displayTime = newTimeStr;
      
      const newParts = normalizeTimeFormat(newTimeStr).split('').filter(char => char !== ':');
      
      // Batch DOM updates
      for (let i = 0; i < Math.min(newParts.length, cachedElements.length); i++) {
        const newDigit = newParts[i];
        const cached = cachedElements[i];
        
        if (cached.currentValue !== newDigit && !cached.isAnimating) {
          animateDigitChangeOptimized(cached, newDigit);
        }
      }
    }
  }, 1000); // Update every second instead of every frame
  
  // Store interval ID for cleanup
  container.dataset.updateIntervalId = updateInterval;
}

// Optimized animation function with reduced reflows
function animateDigitChangeOptimized(cachedDigit, newDigit) {
  if (cachedDigit.isAnimating || !cachedDigit.flipCard) return;
  
  cachedDigit.isAnimating = true;
  
  // Update back face with new digit
  if (cachedDigit.back) {
    cachedDigit.back.textContent = newDigit;
  }
  
  // Use CSS animation instead of multiple class changes
  cachedDigit.flipCard.style.animation = 'flipAnimationOptimized 0.6s cubic-bezier(0.455, 0.03, 0.515, 0.955) forwards';
  
  // Complete animation after duration
  setTimeout(() => {
    // Update front face
    if (cachedDigit.front) {
      cachedDigit.front.textContent = newDigit;
    }
    
    // Reset animation
    cachedDigit.flipCard.style.animation = '';
    cachedDigit.flipCard.style.transform = 'rotateX(0deg)';
    
    // Update cached value and state
    cachedDigit.currentValue = newDigit;
    cachedDigit.element.dataset.currentValue = newDigit;
    cachedDigit.isAnimating = false;
  }, 600);
}

// Optimized work progress bar update with cached elements
function updateWorkProgressBar(container) {
  const progressContainer = container.querySelector('.work-progress-container'); 
  if (!progressContainer) return;
  
  // Cache elements if not already cached
  if (!progressContainer._cachedElements) {
    progressContainer._cachedElements = {
      track: progressContainer.querySelector('.work-progress-track'),
      fill: progressContainer.querySelector('.work-progress-fill'),
      indicator: progressContainer.querySelector('.work-progress-indicator'),
      percentage: progressContainer.querySelector('.work-progress-percentage')
    };
  }
  
  const { track, fill, indicator, percentage } = progressContainer._cachedElements;
  if (!fill || !percentage) return;
  
  const now = new Date(); 
  const currentMinOfDay = now.getHours() * 60 + now.getMinutes();
  const startMinutes = WORK_HOURS.start * 60; 
  const endMinutes = WORK_HOURS.end * 60;
  
  let progress = 0; 
  let statusText = ''; 
  let stateClass = '';
  
  if (currentMinOfDay < startMinutes) { 
    progress = 0; 
    const minutesUntilStart = startMinutes - currentMinOfDay; 
    statusText = `出勤時間まで ${Math.floor(minutesUntilStart/60)}時間${minutesUntilStart%60}分`; 
    stateClass = 'progress-state-inactive'; 
  }
  else if (currentMinOfDay >= endMinutes) { 
    progress = 100; 
    const minutesAfterEnd = currentMinOfDay - endMinutes; 
    statusText = `${now.toTimeString().slice(0,5)} • 定時は (${Math.floor(minutesAfterEnd/60)}時間 ${minutesAfterEnd%60}分 前)`; 
    stateClass = 'progress-state-complete'; 
  }
  else { 
    progress = Math.min(100, ((currentMinOfDay - startMinutes) / WORK_HOURS.totalMinutes) * 100); 
    const remainingMinutes = WORK_HOURS.totalMinutes - (currentMinOfDay - startMinutes); 
    statusText = `${now.toTimeString().slice(0,5)} • ${progress.toFixed(1)}% 経過 • 残り： ${Math.floor(remainingMinutes/60)}時間 ${remainingMinutes%60}分`; 
    
    if (progress >= 90) 
      stateClass = 'progress-state-complete'; 
    else if (progress >= 75) 
      stateClass = 'progress-state-good'; 
    else if (progress >= 50) 
      stateClass = 'progress-state-halfway'; 
    else 
      stateClass = 'progress-state-starting'; 
  }
  
  // Batch DOM updates to avoid multiple reflows
  requestAnimationFrame(() => {
    // Update state class only if changed
    const currentStateClass = fill.className.split(' ').find(cls => cls.startsWith('progress-state-'));
    if (currentStateClass !== stateClass) {
      // Remove all state classes efficiently
      fill.className = fill.className.replace(/progress-state-\w+/g, '');
      if (stateClass) {
        fill.classList.add(stateClass);
      }
    }
    
    // Update progress fill width
    fill.style.width = `${progress}%`;
    
    // Update indicator position if it exists
    if (indicator) {
      indicator.style.left = `${progress}%`;
      
      // Toggle pulse animation for near end of day
      const shouldPulse = progress >= 90 && progress < 100;
      indicator.classList.toggle('pulse-animation', shouldPulse);
    }
    
    // Update text content
    renderProgressText(percentage, statusText);
  });

  refreshPunchMarkers(container, false);
}

function renderProgressText(percentageElement, statusText) {
  if (!percentageElement) return;
  percentageElement.innerHTML = '';

  const startLabel = document.createElement('span');
  startLabel.className = 'work-progress-inline-label start';
  startLabel.textContent = '06:00';

  const center = document.createElement('span');
  center.className = 'work-progress-inline-status';
  center.textContent = statusText;

  const endLabel = document.createElement('span');
  endLabel.className = 'work-progress-inline-label end';
  endLabel.textContent = '24:00';

  percentageElement.appendChild(startLabel);
  percentageElement.appendChild(center);
  percentageElement.appendChild(endLabel);
}

function formatHourLabel(hour) {
  if (hour === 24) return '24:00';
  return `${String(hour).padStart(2, '0')}:00`;
}

function getTodayDateKeys() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return new Set([
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`,
    `${month}/${day}`,
    `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
  ]);
}

function normalizePunchTime(value) {
  const match = (value || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function parsePunchMinutes(time) {
  const normalized = normalizePunchTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  const total = (hour * 60) + minute;
  const startMinutes = WORK_HOURS.start * 60;
  const endMinutes = WORK_HOURS.end * 60;
  if (total < startMinutes || total > endMinutes) return null;
  return total;
}

function getPunchMarkerColor(type) {
  if ((type || '').includes('入室')) return 'var(--color-success, #28a745)';
  if ((type || '').includes('退室')) return 'var(--color-danger, #dc3545)';
  if ((type || '').includes('出勤')) return 'var(--color-success, #28a745)';
  if ((type || '').includes('退勤')) return 'var(--color-danger, #dc3545)';
  if ((type || '').includes('休憩')) return 'var(--color-warning, #ffc107)';
  return 'var(--color-info, #17a2b8)';
}

function filterTodayPunchEntries(entries) {
  const todayKeys = getTodayDateKeys();
  const withDate = entries.filter((entry) => entry && entry.date && todayKeys.has(entry.date));
  return withDate.length > 0 ? withDate : entries;
}

function renderPunchMarkers(track, entries) {
  if (!track) return;

  track.querySelectorAll('.work-punch-marker').forEach((node) => node.remove());
  if (!Array.isArray(entries) || entries.length === 0) return;

  const startMinutes = WORK_HOURS.start * 60;
  const totalMinutes = WORK_HOURS.totalMinutes;
  const markerMap = new Map();

  entries.forEach((entry) => {
    const time = normalizePunchTime(entry.time);
    const minutes = parsePunchMinutes(time);
    if (!time || minutes === null) return;
    const key = `${time}-${entry.type || ''}`;
    if (markerMap.has(key)) return;
    markerMap.set(key, {
      time,
      type: entry.type || '',
      minutes
    });
  });

  markerMap.forEach((item) => {
    const marker = document.createElement('div');
    marker.className = 'work-punch-marker';
    const percent = ((item.minutes - startMinutes) / totalMinutes) * 100;
    marker.style.left = `${Math.max(0, Math.min(100, percent))}%`;
    marker.style.backgroundColor = getPunchMarkerColor(item.type);
    const markerTitle = `${item.time}${item.type ? ` ${item.type}` : ''}`;
    marker.title = markerTitle;
    marker.dataset.tooltip = markerTitle;
    marker.addEventListener('mouseenter', (e) => {
      showPunchMarkerTooltip(markerTitle, e.clientX, e.clientY);
    });
    marker.addEventListener('mousemove', (e) => {
      showPunchMarkerTooltip(markerTitle, e.clientX, e.clientY);
    });
    marker.addEventListener('mouseleave', hidePunchMarkerTooltip);
    track.appendChild(marker);
  });
}

function getPunchMarkerTooltipElement() {
  let tooltip = document.getElementById('jbe-punch-tooltip');
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.id = 'jbe-punch-tooltip';
  tooltip.className = 'jbe-punch-tooltip';
  document.body.appendChild(tooltip);
  return tooltip;
}

function showPunchMarkerTooltip(text, clientX, clientY) {
  const tooltip = getPunchMarkerTooltipElement();
  tooltip.textContent = text;
  tooltip.classList.add('visible');

  const gap = 12;
  const rect = tooltip.getBoundingClientRect();
  let left = clientX - (rect.width / 2);
  let top = clientY - rect.height - gap;

  if (left < 8) left = 8;
  if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
  if (top < 8) top = clientY + gap;

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function hidePunchMarkerTooltip() {
  const tooltip = document.getElementById('jbe-punch-tooltip');
  if (!tooltip) return;
  tooltip.classList.remove('visible');
}

function refreshPunchMarkers(container, force) {
  const progressContainer = container.querySelector('.work-progress-container');
  const track = progressContainer ? progressContainer.querySelector('.work-progress-track') : null;
  if (!track || !chrome?.storage?.local?.get) return;

  const now = Date.now();
  const lastFetchAt = Number(container.dataset.lastPunchRenderAt || '0');
  if (!force && now - lastFetchAt < 60 * 1000) return;
  container.dataset.lastPunchRenderAt = String(now);

  chrome.storage.local.get(['jobcanPunchListData'], (result) => {
    const payload = result.jobcanPunchListData;
    const entries = payload && Array.isArray(payload.entries) ? payload.entries : [];
    const targetEntries = filterTodayPunchEntries(entries);
    renderPunchMarkers(track, targetEntries);
  });
}

function triggerPunchListRefresh() {
  if (window.__jbe_punchListRefreshRequested) return;
  window.__jbe_punchListRefreshRequested = true;

  if (typeof window.loadPunchListInIframe === 'function') {
    window.loadPunchListInIframe().catch((error) => {
      console.debug('Punch list refresh skipped:', error?.message || error);
    });
  }
}

// Normalize time format to HH:MM:SS
function normalizeTimeFormat(timeString) {
  if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) return timeString;
  const parts = timeString.split(':');
  if (parts.length === 2) return `${parts[0].padStart(2,'0')}:${parts[1].padStart(2,'0')}:00`;
  return '00:00:00';
}

function syncProgressContainerWidth(container) {
  if (!container) return;
  const digitsContainer = container.querySelector('.flip-clock-digits-container');
  const progressContainer = container.querySelector('.work-progress-container');
  if (!digitsContainer || !progressContainer) return;

  const width = Math.ceil(digitsContainer.getBoundingClientRect().width);
  if (!width) return;

  progressContainer.style.width = `${width}px`;
  progressContainer.style.maxWidth = `${width}px`;
}

function applyClockSettingsToContainer(container, settings) {
  const clockSize = settings.clockSize || 'medium';
  const showSeconds = settings.showSeconds !== false;
  const showProgressBar = settings.showProgressBar !== false;

  const digits = container.querySelectorAll('.flip-clock-digit');
  digits.forEach(digit => {
    digit.style.width = clockSize === 'small' ? '60px' : clockSize === 'large' ? '100px' : '80px';
    digit.style.height = clockSize === 'small' ? '90px' : clockSize === 'large' ? '150px' : '120px';
    const fontSize = clockSize === 'small' ? '2.5rem' : clockSize === 'large' ? '4.5rem' : '3.5rem';
    const front = digit.querySelector('.flip-card-front');
    const back = digit.querySelector('.flip-card-back');
    if (front) front.style.fontSize = fontSize;
    if (back) back.style.fontSize = fontSize;

    const isSec = digit.dataset.position === 'seconds' || Number(digit.dataset.index) >= 6;
    if (isSec) {
      digit.style.display = showSeconds ? '' : 'none';
      const prev = digit.previousElementSibling;
      if (prev && prev.classList.contains('colon') && prev.dataset.position === 'seconds-colon') {
        prev.style.display = showSeconds ? '' : 'none';
      }
    }
  });

  container.querySelectorAll('.colon').forEach(col => {
    col.style.height = clockSize === 'small' ? '90px' : clockSize === 'large' ? '150px' : '120px';
    col.style.fontSize = clockSize === 'small' ? '2rem' : clockSize === 'large' ? '4rem' : '3rem';
  });

  const prog = container.querySelector('.work-progress-container');
  if (prog) prog.classList.toggle('hidden', !showProgressBar);

  syncProgressContainerWidth(container);
  updateFlipClockColors(container);
}

// Apply saved clock settings (size, seconds toggle, progress bar visibility)
function applyClockSettings(specificContainer = null) {
  chrome.storage.sync.get(['clockSize', 'showSeconds', 'showProgressBar'], function(result) {
    const containers = specificContainer ? [specificContainer] : document.querySelectorAll('.flip-clock-container');
    containers.forEach((container) => {
      applyClockSettingsToContainer(container, result);
    });
  });
}

function updateClockSettings(settings = {}) {
  chrome.storage.sync.get(['clockSize', 'showSeconds', 'showProgressBar'], function(stored) {
    const merged = {
      clockSize: settings.clockSize ?? stored.clockSize ?? 'medium',
      showSeconds: settings.showSeconds ?? stored.showSeconds,
      showProgressBar: settings.showProgressBar ?? stored.showProgressBar
    };

    document.querySelectorAll('.flip-clock-container').forEach((container) => {
      applyClockSettingsToContainer(container, merged);
    });
  });
}

// Setup standard flip clock digits
function setupFlipClockDigits(container, timeString) {
  container.innerHTML = '';
  
  const normalizedTime = normalizeTimeFormat(timeString);
  const timeChars = normalizedTime.split('');
  
  for (let i = 0; i < timeChars.length; i++) {
    const char = timeChars[i];
    
    if (char === ':') {
      const colonElement = document.createElement('div');
      colonElement.className = 'colon';
      colonElement.textContent = ':';
      container.appendChild(colonElement);
    } else {
      const digitElement = createFlipDigit(char);
      container.appendChild(digitElement);
    }
  }
}

// Create a basic time display without animation
function createDefaultTimeDisplay(container, timeString) {
  container.innerHTML = '';
  
  const timeDiv = document.createElement('div');
  timeDiv.className = 'default-time-display';
  timeDiv.textContent = timeString;
  timeDiv.style.fontSize = '3rem';
  timeDiv.style.fontWeight = 'bold';
  timeDiv.style.color = 'var(--color-clock-text, white)';
  timeDiv.style.textAlign = 'center';
  timeDiv.style.padding = '15px';
  timeDiv.style.background = 'linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)';
  timeDiv.style.borderRadius = '8px';
  timeDiv.style.boxShadow = 'var(--shadow-sm)';
  
  container.appendChild(timeDiv);
}

// Create a standard flip digit element
function createFlipDigit(digit) {
  const digitElement = document.createElement('div');
  digitElement.className = 'flip-clock-digit';
  digitElement.dataset.value = digit;
  
  // Create flip-card structure
  const cardElement = document.createElement('div');
  cardElement.className = 'flip-card';
  
  // Create front face
  const frontElement = document.createElement('div');
  frontElement.className = 'flip-card-front';
  frontElement.textContent = digit;
  
  // Create back face
  const backElement = document.createElement('div');
  backElement.className = 'flip-card-back';
  backElement.textContent = digit;
  
  // Style the digit element
  digitElement.style.position = 'relative';
  digitElement.style.width = '80px';
  digitElement.style.height = '120px';
  digitElement.style.margin = '0 4px';
  digitElement.style.perspective = '800px';
  
  // Style the card
  cardElement.style.position = 'relative';
  cardElement.style.width = '100%';
  cardElement.style.height = '100%';
  cardElement.style.transformStyle = 'preserve-3d';
  
  // Style front face
  frontElement.style.position = 'absolute';
  frontElement.style.width = '100%';
  frontElement.style.height = '100%';
  frontElement.style.backfaceVisibility = 'hidden';
  frontElement.style.display = 'flex';
  frontElement.style.alignItems = 'center';
  frontElement.style.justifyContent = 'center';
  frontElement.style.background = 'linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)';
  frontElement.style.color = 'var(--color-clock-text, white)';
  frontElement.style.fontSize = '3.5rem';
  frontElement.style.fontWeight = 'bold';
  frontElement.style.borderRadius = '8px';
  frontElement.style.boxShadow = 'var(--shadow-sm)';
  
  // Style back face
  backElement.style.position = 'absolute';
  backElement.style.width = '100%';
  backElement.style.height = '100%';
  backElement.style.backfaceVisibility = 'hidden';
  backElement.style.display = 'flex';
  backElement.style.alignItems = 'center';
  backElement.style.justifyContent = 'center';
  backElement.style.background = 'linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)';
  backElement.style.color = 'var(--color-clock-text, white)';
  backElement.style.fontSize = '3.5rem';
  backElement.style.fontWeight = 'bold';
  backElement.style.transform = 'rotateX(180deg)';
  backElement.style.borderRadius = '8px';
  backElement.style.boxShadow = 'var(--shadow-sm)';
  
  // Assemble the elements
  cardElement.appendChild(frontElement);
  cardElement.appendChild(backElement);
  digitElement.appendChild(cardElement);
  
  return digitElement;
}

// New function to determine working status colors and update the clock
function updateFlipClockColors(container) {
  // Remember previously applied color to detect changes
  const previousColorClass = container?.dataset?.clockColorClass || '';
  // Get current working status
  const workingStatus = document.getElementById('working_status');
  let colorClass = 'style-gradient'; // Default style
  
  if (workingStatus) {
    const statusText = workingStatus.textContent.trim().toLowerCase();
    if (statusText.includes('勤務中') || statusText.includes('working')) {
      // Working - blue gradient
      colorClass = 'style-working';
    } else if (statusText.includes('退室中') || statusText.includes('未出勤') || statusText.includes('Not Arrived')) {
      // Left - grey gradient
      colorClass = 'style-not-working';
    }
  }
  
  // Find the digits container
  const digitsContainer = container.querySelector('.flip-clock-digits-container');
  if (!digitsContainer) return;
  
  // Update digit colors by changing classes
  const digitElements = digitsContainer.querySelectorAll('.flip-clock-digit');
  digitElements.forEach(digit => {
    // Remove existing style classes
    digit.classList.remove('style-gradient', 'style-working', 'style-not-working');
    // Apply the new class
    digit.classList.add(colorClass);
  });
  
  // Update colon colors by class
  const colonElements = digitsContainer.querySelectorAll('.colon');
  colonElements.forEach(colon => {
    // Remove existing style classes
    colon.classList.remove('colon-default', 'colon-working', 'colon-not-working');
    // Apply the matching colon class
    const colonClass = colorClass.replace('style-', 'colon-');
    colon.classList.add(colonClass || 'colon-default');
  });

  // Persist the applied color class
  const isFirstInitialization = !previousColorClass;
  const hasColorChanged = previousColorClass && previousColorClass !== colorClass;
  container.dataset.clockColorClass = colorClass;

  // Trigger confetti effects only when the color actually changes (not on first init)
  if (hasColorChanged) {
    // Use a slight delay to ensure DOM class updates are painted before effects
    setTimeout(() => {
      createParticleEffect(container);
      setTimeout(() => {
        createBurstParticleEffect(container);
      }, 200);
    }, 50);
  }
}

// Helper function for random values
function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

// Create confetti effects around the clock
function createParticleEffect(clockContainer) {
  if (!clockContainer) return;
  
  // Check if confetti is available
  if (typeof confetti === 'undefined') {
    console.warn('Confetti library not loaded');
    return;
  }
  
  // Get the position of the clock container relative to the viewport
  const clockRect = clockContainer.getBoundingClientRect();
  const originX = (clockRect.left + clockRect.width / 2) / window.innerWidth;
  const originY = (clockRect.top + clockRect.height / 2) / window.innerHeight;
  
  // Trigger confetti with random direction
  confetti({
    angle: randomInRange(55, 125),
    spread: randomInRange(50, 70),
    particleCount: randomInRange(50, 100),
    origin: { x: originX, y: originY },
    colors: ['#0066DD', '#28A745', '#FFC107', '#DC3545', '#17A2B8', '#6F42C1'],
    ticks: 200,
    gravity: 1,
    decay: 0.94,
    startVelocity: 30,
    shapes: ['circle', 'square'],
    scalar: 1
  });
  
  // Add celebration effect to the clock
  clockContainer.classList.add('celebrating');
  
  // Remove celebration class after animation
  setTimeout(() => {
    clockContainer.classList.remove('celebrating');
  }, 600);
}

// Enhanced confetti effect with burst animation
function createBurstParticleEffect(clockContainer) {
  if (!clockContainer) return;
  
  // Check if confetti is available
  if (typeof confetti === 'undefined') {
    console.warn('Confetti library not loaded');
    return;
  }
  
  // Get the position of the clock container relative to the viewport
  const clockRect = clockContainer.getBoundingClientRect();
  const originX = (clockRect.left + clockRect.width / 2) / window.innerWidth;
  const originY = (clockRect.top + clockRect.height / 2) / window.innerHeight;
  
  // Create burst effect with multiple random confetti bursts
  const burstCount = 3;
  for (let i = 0; i < burstCount; i++) {
    setTimeout(() => {
      confetti({
        angle: randomInRange(55, 125),
        spread: randomInRange(50, 70),
        particleCount: randomInRange(30, 50),
        origin: { x: originX, y: originY },
        colors: ['#0066DD', '#28A745', '#FFC107', '#DC3545', '#17A2B8', '#6F42C1'],
        ticks: 150,
        gravity: 1.2,
        decay: 0.92,
        startVelocity: 25,
        shapes: ['circle', 'square'],
        scalar: 0.8
      });
    }, i * 100);
  }
}

// Expose public API
window.setupFlipClock = setupFlipClock;
window.applyClockSettings = applyClockSettings;
window.updateClockSettings = updateClockSettings;
window.createParticleEffect = createParticleEffect;
window.createBurstParticleEffect = createBurstParticleEffect;
window.addPushButtonParticleEffects = addPushButtonParticleEffects;

// Function to add particle effects to push button clicks
function addPushButtonParticleEffects() {
  const triggerParticleEffects = () => {
    document.querySelectorAll('.flip-clock-container').forEach(container => {
      // Update clock colors
      updateFlipClockColors(container);
      
      // Trigger particle effects with a small delay to ensure DOM is ready
      setTimeout(() => {
        createParticleEffect(container);
        // Add a secondary burst effect for extra visual impact
        setTimeout(() => {
          createBurstParticleEffect(container);
        }, 300);
      }, 100);
    });
  };

  // Try multiple selectors for push buttons
  const buttonSelectors = [
    '#adit-button-push',
    '.adit-button-push',
    '[id*="push"]',
    '[class*="push"]',
    'button[onclick*="push"]',
    'input[type="submit"][value*="出勤"]',
    'input[type="submit"][value*="退勤"]'
  ];

  buttonSelectors.forEach(selector => {
    const buttons = document.querySelectorAll(selector);
    buttons.forEach(button => {
      if (!button.dataset.particleEffectAdded) {
        button.dataset.particleEffectAdded = 'true';
        button.addEventListener('click', triggerParticleEffects);
      }
    });
  });
}

// On initial load, refresh clock colors, and re-apply when the "adit-button-push" button is clicked
document.addEventListener('DOMContentLoaded', () => {
  // Initial color sync
  document.querySelectorAll('.flip-clock-container').forEach(container => updateFlipClockColors(container));
  
  // Add particle effects to push buttons
  addPushButtonParticleEffects();
  
  // Re-check for buttons periodically (in case they're added dynamically)
  setInterval(() => {
    addPushButtonParticleEffects();
  }, 2000);
}); 
