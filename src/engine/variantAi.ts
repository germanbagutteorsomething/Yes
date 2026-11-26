import { Chess, type Move, type PieceSymbol } from 'chess.js';
import type {
  GameVariant,
  MoveRecord,
  PlayerColor,
  PromotionPiece,
  StockfishLevelConfig,
} from '../types/chess';
import {
  findKingSquare,
  getThreeCheckCounts,
  getVariantLegalMoves,
  HILL_SQUARES,
} from '../utils/variants';
import {
  stockfishService,
  type CandidateMove,
  type EngineBestMove,
} from './stockfishService';

const PIECE_CP: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

function moveToEngineBest(move: Move): EngineBestMove {
  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion as PromotionPiece | undefined,
  };
}

function candidateEffectiveCp(c: CandidateMove): number {
  if (c.mate !== null) {
    const sign = c.mate >= 0 ? 1 : -1;
    return sign * (10000 - Math.min(Math.abs(c.mate), 99) * 10);
  }
  return c.cp;
}

function kingDistanceToHill(sq: string | null): number {
  if (!sq) return 6;
  const f = sq.charCodeAt(0) - 97; // 0..7
  const r = Number(sq[1]) - 1; // 0..7
  // Hill squares are f in {3,4}, r in {3,4}
  const df = f < 3 ? 3 - f : f > 4 ? f - 4 : 0;
  const dr = r < 3 ? 3 - r : r > 4 ? r - 4 : 0;
  return Math.max(df, dr);
}

async function pickKingOfTheHillMove(
  fen: string,
  lanHistory: string[],
  levelConfig: Pick<StockfishLevelConfig, 'skillLevel' | 'depth' | 'movetime'>,
  signal?: AbortSignal,
  startFen?: string
): Promise<EngineBestMove> {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  const instantWin = legal.find((m) => m.piece === 'k' && HILL_SQUARES.has(m.to));
  if (instantWin) {
    return moveToEngineBest(instantWin);
  }

  const candidates = await stockfishService.getTopCandidates(
    lanHistory,
    {
      skillLevel: levelConfig.skillLevel,
      depth: levelConfig.depth,
      movetime: levelConfig.movetime,
      multiPv: 5,
      startFen,
    },
    signal
  );

  const mover = chess.turn();
  const baseKingDist = kingDistanceToHill(findKingSquare(chess, mover));

  let bestMove = candidates[0];
  let bestAdj = -Infinity;

  for (const cand of candidates) {
    const sim = new Chess(fen);
    try {
      const parsed = stockfishService.parseUciMove(cand.uci);
      const executed = sim.move({
        from: parsed.from,
        to: parsed.to,
        promotion: parsed.promotion,
      });

      let score = candidateEffectiveCp(cand);

      if (sim.isCheckmate()) {
        return parsed;
      }

      // Check if opponent has an immediate Hill win next turn
      const oppMoves = sim.moves({ verbose: true });
      if (oppMoves.some((om) => om.piece === 'k' && HILL_SQUARES.has(om.to))) {
        score -= 30000;
      }

      // Reward advancing King toward the Hill when safe
      const newDist = kingDistanceToHill(findKingSquare(sim, mover));
      if (newDist < baseKingDist) {
        score += (baseKingDist - newDist) * 32;
      }
      if (HILL_SQUARES.has(executed.to)) {
        score += 24;
      }

      // Subtle skill noise at low levels
      if (levelConfig.skillLevel <= 3) {
        score += (Math.random() - 0.5) * (4 - levelConfig.skillLevel) * 28;
      }

      if (score > bestAdj) {
        bestAdj = score;
        bestMove = cand;
      }
    } catch {
      // ignore unparseable candidate
    }
  }

  return stockfishService.parseUciMove(bestMove.uci);
}

