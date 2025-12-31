import { Shield } from 'lucide-react';

export function Header() {
  return (
    <header className="py-4 px-6 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full" />
          <div className="relative p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Shield className="w-7 h-7 text-primary glow-text" />
          </div>
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Spoiler<span className="text-primary">Shield</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Ask questions without spoilers
          </p>
        </div>
      </div>
    </header>
  );
}
