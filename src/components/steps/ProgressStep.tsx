import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EpisodeSelector } from '@/components/EpisodeSelector';
import { ProgressConfirmation } from '@/components/ProgressConfirmation';
import { Loader2 } from 'lucide-react';
import { WatchSetup } from '@/lib/types';

interface ProgressStepProps {
  selectedShow: { id: number; name: string } | null;
  watchSetup: WatchSetup;
  recap: { summary: string | null };
  isLoadingRecap: boolean;
  canConfirmProgress: boolean;
  onSeasonChange: (season: string) => void;
  onEpisodeChange: (episode: string) => void;
  onTimestampChange: (timestamp: string) => void;
  onContextChange: (context: string) => void;
  onConfirmProgress: () => void;
  onGoToSearch: () => void;
  onEditContext: () => void;
}

export function ProgressStep({
  selectedShow,
  watchSetup,
  recap,
  isLoadingRecap,
  canConfirmProgress,
  onSeasonChange,
  onEpisodeChange,
  onTimestampChange,
  onContextChange,
  onConfirmProgress,
  onGoToSearch,
  onEditContext,
}: ProgressStepProps) {
  return (
    <>
      <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-3">
        <div className="text-sm font-medium text-foreground">
          {selectedShow?.name || watchSetup.showTitle || 'Select Episode'}
        </div>

        {selectedShow && watchSetup.showId ? (
          <EpisodeSelector
            showId={selectedShow.id}
            showName={selectedShow.name}
            selectedSeason={watchSetup.season}
            selectedEpisode={watchSetup.episode}
            selectedTimestamp={watchSetup.timestamp}
            onSeasonChange={onSeasonChange}
            onEpisodeChange={onEpisodeChange}
            onTimestampChange={onTimestampChange}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Show: {watchSetup.showTitle}</p>
            <p className="text-xs text-muted-foreground">
              Please search for this show to select episodes, or enter season/episode manually.
            </p>
            <Button onClick={onGoToSearch} variant="outline" size="sm" className="w-full h-9 text-xs">
              Search for Show
            </Button>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Season</label>
                <Input
                  value={watchSetup.season}
                  onChange={(e) => onSeasonChange(e.target.value)}
                  placeholder="S"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Episode</label>
                <Input
                  value={watchSetup.episode}
                  onChange={(e) => onEpisodeChange(e.target.value)}
                  placeholder="E"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Episode Recap */}
      {canConfirmProgress && (
        <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-2">
          <div className="text-sm font-medium text-foreground">Episode Context</div>
          {isLoadingRecap ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Fetching episode recap...</span>
            </div>
          ) : recap.summary ? (
            <div className="space-y-2">
              <div className="rounded-md bg-muted/50 border border-border p-2.5 max-h-32 overflow-y-auto">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  {recap.summary}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Recap found automatically from TVMaze</p>
              {!watchSetup.context && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditContext}
                  className="w-full mt-2 h-8 text-xs"
                >
                  Edit or add more context
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                No recap found automatically — paste a recap link or paste a short recap text.
              </p>
              <Textarea
                value={watchSetup.context}
                onChange={(e) => onContextChange(e.target.value)}
                placeholder="Paste episode recap or summary here..."
                className="min-h-[100px] bg-input border-border focus:ring-primary/20 resize-none text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Confirm Progress */}
      {canConfirmProgress && (
        <ProgressConfirmation
          showName={selectedShow?.name || watchSetup.showTitle || 'Unknown Show'}
          season={watchSetup.season}
          episode={watchSetup.episode}
          timestamp={watchSetup.timestamp || undefined}
          onConfirm={onConfirmProgress}
        />
      )}
    </>
  );
}
