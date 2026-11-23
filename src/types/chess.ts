import type { Square } from 'chess.js';

export type GameMode = 'stockfish' | 'two-player';
export type PlayerColor = 'w' | 'b';
export type SideChoice = 'w' | 'b' | 'random';
export type BoardTheme = 'tournament' | 'walnut' | 'slate';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface StockfishLevelConfig {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  eloLabel: string;
  skillLevel: number;
  depth: number;
  movetime: number;
}

export const STOCKFISH_LEVELS: StockfishLevelConfig[] = [
  { level: 1, name: 'Beginner', eloLabel: '~600', skillLevel: 0, depth: 1, movetime: 120 },
  { level: 2, name: 'Casual', eloLabel: '~1000', skillLevel: 3, depth: 3, movetime: 200 },
  { level: 3, name: 'Club', eloLabel: '~1400', skillLevel: 7, depth: 6, movetime: 350 },
  { level: 4, name: 'Intermediate', eloLabel: '~1800', skillLevel: 12, depth: 10, movetime: 550 },
  { level: 5, name: 'Master', eloLabel: '~2200', skillLevel: 16, depth: 13, movetime: 800 },
  { level: 6, name: 'Grandmaster', eloLabel: 'Max', skillLevel: 20, depth: 16, movetime: 1200 },
];

export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold'
  | 'insufficient'
  | 'fifty-move'
  | 'resignation'
  | 'agreement';

export interface GameResult {
  winner: PlayerColor | 'draw';
  reason: GameEndReason;
  headline: string;
  detail: string;
}

export interface PendingPromotion {
  from: Square;
  to: Square;
  color: PlayerColor;
}

export interface MoveRecord {
  ply: number;
  san: string;
  lan: string;
  from: string;
  to: string;
  fen: string;
  color: PlayerColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isCapture: boolean;
  isCastle: boolean;
  isPromotion?: boolean;
}
