import { Header } from '@/components/Header';
import { WatchSetupPanel } from '@/components/WatchSetupPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { useChat } from '@/hooks/useChat';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { WatchSetup, ResponseStyle, RefinementOption } from '@/lib/types';

const defaultSetup: WatchSetup = {
  platform: 'crunchyroll',
  showTitle: '',
  season: '',
  episode: '',
  timestamp: '',
  context: '',
};

const Index = () => {
  const [watchSetup, setWatchSetup] = useLocalStorage<WatchSetup>('spoilershield-setup', defaultSetup);
  const { messages, isLoading, error, sendMessage, refineLastAnswer, setError } = useChat();

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
