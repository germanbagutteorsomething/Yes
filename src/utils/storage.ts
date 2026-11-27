import type {
  BoardTheme,
  BotId,
  PieceSet,
  SavedMatch,
  StockfishLevelNumber,
  StoredChessElo,
} from '../types/chess';
import type { SkiGhostSample, SkiMapId, StoredSkiProgress } from '../types/ski';
import type { StoredHeistProgress } from '../types/heist';
import { calculateEloUpdate, createInitialChessElo, DEFAULT_CHESS_ELO } from './elo';

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
  skiLegacyPhysics?: boolean;
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
  const raw = safeReadJson<Partial<StoredPreferences>>(PREFS_KEY, {});
  return {
    darkMode: raw.darkMode ?? false,
    soundEnabled: raw.soundEnabled ?? true,
    boardTheme: raw.boardTheme ?? 'tournament',
    pieceSet: raw.pieceSet ?? 'classic',
    skiLegacyPhysics: raw.skiLegacyPhysics ?? false,
  };
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
    endlessImmortal: raw.endlessImmortal ?? false,
    altitudeLimitMeters: raw.altitudeLimitMeters ?? 35,
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

export function setSkiEndlessImmortal(endlessImmortal: boolean): StoredSkiProgress {
  const cur = loadSkiProgress();
  const next: StoredSkiProgress = { ...cur, endlessImmortal };
  safeWriteJson(SKI_PROGRESS_KEY, next);
  return next;
}

export function setSkiAltitudeLimit(altitudeLimitMeters: number): StoredSkiProgress {
  const cur = loadSkiProgress();
  const next: StoredSkiProgress = { ...cur, altitudeLimitMeters };
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

const HEIST_PROGRESS_KEY = 'squareeight_heist_progress_v1';

export function loadHeistProgress(): StoredHeistProgress {
  const raw = safeReadJson<Partial<StoredHeistProgress>>(HEIST_PROGRESS_KEY, {});
  return {
    bestScore: raw.bestScore ?? 0,
    bestCash: raw.bestCash ?? 0,
    bestSurvivalSec: raw.bestSurvivalSec ?? 0,
    bestHeists: raw.bestHeists ?? 0,
    bestCopsDown: raw.bestCopsDown ?? 0,
    runsPlayed: raw.runsPlayed ?? 0,
  };
}

export function recordHeistRunResult(params: {
  score: number;
  cash: number;
  survivalSec: number;
  heistsCompleted: number;
  copsDown: number;
}): { progress: StoredHeistProgress; isNewBest: boolean } {
  const prev = loadHeistProgress();
  const isNewBest = params.score > prev.bestScore;
  const next: StoredHeistProgress = {
    bestScore: Math.max(prev.bestScore, params.score),
    bestCash: Math.max(prev.bestCash, params.cash),
    bestSurvivalSec: Math.max(prev.bestSurvivalSec, params.survivalSec),
    bestHeists: Math.max(prev.bestHeists, params.heistsCompleted),
    bestCopsDown: Math.max(prev.bestCopsDown, params.copsDown),
    runsPlayed: prev.runsPlayed + 1,
  };
  safeWriteJson(HEIST_PROGRESS_KEY, next);
  return { progress: next, isNewBest };
}

const CHESS_ELO_KEY = 'squareeight_chess_elo_v1';

export function loadChessElo(): StoredChessElo {
  const base = createInitialChessElo();
  const raw = safeReadJson<Partial<StoredChessElo>>(CHESS_ELO_KEY, {});
  const rating = typeof raw.rating === 'number' && Number.isFinite(raw.rating) ? raw.rating : DEFAULT_CHESS_ELO;
  const peakRating =
    typeof raw.peakRating === 'number' && Number.isFinite(raw.peakRating)
      ? Math.max(rating, raw.peakRating)
      : rating;
  return {
    rating,
    peakRating,
    gamesRated: typeof raw.gamesRated === 'number' ? raw.gamesRated : base.gamesRated,
    wins: typeof raw.wins === 'number' ? raw.wins : base.wins,
    draws: typeof raw.draws === 'number' ? raw.draws : base.draws,
    losses: typeof raw.losses === 'number' ? raw.losses : base.losses,
    history: Array.isArray(raw.history) ? raw.history.slice(0, 30) : [],
  };
}

export function recordChessEloResult(params: {
  opponentRating: number;
  opponentLabel: string;
  outcome: 'win' | 'draw' | 'loss';
}): {
  state: StoredChessElo;
  prevRating: number;
  nextRating: number;
  delta: number;
  opponentRating: number;
} {
  const prev = loadChessElo();
  const score: 1 | 0.5 | 0 = params.outcome === 'win' ? 1 : params.outcome === 'draw' ? 0.5 : 0;
  const { nextRating, delta } = calculateEloUpdate({
    playerRating: prev.rating,
    opponentRating: params.opponentRating,
    score,
    gamesRated: prev.gamesRated,
  });

  const next: StoredChessElo = {
    rating: nextRating,
    peakRating: Math.max(prev.peakRating, nextRating),
    gamesRated: prev.gamesRated + 1,
    wins: prev.wins + (params.outcome === 'win' ? 1 : 0),
    draws: prev.draws + (params.outcome === 'draw' ? 1 : 0),
    losses: prev.losses + (params.outcome === 'loss' ? 1 : 0),
    history: [
      {
        rating: nextRating,
        delta,
        opponentLabel: params.opponentLabel,
        result: params.outcome,
        playedAt: new Date().toISOString(),
      },
      ...prev.history,
    ].slice(0, 30),
  };

  safeWriteJson(CHESS_ELO_KEY, next);
  return {
    state: next,
    prevRating: prev.rating,
    nextRating,
    delta,
    opponentRating: params.opponentRating,
  };
}
