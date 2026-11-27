import type { Square } from 'chess.js';

export type AppView = 'play' | 'puzzles' | 'endgames' | 'archive';
export type GameMode = 'stockfish' | 'two-player' | 'online';
export type OpponentKind = 'stockfish' | 'bot';
export type PlayerColor = 'w' | 'b';
export type SideChoice = 'w' | 'b' | 'random';
export type BoardTheme = 'tournament' | 'walnut' | 'slate' | 'midnight' | 'royal';
export type PieceSet = 'classic' | 'neo' | 'pixel';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export type StockfishLevelNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type BotId =
  | 'martin'
  | 'randy'
  | 'penny'
  | 'ned'
  | 'gary'
  | 'chloe'
  | 'tara'
  | 'gambit'
  | 'fiona'
  | 'sam'
  | 'carla'
  | 'victor'
  | 'bella'
  | 'elena'
  | 'nolan'
  | 'sasha'
  | 'mikhail'
  | 'ivan'
  | 'leona'
  | 'garry'
  | 'anatoly'
  | 'magnus'
  | 'judit'
  | 'zero';
export type BotPlayStyle = 'random' | 'greedy' | 'aggressive' | 'solid' | 'blitz';
export type BotTier = 'Casual' | 'Club' | 'Master' | 'Grandmaster';

export type GameVariant =
  | 'standard'
  | 'king-of-the-hill'
  | 'three-check'
  | 'fog-of-war'
  | 'racing-kings'
  | 'crazyhouse'
  | 'shuffle960'
  | 'double-960'
  | 'no-pawns'
  | 'cavalry-charge'
  | 'queen-swarm'
  | 'peasants-revolt'
  | 'odds-pawn'
  | 'odds-knight'
  | 'odds-rook'
  | 'odds-queen';

export type CrazyhouseSetupMode = 'classic' | '960' | 'starter';
export type DroppablePiece = 'p' | 'n' | 'b' | 'r' | 'q';
export type CrazyhousePocket = Record<DroppablePiece, number>;

export type VariantCategory = 'rules' | 'setups' | 'odds';

export interface VariantConfig {
  id: GameVariant;
  category: VariantCategory;
  label: string;
  shortLabel: string;
  description: string;
}

export const GAME_VARIANTS: VariantConfig[] = [
  {
    id: 'standard',
    category: 'rules',
    label: 'Standard Chess',
    shortLabel: 'Standard',
    description: 'Classic FIDE starting position and rules.',
  },
  {
    id: 'king-of-the-hill',
    category: 'rules',
    label: 'King of the Hill',
    shortLabel: 'Hill King',
    description: 'Reach d4, e4, d5, or e5 with your King to win immediately (or checkmate).',
  },
  {
    id: 'three-check',
    category: 'rules',
    label: 'Three-Check',
    shortLabel: '3-Check',
    description: 'Deliver 3 checks to the opposing King to win immediately.',
  },
  {
    id: 'fog-of-war',
    category: 'rules',
    label: 'Fog of War',
    shortLabel: 'Fog of War',
    description: 'Only squares your pieces can reach or defend are visible through the mist.',
  },
  {
    id: 'racing-kings',
    category: 'rules',
    label: 'Racing Kings',
    shortLabel: 'Race Kings',
    description: 'Checks are illegal. First King to reach rank 8 wins the race!',
  },
  {
    id: 'crazyhouse',
    category: 'rules',
    label: 'Crazyhouse',
    shortLabel: 'Crazyhouse',
    description: 'Captured enemy pieces switch sides into your reserve pocket and can be dropped onto empty squares.',
  },
  {
    id: 'shuffle960',
    category: 'setups',
    label: '960 Backrank',
    shortLabel: '960 Setup',
    description: 'Randomized Fischer back-rank (960 valid layouts).',
  },
  {
    id: 'double-960',
    category: 'setups',
    label: 'Double 960',
    shortLabel: 'Double 960',
    description: 'White and Black each start with an independent randomized 960 back-rank.',
  },
  {
    id: 'no-pawns',
    category: 'setups',
    label: 'No Pawns',
    shortLabel: 'No Pawns',
    description: 'Pure piece tactics from Move 1 with zero pawns on the board.',
  },
  {
    id: 'cavalry-charge',
    category: 'setups',
    label: 'Cavalry Charge',
    shortLabel: 'Cavalry',
    description: 'Every back-rank piece except the King is replaced with Knights.',
  },
  {
    id: 'queen-swarm',
    category: 'setups',
    label: 'Queen Swarm',
    shortLabel: 'All Queens',
    description: 'Seven Queens per side behind a pawn wall—total tactical chaos.',
  },
  {
    id: 'peasants-revolt',
    category: 'setups',
    label: "Peasants' Revolt",
    shortLabel: 'Peasants',
    description: 'Asymmetric duel: White’s 8 Pawns & Knight vs Black’s 4 Knights & Pawn.',
  },
  {
    id: 'odds-pawn',
    category: 'odds',
    label: 'Pawn Odds',
    shortLabel: '+Pawn',
    description: 'Opponent starts without the f-pawn.',
  },
  {
    id: 'odds-knight',
    category: 'odds',
    label: 'Knight Odds',
    shortLabel: '+Knight',
    description: 'Opponent starts without a queenside knight.',
  },
  {
    id: 'odds-rook',
    category: 'odds',
    label: 'Rook Odds',
    shortLabel: '+Rook',
    description: 'Opponent starts without the a-rook.',
  },
  {
    id: 'odds-queen',
    category: 'odds',
    label: 'Queen Odds',
    shortLabel: '+Queen',
    description: 'Opponent starts without a queen.',
  },
];

