import { Header } from '@/components/Header';
import { WatchSetupPanel } from '@/components/WatchSetupPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { ShowSearch } from '@/components/ShowSearch';
import { EpisodeSelector } from '@/components/EpisodeSelector';
import { ProgressConfirmation } from '@/components/ProgressConfirmation';
import { useChat } from '@/hooks/useChat';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSidePanel } from '@/hooks/useSidePanel';
import { useEpisodeRecap } from '@/hooks/useEpisodeRecap';
import { WatchSetup, ResponseStyle, RefinementOption } from '@/lib/types';
import { toast } from '@/components/ui/sonner';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StylePills } from '@/components/StylePills';
import { RefreshCw, Loader2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const defaultSetup: WatchSetup = {
  platform: 'other',
  showTitle: '',
  showId: undefined,
  season: '',
  episode: '',
  timestamp: '',
  context: '',
};

const SPOILERSHIELD_EXTENSION_TOKEN = 'spoilershield-mvp-1';

const Index = () => {
  const [watchSetup, setWatchSetup] = useLocalStorage<WatchSetup>('spoilershield-setup', defaultSetup);
  const { messages, isLoading, error, sendMessage, refineLastAnswer, setError } = useChat();
  const isSidePanel = useSidePanel();
  const [selectedShow, setSelectedShow] = useState<{ id: number; name: string } | null>(() => {
    // Only restore from localStorage if we have both ID and title
    if (watchSetup.showId && watchSetup.showTitle) {
      return { id: watchSetup.showId, name: watchSetup.showTitle };
    }
    return null;
  });
  const [detectedShowInfo, setDetectedShowInfo] = useState<{
    platform: string;
    showTitle: string;
    episodeInfo?: { season: string; episode: string };
  } | null>(null);
  const [isDetectedDismissed, setIsDetectedDismissed] = useState(false);
  const [isSearchingForMatch, setIsSearchingForMatch] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastDetectedShowTitle, setLastDetectedShowTitle] = useState<string | null>(null);
  const lastDetectedShowTitleRef = useRef<string | null>(null);
  const isDetectingRef = useRef(false);
  const selectedShowRef = useRef<{ id: number; name: string } | null>(null);
  const [isProgressConfirmed, setIsProgressConfirmed] = useState(false);
  const [currentStep, setCurrentStep] = useState<'show' | 'progress' | 'context' | 'qa'>('show');
  const [question, setQuestion] = useState('');
  const [style, setStyle] = useState<ResponseStyle>('quick');
  const [isEditingContext, setIsEditingContext] = useState(false);
  const { recap, isLoading: isLoadingRecap, fetchRecap, setManualRecap } = useEpisodeRecap();
  
  const lastAssistantMessage = useMemo(
    () => messages.slice().reverse().find((m) => m.role === 'assistant'),
    [messages]
  );
  const hasAnswer = Boolean(lastAssistantMessage?.content?.trim());

  // Listen for detected show info from extension (side panel mode only)
  useEffect(() => {
    if (!isSidePanel) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as unknown;
      if (!data || typeof data !== 'object') return;

      const maybe = data as { type?: unknown; payload?: unknown };

      // Debug logging
      if (process.env.NODE_ENV === 'development' && maybe.type === 'SPOILERSHIELD_SHOW_INFO') {
        console.log('[SpoilerShield] Received SPOILERSHIELD_SHOW_INFO message', {
          origin: event.origin,
          payload: maybe.payload,
        });
      }

      if (maybe.type === 'SPOILERSHIELD_SHOW_INFO') {
        const showInfo = maybe.payload as {
          platform?: string;
          showTitle?: string;
          episodeInfo?: { season: string; episode: string };
        };

        console.log('[SpoilerShield] Received SPOILERSHIELD_SHOW_INFO:', {
          hasPayload: !!showInfo,
          showTitle: showInfo?.showTitle,
          platform: showInfo?.platform,
        });

        if (showInfo && showInfo.showTitle) {
          console.log('[SpoilerShield] Setting detected show info:', showInfo);
          const newShowTitle = showInfo.showTitle;
          
          // Read current value from ref (synchronous, always up-to-date)
          const prevTitle = lastDetectedShowTitleRef.current;
          const showChanged = prevTitle !== null && prevTitle !== newShowTitle;
          const isFirstDetection = prevTitle === null;
          
          // Update ref immediately
          lastDetectedShowTitleRef.current = newShowTitle;
          
          // Update detected show info
          setDetectedShowInfo({
            platform: showInfo.platform || 'other',
            showTitle: newShowTitle,
            episodeInfo: showInfo.episodeInfo,
          });
          setLastDetectedShowTitle(newShowTitle);
          
          // Only reset dismissed state if:
          // 1. Actively detecting (re-detect button clicked)
          // 2. Show changed (new show detected)
          // 3. This is the first detection
          // Don't reset when just navigating back or on refresh
          if (isDetectingRef.current || showChanged || isFirstDetection) {
            setIsDetectedDismissed(false);
          }
          
          // If show changed, reset progress to prevent leaking between shows
          if (showChanged && selectedShowRef.current) {
            setSelectedShow(null);
            setWatchSetup((prev) => ({
              ...prev,
              showId: undefined,
              showTitle: '',
              season: '',
              episode: '',
              timestamp: '',
              context: '',
            }));
            setIsProgressConfirmed(false);
            setCurrentStep('show');
          }
          
          setIsDetecting(false);
        } else {
          console.log('[SpoilerShield] Show info received but invalid:', showInfo);
          setIsDetecting(false);
        }
      }
    };

    window.addEventListener('message', onMessage);

    // Request show info on load (multiple attempts for reliability)
    if (window.parent && window.parent !== window) {
      const requestShowInfo = () => {
        window.parent.postMessage({ type: 'SPOILERSHIELD_REQUEST_SHOW_INFO' }, '*');
      };
      
      // Request immediately and with retries
      requestShowInfo();
      setTimeout(requestShowInfo, 100);
      setTimeout(requestShowInfo, 500);
      setTimeout(requestShowInfo, 1000);
      setTimeout(requestShowInfo, 2000);
      
      // Also set up periodic refresh to catch storage updates (every 3 seconds)
      // This ensures we catch storage changes even if the storage listener misses them
      const intervalId = setInterval(() => {
        requestShowInfo();
      }, 3000);
      
      return () => {
        window.removeEventListener('message', onMessage);
        clearInterval(intervalId);
      };
    }

    return () => window.removeEventListener('message', onMessage);
  }, [isSidePanel]); // Only depend on isSidePanel - message handler uses refs/state setters which are stable

  // Track if we've already attempted auto-search to prevent loops
  const hasAutoSearched = useRef(false);
  
  // Ref for Q&A history auto-scroll
  const qaHistoryRef = useRef<HTMLDivElement>(null);

  // Auto-scroll Q&A history when new messages arrive or when loading starts
  useEffect(() => {
    if (qaHistoryRef.current) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        qaHistoryRef.current?.scrollTo({
          top: qaHistoryRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [messages, isLoading]);

  // Auto-search for detected show when detectedShowInfo is available (but don't auto-select)
  useEffect(() => {
    if (!isSidePanel || !detectedShowInfo || selectedShow || hasAutoSearched.current || isDetectedDismissed) return;

    // Search for the detected show in TVMaze (only once) - just to find a match
    hasAutoSearched.current = true;
    setIsSearchingForMatch(true);
    
    const searchShow = async () => {
      try {
        const response = await fetch(
          `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(detectedShowInfo.showTitle)}`
        );
        if (!response.ok) {
          setIsSearchingForMatch(false);
          return;
        }

        const data = await response.json();
        setIsSearchingForMatch(false);
        
        // Store the match but don't auto-select - wait for user to confirm
        if (data.length > 0) {
          const matchedShow = data[0].show;
          setWatchSetup((prev) => ({
            ...prev,
            showId: matchedShow.id,
            showTitle: matchedShow.name,
            platform: detectedShowInfo.platform,
            season: detectedShowInfo.episodeInfo?.season || '',
            episode: detectedShowInfo.episodeInfo?.episode || '',
          }));
        }
      } catch (err) {
        console.error('Error searching for detected show:', err);
        setIsSearchingForMatch(false);
        hasAutoSearched.current = false; // Allow retry on error
      }
    };

    searchShow();
  }, [isSidePanel, detectedShowInfo?.showTitle, selectedShow, setWatchSetup, isDetectedDismissed]);

  // Reset auto-search flag when show is manually selected
  useEffect(() => {
    if (selectedShow) {
      hasAutoSearched.current = false;
      setIsDetectedDismissed(true);
    }
  }, [selectedShow]);

  // Reset dismissed state when new detection comes in
  useEffect(() => {
    if (detectedShowInfo && !selectedShow) {
      setIsDetectedDismissed(false);
      hasAutoSearched.current = false; // Allow re-search for new detection
    }
  }, [detectedShowInfo?.showTitle, selectedShow]);

  const handleSendMessage = (message: string, style: ResponseStyle) => {
    sendMessage(message, watchSetup, style);
  };

  const handleRefine = (refinement: RefinementOption) => {
    refineLastAnswer(refinement, watchSetup);
  };

  // Track last fetched recap to prevent re-fetching
  const lastRecapKey = useRef<string>('');

  // Fetch recap when show/episode is selected (only once per episode)
  useEffect(() => {
    if (
      isSidePanel &&
      selectedShow &&
      watchSetup.season &&
      watchSetup.episode &&
      !isProgressConfirmed
    ) {
      const recapKey = `${selectedShow.id}-${watchSetup.season}-${watchSetup.episode}`;
      
      // Only fetch if we haven't already fetched for this episode
      if (lastRecapKey.current !== recapKey) {
        lastRecapKey.current = recapKey;
        fetchRecap(
          selectedShow.id,
          parseInt(watchSetup.season),
          parseInt(watchSetup.episode),
          watchSetup.showTitle || selectedShow.name
        );
      }
    }
  }, [isSidePanel, selectedShow?.id, watchSetup.season, watchSetup.episode, isProgressConfirmed]);

  // Update watchSetup.context when recap is fetched (only if different)
  useEffect(() => {
    if (recap.summary && isSidePanel && watchSetup.context !== recap.summary) {
      setWatchSetup((prev) => ({
        ...prev,
        context: recap.summary || prev.context,
      }));
    }
  }, [recap.summary, isSidePanel]);

  // Keep refs in sync with state for message handler
  useEffect(() => {
    isDetectingRef.current = isDetecting;
  }, [isDetecting]);

  useEffect(() => {
    selectedShowRef.current = selectedShow;
  }, [selectedShow]);

  if (isSidePanel) {
    const handleShowSelect = useCallback((show: { id: number; name: string }) => {
      setSelectedShow(show);
      setWatchSetup((prev) => ({
        ...prev,
        showId: show.id,
        showTitle: show.name,
        season: '',
        episode: '',
        timestamp: '',
        context: '',
      }));
      setIsProgressConfirmed(false);
      setIsDetectedDismissed(true); // Dismiss detected section when manually selecting
      setCurrentStep('progress');
      lastRecapKey.current = ''; // Reset recap cache when show changes
      // Update last detected show title to prevent false show change detection
      setLastDetectedShowTitle(show.name);
    }, [setWatchSetup]);

    const handleConfirmDetected = useCallback(() => {
      if (!detectedShowInfo) return;
      
      // Check if detected show is different from currently selected show
      const detectedShowChanged = selectedShow?.name !== detectedShowInfo.showTitle || 
                                   watchSetup.showTitle !== detectedShowInfo.showTitle;
      
      // Always reset progress when confirming detected show (prevents progress leak)
      // Use detected episodeInfo if available, otherwise clear progress
      const resetProgress = () => {
        setWatchSetup((prev) => ({
          ...prev,
          season: detectedShowInfo.episodeInfo?.season || '',
          episode: detectedShowInfo.episodeInfo?.episode || '',
          timestamp: '',
          context: '',
        }));
      };
      
      // If detected show changed, always reset everything first
      if (detectedShowChanged && selectedShow) {
        setSelectedShow(null);
        setWatchSetup((prev) => ({
          ...prev,
          showId: undefined,
          showTitle: '',
          season: '',
          episode: '',
          timestamp: '',
          context: '',
        }));
        setIsProgressConfirmed(false);
      }
      
      // If we have a match from TVMaze search, use it
      if (watchSetup.showId && watchSetup.showTitle && watchSetup.showTitle === detectedShowInfo.showTitle && !detectedShowChanged) {
        setSelectedShow({ id: watchSetup.showId, name: watchSetup.showTitle });
        resetProgress();
        setCurrentStep('progress');
        // Don't dismiss - keep card visible for navigation back
        toast.success('Show confirmed');
      } else {
        // Best effort: use detected title even without TVMaze match
        // Search for it now as a fallback
        const searchNow = async () => {
          try {
            const response = await fetch(
              `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(detectedShowInfo.showTitle)}`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.length > 0) {
                const matchedShow = data[0].show;
                setSelectedShow({ id: matchedShow.id, name: matchedShow.name });
                setSelectedShow({ id: matchedShow.id, name: matchedShow.name });
                setWatchSetup((prev) => ({
                  ...prev,
                  showId: matchedShow.id,
                  showTitle: matchedShow.name,
                  platform: detectedShowInfo.platform,
                  season: detectedShowInfo.episodeInfo?.season || '',
                  episode: detectedShowInfo.episodeInfo?.episode || '',
                  timestamp: '',
                  context: '',
                }));
                setLastDetectedShowTitle(matchedShow.name);
              } else {
                // No match found, use detected title anyway
                setWatchSetup((prev) => ({
                  ...prev,
                  showTitle: detectedShowInfo.showTitle,
                  platform: detectedShowInfo.platform,
                  season: detectedShowInfo.episodeInfo?.season || '',
                  episode: detectedShowInfo.episodeInfo?.episode || '',
                  timestamp: '',
                  context: '',
                }));
                setLastDetectedShowTitle(detectedShowInfo.showTitle);
              }
              setCurrentStep('progress');
              // Don't dismiss - keep card visible for navigation back
              toast.success('Show confirmed');
            }
          } catch (err) {
            console.error('Error searching show:', err);
            // Fallback: use detected title anyway
            setWatchSetup((prev) => ({
              ...prev,
              showTitle: detectedShowInfo.showTitle,
              platform: detectedShowInfo.platform,
              season: detectedShowInfo.episodeInfo?.season || '',
              episode: detectedShowInfo.episodeInfo?.episode || '',
              timestamp: '',
              context: '',
            }));
            setCurrentStep('progress');
            // Don't dismiss - keep card visible for navigation back
            toast.success('Show confirmed');
          }
        };
        searchNow();
      }
    }, [detectedShowInfo, watchSetup, setWatchSetup]);

    const handleChangeDetected = useCallback(() => {
      setIsDetectedDismissed(true);
      // Focus will go to search input automatically
    }, []);

    const handleRedetectShow = useCallback(() => {
      // Request fresh detection from content script
      setIsDetecting(true);
      setIsDetectedDismissed(false);
      hasAutoSearched.current = false; // Allow re-search
      
      // Request the extension to trigger re-detection in content script
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'SPOILERSHIELD_REQUEST_REDETECT' }, '*');
      }
      
      // Also request fresh show info from storage (will be updated by content script)
      if (window.parent && window.parent !== window) {
        // Request multiple times to catch the storage update
        const requestInfo = () => {
          window.parent.postMessage({ type: 'SPOILERSHIELD_REQUEST_SHOW_INFO' }, '*');
        };
        requestInfo();
        setTimeout(requestInfo, 500);
        setTimeout(requestInfo, 1000);
        setTimeout(requestInfo, 2000);
      }
      
      // Reset detecting state after delay (will be reset earlier if new info arrives)
      setTimeout(() => {
        setIsDetecting(false);
      }, 3000);
    }, []);

    const handleConfirmProgress = async () => {
      if (!selectedShow || !watchSetup.season || !watchSetup.episode) {
        toast.error('Please select a show, season, and episode');
        return;
      }

      // Check if context exists - if not, go to context step first
      if (!watchSetup.context || !watchSetup.context.trim()) {
        setCurrentStep('context');
        setIsProgressConfirmed(false);
        toast.info('Please provide episode context');
        return;
      }

      // Context exists, proceed to Q&A
      setIsProgressConfirmed(true);
      setCurrentStep('qa');
      setError(null);
      toast.success('Progress confirmed');
    };

    // Navigation handlers
    const handleBack = useCallback(() => {
      if (currentStep === 'qa') {
        setCurrentStep('context');
      } else if (currentStep === 'context') {
        setCurrentStep('progress');
      } else if (currentStep === 'progress') {
        setCurrentStep('show');
        // Don't reset isDetectedDismissed - preserve user's choice
      }
    }, [currentStep]);

    const handleChangeShow = useCallback(() => {
      setCurrentStep('show');
      setSelectedShow(null);
      setIsProgressConfirmed(false);
      // Don't reset isDetectedDismissed - preserve user's choice
    }, []);

    const handleChangeProgress = useCallback(() => {
      setCurrentStep('progress');
      setIsProgressConfirmed(false);
    }, []);

    const handleChangeContext = useCallback(() => {
      setCurrentStep('context');
      setIsEditingContext(true);
      setIsProgressConfirmed(false);
    }, []);

    const handleSubmitQuestion = (e: React.FormEvent) => {
      e.preventDefault();
      if (!question.trim() || isLoading) return;
      if (!watchSetup.context.trim()) {
        toast.error('Please provide episode context (recap or manual paste)');
        return;
      }
      sendMessage(question.trim(), watchSetup, style);
      setQuestion('');
      
      // Scroll immediately when question is submitted
      setTimeout(() => {
        qaHistoryRef.current?.scrollTo({
          top: qaHistoryRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 50);
    };

    const canConfirmProgress = (selectedShow || watchSetup.showTitle) && watchSetup.season && watchSetup.episode;

    // Determine current step based on state (fallback logic if currentStep not set)
    const effectiveStep: 'show' | 'progress' | 'context' | 'qa' = (() => {
      // If currentStep is explicitly set, use it (but validate)
      if (currentStep) {
        // If trying to go to Q&A but no context, redirect to context step
        if (currentStep === 'qa' && (!watchSetup.context || !watchSetup.context.trim())) {
          return 'context';
        }
        return currentStep;
      }
      
      // Otherwise, determine from state
      if (!selectedShow) {
        return 'show';
      }
      
      // If progress not confirmed, we're on progress step
      if (!isProgressConfirmed) {
        // But if context is missing, go to context step
        if (!watchSetup.context || !watchSetup.context.trim()) {
          return 'context';
        }
        return 'progress';
      }
      
      // Progress confirmed - check if context exists before going to Q&A
      if (!watchSetup.context || !watchSetup.context.trim()) {
        return 'context';
      }
      
      // All good, go to Q&A
      return 'qa';
    })();

    // Memoized handlers to prevent re-renders
    const handleSeasonChange = useCallback((season: string) => {
      setWatchSetup((prev) => {
        if (prev.season === season) return prev; // Prevent unnecessary updates
        return { ...prev, season, episode: '', context: '' };
      });
      lastRecapKey.current = ''; // Reset recap cache
    }, [setWatchSetup]);

    const handleEpisodeChange = useCallback((episode: string) => {
      setWatchSetup((prev) => {
        if (prev.episode === episode) return prev; // Prevent unnecessary updates
        return { ...prev, episode, context: '' };
      });
      lastRecapKey.current = ''; // Reset recap cache
    }, [setWatchSetup]);

    const handleTimestampChange = useCallback((timestamp: string) => {
      setWatchSetup((prev) => {
        if (prev.timestamp === timestamp) return prev; // Prevent unnecessary updates
        return { ...prev, timestamp };
      });
    }, [setWatchSetup]);

    // Guided MVP side panel flow
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <Header 
          onBack={effectiveStep !== 'show' ? handleBack : undefined}
          onChangeShow={effectiveStep === 'qa' ? handleChangeShow : undefined}
          onChangeProgress={effectiveStep === 'qa' ? handleChangeProgress : undefined}
          onChangeContext={effectiveStep === 'qa' ? handleChangeContext : undefined}
          showBack={effectiveStep !== 'show'}
          showChangeShow={effectiveStep === 'qa'}
          showChangeProgress={effectiveStep === 'qa'}
          showChangeContext={effectiveStep === 'qa'}
        />
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="p-3 space-y-3">
            {/* Step 1: Search Show */}
            {effectiveStep === 'show' && (
              <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-3">
                <div className="text-sm font-medium text-foreground">Search Show</div>
                
                {/* Detected Show Section */}
                {(detectedShowInfo || isDetecting) && !isDetectedDismissed && (
                  <div className="rounded-md bg-primary/10 border border-primary/20 p-3 space-y-3">
                    <div>
                      {isDetecting ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="text-xs text-muted-foreground">Detecting...</div>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Scanning page for show information</span>
                          </div>
                        </>
                      ) : detectedShowInfo ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="text-xs text-muted-foreground">Detected</div>
                            <Button
                              onClick={handleRedetectShow}
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                              disabled={isDetecting}
                              title="Re-detect show"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="text-sm font-medium text-foreground">{detectedShowInfo.showTitle}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {detectedShowInfo.platform.charAt(0).toUpperCase() + detectedShowInfo.platform.slice(1)}
                            {detectedShowInfo.episodeInfo && (
                              <> • S{detectedShowInfo.episodeInfo.season} E{detectedShowInfo.episodeInfo.episode}</>
                            )}
                          </div>
                          {isSearchingForMatch && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Searching for match...
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                    {detectedShowInfo && !isDetecting && (
                      <div className="flex gap-2">
                        <Button
                          onClick={handleConfirmDetected}
                          disabled={isSearchingForMatch}
                          className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
                          size="sm"
                        >
                          {isSearchingForMatch ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                              Searching...
                            </>
                          ) : (
                            'Confirm'
                          )}
                        </Button>
                        <Button
                          onClick={handleChangeDetected}
                          variant="outline"
                          className="flex-1 h-8 text-xs"
                          size="sm"
                        >
                          Change
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Manual Search */}
                <div className={cn("space-y-2", detectedShowInfo && !isDetectedDismissed && "opacity-60")}>
                  <div className="text-xs text-muted-foreground">
                    {detectedShowInfo && !isDetectedDismissed ? 'Or search manually:' : 'Search for a show:'}
                  </div>
                  <ShowSearch 
                    onSelect={handleShowSelect} 
                    initialValue={detectedShowInfo && !isDetectedDismissed ? detectedShowInfo.showTitle : undefined}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Select Progress */}
            {effectiveStep === 'progress' && (selectedShow || watchSetup.showTitle) && (
              <>
                <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-3">
                  <div className="text-sm font-medium text-foreground">
                    {selectedShow?.name || watchSetup.showTitle || 'Select Episode'}
                  </div>
                  {selectedShow && watchSetup.showId ? (
                    <EpisodeSelector
                      showId={selectedShow.id}
                      showName={selectedShow.name}
                      selectedSeason={watchSetup.season}
                      selectedEpisode={watchSetup.episode}
                      selectedTimestamp={watchSetup.timestamp}
                      onSeasonChange={handleSeasonChange}
                      onEpisodeChange={handleEpisodeChange}
                      onTimestampChange={handleTimestampChange}
                    />
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Show: {watchSetup.showTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Please search for this show to select episodes, or enter season/episode manually.
                      </p>
                      <Button
                        onClick={() => setCurrentStep('show')}
                        variant="outline"
                        size="sm"
                        className="w-full h-9 text-xs"
                      >
                        Search for Show
                      </Button>
                      {/* Manual entry fallback */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Season</label>
                          <Input
                            value={watchSetup.season}
                            onChange={(e) => handleSeasonChange(e.target.value)}
                            placeholder="S"
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Episode</label>
                          <Input
                            value={watchSetup.episode}
                            onChange={(e) => handleEpisodeChange(e.target.value)}
                            placeholder="E"
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Episode Recap */}
                {canConfirmProgress && (
                  <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-2">
                    <div className="text-sm font-medium text-foreground">Episode Context</div>
                    {isLoadingRecap ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Fetching episode recap...</span>
                      </div>
                    ) : recap.summary ? (
                      <div className="space-y-2">
                        <div className="rounded-md bg-muted/50 border border-border p-2.5 max-h-32 overflow-y-auto">
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                            {recap.summary}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Recap found automatically from TVMaze
                        </p>
                        {!watchSetup.context && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCurrentStep('context');
                              setIsEditingContext(true);
                            }}
                            className="w-full mt-2 h-8 text-xs"
                          >
                            Edit or add more context
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          No recap found automatically — paste a recap link or paste a short recap text.
                        </p>
                        <Textarea
                          value={watchSetup.context}
                          onChange={(e) =>
                            setWatchSetup((prev) => ({ ...prev, context: e.target.value }))
                          }
                          placeholder="Paste episode recap or summary here..."
                          className="min-h-[100px] bg-input border-border focus:ring-primary/20 resize-none text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Confirm Progress */}
                {canConfirmProgress && (
                  <ProgressConfirmation
                    showName={selectedShow?.name || watchSetup.showTitle || 'Unknown Show'}
                    season={watchSetup.season}
                    episode={watchSetup.episode}
                    timestamp={watchSetup.timestamp || undefined}
                    onConfirm={handleConfirmProgress}
                  />
                )}
              </>
            )}

            {/* Step 3: Edit Context (if needed) */}
            {effectiveStep === 'context' && canConfirmProgress && (
              <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-2">
                <div className="text-sm font-medium text-foreground">Edit Context</div>
                <Textarea
                  value={watchSetup.context}
                  onChange={(e) =>
                    setWatchSetup((prev) => ({ ...prev, context: e.target.value }))
                  }
                  placeholder="Paste episode recap or summary here..."
                  className="min-h-[150px] bg-input border-border focus:ring-primary/20 resize-none text-sm"
                />
                <Button
                  onClick={() => {
                    setIsEditingContext(false);
                    setCurrentStep('qa');
                    setIsProgressConfirmed(true);
                  }}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-sm"
                  disabled={!watchSetup.context.trim()}
                >
                  Continue to Q&A
                </Button>
              </div>
            )}

            {/* Step 4: Ask Questions (after confirmation) */}
            {effectiveStep === 'qa' && isProgressConfirmed && (
              <div className="space-y-3">
                {/* Safety check - if no context, show error card */}
                {!watchSetup.context || !watchSetup.context.trim() ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 space-y-3">
                    <div className="text-sm font-medium text-destructive">Context Required</div>
                    <p className="text-xs text-muted-foreground">
                      Episode context is required to ask questions safely. Please provide a recap or summary.
                    </p>
                    <Button
                      onClick={handleChangeContext}
                      variant="outline"
                      size="sm"
                      className="w-full h-9 text-sm"
                    >
                      Edit Context
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Q&A History - always show container, even if empty */}
                    <div 
                      ref={qaHistoryRef}
                      className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-3 max-h-[400px] overflow-y-auto min-h-[100px]"
                    >
                      {messages.length > 0 ? (
                        <>
                          <div className="text-sm font-medium text-foreground">Conversation</div>
                          <div className="space-y-3">
                            {messages.map((msg, idx) => {
                              // Group user question with its assistant answer
                              if (msg.role === 'user') {
                                const answer = messages[idx + 1];
                                return (
                                  <div key={msg.id} className="space-y-2 pb-3 border-b border-border last:border-0">
                                    <div className="text-xs text-muted-foreground font-medium">Question</div>
                                    <div className="text-sm text-foreground">{msg.content}</div>
                                    {answer && answer.role === 'assistant' && (
                                      <>
                                        <div className="text-xs text-muted-foreground font-medium mt-2">Answer</div>
                                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                          {answer.content}
                                        </div>
                                      </>
                                    )}
                                    {isLoading && idx === messages.length - 1 && (
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Thinking...
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-4">
                          Ready to help — ask your first question below
                        </div>
                      )}
                    </div>

                {/* Style chips */}
                {hasAnswer && (
                  <div className="flex justify-start">
                    <StylePills selected={style} onSelect={setStyle} />
                  </div>
                )}

                {/* Question input */}
                <form onSubmit={handleSubmitQuestion} className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Ask a question…"
                      disabled={isLoading || !watchSetup.context.trim()}
                      className="flex-1 bg-input border-border input-glow text-sm h-9"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isLoading || !question.trim() || !watchSetup.context.trim()}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Send'
                      )}
                    </Button>
                  </div>
                </form>

                {error && (
                  <div className="text-xs text-destructive">{error}</div>
                )}
                  </>
                )}
              </div>
            )}

            {/* Fallback: If no step matches, show error card */}
            {effectiveStep !== 'show' && 
             effectiveStep !== 'progress' && 
             effectiveStep !== 'context' && 
             effectiveStep !== 'qa' && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 space-y-3">
                <div className="text-sm font-medium text-destructive">Navigation Error</div>
                <p className="text-xs text-muted-foreground">
                  Something went wrong. Please try going back.
                </p>
                <Button
                  onClick={() => {
                    setCurrentStep('show');
                    setSelectedShow(null);
                    setIsProgressConfirmed(false);
                  }}
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-sm"
                >
                  Start Over
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Full web app layout (unchanged)
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Gradient glow background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 md:gap-6 h-[calc(100vh-140px)]">
          <WatchSetupPanel setup={watchSetup} onChange={setWatchSetup} />
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            error={error}
            onSendMessage={handleSendMessage}
            onRefine={handleRefine}
            watchSetup={watchSetup}
          />
        </div>
      </main>
    </div>
  );
};

export default Index;
