// Side panel: hosts the web app in an iframe and posts captured context into it.

// Config
// - For local dev: Vite default is http://localhost:5173
// - For prod: replace with your deployed URL
const WEB_APP_URL = "http://localhost:8080";

// Shared MVP token (must match the web app listener).
const SPOILERSHIELD_EXTENSION_TOKEN = "spoilershield-mvp-1";

const MAX_CONTEXT_CHARS = 2000;

const frame = document.getElementById("appFrame");
const refreshBtn = document.getElementById("refreshBtn");

frame.src = WEB_APP_URL;

function clampContext(text) {
  const s = String(text || "");
  if (s.length <= MAX_CONTEXT_CHARS) return s;
  return s.slice(s.length - MAX_CONTEXT_CHARS);
}

function recordToPrefill(record) {
  const platform = record?.platform || "other";
  const title = record?.title || "";
  const timestamp = ""; // player timestamp capture is not implemented yet
  const buffer = Array.isArray(record?.buffer) ? record.buffer : [];

  return {
    platform,
    title,
    season: "",
    episode: "",
    timestamp,
    context: clampContext(buffer.join("\n")),
  };
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0]?.id;
}

async function fetchContextForTab(tabId) {
  // Try live content-script request first.
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: "GET_CONTEXT" });
    if (resp?.ok && resp.record) return resp.record;
  } catch {
    // ignore; fall back to last stored record
  }

  // Fallback: last stored record (written by background keyed by tabId).
  try {
    const key = `context:${tabId}`;
    const obj = await chrome.storage.local.get(key);
    return obj?.[key] || null;
  } catch {
    return null;
  }
}

function postPrefillToIframe(prefill) {
  if (!frame?.contentWindow) return;
  const msg = {
    type: "SPOILERSHIELD_PREFILL",
    token: SPOILERSHIELD_EXTENSION_TOKEN,
    payload: prefill,
  };

  // Target origin is the web app URL origin (not the chrome-extension origin).
  const targetOrigin = new URL(WEB_APP_URL).origin;
  frame.contentWindow.postMessage(msg, targetOrigin);
}

async function sendContextToIframe() {
  if (!frame?.contentWindow) {
    console.log('[SpoilerShield] Frame contentWindow not available');
    return;
  }
  
  const webAppOrigin = new URL(WEB_APP_URL).origin;
  
  try {
    // First, try to get context from global storage
    let result = await chrome.storage.local.get("spoilershield_context");
    let context = result.spoilershield_context;
    
    // If no context in global storage, try to get it from the active tab
    if (!context || (!context.contextText && (!Array.isArray(context.lines) || context.lines.length === 0))) {
      console.log('[SpoilerShield] No context in global storage, checking active tab...');
      const tabId = await getActiveTabId();
      if (tabId) {
        const tabContext = await fetchContextForTab(tabId);
        if (tabContext) {
          // Convert tab context to the format expected by the UI
          const contextText = tabContext.contextText || (Array.isArray(tabContext.lines) ? tabContext.lines.join(' ') : '') || (Array.isArray(tabContext.buffer) ? tabContext.buffer.join(' ') : '');
          
          context = {
            platform: tabContext.platform || 'crunchyroll',
            title: tabContext.title || '',
            updatedAt: tabContext.updatedAt || tabContext.capturedAt || new Date().toISOString(),
            lines: tabContext.lines || tabContext.buffer || [],
            contextText: contextText,
          };
          
          // Also update global storage for future use
          try {
            await chrome.storage.local.set({ spoilershield_context: context });
            console.log('[SpoilerShield] Updated global storage from tab context');
          } catch {
            // ignore
          }
        }
      }
    }
    
    // Normalize context format to ensure it has the expected structure
    if (context) {
      // Ensure contextText exists (use lines if contextText is missing)
      if (!context.contextText && Array.isArray(context.lines) && context.lines.length > 0) {
        context.contextText = context.lines.join(' ').trim();
      }
      // Ensure lines array exists (use buffer if lines is missing)
      if (!Array.isArray(context.lines) && Array.isArray(context.buffer) && context.buffer.length > 0) {
        context.lines = context.buffer;
        if (!context.contextText) {
          context.contextText = context.lines.join(' ').trim();
        }
      }
      // Ensure updatedAt exists
      if (!context.updatedAt && context.capturedAt) {
        context.updatedAt = context.capturedAt;
      }
    }
    
    if (context && (context.contextText || (Array.isArray(context.lines) && context.lines.length > 0))) {
      console.log('[SpoilerShield] Sending context to iframe:', {
        hasContextText: !!context.contextText,
        contextTextLength: context.contextText?.length || 0,
        hasLines: Array.isArray(context.lines) && context.lines.length > 0,
        linesCount: Array.isArray(context.lines) ? context.lines.length : 0,
        platform: context.platform,
        title: context.title,
      });
      
      frame.contentWindow.postMessage(
        {
          type: "SPOILERSHIELD_CONTEXT",
          payload: context,
        },
        webAppOrigin
      );
    } else {
      console.log('[SpoilerShield] No context available anywhere, sending null');
      // Send empty/null context so UI knows there's no context
      frame.contentWindow.postMessage(
        {
          type: "SPOILERSHIELD_CONTEXT",
          payload: null,
        },
        webAppOrigin
      );
    }
  } catch (err) {
    console.error('[SpoilerShield] Error sending context:', err);
    // Send null on error
    frame.contentWindow.postMessage(
      {
        type: "SPOILERSHIELD_CONTEXT",
        payload: null,
      },
      webAppOrigin
    );
  }
}

