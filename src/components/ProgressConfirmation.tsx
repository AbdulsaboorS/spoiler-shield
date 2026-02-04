import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

interface ProgressConfirmationProps {
  showName: string;
  season: string;
  episode: string;
  timestamp?: string;
  onConfirm: () => void;
}

export function ProgressConfirmation({
  showName,
  season,
  episode,
  timestamp,
  onConfirm,
}: ProgressConfirmationProps) {
  const progressText = `S${season}E${episode}${timestamp ? ` @ ${timestamp}` : ''}`;

  return (
    <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-3">
      <div className="text-sm font-medium text-foreground">Confirm your progress</div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div>
          <span className="font-medium text-foreground">{showName}</span>
        </div>
        <div>
          You're at <span className="font-medium text-foreground">{progressText}</span>
        </div>
      </div>
      <Button
        onClick={onConfirm}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-sm"
      >
        <CheckCircle2 className="w-4 h-4 mr-2" />
        Confirm progress
      </Button>
    </div>
  );
}
