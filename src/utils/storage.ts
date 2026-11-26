import type {
  BoardTheme,
  BotId,
  PieceSet,
  SavedMatch,
  StockfishLevelNumber,
} from '../types/chess';
import type { SkiGhostSample, SkiMapId, StoredSkiProgress } from '../types/ski';

const MATCHES_KEY = 'squareeight_matches_v1';
const DEFEATED_BOTS_KEY = 'squareeight_defeated_bots_v1';
const DEFEATED_LEVELS_KEY = 'squareeight_defeated_sf_v1';
const PUZZLE_STATE_KEY = 'squareeight_puzzles_v1';
const ENDGAMES_KEY = 'squareeight_endgames_v1';
const PREFS_KEY = 'squareeight_prefs_v1';

export interface StoredPuzzleState {
  solvedIds: string[];
  streak: number;
  bestStreak: number;
}

export interface StoredPreferences {
  darkMode: boolean;
  soundEnabled: boolean;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
}

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function loadSavedMatches(): SavedMatch[] {
  return safeReadJson<SavedMatch[]>(MATCHES_KEY, []);
}

export function saveMatchToHistory(match: SavedMatch): SavedMatch[] {
  const existing = loadSavedMatches().filter((m) => m.id !== match.id);
  const next = [match, ...existing].slice(0, 50);
  safeWriteJson(MATCHES_KEY, next);
  return next;
}

export function updateMatchAnalysisInHistory(
  matchId: string,
  whiteAccuracy: number,
  blackAccuracy: number,
  brilliantCount: number
): SavedMatch[] {
  const existing = loadSavedMatches();
  const next = existing.map((m) =>
    m.id === matchId ? { ...m, whiteAccuracy, blackAccuracy, brilliantCount } : m
  );
  safeWriteJson(MATCHES_KEY, next);
  return next;
}

export function deleteSavedMatch(matchId: string): SavedMatch[] {
  const next = loadSavedMatches().filter((m) => m.id !== matchId);
  safeWriteJson(MATCHES_KEY, next);
  return next;
}

export function clearSavedMatches(): SavedMatch[] {
  safeWriteJson(MATCHES_KEY, []);
  return [];
}

export function loadDefeatedBots(): BotId[] {
  return safeReadJson<BotId[]>(DEFEATED_BOTS_KEY, []);
}

export function markBotDefeated(botId: BotId): BotId[] {
  const cur = loadDefeatedBots();
  if (cur.includes(botId)) return cur;
  const next = [...cur, botId];
  safeWriteJson(DEFEATED_BOTS_KEY, next);
  return next;
}

export function loadDefeatedLevels(): StockfishLevelNumber[] {
  return safeReadJson<StockfishLevelNumber[]>(DEFEATED_LEVELS_KEY, []);
}

export function markLevelDefeated(level: StockfishLevelNumber): StockfishLevelNumber[] {
  const cur = loadDefeatedLevels();
  if (cur.includes(level)) return cur;
  const next = [...cur, level].sort((a, b) => a - b);
  safeWriteJson(DEFEATED_LEVELS_KEY, next);
  return next;
}

export function loadPuzzleState(): StoredPuzzleState {
  return safeReadJson<StoredPuzzleState>(PUZZLE_STATE_KEY, {
    solvedIds: [],
    streak: 0,
    bestStreak: 0,
  });
}

export function savePuzzleState(state: StoredPuzzleState) {
  safeWriteJson(PUZZLE_STATE_KEY, state);
}

export function loadCompletedEndgames(): string[] {
  return safeReadJson<string[]>(ENDGAMES_KEY, []);
}

export function markEndgameCompleted(drillId: string): string[] {
  const cur = loadCompletedEndgames();
  if (cur.includes(drillId)) return cur;
  const next = [...cur, drillId];
  safeWriteJson(ENDGAMES_KEY, next);
  return next;
}

export function loadPreferences(): StoredPreferences {
  return safeReadJson<StoredPreferences>(PREFS_KEY, {
    darkMode: false,
    soundEnabled: true,
    boardTheme: 'tournament',
    pieceSet: 'classic',
  });
}

