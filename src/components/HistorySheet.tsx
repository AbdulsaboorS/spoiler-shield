import { Trash2, MessageSquare } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SessionMeta } from '@/lib/types';

interface HistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: SessionMeta[];
  activeSessionId: string | null;
  onSwitch: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function HistorySheet({
  open,
  onOpenChange,
  sessions,
  activeSessionId,
  onSwitch,
  onDelete,
}: HistorySheetProps) {
  const sorted = [...sessions].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="text-sm font-semibold">Chat History</SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto h-[calc(100%-56px)]">
          {sorted.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No sessions yet
            </div>
          ) : (
            <ul className="py-1">
              {sorted.map((session) => {
                const isActive = session.sessionId === activeSessionId;
                const episodeLabel =
                  session.season && session.episode
                    ? `S${session.season} E${session.episode}`
                    : session.season
                    ? `S${session.season}`
                    : null;

                return (
                  <li key={session.sessionId}>
                    <div
                      className={cn(
                        'group flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors',
                        isActive && 'bg-primary/10 border-l-2 border-primary'
                      )}
                      onClick={() => {
                        onSwitch(session.sessionId);
                        onOpenChange(false);
                      }}
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {session.showTitle}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {episodeLabel && (
                            <span className="text-xs text-muted-foreground">{episodeLabel}</span>
                          )}
                          {episodeLabel && <span className="text-muted-foreground">·</span>}
                          <span className="text-xs text-muted-foreground">
                            {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {relativeTime(session.lastMessageAt)}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(session.sessionId);
                        }}
                        aria-label="Delete session"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
