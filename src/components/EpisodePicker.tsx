import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EpisodeSelector } from '@/components/EpisodeSelector';

interface EpisodePickerProps {
  show: { id: number; name: string };
  initialSeason?: string;
  onConfirm: (season: string, episode: string) => void;
}

export function EpisodePicker({ show, initialSeason, onConfirm }: EpisodePickerProps) {
  const [season, setSeason] = useState(initialSeason || '');
  const [episode, setEpisode] = useState('');

  const handleConfirm = () => {
    if (!season || !episode) return;
    onConfirm(season, episode);
  };

  return (
    <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-3">
      <div className="space-y-0.5">
        <div className="text-sm font-medium text-foreground">{show.name}</div>
        <div className="text-xs text-muted-foreground">Select the episode you're on</div>
      </div>

      <EpisodeSelector
        showId={show.id}
        showName={show.name}
        selectedSeason={season}
        selectedEpisode={episode}
        selectedTimestamp=""
        onSeasonChange={setSeason}
        onEpisodeChange={setEpisode}
        onTimestampChange={() => {}}
      />

      <Button
        onClick={handleConfirm}
        disabled={!season || !episode}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-sm"
      >
        Start chatting
      </Button>
    </div>
  );
}
