import type { BoardTheme } from './chess';

export type ArcadeGameId = 'chess' | 'ski' | 'pool';

export type DailyChallengeMetric =
  | 'puzzlesSolved'
  | 'chessWins'
  | 'skiRuns'
  | 'skiBestScore'
  | 'poolWins'
  | 'poolBallsPotted';

export interface DailyChallengeDefinition {
  id: string;
  game: ArcadeGameId;
  title: string;
  description: string;
  metric: DailyChallengeMetric;
  target: number;
  rewardXp: number;
}

export interface PoolCueStyle {
  id: string;
  name: string;
  buttColor: string;
  inlayColor: string;
  shaftColor: string;
  ferruleColor: string;
  unlockCostXp: number;
}

export interface ArcadeUnlockItem {
  id: string;
  category: 'ski-gear' | 'pool-cue' | 'chess-board';
  targetId: string;
  name: string;
  subtitle: string;
  costXp: number;
}

export interface DailyProgressCounters {
  puzzlesSolved: number;
  chessWins: number;
  skiRuns: number;
  skiBestScore: number;
  poolWins: number;
  poolBallsPotted: number;
}

export interface StoredArcadeState {
  xp: number;
  totalChallengesClaimed: number;
  unlockedIds: string[];
  dailyDateKey: string;
  dailyCounters: DailyProgressCounters;
  claimedChallengeIds: string[];
  puzzleRushBestScore: number;
  puzzleRushBestStreak: number;
  poolStats: {
    gamesPlayed: number;
    wins: number;
    ballsPotted: number;
    selectedCueId: string;
  };
}

export const POOL_CUE_STYLES: PoolCueStyle[] = [
  {
    id: 'classic-maple',
    name: 'Classic Maple',
    buttColor: '#5C3317',
    inlayColor: '#E5C07B',
    shaftColor: '#F3DFC1',
    ferruleColor: '#F8FAFC',
    unlockCostXp: 0,
  },
  {
    id: 'walnut-brass',
    name: 'Walnut & Brass',
    buttColor: '#3B2314',
    inlayColor: '#D97706',
    shaftColor: '#EDD5B1',
    ferruleColor: '#FEF3C7',
    unlockCostXp: 0,
  },
  {
    id: 'carbon-emerald',
    name: 'Emerald Carbon',
    buttColor: '#0F172A',
    inlayColor: '#10B981',
    shaftColor: '#334155',
    ferruleColor: '#34D399',
    unlockCostXp: 120,
  },
  {
    id: 'crimson-ivory',
    name: 'Crimson Ivory',
    buttColor: '#7F1D1D',
    inlayColor: '#F8FAFC',
    shaftColor: '#F5E6D3',
    ferruleColor: '#FCA5A5',
    unlockCostXp: 200,
  },
  {
    id: 'gold-pro',
    name: 'Championship Gold',
    buttColor: '#1E1B4B',
    inlayColor: '#FACC15',
    shaftColor: '#E2E8F0',
    ferruleColor: '#FDE047',
    unlockCostXp: 320,
  },
];

export const ARCADE_UNLOCKABLES: ArcadeUnlockItem[] = [
  {
    id: 'ski-aurora-ice',
    category: 'ski-gear',
    targetId: 'aurora-ice',
    name: 'Aurora Glacier Suit',
    subtitle: 'Cork7 Ski Gear',
    costXp: 100,
  },
  {
    id: 'cue-carbon-emerald',
    category: 'pool-cue',
    targetId: 'carbon-emerald',
    name: 'Emerald Carbon Cue',
    subtitle: '8-Ball Pool Cue',
    costXp: 120,
  },
  {
    id: 'board-midnight',
    category: 'chess-board',
    targetId: 'midnight' satisfies BoardTheme,
    name: 'Midnight Obsidian Board',
    subtitle: 'Chess Board Theme',
    costXp: 150,
  },
  {
    id: 'ski-neon-cyber',
    category: 'ski-gear',
    targetId: 'neon-cyber',
    name: 'Hyper Prism Suit',
    subtitle: 'Cork7 Ski Gear',
    costXp: 180,
  },
  {
    id: 'cue-crimson-ivory',
    category: 'pool-cue',
    targetId: 'crimson-ivory',
    name: 'Crimson Ivory Cue',
    subtitle: '8-Ball Pool Cue',
    costXp: 200,
  },
  {
    id: 'board-royal',
    category: 'chess-board',
    targetId: 'royal' satisfies BoardTheme,
    name: 'Royal Emerald & Gold Board',
    subtitle: 'Chess Board Theme',
    costXp: 240,
  },
  {
    id: 'ski-gold-olympian',
    category: 'ski-gear',
    targetId: 'gold-olympian',
    name: 'Podium Gold Pro Suit',
    subtitle: 'Cork7 Ski Gear',
    costXp: 280,
  },
  {
    id: 'cue-gold-pro',
    category: 'pool-cue',
    targetId: 'gold-pro',
    name: 'Championship Gold Cue',
    subtitle: '8-Ball Pool Cue',
    costXp: 320,
  },
];
