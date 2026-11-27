import type {
  ArcadeGameId,
  DailyChallengeDefinition,
  DailyChallengeMetric,
  DailyProgressCounters,
  StoredArcadeState,
} from '../types/arcade';
import { ARCADE_UNLOCKABLES, POOL_CUE_STYLES } from '../types/arcade';

const ARCADE_KEY = 'squareeight_arcade_v1';

export function getTodayDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CHESS_CHALLENGE_POOL: Omit<DailyChallengeDefinition, 'id'>[] = [
  {
    game: 'chess',
    title: 'Sharp Eye',
    description: 'Solve 3 Chess Puzzles or Rush tactics',
    metric: 'puzzlesSolved',
    target: 3,
    rewardXp: 70,
  },
  {
    game: 'chess',
    title: 'Board Conqueror',
    description: 'Win 1 Chess game against Engine or Bot',
    metric: 'chessWins',
    target: 1,
    rewardXp: 85,
  },
  {
    game: 'chess',
    title: 'Tactics Sprint',
    description: 'Solve 6 Chess Puzzles today',
    metric: 'puzzlesSolved',
    target: 6,
    rewardXp: 110,
  },
];

const SKI_CHALLENGE_POOL: Omit<DailyChallengeDefinition, 'id'>[] = [
  {
    game: 'ski',
    title: 'Clean Run Downhill',
    description: 'Complete 2 runs in Cork7 Alpine Ski',
    metric: 'skiRuns',
    target: 2,
    rewardXp: 75,
  },
  {
    game: 'ski',
    title: 'Big Air Session',
    description: 'Score 12,000+ pts in a single Cork7 run',
    metric: 'skiBestScore',
    target: 12000,
    rewardXp: 95,
  },
  {
    game: 'ski',
    title: 'Park Pro Line',
    description: 'Score 20,000+ pts in a single Cork7 run',
    metric: 'skiBestScore',
    target: 20000,
    rewardXp: 125,
  },
];

const POOL_CHALLENGE_POOL: Omit<DailyChallengeDefinition, 'id'>[] = [
  {
    game: 'pool',
    title: 'Pocket Hunter',
    description: 'Sink 8 object balls in 8-Ball Pool',
    metric: 'poolBallsPotted',
    target: 8,
    rewardXp: 70,
  },
  {
    game: 'pool',
    title: 'Rack Winner',
    description: 'Win 1 match of 8-Ball Pool',
    metric: 'poolWins',
    target: 1,
    rewardXp: 90,
  },
  {
    game: 'pool',
    title: 'Cue Specialist',
    description: 'Win 2 matches of 8-Ball Pool',
    metric: 'poolWins',
    target: 2,
    rewardXp: 120,
  },
];

const HEIST_CHALLENGE_POOL: Omit<DailyChallengeDefinition, 'id'>[] = [
  {
    game: 'heist',
    title: 'Quick Getaway',
    description: 'Complete 2 heist runs in Metro Heist 3D',
    metric: 'heistRuns',
    target: 2,
    rewardXp: 75,
  },
  {
    game: 'heist',
    title: 'Most Wanted',
    description: 'Score 4,500+ pts in a single Metro Heist run',
    metric: 'heistBestScore',
    target: 4500,
    rewardXp: 95,
  },
  {
    game: 'heist',
    title: 'High-Heat Legend',
    description: 'Score 8,000+ pts in a single Metro Heist run',
    metric: 'heistBestScore',
    target: 8000,
    rewardXp: 130,
  },
];

export function getDailyChallenges(dateKey = getTodayDateKey()): DailyChallengeDefinition[] {
  const seed = hashSeed(`sq8-daily-${dateKey}`);
  const c = CHESS_CHALLENGE_POOL[seed % CHESS_CHALLENGE_POOL.length];
  const s = SKI_CHALLENGE_POOL[(seed >>> 4) % SKI_CHALLENGE_POOL.length];
  const p = POOL_CHALLENGE_POOL[(seed >>> 8) % POOL_CHALLENGE_POOL.length];
  const h = HEIST_CHALLENGE_POOL[(seed >>> 12) % HEIST_CHALLENGE_POOL.length];
  return [
    { ...c, id: `${dateKey}-chess` },
    { ...s, id: `${dateKey}-ski` },
    { ...p, id: `${dateKey}-pool` },
    { ...h, id: `${dateKey}-heist` },
  ];
}

