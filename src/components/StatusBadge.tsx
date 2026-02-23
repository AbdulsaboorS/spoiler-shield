import { useState } from 'react';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { ShowSearch } from '@/components/ShowSearch';
import { EpisodeSelector } from '@/components/EpisodeSelector';
import { SessionMeta, InitPhase } from '@/lib/types';

interface StatusBadgeProps {
  meta: SessionMeta | null;
  isDetecting: boolean;
  phase: InitPhase;
  onShowChange: (show: { id: number; name: string }) => void;
  onEpisodeChange: (season: string, episode: string) => void;
  onContextChange: (context: string) => void;
  onClearChat: () => void;
  onRedetect: () => void;
}

export function StatusBadge({
  meta,
  isDetecting,
  phase,
  onShowChange,
  onEpisodeChange,
  onContextChange,
  onClearChat,
  onRedetect,
}: StatusBadgeProps) {
  const [open, setOpen] = useState(false);
  const [selectedShow, setSelectedShow] = useState<{ id: number; name: string } | null>(
    meta?.showId ? { id: meta.showId, name: meta.showTitle } : null
  );
  const [season, setSeason] = useState(meta?.season || '');
  const [episode, setEpisode] = useState(meta?.episode || '');
  const [context, setContext] = useState(meta?.context || '');

  // Sync local state when meta changes (e.g. session switched)
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && meta) {
      setSelectedShow(meta.showId ? { id: meta.showId, name: meta.showTitle } : null);
      setSeason(meta.season);
      setEpisode(meta.episode);
      setContext(meta.context);
    }
    setOpen(nextOpen);
  };

  const handleShowSelect = (show: { id: number; name: string }) => {
    setSelectedShow(show);
    setSeason('');
    setEpisode('');
    onShowChange(show);
  };

  const handleSeasonChange = (s: string) => {
    setSeason(s);
    setEpisode('');
  };

  const handleEpisodeChange = (e: string) => {
    setEpisode(e);
    if (season && e) {
      onEpisodeChange(season, e);
    }
  };

  const handleContextSave = () => {
    onContextChange(context);
    setOpen(false);
  };

  const handleClearChat = () => {
    onClearChat();
    setOpen(false);
  };

  // Trigger label
  let triggerContent: React.ReactNode;
  if (phase === 'detecting' || phase === 'resolving' || isDetecting) {
    triggerContent = (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Detecting…
      </span>
    );
  } else if (phase === 'no-show') {
    triggerContent = (
      <Badge variant="outline" className="text-xs cursor-pointer h-6 px-2 gap-1">
        + Setup
      </Badge>
    );
  } else if (meta) {
    const label = [
      meta.showTitle.length > 18 ? meta.showTitle.slice(0, 16) + '…' : meta.showTitle,
      meta.season && meta.episode ? `S${meta.season} E${meta.episode}` : null,
    ]
      .filter(Boolean)
      .join(' • ');
    triggerContent = (
      <Badge variant="outline" className="text-xs cursor-pointer h-6 px-2 max-w-[180px] truncate">
        {label}
      </Badge>
    );
  } else {
    triggerContent = (
      <Badge variant="outline" className="text-xs cursor-pointer h-6 px-2">
        + Setup
      </Badge>
    );
  }

  const isDisabledPhase = phase === 'detecting' || phase === 'resolving';

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={isDisabledPhase}>
        <button className="focus:outline-none" aria-label="Configure show and episode">
          {triggerContent}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={8}
        className="w-80 max-h-[70vh] overflow-y-auto p-3 space-y-3"
      >
        {/* Show search */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Show</div>
          <ShowSearch
            onSelect={handleShowSelect}
            selectedShow={selectedShow}
            initialValue={meta?.showTitle}
          />
        </div>

        {/* Episode selector */}
        {selectedShow && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Episode</div>
            <EpisodeSelector
              showId={selectedShow.id}
              showName={selectedShow.name}
              selectedSeason={season}
              selectedEpisode={episode}
              selectedTimestamp=""
              onSeasonChange={handleSeasonChange}
              onEpisodeChange={handleEpisodeChange}
              onTimestampChange={() => {}}
            />
          </div>
        )}

        {/* Context */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Context (episode recap)</div>
          <Textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Paste episode recap or summary here..."
            className="min-h-[80px] bg-input border-border resize-none text-xs"
          />
          <Button
            size="sm"
            onClick={handleContextSave}
            className="w-full h-8 text-xs"
          >
            Save context
          </Button>
        </div>

        <div className="border-t border-border pt-2 space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearChat}
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground justify-start gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear chat
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { onRedetect(); setOpen(false); }}
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground justify-start gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-detect show
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
