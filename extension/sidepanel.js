// Side panel: hosts the web app in an iframe and posts captured context into it.

// Config
// - For local dev: Vite default is http://localhost:5173
// - For prod: replace with your deployed URL
const WEB_APP_URL = "http://localhost:5173";

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

async function refreshContext() {
  const tabId = await getActiveTabId();
  if (!tabId) return;

  const record = await fetchContextForTab(tabId);
  const prefill = recordToPrefill(record || {});
  postPrefillToIframe(prefill);
}

frame.addEventListener("load", () => {
  refreshContext();
});

refreshBtn.addEventListener("click", () => {
  refreshContext();
});

