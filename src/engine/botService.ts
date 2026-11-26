import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import type {
  BotProfile,
  CrazyhouseSetupMode,
  GameVariant,
  MoveRecord,
  PromotionPiece,
} from '../types/chess';
import { getThreeCheckCounts, getVariantLegalMoves, HILL_SQUARES } from '../utils/variants';
import { stockfishService, type CandidateMove, type EngineBestMove } from './stockfishService';
import { getVariantEngineMove, pickCrazyhouseMove, pickRacingKingsMove } from './variantAi';

const PIECE_CP: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const CENTER_SQUARES = new Set<Square>(['d4', 'e4', 'd5', 'e5']);
const EXTENDED_CENTER = new Set<Square>(['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6']);

const OPENING_BOOKS: Record<string, Record<string, string[]>> = {
  tara: {
    // White attacking systems
    '': ['e2e4', 'd2d4'],
    'e2e4 e7e5': ['f2f4', 'g1f3'], // King's Gambit or Open Game
    'e2e4 e7e5 g1f3 b8c6': ['f1c4'], // Italian
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5': ['b2b4', 'c2c3'], // Evans Gambit
    'e2e4 c7c5': ['g1f3', 'f2f4'], // Open or Grand Prix
    'e2e4 c7c5 g1f3 d7d6': ['d2d4'],
    'e2e4 c7c5 g1f3 b8c6': ['d2d4'],
    // Black aggressive responses
    'e2e4': ['c7c5', 'd7d5', 'e7e5'],
    'd2d4': ['g8f6', 'f7f5', 'c7c5'],
    'd2d4 g8f6 c2c4': ['e7e5', 'c7c5', 'g7g6'],
  },
  sam: {
    // White solid positional systems (London / QGD)
    '': ['d2d4', 'c2c4'],
    'd2d4 d7d5': ['c1f4', 'c2c4', 'g1f3'],
    'd2d4 g8f6': ['g1f3', 'c1f4', 'c2c4'],
    'd2d4 d7d5 c1f4 g8f6': ['e2e3'],
    'd2d4 d7d5 c2c4 e7e6': ['b1c3', 'g1f3'],
    // Black solid defenses (Caro-Kann / French / QGD / Slav)
    'e2e4': ['c7c6', 'e7e6', 'e7e5'],
    'e2e4 c7c6 d2d4': ['d7d5'],
    'e2e4 e7e6 d2d4': ['d7d5'],
    'd2d4': ['d7d5', 'g8f6'],
    'd2d4 c2c4': ['e7e6', 'c7c6'],
  },
  mikhail: {
    // White classical sharp lines
    '': ['e2e4'],
    'e2e4 e7e5': ['g1f3'],
    'e2e4 e7e5 g1f3 b8c6': ['f1b5', 'f1c4'],
    'e2e4 c7c5': ['g1f3'],
    'e2e4 c7c5 g1f3 d7d6': ['d2d4'],
    // Black dynamic counterattacking systems (Sicilian / King's Indian)
    'e2e4': ['c7c5', 'e7e5'],
    'e2e4 c7c5 g1f3': ['d7d6', 'b8c6'],
    'd2d4': ['g8f6'],
    'd2d4 c2c4': ['g7g6'],
    'd2d4 g8f6 c2c4': ['g7g6', 'e7e6'],
  },
};

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Search cancelled'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new Error('Search cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function toEngineMove(move: Move): EngineBestMove {
  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion as PromotionPiece | undefined,
  };
}

function tryBookMove(
  chess: Chess,
  lanHistory: string[],
  botId: string
): EngineBestMove | null {
  if (lanHistory.length > 6) return null;
  const book = OPENING_BOOKS[botId];
  if (!book) return null;

  const key = lanHistory.join(' ');
  const options = book[key];
  if (!options || options.length === 0) return null;

  const legalMoves = chess.moves({ verbose: true });
  const legalOptions = options
    .map((uci) => legalMoves.find((m) => m.lan === uci))
    .filter((m): m is Move => Boolean(m));

  if (legalOptions.length === 0) return null;
  const picked = legalOptions[Math.floor(Math.random() * legalOptions.length)];
  return toEngineMove(picked);
}