async function pickThreeCheckMove(
  fen: string,
  lanHistory: string[],
  moves: MoveRecord[],
  levelConfig: Pick<StockfishLevelConfig, 'skillLevel' | 'depth' | 'movetime'>,
  signal?: AbortSignal,
  startFen?: string
): Promise<EngineBestMove> {
  const chess = new Chess(fen);
  const mover = chess.turn();
  const opp: PlayerColor = mover === 'w' ? 'b' : 'w';
  const counts = getThreeCheckCounts(moves);
  const myChecks = counts[mover];
  const oppChecks = counts[opp];

  const legal = chess.moves({ verbose: true });
  if (myChecks >= 2) {
    const thirdCheck = legal.find((m) => m.san.includes('+') || m.san.includes('#'));
    if (thirdCheck) {
      return moveToEngineBest(thirdCheck);
    }
  }

  const candidates = await stockfishService.getTopCandidates(
    lanHistory,
    {
      skillLevel: levelConfig.skillLevel,
      depth: levelConfig.depth,
      movetime: levelConfig.movetime,
      multiPv: 5,
      startFen,
    },
    signal
  );

  let bestMove = candidates[0];
  let bestAdj = -Infinity;

  for (const cand of candidates) {
    const sim = new Chess(fen);
    try {
      const parsed = stockfishService.parseUciMove(cand.uci);
      const executed = sim.move({
        from: parsed.from,
        to: parsed.to,
        promotion: parsed.promotion,
      });

      let score = candidateEffectiveCp(cand);

      if (sim.isCheckmate()) {
        return parsed;
      }

      if (executed.san.includes('+')) {
        score += myChecks === 1 ? 360 : 165;
      }

      const oppMoves = sim.moves({ verbose: true });
      const oppHasCheck = oppMoves.some((om) => om.san.includes('+') || om.san.includes('#'));
      if (oppHasCheck) {
        if (oppChecks >= 2) score -= 30000;
        else if (oppChecks === 1) score -= 125;
        else score -= 40;
      }

      if (levelConfig.skillLevel <= 3) {
        score += (Math.random() - 0.5) * (4 - levelConfig.skillLevel) * 28;
      }

      if (score > bestAdj) {
        bestAdj = score;
        bestMove = cand;
      }
    } catch {
      // ignore
    }
  }

  return stockfishService.parseUciMove(bestMove.uci);
}

const RACING_RANK_SCORE = [0, 0, 25, 75, 160, 290, 500, 840, 25000];

function evaluateRacingKingsPosition(chess: Chess, perspective: PlayerColor): number {
  const opp: PlayerColor = perspective === 'w' ? 'b' : 'w';
  const myKing = findKingSquare(chess, perspective);
  const oppKing = findKingSquare(chess, opp);

  const myRank = myKing ? Number(myKing[1]) : 1;
  const oppRank = oppKing ? Number(oppKing[1]) : 1;

  let score = RACING_RANK_SCORE[myRank] - RACING_RANK_SCORE[oppRank];

  // Material advantage helps clear lanes and block opponent's king
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.type === 'k') continue;
      const val = PIECE_CP[cell.type] * 0.45;
      score += cell.color === perspective ? val : -val;
    }
  }

  return score;
}

