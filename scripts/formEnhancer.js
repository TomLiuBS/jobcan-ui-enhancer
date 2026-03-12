// scripts/formEnhancer.js

// Convert the man-hour modal to a side panel with date navigation
function convertManHourModalToSidePanel() {
  if (window.__jbe_convertModalInited) return;
  window.__jbe_convertModalInited = true;
  // Wait for the modal to be in the DOM
  const checkForModal = setInterval(() => {
    const modal = document.getElementById('man-hour-manage-modal');
    if (modal) {
      // Remove aria-hidden to prevent focus being hidden from assistive tech
      if (modal.hasAttribute('aria-hidden')) {
        modal.removeAttribute('aria-hidden');
      }
      // Ensure modal is properly exposed as a dialog
      modal.setAttribute('aria-modal', 'true');
      clearInterval(checkForModal);
      // Check if we've already enhanced this modal
      if (modal.dataset.enhanced === 'true') return;
      modal.dataset.enhanced = 'true';
      // Remove tabindex="-1" which can cause keyboard focus issues
      modal.removeAttribute('tabindex');
      // Get the modal header or create one if it doesn't exist
      let modalHeader = modal.querySelector('.modal-header');
      if (!modalHeader) {
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          modalHeader = document.createElement('div');
          modalHeader.className = 'modal-header';
          // Get the title from the form
          const titleElem = modal.querySelector('form h3, form h4, form .h3, form .h4');
          if (titleElem) {
            const title = document.createElement('h4');
            title.className = 'modal-title';
            title.innerHTML = titleElem.innerHTML;
            modalHeader.appendChild(title);
            titleElem.style.display = 'none';
          }
          // Create close button
          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'close';
          closeBtn.setAttribute('data-dismiss', 'modal');
          closeBtn.setAttribute('aria-label', 'Close');
          closeBtn.innerHTML = '<span aria-hidden="true">&times;</span>';
          modalHeader.appendChild(closeBtn);
          // Insert at the top of modal content
          if (modalContent.firstChild) {
            modalContent.insertBefore(modalHeader, modalContent.firstChild);
          } else {
            modalContent.appendChild(modalHeader);
          }
        }
      }
      // Remove date selector navigation controls section
    }
  }, 500); // Check every 500ms
}

// Enhance the man-hour modal title by extracting and reformatting time and date
function enhanceModalTitle() {
  if (window.__jbe_enhanceModalTitleInited) return;
  window.__jbe_enhanceModalTitleInited = true;
  // Wait for the modal title to be in the DOM
  const checkForModalTitle = setInterval(() => {
    const modalTitle = document.getElementById('edit-menu-title');
    if (modalTitle) {
      clearInterval(checkForModalTitle);
      // Check if we've already enhanced this title
      if (modalTitle.dataset.enhanced === 'true') return;
      modalTitle.dataset.enhanced = 'true';
      // Original title text format: "2025年03月11日(火)実労働時間＝08:51"
      const titleText = modalTitle.textContent;
      // Extract date components using regex
      const dateMatch = titleText.match(/(\d{4})年(\d{2})月(\d{2})日\((.)\)/);
      if (!dateMatch) return;
      const year = dateMatch[1];
      const month = dateMatch[2];
      const day = dateMatch[3];
      const weekday = dateMatch[4];
      // Extract time component
      const timeMatch = titleText.match(/実労働時間＝(\d{2}):(\d{2})/);
      const hours = timeMatch ? timeMatch[1] : '00';
      const minutes = timeMatch ? timeMatch[2] : '00';
      // Format date as YYYY/MM/DD(曜日)
      const formattedDate = `${year}/${month}/${day}(${weekday})`;
      // Format time as HH:MM
      const formattedTime = `${hours}:${minutes}`;
      // Create new container for the formatted display
      const titleContainer = document.createElement('div');
      titleContainer.className = 'enhanced-title-container';
      // Create time element
      const timeElement = document.createElement('div');
      timeElement.className = 'enhanced-title-time';
      timeElement.textContent = formattedTime;
      timeElement.dataset.time = formattedTime;
      // Create a container for time and man-hour sum
      const timeContainer = document.createElement('div');
      timeContainer.className = 'time-sum-container';
      timeContainer.style.display = 'flex';
      timeContainer.style.alignItems = 'center';
      // Create man-hour sum element
      const sumElement = document.createElement('div');
      sumElement.className = 'man-hour-sum';
      sumElement.style.fontSize = '14px';
      sumElement.style.marginLeft = '8px';
      sumElement.style.color = 'var(--color-text-secondary)';
      sumElement.style.fontWeight = 'normal';
      // Add elements to container
      timeContainer.appendChild(timeElement);
      timeContainer.appendChild(sumElement);
      titleContainer.appendChild(timeContainer);
      // Create date element
      const dateElement = document.createElement('div');
      dateElement.className = 'enhanced-title-date';
      dateElement.textContent = formattedDate;
      titleContainer.appendChild(dateElement);
      // Replace the original content
      modalTitle.innerHTML = '';
      modalTitle.appendChild(titleContainer);
      // Add the hidden input if it was in the original title
      const hiddenTimeMatch = titleText.match(/value="(\d+)"/);
      if (hiddenTimeMatch) {
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = 'hiddenTime';
        hiddenInput.value = hiddenTimeMatch[1];
        modalTitle.appendChild(hiddenInput);
      }
      // Setup the observer to update the man-hour sum
      setupManHourSumUpdater(sumElement);
    }
  }, 500); // Check every 500ms
}

