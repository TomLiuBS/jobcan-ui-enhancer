// scripts/dataExtraction.js

// // Variable for notification throttling - Moved to utils.js
// let lastNotificationTime = 0;

// // Show notification toast message - Moved to utils.js
// function showNotification(message, duration = 3000) { ... }

function extractAttendanceDataFromCollapseInfo(collapseInfo, options = {}) {
  const { logPrefix = '' } = options;
  const tables = collapseInfo.querySelectorAll('table.table.jbc-table.jbc-table-fixed.info-contents');

  const workTimeData = {};
  const userInfoData = {};
  let hasWorkTimeData = false;
  let hasUserInfoData = false;

  tables.forEach((table, tableIndex) => {
    const rows = table.querySelectorAll('tbody tr');
    if (logPrefix) {
      console.log(`${logPrefix}Table ${tableIndex + 1} has ${rows.length} rows`);
    }

    const cardBody = table.closest('.card-body, .jbc-card-body');
    if (!cardBody) return;

    const card = cardBody.closest('.card, .jbc-card');
    if (!card) return;

    const cardHeader = card.querySelector('.card-header, .jbc-card-header');
    const headerText = cardHeader ? cardHeader.textContent.trim() : '';
    const isUserInfo = headerText.includes('ユーザー情報');
    let paidLeaveDetails = [];

    rows.forEach((row) => {
      const labelElement = row.querySelector('th.jbc-text-sub');
      const valueElement = row.querySelector('td span.info-content');
      if (!labelElement || !valueElement) return;

      const labelText = labelElement.textContent.trim();
      const valueText = valueElement.textContent.trim();

      if (isUserInfo) {
        userInfoData[labelText] = valueText;
        hasUserInfoData = true;
        if (logPrefix) console.log(`${logPrefix}Extracted user info: ${labelText} = ${valueText}`);

        if (labelText === '有休日数') {
          const subTextElements = row.querySelectorAll('td .jbc-text-sub');
          if (subTextElements.length > 0) {
            paidLeaveDetails = Array.from(subTextElements).map((el) => el.textContent.trim());
          }
        }
      } else {
        workTimeData[labelText] = valueText;
        hasWorkTimeData = true;
        if (logPrefix) console.log(`${logPrefix}Extracted work time: ${labelText} = ${valueText}`);
      }
    });

    if (isUserInfo && paidLeaveDetails.length > 0) {
      userInfoData['有休詳細'] = paidLeaveDetails;
      if (logPrefix) console.log(`${logPrefix}Extracted paid leave details:`, paidLeaveDetails);
    }
  });

  return {
    workTimeData,
    userInfoData,
    hasWorkTimeData,
    hasUserInfoData,
    tableCount: tables.length
  };
}

function extractMonthInfo(url, doc) {
  let monthInfo = null;
  try {
    const urlParams = new URL(url).searchParams;
    if (urlParams.has('year') && urlParams.has('month')) {
      monthInfo = {
        year: urlParams.get('year'),
        month: urlParams.get('month')
      };
    } else {
      const monthHeader = doc.querySelector('.card-header h5, .jbc-card-header h5');
      if (monthHeader) {
        const headerText = monthHeader.textContent.trim();
        const match = headerText.match(/(\d{4})年(\d{1,2})月/);
        if (match) {
          monthInfo = { year: match[1], month: match[2] };
        }
      }
    }
  } catch (error) {
    console.error('Error extracting month info:', error);
  }
  return monthInfo;
}