function pickRandomMove(chess: Chess): EngineBestMove {
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) {
    throw new Error('No legal moves available.');
  }
  const activeMoves = legalMoves.filter((m) => m.isCapture() || chess.inCheck() || m.san.includes('+'));
  if (activeMoves.length > 0 && Math.random() < 0.28) {
    return toEngineMove(activeMoves[Math.floor(Math.random() * activeMoves.length)]);
  }
  return toEngineMove(legalMoves[Math.floor(Math.random() * legalMoves.length)]);
}

function evaluateMaterialBalance(chess: Chess, perspective: 'w' | 'b'): number {
  let score = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const val = PIECE_CP[cell.type];
      score += cell.color === perspective ? val : -val;
    }
  }
  return score;
}

function pickGreedyMove(chess: Chess): EngineBestMove {
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) {
    throw new Error('No legal moves available.');
  }

  const mover = chess.turn();
  const scored: { move: Move; score: number }[] = [];

  for (const move of legalMoves) {
    const sim = new Chess(chess.fen());
    const executed = sim.move(move);

    if (sim.isCheckmate()) {
      return toEngineMove(move);
    }

    let score = evaluateMaterialBalance(sim, mover);

    // Avoid walking into an immediate forced stalemate when way ahead
    if (sim.isStalemate() || sim.isThreefoldRepetition()) {
      score -= 120;
    }

    // Immediate opponent counter-capture estimate (1-ply quiescence)
    const oppReplies = sim.moves({ verbose: true });
    let worstCaptureLoss = 0;
    for (const reply of oppReplies) {
      if (reply.captured) {
        const gain = PIECE_CP[reply.captured];
        if (gain > worstCaptureLoss) {
          worstCaptureLoss = gain;
        }
      }
      if (reply.san.endsWith('#')) {
        score -= 50000;
      }
    }
    score -= worstCaptureLoss * 0.75;

    // Greedy bonuses: captures, checks, promotions, center control
    if (executed.captured) {
      score += PIECE_CP[executed.captured] * 0.2 + 20;
    }
    if (sim.isCheck()) {
      score += 35;
    }
    if (executed.promotion) {
      score += PIECE_CP[executed.promotion] * 0.5;
    }
    if (CENTER_SQUARES.has(executed.to)) {
      score += 18;
    } else if (EXTENDED_CENTER.has(executed.to)) {
      score += 8;
    }
    if (executed.isKingsideCastle() || executed.isQueensideCastle()) {
      score += 30;
    }

    scored.push({ move, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const topScore = scored[0].score;
  const nearBest = scored.filter((item) => topScore - item.score <= 22);
  const chosen = nearBest[Math.floor(Math.random() * nearBest.length)];
  return toEngineMove(chosen.move);
}

function candidateEffectiveCp(c: CandidateMove): number {
  if (c.mate !== null) {
    const sign = c.mate >= 0 ? 1 : -1;
    return sign * (10000 - Math.min(Math.abs(c.mate), 99) * 10);
  }
  return c.cp;
}

function selectAggressiveCandidate(
  chess: Chess,
  candidates: CandidateMove[]
): EngineBestMove {
  const best = candidates[0];
  const bestScore = candidateEffectiveCp(best);
  const legalMoves = chess.moves({ verbose: true });

  for (const cand of candidates) {
    const score = candidateEffectiveCp(cand);
    if (bestScore - score > 45) continue;
    // Never pick a blunder into mate if #1 avoids mate
    if (cand.mate !== null && cand.mate < 0 && !(best.mate !== null && best.mate < 0)) {
      continue;
    }
    const moveObj = legalMoves.find((m) => m.lan === cand.uci);
    if (!moveObj) continue;
    if (moveObj.isCapture() || moveObj.promotion || moveObj.san.includes('+')) {
      return stockfishService.parseUciMove(cand.uci);
    }
  }

  return stockfishService.parseUciMove(best.uci);
}

function selectSolidCandidate(
  chess: Chess,
  candidates: CandidateMove[]
): EngineBestMove {
  const best = candidates[0];
  const bestScore = candidateEffectiveCp(best);
  const legalMoves = chess.moves({ verbose: true });

  for (const cand of candidates) {
    const score = candidateEffectiveCp(cand);
    if (bestScore - score > 22) continue;
    if (cand.mate !== null && cand.mate < 0 && !(best.mate !== null && best.mate < 0)) {
      continue;
    }
    const moveObj = legalMoves.find((m) => m.lan === cand.uci);
    if (!moveObj) continue;
    if (
      moveObj.isKingsideCastle() ||
      moveObj.isQueensideCastle() ||
      (!moveObj.isCapture() && moveObj.piece !== 'q')
    ) {
      return stockfishService.parseUciMove(cand.uci);
    }
  }

  return stockfishService.parseUciMove(best.uci);
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export async function getBotMove(
  fen: string,
  lanHistory: string[],
  bot: BotProfile,
  signal?: AbortSignal,
  startFen?: string,
  variant: GameVariant = 'standard',
  moves: MoveRecord[] = [],
  crazyhouseSetup: CrazyhouseSetupMode = 'classic'
): Promise<EngineBestMove> {
  const startedAt = performance.now();
  const chess = new Chess(fen);
  const isStandardStart = !startFen || startFen === INITIAL_FEN;

  let chosenMove: EngineBestMove | null = null;

  if (variant === 'crazyhouse') {
    chosenMove = pickCrazyhouseMove(
      fen,
      moves,
      bot.skillLevel,
      startFen,
      crazyhouseSetup,
      bot.style
    );
  } else if (variant === 'racing-kings') {
    if (bot.style === 'random') {
      const legal = getVariantLegalMoves(chess, 'racing-kings');
      if (legal.length === 0) throw new Error('No legal Racing Kings moves available.');
      chosenMove = toEngineMove(legal[Math.floor(Math.random() * legal.length)]);
    } else {
      chosenMove = pickRacingKingsMove(fen, bot.skillLevel);
    }
  } else if (variant === 'king-of-the-hill' || variant === 'three-check') {
    if (bot.style === 'random') {
      chosenMove = pickRandomMove(chess);
    } else if (bot.style === 'greedy') {
      const legal = chess.moves({ verbose: true });
      if (variant === 'king-of-the-hill') {
        const hillWin = legal.find((m) => m.piece === 'k' && HILL_SQUARES.has(m.to));
        if (hillWin) chosenMove = toEngineMove(hillWin);
      } else {
        const myChecks = getThreeCheckCounts(moves)[chess.turn()];
        if (myChecks >= 2) {
          const checkWin = legal.find((m) => m.san.includes('+') || m.san.includes('#'));
          if (checkWin) chosenMove = toEngineMove(checkWin);
        }
      }
      if (!chosenMove) chosenMove = pickGreedyMove(chess);
    } else {
      chosenMove = await getVariantEngineMove(
        variant,
        fen,
        lanHistory,
        { skillLevel: bot.skillLevel, depth: bot.depth, movetime: bot.movetime },
        moves,
        signal,
        startFen
      );
    }
  } else if (bot.style === 'random') {
    chosenMove = pickRandomMove(chess);
  } else if (bot.style === 'greedy') {
    chosenMove = pickGreedyMove(chess);
  } else {
    // Check opening book only from standard initial position
    const useBookChance = bot.id === 'sam' ? 0.8 : 0.75;
    if (isStandardStart && variant === 'standard' && Math.random() < useBookChance) {
      chosenMove = tryBookMove(chess, lanHistory, bot.id);
    }

    if (!chosenMove) {
      if (bot.style === 'aggressive') {
        const candidates = await stockfishService.getTopCandidates(
          lanHistory,
          {
            skillLevel: bot.skillLevel,
            depth: bot.depth,
            movetime: bot.movetime,
            multiPv: 3,
            startFen,
          },
          signal
        );
        chosenMove = selectAggressiveCandidate(chess, candidates);
      } else if (bot.style === 'solid') {
        const candidates = await stockfishService.getTopCandidates(
          lanHistory,
          {
            skillLevel: bot.skillLevel,
            depth: bot.depth,
            movetime: bot.movetime,
            multiPv: 3,
            startFen,
          },
          signal
        );
        chosenMove = selectSolidCandidate(chess, candidates);
      } else {
        chosenMove = await stockfishService.getBestMove(lanHistory, bot, signal, startFen);
      }
    }
  }

  const elapsed = performance.now() - startedAt;
  if (elapsed < bot.minDelayMs) {
    await abortableDelay(bot.minDelayMs - elapsed, signal);
  }

  if (signal?.aborted) {
    throw new Error('Search cancelled');
  }

  return chosenMove;
}