// Setup observer and updater for man-hour sum and suggestion chips
function setupManHourSumUpdater(sumElement) {
  if (window.__jbe_manHourSumUpdaterInited) return;
  window.__jbe_manHourSumUpdaterInited = true;

  // Create a difference element to show the gap between actual time and entered time
  const diffElement = document.createElement('div');
  diffElement.className = 'man-hour-diff';
  diffElement.style.fontSize = '12px';
  diffElement.style.marginLeft = '8px';
  diffElement.style.fontWeight = 'normal';
  // Insert the diff element after the sum element
  sumElement.parentNode.insertBefore(diffElement, sumElement.nextSibling);
  // Function to calculate the sum of all man-hour inputs
  const calculateManHourSum = () => {
    const table = document.querySelector('.man-hour-table-edit, .jbc-table');
    if (!table) return { hours: 0, minutes: 0 };
    let totalMinutes = 0;
    const inputs = table.querySelectorAll('input.man-hour-input[name="minutes[]"]');
    inputs.forEach(input => {
      if (input && input.value) {
        const match = input.value.match(/(\d+):(\d+)/);
        if (match) {
          const h = parseInt(match[1], 10) || 0;
          const m = parseInt(match[2], 10) || 0;
          totalMinutes += (h * 60) + m;
        }
      }
    });
    return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60, totalMinutes };
  };
  // Function to get the actual work time in minutes from enhanced-title-time
  const getActualWorkTimeInMinutes = () => {
    const timeTitle = document.querySelector('#edit-menu-title, .enhanced-title-time');
    if (!timeTitle) return 0;
    const match = timeTitle.textContent.match(/(\d+):(\d+)/);
    if (!match) return 0;
    const h = parseInt(match[1], 10) || 0;
    const m = parseInt(match[2], 10) || 0;
    return h * 60 + m;
  };
  // Update the sum and show difference
  const updateSum = () => {
    const { hours, minutes, totalMinutes } = calculateManHourSum();
    const actualMinutes = getActualWorkTimeInMinutes();
    sumElement.textContent = `合計: ${hours}時間${minutes}分`;
    const difference = actualMinutes - totalMinutes;
    if (difference !== 0) {
      const absDiff = Math.abs(difference);
      const diffH = Math.floor(absDiff / 60);
      const diffM = absDiff % 60;
      diffElement.textContent = `差: ${diffH}時間${diffM}分 ${difference > 0 ? '不足' : '超過'}`;
      diffElement.classList.add('man-hour-diff', 'jbc-text-danger');
      if (difference > 0) { diffElement.classList.add('shortage'); diffElement.classList.remove('excess'); }
      else { diffElement.classList.add('excess'); diffElement.classList.remove('shortage'); }
      createSuggestionChips(difference, totalMinutes);
    } else {
      diffElement.textContent = '';
      diffElement.classList.remove('jbc-text-danger', 'shortage', 'excess');
      removeSuggestionChips();
    }
  };
  // Create suggestion chips for man-hour inputs
  const createSuggestionChips = (difference, currentTotal) => {
    const inputs = document.querySelectorAll('input.man-hour-input[name="minutes[]"]');
    if (!inputs.length) return;
    inputs.forEach(input => {
      if (input.nextElementSibling?.classList.contains('time-suggestion-chip')) return;
      let curMin = 0;
      const match = input.value.match(/(\d+):(\d+)/);
      if (match) { curMin = parseInt(match[1],10)*60 + parseInt(match[2],10); }
      const chip = document.createElement('div');
      chip.className = 'time-suggestion-chip'; chip.style.display = 'none';
      input.parentNode.insertBefore(chip, input.nextSibling);
      const calcTime = () => {
        let total=0;
        document.querySelectorAll('input.man-hour-input[name="minutes[]"]').forEach(inp => {
          const m=inp.value.match(/(\d+):(\d+)/);
          if (m) total+=parseInt(m[1],10)*60+parseInt(m[2],10);
        });
        const diffInner=getActualWorkTimeInMinutes()-total;
        let thisMin=curMin;
        const m2=input.value.match(/(\d+):(\d+)/);
        if(m2) thisMin=parseInt(m2[1],10)*60+parseInt(m2[2],10);
        const suggested=thisMin+diffInner;
        if(suggested<0) return '0:00';
        return `${Math.floor(suggested/60)}:${(suggested%60).toString().padStart(2,'0')}`;
      };
      const updChip = () => { const s=calcTime(); chip.textContent=`提案: ${s}`; chip.dataset.value=s; chip.style.display='block'; };
      input.addEventListener('mouseover',updChip);
      input.addEventListener('focus',updChip);
      input.addEventListener('input',updChip);
      input.addEventListener('mouseout',()=>{ if(document.activeElement!==input) chip.style.display='none'; });
      input.addEventListener('blur',()=>{ if(!chip.matches(':hover')) chip.style.display='none'; });
      chip.addEventListener('click',()=>{ input.value=chip.dataset.value; input.dispatchEvent(new Event('change',{bubbles:true})); updateSum(); });
      chip.addEventListener('mouseover',()=> chip.style.display='block');
      chip.addEventListener('mouseout',()=>{ if(document.activeElement!==input) chip.style.display='none'; });
    });
  };
  // Remove all suggestion chips
  const removeSuggestionChips = () => document.querySelectorAll('.time-suggestion-chip').forEach(c=>c.remove());
  // Start observing the man-hour table for changes
  const checkTable = setInterval(()=>{
    const table=document.querySelector('.man-hour-table-edit, .jbc-table');
    if(table){
      clearInterval(checkTable);
      updateSum();
      const obs=new MutationObserver((mutations)=>{ let upd=false, added=false;
        mutations.forEach(mu=>{
          if(mu.type==='attributes'&&mu.target.nodeName==='INPUT'&&mu.attributeName==='value') upd=true;
          if(mu.type==='childList'&&(mu.addedNodes.length||mu.removedNodes.length)){
            upd=true;
            mu.addedNodes.forEach(n=>{ if(n.nodeType===1&&n.querySelector('input.man-hour-input[name="minutes[]"]')) added=true; });
          }
        }); if(upd){ updateSum(); if(added){ const {totalMinutes:t}=calculateManHourSum(); const diffInner=getActualWorkTimeInMinutes()-t; if(diffInner) { removeSuggestionChips(); createSuggestionChips(diffInner,t); } } }});
      obs.observe(table,{attributes:true,attributeFilter:['value'],attributeOldValue:true,childList:true,subtree:true});
      document.querySelectorAll('input.man-hour-input[name="minutes[]"]').forEach(i=>{ i.addEventListener('input',updateSum); i.addEventListener('change', updateSum); });
      const form=document.querySelector('form'); if(form) form.addEventListener('change',updateSum);
    }
  },200);
  // Initial calculation
  updateSum();
}

