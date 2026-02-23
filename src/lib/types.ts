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
export type EpisodeSource = 'tvmaze' | 'fandom' | 'websearch' | 'manual' | null;

export interface SessionMeta {
  sessionId: string;      // e.g. "42-s1e4" or UUID
  showId?: number;        // TVMaze ID
  showTitle: string;
  platform: string;
  season: string;
  episode: string;
  context: string;        // cached recap text
  lastMessageAt: number;  // Unix ms for sorting
  messageCount: number;
  confirmed?: boolean;    // false = auto-created, not yet used; true = user has sent at least one message
}

export type InitPhase =
  | 'detecting'     // waiting for SPOILERSHIELD_SHOW_INFO
  | 'resolving'     // TVMaze lookup in progress
  | 'ready'         // session loaded, chat active
  | 'needs-episode' // show found, no episode — inline picker shown
  | 'no-show'       // 2s timeout, no detection — show prompt
  | 'error';