export function pickRacingKingsMove(
  fen: string,
  skillLevel: number
): EngineBestMove {
  const chess = new Chess(fen);
  const mover = chess.turn();
  const opp: PlayerColor = mover === 'w' ? 'b' : 'w';
  const legal = getVariantLegalMoves(chess, 'racing-kings');

  if (legal.length === 0) {
    throw new Error('No legal Racing Kings moves available.');
  }

  // 1. Check immediate rank 8 victory
  const winningRank8Moves = legal.filter((m) => m.piece === 'k' && m.to[1] === '8');
  if (winningRank8Moves.length > 0) {
    if (mover === 'b') {
      return moveToEngineBest(winningRank8Moves[0]);
    }
    // White: prefer a move where Black cannot immediately reach rank 8 to tie
    for (const wm of winningRank8Moves) {
      const sim = new Chess(fen);
      sim.move(wm);
      const blackReplies = getVariantLegalMoves(sim, 'racing-kings');
      const blackCanTie = blackReplies.some((bm) => bm.piece === 'k' && bm.to[1] === '8');
      if (!blackCanTie) {
        return moveToEngineBest(wm);
      }
    }
    return moveToEngineBest(winningRank8Moves[0]);
  }

  // 2. 2-ply minimax search over non-checking moves
  const scored: { move: Move; score: number }[] = [];

  for (const m of legal) {
    const sim = new Chess(fen);
    sim.move(m);

    const oppMoves = getVariantLegalMoves(sim, 'racing-kings');
    if (oppMoves.length === 0) {
      // Stalemate is a draw (0)
      scored.push({ move: m, score: 0 });
      continue;
    }

    // Immediate opponent rank-8 win check
    const oppWinsImmediately = oppMoves.some((om) => om.piece === 'k' && om.to[1] === '8');
    if (oppWinsImmediately) {
      scored.push({ move: m, score: -24000 });
      continue;
    }

    // Evaluate worst-case opponent reply (2-ply)
    let worstForMover = Infinity;
    // Sample top promising opponent replies if branching is huge to stay < 15ms
    const prioritizedOpp =
      oppMoves.length > 26
        ? [...oppMoves]
            .sort((a, b) => {
              const aPri = (a.piece === 'k' ? 100 : 0) + (a.captured ? 50 : 0) + Number(a.to[1]) * 4;
              const bPri = (b.piece === 'k' ? 100 : 0) + (b.captured ? 50 : 0) + Number(b.to[1]) * 4;
              return bPri - aPri;
            })
            .slice(0, 22)
        : oppMoves;

    for (const reply of prioritizedOpp) {
      const sim2 = new Chess(sim.fen());
      sim2.move(reply);
      const eval2 = evaluateRacingKingsPosition(sim2, mover);
      if (eval2 < worstForMover) {
        worstForMover = eval2;
      }
    }

    // Small bonus for active King moves & captures
    let tieBreaker = 0;
    if (m.piece === 'k') {
      tieBreaker += (Number(m.to[1]) - Number(m.from[1])) * 14;
    }
    if (m.captured) {
      tieBreaker += PIECE_CP[m.captured] * 0.08;
    }
    // Discourage leaving opp king closer than ours
    const oppKingSq = findKingSquare(sim, opp);
    if (oppKingSq && Number(oppKingSq[1]) === 7) {
      tieBreaker -= 25;
    }

    scored.push({ move: m, score: worstForMover + tieBreaker });
  }

  scored.sort((a, b) => b.score - a.score);

  if (skillLevel <= 4 && scored.length > 1) {
    const windowSize = skillLevel <= 1 ? Math.min(4, scored.length) : Math.min(2, scored.length);
    const pool = scored.slice(0, windowSize).filter((s) => s.score > -10000);
    if (pool.length > 0) {
      return moveToEngineBest(pool[Math.floor(Math.random() * pool.length)].move);
    }
  }

  return moveToEngineBest(scored[0].move);
}

export async function getVariantEngineMove(
  variant: GameVariant,
  fen: string,
  lanHistory: string[],
  levelConfig: Pick<StockfishLevelConfig, 'skillLevel' | 'depth' | 'movetime'>,
  moves: MoveRecord[],
  signal?: AbortSignal,
  startFen?: string
): Promise<EngineBestMove> {
  if (variant === 'king-of-the-hill') {
    return pickKingOfTheHillMove(fen, lanHistory, levelConfig, signal, startFen);
  }
  if (variant === 'three-check') {
    return pickThreeCheckMove(fen, lanHistory, moves, levelConfig, signal, startFen);
  }
  if (variant === 'racing-kings') {
    await new Promise((r) => setTimeout(r, 240));
    if (signal?.aborted) throw new Error('Search cancelled');
    return pickRacingKingsMove(fen, levelConfig.skillLevel);
  }
  return stockfishService.getBestMove(lanHistory, levelConfig, signal, startFen);
}

export async function getVariantHintMove(
  variant: GameVariant,
  fen: string,
  lanHistory: string[],
  moves: MoveRecord[],
  startFen?: string,
  signal?: AbortSignal
): Promise<EngineBestMove> {
  if (variant === 'king-of-the-hill' || variant === 'three-check' || variant === 'racing-kings') {
    return getVariantEngineMove(
      variant,
      fen,
      lanHistory,
      { skillLevel: 20, depth: 12, movetime: 320 },
      moves,
      signal,
      startFen
    );
  }
  return stockfishService.getHintMove(lanHistory, startFen, signal);
}
