export interface WatchSetup {
  platform: string;
  showTitle: string;
  showId?: number; // TVMaze show ID
  season: string;
  episode: string;
  timestamp: string;
  context: string; // Episode summary/recap or manual context
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  style?: 'quick' | 'explain' | 'lore';
  audited?: boolean;
  wasModified?: boolean;
}

export interface SpoilerReport {
  question: string;
  context: string;
  answer: string;
  timestamp: Date;
}

export type ResponseStyle = 'quick' | 'explain' | 'lore';
export type RefinementOption = 'shorter' | 'detail' | 'examples' | 'terms';
export type EpisodeSource = 'tvmaze' | 'fandom' | 'manual' | null;