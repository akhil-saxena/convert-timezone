/**
 * TimeShift Extension Background Script
 * Handles context menu and extension lifecycle events
 */

const CONTEXT_MENU_ID = 'timeshift-convert';

// Extension installation/startup
chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

/**
 * Create context menu for text selection
 */
function createContextMenu() {
  try {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'TimeShift: Global Timezone Converter',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  } catch (error) {
    // Silent error handling
  }
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText) {
    try {
      // Store selected text for the popup to use
      await chrome.storage.local.set({
        selectedText: info.selectionText,
        fromContextMenu: true,
        timestamp: Date.now()
      });
      
      // Try to open the popup
      try {
        await chrome.action.openPopup();
      } catch (popupError) {
        // Set badge to indicate there's selected text waiting
        await chrome.action.setBadgeText({ text: '!' });
        await chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
        
        // Clear badge after 30 seconds
        setTimeout(() => {
          chrome.action.setBadgeText({ text: '' });
        }, 30000);
      }
      
    } catch (error) {
      // Silent error handling
    }
  }
});
