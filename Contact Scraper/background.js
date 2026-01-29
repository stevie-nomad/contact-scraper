// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.storage.local.get(['isEnabled'], function(result) {
      if (result.isEnabled) {
        chrome.tabs.sendMessage(tabId, {
          action: 'toggleScraping',
          isEnabled: true
        });
      }
    });
  }
});

// Listen for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.storage.local.get(['isEnabled'], function(result) {
    if (result.isEnabled) {
      chrome.tabs.sendMessage(activeInfo.tabId, {
        action: 'toggleScraping',
        isEnabled: true
      });
    }
  });
}); 