// Enhance the select dropdown lists in the man-hour modal with modern styling
function enhanceManHourSelectLists() {
  if (window.__jbe_enhanceSelectListsInited) return;
  window.__jbe_enhanceSelectListsInited = true;

  const ensureSelectEnhanced = (select) => {
    if (!select || select.tagName !== 'SELECT') return;

    const hasWrapper = !!(
      select.nextElementSibling &&
      select.nextElementSibling.classList &&
      select.nextElementSibling.classList.contains('custom-select-wrapper')
    );

    if (hasWrapper) {
      // Keep native select hidden even if page scripts reset inline styles.
      select.style.display = 'none';
      return;
    }

    // Recover from stale marker states after modal re-render/fetch cycles.
    if (select.dataset.enhanced === 'true') {
      delete select.dataset.enhanced;
      select.style.display = '';
    }

    enhanceSelectElement(select);
  };

  const refreshEnhancedSelects = (root = document) => {
    const scope = root && root.querySelectorAll ? root : document;
    const selectCandidates = scope.querySelectorAll(
      '.man-hour-table-edit select, #man-hour-manage-modal select'
    );
    selectCandidates.forEach(ensureSelectEnhanced);
  };

  window.__jbe_refreshEnhancedSelects = refreshEnhancedSelects;
  // Observe DOM changes to detect when new rows are added
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const selects = node.querySelectorAll('select');
            selects.forEach(ensureSelectEnhanced);
            const inputs = node.querySelectorAll('input.man-hour-input[name="minutes[]"]');
            if (inputs.length > 0) inputs[0].dispatchEvent(new Event('change',{bubbles:true}));

            // After a new row is created, open the project list automatically
            const projectWrapper = node.querySelector('.custom-select-wrapper.project-select');
            if (projectWrapper) {
              projectWrapper.click();
            }
          }
        });
      }
    }
  });
  // Keep observing current table body; it can be replaced after report fetch cycles.
  let observedTableBody = null;
  const attachTableObserver = () => {
    const tableBody = document.querySelector('.man-hour-table-edit');
    if (!tableBody || tableBody === observedTableBody) return;

    observer.disconnect();
    observedTableBody = tableBody;
    refreshEnhancedSelects(tableBody);
    observer.observe(tableBody, { childList: true, subtree: true });
    if (tableBody.parentElement) {
      observer.observe(tableBody.parentElement, { childList: true });
    }
  };
  attachTableObserver();
  // Close sidepanels when modal closes
  const modalObserver = new MutationObserver((mutations) => {
    mutations.forEach(m=>{
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const modal=document.getElementById('man-hour-manage-modal');
        if (!modal) return;

        if (modal.classList.contains('show')) {
          // Ensure custom select wrappers are available whenever modal is shown.
          setTimeout(() => refreshEnhancedSelects(modal), 80);
          return;
        }

        if (!modal.classList.contains('show')) {
          const sidepanel=document.querySelector('.select-sidepanel');
          if(sidepanel){ sidepanel.classList.remove('open'); setTimeout(()=>sidepanel.remove(),0); }
        }
      }
    });
  });

  // Keep observing current modal; it can be recreated by page scripts.
  let observedModal = null;
  const attachModalObserver = () => {
    const modal = document.getElementById('man-hour-manage-modal');
    if (!modal || modal === observedModal) return;
    modalObserver.disconnect();
    observedModal = modal;
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
    if (modal.classList.contains('show')) {
      setTimeout(() => refreshEnhancedSelects(modal), 80);
    }
  };
  attachModalObserver();

  setInterval(() => {
    attachModalObserver();
    attachTableObserver();
  }, 500);
}