export interface StockfishLevelConfig {
  level: StockfishLevelNumber;
  name: string;
  eloLabel: string;
  numericElo: number;
  skillLevel: number;
  depth: number;
  movetime: number;
}

export const STOCKFISH_LEVELS: StockfishLevelConfig[] = [
  { level: 1, name: 'Novice', eloLabel: '~400', numericElo: 400, skillLevel: 0, depth: 1, movetime: 80 },
  { level: 2, name: 'Beginner', eloLabel: '~650', numericElo: 650, skillLevel: 1, depth: 2, movetime: 120 },
  { level: 3, name: 'Casual', eloLabel: '~950', numericElo: 950, skillLevel: 3, depth: 3, movetime: 180 },
  { level: 4, name: 'Amateur', eloLabel: '~1200', numericElo: 1200, skillLevel: 5, depth: 5, movetime: 260 },
  { level: 5, name: 'Club', eloLabel: '~1450', numericElo: 1450, skillLevel: 8, depth: 7, movetime: 360 },
  { level: 6, name: 'Tournament', eloLabel: '~1700', numericElo: 1700, skillLevel: 11, depth: 9, movetime: 480 },
  { level: 7, name: 'Intermediate', eloLabel: '~1950', numericElo: 1950, skillLevel: 14, depth: 11, movetime: 620 },
  { level: 8, name: 'Candidate', eloLabel: '~2150', numericElo: 2150, skillLevel: 16, depth: 13, movetime: 780 },
  { level: 9, name: 'Master', eloLabel: '~2400', numericElo: 2400, skillLevel: 18, depth: 15, movetime: 980 },
  { level: 10, name: 'Grandmaster', eloLabel: 'Max', numericElo: 2750, skillLevel: 20, depth: 17, movetime: 1300 },
];

export interface BotProfile {
  id: BotId;
  name: string;
  eloLabel: string;
  numericElo: number;
  tagline: string;
  tier: BotTier;
  style: BotPlayStyle;
  skillLevel: number;
  depth: number;
  movetime: number;
  minDelayMs: number;
}

