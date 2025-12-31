import { Shield, Check } from 'lucide-react';

export function ShieldBadge() {
  return (
    <div className="shield-badge animate-pulse-glow">
      <Shield className="w-4 h-4" />
      <span>Spoiler Shield:</span>
      <span className="flex items-center gap-1 font-semibold">
        ON
        <Check className="w-3.5 h-3.5" />
      </span>
    </div>
  );
}
