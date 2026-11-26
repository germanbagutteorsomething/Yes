import type { Square } from 'chess.js';

export type AppView = 'play' | 'puzzles' | 'endgames' | 'archive';
export type GameMode = 'stockfish' | 'two-player';
export type OpponentKind = 'stockfish' | 'bot';
export type PlayerColor = 'w' | 'b';
export type SideChoice = 'w' | 'b' | 'random';
export type BoardTheme = 'tournament' | 'walnut' | 'slate' | 'midnight' | 'royal';
export type PieceSet = 'classic' | 'neo' | 'pixel';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export type StockfishLevelNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type BotId = 'randy' | 'gary' | 'tara' | 'sam' | 'bella' | 'mikhail';
export type BotPlayStyle = 'random' | 'greedy' | 'aggressive' | 'solid' | 'blitz';

export type GameVariant =
  | 'standard'
  | 'shuffle960'
  | 'odds-pawn'
  | 'odds-knight'
  | 'odds-rook'
  | 'odds-queen';

export interface VariantConfig {
  id: GameVariant;
  label: string;
  shortLabel: string;
  description: string;
}

export const GAME_VARIANTS: VariantConfig[] = [
  {
    id: 'standard',
    label: 'Standard Chess',
    shortLabel: 'Standard',
    description: 'Classic FIDE starting position',
  },
  {
    id: 'shuffle960',
    label: '960 Backrank',
    shortLabel: '960 Setup',
    description: 'Randomized Fischer back-rank (960 valid layouts)',
  },
  {
    id: 'odds-pawn',
    label: 'Pawn Odds',
    shortLabel: '+Pawn',
    description: 'Opponent starts without the f-pawn',
  },
  {
    id: 'odds-knight',
    label: 'Knight Odds',
    shortLabel: '+Knight',
    description: 'Opponent starts without a queenside knight',
  },
  {
    id: 'odds-rook',
    label: 'Rook Odds',
    shortLabel: '+Rook',
    description: 'Opponent starts without the a-rook',
  },
  {
    id: 'odds-queen',
    label: 'Queen Odds',
    shortLabel: '+Queen',
    description: 'Opponent starts without a queen',
  },
];

export interface StockfishLevelConfig {
  level: StockfishLevelNumber;
  name: string;
  eloLabel: string;
  skillLevel: number;
  depth: number;
  movetime: number;
}

export const STOCKFISH_LEVELS: StockfishLevelConfig[] = [
  { level: 1, name: 'Novice', eloLabel: '~400', skillLevel: 0, depth: 1, movetime: 80 },
  { level: 2, name: 'Beginner', eloLabel: '~650', skillLevel: 1, depth: 2, movetime: 120 },
  { level: 3, name: 'Casual', eloLabel: '~950', skillLevel: 3, depth: 3, movetime: 180 },
  { level: 4, name: 'Amateur', eloLabel: '~1200', skillLevel: 5, depth: 5, movetime: 260 },
  { level: 5, name: 'Club', eloLabel: '~1450', skillLevel: 8, depth: 7, movetime: 360 },
  { level: 6, name: 'Tournament', eloLabel: '~1700', skillLevel: 11, depth: 9, movetime: 480 },
  { level: 7, name: 'Intermediate', eloLabel: '~1950', skillLevel: 14, depth: 11, movetime: 620 },
  { level: 8, name: 'Candidate', eloLabel: '~2150', skillLevel: 16, depth: 13, movetime: 780 },
  { level: 9, name: 'Master', eloLabel: '~2400', skillLevel: 18, depth: 15, movetime: 980 },
  { level: 10, name: 'Grandmaster', eloLabel: 'Max', skillLevel: 20, depth: 17, movetime: 1300 },
];

export interface BotProfile {
  id: BotId;
  name: string;
  eloLabel: string;
  tagline: string;
  style: BotPlayStyle;
  skillLevel: number;
  depth: number;
  movetime: number;
  minDelayMs: number;
}

