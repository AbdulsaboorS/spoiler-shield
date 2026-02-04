// Content script: maintains a rolling buffer of subtitle lines and can return it on request.

const BUFFER_MAX_LINES = 40; // ~120 seconds worth, depending on cadence
const DEV_LOGGING = true; // Set to true for console logging - ENABLED FOR DEBUGGING

// Debug heartbeat: confirm script injection - MUST RUN IMMEDIATELY
// This log should appear IMMEDIATELY when the script loads
console.log("[SpoilerShield] ⚡ content.js STARTING");
console.log("[SpoilerShield] URL:", location.href);
console.log("[SpoilerShield] Hostname:", location.hostname);
console.log("[SpoilerShield] User Agent:", navigator.userAgent.substring(0, 50));

(async function debugHeartbeat() {
  console.log("[SpoilerShield] ✅ content.js LOADED AND RUNNING");
  console.log("[SpoilerShield] Hostname:", location.hostname);
  console.log("[SpoilerShield] Platform detected:", state.platform);
  
  try {
    await chrome.storage.local.set({
      spoilershield_debug: {
        ranAt: new Date().toISOString(),
        url: location.href,
        locationHost: location.hostname,
        note: "content.js loaded",
      },
    });
    console.log("[SpoilerShield] ✅ Debug heartbeat stored");
  } catch (err) {
    console.error("[SpoilerShield] ❌ debug heartbeat failed:", err);
  }
})();

// Diagnostic function - MUST be available immediately (before state is defined)
window.spoilerShieldDiagnose = function() {
  console.log("=== SpoilerShield Diagnostic ===");
  console.log("Script loaded:", typeof window.spoilerShieldDiagnose !== "undefined");
  console.log("Current URL:", location.href);
  console.log("Hostname:", location.hostname);
  
  // Check if state exists (might not be defined yet)
  if (typeof state !== "undefined") {
    console.log("Platform:", state.platform);
    console.log("Buffer length:", state.buffer.length);
    console.log("Last line:", state.lastLine);
    console.log("Last updated:", state.lastUpdatedAt);
  } else {
    console.log("⚠️ State not yet initialized");
  }
  
  // Check for video element
  const video = document.querySelector('video');
  console.log("Video element found:", !!video);
  
  // Check for common subtitle containers
  const checks = [
    '.erc-subtitle-text',
    '[class*="subtitle"]',
    '[class*="caption"]',
    '.vjs-text-track',
    '[aria-live]',
  ];
  
  checks.forEach(sel => {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) {
      console.log(`✓ "${sel}": ${found.length} elements`);
      found.forEach((el, i) => {
        if (i < 2) {
          const text = (el.innerText || el.textContent || '').trim();
          console.log(`  [${i}] "${text.substring(0, 50)}"`);
        }
      });
    } else {
      console.log(`✗ "${sel}": 0 elements`);
    }
  });
  
  // Check storage
  chrome.storage.local.get('spoilershield_context', (result) => {
    const ctx = result.spoilershield_context;
    if (ctx) {
      console.log("Storage context:", {
        hasContextText: !!ctx.contextText,
        contextTextLength: ctx.contextText?.length || 0,
        hasLines: Array.isArray(ctx.lines),
        linesCount: ctx.lines?.length || 0,
        platform: ctx.platform,
        title: ctx.title,
      });
    } else {
      console.log("✗ No context in storage");
    }
  });
  
  console.log("=== End Diagnostic ===");
};

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

