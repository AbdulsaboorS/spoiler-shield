import { Loader2, Shield, AlertCircle } from 'lucide-react';
import { SessionMeta, InitPhase } from '@/lib/types';

interface ChatStatusBarProps {
  meta: SessionMeta | null;
  isLoadingRecap: boolean;
  phase: InitPhase;
}

export function ChatStatusBar({ meta, isLoadingRecap, phase }: ChatStatusBarProps) {
  if (phase === 'error') {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-destructive/10 border border-destructive/20">
        <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
        <span className="text-xs text-destructive">Something went wrong. Try re-detecting via the badge.</span>
      </div>
    );
  }

  if (isLoadingRecap) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
        <Loader2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-spin shrink-0" />
        <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
          Loading episode recap — Shield not ready yet
        </span>
      </div>
    );
  }

  if (meta && !meta.context) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Shield className="w-3 h-3 text-primary shrink-0" />
        <span className="text-xs text-muted-foreground">
          No episode recap — answering from general show knowledge
        </span>
      </div>
    );
  }

  if (meta?.season && meta?.episode) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Shield className="w-3 h-3 text-primary shrink-0" />
        <span className="text-xs text-muted-foreground">
          Shielding based on S{meta.season} E{meta.episode} knowledge
        </span>
      </div>
    );
  }

  return null;
}