function normalizePunchDate(rawDate, monthInfo) {
  if (!rawDate) return '';
  const trimmed = rawDate.trim();

  const ymdMatch = trimmed.match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const mdMatch = trimmed.match(/(\d{1,2})[\/.-](\d{1,2})/);
  if (mdMatch && monthInfo && monthInfo.year) {
    const y = String(monthInfo.year);
    const m = mdMatch[1].padStart(2, '0');
    const d = mdMatch[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
}

function getSelectedDateFromModifyPage(doc, fallbackMonthInfo = null) {
  const selectYear = doc.querySelector('select[name*="year"], select#year');
  const selectMonth = doc.querySelector('select[name*="month"], select#month');
  const selectDay = doc.querySelector('select[name*="day"], select#day');
  const inputDate = doc.querySelector('input[type="date"]');

  if (inputDate && inputDate.value) {
    const dateValue = inputDate.value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;
  }

  const year = (selectYear && selectYear.value) || (fallbackMonthInfo && fallbackMonthInfo.year) || '';
  const month = (selectMonth && selectMonth.value) || (fallbackMonthInfo && fallbackMonthInfo.month) || '';
  const day = (selectDay && selectDay.value) || '';

  if (!year || !month || !day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractPunchListFromDocument(doc, monthInfo) {
  const selectedDate = getSelectedDateFromModifyPage(doc, monthInfo);
  const punchEntries = [];
  const aditCard = Array.from(doc.querySelectorAll('.card, .jbc-card')).find((card) => {
    const title = card.querySelector('.card-header, .jbc-card-header');
    return title && title.textContent && title.textContent.includes('打刻一覧');
  });

  const rowSelector = aditCard
    ? 'table tbody tr'
    : 'table tr';
  const rows = aditCard ? aditCard.querySelectorAll(rowSelector) : doc.querySelectorAll(rowSelector);

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;

    const rowText = row.textContent ? row.textContent.replace(/\s+/g, ' ').trim() : '';
    if (!rowText || !/入室|退室|出勤|退勤|休憩|打刻/.test(rowText)) return;

    const typeCellText = (cells[0]?.textContent || '').replace(/\s+/g, ' ').trim();
    const timeCellText = (cells[1]?.textContent || '').replace(/\s+/g, ' ').trim();

    const timesFromCell = timeCellText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g) || [];
    const timesFromRow = rowText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g) || [];
    const times = timesFromCell.length ? timesFromCell : timesFromRow;
    if (times.length === 0) return;

    const dateMatch =
      rowText.match(/(\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})/) ||
      rowText.match(/(\d{1,2}[\/.-]\d{1,2})/);
    const normalizedDate = normalizePunchDate(dateMatch ? dateMatch[1] : selectedDate, monthInfo);

    let type = '';
    if (typeCellText.includes('入室') || rowText.includes('入室')) type = '入室';
    else if (typeCellText.includes('退室') || rowText.includes('退室')) type = '退室';
    else if (typeCellText.includes('出勤') || rowText.includes('出勤')) type = '出勤';
    else if (typeCellText.includes('退勤') || rowText.includes('退勤')) type = '退勤';
    else if (typeCellText.includes('休憩') || rowText.includes('休憩')) type = '休憩';
    else if (rowText.includes('打刻')) type = '打刻';

    times.forEach((time) => {
      punchEntries.push({
        date: normalizedDate,
        time,
        type,
        source: '打刻修正'
      });
    });
  });

  return punchEntries;
}

function buildPunchListCandidateUrls(monthInfo) {
  const base = 'https://ssl.jobcan.jp';
  const query = monthInfo && monthInfo.year && monthInfo.month
    ? `?search_type=month&year=${encodeURIComponent(monthInfo.year)}&month=${encodeURIComponent(monthInfo.month)}`
    : '';

  return [
    `${base}/employee/adit/modify/`,
    `${base}/employee/attendance/adit${query}`,
    `${base}/employee/attendance/edit${query}`,
    `${base}/employee/adit${query}`,
    `${base}/employee/attendance?list_type=adit${query ? `&${query.replace(/^\?/, '')}` : ''}`
  ];
}

async function loadPunchListInIframe(monthInfo = null) {
  const urls = buildPunchListCandidateUrls(monthInfo);
  let lastError = null;

  for (const url of urls) {
    try {
      const result = await new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        iframe.src = url;

        const timeout = setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
          reject(new Error(`Punch iframe loading timed out: ${url}`));
        }, 25000);

        iframe.onload = async () => {
          try {
            await new Promise((r) => setTimeout(r, 1500));
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc) throw new Error('Cannot access punch iframe document');

            const resolvedMonthInfo = monthInfo || extractMonthInfo(url, doc);
            const entries = extractPunchListFromDocument(doc, resolvedMonthInfo);
            if (!entries.length) {
              throw new Error(`No punch entries found: ${url}`);
            }

            await chrome.storage.local.set({
              jobcanPunchListData: {
                monthInfo: resolvedMonthInfo || null,
                entries,
                sourceUrl: url,
                fetchedAt: Date.now()
              }
            });

            resolve({
              entries,
              monthInfo: resolvedMonthInfo || null,
              sourceUrl: url
            });
          } catch (error) {
            reject(error);
          } finally {
            clearTimeout(timeout);
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
          }
        };

        iframe.onerror = () => {
          clearTimeout(timeout);
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
          reject(new Error(`Punch iframe failed to load: ${url}`));
        };

        document.body.appendChild(iframe);
      });

      return result;
    } catch (error) {
      lastError = error;
      console.debug('Punch list fetch attempt failed:', error.message || error);
    }
  }

  throw lastError || new Error('Unable to fetch punch list data');
}