function log(...args) {
  if (DEV_LOGGING) {
    console.log("[SpoilerShield]", ...args);
  }
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

// Extract show info from page (no subtitle parsing)
function detectShowInfo() {
  const platform = state.platform;
  let showTitle = '';
  let episodeInfo = null;

  if (platform === 'crunchyroll') {
    // Crunchyroll: Try multiple selectors for show title
    // Method 1: Look for series title in common locations
    const seriesTitleEl = document.querySelector('[class*="series-title"]') ||
                          document.querySelector('[class*="show-title"]') ||
                          document.querySelector('a[href*="/series/"]') ||
                          document.querySelector('[data-testid="series-title"]');
    
    if (seriesTitleEl) {
      showTitle = normalizeLine(seriesTitleEl.textContent || seriesTitleEl.innerText || '');
    }

    // Method 2: Extract from page title (format: "Show Name - Episode Title | Crunchyroll")
    if (!showTitle) {
      const pageTitle = document.title || '';
      // Remove "| Crunchyroll" suffix
      let cleanTitle = pageTitle.replace(/\s*\|\s*Crunchyroll.*$/i, '').trim();
      // Split on common separators and take first part (show name)
      showTitle = cleanTitle.split(/[–—\-]/)[0].trim();
    }

    // Method 3: Try meta tags
    if (!showTitle) {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        const ogContent = ogTitle.getAttribute('content') || '';
        showTitle = ogContent.split(/[–—\-|]/)[0].trim();
      }
    }

    // Try to find episode info from URL or page elements
    const episodeEl = document.querySelector('[class*="episode-number"]') ||
                      document.querySelector('[class*="episode-title"]') ||
                      document.querySelector('[data-testid="episode"]');
    
    if (episodeEl) {
      const episodeText = (episodeEl.textContent || '').trim();
      // Look for "S1 E5" or "Season 1, Episode 5" patterns
      const epMatch = episodeText.match(/S(\d+)\s*E(\d+)/i) || 
                      episodeText.match(/Season\s+(\d+).*Episode\s+(\d+)/i) ||
                      episodeText.match(/Episode\s+(\d+)/i);
      if (epMatch) {
        episodeInfo = {
          season: epMatch[1] || '1',
          episode: epMatch[2] || epMatch[1] || '',
        };
      }
    }

    // Fallback: Use getTitle() helper
    if (!showTitle) {
      showTitle = getTitle();
    }
  } else if (platform === 'netflix') {
    // Netflix: Try to extract from page
    // Method 1: Video title element
    const titleEl = document.querySelector('[data-uia="video-title"]') ||
                    document.querySelector('[class*="video-title"]') ||
                    document.querySelector('h1[class*="title"]');
    
    if (titleEl) {
      showTitle = normalizeLine(titleEl.textContent || titleEl.innerText || '');
    }

    // Method 2: Page title
    if (!showTitle) {
      const pageTitle = document.title || '';
      showTitle = pageTitle.replace(/\s*-\s*Netflix.*$/i, '').trim();
    }

    // Try to find episode info
    const episodeEl = document.querySelector('[data-uia="episode-title"]') ||
                      document.querySelector('[class*="episode-title"]');
    if (episodeEl) {
      const episodeText = (episodeEl.textContent || '').trim();
      const epMatch = episodeText.match(/S(\d+)\s*E(\d+)/i) || 
                      episodeText.match(/Episode\s+(\d+)/i);
      if (epMatch) {
        episodeInfo = {
          season: epMatch[1] || '1',
          episode: epMatch[2] || epMatch[1] || '',
        };
      }
    }

    // Fallback: Use getTitle() helper
    if (!showTitle) {
      showTitle = getTitle();
    }
  }

  return {
    platform,
    showTitle: showTitle || '',
    episodeInfo,
    url: location.href,
    detectedAt: new Date().toISOString(),
  };
}

// Store detected show info
async function storeShowInfo() {
  const showInfo = detectShowInfo();
  
  if (showInfo.showTitle) {
    try {
      await chrome.storage.local.set({
        spoilershield_show_info: showInfo,
      });
      
      if (DEV_LOGGING) {
        log("stored show info:", showInfo);
      }
    } catch (err) {
      if (DEV_LOGGING) {
        log("storage error:", err);
      }
    }
  }
}

// Detect and store show info on page load and when DOM changes
(function detectAndStoreShowInfo() {
  // Initial detection
  storeShowInfo();

  // Re-detect when page content changes (for SPA navigation)
  const observer = new MutationObserver(() => {
    storeShowInfo();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also detect on navigation (for SPAs)
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      storeShowInfo();
    }
  }, 2000);
})();

