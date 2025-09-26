// Background service worker stores the sequence of screenshots and clicked element info
let shots = []; // {dataUrl, step, info, url, timestamp}
let active = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'capture-request') {
    // Called by content script to request a visible-tab capture (we show cursor overlay first in content script)
    chrome.tabs.captureVisibleTab(sender.tab.windowId, {format: 'png'}, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('capture error', chrome.runtime.lastError);
        sendResponse({success:false, error: chrome.runtime.lastError.message});
        return;
      }
      const step = shots.length + 1;
      shots.push({dataUrl, step, info: msg.info, url: sender.tab.url, timestamp: Date.now()});
      sendResponse({success:true, step});
    });
    // indicate async response
    return true;
  }

  if (msg?.type === 'get-shots') {
    sendResponse({shots});
  }

  if (msg?.type === 'clear-shots') {
    shots = [];
    sendResponse({ok:true});
  }

  if (msg?.type === 'set-active') {
    active = !!msg.active;
    sendResponse({active});
  }

  if (msg?.type === 'get-active') {
    sendResponse({active});
  }
});

// Expose a method to get current active state
chrome.runtime.onMessageExternal && chrome.runtime.onMessageExternal.addListener(() => {});