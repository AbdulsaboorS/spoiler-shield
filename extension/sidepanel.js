// Side panel bridge: reads chrome.storage and posts show info into the React app
// running on the same page (no iframe — the React app is bundled into the extension).
// Communication is via window.postMessage('*') since both sides share the same window.

const MAX_CONTEXT_CHARS = 2000;

// Dedup: track last-sent show info key so we don't spam on every 3s poll when nothing changed.
let _lastSentShowKey = undefined;

function clampContext(text) {
  const s = String(text || "");
  if (s.length <= MAX_CONTEXT_CHARS) return s;
  return s.slice(s.length - MAX_CONTEXT_CHARS);
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0]?.id;
}

async function fetchContextForTab(tabId) {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: "GET_CONTEXT" });
    if (resp?.ok && resp.record) return resp.record;
  } catch {
    // fall back to stored record
  }

  try {
    const key = `context:${tabId}`;
    const obj = await chrome.storage.local.get(key);
    return obj?.[key] || null;
  } catch {
    return null;
  }
}

// Send detected show info to the React app via window.postMessage
async function sendShowInfoToApp() {
  try {
    const result = await chrome.storage.local.get("spoilershield_show_info");
    const showInfo = result.spoilershield_show_info;

    // Dedup: only send (and log) when data actually changed.
    const showKey = showInfo
      ? `${showInfo.showTitle}|${showInfo.platform}|${showInfo.episodeInfo?.season ?? ''}|${showInfo.episodeInfo?.episode ?? ''}`
      : 'none';
    if (showKey === _lastSentShowKey) return;
    _lastSentShowKey = showKey;

    console.log('[SpoilerShield] Show info changed → posting to app:', {
      showTitle: showInfo?.showTitle,
      platform: showInfo?.platform,
      hasEpisodeInfo: !!showInfo?.episodeInfo,
    });

    window.postMessage(
      {
        type: "SPOILERSHIELD_SHOW_INFO",
        payload: showInfo || { showTitle: '', platform: 'other' },
      },
      '*'
    );
  } catch (err) {
    console.error('[SpoilerShield] Error sending show info:', err);
  }
}

// Send context (subtitle buffer etc.) to the React app
async function sendContextToApp() {
  try {
    let result = await chrome.storage.local.get("spoilershield_context");
    let context = result.spoilershield_context;

    if (!context || (!context.contextText && (!Array.isArray(context.lines) || context.lines.length === 0))) {
      const tabId = await getActiveTabId();
      if (tabId) {
        const tabContext = await fetchContextForTab(tabId);
        if (tabContext) {
          const contextText = tabContext.contextText ||
            (Array.isArray(tabContext.lines) ? tabContext.lines.join(' ') : '') ||
            (Array.isArray(tabContext.buffer) ? tabContext.buffer.join(' ') : '');
          context = {
            platform: tabContext.platform || 'crunchyroll',
            title: tabContext.title || '',
            updatedAt: tabContext.updatedAt || tabContext.capturedAt || new Date().toISOString(),
            lines: tabContext.lines || tabContext.buffer || [],
            contextText,
          };
          try {
            await chrome.storage.local.set({ spoilershield_context: context });
          } catch { /* ignore */ }
        }
      }
    }

    window.postMessage(
      {
        type: "SPOILERSHIELD_CONTEXT",
        payload: context || null,
      },
      '*'
    );
  } catch (err) {
    console.error('[SpoilerShield] Error sending context:', err);
    window.postMessage({ type: "SPOILERSHIELD_CONTEXT", payload: null }, '*');
  }
}

// Listen for storage changes and immediately forward to the React app
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.spoilershield_show_info) {
    _lastSentShowKey = undefined; // reset dedup so new value always gets sent
    sendShowInfoToApp();
  }
  if (changes.spoilershield_context) {
    sendContextToApp();
  }
});

// Listen for requests from the React app
window.addEventListener("message", async (event) => {
  // Only handle messages from our own extension page
  if (!event.origin.startsWith('chrome-extension://') && event.origin !== location.origin) return;
  const type = event.data?.type;
  if (!type) return;

  if (type === "SPOILERSHIELD_REQUEST_SHOW_INFO") {
    await sendShowInfoToApp();
  }

  if (type === "SPOILERSHIELD_REQUEST_CONTEXT") {
    await sendContextToApp();
  }

  if (type === "SPOILERSHIELD_REQUEST_REDETECT") {
    console.log('[SpoilerShield] Re-detect requested');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "REDETECT_SHOW_INFO" }).catch((err) => {
          console.log('[SpoilerShield] Content script not ready:', err);
        });
      }
    } catch (err) {
      console.error('[SpoilerShield] Error requesting re-detect:', err);
    }
    // Also send current show info immediately
    await sendShowInfoToApp();
  }
});

// Send show info shortly after the script loads (React app may not be mounted yet)
setTimeout(sendShowInfoToApp, 200);
setTimeout(sendShowInfoToApp, 600);
setTimeout(sendShowInfoToApp, 1200);
