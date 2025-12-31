import { ResponseStyle } from '@/lib/types';
import { Zap, BookOpen, Scroll } from 'lucide-react';

interface StylePillsProps {
  selected: ResponseStyle;
  onSelect: (style: ResponseStyle) => void;
}

const styles: { value: ResponseStyle; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'quick', label: 'Quick', icon: <Zap className="w-3.5 h-3.5" />, description: '1-2 sentences' },
  { value: 'explain', label: 'Explain', icon: <BookOpen className="w-3.5 h-3.5" />, description: 'With context' },
  { value: 'lore', label: 'Lore', icon: <Scroll className="w-3.5 h-3.5" />, description: 'Background info' },
];

export function StylePills({ selected, onSelect }: StylePillsProps) {
  return (
    <div className="flex gap-2">
      {styles.map((style) => (
        <button
          key={style.value}
          onClick={() => onSelect(style.value)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
            transition-all duration-200
            ${selected === style.value
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'bg-secondary text-muted-foreground border border-transparent hover:border-border hover:text-foreground'
            }
          `}
          title={style.description}
        >
          {style.icon}
          {style.label}
        </button>
      ))}
    </div>
  );
}