const EMPTY_COUNTERS: DailyProgressCounters = {
  puzzlesSolved: 0,
  chessWins: 0,
  skiRuns: 0,
  skiBestScore: 0,
  poolWins: 0,
  poolBallsPotted: 0,
  heistRuns: 0,
  heistBestScore: 0,
};

export function loadArcadeState(): StoredArcadeState {
  const today = getTodayDateKey();
  const fallback: StoredArcadeState = {
    xp: 0,
    totalChallengesClaimed: 0,
    unlockedIds: [],
    dailyDateKey: today,
    dailyCounters: { ...EMPTY_COUNTERS },
    claimedChallengeIds: [],
    puzzleRushBestScore: 0,
    puzzleRushBestStreak: 0,
    poolStats: {
      gamesPlayed: 0,
      wins: 0,
      ballsPotted: 0,
      selectedCueId: POOL_CUE_STYLES[0].id,
    },
  };

  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(ARCADE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredArcadeState>;
    const isSameDay = parsed.dailyDateKey === today;
    return {
      xp: parsed.xp ?? 0,
      totalChallengesClaimed: parsed.totalChallengesClaimed ?? 0,
      unlockedIds: Array.isArray(parsed.unlockedIds) ? parsed.unlockedIds : [],
      dailyDateKey: today,
      dailyCounters: isSameDay && parsed.dailyCounters
        ? { ...EMPTY_COUNTERS, ...parsed.dailyCounters }
        : { ...EMPTY_COUNTERS },
      claimedChallengeIds: isSameDay && Array.isArray(parsed.claimedChallengeIds)
        ? parsed.claimedChallengeIds
        : [],
      puzzleRushBestScore: parsed.puzzleRushBestScore ?? 0,
      puzzleRushBestStreak: parsed.puzzleRushBestStreak ?? 0,
      poolStats: {
        gamesPlayed: parsed.poolStats?.gamesPlayed ?? 0,
        wins: parsed.poolStats?.wins ?? 0,
        ballsPotted: parsed.poolStats?.ballsPotted ?? 0,
        selectedCueId: parsed.poolStats?.selectedCueId ?? POOL_CUE_STYLES[0].id,
      },
    };
  } catch {
    return fallback;
  }
}

function saveArcadeState(state: StoredArcadeState): StoredArcadeState {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ARCADE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }
  return state;
}

function evaluateAndAutoClaimDaily(state: StoredArcadeState): StoredArcadeState {
  const challenges = getDailyChallenges(state.dailyDateKey);
  let nextXp = state.xp;
  let claimedCount = state.totalChallengesClaimed;
  const nextClaimed = [...state.claimedChallengeIds];

  for (const ch of challenges) {
    if (nextClaimed.includes(ch.id)) continue;
    const val = state.dailyCounters[ch.metric] ?? 0;
    if (val >= ch.target) {
      nextClaimed.push(ch.id);
      nextXp += ch.rewardXp;
      claimedCount += 1;
    }
  }

  return {
    ...state,
    xp: nextXp,
    totalChallengesClaimed: claimedCount,
    claimedChallengeIds: nextClaimed,
  };
}

