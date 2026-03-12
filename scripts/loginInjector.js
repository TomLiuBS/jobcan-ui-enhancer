// scripts/loginInjector.js

// Listen for login injection requests from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'injectLoginCredentials') {
    const { email, password } = message;
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
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }
}); 