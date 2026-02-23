import { Header } from '@/components/Header';
import { WatchSetupPanel } from '@/components/WatchSetupPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { QAStep } from '@/components/steps/QAStep';
import { EpisodePicker } from '@/components/EpisodePicker';
import { HistorySheet } from '@/components/HistorySheet';
import { useChat } from '@/hooks/useChat';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSidePanel } from '@/hooks/useSidePanel';
import { useEpisodeRecap } from '@/hooks/useEpisodeRecap';
import { useSessionStore } from '@/hooks/useSessionStore';
import { useInitFlow } from '@/hooks/useInitFlow';
import { WatchSetup, ResponseStyle, RefinementOption } from '@/lib/types';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';

const defaultSetup: WatchSetup = {
  platform: 'other',
  showTitle: '',
  showId: undefined,
  season: '',
  episode: '',
  timestamp: '',
  context: '',
};

// ─────────────────────────────────────────────────────────
//  Side-panel branch
// ─────────────────────────────────────────────────────────

function SidePanelApp() {
  const sessionStore = useSessionStore();
  const { phase, isDetecting, confirmManualSetup, requestRedetect } = useInitFlow(sessionStore);
  const { isLoading: isLoadingRecap } = useEpisodeRecap();

  const messagesKey = sessionStore.activeSession
    ? sessionStore.getMessagesKey(sessionStore.activeSession.meta.sessionId)
    : undefined;

  const { messages, isLoading, error, sendMessage, refineLastAnswer, clearChat, setError } =
    useChat(messagesKey);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [style, setStyle] = useState<ResponseStyle>('quick');
  const qaHistoryRef = useRef<HTMLDivElement>(null);

  const meta = sessionStore.activeSession?.meta ?? null;

  const lastAssistantMessage = useMemo(
    () => messages.slice().reverse().find((m) => m.role === 'assistant'),
    [messages]
  );
  const hasAnswer = Boolean(lastAssistantMessage?.content?.trim());

  // Auto-scroll when messages change
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

  // Sync message count to session metadata after each send
  useEffect(() => {
    if (sessionStore.activeSessionId && messages.length > 0) {
      sessionStore.syncMessageCount(sessionStore.activeSessionId);
    }
  }, [messages.length, sessionStore.activeSessionId]);

  const watchSetup = useMemo((): WatchSetup => ({
    platform: meta?.platform ?? 'other',
    showTitle: meta?.showTitle ?? '',
    showId: meta?.showId,
    season: meta?.season ?? '',
    episode: meta?.episode ?? '',
    timestamp: '',
    context: meta?.context ?? '',
  }), [meta]);

  const handleSubmitQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;
    sendMessage(question.trim(), watchSetup, style);
    setQuestion('');
    setTimeout(() => {
      qaHistoryRef.current?.scrollTo({
        top: qaHistoryRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 50);
  };

  const handleShowChange = useCallback((show: { id: number; name: string }) => {
    // Open a "needs-episode" session for the new show (episode TBD)
    sessionStore.loadOrCreateSession(show.name, show.id, 'other', '', '');
  }, [sessionStore]);

  const handleEpisodeChange = useCallback((season: string, episode: string) => {
    if (!meta) return;
    sessionStore.loadOrCreateSession(
      meta.showTitle,
      meta.showId,
      meta.platform,
      season,
      episode
    );
  }, [sessionStore, meta]);

  const handleContextChange = useCallback((context: string) => {
    sessionStore.updateContext(context);
  }, [sessionStore]);

  const handleClearChat = useCallback(() => {
    clearChat();
  }, [clearChat]);

  const handleEpisodePickerConfirm = useCallback((season: string, episode: string) => {
    if (!meta) return;
    confirmManualSetup(meta.showTitle, meta.showId, meta.platform, season, episode);
  }, [meta, confirmManualSetup]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header
        statusBadgeProps={{
          meta,
          isDetecting,
          phase,
          onShowChange: handleShowChange,
          onEpisodeChange: handleEpisodeChange,
          onContextChange: handleContextChange,
          onClearChat: handleClearChat,
          onRedetect: requestRedetect,
        }}
        onOpenHistory={() => setIsHistoryOpen(true)}
        sessionCount={sessionStore.confirmedSessions.length}
      />

      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="p-3 space-y-3">

          {/* Detecting / resolving */}
          {(phase === 'detecting' || phase === 'resolving') && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {phase === 'detecting' ? 'Looking for show info…' : 'Loading show data…'}
              </p>
            </div>
          )}

          {/* No show detected */}
          {phase === 'no-show' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-2xl">🍿</p>
              <p className="text-sm font-medium text-foreground">Pick something to watch</p>
              <p className="text-xs text-muted-foreground">
                Click into a show on Crunchyroll or Netflix and I'll jump in automatically.
              </p>
            </div>
          )}

          {/* Show detected but no episode */}
          {phase === 'needs-episode' && meta && meta.showId && (
            <EpisodePicker
              show={{ id: meta.showId, name: meta.showTitle }}
              initialSeason={meta.season}
              onConfirm={handleEpisodePickerConfirm}
            />
          )}

          {/* Ready / error — show chat */}
          {(phase === 'ready' || phase === 'error') && (
            <QAStep
              messages={messages}
              isLoading={isLoading}
              error={error}
              question={question}
              style={style}
              hasAnswer={hasAnswer}
              meta={meta}
              isLoadingRecap={isLoadingRecap}
              phase={phase}
              qaHistoryRef={qaHistoryRef}
              onQuestionChange={setQuestion}
              onSubmit={handleSubmitQuestion}
              onStyleSelect={setStyle}
            />
          )}

        </div>
      </main>

      <HistorySheet
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        sessions={sessionStore.confirmedSessions}
        activeSessionId={sessionStore.activeSessionId}
        onSwitch={sessionStore.switchSession}
        onDelete={sessionStore.deleteSession}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  Web-app branch (unchanged)
// ─────────────────────────────────────────────────────────

function WebApp() {
  const [watchSetup, setWatchSetup] = useLocalStorage<WatchSetup>('spoilershield-setup', defaultSetup);
  const { messages, isLoading, error, sendMessage, refineLastAnswer } = useChat();

  const handleSendMessage = (message: string, style: ResponseStyle) => {
    sendMessage(message, watchSetup, style);
  };

  const handleRefine = (refinement: RefinementOption) => {
    refineLastAnswer(refinement, watchSetup);
  };

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
}

// ─────────────────────────────────────────────────────────
//  Root component — branch on isSidePanel
// ─────────────────────────────────────────────────────────

const Index = () => {
  const isSidePanel = useSidePanel();
  if (isSidePanel) return <SidePanelApp />;
  return <WebApp />;
};

export default Index;
