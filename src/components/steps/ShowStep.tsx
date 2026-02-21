import { Button } from '@/components/ui/button';
import { ShowSearch } from '@/components/ShowSearch';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DetectedShowInfo {
  platform: string;
  showTitle: string;
  episodeInfo?: { season: string; episode: string };
}

interface ShowStepProps {
  detectedShowInfo: DetectedShowInfo | null;
  isDetecting: boolean;
  isDetectedDismissed: boolean;
  isSearchingForMatch: boolean;
  onConfirmDetected: () => void;
  onChangeDetected: () => void;
  onRedetectShow: () => void;
  onShowSelect: (show: { id: number; name: string }) => void;
}

export function ShowStep({
  detectedShowInfo,
  isDetecting,
  isDetectedDismissed,
  isSearchingForMatch,
  onConfirmDetected,
  onChangeDetected,
  onRedetectShow,
  onShowSelect,
}: ShowStepProps) {
  return (
    <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-3">
      <div className="text-sm font-medium text-foreground">Search Show</div>

      {/* Detected Show Section */}
      {(detectedShowInfo || isDetecting) && !isDetectedDismissed && (
        <div className="rounded-md bg-primary/10 border border-primary/20 p-3 space-y-3">
          <div>
            {isDetecting ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs text-muted-foreground">Detecting...</div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Scanning page for show information</span>
                </div>
              </>
            ) : detectedShowInfo ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs text-muted-foreground">Detected</div>
                  <Button
                    onClick={onRedetectShow}
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                    disabled={isDetecting}
                    title="Re-detect show"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
                <div className="text-sm font-medium text-foreground">{detectedShowInfo.showTitle}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {detectedShowInfo.platform.charAt(0).toUpperCase() + detectedShowInfo.platform.slice(1)}
                  {detectedShowInfo.episodeInfo && (
                    <> • S{detectedShowInfo.episodeInfo.season} E{detectedShowInfo.episodeInfo.episode}</>
                  )}
                </div>
                {isSearchingForMatch && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Searching for match...
                  </div>
                )}
              </>
            ) : null}
          </div>

          {detectedShowInfo && !isDetecting && (
            <div className="flex gap-2">
              <Button
                onClick={onConfirmDetected}
                disabled={isSearchingForMatch}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
                size="sm"
              >
                {isSearchingForMatch ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Searching...
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
              <Button
                onClick={onChangeDetected}
                variant="outline"
                className="flex-1 h-8 text-xs"
                size="sm"
              >
                Change
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Manual Search */}
      <div className={cn('space-y-2', detectedShowInfo && !isDetectedDismissed && 'opacity-60')}>
        <div className="text-xs text-muted-foreground">
          {detectedShowInfo && !isDetectedDismissed ? 'Or search manually:' : 'Search for a show:'}
        </div>
        <ShowSearch
          onSelect={onShowSelect}
          initialValue={detectedShowInfo && !isDetectedDismissed ? detectedShowInfo.showTitle : undefined}
        />
      </div>
    </div>
  );
}
