import { Header } from '@/components/Header';
import { WatchSetupPanel } from '@/components/WatchSetupPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { ShowStep } from '@/components/steps/ShowStep';
import { ProgressStep } from '@/components/steps/ProgressStep';
import { ContextStep } from '@/components/steps/ContextStep';
import { QAStep } from '@/components/steps/QAStep';
import { useChat } from '@/hooks/useChat';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSidePanel } from '@/hooks/useSidePanel';
import { useEpisodeRecap } from '@/hooks/useEpisodeRecap';
import { WatchSetup, ResponseStyle, RefinementOption } from '@/lib/types';
import { toast } from '@/components/ui/sonner';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';

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
  const { recap, isLoading: isLoadingRecap, fetchRecap } = useEpisodeRecap();

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

          const prevTitle = lastDetectedShowTitleRef.current;
          const showChanged = prevTitle !== null && prevTitle !== newShowTitle;
          const isFirstDetection = prevTitle === null;

          lastDetectedShowTitleRef.current = newShowTitle;

          setDetectedShowInfo({
            platform: showInfo.platform || 'other',
            showTitle: newShowTitle,
            episodeInfo: showInfo.episodeInfo,
          });
          setLastDetectedShowTitle(newShowTitle);

          if (isDetectingRef.current || showChanged || isFirstDetection) {
            setIsDetectedDismissed(false);
          }

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

    if (window.parent && window.parent !== window) {
      const requestShowInfo = () => {
        window.parent.postMessage({ type: 'SPOILERSHIELD_REQUEST_SHOW_INFO' }, '*');
      };

      requestShowInfo();
      setTimeout(requestShowInfo, 100);
      setTimeout(requestShowInfo, 500);
      setTimeout(requestShowInfo, 1000);
      setTimeout(requestShowInfo, 2000);

      const intervalId = setInterval(() => {
        requestShowInfo();
      }, 3000);

      return () => {
        window.removeEventListener('message', onMessage);
        clearInterval(intervalId);
      };
    }

    return () => window.removeEventListener('message', onMessage);
  }, [isSidePanel]);

  const hasAutoSearched = useRef(false);
  const qaHistoryRef = useRef<HTMLDivElement>(null);

  // Auto-scroll Q&A history when new messages arrive or when loading starts
  useEffect(() => {
    if (qaHistoryRef.current) {
      setTimeout(() => {
        qaHistoryRef.current?.scrollTo({
          top: qaHistoryRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [messages, isLoading]);

  // Auto-search for detected show when detectedShowInfo is available (but don't auto-select)
  useEffect(() => {
    if (!isSidePanel || !detectedShowInfo || selectedShow || hasAutoSearched.current || isDetectedDismissed) return;

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
        hasAutoSearched.current = false;
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
      hasAutoSearched.current = false;
    }
  }, [detectedShowInfo?.showTitle, selectedShow]);

  const handleSendMessage = (message: string, style: ResponseStyle) => {
    sendMessage(message, watchSetup, style);
  };

  const handleRefine = (refinement: RefinementOption) => {
    refineLastAnswer(refinement, watchSetup);
  };

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

  // --- All handlers (moved above if(isSidePanel) to satisfy Rules of Hooks) ---

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
    setIsDetectedDismissed(true);
    setCurrentStep('progress');
    lastRecapKey.current = '';
    setLastDetectedShowTitle(show.name);
  }, [setWatchSetup]);

  const handleConfirmDetected = useCallback(() => {
    if (!detectedShowInfo) return;

    const detectedShowChanged = selectedShow?.name !== detectedShowInfo.showTitle ||
                                 watchSetup.showTitle !== detectedShowInfo.showTitle;

    const resetProgress = () => {
      setWatchSetup((prev) => ({
        ...prev,
        season: detectedShowInfo.episodeInfo?.season || '',
        episode: detectedShowInfo.episodeInfo?.episode || '',
        timestamp: '',
        context: '',
      }));
    };

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

    if (watchSetup.showId && watchSetup.showTitle && watchSetup.showTitle === detectedShowInfo.showTitle && !detectedShowChanged) {
      setSelectedShow({ id: watchSetup.showId, name: watchSetup.showTitle });
      resetProgress();
      setCurrentStep('progress');
      toast.success('Show confirmed');
    } else {
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
            toast.success('Show confirmed');
          }
        } catch (err) {
          console.error('Error searching show:', err);
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
          toast.success('Show confirmed');
        }
      };
      searchNow();
    }
  }, [detectedShowInfo, watchSetup, setWatchSetup, selectedShow]);

  const handleChangeDetected = useCallback(() => {
    setIsDetectedDismissed(true);
  }, []);

  const handleRedetectShow = useCallback(() => {
    setIsDetecting(true);
    setIsDetectedDismissed(false);
    hasAutoSearched.current = false;

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'SPOILERSHIELD_REQUEST_REDETECT' }, '*');

      const requestInfo = () => {
        window.parent.postMessage({ type: 'SPOILERSHIELD_REQUEST_SHOW_INFO' }, '*');
      };
      requestInfo();
      setTimeout(requestInfo, 500);
      setTimeout(requestInfo, 1000);
      setTimeout(requestInfo, 2000);
    }

    setTimeout(() => {
      setIsDetecting(false);
    }, 3000);
  }, []);

  const handleConfirmProgress = async () => {
    if (!selectedShow || !watchSetup.season || !watchSetup.episode) {
      toast.error('Please select a show, season, and episode');
      return;
    }

    if (!watchSetup.context || !watchSetup.context.trim()) {
      setCurrentStep('context');
      setIsProgressConfirmed(false);
      toast.info('Please provide episode context');
      return;
    }

    setIsProgressConfirmed(true);
    setCurrentStep('qa');
    setError(null);
    toast.success('Progress confirmed');
  };

  const handleBack = useCallback(() => {
    if (currentStep === 'qa') {
      setCurrentStep('context');
    } else if (currentStep === 'context') {
      setCurrentStep('progress');
    } else if (currentStep === 'progress') {
      setCurrentStep('show');
    }
  }, [currentStep]);

  const handleChangeShow = useCallback(() => {
    setCurrentStep('show');
    setSelectedShow(null);
    setIsProgressConfirmed(false);
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

    setTimeout(() => {
      qaHistoryRef.current?.scrollTo({
        top: qaHistoryRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 50);
  };

  const handleSeasonChange = useCallback((season: string) => {
    setWatchSetup((prev) => {
      if (prev.season === season) return prev;
      return { ...prev, season, episode: '', context: '' };
    });
    lastRecapKey.current = '';
  }, [setWatchSetup]);

  const handleEpisodeChange = useCallback((episode: string) => {
    setWatchSetup((prev) => {
      if (prev.episode === episode) return prev;
      return { ...prev, episode, context: '' };
    });
    lastRecapKey.current = '';
  }, [setWatchSetup]);

  const handleTimestampChange = useCallback((timestamp: string) => {
    setWatchSetup((prev) => {
      if (prev.timestamp === timestamp) return prev;
      return { ...prev, timestamp };
    });
  }, [setWatchSetup]);

  const canConfirmProgress = (selectedShow || watchSetup.showTitle) && watchSetup.season && watchSetup.episode;

  const effectiveStep: 'show' | 'progress' | 'context' | 'qa' = (() => {
    if (currentStep) {
      if (currentStep === 'qa' && (!watchSetup.context || !watchSetup.context.trim())) {
        return 'context';
      }
      return currentStep;
    }

    if (!selectedShow) return 'show';

    if (!isProgressConfirmed) {
      if (!watchSetup.context || !watchSetup.context.trim()) return 'context';
      return 'progress';
    }

    if (!watchSetup.context || !watchSetup.context.trim()) return 'context';

    return 'qa';
  })();

  if (isSidePanel) {
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
            {effectiveStep === 'show' && (
              <ShowStep
                detectedShowInfo={detectedShowInfo}
                isDetecting={isDetecting}
                isDetectedDismissed={isDetectedDismissed}
                isSearchingForMatch={isSearchingForMatch}
                onConfirmDetected={handleConfirmDetected}
                onChangeDetected={handleChangeDetected}
                onRedetectShow={handleRedetectShow}
                onShowSelect={handleShowSelect}
              />
            )}

            {effectiveStep === 'progress' && (selectedShow || watchSetup.showTitle) && (
              <ProgressStep
                selectedShow={selectedShow}
                watchSetup={watchSetup}
                recap={recap}
                isLoadingRecap={isLoadingRecap}
                canConfirmProgress={!!canConfirmProgress}
                onSeasonChange={handleSeasonChange}
                onEpisodeChange={handleEpisodeChange}
                onTimestampChange={handleTimestampChange}
                onContextChange={(context) => setWatchSetup((prev) => ({ ...prev, context }))}
                onConfirmProgress={handleConfirmProgress}
                onGoToSearch={() => setCurrentStep('show')}
                onEditContext={handleChangeContext}
              />
            )}

            {effectiveStep === 'context' && canConfirmProgress && (
              <ContextStep
                context={watchSetup.context}
                onContextChange={(context) => setWatchSetup((prev) => ({ ...prev, context }))}
                onContinue={() => {
                  setIsEditingContext(false);
                  setCurrentStep('qa');
                  setIsProgressConfirmed(true);
                }}
              />
            )}

            {effectiveStep === 'qa' && isProgressConfirmed && (
              <QAStep
                messages={messages}
                isLoading={isLoading}
                error={error}
                question={question}
                style={style}
                hasAnswer={hasAnswer}
                context={watchSetup.context}
                qaHistoryRef={qaHistoryRef}
                onQuestionChange={setQuestion}
                onSubmit={handleSubmitQuestion}
                onStyleSelect={setStyle}
                onEditContext={handleChangeContext}
              />
            )}

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
