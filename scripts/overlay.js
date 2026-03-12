// scripts/overlay.js

// // Variable for notification throttling - Moved to utils.js
// let lastNotificationTime = 0;

// // Show notification toast message - Moved to utils.js
// function showNotification(message, duration = 3000) { ... }

// Show saved work time data in a floating overlay
async function showWorkTimeOverlay() {
  try {
    // Get data from storage
    const result = await chrome.storage.local.get(['jobcanWorkTimeData', 'jobcanUserInfoData']);
    let workTimeData = result.jobcanWorkTimeData;
    let userInfoData = result.jobcanUserInfoData;
    let currentMonthInfo = workTimeData && workTimeData._monthInfo ? workTimeData._monthInfo : null;
    
    // If no month info is available, default to current month
    if (!currentMonthInfo) {
      const today = new Date();
      currentMonthInfo = {
        year: today.getFullYear().toString(),
        month: (today.getMonth() + 1).toString()
      };
    }
    
    // If no data is available, try to load it from the attendance page
    if ((!workTimeData || Object.keys(workTimeData).length === 0) && 
        (!userInfoData || Object.keys(userInfoData).length === 0)) {
      try {
        if (typeof window.showNotification === 'function') window.showNotification('保存されたデータがありません。データを取得中...', 3000);
        const iframeData = await window.loadAttendancePageInIframe();
        workTimeData = iframeData.workTimeData;
        userInfoData = iframeData.userInfoData;
        // Only update currentMonthInfo if iframe provides month info, otherwise keep default current month
        if (iframeData.monthInfo) {
          currentMonthInfo = iframeData.monthInfo;
        }
      } catch (error) {
        console.error('Failed to load data from iframe:', error);
        if (typeof window.showNotification === 'function') window.showNotification('データを取得できませんでした', 3000);
        // Continue with the overlay even if iframe loading fails
      }
    }
    
    // Create overlay container
    const overlayDiv = document.createElement('div');
    overlayDiv.className = 'work-time-overlay';
    
    // Create content box
    const contentDiv = document.createElement('div');
    contentDiv.className = 'work-time-overlay-content';
    
    // Create header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'work-time-overlay-header';
    
    // Create title container for flex layout
    const titleContainer = document.createElement('div');
    titleContainer.className = 'work-time-overlay-title-container';
    
    // Create title
    const title = document.createElement('h3');
    title.textContent = '労働データ';
    titleContainer.appendChild(title);
    
   
    
    // Add toggle button if there will be work time data
    if (workTimeData && Object.keys(workTimeData).length > 0) {
      // Count zero value items to decide if we need a toggle button
      let zeroValueCount = 0;
      
      for (const [label, value] of Object.entries(workTimeData)) {
        if (label === '_monthInfo') continue;
        
        const isZeroValue = value === '0' || value === '0.0' || value === '0時間' || value === '0分' || 
                           value === '00:00' || /^0+$/.test(value.replace(/[^0-9]/g, ''));
        
        if (isZeroValue) {
          zeroValueCount++;
        }
      }
      
      // Only create toggle button if there are zero value items
      if (zeroValueCount > 0) {
        // Create the toggle button
        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-zero-values-btn';
        toggleButton.textContent = '全項目を表示';
        toggleButton.setAttribute('type', 'button');
        
        // Toggle button click handler
        toggleButton.addEventListener('click', () => {
          const isShowing = toggleButton.classList.contains('showing');
          const zeroValueItems = document.querySelectorAll('.zero-value-item');
          
          if (isShowing) {
            // Hide the zero-value items
            zeroValueItems.forEach(item => {
              item.style.display = 'none';
            });
            toggleButton.textContent = '全項目を表示';
            toggleButton.classList.remove('showing');
          } else {
            // Show the zero-value items
            zeroValueItems.forEach(item => {
              item.style.display = 'flex';
            });
            toggleButton.textContent = '必要項目のみ表示';
            toggleButton.classList.add('showing');
          }
        });
        
        // Add toggle button to the title container
        titleContainer.appendChild(toggleButton);
      }
    }
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'work-time-overlay-close';
    closeBtn.setAttribute('title', '閉じる');
    
    // Add header elements
    headerDiv.appendChild(titleContainer);
    headerDiv.appendChild(closeBtn);
    
    // Create month selector container
    const selectorContainer = document.createElement('div');
    selectorContainer.className = 'month-selector-container';
    
    // Create month selector
    const monthSelector = document.createElement('div');
    monthSelector.className = 'month-selector';
    
    // Add last 3 months, current month, and next month options
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // JS months are 0-indexed
    
    // Create the months array
    const months = [];
    for (let i = -3; i <= 1; i++) {
      // Calculate the month (handle wrapping to previous/next year)
      let month = currentMonth + i;
      let year = currentYear;
      
      if (month <= 0) {
        month += 12;
        year -= 1;
      } else if (month > 12) {
        month -= 12;
        year += 1;
      }
      
      months.push({ year, month });
    }
    
    // Create month buttons
    let hasActiveButton = false;
    months.forEach(({ year, month }) => {
      const monthBtn = document.createElement('button');
      monthBtn.className = 'month-selector-btn';
      monthBtn.textContent = `${year}年${month}月`;
      monthBtn.dataset.year = year;
      monthBtn.dataset.month = month;
      
      // If this is the current displayed month, highlight it
      if (currentMonthInfo && 
          parseInt(currentMonthInfo.year) === year && 
          parseInt(currentMonthInfo.month) === month) {
        monthBtn.classList.add('active');
        hasActiveButton = true;
      }
      
      monthBtn.addEventListener('click', async () => {
        // Don't do anything if already active
        if (monthBtn.classList.contains('active')) return;
        
        try {
          // Remove active class from all buttons
          document.querySelectorAll('.month-selector-btn').forEach(btn => {
            btn.classList.remove('active');
          });
          
          // Add loading class
          monthBtn.classList.add('loading');
          
          // Try to load data for this month
          const monthUrl = `https://ssl.jobcan.jp/employee/attendance?list_type=normal&search_type=month&year=${year}&month=${month}`;
          const iframeData = await window.loadAttendancePageInIframe(monthUrl);
          
          // Remove the current overlay
          overlayDiv.remove();
          
          // Create a new overlay with the new data
          setTimeout(() => showWorkTimeOverlay(), 100);
        } catch (error) {
          console.error('Failed to load month data:', error);
          monthBtn.classList.remove('loading');
          if (typeof window.showNotification === 'function') window.showNotification(`${year}年${month}月のデータを取得できませんでした`, 3000);
        }
      });
      
      monthSelector.appendChild(monthBtn);
    });
    
    // Fallback: if no button is active, activate the current month button
    if (!hasActiveButton) {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      
      const currentMonthBtn = monthSelector.querySelector(`[data-year="${currentYear}"][data-month="${currentMonth}"]`);
      if (currentMonthBtn) {
        currentMonthBtn.classList.add('active');
      }
    }
    
    selectorContainer.appendChild(monthSelector);
    
    // Create body
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'work-time-overlay-body';
    
    // Add month selector to the top of the body
    bodyDiv.appendChild(selectorContainer);
    
    // Shared collections are used by both user/work-time sections.
    // Keep them in function scope to avoid block-scope reference errors.
    const dataCards = {};
    const zeroValueItems = [];

    // Has any data been loaded?
    const hasWorkTimeData = workTimeData && Object.keys(workTimeData).length > 0;
    const hasUserInfoData = userInfoData && Object.keys(userInfoData).length > 0;
    
    if (hasWorkTimeData || hasUserInfoData) {
      // Show user info section if available
      if (hasUserInfoData) {
        const userInfoSection = document.createElement('div');
        userInfoSection.className = 'work-time-section user-info-section';
        
        const userInfoTitle = document.createElement('h4');
        userInfoTitle.textContent = 'ユーザー情報';
        userInfoSection.appendChild(userInfoTitle);
        
        const userInfoList = document.createElement('ul');
        userInfoList.className = 'work-time-data-list';
        
        for (const [label, value] of Object.entries(userInfoData)) {
          // Skip details and paid leave days, handle them in the card section
          if (label === '有休詳細' || label === '有休日数') continue;
          
          const item = document.createElement('li');
          
          const labelSpan = document.createElement('span');
          labelSpan.className = 'work-time-data-label';
          labelSpan.textContent = label;
          
          const valueSpan = document.createElement('span');
          valueSpan.className = 'work-time-data-value';
          valueSpan.textContent = value;
          
          item.appendChild(labelSpan);
          item.appendChild(valueSpan);
          userInfoList.appendChild(item);
        }
        
        // Add the 有休日数 card separately, including its details if available
        if (userInfoData && userInfoData['有休日数']) {
          const paidLeaveLabel = '有休日数';
          const paidLeaveValue = userInfoData[paidLeaveLabel];
          const paidLeaveDetails = userInfoData['有休詳細'];
          
          const paidLeaveCard = document.createElement('div');
          paidLeaveCard.className = 'work-time-card category-absence'; // Use absence category styling
          paidLeaveCard.id = `card-${paidLeaveLabel.replace(/\s+/g, '-')}`;
          
          const labelElem = document.createElement('div');
          labelElem.className = 'work-time-card-label';
          labelElem.textContent = paidLeaveLabel;
          
          const valueElem = document.createElement('div');
          valueElem.className = 'work-time-card-value';
          valueElem.textContent = paidLeaveValue;
          
          paidLeaveCard.appendChild(labelElem);
          paidLeaveCard.appendChild(valueElem);
          
          // Add details as subvalues if they exist
          if (paidLeaveDetails && paidLeaveDetails.length > 0) {
            paidLeaveCard.classList.add('has-subvalues');
            const subvaluesContainer = document.createElement('div');
            subvaluesContainer.className = 'work-time-card-subvalues';
            
            let expiryDateFound = false;
            paidLeaveDetails.forEach(detailText => {
              // Check if this detail is the expiry date
              if (detailText.includes('有効') || detailText.includes('期限')) {
                const expiryElem = document.createElement('div');
                expiryElem.className = 'work-time-card-subvalue expiry-date'; // Add specific class
                expiryElem.textContent = detailText.trim();
                // Insert expiry date right after the main value
                valueElem.insertAdjacentElement('afterend', expiryElem);
                expiryDateFound = true;
              } else {
                // Handle other details as before
                const detailParts = detailText.match(/(.*?)\s+(\d+(\.\d+)?)$/);
                const subvalueRow = document.createElement('div');
                subvalueRow.className = 'work-time-card-subvalue';
                
                if (detailParts && detailParts.length >= 3) {
                  const subLabelElem = document.createElement('div');
                  subLabelElem.className = 'work-time-card-subvalue-label';
                  subLabelElem.textContent = detailParts[1].trim();
                  
                  const subValueElem = document.createElement('div');
                  subValueElem.className = 'work-time-card-subvalue-data';
                  subValueElem.textContent = detailParts[2];
                  
                  subvalueRow.appendChild(subLabelElem);
                  subvalueRow.appendChild(subValueElem);
                } else {
                  // Display full text if parsing fails
                  const fullTextSpan = document.createElement('span');
                  fullTextSpan.className = 'work-time-subvalue-full-text';
                  fullTextSpan.textContent = detailText;
                  subvalueRow.appendChild(fullTextSpan);
                }
                subvaluesContainer.appendChild(subvalueRow);
              }
            });
            
            // Only append the subvalues container if it has children (i.e., non-expiry details)
            if (subvaluesContainer.hasChildNodes()) {
                paidLeaveCard.appendChild(subvaluesContainer);
            }
          }
          
          // Create relationship container even if empty for consistency
          const relationshipContainer = document.createElement('div');
          relationshipContainer.className = 'work-time-card-relationship';
          paidLeaveCard.appendChild(relationshipContainer);
          
          // Check if zero value and hide if necessary
          const isZeroValue = paidLeaveValue === '0' || paidLeaveValue === '0.0' || /^0+$/.test(paidLeaveValue.replace(/[^0-9]/g, ''));
          if (isZeroValue) {
             paidLeaveCard.classList.add('zero-value-item');
             zeroValueItems.push(paidLeaveCard);
             paidLeaveCard.style.display = 'none'; // Initially hidden
          }
          
          cardsContainer.appendChild(paidLeaveCard);
          dataCards[paidLeaveLabel] = paidLeaveCard; // Add to cards map
        }
        
        userInfoSection.appendChild(userInfoList);
        bodyDiv.appendChild(userInfoSection);
        
        // Add a divider if both sections will be shown
        if (hasWorkTimeData) {
          const divider = document.createElement('hr');
          divider.className = 'work-time-divider';
          bodyDiv.appendChild(divider);
        }
      }
      
      // Show work time data section if available
      if (hasWorkTimeData) {
        const workTimeSection = document.createElement('div');
        workTimeSection.className = 'work-time-section work-time-data-section';
        
        // Create a container for the cards
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'work-time-cards-container';
        
        // Add a legend to explain the category colors
        const legendContainer = document.createElement('div');
        legendContainer.className = 'work-time-cards-legend';
        
        const legendCategories = [
          { name: '時間', class: 'hours' },
          { name: '日数', class: 'days' },
          { name: '残業', class: 'overtime' },
          { name: '時刻', class: 'time' },
          { name: '欠勤・休暇', class: 'absence' }
        ];
        
        legendCategories.forEach(category => {
          const legendItem = document.createElement('div');
          legendItem.className = 'legend-item';
          
          const colorBox = document.createElement('div');
          colorBox.className = `legend-color ${category.class}`;
          
          const legendText = document.createElement('span');
          legendText.textContent = category.name;
          
          legendItem.appendChild(colorBox);
          legendItem.appendChild(legendText);
          legendContainer.appendChild(legendItem);
        });
        
        workTimeSection.appendChild(legendContainer);
        
        // Define data relationships and categories
        const dataRelationships = {
          // Hours relationships
          '所定労働時間': { category: 'hours', relatedTo: ['実労働時間', '不足時間', '過剰時間'] },
          '月規定労働時間': { category: 'hours', relatedTo: ['実労働時間'] },
          '実労働時間': { category: 'hours', relatedTo: ['月規定労働時間', '所定労働時間', '不足時間', '過剰時間'] },
          '不足時間': { category: 'hours', relatedTo: ['所定労働時間', '実労働時間'] },
          '過剰時間': { category: 'hours', relatedTo: ['所定労働時間', '実労働時間'] },
          
          // Overtime relationships
          '残業時間': { category: 'overtime', relatedTo: ['深夜残業', '法定内残業', '法定外残業'] },
          '深夜残業': { category: 'overtime', relatedTo: ['残業時間'] },
          '法定内残業': { category: 'overtime', relatedTo: ['残業時間'] },
          '法定外残業': { category: 'overtime', relatedTo: ['残業時間'] },
          '予測残業時間': { category: 'overtime', relatedTo: [] }, // No related buttons for prediction card
          
          // Days relationships
          '所定労働日数': { category: 'days', relatedTo: ['実働日数', '欠勤日数', '有休日数'] },
          '実働日数': { category: 'days', relatedTo: ['所定労働日数', '欠勤日数', '有休日数'] },
          '欠勤日数': { category: 'days', relatedTo: ['所定労働日数', '実働日数'] },
          '有休日数': { category: 'days', relatedTo: ['所定労働日数', '欠勤日数'], category: 'absence' },
          
          // Time relationships
          '始業時刻': { category: 'time', relatedTo: ['終業時刻', '休憩時間'] },
          '終業時刻': { category: 'time', relatedTo: ['始業時刻', '休憩時間'] },
          '休憩時間': { category: 'time', relatedTo: ['始業時刻', '終業時刻'] }
        };
        
        // Define data grouping - which items should be merged into a parent card
        const dataGrouping = {
          // Working days grouping (Weekday first)
          '実働日数': ['平日出勤日数', '休日出勤日数'],
          
          // Working hours grouping (Weekday first)
          '実労働時間': ['平日労働時間', '休日労働時間'],
          
          // Overtime grouping
          '残業時間': ['深夜残業', '法定内残業', '法定外残業'],
          
          // More detailed overtime groupings (Weekday first)
          '実残業時間': ['平日残業時間', '休日残業時間'],
          '実深夜時間': ['平日深夜時間', '休日深夜時間'],
          
          // Absences grouping
          '欠勤日数': ['特別休暇', '傷病休暇'], 
          
          // Working hours grouping
          '所定労働時間': ['実労働時間', '不足時間', '過剰時間'],
          
          // Time grouping (instead of separate cards)
          '始業時刻': ['終業時刻'],
        };
        
        // Define items to exclude from individual cards (they'll only appear as subvalues)
        const excludeItems = [
          '休日出勤日数', '平日出勤日数', // Moved to 実働日数
          '休日労働時間', '平日労働時間', // Moved to 実労働時間
          '休日残業時間', '平日残業時間', // Moved to 実残業時間
          '平日深夜時間', '休日深夜時間', // Moved to 実深夜時間
          '深夜残業', '法定内残業', '法定外残業', // Moved to 残業時間
          '特別休暇', '傷病休暇', // Moved to 欠勤日数
          '不足時間', '過剰時間', // Moved to 所定労働時間
          '終業時刻' // Moved to 始業時刻
        ];
        
        // Default category when no specific mapping exists
        const getCategory = (label) => {
          if (dataRelationships[label]) return dataRelationships[label].category;
          if (label.includes('日数')) return 'days';
          if (label.includes('時間')) return 'hours';
          if (label.includes('残業')) return 'overtime';
          if (label.includes('時刻')) return 'time';
          if (label.includes('欠勤') || label.includes('休暇') || label.includes('有休')) return 'absence';
          return 'hours'; // Default category
        };

        const groupedData = {}; // Store data items that will be grouped
        
        // Collect all data first, including those that will be grouped
        for (const [label, value] of Object.entries(workTimeData)) {
          if (label === '_monthInfo') continue;
          
          if (excludeItems.includes(label)) {
            groupedData[label] = value;
            continue;
          }
          
          // First pass: Create all non-excluded cards and store references
          const card = document.createElement('div');
          card.className = 'work-time-card';
          card.id = `card-${label.replace(/\s+/g, '-')}`;
          
          // Add category class
          const category = getCategory(label);
          card.classList.add(`category-${category}`);
          
          const labelElem = document.createElement('div');
          labelElem.className = 'work-time-card-label';
          labelElem.textContent = label;
          
          const valueElem = document.createElement('div');
          valueElem.className = 'work-time-card-value';
          valueElem.textContent = value;
          
          card.appendChild(labelElem);
          card.appendChild(valueElem);
          
          // Check if this card should contain grouped subvalues
          if (dataGrouping[label]) {
            const subvaluesContainer = document.createElement('div');
            subvaluesContainer.className = 'work-time-card-subvalues';
            
            // Add a class to the card to adjust padding
            card.classList.add('has-subvalues');
            
            // We'll populate the subvalues after collecting all data
            card.appendChild(subvaluesContainer);
          }
          
          // Create a container for relationship links (will be populated in second pass)
          const relationshipContainer = document.createElement('div');
          relationshipContainer.className = 'work-time-card-relationship';
          card.appendChild(relationshipContainer);
          
          // Check if the value is zero
          const isZeroValue = value === '0' || value === '0.0' || value === '0時間' || value === '0分' || 
                             value === '00:00' || /^0+$/.test(value.replace(/[^0-9]/g, ''));
          
          if (isZeroValue) {
            card.classList.add('zero-value-item');
            zeroValueItems.push(card);
            card.style.display = 'none'; // Initially hidden
          }
          
          // Store the card reference
          dataCards[label] = card;
          cardsContainer.appendChild(card);
        }
        
        // Now add grouped subvalues to their parent cards
        for (const [parentLabel, subLabels] of Object.entries(dataGrouping)) {
          const parentCard = dataCards[parentLabel];
          if (!parentCard) continue;
          
          const subvaluesContainer = parentCard.querySelector('.work-time-card-subvalues');
          if (!subvaluesContainer) continue;
          
          let hasSubvalues = false;
          
          // Add each subvalue
          subLabels.forEach(subLabel => {
            if (groupedData[subLabel] === undefined && workTimeData[subLabel] === undefined) return;
            
            const value = groupedData[subLabel] || workTimeData[subLabel] || '';
            
            // Skip zero values if the parent is also zero
            const isZeroValue = value === '0' || value === '0.0' || value === '0時間' || value === '0分' || 
                              value === '00:00' || /^0+$/.test(value.replace(/[^0-9]/g, ''));
            
            if (isZeroValue && parentCard.classList.contains('zero-value-item')) return;
            
            const subvalueRow = document.createElement('div');
            subvalueRow.className = 'work-time-card-subvalue';
            
            const subLabelElem = document.createElement('div');
            subLabelElem.className = 'work-time-card-subvalue-label';
            subLabelElem.textContent = subLabel;
            
            const subValue = document.createElement('div');
            subValue.className = 'work-time-card-subvalue-data';
            subValue.textContent = value;
            
            subvalueRow.appendChild(subLabelElem);
            subvalueRow.appendChild(subValue);
            subvaluesContainer.appendChild(subvalueRow);
            
            hasSubvalues = true;
          });
          
          // If no subvalues were added, remove the container
          if (!hasSubvalues) {
            subvaluesContainer.remove();
            parentCard.classList.remove('has-subvalues');
          }
        }
        
        // Helper function to parse time strings to minutes
        const parseTimeToMinutes = (timeStr) => {
          if (!timeStr || timeStr === '0') return 0;
          
          // Clean the string
          const cleanStr = timeStr.toString().trim();
          
          // Check for "HH:MM" format (including large hours like "157:46")
          const colonMatch = cleanStr.match(/^(\d+):(\d+)$/);
          if (colonMatch) {
            const hours = parseInt(colonMatch[1], 10) || 0;
            const minutes = parseInt(colonMatch[2], 10) || 0;
            return hours * 60 + minutes;
          }
          
          // Check for "X時間Y分" format
          const hourMinuteMatch = cleanStr.match(/(\d+)時間(\d+)分/);
          if (hourMinuteMatch) {
            const hours = parseInt(hourMinuteMatch[1], 10) || 0;
            const minutes = parseInt(hourMinuteMatch[2], 10) || 0;
            return hours * 60 + minutes;
          }
          
          // Check for "X時間" format only
          const hourOnlyMatch = cleanStr.match(/^(\d+)時間$/);
          if (hourOnlyMatch) {
            const hours = parseInt(hourOnlyMatch[1], 10) || 0;
            return hours * 60;
          }
          
          // Check for decimal hours (e.g., "8.5")
          const decimalMatch = cleanStr.match(/^(\d+\.?\d*)$/);
          if (decimalMatch) {
            return Math.round(parseFloat(decimalMatch[1]) * 60);
          }
          
          return 0;
        };
        
        // Helper function to format minutes back to readable format
        const formatMinutesToTime = (totalMinutes) => {
          if (totalMinutes <= 0) return '0時間';
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          if (minutes === 0) {
            return `${hours}時間`;
          } else {
            return `${hours}時間${minutes}分`;
          }
        };

        // Calculate and add predicted overtime card
        const calculatePredictedOvertime = () => {
          // Only show prediction for current month
          const today = new Date();
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth() + 1;
          
          // Check if we're viewing current month data
          const isCurrentMonth = currentMonthInfo && 
            parseInt(currentMonthInfo.year) === currentYear && 
            parseInt(currentMonthInfo.month) === currentMonth;
          
          if (!isCurrentMonth) {
            return null; // Don't show prediction for past/future months
          }
          
          // Get the required data points with correct field names
          const actualWorkingHours = parseTimeToMinutes(workTimeData['実労働時間'] || '0');
          const actualWorkingDays = parseInt(workTimeData['実働日数'] || '0', 10);
          const scheduledWorkingHours = parseTimeToMinutes(workTimeData['月規定労働時間'] || workTimeData['所定労働時間'] || '0');
          
          // Try to get scheduled working days, fallback to estimation if not available
          let scheduledWorkingDays = parseInt(workTimeData['所定労働日数'] || '0', 10);
          
          // If scheduled working days is not available, estimate from scheduled hours
          if (scheduledWorkingDays === 0 && scheduledWorkingHours > 0) {
            // Estimate based on standard 8-hour workday
            scheduledWorkingDays = Math.ceil(scheduledWorkingHours / (8 * 60));
          }
          
          // Skip prediction if we don't have the required data
          if (actualWorkingDays === 0 && actualWorkingHours === 0) {
            return null;
          }
          
          // If we have hours but no days data, create a basic prediction
          if (actualWorkingDays === 0 && actualWorkingHours > 0) {
            const currentOvertime = Math.max(0, actualWorkingHours - scheduledWorkingHours);
            return {
              predictedOvertime: formatMinutesToTime(currentOvertime),
              subValues: [
                {
                  label: '現在の労働時間',
                  value: formatMinutesToTime(actualWorkingHours)
                },
                {
                  label: '月規定労働時間',
                  value: formatMinutesToTime(scheduledWorkingHours)
                },
                {
                  label: '状況',
                  value: '現在の残業時間'
                }
              ],
              isSignificant: currentOvertime > 30
            };
          }
          
          // Calculate average daily working hours so far
          const avgDailyWorkingHours = actualWorkingHours / actualWorkingDays;
          
          // Calculate remaining working days
          const remainingWorkingDays = Math.max(0, scheduledWorkingDays - actualWorkingDays);
          
          // Predict total working hours for the month
          const predictedTotalWorkingHours = actualWorkingHours + (avgDailyWorkingHours * remainingWorkingDays);
          
          // Calculate predicted overtime (excess over scheduled hours)
          const predictedOvertimeMinutes = Math.max(0, predictedTotalWorkingHours - scheduledWorkingHours);
          
          // Create subvalue calculations for display
          const subValues = [
            {
              label: '平均日労働時間',
              value: formatMinutesToTime(Math.round(avgDailyWorkingHours))
            },
            {
              label: '残り勤務日数',
              value: `${remainingWorkingDays}日`
            },
            {
              label: '予測総労働時間',
              value: formatMinutesToTime(Math.round(predictedTotalWorkingHours))
            }
          ];
          
          return {
            predictedOvertime: formatMinutesToTime(Math.round(predictedOvertimeMinutes)),
            subValues: subValues,
            isSignificant: predictedOvertimeMinutes > 30 // Show if more than 30 minutes predicted
          };
        };
        
        let overtimePrediction = calculatePredictedOvertime();
        
        // Only show fallback card for current month when data is insufficient
        if (!overtimePrediction) {
          // Check if we're on current month first
          const today = new Date();
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth() + 1;
          
          const isCurrentMonth = currentMonthInfo && 
            parseInt(currentMonthInfo.year) === currentYear && 
            parseInt(currentMonthInfo.month) === currentMonth;
          
          // Only create fallback for current month
          if (isCurrentMonth) {
            overtimePrediction = {
              predictedOvertime: 'データ不足',
              subValues: [
                {
                  label: '必要データ',
                  value: '実労働時間、実働日数'
                },
                {
                  label: '状況',
                  value: '出勤簿をご確認ください'
                }
              ],
              isSignificant: false
            };
          }
        }
        
        if (overtimePrediction) {
          
          // Create the predicted overtime card
          const overtimeCard = document.createElement('div');
          overtimeCard.className = 'work-time-card category-overtime';
          overtimeCard.id = 'card-predicted-overtime';
          
          // Add a special class to distinguish it as a prediction
          overtimeCard.classList.add('prediction-card');
          
          const labelElem = document.createElement('div');
          labelElem.className = 'work-time-card-label';
          labelElem.textContent = '予測残業時間';
          
          const valueElem = document.createElement('div');
          valueElem.className = 'work-time-card-value';
          valueElem.textContent = overtimePrediction.predictedOvertime;
          
          overtimeCard.appendChild(labelElem);
          overtimeCard.appendChild(valueElem);
          
          // Add subvalues container
          if (overtimePrediction.subValues && overtimePrediction.subValues.length > 0) {
            overtimeCard.classList.add('has-subvalues');
            const subvaluesContainer = document.createElement('div');
            subvaluesContainer.className = 'work-time-card-subvalues';
            
            overtimePrediction.subValues.forEach(subValue => {
              const subvalueRow = document.createElement('div');
              subvalueRow.className = 'work-time-card-subvalue';
              
              const subLabelElem = document.createElement('div');
              subLabelElem.className = 'work-time-card-subvalue-label';
              subLabelElem.textContent = subValue.label;
              
              const subValueElem = document.createElement('div');
              subValueElem.className = 'work-time-card-subvalue-data';
              subValueElem.textContent = subValue.value;
              
              subvalueRow.appendChild(subLabelElem);
              subvalueRow.appendChild(subValueElem);
              subvaluesContainer.appendChild(subvalueRow);
            });
            
            overtimeCard.appendChild(subvaluesContainer);
          }
          
          // Create empty relationship container (no related buttons for prediction card)
          const relationshipContainer = document.createElement('div');
          relationshipContainer.className = 'work-time-card-relationship';
          overtimeCard.appendChild(relationshipContainer);
          
          // Check if this should be hidden as a zero value (but only if it's actually a numeric zero)
          const predictedOvertimeText = overtimePrediction.predictedOvertime;
          const overtimeMinutes = parseTimeToMinutes(predictedOvertimeText);
          
          if (overtimeMinutes === 0 && predictedOvertimeText !== 'データ不足') {
            overtimeCard.classList.add('zero-value-item');
            zeroValueItems.push(overtimeCard);
            // Don't hide the prediction card - user should see their zero prediction
          }
          
          // Add to dataCards for relationships
          dataCards['予測残業時間'] = overtimeCard;
          cardsContainer.appendChild(overtimeCard);
        }

        // Second pass: Add relationship links for non-grouped items
        for (const [label, card] of Object.entries(dataCards)) {
          if (!dataRelationships[label]) continue;
          
          const relationshipContainer = card.querySelector('.work-time-card-relationship');
          if (!relationshipContainer) continue;
          
          const relatedLabels = dataRelationships[label].relatedTo || [];
          
          relatedLabels.forEach(relatedLabel => {
            // Skip if this is a grouped item that won't have its own card
            if (excludeItems.includes(relatedLabel)) return;
            
            // Skip if related item doesn't exist
            if (!dataCards[relatedLabel]) return;
            
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'related-data-link';
            link.textContent = relatedLabel;
            link.dataset.target = `card-${relatedLabel.replace(/\s+/g, '-')}`;
            
            // Add click event to highlight the related card
            link.addEventListener('click', (e) => {
              e.preventDefault();
              
              // Remove highlight from all cards
              document.querySelectorAll('.work-time-card').forEach(c => {
                c.classList.remove('highlight');
              });
              
              // Add highlight to the target card
              const targetCard = document.getElementById(link.dataset.target);
              if (targetCard) {
                targetCard.classList.add('highlight');
                
                // Make sure the card is visible if it was hidden (zero value)
                if (targetCard.classList.contains('zero-value-item')) {
                  targetCard.style.display = 'flex';
                  
                  // Update the toggle button UI if it exists
                  const toggleBtn = document.querySelector('.toggle-zero-values-btn');
                  if (toggleBtn && !toggleBtn.classList.contains('showing')) {
                    toggleBtn.classList.add('showing');
                    toggleBtn.textContent = '必要項目のみ表示';
                  }
                }
                
                // Scroll the card into view with a slight delay
                setTimeout(() => {
                  targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
              }
            });
            
            relationshipContainer.appendChild(link);
          });
        }
        
        // Update the toggle button click handler for the card layout
        const toggleZeroValues = (show) => {
          zeroValueItems.forEach(card => {
            card.style.display = show ? 'flex' : 'none';
          });
          
          // Update all toggle buttons
          const toggleBtns = document.querySelectorAll('.toggle-zero-values-btn');
          toggleBtns.forEach(btn => {
            if (show) {
              btn.textContent = '必要項目のみ表示';
              btn.classList.add('showing');
            } else {
              btn.textContent = '全項目を表示';
              btn.classList.remove('showing');
            }
          });
        };
        
        // Update the toggle button in the header if it exists
        const headerToggleBtn = document.querySelector('.toggle-zero-values-btn');
        if (headerToggleBtn) {
          // Replace the existing click handler
          headerToggleBtn.replaceWith(headerToggleBtn.cloneNode(true));
          
          // Get the fresh reference and add the new handler
          const newToggleBtn = document.querySelector('.toggle-zero-values-btn');
          newToggleBtn.addEventListener('click', () => {
            const isShowing = newToggleBtn.classList.contains('showing');
            toggleZeroValues(!isShowing);
          });
        }
        
        workTimeSection.appendChild(cardsContainer);
        bodyDiv.appendChild(workTimeSection);
      }
    } else {
      // No data found, show suggestion to visit attendance page
      const noDataDiv = document.createElement('div');
      noDataDiv.className = 'work-time-no-data';
      
      const noDataMsg = document.createElement('p');
      noDataMsg.textContent = 'データを取得できませんでした。';
      
      const attendanceLink = document.createElement('a');
      attendanceLink.href = 'https://ssl.jobcan.jp/employee/attendance';
      attendanceLink.textContent = '出勤簿';
      attendanceLink.className = 'attendance-page-link work-time-action-link';
      
      const linkContainer = document.createElement('p');
      linkContainer.appendChild(document.createTextNode(''));
      linkContainer.appendChild(attendanceLink);
      linkContainer.appendChild(document.createTextNode('を開いてデータを取得してください。'));
      
      noDataDiv.appendChild(noDataMsg);
      noDataDiv.appendChild(linkContainer);
      
      bodyDiv.appendChild(noDataDiv);
    }
    
    // Assemble the components
    contentDiv.appendChild(headerDiv);
    contentDiv.appendChild(bodyDiv);
    overlayDiv.appendChild(contentDiv);
    
    // Add overlay to document
    document.body.appendChild(overlayDiv);
    
    // Close button handler
    closeBtn.addEventListener('click', () => {
      overlayDiv.remove();
    });
    
    // Add escape key listener to close overlay
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        overlayDiv.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // Add click outside to close
    overlayDiv.addEventListener('click', (e) => {
      if (e.target === overlayDiv) {
        overlayDiv.remove();
      }
    });
    
  } catch (error) {
    console.error('Error retrieving work time data:', error);
    if (typeof window.showNotification === 'function') window.showNotification('データの取得中にエラーが発生しました');
  }
}

// Add the floating work time button and hook up click to overlay
function setupFloatingWorkTimeButton() {
  if (window.__jbe_floatingWorkTimeButtonSetup) return;
  window.__jbe_floatingWorkTimeButtonSetup = true;

  // Clean up legacy standalone button if it still exists.
  const legacyButton = document.getElementById('work-time-display-btn');
  if (legacyButton) legacyButton.remove();

  if (typeof window.registerFloatingAction === 'function') {
    window.registerFloatingAction({
      id: 'work-time',
      title: '労働データ',
      order: 20,
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
      onClick: showWorkTimeOverlay
    });
    return;
  }

  // Fallback for environments where screenshot.js is unavailable.
  const fallbackButton = document.createElement('button');
  fallbackButton.id = 'work-time-display-btn';
  fallbackButton.title = '労働データを表示';
  fallbackButton.style.position = 'fixed';
  fallbackButton.style.bottom = '20px';
  fallbackButton.style.right = '20px';
  fallbackButton.style.zIndex = '9998';
  fallbackButton.style.cursor = 'pointer';
  fallbackButton.style.background = 'var(--color-primary)';
  fallbackButton.style.color = 'var(--color-white)';
  fallbackButton.style.borderRadius = '50%';
  fallbackButton.style.width = '50px';
  fallbackButton.style.height = '50px';
  fallbackButton.style.display = 'flex';
  fallbackButton.style.alignItems = 'center';
  fallbackButton.style.justifyContent = 'center';
  fallbackButton.style.boxShadow = '0 2px 10px var(--color-black-20)';
  fallbackButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
  fallbackButton.addEventListener('click', showWorkTimeOverlay);
  document.body.appendChild(fallbackButton);
}

// Expose globally if needed
window.showWorkTimeOverlay = showWorkTimeOverlay;
window.setupFloatingWorkTimeButton = setupFloatingWorkTimeButton;
