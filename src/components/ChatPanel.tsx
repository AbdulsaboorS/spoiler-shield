import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChatMessage as ChatMessageType, ResponseStyle, RefinementOption, WatchSetup, SpoilerReport } from '@/lib/types';
import { ChatMessage } from './ChatMessage';
import { StylePills } from './StylePills';
import { RefinementButtons } from './RefinementButtons';
import { ShieldBadge } from './ShieldBadge';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSidePanel } from '@/hooks/useSidePanel';
import { toast } from 'sonner';

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  error: string | null;
  onSendMessage: (message: string, style: ResponseStyle) => void;
  onRefine: (refinement: RefinementOption) => void;
  watchSetup: WatchSetup;
}

export function ChatPanel({ 
  messages, 
  isLoading, 
  error, 
  onSendMessage, 
  onRefine,
  watchSetup 
}: ChatPanelProps) {
  const isSidePanel = useSidePanel();
  const [input, setInput] = useState('');
  const [style, setStyle] = useState<ResponseStyle>('quick');
  const [reports, setReports] = useLocalStorage<SpoilerReport[]>('spoilershield-reports', []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    onSendMessage(input.trim(), style);
    setInput('');
  };

  const handleReportSpoiler = async (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const lastUserMessage = [...messages]
      .slice(0, messages.indexOf(message))
      .reverse()
      .find(m => m.role === 'user');

    const report: SpoilerReport = {
      question: lastUserMessage?.content || '',
      context: watchSetup.context,
      answer: message.content,
      timestamp: new Date(),
    };

    // Store locally
    setReports(prev => [...prev, report]);

    // Log to backend
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-spoiler-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          question: report.question,
          context: report.context,
          answer: report.answer,
          showTitle: watchSetup.showTitle,
          season: parseInt(watchSetup.season) || 1,
          episode: parseInt(watchSetup.episode) || 1,
        }),
      });
    } catch (err) {
      console.error('Failed to log spoiler report:', err);
      // Don't show error to user - logging failure is non-critical
    }

    toast.success("Got it. Spoiler shield will tighten.", {
      description: "Thanks for the feedback!",
      duration: 3000,
    });
  };

  const showRefinement = messages.length > 0 && 
    messages[messages.length - 1]?.role === 'assistant' && 
    !isLoading;

  const lastAssistantMessage = messages
    .slice()
    .reverse()
    .find(m => m.role === 'assistant');

  if (isSidePanel) {
    // Ultra-minimal side panel layout - content scrolls naturally in parent container
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Last answer panel - content area */}
        <div className="px-3 py-3 border-t border-border">
          {lastAssistantMessage ? (
            <div className="space-y-2">
              <ChatMessage
                message={lastAssistantMessage}
                onReportSpoiler={() => handleReportSpoiler(lastAssistantMessage.id)}
              />
              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground animate-fade-in">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Thinking safely...</span>
                </div>
              )}
              {/* Refinement buttons - shown after answer exists */}
              {showRefinement && (
                <div className="pt-2">
                  <RefinementButtons onRefine={onRefine} disabled={isLoading} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Ready to help
              </p>
            </div>
          )}
          {error && (
            <div className="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area - sticky at bottom */}
        <div className="sticky bottom-0 border-t border-border p-3 space-y-2 bg-background z-10">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about what you've watched..."
              disabled={isLoading || !watchSetup.context.trim()}
              className="flex-1 bg-input border-border input-glow text-sm h-9"
            />
            <Button 
              type="submit" 
              disabled={isLoading || !input.trim() || !watchSetup.context.trim()}
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Full web app layout (unchanged)
  return (
    <div className="glass-panel flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Ask a Question</h2>
        </div>
        <ShieldBadge />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse-glow">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Ready to help</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Add your context on the left, then ask any question about what you've watched. 
              I'll answer without spoilers!
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onReportSpoiler={() => handleReportSpoiler(message.id)}
              />
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex items-center gap-2 text-muted-foreground animate-fade-in">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking safely...</span>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Refinement buttons */}
      {showRefinement && (
        <div className="px-4 pb-2">
          <RefinementButtons onRefine={onRefine} disabled={isLoading} />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mx-4 mb-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-border space-y-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about what you've watched..."
            disabled={isLoading || !watchSetup.context.trim()}
            className="flex-1 bg-input border-border input-glow"
          />
          <Button 
            type="submit" 
            disabled={isLoading || !input.trim() || !watchSetup.context.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
        <StylePills selected={style} onSelect={setStyle} />
      </div>
    </div>
  );
}
