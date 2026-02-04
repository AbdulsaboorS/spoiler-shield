import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WatchSetup } from '@/lib/types';
import { Tv, Film, Clock, Hash, FileText, Trash2, ChevronDown } from 'lucide-react';
import { useSidePanel } from '@/hooks/useSidePanel';
import { useState } from 'react';

interface WatchSetupPanelProps {
  setup: WatchSetup;
  onChange: (setup: WatchSetup) => void;
}

const MAX_CONTEXT_LENGTH = 2000;

export function WatchSetupPanel({ setup, onChange }: WatchSetupPanelProps) {
  const isSidePanel = useSidePanel();
  const [isOpen, setIsOpen] = useState(!isSidePanel); // Collapsed by default in side panel
  const updateField = <K extends keyof WatchSetup>(field: K, value: WatchSetup[K]) => {
    onChange({ ...setup, [field]: value });
  };

  const characterCount = setup.context.length;
  const isNearLimit = characterCount > MAX_CONTEXT_LENGTH * 0.8;
  const isOverLimit = characterCount > MAX_CONTEXT_LENGTH;

  const setupContent = (
    <>
      <div className="space-y-4">
        {/* Platform */}
        <div className="space-y-2">
          <Label htmlFor="platform" className="text-sm text-muted-foreground flex items-center gap-2">
            <Film className="w-4 h-4" />
            Platform
          </Label>
          <Select value={setup.platform} onValueChange={(v) => updateField('platform', v)}>
            <SelectTrigger className="bg-input border-border focus:ring-primary/20">
              <SelectValue placeholder="Select platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="crunchyroll">Crunchyroll</SelectItem>
              <SelectItem value="netflix">Netflix</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Show Title */}
        <div className="space-y-2">
          <Label htmlFor="showTitle" className="text-sm text-muted-foreground">
            Show Title
          </Label>
          <Input
            id="showTitle"
            value={setup.showTitle}
            onChange={(e) => updateField('showTitle', e.target.value)}
            placeholder="e.g., Attack on Titan"
            className="bg-input border-border focus:ring-primary/20"
          />
        </div>

        {/* Season & Episode Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="season" className="text-sm text-muted-foreground flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Season
            </Label>
            <Input
              id="season"
              value={setup.season}
              onChange={(e) => updateField('season', e.target.value)}
              placeholder="Optional"
              className="bg-input border-border focus:ring-primary/20"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="episode" className="text-sm text-muted-foreground">
              Episode
            </Label>
            <Input
              id="episode"
              value={setup.episode}
              onChange={(e) => updateField('episode', e.target.value)}
              placeholder="e.g., 5"
              className="bg-input border-border focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Timestamp */}
        <div className="space-y-2">
          <Label htmlFor="timestamp" className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Timestamp (optional)
          </Label>
          <Input
            id="timestamp"
            value={setup.timestamp}
            onChange={(e) => updateField('timestamp', e.target.value)}
            placeholder="mm:ss or hh:mm:ss"
            className="bg-input border-border focus:ring-primary/20"
          />
        </div>
      </div>
    </>
  );

  if (isSidePanel) {
    // Collapsible setup in side panel mode
    return (
      <div className="border-b border-border">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors">
            <span className="text-sm font-medium text-foreground">Setup</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3 space-y-3">
            {setupContent}
          </CollapsibleContent>
        </Collapsible>
        
        {/* Context Box - always visible in side panel */}
        <div className="px-3 py-3 space-y-2 border-t border-border">
          <div className="flex items-center justify-between">
            <Label htmlFor="context" className="text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Context (required)
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateField('context', '')}
              className="h-7 px-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          </div>
          <Textarea
            id="context"
            value={setup.context}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CONTEXT_LENGTH) {
                updateField('context', e.target.value);
              }
            }}
            placeholder="Paste the last ~20–60 seconds of subtitles OR describe the last scene. This is the only source used to answer without spoilers."
            className="min-h-[120px] bg-input border-border focus:ring-primary/20 resize-none text-sm"
          />
          <div className="flex items-center justify-between text-xs">
            <p className="text-muted-foreground">
              More context = better answers. Keep it to what you've already seen.
            </p>
            <span className={`font-mono ${isOverLimit ? 'text-destructive' : isNearLimit ? 'text-amber-500' : 'text-muted-foreground'}`}>
              {characterCount}/{MAX_CONTEXT_LENGTH}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Full panel for web app (unchanged)
  return (
    <div className="glass-panel p-6 space-y-5 h-full overflow-y-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Tv className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Watch Setup</h2>
      </div>

      {setupContent}

      {/* Context Box */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="context" className="text-sm text-muted-foreground flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Context (required)
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateField('context', '')}
            className="h-7 px-2 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Clear
          </Button>
        </div>
        <Textarea
          id="context"
          value={setup.context}
          onChange={(e) => {
            if (e.target.value.length <= MAX_CONTEXT_LENGTH) {
              updateField('context', e.target.value);
            }
          }}
          placeholder="Paste the last ~20–60 seconds of subtitles OR describe the last scene. This is the only source used to answer without spoilers."
          className="min-h-[160px] bg-input border-border focus:ring-primary/20 resize-none"
        />
        <div className="flex items-center justify-between text-xs">
          <p className="text-muted-foreground">
            More context = better answers. Keep it to what you've already seen.
          </p>
          <span className={`font-mono ${isOverLimit ? 'text-destructive' : isNearLimit ? 'text-amber-500' : 'text-muted-foreground'}`}>
            {characterCount}/{MAX_CONTEXT_LENGTH}
          </span>
        </div>
      </div>
    </div>
  );
}