export const BOT_PROFILES: BotProfile[] = [
  {
    id: 'randy',
    name: 'Random Randy',
    eloLabel: '~300',
    tagline: 'Unpredictable',
    style: 'random',
    skillLevel: 0,
    depth: 1,
    movetime: 60,
    minDelayMs: 360,
  },
  {
    id: 'gary',
    name: 'Greedy Gary',
    eloLabel: '~750',
    tagline: 'Material Hunter',
    style: 'greedy',
    skillLevel: 1,
    depth: 2,
    movetime: 100,
    minDelayMs: 420,
  },
  {
    id: 'tara',
    name: 'Tactical Tara',
    eloLabel: '~1150',
    tagline: 'Aggressive',
    style: 'aggressive',
    skillLevel: 4,
    depth: 4,
    movetime: 260,
    minDelayMs: 380,
  },
  {
    id: 'sam',
    name: 'Solid Sam',
    eloLabel: '~1500',
    tagline: 'Positional',
    style: 'solid',
    skillLevel: 8,
    depth: 7,
    movetime: 380,
    minDelayMs: 360,
  },
  {
    id: 'bella',
    name: 'Blitz Bella',
    eloLabel: '~1850',
    tagline: 'Speed Demon',
    style: 'blitz',
    skillLevel: 13,
    depth: 9,
    movetime: 180,
    minDelayMs: 140,
  },
  {
    id: 'mikhail',
    name: 'Mikhail',
    eloLabel: '~2250',
    tagline: 'Attacking Master',
    style: 'aggressive',
    skillLevel: 17,
    depth: 14,
    movetime: 820,
    minDelayMs: 350,
  },
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
  | 'book'
  | 'brilliant'
  | 'great'
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
  /** Second-best move score from White's perspective, if available. */
  secondBestCp?: number | null;
  /** Second-best move mate score from White's perspective, if available. */
  secondBestMate?: number | null;
}

export interface MoveAnalysis {
  ply: number; // 1-indexed ply matching MoveRecord.ply
  san: string;
  color: PlayerColor;
  to: Square;
  playedLan: string;
  bestLan: string;
  bestSan: string;
  evalBefore: PositionEval;
  evalAfter: PositionEval;
  cpLoss: number;
  classification: MoveClassification;
}

export interface SideAccuracySummary {
  accuracy: number;
  acpl: number;
  book: number;
  brilliant: number;
  great: number;
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

export type BoardAnnotationColor = 'emerald' | 'red' | 'amber' | 'sky';

export interface BoardArrow {
  from: Square;
  to: Square;
  color: BoardAnnotationColor;
}

export interface BoardHighlight {
  square: Square;
  color: BoardAnnotationColor;
}

export interface Premove {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export interface OpeningInfo {
  eco: string;
  name: string;
  matchedPlies: number;
}

export interface SavedMatch {
  id: string;
  playedAt: string;
  mode: GameMode;
  opponentKind?: OpponentKind;
  opponentLabel: string;
  stockfishLevel?: StockfishLevelNumber;
  botId?: BotId;
  variant: GameVariant;
  openingEco?: string;
  openingName?: string;
  winner: PlayerColor | 'draw';
  reason: GameEndReason;
  headline: string;
  humanColor: PlayerColor;
  movesCount: number;
  startFen: string;
  moves: MoveRecord[];
  pgn: string;
  whiteAccuracy?: number;
  blackAccuracy?: number;
  brilliantCount?: number;
}

export type PuzzleTheme =
  | 'Mate in 1'
  | 'Mate in 2'
  | 'Fork & Tactics'
  | 'Pin & Skewer'
  | 'Sacrifice';

export type PuzzleDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface PuzzleDefinition {
  id: string;
  title: string;
  theme: PuzzleTheme;
  difficulty: PuzzleDifficulty;
  rating: number;
  fen: string;
  /** Alternating player/opponent UCI moves starting with side to move in `fen`. */
  solution: string[];
  hintText: string;
}

export interface EndgameDrillDefinition {
  id: string;
  title: string;
  category: 'Checkmate Pattern' | 'Rook Endgame' | 'Pawn Endgame';
  difficulty: 'Beginner' | 'Intermediate' | 'Master';
  objective: 'win' | 'draw';
  goalDescription: string;
  fen: string;
  humanColor: PlayerColor;
}
