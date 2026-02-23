import { Shield, History } from 'lucide-react';
import { useSidePanel } from '@/hooks/useSidePanel';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { SessionMeta, InitPhase } from '@/lib/types';

interface StatusBadgePassthroughProps {
  meta: SessionMeta | null;
  isDetecting: boolean;
  phase: InitPhase;
  onShowChange: (show: { id: number; name: string }) => void;
  onEpisodeChange: (season: string, episode: string) => void;
  onContextChange: (context: string) => void;
  onClearChat: () => void;
  onRedetect: () => void;
}

interface HeaderProps {
  // Side-panel props
  statusBadgeProps?: StatusBadgePassthroughProps;
  onOpenHistory?: () => void;
  sessionCount?: number;
  // Web-app props (legacy, unused in side panel)
  onRefresh?: () => void;
}

export function Header({
  statusBadgeProps,
  onOpenHistory,
  sessionCount,
}: HeaderProps) {
  const isSidePanel = useSidePanel();

  if (isSidePanel) {
    return (
      <header className="py-2 px-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          {/* Brand */}
          <h1 className="text-sm font-semibold text-foreground tracking-tight shrink-0">
            Spoiler<span className="text-primary">Shield</span>
          </h1>

          {/* Center/right: badge + history */}
          <div className="flex items-center gap-1.5">
            {statusBadgeProps && <StatusBadge {...statusBadgeProps} />}

            {onOpenHistory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenHistory}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground relative"
                aria-label="Chat history"
              >
                <History className="w-4 h-4" />
                {sessionCount !== undefined && sessionCount > 1 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-medium">
                    {sessionCount > 9 ? '9+' : sessionCount}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </header>
    );
  }

  // Full header for web app (unchanged)
  return (
    <header className="py-4 px-6 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full" />
          <div className="relative p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Shield className="w-7 h-7 text-primary glow-text" />
          </div>
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Spoiler<span className="text-primary">Shield</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Ask questions without spoilers
          </p>
        </div>
      </div>
    </header>
  );
}
