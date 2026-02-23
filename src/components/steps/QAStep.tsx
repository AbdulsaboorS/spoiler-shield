import { type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StylePills } from '@/components/StylePills';
import { ChatStatusBar } from '@/components/ChatStatusBar';
import { Loader2 } from 'lucide-react';
import { ChatMessage, ResponseStyle, SessionMeta, InitPhase } from '@/lib/types';

interface QAStepProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  question: string;
  style: ResponseStyle;
  hasAnswer: boolean;
  // New props for chat-first UX
  meta?: SessionMeta | null;
  isLoadingRecap?: boolean;
  phase?: InitPhase;
  // Legacy prop kept for web-app path (optional)
  context?: string;
  qaHistoryRef: RefObject<HTMLDivElement>;
  onQuestionChange: (q: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStyleSelect: (style: ResponseStyle) => void;
  // Kept optional for backward-compat (web-app path)
  onEditContext?: () => void;
}

export function QAStep({
  messages,
  isLoading,
  error,
  question,
  style,
  hasAnswer,
  meta,
  isLoadingRecap = false,
  phase,
  context,
  qaHistoryRef,
  onQuestionChange,
  onSubmit,
  onStyleSelect,
  onEditContext,
}: QAStepProps) {
  // Determine effective context (prefer meta.context for side-panel, fall back to prop)
  const effectiveContext = meta?.context ?? context ?? '';
  const isContextMissing = !effectiveContext.trim();
  const isInputDisabled = isLoading || isLoadingRecap;

  // Legacy web-app path: show "Context Required" card
  if (isContextMissing && onEditContext && !meta) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 space-y-3">
        <div className="text-sm font-medium text-destructive">Context Required</div>
        <p className="text-xs text-muted-foreground">
          Episode context is required to ask questions safely. Please provide a recap or summary.
        </p>
        <Button onClick={onEditContext} variant="outline" size="sm" className="w-full h-9 text-sm">
          Edit Context
        </Button>
      </div>
    );
  }

  const placeholder = meta?.showTitle
    ? `Ask about ${meta.showTitle}…`
    : 'Ask a question…';

  return (
    <div className="space-y-3">
      {/* Q&A History */}
      <div
        ref={qaHistoryRef}
        className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-3 max-h-[400px] overflow-y-auto min-h-[100px]"
      >
        {messages.length > 0 ? (
          <>
            <div className="text-sm font-medium text-foreground">Conversation</div>
            <div className="space-y-3">
              {messages.map((msg, idx) => {
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

      {/* Status bar (side-panel path) */}
      {meta !== undefined && (
        <ChatStatusBar
          meta={meta ?? null}
          isLoadingRecap={isLoadingRecap}
          phase={phase ?? 'ready'}
        />
      )}

      {/* Style chips */}
      {hasAnswer && (
        <div className="flex justify-start">
          <StylePills selected={style} onSelect={onStyleSelect} />
        </div>
      )}

      {/* Question input */}
      <form onSubmit={onSubmit} className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            placeholder={placeholder}
            disabled={isInputDisabled}
            className="flex-1 bg-input border-border input-glow text-sm h-9"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isInputDisabled || !question.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
          </Button>
        </div>
      </form>

      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}
