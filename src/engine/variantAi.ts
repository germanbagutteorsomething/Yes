import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import type {
  CrazyhousePocket,
  CrazyhouseSetupMode,
  DroppablePiece,
  GameVariant,
  MoveRecord,
  PlayerColor,
  PromotionPiece,
  StockfishLevelConfig,
} from '../types/chess';
import {
  computeCrazyhouseState,
  DROPPABLE_PIECES,
  executeCrazyhouseDropOnChess,
  formatCrazyhouseDropLan,
  getAllCrazyhouseDropMoves,
} from '../utils/crazyhouse';
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

const CRAZY_BOARD_VAL: Record<PieceSymbol, number> = {
  p: 100,
  n: 330,
  b: 345,
  r: 500,
  q: 920,
  k: 0,
};

const CRAZY_POCKET_VAL: Record<DroppablePiece, number> = {
  p: 115,
  n: 365,
  b: 375,
  r: 530,
  q: 980,
};

function evaluateCrazyhouseBoard(
  chess: Chess,
  pockets: { w: CrazyhousePocket; b: CrazyhousePocket },
  perspective: PlayerColor
): number {
  let score = 0;
  const opp: PlayerColor = perspective === 'w' ? 'b' : 'w';
  const oppKingSq = findKingSquare(chess, opp);
  const myKingSq = findKingSquare(chess, perspective);
  const oppKingF = oppKingSq ? oppKingSq.charCodeAt(0) - 97 : 4;
  const oppKingR = oppKingSq ? Number(oppKingSq[1]) - 1 : 7;

  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell || cell.type === 'k') continue;
      const rankFromWhite = 7 - r;
      const centerBonus =
        (f >= 2 && f <= 5 && rankFromWhite >= 2 && rankFromWhite <= 5 ? 24 : 0) +
        (f >= 3 && f <= 4 && rankFromWhite >= 3 && rankFromWhite <= 4 ? 18 : 0);
      const distToOppKing = Math.max(Math.abs(f - oppKingF), Math.abs(rankFromWhite - oppKingR));
      const kingPressure = cell.color === perspective && distToOppKing <= 2 ? 22 : 0;

      const pawnAdvance =
        cell.type === 'p'
          ? (cell.color === 'w' ? rankFromWhite : 7 - rankFromWhite) * 10
          : 0;

      const pieceVal = CRAZY_BOARD_VAL[cell.type] + centerBonus + kingPressure + pawnAdvance;
      score += cell.color === perspective ? pieceVal : -pieceVal;
    }
  }

  for (const p of DROPPABLE_PIECES) {
    score += (pockets[perspective][p] ?? 0) * CRAZY_POCKET_VAL[p];
    score -= (pockets[opp][p] ?? 0) * CRAZY_POCKET_VAL[p];
  }

  if (chess.isCheck()) {
    score += chess.turn() === opp ? 55 : -55;
  }

  if (myKingSq) {
    // Encourage king safety on castled edge files
    const kf = myKingSq.charCodeAt(0) - 97;
    if (kf <= 2 || kf >= 6) score += 18;
  }

  return score;
}

