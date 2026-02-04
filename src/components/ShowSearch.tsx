import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShowResult {
  id: number;
  name: string;
  premiered?: string;
  genres?: string[];
  image?: { medium?: string };
}

interface ShowSearchProps {
  onSelect: (show: ShowResult) => void;
  selectedShow?: ShowResult | null;
  initialValue?: string;
  className?: string;
}

export function ShowSearch({ onSelect, selectedShow, initialValue, className }: ShowSearchProps) {
  const [query, setQuery] = useState(initialValue || '');
  const [results, setResults] = useState<ShowResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Update query when initialValue changes
  useEffect(() => {
    if (initialValue && !selectedShow) {
      setQuery(initialValue);
    }
  }, [initialValue, selectedShow]);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // TVMaze API - free, no API key needed
        const response = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');
        
        const data = await response.json();
        const shows = data.slice(0, 8).map((item: { show: ShowResult }) => item.show);
        setResults(shows);
        setIsOpen(shows.length > 0);
      } catch (err) {
        console.error('Show search error:', err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);

  const handleSelect = (show: ShowResult) => {
    onSelect(show);
    setQuery(show.name);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder="Search for a show or anime..."
          className="pl-9 pr-9 bg-input border-border text-sm h-9"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-card shadow-lg max-h-64 overflow-y-auto">
          {results.map((show) => (
            <button
              key={show.id}
              onClick={() => handleSelect(show)}
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center gap-3"
            >
              {show.image?.medium ? (
                <img src={show.image.medium} alt="" className="w-10 h-14 object-cover rounded" />
              ) : (
                <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                  <Tv className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{show.name}</div>
                {show.premiered && (
                  <div className="text-xs text-muted-foreground">{show.premiered.split('-')[0]}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedShow && query === selectedShow.name && (
        <div className="mt-2 text-xs text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{selectedShow.name}</span>
        </div>
      )}
    </div>
  );
}