// Enhance a single select element with custom dropdown functionality and modern styling
function enhanceSelectElement(selectElement) {
  // Mark this element as enhanced
  selectElement.dataset.enhanced = 'true';
  
  // Determine if this is a project or task select with resilient heuristics
  const identity = `${selectElement.id || ''} ${selectElement.name || ''}`.toLowerCase();
  const optionsText = Array.from(selectElement.options || [])
    .slice(0, 5)
    .map(o => (o?.textContent || '').toLowerCase())
    .join(' ');

  let isProject = /project/.test(identity) || /プロジェクト/.test(optionsText);
  let isTask = /task/.test(identity) || /タスク/.test(optionsText);

  // Fallback: infer by select order in the same row (project first, task second)
  if (!isProject && !isTask) {
    const row = selectElement.closest('tr');
    if (row) {
      const rowSelects = Array.from(row.querySelectorAll('select')).filter(sel => {
        const sig = `${sel.id || ''} ${sel.name || ''}`.toLowerCase();
        return /project|task/.test(sig) || sel.options.length > 0;
      });
      const index = rowSelects.indexOf(selectElement);
      if (index === 0) isProject = true;
      if (index === 1) isTask = true;
    }
  }

  // Final fallback so we always assign one role
  if (!isProject && !isTask) isTask = true;
  if (isProject && isTask) {
    // If both match, prefer explicit option text
    if (/タスク/.test(optionsText)) isProject = false;
    else if (/プロジェクト/.test(optionsText)) isTask = false;
  }
  
  // Create the custom select button with modern styling
  const customSelect = document.createElement('div');
  customSelect.className = 'custom-select-wrapper';
  if (isProject) {
    customSelect.classList.add('project-select');
    customSelect.dataset.selectRole = 'project';
    selectElement.dataset.selectRole = 'project';
  } else if (isTask) {
    customSelect.classList.add('task-select');
    customSelect.dataset.selectRole = 'task';
    selectElement.dataset.selectRole = 'task';
  }
  
  // Apply modern styling directly
  customSelect.style.position = 'relative';
  customSelect.style.display = 'flex';
  customSelect.style.alignItems = 'center';
  customSelect.style.border = '1px solid var(--color-border)';
  customSelect.style.borderRadius = '0.25rem';
  customSelect.style.backgroundColor = 'var(--color-surface)';
  customSelect.style.padding = '0.25rem 0.5rem';
  customSelect.style.cursor = 'pointer';
  customSelect.style.transition = 'border-color 150ms ease, box-shadow 150ms ease';
  
  // Create the select display that shows the current selection
  const selectDisplay = document.createElement('div');
  selectDisplay.className = 'select-display';
  selectDisplay.style.flexGrow = '1';
  selectDisplay.style.padding = '0.25rem';
  selectDisplay.style.overflow = 'hidden';
  selectDisplay.style.textOverflow = 'ellipsis';
  selectDisplay.style.whiteSpace = 'nowrap';
  
  // Set initial display text
  const selectedOption = selectElement.options[selectElement.selectedIndex];
  if (selectedOption && selectedOption.value && selectedOption.text) {
    selectDisplay.textContent = selectedOption.text;
  } else {
    selectDisplay.textContent = isProject ? '(プロジェクト未選択)' : '(タスク未選択)';
    selectDisplay.classList.add('placeholder');
  }
  
  // Add dropdown arrow
  const dropdownArrow = document.createElement('div');
  dropdownArrow.className = 'dropdown-btn';
  dropdownArrow.innerHTML = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  
  // Add elements to the custom select
  customSelect.appendChild(selectDisplay);
  customSelect.appendChild(dropdownArrow);
  
  // Check if the select is required and transfer validation information
  if (selectElement.required) {
    // Create validation tooltip
    const validationTooltip = document.createElement('div');
    validationTooltip.className = 'validation-tooltip';
    validationTooltip.textContent = selectElement.getAttribute('title') || 
                                   selectElement.getAttribute('data-title') || 
                                   'リスト内の項目を選択してください。';
    validationTooltip.style.position = 'absolute';
    validationTooltip.style.backgroundColor = 'var(--color-danger)';
    validationTooltip.style.color = 'var(--color-white)';
    validationTooltip.style.padding = '4px 8px';
    validationTooltip.style.borderRadius = '4px';
    validationTooltip.style.fontSize = '12px';
    validationTooltip.style.top = '-30px';
    validationTooltip.style.left = '0';
    validationTooltip.style.zIndex = '100';
    validationTooltip.style.display = 'none';
    validationTooltip.style.whiteSpace = 'nowrap';
    
    // Add tooltip arrow
    validationTooltip.style.boxShadow = 'var(--shadow-tooltip)';
    validationTooltip.style.fontWeight = '500';
    
    // Add tooltip to custom select
    customSelect.appendChild(validationTooltip);
    
    // Function to show/hide tooltip based on validation state
    const updateValidationUI = () => {
      // Check if the select has a valid value
      const hasValue = selectElement.value && selectElement.value !== '';
      
      if (!hasValue) {
        // Not valid - show validation state
        customSelect.style.borderColor = 'var(--color-danger)';
        customSelect.style.boxShadow = '0 0 0 0.2rem var(--color-danger-light)';
        customSelect.setAttribute('data-invalid', 'true');
        
        // Add mouse hover to show tooltip
        customSelect.addEventListener('mouseenter', showTooltip);
        customSelect.addEventListener('mouseleave', hideTooltip);
      } else {
        // Valid - return to normal state
        customSelect.style.borderColor = 'var(--color-border)';
        customSelect.style.boxShadow = 'none';
        customSelect.removeAttribute('data-invalid');
        
        // Remove mouse hover for tooltip
        customSelect.removeEventListener('mouseenter', showTooltip);
        customSelect.removeEventListener('mouseleave', hideTooltip);
      }
    };
    
    // Define tooltip show/hide functions
    const showTooltip = () => {
      validationTooltip.style.display = 'block';
    };
    
    const hideTooltip = () => {
      validationTooltip.style.display = 'none';
    };
    
    // Run initially
    updateValidationUI();
    
    // Update when select value changes
    selectElement.addEventListener('change', updateValidationUI);
    
    // Also create a click handler that focuses on the original element
    // to trigger browser's built-in validation
    customSelect.addEventListener('click', () => {
      // Set focus on the select briefly to trigger validation
      selectElement.focus();
      // Then remove focus
      setTimeout(() => selectElement.blur(), 10);
    });
  }
  
  // Function to create sidepanel (moved inside enhanceSelectElement)
  function createSidepanel() {
    // Remove any existing sidepanels
    const existingSidepanel = document.querySelector('.select-sidepanel');
    if (existingSidepanel) {
      existingSidepanel.remove();
    }
    
    // Create a new sidepanel
    const sidepanel = document.createElement('div');
    sidepanel.className = 'select-sidepanel';
    if (isProject) {
      sidepanel.classList.add('project-panel');
    } else if (isTask) {
      sidepanel.classList.add('task-panel');
    }
    
    // Create header for the sidepanel
    const panelHeader = document.createElement('div');
    panelHeader.className = 'sidepanel-header';
    panelHeader.style.display = 'flex';
    panelHeader.style.alignItems = 'center';
    panelHeader.style.gap = '10px';
    
    const panelTitle = document.createElement('h3');
    panelTitle.textContent = isProject ? 'プロジェクト選択' : 'タスク選択';
    panelTitle.style.whiteSpace = 'nowrap';
    
    // Create search input field
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'sidepanel-search';
    searchInput.placeholder = '検索...';
    searchInput.style.flex = '1';
    searchInput.style.padding = '6px 10px';
    searchInput.style.borderRadius = '6px';
    searchInput.style.border = '1px solid var(--border-color, #DEE2E6)';
    searchInput.style.fontSize = '13px';
    
    // Add search functionality
    searchInput.addEventListener('input', (e) => {
      console.log('Search input event fired');
      const searchTerm = e.target.value.toLowerCase();
      const currentOptionsList = sidepanel.querySelector('.options-list');
      const options = currentOptionsList.querySelectorAll('.option-item');
      console.log('Found options:', options);

      options.forEach(option => {
        const text = option.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
          option.style.display = '';
        } else {
          option.style.display = 'none';
        }
      });
    });
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sidepanel-close';
    closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    closeBtn.style.flexShrink = '0';
    closeBtn.addEventListener('click', () => {
      sidepanel.classList.remove('open');
      setTimeout(() => {
        sidepanel.remove();
      }, 300); // Wait for the transition to complete
    });
    
    panelHeader.appendChild(panelTitle);
    panelHeader.appendChild(searchInput);
    panelHeader.appendChild(closeBtn);
    sidepanel.appendChild(panelHeader);
    
    // Add tabs container
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs-container';
    
    // Generate tab categories from option text
    const categories = generateCategories(selectElement);
    
    // Create "All" tab first
    const allTab = document.createElement('div');
    allTab.className = 'tab active';
    allTab.dataset.category = 'all';
    allTab.textContent = 'すべて';
    tabsContainer.appendChild(allTab);
    
    // Create tabs for each category
    categories.forEach(category => {
      const tab = document.createElement('div');
      tab.className = 'tab';
      tab.dataset.category = category.id;
      tab.textContent = category.name;
      tabsContainer.appendChild(tab);
    });
    
    sidepanel.appendChild(tabsContainer);
    
    // Make tabs container draggable
    if (typeof window.makeTabsContainerDraggable === 'function') { // Check if draggable function exists
      window.makeTabsContainerDraggable(tabsContainer);
    }
    
    // Create options container
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'options-container';
    
    // Create options list
    const optionsList = document.createElement('ul');
    optionsList.className = 'options-list';
    
    // Add "no options" message if needed
    if (selectElement.options.length <= 1 || (selectElement.options.length === 1 && selectElement.options[0].value === '')) {
      const noOptions = document.createElement('li');
      noOptions.className = 'no-options';
      noOptions.textContent = isProject ? 'プロジェクトがありません' : 'タスクがありません';
      optionsList.appendChild(noOptions);
    } else {
      // Add all options to the list and assign categories
      for (let i = 0; i < selectElement.options.length; i++) {
        const option = selectElement.options[i];
        if (!option.value && i > 0) continue;
        
        const optionItem = document.createElement('li');
        optionItem.className = 'option-item';
        optionItem.dataset.value = option.value;
        optionItem.textContent = option.text;
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-option-btn';
        copyBtn.textContent = 'コピー';
        optionItem.appendChild(copyBtn);
        
        const optionCategories = assignOptionToCategories(option.text, categories);
        optionItem.dataset.categories = optionCategories.join(',');
        
        if (option.selected) {
          optionItem.classList.add('selected');
        }
        
        // Handle option selection
        optionItem.addEventListener('click', () => {
          selectElement.value = option.value;
          const event = new Event('change', { bubbles: true });
          selectElement.dispatchEvent(event);
          
          selectDisplay.textContent = option.text;
          selectDisplay.classList.remove('placeholder');
          
          optionsList.querySelectorAll('.option-item').forEach(opt => opt.classList.remove('selected'));
          optionItem.classList.add('selected');
          
          if (isProject) {
            setTimeout(() => {
              const row = selectElement.closest('tr');
              if (!row) return;

              const taskWrapper = row.querySelector('.custom-select-wrapper.task-select') ||
                row.querySelector('.custom-select-wrapper[data-select-role="task"]') ||
                Array.from(row.querySelectorAll('.custom-select-wrapper')).find(el => el.classList.contains('task-select'));

              const taskSelect = row.querySelector('select[name="tasks[]"]') ||
                row.querySelector('select[name*="task"]') ||
                row.querySelector('select[id*="task"]') ||
                row.querySelector('select[data-select-role="task"]') ||
                (() => {
                  const rowSelects = Array.from(row.querySelectorAll('select'));
                  const index = rowSelects.indexOf(selectElement);
                  return index >= 0 ? rowSelects[index + 1] || null : null;
                })() ||
                (taskWrapper && taskWrapper.previousElementSibling && taskWrapper.previousElementSibling.tagName === 'SELECT'
                  ? taskWrapper.previousElementSibling
                  : null);

              if (!taskSelect || taskSelect === selectElement) return;

              const selectedTaskOption = taskSelect.options[taskSelect.selectedIndex];
              const isTaskUnselected = !taskSelect.value ||
                taskSelect.value === '' ||
                (selectedTaskOption && /未選択|選択してください/.test(selectedTaskOption.textContent || ''));

              if (!isTaskUnselected || !taskWrapper) return;

              taskWrapper.setAttribute('data-needs-attention', 'true');
              taskWrapper.click();
              taskSelect.addEventListener('change', () => {
                const currentOption = taskSelect.options[taskSelect.selectedIndex];
                const stillUnselected = !taskSelect.value ||
                  taskSelect.value === '' ||
                  (currentOption && /未選択|選択してください/.test(currentOption.textContent || ''));
                if (!stillUnselected) {
                  taskWrapper.removeAttribute('data-needs-attention');
                }
              }, { once: true });
            }, 150);
          } else if (isTask) {
            // After selecting a task, focus the man-hour input field
            const row = selectElement.closest('tr');
            if (row) {
              const timeInput = row.querySelector('input.man-hour-input[name="minutes[]"]');
              if (timeInput) {
                timeInput.focus();
              }
            }
            // Hide the task selection sidepanel
            sidepanel.classList.remove('open');
            setTimeout(() => sidepanel.remove(), 300);
          }
        });
        optionsList.appendChild(optionItem);
      }
    }
    
    optionsContainer.appendChild(optionsList);
    sidepanel.appendChild(optionsContainer);
    
    // Add Copy Button Event Listener
    optionsContainer.addEventListener('click', (event) => {
      if (event.target.classList.contains('copy-option-btn')) {
        event.stopPropagation();
        const button = event.target;
        const optionItem = button.closest('.option-item');
        if (!optionItem) return;
        const clonedItem = optionItem.cloneNode(true);
        const btnClone = clonedItem.querySelector('.copy-option-btn');
        if (btnClone) btnClone.remove();
        const textToCopy = clonedItem.textContent.trim();
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalText = button.textContent;
          button.textContent = 'コピー済み';
          button.disabled = true;
          setTimeout(() => { button.textContent = originalText; button.disabled = false; }, 1000);
        }).catch(err => console.error('Failed to copy text: ', err));
      }
    });
    
    // Add tab click event listeners
    const tabs = tabsContainer.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const selectedCategory = tab.dataset.category;
        const options = optionsList.querySelectorAll('.option-item');
        options.forEach(option => {
          if (selectedCategory === 'all') {
            option.style.display = '';
          } else {
            const optionCategories = option.dataset.categories ? option.dataset.categories.split(',') : [];
            option.style.display = optionCategories.includes(selectedCategory) ? '' : 'none';
          }
        });
      });
    });
    
    document.body.appendChild(sidepanel);
    
    const modal = document.getElementById('man-hour-manage-modal');
    if (modal) {
      const modalRect = modal.getBoundingClientRect();
      sidepanel.style.top = `${modalRect.top}px`;
      sidepanel.style.left = `${modalRect.left - 400}px`;
    }
    
    setTimeout(() => {
      sidepanel.classList.add('open');
      setTimeout(() => searchInput.focus(), 100);
    }, 50);
    
    // Keyboard navigation
    let currentFocusedIndex = -1;
    const highlightClass = 'keyboard-focused';
    searchInput.addEventListener('keydown', (e) => {
      const options = optionsList.querySelectorAll('.option-item');
      const visibleOptions = Array.from(options).filter(option => option.style.display !== 'none');
      if (!visibleOptions.length) return;
      const removeHighlight = () => {
        if (currentFocusedIndex >= 0 && currentFocusedIndex < visibleOptions.length) {
          visibleOptions[currentFocusedIndex].classList.remove(highlightClass);
        }
      };
      const addHighlight = () => {
        if (currentFocusedIndex >= 0 && currentFocusedIndex < visibleOptions.length) {
          visibleOptions[currentFocusedIndex].classList.add(highlightClass);
          visibleOptions[currentFocusedIndex].scrollIntoView({ block: 'nearest' });
        }
      };
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault(); removeHighlight();
          currentFocusedIndex = (currentFocusedIndex + 1) % visibleOptions.length;
          addHighlight(); break;
        case 'ArrowUp':
          e.preventDefault(); removeHighlight();
          currentFocusedIndex = currentFocusedIndex <= 0 ? visibleOptions.length - 1 : currentFocusedIndex - 1;
          addHighlight(); break;
        case 'Enter':
          if (currentFocusedIndex >= 0 && currentFocusedIndex < visibleOptions.length) {
            e.preventDefault(); visibleOptions[currentFocusedIndex].click();
          } break;
      }
    });
    return sidepanel;
  }
  
  // Handle click on custom select
  customSelect.addEventListener('click', (e) => {
    createSidepanel();
    e.stopPropagation();
  });
  
  // Add hover effect
  customSelect.addEventListener('mouseenter', () => {
    customSelect.style.borderColor = 'var(--color-primary-border)';
    customSelect.style.boxShadow = 'var(--shadow-button-sm)';
  });
  
  customSelect.addEventListener('mouseleave', () => {
    customSelect.style.borderColor = 'var(--color-border)';
    customSelect.style.boxShadow = 'none';
  });
  
  // Hide the original select
  selectElement.style.display = 'none';
  
  // Insert the custom select after the original
  selectElement.parentNode.insertBefore(customSelect, selectElement.nextSibling);
}

