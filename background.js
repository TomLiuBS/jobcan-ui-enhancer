// background.js

// Listen for login requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'performJobcanLogin') {
    const { email, password } = message;
    // Create a tab for login (background)
    chrome.tabs.create({ url: 'https://id.jobcan.jp/users/sign_in', active: false }, tab => {
      const loginTabId = tab.id;
      let responseSent = false;
      let credentialsInjected = false;
      let attemptedNavigateToEmployee = false;

      const onUpdatedListener = (updatedTabId, changeInfo, updatedTab) => {
        if (updatedTabId !== loginTabId) return;

        const currentUrl = (changeInfo.url) || (updatedTab && updatedTab.url) || '';

        // Success case: reached employee portal
        if (currentUrl.includes('https://ssl.jobcan.jp/employee')) {
          handleSuccessfulLogin(loginTabId);
          chrome.tabs.onUpdated.removeListener(onUpdatedListener);
          if (!responseSent) { responseSent = true; sendResponse({ success: true }); }
          return;
        }

        // If we're still on sign_in and page completed, inject once
        if ((currentUrl.includes('https://id.jobcan.jp/users/sign_in') || (!currentUrl && updatedTab && updatedTab.url && updatedTab.url.includes('https://id.jobcan.jp/users/sign_in'))) && changeInfo.status === 'complete' && !credentialsInjected) {
          // Try to inject credentials
          chrome.tabs.sendMessage(loginTabId, { action: 'injectLoginCredentials', email, password }, response => {
            if (response && response.success) {
              credentialsInjected = true;
              // Give SSO a moment to set cookies, then navigate if we haven't been redirected yet
              if (!attemptedNavigateToEmployee) {
                attemptedNavigateToEmployee = true;
                setTimeout(() => {
                  chrome.tabs.update(loginTabId, { url: 'https://ssl.jobcan.jp/jbcoauth/login' });
                }, 800);
              }
            } else {
              // Injection failed; surface the tab and respond
              chrome.tabs.update(loginTabId, { active: true });
              chrome.tabs.onUpdated.removeListener(onUpdatedListener);
              if (!responseSent) { responseSent = true; sendResponse({ success: false }); }
            }
          });
          return;
        }

        // If redirected to id.jobcan.jp pages like account/profile after login, force navigate to employee
        if (credentialsInjected && currentUrl.startsWith('https://id.jobcan.jp/')) {
          if (!attemptedNavigateToEmployee) {
            attemptedNavigateToEmployee = true;
            chrome.tabs.update(loginTabId, { url: 'https://ssl.jobcan.jp/jbcoauth/login' });
          }
          return;
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdatedListener);
    });
    return true; // Keep the message channel open for async response
  }
});

// Focus the employee dashboard on successful login
function handleSuccessfulLogin(tabId) {
  chrome.tabs.update(tabId, { url: 'https://ssl.jobcan.jp/employee', active: true });
} 