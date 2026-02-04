import { Shield, RefreshCw, ChevronLeft, Edit } from 'lucide-react';
import { useSidePanel } from '@/hooks/useSidePanel';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onRefresh?: () => void;
  onBack?: () => void;
  onChangeShow?: () => void;
  onChangeProgress?: () => void;
  onChangeContext?: () => void;
  showBack?: boolean;
  showChangeShow?: boolean;
  showChangeProgress?: boolean;
  showChangeContext?: boolean;
}

export function Header({ 
  onRefresh, 
  onBack,
  onChangeShow,
  onChangeProgress,
  onChangeContext,
  showBack = false,
  showChangeShow = false,
  showChangeProgress = false,
  showChangeContext = false,
}: HeaderProps) {
  const isSidePanel = useSidePanel();

  if (isSidePanel) {
    // Compact header for side panel with navigation
    return (
      <header className="py-2 px-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-sm font-semibold text-foreground tracking-tight">
            Spoiler<span className="text-primary">Shield</span>
          </h1>
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3 h-3 mr-1.5" />
              Refresh
            </Button>
          )}
        </div>
        {/* Navigation links */}
        {(showBack || showChangeShow || showChangeProgress || showChangeContext) && (
          <div className="flex items-center gap-2 flex-wrap">
            {showBack && onBack && (
              <button
                onClick={onBack}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <ChevronLeft className="w-3 h-3" />
                Back
              </button>
            )}
            {showChangeShow && onChangeShow && (
              <button
                onClick={onChangeShow}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Edit className="w-3 h-3" />
                Change show
              </button>
            )}
            {showChangeProgress && onChangeProgress && (
              <button
                onClick={onChangeProgress}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Edit className="w-3 h-3" />
                Edit progress
              </button>
            )}
            {showChangeContext && onChangeContext && (
              <button
                onClick={onChangeContext}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Edit className="w-3 h-3" />
                Edit context
              </button>
            )}
          </div>
        )}
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