// Extract and store collapseInfo data
async function extractAndStoreCollapseInfoData() {
  const collapseInfo = document.getElementById('collapseInfo');
  if (!collapseInfo) return;
  
  // Log that we're attempting to extract data
  console.log('Extracting work time data from #collapseInfo');
  
  // Find all tables within the collapseInfo section
  const tables = collapseInfo.querySelectorAll('table.table.jbc-table.jbc-table-fixed.info-contents');
  if (!tables.length) {
    console.log('No matching tables found in #collapseInfo');
    return;
  }
  
  console.log(`Found ${tables.length} tables to extract data from`);
  const {
    workTimeData,
    userInfoData,
    hasWorkTimeData,
    hasUserInfoData
  } = extractAttendanceDataFromCollapseInfo(collapseInfo);
  
  // Only save if we have data
  if (hasWorkTimeData || hasUserInfoData) {
    try {
      // Store using chrome.storage.local
      if (hasWorkTimeData) {
        await chrome.storage.local.set({ 'jobcanWorkTimeData': workTimeData });
        console.log('Work time data saved:', workTimeData);
      }
      
      if (hasUserInfoData) {
        await chrome.storage.local.set({ 'jobcanUserInfoData': userInfoData });
        console.log('User info data saved:', userInfoData);
      }
      
      // Show brief notification that data has been saved - Use global notification
      const currentTime = Date.now();
      const isAttendancePage = window.location.href.indexOf('https://ssl.jobcan.jp/employee/attendance') === 0;
      
      if (isAttendancePage && (hasWorkTimeData || hasUserInfoData) && (currentTime - window.lastNotificationTime > 10000)) {
        window.lastNotificationTime = currentTime;
        if (typeof window.showNotification === 'function') {
          window.showNotification('勤怠データが保存されました');
        }
      }
    } catch (error) {
      console.error('Error saving data:', error);
    }
  } else {
    console.log('No data found to save');
  }
}

// Load attendance page in invisible iframe to extract data
async function loadAttendancePageInIframe(url = 'https://ssl.jobcan.jp/employee/attendance') {
  return new Promise((resolve, reject) => {
    // Create invisible iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.src = url;
    
    // Add loading status to notify user - Use global notification
    let loadingNotification = null;
    if (typeof window.showNotification === 'function') {
        loadingNotification = window.showNotification('データを取得中...', 0); // 0 means no auto-hide
    }
    
    // Set timeout to prevent hanging
    const timeout = setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      if (loadingNotification) loadingNotification.remove();
      if (typeof window.showNotification === 'function') window.showNotification('データ取得がタイムアウトしました');
      reject(new Error('Iframe loading timed out'));
    }, 30000); // 30 seconds timeout
    
    // Wait for iframe to load
    iframe.onload = async () => {
      try {
        console.log('Attendance page iframe loaded:', url);
        
        // Wait a bit for dynamic content to load
        await new Promise(r => setTimeout(r, 2000));
        
        // Try to find and extract data from the iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDoc) {
          throw new Error('Cannot access iframe document');
        }
        
        const collapseInfo = iframeDoc.getElementById('collapseInfo');
        if (!collapseInfo) {
          throw new Error('No #collapseInfo found in iframe');
        }
        
        const tables = collapseInfo.querySelectorAll('table.table.jbc-table.jbc-table-fixed.info-contents');
        if (!tables.length) {
          throw new Error('No tables found in iframe #collapseInfo');
        }
        
        const {
          workTimeData,
          userInfoData,
          hasWorkTimeData,
          hasUserInfoData,
          tableCount
        } = extractAttendanceDataFromCollapseInfo(collapseInfo, { logPrefix: '[iframe] ' });

        console.log(`Found ${tableCount} tables in iframe`);
        
        // Get month info from the URL or page
        const monthInfo = extractMonthInfo(url, iframeDoc);
        
        // Save extracted data
        if (hasWorkTimeData || hasUserInfoData) {
          try {
            const storageKey = monthInfo ? 
              `jobcanWorkTimeData_${monthInfo.year}_${monthInfo.month}` : 
              'jobcanWorkTimeData';
            
            if (hasWorkTimeData) {
              // If we have month info, add it to the data
              if (monthInfo) {
                workTimeData._monthInfo = monthInfo;
              }
              
              await chrome.storage.local.set({ [storageKey]: workTimeData });
              console.log(`Work time data saved from iframe for ${monthInfo ? monthInfo.year + '/' + monthInfo.month : 'current month'}:`, workTimeData);
              
              // Also save to the default key for immediate display
              await chrome.storage.local.set({ 'jobcanWorkTimeData': workTimeData });
            }
            
            if (hasUserInfoData) {
              await chrome.storage.local.set({ 'jobcanUserInfoData': userInfoData });
              console.log('User info data saved from iframe:', userInfoData);
            }

            // Also refresh punch list (打刻一覧) for work-progress markers.
            try {
              await loadPunchListInIframe(monthInfo);
            } catch (error) {
              console.debug('Punch list fetch skipped:', error.message || error);
            }
            
            if (loadingNotification) loadingNotification.remove();
            if (typeof window.showNotification === 'function') window.showNotification('勤怠データが取得されました');
            const punchResult = await chrome.storage.local.get(['jobcanPunchListData']);
            resolve({
              workTimeData,
              userInfoData,
              monthInfo,
              punchListData: punchResult.jobcanPunchListData || null
            });
          } catch (error) {
            console.error('Error saving data from iframe:', error);
            reject(error);
          }
        } else {
          throw new Error('No data found in iframe');
        }
      } catch (error) {
        console.error('Error extracting data from iframe:', error);
        reject(error);
      } finally {
        // Clean up
        clearTimeout(timeout);
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        if (loadingNotification) loadingNotification.remove();
      }
    };
    
    // Handle iframe loading errors
    iframe.onerror = () => {
      clearTimeout(timeout);
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      if (loadingNotification) loadingNotification.remove();
      if (typeof window.showNotification === 'function') window.showNotification('データ取得に失敗しました');
      reject(new Error('Iframe loading failed'));
    };
    
    // Add iframe to page
    document.body.appendChild(iframe);
  });
}

