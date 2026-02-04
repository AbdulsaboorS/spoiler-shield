import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface Episode {
  id: number;
  season: number;
  number: number;
  name: string;
  airdate?: string;
}

interface ShowDetails {
  id: number;
  name: string;
  seasons: Array<{
    id: number;
    number: number;
    episodeOrder?: number;
  }>;
}

interface EpisodeSelectorProps {
  showId: number;
  showName: string;
  selectedSeason: string;
  selectedEpisode: string;
  selectedTimestamp: string;
  onSeasonChange: (season: string) => void;
  onEpisodeChange: (episode: string) => void;
  onTimestampChange: (timestamp: string) => void;
}

export function EpisodeSelector({
  showId,
  showName,
  selectedSeason,
  selectedEpisode,
  selectedTimestamp,
  onSeasonChange,
  onEpisodeChange,
  onTimestampChange,
}: EpisodeSelectorProps) {
  const [showDetails, setShowDetails] = useState<ShowDetails | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const lastShowIdRef = useRef<number | null>(null);
  const hasAutoSelectedSeason = useRef(false);

  useEffect(() => {
    // Only fetch if showId changed
    if (!showId || lastShowIdRef.current === showId) {
      return;
    }

    lastShowIdRef.current = showId;
    hasAutoSelectedSeason.current = false;
    setIsLoading(true);

    // Fetch show details to get seasons
    const fetchShowDetails = async () => {
      try {
        const response = await fetch(`https://api.tvmaze.com/shows/${showId}`);
        if (!response.ok) throw new Error('Failed to fetch show');
        const data = await response.json();
        
        // Fetch seasons
        const seasonsResponse = await fetch(`https://api.tvmaze.com/shows/${showId}/seasons`);
        const seasonsData = await seasonsResponse.json();
        
        setShowDetails({
          ...data,
          seasons: seasonsData,
        });
        
        // Auto-select first season if none selected (only once, and only if truly empty)
        if (!selectedSeason && seasonsData.length > 0 && !hasAutoSelectedSeason.current) {
          hasAutoSelectedSeason.current = true;
          // Use setTimeout to avoid triggering during render
          setTimeout(() => {
            onSeasonChange(String(seasonsData[0].number));
          }, 0);
        }
      } catch (err) {
        console.error('Error fetching show details:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchShowDetails();
  }, [showId]); // Removed onSeasonChange and selectedSeason from deps

  const lastSeasonRef = useRef<string>('');
  const hasAutoSelectedEpisode = useRef(false);

  useEffect(() => {
    // Fetch episodes for selected season
    if (!selectedSeason || !showId) {
      setEpisodes([]);
      hasAutoSelectedEpisode.current = false;
      return;
    }

    // Only fetch if season changed
    if (lastSeasonRef.current === selectedSeason) {
      return;
    }

    lastSeasonRef.current = selectedSeason;
    hasAutoSelectedEpisode.current = false;
    setIsLoadingEpisodes(true);

    const fetchEpisodes = async () => {
      try {
        const response = await fetch(`https://api.tvmaze.com/shows/${showId}/episodes`);
        if (!response.ok) throw new Error('Failed to fetch episodes');
        const data = await response.json();
        
        const seasonEpisodes = data.filter(
          (ep: Episode) => String(ep.season) === selectedSeason
        );
        setEpisodes(seasonEpisodes);
        
        // Auto-select first episode if none selected (only once per season)
        if (!selectedEpisode && seasonEpisodes.length > 0 && !hasAutoSelectedEpisode.current) {
          hasAutoSelectedEpisode.current = true;
          // Use setTimeout to avoid triggering during render
          setTimeout(() => {
            onEpisodeChange(String(seasonEpisodes[0].number));
          }, 0);
        }
      } catch (err) {
        console.error('Error fetching episodes:', err);
        setEpisodes([]);
      } finally {
        setIsLoadingEpisodes(false);
      }
    };

    fetchEpisodes();
  }, [showId, selectedSeason]); // Removed onEpisodeChange and selectedEpisode from deps

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading seasons...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Season */}
        <div className="space-y-2">
          <Label htmlFor="season" className="text-xs text-muted-foreground">
            Season
          </Label>
          <Select value={selectedSeason} onValueChange={onSeasonChange}>
            <SelectTrigger className="h-9 text-sm bg-input border-border">
              <SelectValue placeholder="Select season" />
            </SelectTrigger>
            <SelectContent>
              {showDetails?.seasons.map((season) => (
                <SelectItem key={season.id} value={String(season.number)}>
                  Season {season.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Episode */}
        <div className="space-y-2">
          <Label htmlFor="episode" className="text-xs text-muted-foreground">
            Episode
          </Label>
          {isLoadingEpisodes ? (
            <div className="h-9 flex items-center justify-center border border-border rounded-md">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Select value={selectedEpisode} onValueChange={onEpisodeChange}>
              <SelectTrigger className="h-9 text-sm bg-input border-border">
                <SelectValue placeholder="Select episode" />
              </SelectTrigger>
              <SelectContent>
                {episodes.map((ep) => (
                  <SelectItem key={ep.id} value={String(ep.number)}>
                    E{ep.number} {ep.name ? `- ${ep.name.substring(0, 30)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Timestamp (optional) */}
      <div className="space-y-2">
        <Label htmlFor="timestamp" className="text-xs text-muted-foreground">
          Timestamp (optional) - mm:ss or hh:mm:ss
        </Label>
        <Input
          id="timestamp"
          value={selectedTimestamp}
          onChange={(e) => onTimestampChange(e.target.value)}
          placeholder="e.g., 15:30 or 1:15:30"
          className="h-9 text-sm bg-input border-border"
        />
      </div>
    </div>
  );
}
