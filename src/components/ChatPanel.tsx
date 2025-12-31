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

  const handleReportSpoiler = (messageId: string) => {
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

    setReports(prev => [...prev, report]);
    toast.success("Got it. Spoiler shield will tighten.", {
      description: "Thanks for the feedback!",
      duration: 3000,
    });
  };

  const showRefinement = messages.length > 0 && 
    messages[messages.length - 1]?.role === 'assistant' && 
    !isLoading;

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
