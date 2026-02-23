// MV3 service worker: opens side panel and stores per-tab context updates.

const MATCH_PATTERNS = [
  /^https?:\/\/(www\.)?crunchyroll\.com\//,
  /^https?:\/\/(www\.)?netflix\.com\//,
];

async function ensureContentScript(tabId, url) {
  if (!url || !MATCH_PATTERNS.some(p => p.test(url))) return;
  try {
    // Probe: if this succeeds, content.js is already running — do nothing
    await chrome.tabs.sendMessage(tabId, { type: 'GET_CONTEXT' });
  } catch {
    // Not running — inject it
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch {
      // Tab may not be injectable (e.g. chrome:// pages) — ignore
    }
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab?.id;
  if (!tabId) return;

  try {
    if (chrome.sidePanel?.setOptions) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: "sidepanel.html",
        enabled: true,
      });
    }
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ tabId });
    }
  } catch {
    // ignore
  }

  await ensureContentScript(tabId, tab.url);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    await ensureContentScript(tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "CONTEXT_UPDATE") {
    const tabId = sender?.tab?.id;
    if (!tabId) return;

    const record = message.record;
    chrome.storage.local
      .set({
        [`context:${tabId}`]: record,
      })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));

    return true; // async
  }
});
