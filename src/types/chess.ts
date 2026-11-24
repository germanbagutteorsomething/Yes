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

export type TimeControlId =
  | 'none'
  | 'move-30'
  | 'bullet-1'
  | 'blitz-3-2'
  | 'blitz-5'
  | 'rapid-10'
  | 'rapid-15-10';

export interface TimeControlConfig {
  id: TimeControlId;
  label: string;
  shortLabel: string;
  baseSeconds: number;
  incrementSeconds: number;
  perMove?: boolean;
}

export const TIME_CONTROLS: TimeControlConfig[] = [
  { id: 'none', label: 'No Timer', shortLabel: 'Off', baseSeconds: 0, incrementSeconds: 0 },
  {
    id: 'move-30',
    label: '30s / Move',
    shortLabel: '30s/mv',
    baseSeconds: 30,
    incrementSeconds: 0,
    perMove: true,
  },
  { id: 'bullet-1', label: '1 min', shortLabel: '1+0', baseSeconds: 60, incrementSeconds: 0 },
  { id: 'blitz-3-2', label: '3 | 2', shortLabel: '3+2', baseSeconds: 180, incrementSeconds: 2 },
  { id: 'blitz-5', label: '5 min', shortLabel: '5+0', baseSeconds: 300, incrementSeconds: 0 },
  { id: 'rapid-10', label: '10 min', shortLabel: '10+0', baseSeconds: 600, incrementSeconds: 0 },
  { id: 'rapid-15-10', label: '15 | 10', shortLabel: '15+10', baseSeconds: 900, incrementSeconds: 10 },
];

export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold'
  | 'insufficient'
  | 'fifty-move'
  | 'resignation'
  | 'agreement'
  | 'timeout';

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

export type MoveClassification =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface PositionEval {
  /** Centipawns from White's perspective (+ favors White, - favors Black). */
  cp: number;
  /** Mate in N moves from White's perspective (+ White mates, - Black mates). */
  mate: number | null;
  /** Best UCI move in this position (e.g. "e2e4"). */
  bestMove: string;
}

export interface MoveAnalysis {
  ply: number; // 1-indexed ply matching MoveRecord.ply
  san: string;
  color: PlayerColor;
  playedLan: string;
  bestLan: string;
  evalBefore: PositionEval;
  evalAfter: PositionEval;
  cpLoss: number;
  classification: MoveClassification;
}

export interface SideAccuracySummary {
  accuracy: number;
  acpl: number;
  best: number;
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
}

export interface MatchAnalysisResult {
  moves: MoveAnalysis[];
  white: SideAccuracySummary;
  black: SideAccuracySummary;
  startEval: PositionEval;
}
