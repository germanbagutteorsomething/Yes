import type { EloHistoryPoint, StoredChessElo } from '../types/chess';

export const DEFAULT_CHESS_ELO = 1000;
export const MIN_CHESS_ELO = 100;

export function getChessRankTitle(rating: number): string {
  if (rating >= 2300) return 'Grandmaster';
  if (rating >= 2000) return 'Master';
  if (rating >= 1700) return 'Candidate';
  if (rating >= 1400) return 'Tournament';
  if (rating >= 1100) return 'Club';
  if (rating >= 850) return 'Casual';
  return 'Novice';
}

export function getEloKFactor(rating: number, gamesRated: number): number {
  if (gamesRated < 15) return 32;
  if (rating >= 2000) return 16;
  return 24;
}

export function calculateEloUpdate(params: {
  playerRating: number;
  opponentRating: number;
  score: 1 | 0.5 | 0;
  gamesRated: number;
}): { nextRating: number; delta: number } {
  const { playerRating, opponentRating, score, gamesRated } = params;
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const k = getEloKFactor(playerRating, gamesRated);
  const rawDelta = Math.round(k * (score - expected));
  const nextRating = Math.max(MIN_CHESS_ELO, playerRating + rawDelta);
  return {
    nextRating,
    delta: nextRating - playerRating,
  };
}

export function createInitialChessElo(): StoredChessElo {
  return {
    rating: DEFAULT_CHESS_ELO,
    peakRating: DEFAULT_CHESS_ELO,
    gamesRated: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    history: [] as EloHistoryPoint[],
  };
}