export function pickCrazyhouseMove(
  fen: string,
  moves: MoveRecord[],
  skillLevel: number,
  startFen?: string,
  crazyhouseSetup: CrazyhouseSetupMode = 'classic',
  botStyle?: 'random' | 'greedy' | 'aggressive' | 'solid' | 'blitz'
): EngineBestMove {
  const chess = new Chess();
  chess.load(fen, { skipValidation: true });
  const mover = chess.turn();
  const opp: PlayerColor = mover === 'w' ? 'b' : 'w';

  const chState = computeCrazyhouseState(
    startFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves,
    crazyhouseSetup
  );
  const myPocket = { ...chState[mover] };
  const oppPocket = { ...chState[opp] };

  const boardMoves = chess.moves({ verbose: true });
  const dropMoves = getAllCrazyhouseDropMoves(chess, myPocket);

  type CandidateAction =
    | { kind: 'move'; move: Move; engine: EngineBestMove; quickScore: number }
    | { kind: 'drop'; piece: DroppablePiece; to: Square; engine: EngineBestMove; quickScore: number };

  const actions: CandidateAction[] = [];

  for (const m of boardMoves) {
    let quick = 0;
    if (m.captured) quick += CRAZY_BOARD_VAL[m.captured] * 1.45;
    if (m.promotion) quick += CRAZY_BOARD_VAL[m.promotion] - 100;
    if (m.san.includes('#')) {
      return moveToEngineBest(m);
    }
    if (m.san.includes('+')) quick += botStyle === 'aggressive' ? 140 : 80;
    if (m.isKingsideCastle() || m.isQueensideCastle()) quick += 70;
    actions.push({
      kind: 'move',
      move: m,
      engine: moveToEngineBest(m),
      quickScore: quick,
    });
  }

  for (const d of dropMoves) {
    let quick = CRAZY_POCKET_VAL[d.piece] * 0.08;
    const f = d.to.charCodeAt(0) - 97;
    const r = Number(d.to[1]) - 1;
    if (f >= 2 && f <= 5 && r >= 2 && r <= 5) quick += 36;
    if (d.piece === 'p' && ((mover === 'w' && r >= 5) || (mover === 'b' && r <= 2))) {
      quick += 48;
    }
    actions.push({
      kind: 'drop',
      piece: d.piece,
      to: d.to,
      engine: {
        from: `@${d.piece}`,
        to: d.to,
        dropPiece: d.piece,
      },
      quickScore: quick,
    });
  }

  if (actions.length === 0) {
    throw new Error('No legal Crazyhouse moves or drops available.');
  }

  if (botStyle === 'random') {
    return actions[Math.floor(Math.random() * actions.length)].engine;
  }

  // Prune drop list to strongest positional/tactical candidates for crisp <25ms latency
  actions.sort((a, b) => b.quickScore - a.quickScore);
  const maxEvalCount = skillLevel >= 12 ? 42 : 28;

  const evaluated: { engine: EngineBestMove; score: number }[] = [];

  for (const act of actions.slice(0, maxEvalCount)) {
    const sim = new Chess();
    sim.load(fen, { skipValidation: true });
    const simMyPocket = { ...myPocket };
    const simOppPocket = { ...oppPocket };

    if (act.kind === 'move') {
      const ex = sim.move({
        from: act.move.from,
        to: act.move.to,
        promotion: act.move.promotion,
      });
      if (ex.captured) {
        const capType = (chState.promotedSquares.has(ex.to) ? 'p' : ex.captured) as DroppablePiece;
        simMyPocket[capType] += 1;
      }
      if (sim.isCheckmate()) {
        return act.engine;
      }
    } else {
      simMyPocket[act.piece] -= 1;
      const dropRes = executeCrazyhouseDropOnChess(sim, act.piece, act.to, simOppPocket);
      if (!dropRes) continue;
      if (dropRes.isCheckmate) {
        return act.engine;
      }
    }

    const simPockets = mover === 'w' ? { w: simMyPocket, b: simOppPocket } : { w: simOppPocket, b: simMyPocket };
    let score = evaluateCrazyhouseBoard(sim, simPockets, mover);

    if (botStyle === 'greedy' && act.kind === 'move' && act.move.captured) {
      score += 110;
    } else if (botStyle === 'aggressive' && sim.isCheck()) {
      score += 95;
    } else if (botStyle === 'solid' && act.kind === 'move' && (act.move.isKingsideCastle() || act.move.isQueensideCastle())) {
      score += 90;
    }

    // Check immediate opponent captures & drop-checkmate threats for higher skills
    if (skillLevel >= 4) {
      const oppBoardMoves = sim.moves({ verbose: true });
      let maxThreatLoss = 0;
      for (const om of oppBoardMoves) {
        if (om.san.includes('#')) {
          score -= 32000;
          break;
        }
        if (om.captured) {
          const loss = CRAZY_BOARD_VAL[om.captured] * 0.92;
          if (loss > maxThreatLoss) maxThreatLoss = loss;
        }
      }
      // Also test high-value opponent drops giving checkmate
      if (skillLevel >= 8) {
        const oppDrops = getAllCrazyhouseDropMoves(sim, simOppPocket);
        for (const od of oppDrops.slice(0, 16)) {
          if (od.piece !== 'q' && od.piece !== 'n' && od.piece !== 'r') continue;
          const sim2 = new Chess();
          sim2.load(sim.fen(), { skipValidation: true });
          const nextOppP = { ...simOppPocket, [od.piece]: simOppPocket[od.piece] - 1 };
          const dr2 = executeCrazyhouseDropOnChess(sim2, od.piece, od.to, simMyPocket);
          if (dr2?.isCheckmate) {
            score -= 32000;
            break;
          }
          void nextOppP;
        }
      }
      score -= maxThreatLoss * (skillLevel >= 10 ? 0.88 : 0.6);
    }

    if (skillLevel <= 5) {
      score += (Math.random() - 0.5) * (6 - skillLevel) * 55;
    }

    evaluated.push({ engine: act.engine, score });
  }

  // Fallback if all drops filtered
  if (evaluated.length === 0) {
    return actions[0].engine;
  }

  evaluated.sort((a, b) => b.score - a.score);
  return evaluated[0].engine;
}

export async function getVariantEngineMove(
  variant: GameVariant,
  fen: string,
  lanHistory: string[],
  levelConfig: Pick<StockfishLevelConfig, 'skillLevel' | 'depth' | 'movetime'>,
  moves: MoveRecord[],
  signal?: AbortSignal,
  startFen?: string,
  crazyhouseSetup: CrazyhouseSetupMode = 'classic'
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
  if (variant === 'crazyhouse') {
    await new Promise((r) => setTimeout(r, 220));
    if (signal?.aborted) throw new Error('Search cancelled');
    return pickCrazyhouseMove(fen, moves, levelConfig.skillLevel, startFen, crazyhouseSetup);
  }
  return stockfishService.getBestMove(lanHistory, levelConfig, signal, startFen);
}

export async function getVariantHintMove(
  variant: GameVariant,
  fen: string,
  lanHistory: string[],
  moves: MoveRecord[],
  startFen?: string,
  signal?: AbortSignal,
  crazyhouseSetup: CrazyhouseSetupMode = 'classic'
): Promise<EngineBestMove> {
  if (
    variant === 'king-of-the-hill' ||
    variant === 'three-check' ||
    variant === 'racing-kings' ||
    variant === 'crazyhouse'
  ) {
    return getVariantEngineMove(
      variant,
      fen,
      lanHistory,
      { skillLevel: 20, depth: 12, movetime: 320 },
      moves,
      signal,
      startFen,
      crazyhouseSetup
    );
  }
  return stockfishService.getHintMove(lanHistory, startFen, signal);
}

export { formatCrazyhouseDropLan };
