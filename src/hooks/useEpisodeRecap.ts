import { useState, useCallback } from 'react';
import type { EpisodeSource } from '@/lib/types';

interface RecapResult {
  summary: string | null;
  source: EpisodeSource;
  error?: string;
}

interface CachedEpisode {
  summary: string;
  source: EpisodeSource;
  cachedAt: number;
}

const CACHE_KEY_PREFIX = 'fandom_episode_';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCacheKey(showTitle: string, season: number, episode: number): string {
  const slug = showTitle.toLowerCase().replace(/\s+/g, '-');
  return `${CACHE_KEY_PREFIX}${slug}_s${season}_e${episode}`;
}

function getCachedEpisode(showTitle: string, season: number, episode: number): RecapResult | null {
  const key = getCacheKey(showTitle, season, episode);
  const cached = localStorage.getItem(key);
  if (!cached) return null;

  try {
    const data: CachedEpisode = JSON.parse(cached);
    if (Date.now() - data.cachedAt > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return { summary: data.summary, source: data.source };
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function setCachedEpisode(showTitle: string, season: number, episode: number, summary: string, source: EpisodeSource): void {
  const key = getCacheKey(showTitle, season, episode);
  const data: CachedEpisode = {
    summary,
    source,
    cachedAt: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(data));
}

export function useEpisodeRecap() {
  const [recap, setRecap] = useState<RecapResult>({ summary: null, source: null });
  const [isLoading, setIsLoading] = useState(false);

  const fetchFandomEpisode = useCallback(async (
    showTitle: string,
    season: number,
    episode: number
  ): Promise<RecapResult> => {
    // MVP: Only Jujutsu Kaisen Season 1
    if (showTitle.toLowerCase() !== 'jujutsu kaisen' || season !== 1) {
      return { summary: null, source: null };
    }

    // Check cache first
    const cached = getCachedEpisode(showTitle, season, episode);
    if (cached) {
      return cached;
    }

    try {
      // Fetch Fandom wiki page
      const fetchResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-fandom-episode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ season, episode }),
      });

      if (!fetchResponse.ok) {
        return { summary: null, source: null };
      }

      const fetchData = await fetchResponse.json();
      if (!fetchData.combined || !fetchData.combined.trim()) {
        return { summary: null, source: null };
      }

      // Sanitize the raw text
      const sanitizeResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sanitize-episode-context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          rawText: fetchData.combined,
          season,
          episode,
        }),
      });

      if (!sanitizeResponse.ok) {
        // If sanitization fails, fall back to manual (don't use unsanitized)
        return { summary: null, source: null };
      }

      const sanitizeData = await sanitizeResponse.json();
      const sanitizedSummary = sanitizeData.sanitized?.trim() || null;

      if (!sanitizedSummary) {
        return { summary: null, source: null };
      }

      // Cache the sanitized result
      setCachedEpisode(showTitle, season, episode, sanitizedSummary, 'fandom');

      return { summary: sanitizedSummary, source: 'fandom' };
    } catch (err) {
      console.error('Error fetching Fandom episode:', err);
      return { summary: null, source: null };
    }
  }, []);

  const fetchRecap = useCallback(async (
    showId: number,
    season: number,
    episode: number,
    showTitle?: string
  ): Promise<RecapResult> => {
    setIsLoading(true);
    try {
      // Try TVMaze API for episode summary
      const response = await fetch(`https://api.tvmaze.com/shows/${showId}/episodebynumber?season=${season}&number=${episode}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.summary) {
          // Remove HTML tags from summary
          const summary = data.summary
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim();
          
          if (summary) {
            const result = { summary, source: 'tvmaze' as const };
            setRecap(result);
            setIsLoading(false);
            return result;
          }
        }
      }
      
      // Fallback to Fandom wiki (if showTitle provided and matches MVP criteria)
      if (showTitle) {
        const fandomResult = await fetchFandomEpisode(showTitle, season, episode);
        if (fandomResult.summary) {
          setRecap(fandomResult);
          setIsLoading(false);
          return fandomResult;
        }
      }
      
      // No recap found
      const result = { summary: null, source: null };
      setRecap(result);
      setIsLoading(false);
      return result;
    } catch (err) {
      console.error('Error fetching recap:', err);
      const result = { summary: null, source: null, error: 'Failed to fetch recap' };
      setRecap(result);
      setIsLoading(false);
      return result;
    }
  }, [fetchFandomEpisode]);

  const setManualRecap = (text: string) => {
    setRecap({ summary: text, source: 'manual' });
  };

  const clearRecap = () => {
    setRecap({ summary: null, source: null });
  };

  return {
    recap,
    isLoading,
    fetchRecap,
    setManualRecap,
    clearRecap,
  };
}
