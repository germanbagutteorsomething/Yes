import { Chess, type Square } from 'chess.js';
import type {
  CrazyhousePocket,
  CrazyhouseSetupMode,
  DroppablePiece,
  MoveRecord,
  PlayerColor,
} from '../types/chess';

export const DROPPABLE_PIECES: DroppablePiece[] = ['q', 'r', 'b', 'n', 'p'];

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export function createEmptyPocket(): CrazyhousePocket {
  return { q: 0, r: 0, b: 0, n: 0, p: 0 };
}

export function createInitialCrazyhousePockets(
  setupMode: CrazyhouseSetupMode = 'classic'
): { w: CrazyhousePocket; b: CrazyhousePocket } {
  if (setupMode === 'starter') {
    return {
      w: { q: 0, r: 0, b: 1, n: 1, p: 1 },
      b: { q: 0, r: 0, b: 1, n: 1, p: 1 },
    };
  }
  return {
    w: createEmptyPocket(),
    b: createEmptyPocket(),
  };
}

export function parseCrazyhouseDropNotation(
  input: string
): { piece: DroppablePiece; to: Square } | null {
  const cleaned = input.trim().replace(/[+#!?]+$/g, '');
  const match = cleaned.match(/^([pnbrq])@([a-h][1-8])$/i);
  if (!match) return null;
  return {
    piece: match[1].toLowerCase() as DroppablePiece,
    to: match[2].toLowerCase() as Square,
  };
}

export function formatCrazyhouseDropSan(
  piece: DroppablePiece,
  to: Square,
  isCheck = false,
  isCheckmate = false
): string {
  const prefix = piece === 'p' ? 'P' : piece.toUpperCase();
  const suffix = isCheckmate ? '#' : isCheck ? '+' : '';
  return `${prefix}@${to}${suffix}`;
}

export function formatCrazyhouseDropLan(piece: DroppablePiece, to: Square): string {
  return `${piece.toLowerCase()}@${to}`;
}

function findKingSquareFast(chess: Chess, color: PlayerColor): Square | null {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell.type === 'k' && cell.color === color) {
        return cell.square;
      }
    }
  }
  return null;
}

function buildNextFenAfterDrop(currentFen: string, turn: PlayerColor, piece: DroppablePiece): string {
  const parts = currentFen.split(' ');
  const nextTurn: PlayerColor = turn === 'w' ? 'b' : 'w';
  const nextHalfmove = piece === 'p' ? 0 : Number(parts[4] || '0') + 1;
  const nextFullmove = Number(parts[5] || '1') + (turn === 'b' ? 1 : 0);
  return `${parts[0]} ${nextTurn} ${parts[2] || '-'} - ${nextHalfmove} ${nextFullmove}`;
}

/**
 * Returns all legal destination squares where `color` can drop `piece` in Crazyhouse.
 * - Target square must be empty.
 * - Pawns may not be dropped on rank 1 or 8.
 * - The drop must not leave `color`'s own king in check (and therefore can block checks).
 */
export function getCrazyhouseLegalDropSquares(
  chess: Chess,
  color: PlayerColor,
  piece: DroppablePiece
): Square[] {
  const board = chess.board();
  const kingSq = findKingSquareFast(chess, color);
  const opp: PlayerColor = color === 'w' ? 'b' : 'w';
  const legal: Square[] = [];

  for (let r = 0; r < 8; r++) {
    const rankChar = RANKS[r];
    if (piece === 'p' && (rankChar === '1' || rankChar === '8')) continue;

    for (let f = 0; f < 8; f++) {
      // board[0] is rank 8 -> r = 7; board[7] is rank 1 -> r = 0
      if (board[7 - r][f] !== null) continue;
      const sq = `${FILES[f]}${rankChar}` as Square;

      const sim = new Chess();
      sim.load(chess.fen(), { skipValidation: true });
      sim.put({ type: piece, color }, sq);
      if (!kingSq || !sim.isAttacked(kingSq, opp)) {
        legal.push(sq);
      }
    }
  }

  return legal;
}

export function getAllCrazyhouseDropMoves(
  chess: Chess,
  pocket: CrazyhousePocket
): { piece: DroppablePiece; to: Square }[] {
  const turn = chess.turn();
  const out: { piece: DroppablePiece; to: Square }[] = [];
  for (const piece of DROPPABLE_PIECES) {
    if ((pocket[piece] ?? 0) <= 0) continue;
    const squares = getCrazyhouseLegalDropSquares(chess, turn, piece);
    for (const to of squares) {
      out.push({ piece, to });
    }
  }
  return out;
}

