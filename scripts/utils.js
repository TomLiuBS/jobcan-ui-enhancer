// scripts/utils.js

// Variable for notification throttling
let lastNotificationTime = 0;

/**
 * Shows a notification message to the user
 * @param {string} message - The message to display
 * @param {number} duration - Duration in ms before auto-hiding (0 for no auto-hide)
 * @return {HTMLElement} - The notification element
 */
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
        }, 500); // Transition duration
      }
    }, duration);
  }
  
  return notification;
}

// Expose globally
window.showNotification = showNotification;
window.lastNotificationTime = lastNotificationTime; // Expose lastNotificationTime if needed by other modules (currently used within dataExtraction) 