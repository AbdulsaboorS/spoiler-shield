import { Header } from '@/components/Header';
import { WatchSetupPanel } from '@/components/WatchSetupPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { useChat } from '@/hooks/useChat';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { WatchSetup, ResponseStyle, RefinementOption } from '@/lib/types';
import { toast } from '@/components/ui/sonner';
import { useEffect } from 'react';

const defaultSetup: WatchSetup = {
  platform: 'crunchyroll',
  showTitle: '',
  season: '',
  episode: '',
  timestamp: '',
  context: '',
};

const SPOILERSHIELD_EXTENSION_TOKEN = 'spoilershield-mvp-1';

const Index = () => {
  const [watchSetup, setWatchSetup] = useLocalStorage<WatchSetup>('spoilershield-setup', defaultSetup);
  const { messages, isLoading, error, sendMessage, refineLastAnswer, setError } = useChat();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Accept context prefill only if it contains our shared token.
      const data = event.data as unknown;
      if (!data || typeof data !== 'object') return;

      const maybe = data as {
        type?: unknown;
        token?: unknown;
        payload?: unknown;
      };

      if (maybe.type !== 'SPOILERSHIELD_PREFILL') return;
      if (maybe.token !== SPOILERSHIELD_EXTENSION_TOKEN) return;
      if (!maybe.payload || typeof maybe.payload !== 'object') return;

      const payload = maybe.payload as Partial<{
        platform: string;
        title: string;
        season: string;
        episode: string;
        timestamp: string;
        context: string;
      }>;

      setWatchSetup((prev) => ({
        ...prev,
        platform: typeof payload.platform === 'string' ? payload.platform : prev.platform,
        showTitle: typeof payload.title === 'string' ? payload.title : prev.showTitle,
        season: typeof payload.season === 'string' ? payload.season : prev.season,
        episode: typeof payload.episode === 'string' ? payload.episode : prev.episode,
        timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : prev.timestamp,
        context: typeof payload.context === 'string' ? payload.context : prev.context,
      }));

      setError(null);
      const platformLabel =
        typeof payload.platform === 'string' && payload.platform.trim()
          ? payload.platform
          : 'your player';
      toast(`Context loaded from ${platformLabel}`);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setError, setWatchSetup]);

  const handleSendMessage = (message: string, style: ResponseStyle) => {
    sendMessage(message, watchSetup, style);
  };

  const handleRefine = (refinement: RefinementOption) => {
    refineLastAnswer(refinement, watchSetup);
  };

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
