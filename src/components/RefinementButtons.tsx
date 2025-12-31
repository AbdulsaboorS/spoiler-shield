import { RefinementOption } from '@/lib/types';
import { Minimize2, Plus, Lightbulb, BookA } from 'lucide-react';

interface RefinementButtonsProps {
  onRefine: (option: RefinementOption) => void;
  disabled?: boolean;
}

const options: { value: RefinementOption; label: string; icon: React.ReactNode }[] = [
  { value: 'shorter', label: 'Even shorter', icon: <Minimize2 className="w-3 h-3" /> },
  { value: 'detail', label: 'More detail', icon: <Plus className="w-3 h-3" /> },
  { value: 'examples', label: 'Use examples', icon: <Lightbulb className="w-3 h-3" /> },
  { value: 'terms', label: 'Define terms', icon: <BookA className="w-3 h-3" /> },
];

export function RefinementButtons({ onRefine, disabled }: RefinementButtonsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="text-xs text-muted-foreground">Want it differently?</span>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onRefine(option.value)}
          disabled={disabled}
          className="
            flex items-center gap-1 px-2.5 py-1 rounded-md text-xs
            bg-secondary/50 text-muted-foreground border border-border/50
            hover:bg-secondary hover:text-foreground hover:border-border
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
          "
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