export function hasAnyCrazyhouseLegalMoveOrDrop(
  chess: Chess,
  pocket: CrazyhousePocket
): boolean {
  if (chess.moves().length > 0) return true;
  const turn = chess.turn();
  for (const piece of DROPPABLE_PIECES) {
    if ((pocket[piece] ?? 0) <= 0) continue;
    if (getCrazyhouseLegalDropSquares(chess, turn, piece).length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Executes a validated Crazyhouse pocket drop onto `chess` (mutating `chess` in place)
 * and returns move metadata including post-drop check/checkmate status.
 */
export function executeCrazyhouseDropOnChess(
  chess: Chess,
  piece: DroppablePiece,
  to: Square,
  nextOpponentPocket: CrazyhousePocket
): {
  san: string;
  lan: string;
  fen: string;
  color: PlayerColor;
  isCheck: boolean;
  isCheckmate: boolean;
} | null {
  const color = chess.turn();
  const opp: PlayerColor = color === 'w' ? 'b' : 'w';
  if (chess.get(to)) return null;
  if (piece === 'p' && (to[1] === '1' || to[1] === '8')) return null;

  const backupFen = chess.fen();
  chess.put({ type: piece, color }, to);

  const ownKing = findKingSquareFast(chess, color);
  if (ownKing && chess.isAttacked(ownKing, opp)) {
    chess.load(backupFen, { skipValidation: true });
    return null;
  }

  const flippedFen = buildNextFenAfterDrop(chess.fen(), color, piece);
  chess.load(flippedFen, { skipValidation: true });

  const isCheck = chess.isCheck();
  const oppHasReply = hasAnyCrazyhouseLegalMoveOrDrop(chess, nextOpponentPocket);
  const isCheckmate = isCheck && !oppHasReply;

  return {
    san: formatCrazyhouseDropSan(piece, to, isCheck, isCheckmate),
    lan: formatCrazyhouseDropLan(piece, to),
    fen: chess.fen(),
    color,
    isCheck,
    isCheckmate,
  };
}

export interface CrazyhouseStateSnapshot {
  w: CrazyhousePocket;
  b: CrazyhousePocket;
  promotedSquares: Set<Square>;
  repetitionKeyCount: Map<string, number>;
}

function pocketSignature(w: CrazyhousePocket, b: CrazyhousePocket): string {
  return (
    DROPPABLE_PIECES.map((p) => `${p}${w[p]}`).join('') +
    '|' +
    DROPPABLE_PIECES.map((p) => `${p}${b[p]}`).join('')
  );
}

function positionRepetitionKey(
  fen: string,
  w: CrazyhousePocket,
  b: CrazyhousePocket
): string {
  const parts = fen.split(' ');
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ${pocketSignature(w, b)}`;
}

/**
 * Replays `moves` from `startFen` to compute exact Crazyhouse pockets for both players,
 * promoted-pawn tracking (promoted pieces revert to pawns when captured), and repetition counts.
 */
export function computeCrazyhouseState(
  startFen: string,
  moves: MoveRecord[],
  setupMode: CrazyhouseSetupMode = 'classic'
): CrazyhouseStateSnapshot {
  const { w, b } = createInitialCrazyhousePockets(setupMode);
  const pockets: Record<PlayerColor, CrazyhousePocket> = { w, b };
  const promotedSquares = new Set<Square>();
  const repetitionKeyCount = new Map<string, number>();

  const sim = new Chess();
  try {
    sim.load(startFen, { skipValidation: true });
  } catch {
    sim.reset();
  }

  const addKey = (f: string) => {
    const key = positionRepetitionKey(f, pockets.w, pockets.b);
    repetitionKeyCount.set(key, (repetitionKeyCount.get(key) ?? 0) + 1);
  };
  addKey(sim.fen());

  for (const m of moves) {
    const drop = parseCrazyhouseDropNotation(m.lan || m.san);
    if (drop) {
      if (pockets[m.color][drop.piece] > 0) {
        pockets[m.color][drop.piece] -= 1;
      }
      sim.put({ type: drop.piece, color: m.color }, drop.to);
      sim.load(buildNextFenAfterDrop(sim.fen(), m.color, drop.piece), {
        skipValidation: true,
      });
      addKey(sim.fen());
      continue;
    }

    try {
      const executed = sim.move({
        from: m.from as Square,
        to: m.to as Square,
        promotion: m.lan.length === 5 ? (m.lan[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      });

      const fromSq = executed.from;
      const toSq = executed.to;
      const wasPromotedMover = promotedSquares.has(fromSq);
      if (wasPromotedMover) promotedSquares.delete(fromSq);

      if (executed.captured) {
        // En-passant capture removes pawn behind `toSq`, which is never promoted
        let capturedSq: Square = toSq;
        if (executed.isEnPassant()) {
          const epRank = executed.color === 'w' ? String(Number(toSq[1]) - 1) : String(Number(toSq[1]) + 1);
          capturedSq = `${toSq[0]}${epRank}` as Square;
        }
        const wasPromotedVictim = promotedSquares.has(capturedSq);
        if (wasPromotedVictim) promotedSquares.delete(capturedSq);

        const pocketType: DroppablePiece = wasPromotedVictim
          ? 'p'
          : (executed.captured as DroppablePiece);
        pockets[executed.color][pocketType] += 1;
      }

      if (executed.isPromotion() || wasPromotedMover) {
        promotedSquares.add(toSq);
      }
      addKey(sim.fen());
    } catch {
      // Fallback: sync board state from recorded FEN if needed
      try {
        sim.load(m.fen, { skipValidation: true });
      } catch {
        break;
      }
    }
  }

  return {
    w: pockets.w,
    b: pockets.b,
    promotedSquares,
    repetitionKeyCount,
  };
}

export function replayCrazyhouseChess(startFen: string, moves: MoveRecord[]): Chess {
  const chess = new Chess();
  try {
    chess.load(startFen, { skipValidation: true });
  } catch {
    chess.reset();
  }

  for (const m of moves) {
    const drop = parseCrazyhouseDropNotation(m.lan || m.san);
    if (drop) {
      chess.put({ type: drop.piece, color: m.color }, drop.to);
      chess.load(buildNextFenAfterDrop(chess.fen(), m.color, drop.piece), {
        skipValidation: true,
      });
      continue;
    }
    try {
      chess.move(m.lan);
    } catch {
      try {
        chess.move(m.san);
      } catch {
        chess.load(m.fen, { skipValidation: true });
      }
    }
  }

  return chess;
}
