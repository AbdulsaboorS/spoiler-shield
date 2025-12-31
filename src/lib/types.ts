export interface WatchSetup {
  platform: string;
  showTitle: string;
  season: string;
  episode: string;
  timestamp: string;
  context: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  style?: 'quick' | 'explain' | 'lore';
}

export interface SpoilerReport {
  question: string;
  context: string;
  answer: string;
  timestamp: Date;
}

export type ResponseStyle = 'quick' | 'explain' | 'lore';
export type RefinementOption = 'shorter' | 'detail' | 'examples' | 'terms';
