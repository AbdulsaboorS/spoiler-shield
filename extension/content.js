// Content script: maintains a rolling buffer of subtitle lines and can return it on request.

const BUFFER_MAX_LINES = 30; // ~60-120s worth, depending on cadence

const state = {
  buffer: [],
  lastLine: "",
  platform: detectPlatform(location.hostname),
  lastUpdatedAt: null,
};

function detectPlatform(hostname) {
  if (/netflix\.com$/i.test(hostname)) return "netflix";
  if (/crunchyroll\.com$/i.test(hostname)) return "crunchyroll";
  return "other";
}

function normalizeLine(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\u200B/g, "")
    .trim();
}

function getTitle() {
  const og =
    document.querySelector('meta[property="og:title"]') ||
    document.querySelector('meta[name="og:title"]');
  const meta = og?.getAttribute("content");
  return normalizeLine(meta || document.title || "");
}

function pickSubtitleElements() {
  const selectors = [
    // Crunchyroll-ish / generic
    '[class*="subtitle" i]',
    '[class*="caption" i]',
    '[class*="cc" i]',
    '[aria-live]',
    '[role="alert"]',
    '[role="status"]',

    // Netflix timed text containers (commonly observed)
    '[data-uia*="timedtext" i]',
    '[data-uia*="subtitle" i]',
    '[data-uia*="caption" i]',
    '.player-timedtext',
    '.player-timedtext-text-container',
    ".player-timedtext-text-container span",
  ];

  const elements = new Set();
  for (const sel of selectors) {
    try {
      document.querySelectorAll(sel).forEach((el) => elements.add(el));
    } catch {
      // ignore invalid selector
    }
  }

  // Filter out huge containers (helps avoid grabbing the whole page text)
  return [...elements].filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect) return true;
    const area = rect.width * rect.height;
    return area < 300_000; // arbitrary: avoid observing full-page wrappers
  });
}

function extractLinesFromElement(el) {
  if (!el) return [];

  // Prefer visible text; keep line breaks if present.
  const raw = (el.innerText || el.textContent || "").trim();
  if (!raw) return [];

  // Split on newlines and also handle multi-line subtitles.
  const parts = raw
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  // Some players re-render both lines every tick; keep distinct lines only.
  const out = [];
  for (const p of parts) {
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

function addLine(line) {
  const normalized = normalizeLine(line);
  if (!normalized) return;

  // Dedup repeated lines and very recent repeats.
  const last = state.buffer[state.buffer.length - 1];
  if (normalized === last) return;

  const recent = state.buffer.slice(-6);
  if (recent.includes(normalized)) return;

  state.buffer.push(normalized);
  if (state.buffer.length > BUFFER_MAX_LINES) {
    state.buffer = state.buffer.slice(-BUFFER_MAX_LINES);
  }
  state.lastLine = normalized;
  state.lastUpdatedAt = new Date().toISOString();
}

function publishUpdate() {
  const record = {
    platform: state.platform,
    url: location.href,
    title: getTitle(),
    capturedAt: state.lastUpdatedAt || new Date().toISOString(),
    buffer: [...state.buffer],
    lastLine: state.lastLine,
  };

  // We can't reliably get tabId in content scripts, so the background stores it keyed by sender.tab.id.
  try {
    chrome.runtime.sendMessage({ type: "CONTEXT_UPDATE", record });
  } catch {
    // ignore
  }
}

let targets = [];
let perTargetObservers = [];

function resetObservers() {
  for (const obs of perTargetObservers) {
    try {
      obs.disconnect();
    } catch {
      // ignore
    }
  }
  perTargetObservers = [];
  targets = pickSubtitleElements();

  for (const el of targets) {
    const obs = new MutationObserver(() => {
      const lines = extractLinesFromElement(el);
      if (!lines.length) return;
      for (const l of lines) addLine(l);
      publishUpdate();
    });
    try {
      obs.observe(el, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      perTargetObservers.push(obs);
    } catch {
      // ignore
    }
  }
}

// Re-scan for subtitle containers periodically because players often re-mount DOM nodes.
const rescanner = new MutationObserver(() => {
  // Debounce via microtask-ish setTimeout.
  if (rescanner._t) return;
  rescanner._t = setTimeout(() => {
    rescanner._t = null;
    resetObservers();
  }, 750);
});
rescanner._t = null;

try {
  rescanner.observe(document.documentElement || document.body, {
    subtree: true,
    childList: true,
  });
} catch {
  // ignore
}

resetObservers();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type !== "GET_CONTEXT") return;

  const record = {
    platform: state.platform,
    url: location.href,
    title: getTitle(),
    capturedAt: state.lastUpdatedAt || new Date().toISOString(),
    buffer: [...state.buffer],
    lastLine: state.lastLine,
  };

  sendResponse({ ok: true, record });
});