// Generate categories based on option text patterns
function generateCategories(selectElement) {
  const wordCounts = {};
  const allWords = [];
  for (let i = 0; i < selectElement.options.length; i++) {
    const option = selectElement.options[i];
    if (!option.value && i > 0) continue;
    const words = option.text.split(/[/\s,、・【】]/g).filter(word => word.length >= 2 && !/^\d+$/.test(word) && !['選択', '未分類'].includes(word));
    words.forEach(word => {
      if (!wordCounts[word]) { wordCounts[word] = 0; allWords.push(word); }
      wordCounts[word]++;
    });
  }
  allWords.sort((a, b) => wordCounts[b] - wordCounts[a]);
  const categories = allWords.filter(word => wordCounts[word] >= 2).slice(0, 10).map((word, index) => ({ id: `cat_${index}`, name: word, word: word }));
  return categories;
}

// Assign an option to categories based on its text
function assignOptionToCategories(optionText, categories) {
  const assignedCategories = [];
  categories.forEach(category => {
    if (optionText.includes(category.word)) {
      assignedCategories.push(category.id);
    }
  });
  return assignedCategories;
}

// Simplify any complex table headers (e.g., change 工数(時間) to 工数)
function simplifyTableHeaders() {
  if (window.__jbe_simplifyHeadersInited) return;
  window.__jbe_simplifyHeadersInited = true;
  // Find man-hour table headers
  const observer = new MutationObserver((mutations) => {
    document.querySelectorAll('th').forEach(header => {
      if (header.textContent === '工数(時間)' && !header.dataset.simplified) {
        header.textContent = '工数'; header.dataset.simplified = 'true';
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('th').forEach(header => {
    if (header.textContent === '工数(時間)' && !header.dataset.simplified) {
      header.textContent = '工数'; header.dataset.simplified = 'true';
    }
  });
}

// Enhance the collapseInfo section to make it more compact and user-friendly
function enhanceCollapseInfo() {
  if (window.__jbe_enhanceCollapseInfoInited) return;
  window.__jbe_enhanceCollapseInfoInited = true;
  const observer = new MutationObserver(() => {
    const collapseInfo = document.getElementById('collapseInfo');
    if (collapseInfo && !collapseInfo.dataset.enhanced) {
      collapseInfo.dataset.enhanced = 'true';
      processCollapseInfo(collapseInfo); // Refactored logic
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also run immediately if collapseInfo already exists
  const collapseInfo = document.getElementById('collapseInfo');
  if (collapseInfo && !collapseInfo.dataset.enhanced) {
    collapseInfo.dataset.enhanced = 'true';
    processCollapseInfo(collapseInfo); // Refactored logic
  }
}

// New function to handle the logic for enhancing collapseInfo
function processCollapseInfo(collapseInfo) {
  // Make cards compact
  collapseInfo.querySelectorAll('.card, .jbc-card').forEach(c => c.classList.add('compact-card'));

  // Remove existing buttons first to avoid duplicates on re-run
  collapseInfo.querySelectorAll('.toggle-zero-values-btn').forEach(btn => btn.remove());

  // Process each card individually
  collapseInfo.querySelectorAll('.card, .jbc-card, .compact-card').forEach(card => {
    // Find zero value rows in this specific card
    const zeroValueRows = [];
    const tables = card.querySelectorAll('table');
    tables.forEach(table => {
      table.querySelectorAll('tr').forEach(row => {
        const valueCell = row.querySelector('td');
        if (valueCell) {
          const value = valueCell.textContent.trim();
          const isZero = value === '0' || value === '0.0' || value.includes('0 日') || value.includes('0 回') ||
                       value.includes('0時間') || value.includes('0分') || value === '00:00' ||
                       /^[0]+$/.test(value.replace(/[^0-9]/g, ''));
          if (isZero) {
            row.classList.add('zero-value-row');
            zeroValueRows.push(row);
          } else {
            row.classList.remove('zero-value-row'); // Ensure class is removed if value changes
          }
        }
      });
    });

    // Hide zero value rows initially in this card
    zeroValueRows.forEach(row => {
      row.style.display = 'none';
    });

    // Add toggle button to this card's header if it has zero value rows
    if (zeroValueRows.length > 0) {
      const header = card.querySelector('.card-header, .jbc-card-header');
      if (header) {
        // Create the toggle button
        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-zero-values-btn';
        toggleButton.textContent = '全項目を表示';
        toggleButton.setAttribute('type', 'button');

        // Add event listener for this specific button and its card
        toggleButton.addEventListener('click', () => {
          const isShowing = toggleButton.classList.contains('showing');
          const newDisplay = isShowing ? 'none' : 'table-row';
          const newText = isShowing ? '全項目を表示' : '必要項目のみ表示';

          // Toggle only the zero rows within this card
          zeroValueRows.forEach(row => {
            row.style.display = newDisplay;
          });

          // Update only this button's state
          toggleButton.textContent = newText;
          if (isShowing) {
            toggleButton.classList.remove('showing');
          } else {
            toggleButton.classList.add('showing');
          }
        });

        // Append button to header
        header.appendChild(toggleButton);
      }
    }
  });
}

// Enhance title with tooltip and formatting
function enhanceTitle(titleContainer) {
  if (!titleContainer || titleContainer.dataset.enhanced === 'true') return;
  titleContainer.dataset.enhanced = 'true';
  
  // Get the original title text
  const originalText = titleContainer.textContent.trim();
  if (!originalText) return;
  
  // Create a wrapper for the title
  const wrapper = document.createElement('div');
  wrapper.className = 'enhanced-title-wrapper';
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  
  // Create the main title element
  const title = document.createElement('span');
  title.className = 'enhanced-title';
  
  // Process the title text to add highlighting or formatting
  let processedText = originalText;
  let tooltipText = '';
  
  // Special formatting for specific title patterns
  if (originalText.includes('-')) {
    const parts = originalText.split('-').map(part => part.trim());
    const firstPart = parts[0];
    const rest = parts.slice(1).join(' - ');
    
    // Format with first part bold
    processedText = `<strong>${firstPart}</strong> - ${rest}`;
    
    // Use first part as tooltip if it looks like a code
    if (/^[A-Z0-9\-\_]+$/.test(firstPart)) {
      tooltipText = `Reference: ${firstPart}`;
    }
  } else if (originalText.includes(':')) {
    const parts = originalText.split(':').map(part => part.trim());
    const firstPart = parts[0];
    const rest = parts.slice(1).join(': ');
    
    // Format with first part bold
    processedText = `<strong>${firstPart}</strong>: ${rest}`;
    // Finalize enhanceTitle
    title.innerHTML = processedText;
    wrapper.appendChild(title);
    titleContainer.innerHTML = '';
    titleContainer.appendChild(wrapper);
  }
}