async function refreshContext() {
  const tabId = await getActiveTabId();
  if (!tabId) {
    // If no active tab, just send what's in global storage
    await sendContextToIframe();
    return;
  }

  // Try to get fresh context from the active tab
  const record = await fetchContextForTab(tabId);
  
  if (record) {
    // Convert to the format expected by the UI
    const contextText = record.contextText || (Array.isArray(record.lines) ? record.lines.join(' ') : '') || (Array.isArray(record.buffer) ? record.buffer.join(' ') : '');
    
    const context = {
      platform: record.platform || 'crunchyroll',
      title: record.title || '',
      updatedAt: record.updatedAt || record.capturedAt || new Date().toISOString(),
      lines: record.lines || record.buffer || [],
      contextText: contextText,
    };
    
    // Update global storage with fresh context
    try {
      await chrome.storage.local.set({ spoilershield_context: context });
      console.log('[SpoilerShield] Updated global storage from active tab');
    } catch {
      // ignore
    }
    
    // Also send the old prefill format (for backward compatibility)
    const prefill = recordToPrefill(record);
    postPrefillToIframe(prefill);
  }
  
  // Send context to iframe (will use global storage or tab context)
  await sendContextToIframe();
}

// Listen for storage changes and automatically send updates to iframe
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  
  if (changes.spoilershield_context) {
    const newValue = changes.spoilershield_context.newValue;
    console.log('[SpoilerShield] Storage changed, sending context to iframe');
    
    // Send updated context immediately
    if (newValue && (newValue.contextText || (Array.isArray(newValue.lines) && newValue.lines.length > 0))) {
      sendContextToIframe();
    }
  }
});

frame.addEventListener("load", () => {
  refreshContext();
  
  // Send context and show info from storage on load (multiple attempts to ensure delivery)
  const sendOnLoad = () => {
    sendContextToIframe();
    sendShowInfoToIframe();
  };
  
  setTimeout(sendOnLoad, 100);
  setTimeout(sendOnLoad, 500);
  setTimeout(sendOnLoad, 1000);
  setTimeout(sendOnLoad, 2000);
});

refreshBtn.addEventListener("click", () => {
  refreshContext();
});

// Send detected show info to iframe
async function sendShowInfoToIframe() {
  if (!frame?.contentWindow) {
    console.log('[SpoilerShield] Cannot send show info: frame.contentWindow not available');
    return;
  }
  
  const webAppOrigin = new URL(WEB_APP_URL).origin;
  
  try {
    const result = await chrome.storage.local.get("spoilershield_show_info");
    const showInfo = result.spoilershield_show_info;
    
    console.log('[SpoilerShield] Checking show info in storage:', {
      hasShowInfo: !!showInfo,
      showTitle: showInfo?.showTitle,
      platform: showInfo?.platform,
    });
    
    if (showInfo && showInfo.showTitle) {
      console.log('[SpoilerShield] Sending show info to iframe:', {
        platform: showInfo.platform,
        showTitle: showInfo.showTitle,
        hasEpisodeInfo: !!showInfo.episodeInfo,
        webAppOrigin: webAppOrigin,
      });
      
      frame.contentWindow.postMessage(
        {
          type: "SPOILERSHIELD_SHOW_INFO",
          payload: showInfo,
        },
        webAppOrigin
      );
    } else {
      console.log('[SpoilerShield] No show info to send (missing or no showTitle)');
    }
  } catch (err) {
    console.error('[SpoilerShield] Error sending show info:', err);
  }
}

// Listen for storage changes and automatically send show info updates
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  
  if (changes.spoilershield_show_info) {
    const newValue = changes.spoilershield_show_info.newValue;
    console.log('[SpoilerShield] Show info changed in storage:', {
      hasNewValue: !!newValue,
      showTitle: newValue?.showTitle,
      platform: newValue?.platform,
    });
    // Send immediately when storage changes
    sendShowInfoToIframe();
    // Also send again after a short delay to ensure iframe is ready
    setTimeout(() => sendShowInfoToIframe(), 100);
  }
});

// Send show info immediately when script loads (in case storage already has data)
// This runs before frame load, so we'll also send on frame load
setTimeout(() => {
  sendShowInfoToIframe();
}, 100);

// Listen for messages from the iframe (React app)
window.addEventListener("message", async (event) => {
  // Accept messages from the web app origin
  const webAppOrigin = new URL(WEB_APP_URL).origin;
  if (event.origin !== webAppOrigin) return;

  if (event.data?.type === "SPOILERSHIELD_REFRESH_CONTEXT") {
    refreshContext();
  }

  if (event.data?.type === "SPOILERSHIELD_REQUEST_CONTEXT") {
    // Read context from storage and send to iframe
    await sendContextToIframe();
  }

  if (event.data?.type === "SPOILERSHIELD_REQUEST_SHOW_INFO") {
    // Read show info from storage and send to iframe
    await sendShowInfoToIframe();
  }

  if (event.data?.type === "SPOILERSHIELD_REQUEST_REDETECT") {
    // Request content script to re-detect show info
    console.log('[SpoilerShield] Re-detect requested');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (tabId) {
        // Send message to content script to trigger re-detection
        chrome.tabs.sendMessage(tabId, { type: "REDETECT_SHOW_INFO" }).catch((err) => {
          console.log('[SpoilerShield] Content script not ready, will detect on next page load:', err);
        });
      }
    } catch (err) {
      console.error('[SpoilerShield] Error requesting re-detect:', err);
    }
    // Also send current show info immediately (in case it's already updated)
    await sendShowInfoToIframe();
  }
});