export function savePreferences(prefs: StoredPreferences) {
  safeWriteJson(PREFS_KEY, prefs);
}

const SKI_PROGRESS_KEY = 'squareeight_ski_progress_v1';

export function loadSkiProgress(): StoredSkiProgress {
  const raw = safeReadJson<Partial<StoredSkiProgress>>(SKI_PROGRESS_KEY, {});
  return {
    selectedMapId: raw.selectedMapId ?? 'the-yard',
    selectedGearId: raw.selectedGearId ?? 'alpine-orange',
    ghostEnabled: raw.ghostEnabled ?? true,
    records: raw.records ?? {},
  };
}

export function saveSkiSelection(
  selectedMapId: SkiMapId,
  selectedGearId: string,
  ghostEnabled?: boolean
): StoredSkiProgress {
  const cur = loadSkiProgress();
  const next: StoredSkiProgress = {
    ...cur,
    selectedMapId,
    selectedGearId,
    ghostEnabled: ghostEnabled ?? cur.ghostEnabled,
  };
  safeWriteJson(SKI_PROGRESS_KEY, next);
  return next;
}

export function setSkiGhostEnabled(ghostEnabled: boolean): StoredSkiProgress {
  const cur = loadSkiProgress();
  const next: StoredSkiProgress = { ...cur, ghostEnabled };
  safeWriteJson(SKI_PROGRESS_KEY, next);
  return next;
}

const MEDAL_RANK: Record<'none' | 'bronze' | 'silver' | 'gold', number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

export function recordSkiRunResult(params: {
  mapId: SkiMapId;
  score: number;
  distanceMeters?: number;
  bestTrickName: string;
  bestTrickPoints: number;
  medal?: 'none' | 'bronze' | 'silver' | 'gold';
  completed: boolean;
  ghostSamples?: SkiGhostSample[];
  completedObjectiveIds?: string[];
}): { progress: StoredSkiProgress; isNewBest: boolean; newlyCompletedObjectives: string[] } {
  const cur = loadSkiProgress();
  const prevMap = cur.records[params.mapId] ?? {
    bestScore: 0,
    bestDistanceMeters: 0,
    bestTrickName: '',
    bestTrickPoints: 0,
    runsCompleted: 0,
    bestMedal: 'none' as const,
    completedObjectives: [],
  };

  const isNewBest = params.score > prevMap.bestScore;
  const beatTrick = params.bestTrickPoints > prevMap.bestTrickPoints;
  const incomingMedal = params.medal ?? 'none';
  const prevMedal = prevMap.bestMedal ?? 'none';
  const bestMedal =
    MEDAL_RANK[incomingMedal] > MEDAL_RANK[prevMedal] ? incomingMedal : prevMedal;

  const prevObjectives = prevMap.completedObjectives ?? [];
  const incomingObjectives = params.completedObjectiveIds ?? [];
  const newlyCompletedObjectives = incomingObjectives.filter(
    (id) => !prevObjectives.includes(id)
  );
  const mergedObjectives = Array.from(new Set([...prevObjectives, ...incomingObjectives]));

  const nextGhost =
    isNewBest && params.ghostSamples && params.ghostSamples.length > 4
      ? params.ghostSamples
      : prevMap.bestGhost;

  const next: StoredSkiProgress = {
    ...cur,
    records: {
      ...cur.records,
      [params.mapId]: {
        bestScore: Math.max(prevMap.bestScore, params.score),
        bestDistanceMeters: Math.max(
          prevMap.bestDistanceMeters ?? 0,
          params.distanceMeters ?? 0
        ),
        bestTrickName: beatTrick ? params.bestTrickName : prevMap.bestTrickName,
        bestTrickPoints: Math.max(prevMap.bestTrickPoints, params.bestTrickPoints),
        runsCompleted: prevMap.runsCompleted + (params.completed ? 1 : 0),
        bestMedal,
        bestGhost: nextGhost,
        completedObjectives: mergedObjectives,
      },
    },
  };

  safeWriteJson(SKI_PROGRESS_KEY, next);
  return { progress: next, isNewBest, newlyCompletedObjectives };
}


