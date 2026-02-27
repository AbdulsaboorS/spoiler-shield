import { useState, useCallback, useEffect, useRef } from 'react';
import { InitPhase, ChatMessage, SessionMeta } from '@/lib/types';
import { useEpisodeRecap } from './useEpisodeRecap';
import { useSidePanel } from './useSidePanel';
import { useSessionStore } from './useSessionStore';
import { toast } from '@/components/ui/sonner';

interface DetectedShowInfo {
  platform: string;
  showTitle: string;
  episodeInfo?: { season: string; episode: string };
}

const MESSAGES_PREFIX = 'spoilershield-msgs-';
const SESSIONS_KEY = 'spoilershield-sessions';
const NO_SHOW_TIMEOUT_MS = 2000;

export function useInitFlow(sessionStore: ReturnType<typeof useSessionStore>) {
  const [phase, setPhase] = useState<InitPhase>('detecting');
  const [detectedShowInfo, setDetectedShowInfo] = useState<DetectedShowInfo | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const isSidePanel = useSidePanel();
  const { fetchRecap } = useEpisodeRecap();

  const hasReceivedShowInfo = useRef(false);
  const lastProcessedKeyRef = useRef<string | null>(null);
  const detectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevEpisodeRef = useRef<{ season: string; episode: string; sessionId: string } | null>(null);

  // Latest-ref pattern: updated synchronously each render so callbacks can read
  // current values without listing them as deps (avoids identity churn → no loop).
  const sessionStoreRef = useRef(sessionStore);
  const fetchRecapRef = useRef(fetchRecap);
  sessionStoreRef.current = sessionStore;
  fetchRecapRef.current = fetchRecap;

  const doTVMazeLookupAndCreateSession = useCallback(async (showInfo: DetectedShowInfo) => {
    console.count('[SS] TVMaze lookup call');
    try {
      const response = await fetch(
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(showInfo.showTitle)}`
      );

      let showId: number | undefined;
      let resolvedTitle = showInfo.showTitle;

      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          const matched = data[0].show;
          showId = matched.id;
          resolvedTitle = matched.name;
        }
      }

      const season = showInfo.episodeInfo?.season ?? '';
      const episode = showInfo.episodeInfo?.episode ?? '';
      const hasEpisode = Boolean(season && episode);

      // If TVMaze didn't find the show AND there's no episode info, this is almost
      // certainly a false positive (e.g. a Crunchyroll browse/home page). Bail out
      // to no-show rather than prompting the user to enter an episode for a non-show.
      if (!showId && !hasEpisode) {
        setPhase('no-show');
        return;
      }

      const sessionId = sessionStoreRef.current.loadOrCreateSession(
        resolvedTitle,
        showId,
        showInfo.platform,
        season,
        episode
      );

      if (hasEpisode) {
        // Check if we need to auto-detect episode change
        const prev = prevEpisodeRef.current;
        const isSameShowDifferentEpisode =
          prev &&
          prev.sessionId !== sessionId &&
          (prev.season !== season || prev.episode !== episode);

        if (isSameShowDifferentEpisode && prev) {
          const oldKey = `${MESSAGES_PREFIX}${prev.sessionId}`;
          const newKey = `${MESSAGES_PREFIX}${sessionId}`;
          const oldEpLabel = `E${prev.episode}`;

          const importMessages = () => {
            try {
              const oldRaw = window.localStorage.getItem(oldKey);
              const oldMsgs: ChatMessage[] = oldRaw ? JSON.parse(oldRaw) : [];
              if (oldMsgs.length > 0) {
                const separator: ChatMessage = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: `[Imported from ${oldEpLabel}]`,
                  timestamp: new Date(),
                };
                const combined = [...oldMsgs, separator];
                window.localStorage.setItem(newKey, JSON.stringify(combined));
                window.dispatchEvent(
                  new CustomEvent('spoilershield-messages-updated', { detail: { key: newKey } })
                );
              }
            } catch {}
          };

          toast(`Now watching Episode ${episode}`, {
            description: `Import your ${oldEpLabel} conversation into this session?`,
            action: {
              label: `Import ${oldEpLabel} chat`,
              onClick: importMessages,
            },
            duration: 6000,
          });
        }

        prevEpisodeRef.current = { season, episode, sessionId };

        // Fetch recap if session context is empty.
        // Read from localStorage directly — loadOrCreateSession writes synchronously.
        const allSessions: SessionMeta[] = JSON.parse(
          window.localStorage.getItem(SESSIONS_KEY) || '[]'
        );
        const currentMeta = allSessions.find(s => s.sessionId === sessionId);
        if (!currentMeta?.context && showId) {
          fetchRecapRef.current(showId, parseInt(season), parseInt(episode), resolvedTitle).then(result => {
            if (result.summary) {
              sessionStoreRef.current.updateContext(result.summary);
            }
          });
        }

        setPhase('ready');
      } else {
        prevEpisodeRef.current = null;
        setPhase('needs-episode');
      }
    } catch (err) {
      console.error('[SpoilerShield] useInitFlow TVMaze lookup failed:', err);
      setPhase('error');
    }
  }, []); // stable identity — reads latest store/fetchRecap via refs

  // Set up message listener (side panel only)
  useEffect(() => {
    if (!isSidePanel) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as unknown;
      if (!data || typeof data !== 'object') return;

      const maybe = data as { type?: unknown; payload?: unknown };
      if (maybe.type !== 'SPOILERSHIELD_SHOW_INFO') return;

      const showInfo = maybe.payload as {
        platform?: string;
        showTitle?: string;
        episodeInfo?: { season: string; episode: string };
      };

      const showTitle = showInfo?.showTitle;
      const season = showInfo?.episodeInfo?.season ?? '';
      const episode = showInfo?.episodeInfo?.episode ?? '';

      // Home page / non-show page → reset if we were previously on a show
      if (!showTitle) {
        if (lastProcessedKeyRef.current !== null && lastProcessedKeyRef.current !== '') {
          lastProcessedKeyRef.current = '';
          hasReceivedShowInfo.current = false;
          setDetectedShowInfo(null);
          setPhase('no-show');
        }
        return;
      }

      // Content-based dedup: skip if same show+episode as last processed
      const key = `${showTitle}|${season}|${episode}`;
      if (lastProcessedKeyRef.current === key) return;
      lastProcessedKeyRef.current = key;

      // First real detection: stop no-show timer only; keep poll alive for episode changes
      if (!hasReceivedShowInfo.current) {
        hasReceivedShowInfo.current = true;
        if (detectionTimerRef.current) { clearTimeout(detectionTimerRef.current); detectionTimerRef.current = null; }
      }

      const info: DetectedShowInfo = {
        platform: showInfo?.platform || 'other',
        showTitle,
        episodeInfo: showInfo?.episodeInfo,
      };

      setDetectedShowInfo(info);
      setIsDetecting(false);
      setPhase('resolving');

      doTVMazeLookupAndCreateSession(info);
    };

    window.addEventListener('message', onMessage);

    // Request show info from extension — sidepanel.js listens on the same window
    const requestShowInfo = () => {
      window.postMessage({ type: 'SPOILERSHIELD_REQUEST_SHOW_INFO' }, '*');
    };

    requestShowInfo();
    setTimeout(requestShowInfo, 100);
    setTimeout(requestShowInfo, 500);
    setTimeout(requestShowInfo, 1000);

    const pollId = setInterval(requestShowInfo, 3000);
    pollIdRef.current = pollId;

    // 2s timeout → no-show
    detectionTimerRef.current = setTimeout(() => {
      if (!hasReceivedShowInfo.current) {
        setPhase('no-show');
      }
    }, NO_SHOW_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(pollId);
      pollIdRef.current = null;
      if (detectionTimerRef.current) {
        clearTimeout(detectionTimerRef.current);
      }
    };
  }, [isSidePanel]); // doTVMazeLookupAndCreateSession is stable ([] deps) — safe to omit

  /** Called when user manually sets up show+episode (from no-show or needs-episode) */
  const confirmManualSetup = useCallback(async (
    showTitle: string,
    showId: number | undefined,
    platform: string,
    season: string,
    episode: string
  ) => {
    setPhase('resolving');

    const sessionId = sessionStoreRef.current.loadOrCreateSession(showTitle, showId, platform, season, episode);

    // Read from localStorage directly — loadOrCreateSession writes synchronously
    const allSessions: SessionMeta[] = JSON.parse(
      window.localStorage.getItem(SESSIONS_KEY) || '[]'
    );
    const currentMeta = allSessions.find(s => s.sessionId === sessionId);
    if (!currentMeta?.context && showId && season && episode) {
      fetchRecapRef.current(showId, parseInt(season), parseInt(episode), showTitle).then(result => {
        if (result.summary) {
          sessionStoreRef.current.updateContext(result.summary);
        }
      });
    }

    prevEpisodeRef.current = { season, episode, sessionId };
    setPhase('ready');
  }, []); // stable identity — reads latest store/fetchRecap via refs

  /** Re-request show info from extension */
  const requestRedetect = useCallback(() => {
    lastProcessedKeyRef.current = null;  // allow re-processing same show/episode
    setIsDetecting(true);
    setPhase('detecting');
    hasReceivedShowInfo.current = false;

    window.postMessage({ type: 'SPOILERSHIELD_REQUEST_REDETECT' }, '*');
    const req = () => {
      window.postMessage({ type: 'SPOILERSHIELD_REQUEST_SHOW_INFO' }, '*');
    };
    req();
    setTimeout(req, 500);
    setTimeout(req, 1000);
    setTimeout(req, 2000);

    if (detectionTimerRef.current) clearTimeout(detectionTimerRef.current);
    detectionTimerRef.current = setTimeout(() => {
      if (!hasReceivedShowInfo.current) {
        setPhase('no-show');
        setIsDetecting(false);
      }
    }, 3000);
  }, []);

  return {
    phase,
    detectedShowInfo,
    isDetecting,
    confirmManualSetup,
    requestRedetect,
  };
}