export const BOT_PROFILES: BotProfile[] = [
  // Casual (~250 - 950)
  {
    id: 'martin',
    name: 'Blunder Ben',
    eloLabel: '~250',
    numericElo: 250,
    tagline: 'Pure Chaos',
    tier: 'Casual',
    style: 'random',
    skillLevel: 0,
    depth: 1,
    movetime: 50,
    minDelayMs: 300,
  },
  {
    id: 'randy',
    name: 'Random Randy',
    eloLabel: '~350',
    numericElo: 350,
    tagline: 'Unpredictable',
    tier: 'Casual',
    style: 'random',
    skillLevel: 0,
    depth: 1,
    movetime: 60,
    minDelayMs: 320,
  },
  {
    id: 'penny',
    name: 'Pawn-Push Penny',
    eloLabel: '~500',
    numericElo: 500,
    tagline: 'Loves Advancing Pawns',
    tier: 'Casual',
    style: 'greedy',
    skillLevel: 0,
    depth: 1,
    movetime: 80,
    minDelayMs: 340,
  },
  {
    id: 'ned',
    name: 'Knight-Hop Ned',
    eloLabel: '~650',
    numericElo: 650,
    tagline: 'Cavalry Fanatic',
    tier: 'Casual',
    style: 'greedy',
    skillLevel: 1,
    depth: 2,
    movetime: 90,
    minDelayMs: 340,
  },
  {
    id: 'gary',
    name: 'Greedy Gary',
    eloLabel: '~750',
    numericElo: 750,
    tagline: 'Material Hunter',
    tier: 'Casual',
    style: 'greedy',
    skillLevel: 1,
    depth: 2,
    movetime: 100,
    minDelayMs: 360,
  },
  {
    id: 'chloe',
    name: 'Check-Happy Chloe',
    eloLabel: '~900',
    numericElo: 900,
    tagline: 'Never Skips a Check',
    tier: 'Casual',
    style: 'greedy',
    skillLevel: 2,
    depth: 2,
    movetime: 120,
    minDelayMs: 350,
  },

  // Club (~1100 - 1680)
  {
    id: 'tara',
    name: 'Tactical Tara',
    eloLabel: '~1150',
    numericElo: 1150,
    tagline: 'Aggressive',
    tier: 'Club',
    style: 'aggressive',
    skillLevel: 4,
    depth: 4,
    movetime: 240,
    minDelayMs: 320,
  },
  {
    id: 'gambit',
    name: 'Gambit Gus',
    eloLabel: '~1280',
    numericElo: 1280,
    tagline: 'Wild Gambiteer',
    tier: 'Club',
    style: 'aggressive',
    skillLevel: 5,
    depth: 5,
    movetime: 260,
    minDelayMs: 300,
  },
  {
    id: 'fiona',
    name: 'Fianchetto Fiona',
    eloLabel: '~1380',
    numericElo: 1380,
    tagline: 'Flank Bishop Sniper',
    tier: 'Club',
    style: 'solid',
    skillLevel: 6,
    depth: 6,
    movetime: 300,
    minDelayMs: 300,
  },
  {
    id: 'sam',
    name: 'Solid Sam',
    eloLabel: '~1500',
    numericElo: 1500,
    tagline: 'Positional',
    tier: 'Club',
    style: 'solid',
    skillLevel: 8,
    depth: 7,
    movetime: 350,
    minDelayMs: 320,
  },
  {
    id: 'carla',
    name: 'Counter Carla',
    eloLabel: '~1600',
    numericElo: 1600,
    tagline: 'Sicilian Counterpunch',
    tier: 'Club',
    style: 'aggressive',
    skillLevel: 10,
    depth: 8,
    movetime: 360,
    minDelayMs: 280,
  },
  {
    id: 'victor',
    name: 'Viper Victor',
    eloLabel: '~1680',
    numericElo: 1680,
    tagline: 'Sharp Trap Setter',
    tier: 'Club',
    style: 'aggressive',
    skillLevel: 11,
    depth: 8,
    movetime: 380,
    minDelayMs: 280,
  },

  // Master (~1850 - 2320)
  {
    id: 'bella',
    name: 'Blitz Bella',
    eloLabel: '~1850',
    numericElo: 1850,
    tagline: 'Speed Demon',
    tier: 'Master',
    style: 'blitz',
    skillLevel: 13,
    depth: 9,
    movetime: 180,
    minDelayMs: 140,
  },
  {
    id: 'elena',
    name: 'Endgame Elena',
    eloLabel: '~1950',
    numericElo: 1950,
    tagline: 'Endgame Technician',
    tier: 'Master',
    style: 'solid',
    skillLevel: 14,
    depth: 10,
    movetime: 480,
    minDelayMs: 280,
  },
  {
    id: 'nolan',
    name: 'Nimzo Nolan',
    eloLabel: '~2050',
    numericElo: 2050,
    tagline: 'Classical Blockader',
    tier: 'Master',
    style: 'solid',
    skillLevel: 15,
    depth: 11,
    movetime: 540,
    minDelayMs: 280,
  },
  {
    id: 'sasha',
    name: 'Sacrifice Sasha',
    eloLabel: '~2150',
    numericElo: 2150,
    tagline: 'Romantic Sacrifices',
    tier: 'Master',
    style: 'aggressive',
    skillLevel: 16,
    depth: 12,
    movetime: 640,
    minDelayMs: 300,
  },
  {
    id: 'mikhail',
    name: 'Mikhail',
    eloLabel: '~2250',
    numericElo: 2250,
    tagline: 'Attacking Master',
    tier: 'Master',
    style: 'aggressive',
    skillLevel: 17,
    depth: 13,
    movetime: 740,
    minDelayMs: 300,
  },
  {
    id: 'ivan',
    name: 'Iron Ivan',
    eloLabel: '~2320',
    numericElo: 2320,
    tagline: 'Unbreakable Fortress',
    tier: 'Master',
    style: 'solid',
    skillLevel: 17,
    depth: 14,
    movetime: 780,
    minDelayMs: 300,
  },

  // Grandmaster (~2400 - 2750)
  {
    id: 'leona',
    name: 'Lightning Leona',
    eloLabel: '~2400',
    numericElo: 2400,
    tagline: 'Hyper-Bullet GM',
    tier: 'Grandmaster',
    style: 'blitz',
    skillLevel: 18,
    depth: 13,
    movetime: 320,
    minDelayMs: 120,
  },
  {
    id: 'garry',
    name: 'Titan Garry',
    eloLabel: '~2500',
    numericElo: 2500,
    tagline: 'Relentless Initiative',
    tier: 'Grandmaster',
    style: 'aggressive',
    skillLevel: 19,
    depth: 15,
    movetime: 900,
    minDelayMs: 280,
  },
  {
    id: 'anatoly',
    name: 'Boa Anatoly',
    eloLabel: '~2560',
    numericElo: 2560,
    tagline: 'Prophylactic Squeeze',
    tier: 'Grandmaster',
    style: 'solid',
    skillLevel: 19,
    depth: 15,
    movetime: 960,
    minDelayMs: 280,
  },
  {
    id: 'magnus',
    name: 'Apex Magnus',
    eloLabel: '~2650',
    numericElo: 2650,
    tagline: 'Universal Grinder',
    tier: 'Grandmaster',
    style: 'solid',
    skillLevel: 20,
    depth: 16,
    movetime: 1080,
    minDelayMs: 280,
  },
  {
    id: 'judit',
    name: 'Storm Judit',
    eloLabel: '~2680',
    numericElo: 2680,
    tagline: 'Fearless Tactician',
    tier: 'Grandmaster',
    style: 'aggressive',
    skillLevel: 20,
    depth: 16,
    movetime: 1120,
    minDelayMs: 260,
  },
  {
    id: 'zero',
    name: 'Alpha Zero',
    eloLabel: '2750',
    numericElo: 2750,
    tagline: 'Supreme Engine Boss',
    tier: 'Grandmaster',
    style: 'blitz',
    skillLevel: 20,
    depth: 18,
    movetime: 1300,
    minDelayMs: 240,
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
  | 'variant-win'
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
  tacticalTheme?: string;
  whatWentWrong?: string;
  whatWasBetter?: string;
  whyBetter?: string;
  explanation?: string;
}

export interface SideAccuracySummary {
  accuracy: number;
  acpl: number;
  estimatedElo: number;
  performanceTitle: string;
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
  crazyhouseSetup?: CrazyhouseSetupMode;
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
  eloDelta?: number;
  eloAfter?: number;
}

export interface EloHistoryPoint {
  rating: number;
  delta: number;
  opponentLabel: string;
  result: 'win' | 'draw' | 'loss';
  playedAt: string;
}

export interface StoredChessElo {
  rating: number;
  peakRating: number;
  gamesRated: number;
  wins: number;
  draws: number;
  losses: number;
  history: EloHistoryPoint[];
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