// Setup observer to watch for #collapseInfo visibility and extract data
function setupCollapseInfoObserver() {
  if (window.__jbe_collapseInfoObserverInited) return;
  window.__jbe_collapseInfoObserverInited = true;

  // Prevent multiple initializations
  if (document.body.dataset.collapseObserverSetup === 'true') {
    return;
  }
  document.body.dataset.collapseObserverSetup = 'true';
  
  // Check if we're on the attendance page
  const isAttendancePage = window.location.href.indexOf('https://ssl.jobcan.jp/employee/attendance') === 0;
  
  // Create a debounce function to avoid rapid firing
  let debounceTimer;
  const debounce = (callback, time) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(callback, time);
  };
  
  // Create the observer
  const observer = new MutationObserver(() => {
    const collapseInfo = document.getElementById('collapseInfo');
    if (collapseInfo && collapseInfo.offsetParent !== null) { // Check if visible
      debounce(() => {
        extractAndStoreCollapseInfoData();
      }, 500); // 500ms debounce
    }
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also extract data if collapseInfo already exists
  const collapseInfo = document.getElementById('collapseInfo');
  if (collapseInfo && collapseInfo.offsetParent !== null) {
    // On the attendance page, wait a bit longer to ensure the data is fully loaded
    if (isAttendancePage) {
      setTimeout(() => {
        extractAndStoreCollapseInfoData();
      }, 1000);
    } else {
      extractAndStoreCollapseInfoData();
    }
  }
  
  // If on attendance page, check periodically for the collapse info section
  let attendancePageInterval = null;
  
  if (isAttendancePage) {
    let checkCount = 0;
    const maxChecks = 10; // Limit checks to avoid excessive processing
    
    attendancePageInterval = setInterval(() => {
      checkCount++;
      const collapseInfo = document.getElementById('collapseInfo');
      
      if (collapseInfo && collapseInfo.offsetParent !== null) {
        extractAndStoreCollapseInfoData();
        clearInterval(attendancePageInterval);
      }
      
      if (checkCount >= maxChecks) {
        clearInterval(attendancePageInterval);
      }
    }, 2000); // Check every 2 seconds, up to 20 seconds total
  }
}

// Expose globally
window.extractAndStoreCollapseInfoData = extractAndStoreCollapseInfoData;
window.loadAttendancePageInIframe = loadAttendancePageInIframe;
window.loadPunchListInIframe = loadPunchListInIframe;
window.setupCollapseInfoObserver = setupCollapseInfoObserver;
