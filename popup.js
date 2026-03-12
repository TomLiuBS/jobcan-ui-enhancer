document.addEventListener('DOMContentLoaded', function() {
  const darkModeToggle = document.getElementById('darkMode');
  const showSecondsToggle = document.getElementById('showSeconds');
  const showProgressBarToggle = document.getElementById('showProgressBar');
  const clockSizeRadios = document.querySelectorAll('input[name="clockSize"]');
  
  // Login form elements
  const employeeLoginBtn = document.getElementById('employeeLoginBtn');
  const loginSettingsIcon = document.getElementById('loginSettingsIcon');
  const loginForm = document.getElementById('loginForm');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const rememberLogin = document.getElementById('rememberLogin');
  const submitLogin = document.getElementById('submitLogin');
  const cancelLogin = document.getElementById('cancelLogin');
  const loginStatus = document.getElementById('loginStatus');
  const securityNote = document.getElementById('securityNote');
  
  // Dropdown elements
  const dropdownContainers = document.querySelectorAll('.dropdown-container');
  
  // Dropdown toggles
  const timeCorrectionToggle = document.getElementById('timeCorrection-expand');
  const manHourToggle = document.getElementById('manHour-expand');
  const applicationToggle = document.getElementById('application-expand');
  
  // Debug buttons
  const testParticleBtn = document.getElementById('testParticleBtn');
  const debugInfoBtn = document.getElementById('debugInfoBtn');
  
  // Load saved settings
  chrome.storage.sync.get(
    ['darkMode', 'clockSize', 'showSeconds', 'showProgressBar'], 
    function(result) {
      if (result.darkMode !== undefined) {
        darkModeToggle.checked = result.darkMode;
        // Apply dark mode to popup if enabled
        if (result.darkMode) {
          document.body.classList.add('dark-mode');
        } else {
          document.body.classList.remove('dark-mode');
        }
      }
      
      // Set clock size radio buttons
      if (result.clockSize) {
        document.querySelector(`input[name="clockSize"][value="${result.clockSize}"]`).checked = true;
      }
      
      // Set seconds toggle
      if (result.showSeconds !== undefined) {
        showSecondsToggle.checked = result.showSeconds;
      }
      
      // Set progress bar toggle
      if (result.showProgressBar !== undefined) {
        showProgressBarToggle.checked = result.showProgressBar;
      } else {
        // Default to enabled
        showProgressBarToggle.checked = true;
      }
    }
  );
  
  // Load saved login if "remember me" was checked
  chrome.storage.sync.get(['rememberedLogin'], function(result) {
    if (result.rememberedLogin) {
      loginEmail.value = result.rememberedLogin.email || '';
      // If we have saved password, populate it
      if (result.rememberedLogin.password) {
        loginPassword.value = result.rememberedLogin.password;
      }
      if (result.rememberedLogin.rememberChecked) {
        rememberLogin.checked = true;
        // Show security note if remember is checked
        securityNote.style.display = 'block';
      }
    }
  });
  
  darkModeToggle.addEventListener('change', function() {
    const isEnabled = this.checked;
    chrome.storage.sync.set({darkMode: isEnabled});
    
    // Apply dark mode to popup
    if (isEnabled) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    
    showToast(isEnabled ? "Dark mode enabled" : "Dark mode disabled");
    
    // Send message to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleDarkMode',
          enabled: isEnabled
        });
      }
    });
  });
  
  // Handle clock size changes
  clockSizeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.checked) {
        chrome.storage.sync.set({clockSize: this.value});
        showToast(`Clock size updated to ${this.value}`);
        
        // Send message to content script
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateClockSettings',
              clockSize: radio.value
            });
          }
        });
      }
    });
  });
  
  // Handle show seconds toggle
  showSecondsToggle.addEventListener('change', function() {
    const isEnabled = this.checked;
    chrome.storage.sync.set({showSeconds: isEnabled});
    showToast(isEnabled ? "Seconds display enabled" : "Seconds display disabled");
    
    // Send message to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateClockSettings',
          showSeconds: isEnabled
        });
      }
    });
  });
  
  // Handle show progress bar toggle
  showProgressBarToggle.addEventListener('change', function() {
    const isEnabled = this.checked;
    chrome.storage.sync.set({showProgressBar: isEnabled});
    showToast(isEnabled ? "Progress bar enabled" : "Progress bar disabled");
    
    // Send message to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateClockSettings',
          showProgressBar: isEnabled
        });
      }
    });
  });
  
  // Handle dropdown toggles with animation
  dropdownContainers.forEach(container => {
    const btn = container.querySelector('.quick-access-btn');
    const expandIcon = container.querySelector('.expand-icon');
    const menuId = expandIcon ? expandIcon.id.replace('-expand', '-menu') : null;
    
    if (btn && menuId) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const menuElement = document.getElementById(menuId);
        const isOpen = menuElement.style.display === 'block';
        
        // Close all submenus first
        document.querySelectorAll('.sub-menu').forEach(menu => {
          menu.style.display = 'none';
        });
        
        // Reset all expand icons
        document.querySelectorAll('.expand-icon').forEach(icon => {
          icon.textContent = '+';
          icon.style.transform = 'rotate(0deg)';
        });
        
        if (!isOpen) {
          menuElement.style.display = 'block';
          expandIcon.textContent = '-';
          expandIcon.style.transform = 'rotate(180deg)';
        }
      });
    }
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', function(e) {
    // Only close if the click is not on a dropdown toggle or within a submenu
    if (!e.target.closest('.dropdown-container')) {
      document.querySelectorAll('.sub-menu').forEach(menu => {
        menu.style.display = 'none';
      });
      
      document.querySelectorAll('.expand-icon').forEach(icon => {
        icon.textContent = '+';
        icon.style.transform = 'rotate(0deg)';
      });
    }
  });
  
  // Handle quick access link clicks
  document.querySelectorAll('.sub-menu-item').forEach(link => {
    link.addEventListener('click', function(e) {
      if (this.href) {
        e.preventDefault();
        chrome.tabs.create({ url: this.href });
        showToast(`Opening ${this.textContent.trim()}...`);
      }
    });
  });
  
  // Handle direct links (not in dropdowns)
  document.querySelectorAll('.quick-access-btn:not(.dropdown-container > .quick-access-btn)').forEach(link => {
    link.addEventListener('click', function(e) {
      if (this.href) {
        e.preventDefault();
        chrome.tabs.create({ url: this.href });
        showToast(`Opening ${this.textContent.trim()}...`);
      }
    });
  });
  
  // Make the main button perform login, and settings icon toggle the form
  employeeLoginBtn.addEventListener('click', function(e) {
    // Ignore clicks on the settings icon (those are handled separately)
    if (e.target === loginSettingsIcon || e.target.closest('#loginSettingsIcon')) {
      return;
    }
    
    // If form is visible, use the entered credentials
    if (loginForm.style.display === 'block') {
      const email = loginEmail.value.trim();
      const password = loginPassword.value;
      
      if (!email || !password) {
        showToast('Please enter both email and password', 2000);
        return;
      }
      
      // Add security warning if saving password
      if (rememberLogin.checked) {
        // Store the credentials immediately so they're saved even if login fails
        chrome.storage.sync.set({
          rememberedLogin: {
            email: email,
            password: password,
            rememberChecked: true
          }
        });
        
        // Show warning toast about password storage
        showToast('⚠️ Password stored in extension. For security, use only on personal devices.', 5000);
      }
      
      // Hide the form as we proceed with login
      loginForm.style.display = 'none';
      
      // Show loading state on the button
      const originalText = employeeLoginBtn.querySelector('span').textContent;
      employeeLoginBtn.querySelector('span').textContent = 'Logging in...';
      employeeLoginBtn.disabled = true;
      
      // Perform login
      performJobcanLogin(email, password, function() {
        // Reset button text after login attempt
        employeeLoginBtn.querySelector('span').textContent = originalText;
        employeeLoginBtn.disabled = false;
      });
    } 
    // If form is hidden, check if we have saved credentials
    else {
      const savedEmail = loginEmail.value;
      const savedPassword = loginPassword.value;
      
      // If we have both saved, login directly
      if (savedEmail && savedPassword) {
        // Show loading state on the button
        const originalText = employeeLoginBtn.querySelector('span').textContent;
        employeeLoginBtn.querySelector('span').textContent = 'Logging in...';
        employeeLoginBtn.disabled = true;
        
        // Perform login with saved credentials
        performJobcanLogin(savedEmail, savedPassword, function() {
          // Reset button text after login attempt
          employeeLoginBtn.querySelector('span').textContent = originalText;
          employeeLoginBtn.disabled = false;
        });
      } 
      // Otherwise show the form
      else {
        loginForm.style.display = 'block';
        loginEmail.focus();
      }
    }
  });
  
  // Make settings icon toggle the login form
  loginSettingsIcon.addEventListener('click', function(e) {
    e.stopPropagation(); // Prevent triggering the main button click
    
    if (loginForm.style.display === 'none') {
      loginForm.style.display = 'block';
      // Focus on the appropriate field
      if (loginEmail.value) {
        loginPassword.focus();
      } else {
        loginEmail.focus();
      }
    } else {
      loginForm.style.display = 'none';
    }
  });
  
  // Also allow pressing Enter in the password field to login
  loginPassword.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      employeeLoginBtn.click();
    }
  });
  
  // Toggle security note when remember checkbox is changed
  rememberLogin.addEventListener('change', function() {
    securityNote.style.display = this.checked ? 'block' : 'none';
  });
  
  // Debug buttons event listeners
  if (testParticleBtn) {
    testParticleBtn.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'testParticleEffects'
          }, function(response) {
            if (chrome.runtime.lastError) {
              showToast('Error: Make sure you\'re on a Jobcan page', 3000);
            } else if (response && response.success) {
              showToast(response.message, 2000);
            } else {
              showToast('No clock containers found. Make sure you\'re on a page with the enhanced clock.', 3000);
            }
          });
        }
      });
    });
  }
  
  if (debugInfoBtn) {
    debugInfoBtn.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'getDebugInfo'
          }, function(response) {
            if (chrome.runtime.lastError) {
              showToast('Error: Make sure you\'re on a Jobcan page', 3000);
            } else if (response) {
              const info = [
                `Clock containers: ${response.clockContainers}`,
                `Push buttons: ${response.pushButtons}`,
                `URL: ${response.currentUrl}`,
                `Page ready: ${response.pageReady ? 'Yes' : 'No'}`
              ].join('\\n');
              
              // Show debug info in console and toast
              console.log('Debug Info:', response);
              showToast(`Debug Info:\\n${info}`, 5000);
            }
          });
        }
      });
    });
  }
  
  // Function to perform Jobcan login
  function performJobcanLogin(email, password, callback) {
    // Delegate login to background service worker so it works even when the new tab is active
    showToast('Logging in...', 2000);
    chrome.runtime.sendMessage(
      { action: 'performJobcanLogin', email, password },
      function(response) {
        if (response && response.success) {
          showToast('Login successful!', 2000);
        } else {
          showToast('Login failed. Please check your credentials.', 3000);
        }
        if (callback) callback();
      }
    );
  }
  
  // Script injected into the login page to fill and submit credentials
  function injectLoginScript(email, password) {
    const emailField = document.querySelector('input[type="email"]') ||
                       document.querySelector('input[name="user[email]"]') ||
                       document.querySelector('#user_email');
    const passwordField = document.querySelector('input[type="password"]') ||
                          document.querySelector('input[name="user[password]"]') ||
                          document.querySelector('#user_password');
    const submitBtn = document.querySelector('button[type="submit"]') ||
                      document.querySelector('input[type="submit"]');
    if (emailField && passwordField && submitBtn) {
      emailField.value = email;
      emailField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.value = password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      submitBtn.click();
    }
  }
  
  // Poll the login tab for successful navigation
  function pollLoginStatus(tabId, callback) {
    let attempts = 0;
    const maxAttempts = 20; // allow for 10 seconds at 500ms intervals
    const interval = setInterval(() => {
      chrome.tabs.get(tabId, tab => {
        if (tab.url.includes('/employee')) {
          clearInterval(interval);
          handleSuccessfulLogin(tabId);
          if (callback) callback();
        } else if (attempts++ >= maxAttempts) {
          clearInterval(interval);
          showToast('Login failed. Please check your credentials.', 3000);
          chrome.tabs.update(tabId, { active: true });
          if (callback) callback();
        }
      });
    }, 500); // check twice as often
  }
  
  // Handle successful login by redirecting to the dashboard
  function handleSuccessfulLogin(tabId) {
    showToast('Login successful!', 2000);
    chrome.tabs.update(tabId, { url: 'https://ssl.jobcan.jp/employee', active: true });
  }
  
  // Function to show toast notification
  function showToast(message, duration = 3000) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.className = 'show';
    
    // Clear any existing timeout
    if (toast.timeoutId) {
      clearTimeout(toast.timeoutId);
    }
    
    // Set new timeout
    toast.timeoutId = setTimeout(function() {
      toast.className = toast.className.replace("show", "");
    }, duration);
  }
});
