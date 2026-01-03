// MV3 service worker: opens side panel and stores per-tab context updates.

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