export function recordDailyProgress(updates: {
  addPuzzlesSolved?: number;
  addChessWins?: number;
  addSkiRuns?: number;
  skiScore?: number;
  addPoolWins?: number;
  addPoolBallsPotted?: number;
  addHeistRuns?: number;
  heistScore?: number;
  bonusXp?: number;
}): StoredArcadeState {
  const cur = loadArcadeState();
  const c = cur.dailyCounters;
  const nextCounters: DailyProgressCounters = {
    puzzlesSolved: c.puzzlesSolved + (updates.addPuzzlesSolved ?? 0),
    chessWins: c.chessWins + (updates.addChessWins ?? 0),
    skiRuns: c.skiRuns + (updates.addSkiRuns ?? 0),
    skiBestScore: Math.max(c.skiBestScore, updates.skiScore ?? 0),
    poolWins: c.poolWins + (updates.addPoolWins ?? 0),
    poolBallsPotted: c.poolBallsPotted + (updates.addPoolBallsPotted ?? 0),
    heistRuns: (c.heistRuns ?? 0) + (updates.addHeistRuns ?? 0),
    heistBestScore: Math.max(c.heistBestScore ?? 0, updates.heistScore ?? 0),
  };

  const withBonus: StoredArcadeState = {
    ...cur,
    xp: cur.xp + (updates.bonusXp ?? 0),
    dailyCounters: nextCounters,
  };

  return saveArcadeState(evaluateAndAutoClaimDaily(withBonus));
}

export function recordPuzzleRushResult(score: number, bestStreak: number): {
  state: StoredArcadeState;
  isNewBest: boolean;
} {
  const cur = loadArcadeState();
  const isNewBest = score > cur.puzzleRushBestScore;
  const next = saveArcadeState({
    ...cur,
    puzzleRushBestScore: Math.max(cur.puzzleRushBestScore, score),
    puzzleRushBestStreak: Math.max(cur.puzzleRushBestStreak, bestStreak),
  });
  return { state: next, isNewBest };
}

export function recordPoolMatchResult(params: {
  wonVsAi: boolean;
  ballsPotted: number;
}): StoredArcadeState {
  const cur = loadArcadeState();
  const updated: StoredArcadeState = {
    ...cur,
    poolStats: {
      ...cur.poolStats,
      gamesPlayed: cur.poolStats.gamesPlayed + 1,
      wins: cur.poolStats.wins + (params.wonVsAi ? 1 : 0),
      ballsPotted: cur.poolStats.ballsPotted + params.ballsPotted,
    },
  };
  saveArcadeState(updated);
  return recordDailyProgress({
    addPoolWins: params.wonVsAi ? 1 : 0,
    addPoolBallsPotted: params.ballsPotted,
    bonusXp: params.wonVsAi ? 35 : 15,
  });
}

export function selectPoolCue(cueId: string): StoredArcadeState {
  const cur = loadArcadeState();
  return saveArcadeState({
    ...cur,
    poolStats: {
      ...cur.poolStats,
      selectedCueId: cueId,
    },
  });
}

export function isItemUnlocked(
  state: StoredArcadeState,
  category: 'ski-gear' | 'pool-cue' | 'chess-board',
  targetId: string
): boolean {
  const item = ARCADE_UNLOCKABLES.find(
    (u) => u.category === category && u.targetId === targetId
  );
  if (!item) return true; // default base item
  return state.unlockedIds.includes(item.id);
}

export function unlockArcadeItem(unlockId: string): {
  ok: boolean;
  state: StoredArcadeState;
  error?: string;
} {
  const cur = loadArcadeState();
  const item = ARCADE_UNLOCKABLES.find((u) => u.id === unlockId);
  if (!item) return { ok: false, state: cur, error: 'Reward not found.' };
  if (cur.unlockedIds.includes(item.id)) return { ok: true, state: cur };
  if (cur.xp < item.costXp) {
    return { ok: false, state: cur, error: `Need ${item.costXp - cur.xp} more XP.` };
  }
  const next = saveArcadeState({
    ...cur,
    xp: cur.xp - item.costXp,
    unlockedIds: [...cur.unlockedIds, item.id],
  });
  return { ok: true, state: next };
}

export function getChallengeMetricValue(
  counters: DailyProgressCounters,
  metric: DailyChallengeMetric
): number {
  return counters[metric] ?? 0;
}

export function getGameLabel(game: ArcadeGameId): string {
  if (game === 'chess') return 'Chess';
  if (game === 'ski') return 'Cork7 Ski';
  if (game === 'pool') return '8-Ball Pool';
  return 'Metro Heist';
}