function pickSubtitleElements() {
  const isCrunchyroll = state.platform === "crunchyroll";
  
  const selectors = isCrunchyroll
    ? [
        // Crunchyroll-specific selectors (observed patterns)
        '.erc-subtitle-text',
        '.erc-subtitle-text-container',
        '[class*="subtitle-text"]',
        '[class*="subtitle-container"]',
        '.vjs-text-track-display',
        '.vjs-text-track',
        '[class*="vjs-text-track"]',
        // Fallback generic selectors for Crunchyroll
        '[class*="subtitle" i]',
        '[class*="caption" i]',
        '[aria-live]',
        '[role="alert"]',
        '[role="status"]',
      ]
    : [
        // Netflix timed text containers (commonly observed)
        '[data-uia*="timedtext" i]',
        '[data-uia*="subtitle" i]',
        '[data-uia*="caption" i]',
        '.player-timedtext',
        '.player-timedtext-text-container',
        ".player-timedtext-text-container span",
        // Generic fallbacks
        '[class*="subtitle" i]',
        '[class*="caption" i]',
        '[aria-live]',
        '[role="alert"]',
        '[role="status"]',
      ];

  const elements = new Set();
  for (const sel of selectors) {
    try {
      const found = document.querySelectorAll(sel);
      if (isCrunchyroll && DEV_LOGGING && found.length > 0) {
        log(`Selector "${sel}" found ${found.length} elements`);
        found.forEach((el, i) => {
          if (i < 3) { // Log first 3
            const text = (el.innerText || el.textContent || '').trim().substring(0, 50);
            log(`  Element ${i}: text="${text}"`);
          }
        });
      }
      found.forEach((el) => elements.add(el));
    } catch {
      // ignore invalid selector
    }
  }

  // Filter out huge containers (helps avoid grabbing the whole page text)
  const filtered = [...elements].filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect) return true;
    const area = rect.width * rect.height;
    return area < 300_000; // arbitrary: avoid observing full-page wrappers
  });

  if (isCrunchyroll && DEV_LOGGING) {
    log("Found", filtered.length, "potential subtitle elements after filtering");
    if (filtered.length === 0) {
      log("⚠️ NO SUBTITLE ELEMENTS FOUND - checking page structure...");
      // Diagnostic: search for any text that might be subtitles
      const allText = document.body.innerText || '';
      const videoArea = document.querySelector('video')?.parentElement;
      if (videoArea) {
        const videoText = videoArea.innerText || '';
        log(`Video area text length: ${videoText.length}, sample: "${videoText.substring(0, 100)}"`);
      }
    }
  }

  return filtered;
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

  if (DEV_LOGGING) {
    log("captured subtitle:", normalized);
  }
}

async function publishUpdate() {
  const updatedAt = state.lastUpdatedAt || new Date().toISOString();
  const contextText = state.buffer.join(" ").trim();

  // Only store if we have actual content
  if (state.buffer.length === 0 && !contextText.trim()) {
    return;
  }

  const record = {
    platform: state.platform,
    url: location.href,
    title: getTitle(),
    updatedAt: updatedAt,
    lines: [...state.buffer],
    contextText: contextText,
  };

  // Store directly to chrome.storage.local for global access
  try {
    await chrome.storage.local.set({
      spoilershield_context: record,
    });
    
    if (DEV_LOGGING && state.buffer.length > 0) {
      log("stored context:", {
        lines: state.buffer.length,
        contextTextLength: contextText.length,
        lastLine: state.lastLine.substring(0, 50),
      });
    }
  } catch (err) {
    if (DEV_LOGGING) {
      log("storage error:", err);
    }
  }

  // Also send to background for per-tab storage (backward compatibility)
  try {
    chrome.runtime.sendMessage({ 
      type: "CONTEXT_UPDATE", 
      record: {
        ...record,
        capturedAt: updatedAt,
        buffer: record.lines,
        lastLine: state.lastLine,
      }
    });
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
    const obs = new MutationObserver(async () => {
      const lines = extractLinesFromElement(el);
      if (!lines.length) return;
      for (const l of lines) addLine(l);
      await publishUpdate();
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
  
  if (state.platform === "crunchyroll" && DEV_LOGGING) {
    log("observing", targets.length, "subtitle elements");
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
  
  // Handle re-detect requests
  if (message.type === "REDETECT_SHOW_INFO") {
    console.log('[SpoilerShield] Re-detect requested, running detection now');
    // Re-run detection immediately
    storeShowInfo();
    sendResponse({ ok: true });
    return true; // Keep channel open for async response
  }
  
  // Handle GET_CONTEXT requests
  if (message.type !== "GET_CONTEXT") return;

  const updatedAt = state.lastUpdatedAt || new Date().toISOString();
  const record = {
    platform: state.platform,
    url: location.href,
    title: getTitle(),
    updatedAt: updatedAt,
    lines: [...state.buffer],
    contextText: state.buffer.join(" ").trim(),
    // Backward compatibility fields
    capturedAt: updatedAt,
    buffer: [...state.buffer],
    lastLine: state.lastLine,
  };

  sendResponse({ ok: true, record });
});

