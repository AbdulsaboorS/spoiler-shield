import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ContextStepProps {
  context: string;
  onContextChange: (context: string) => void;
  onContinue: () => void;
}

export function ContextStep({ context, onContextChange, onContinue }: ContextStepProps) {
  return (
    <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-3 space-y-2">
      <div className="text-sm font-medium text-foreground">Edit Context</div>
      <Textarea
        value={context}
        onChange={(e) => onContextChange(e.target.value)}
        placeholder="Paste episode recap or summary here..."
        className="min-h-[150px] bg-input border-border focus:ring-primary/20 resize-none text-sm"
      />
      <Button
        onClick={onContinue}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-sm"
        disabled={!context.trim()}
      >
        Continue to Q&A
      </Button>
    </div>
  );
}
