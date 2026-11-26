import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { GameResult, GameVariant, MoveRecord, PlayerColor } from '../types/chess';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const RACING_KINGS_FEN = '8/8/8/8/8/8/krbnNBRK/qrbnNBRQ w - - 0 1';
const NO_PAWNS_FEN = 'rnbqkbnr/8/8/8/8/8/8/RNBQKBNR w KQkq - 0 1';
const CAVALRY_CHARGE_FEN = 'nnnnknnn/pppppppp/8/8/8/8/PPPPPPPP/NNNNKNNN w - - 0 1';
const QUEEN_SWARM_FEN = 'qqqqkqqq/pppppppp/8/8/8/8/PPPPPPPP/QQQQKQQQ w - - 0 1';
const PEASANTS_REVOLT_FEN = '1nn1k1n1/4p3/8/8/8/8/PPPPPPPP/4K1N1 w - - 0 1';

export const HILL_SQUARES = new Set<Square>(['d4', 'e4', 'd5', 'e5']);

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

function buildBackrankFromSpNumber(spNumber: number): string[] {
  const rank = new Array<string>(8).fill('');

  let n = spNumber;
  const b1 = n % 4;
  n = Math.floor(n / 4);
  const b2 = n % 4;
  n = Math.floor(n / 4);
  const qIdx = n % 6;
  const krnCode = Math.floor(n / 6);

  rank[b1 * 2 + 1] = 'b';
  rank[b2 * 2] = 'b';

  const emptyForQ = rank.map((v, i) => (v === '' ? i : -1)).filter((i) => i !== -1);
  rank[emptyForQ[qIdx]] = 'q';

  const knightTable: [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 4],
    [3, 4],
  ];
  const emptyForN = rank.map((v, i) => (v === '' ? i : -1)).filter((i) => i !== -1);
  const [n1, n2] = knightTable[krnCode % 10];
  rank[emptyForN[n1]] = 'n';
  rank[emptyForN[n2]] = 'n';

  const emptyForRKR = rank.map((v, i) => (v === '' ? i : -1)).filter((i) => i !== -1);
  rank[emptyForRKR[0]] = 'r';
  rank[emptyForRKR[1]] = 'k';
  rank[emptyForRKR[2]] = 'r';

  return rank;
}

function castlingRightsFromRanks(whiteRank: string[], blackRank: string[]): string {
  let castling = '';
  if (whiteRank[4] === 'k') {
    if (whiteRank[7] === 'r') castling += 'K';
    if (whiteRank[0] === 'r') castling += 'Q';
  }
  if (blackRank[4] === 'k') {
    if (blackRank[7] === 'r') castling += 'k';
    if (blackRank[0] === 'r') castling += 'q';
  }
  return castling || '-';
}

/**
 * Generates a valid FIDE Chess960 back-rank arrangement (bishops on opposite colors,
 * king placed strictly between the two rooks).
 */
export function generateShuffle960Fen(): { fen: string; spNumber: number } {
  const spNumber = Math.floor(Math.random() * 960);
  const rank = buildBackrankFromSpNumber(spNumber);
  const blackRank = rank.join('');
  const whiteRank = blackRank.toUpperCase();
  const castling = castlingRightsFromRanks(rank, rank);
  const fen = `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castling} - 0 1`;
  return { fen, spNumber };
}

export function generateDouble960Fen(): { fen: string; wSp: number; bSp: number } {
  const wSp = Math.floor(Math.random() * 960);
  let bSp = Math.floor(Math.random() * 960);
  if (bSp === wSp) bSp = (bSp + 1 + Math.floor(Math.random() * 958)) % 960;
  const whiteLayout = buildBackrankFromSpNumber(wSp);
  const blackLayout = buildBackrankFromSpNumber(bSp);
  const castling = castlingRightsFromRanks(whiteLayout, blackLayout);
  const fen = `${blackLayout.join('')}/pppppppp/8/8/8/8/PPPPPPPP/${whiteLayout
    .join('')
    .toUpperCase()} w ${castling} - 0 1`;
  return { fen, wSp, bSp };
}

/**
 * Generates a starting FEN for any Chess Variant.
 * In odds variants, the opponent of `humanColor` starts without the specified piece,
 * and castling rights are stripped if an edge rook is removed.
 */
export function generateVariantStartFen(
  variant: GameVariant,
  humanColor: PlayerColor
): { fen: string; note?: string } {
  if (variant === 'standard') {
    return { fen: INITIAL_FEN };
  }

  if (variant === 'king-of-the-hill') {
    return { fen: INITIAL_FEN, note: 'Reach d4·e4·d5·e5 with King' };
  }

  if (variant === 'three-check') {
    return { fen: INITIAL_FEN, note: '3 Checks to Win' };
  }

  if (variant === 'fog-of-war') {
    return { fen: INITIAL_FEN, note: 'Limited Vision' };
  }

  if (variant === 'racing-kings') {
    return { fen: RACING_KINGS_FEN, note: 'No Checks · Race to Rank 8' };
  }

  if (variant === 'shuffle960') {
    const { fen, spNumber } = generateShuffle960Fen();
    return { fen, note: `Setup #${spNumber}` };
  }

  if (variant === 'double-960') {
    const { fen, wSp, bSp } = generateDouble960Fen();
    return { fen, note: `W#${wSp} · B#${bSp}` };
  }

  if (variant === 'no-pawns') {
    return { fen: NO_PAWNS_FEN, note: 'Pure Piece Tactics' };
  }

  if (variant === 'cavalry-charge') {
    return { fen: CAVALRY_CHARGE_FEN, note: '7 Knights Each' };
  }

  if (variant === 'queen-swarm') {
    return { fen: QUEEN_SWARM_FEN, note: '7 Queens Each' };
  }

  if (variant === 'peasants-revolt') {
    return { fen: PEASANTS_REVOLT_FEN, note: '8 Pawns+N vs 4N+P' };
  }

  // Odds variants give the material edge to `humanColor` by removing from the opposite side
  const underdogColor: PlayerColor = humanColor === 'w' ? 'b' : 'w';

  const blackBack = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const blackPawns = new Array<string>(8).fill('p');
  const whitePawns = new Array<string>(8).fill('P');
  const whiteBack = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

  let castlingW = 'KQ';
  let castlingB = 'kq';

  if (variant === 'odds-pawn') {
    if (underdogColor === 'b') blackPawns[5] = '';
    else whitePawns[5] = '';
  } else if (variant === 'odds-knight') {
    if (underdogColor === 'b') blackBack[1] = '';
    else whiteBack[1] = '';
  } else if (variant === 'odds-rook') {
    if (underdogColor === 'b') {
      blackBack[0] = '';
      castlingB = 'k';
    } else {
      whiteBack[0] = '';
      castlingW = 'K';
    }
  } else if (variant === 'odds-queen') {
    if (underdogColor === 'b') blackBack[3] = '';
    else whiteBack[3] = '';
  }

  const compressRow = (cells: string[]): string => {
    let out = '';
    let empty = 0;
    for (const c of cells) {
      if (!c) {
        empty += 1;
      } else {
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += c;
      }
    }
    if (empty > 0) out += String(empty);
    return out;
  };

  const castling = `${castlingW}${castlingB}` || '-';
  const fen =
    [
      compressRow(blackBack),
      compressRow(blackPawns),
      '8',
      '8',
      '8',
      '8',
      compressRow(whitePawns),
      compressRow(whiteBack),
    ].join('/') + ` w ${castling} - 0 1`;

  return { fen };
}

export function findKingSquare(chess: Chess, color: PlayerColor): Square | null {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === color) {
        return cell.square;
      }
    }
  }
  return null;
}

export function getThreeCheckCounts(moves: MoveRecord[]): { w: number; b: number } {
  let w = 0;
  let b = 0;
  for (const m of moves) {
    if (!m.isCheck) continue;
    if (m.color === 'w') w += 1;
    else b += 1;
  }
  return { w, b };
}

/**
 * Returns all legal moves for the current position respecting variant rules
 * (e.g., Racing Kings forbids any move that puts the opponent in check).
 */
export function getVariantLegalMoves(
  chess: Chess,
  variant: GameVariant,
  square?: Square
): Move[] {
  const baseMoves = square
    ? chess.moves({ square, verbose: true })
    : chess.moves({ verbose: true });

  if (variant !== 'racing-kings') {
    return baseMoves;
  }

  const fen = chess.fen();
  return baseMoves.filter((m) => {
    const sim = new Chess(fen);
    sim.move(m);
    return !sim.isCheck();
  });
}

export function isVariantMoveLegal(
  chess: Chess,
  from: Square,
  to: Square,
  variant: GameVariant
): Move[] {
  return getVariantLegalMoves(chess, variant, from).filter((m) => m.to === to);
}

/**
 * Evaluates end-of-game conditions including King of the Hill, Three-Check,
 * Racing Kings, and standard FIDE checkmate / draw rules.
 */
export function evaluateVariantGameEnd(
  chess: Chess,
  variant: GameVariant,
  moves: MoveRecord[]
): GameResult | null {
  if (variant === 'king-of-the-hill') {
    const wKing = findKingSquare(chess, 'w');
    const bKing = findKingSquare(chess, 'b');
    if (wKing && HILL_SQUARES.has(wKing)) {
      return {
        winner: 'w',
        reason: 'variant-win',
        headline: 'White wins — King of the Hill!',
        detail: `White’s king reached the center square ${wKing}.`,
      };
    }
    if (bKing && HILL_SQUARES.has(bKing)) {
      return {
        winner: 'b',
        reason: 'variant-win',
        headline: 'Black wins — King of the Hill!',
        detail: `Black’s king reached the center square ${bKing}.`,
      };
    }
  }

  if (variant === 'three-check') {
    const { w, b } = getThreeCheckCounts(moves);
    if (w >= 3) {
      return {
        winner: 'w',
        reason: 'variant-win',
        headline: 'White wins — Three-Check!',
        detail: 'White delivered 3 checks to Black’s king.',
      };
    }
    if (b >= 3) {
      return {
        winner: 'b',
        reason: 'variant-win',
        headline: 'Black wins — Three-Check!',
        detail: 'Black delivered 3 checks to White’s king.',
      };
    }
  }

  if (variant === 'racing-kings') {
    const wKing = findKingSquare(chess, 'w');
    const bKing = findKingSquare(chess, 'b');
    const wOn8 = wKing?.[1] === '8';
    const bOn8 = bKing?.[1] === '8';

    if (wOn8 && bOn8) {
      return {
        winner: 'draw',
        reason: 'variant-win',
        headline: 'Draw — Photo Finish!',
        detail: 'Both kings reached rank 8 on the final turn.',
      };
    }

    if (wOn8 && !bOn8) {
      if (chess.turn() === 'b') {
        const blackLegal = getVariantLegalMoves(chess, 'racing-kings');
        const blackCanTie = blackLegal.some((m) => m.piece === 'k' && m.to[1] === '8');
        if (!blackCanTie) {
          return {
            winner: 'w',
            reason: 'variant-win',
            headline: 'White wins — Racing Kings!',
            detail: 'White’s king reached rank 8 and Black cannot tie.',
          };
        }
      } else {
        return {
          winner: 'w',
          reason: 'variant-win',
          headline: 'White wins — Racing Kings!',
          detail: 'White’s king crossed the rank 8 finish line.',
        };
      }
    }

    if (bOn8 && !wOn8) {
      return {
        winner: 'b',
        reason: 'variant-win',
        headline: 'Black wins — Racing Kings!',
        detail: 'Black’s king crossed the rank 8 finish line first.',
      };
    }
  }

  if (chess.isCheckmate()) {
    const winner: PlayerColor = chess.turn() === 'w' ? 'b' : 'w';
    const winnerName = winner === 'w' ? 'White' : 'Black';
    return {
      winner,
      reason: 'checkmate',
      headline: `${winnerName} wins by Checkmate`,
      detail: 'The opposing king has no legal escape.',
    };
  }

  const legalCount =
    variant === 'racing-kings'
      ? getVariantLegalMoves(chess, 'racing-kings').length
      : chess.moves().length;

  if (legalCount === 0 || chess.isStalemate()) {
    return {
      winner: 'draw',
      reason: 'stalemate',
      headline: 'Draw by Stalemate',
      detail: `${chess.turn() === 'w' ? 'White' : 'Black'} has no legal moves.`,
    };
  }

  if (chess.isThreefoldRepetition()) {
    return {
      winner: 'draw',
      reason: 'threefold',
      headline: 'Draw by Threefold Repetition',
      detail: 'The same board position occurred three times.',
    };
  }

  if (variant !== 'king-of-the-hill' && variant !== 'racing-kings' && chess.isInsufficientMaterial()) {
    return {
      winner: 'draw',
      reason: 'insufficient',
      headline: 'Draw by Insufficient Material',
      detail: 'Neither side has enough material to force checkmate.',
    };
  }

  if (chess.isDrawByFiftyMoves()) {
    return {
      winner: 'draw',
      reason: 'fifty-move',
      headline: 'Draw by Fifty-Move Rule',
      detail: '50 consecutive moves occurred without a pawn move or capture.',
    };
  }

  return null;
}

/**
 * Computes the set of squares visible to `viewerColor` in Fog of War:
 * - Own occupied squares
 * - Squares any friendly piece can move to or attack
 * - Any enemy piece currently giving check to the friendly king
 */
export function computeFogVisibleSquares(fen: string, viewerColor: PlayerColor): Set<Square> {
  const visible = new Set<Square>();
  const chess = new Chess();
  try {
    chess.load(fen);
  } catch {
    return visible;
  }

  const board = chess.board();
  const pieceAt = (f: number, r: number): { type: PieceSymbol; color: PlayerColor } | null => {
    if (f < 0 || f > 7 || r < 0 || r > 7) return null;
    // chess.board()[0] is rank 8 (r = 7), chess.board()[7] is rank 1 (r = 0)
    const cell = board[7 - r][f];
    return cell ? { type: cell.type, color: cell.color } : null;
  };

  const toSq = (f: number, r: number): Square => `${FILES[f]}${RANKS[r]}` as Square;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = pieceAt(f, r);
      if (!cell || cell.color !== viewerColor) continue;

      const sq = toSq(f, r);
      visible.add(sq);

      switch (cell.type) {
        case 'p': {
          const dir = viewerColor === 'w' ? 1 : -1;
          const oneAhead = r + dir;
          if (oneAhead >= 0 && oneAhead < 8) {
            if (!pieceAt(f, oneAhead)) {
              visible.add(toSq(f, oneAhead));
              const startRank = viewerColor === 'w' ? 1 : 6;
              const twoAhead = r + dir * 2;
              if (r === startRank && twoAhead >= 0 && twoAhead < 8 && !pieceAt(f, twoAhead)) {
                visible.add(toSq(f, twoAhead));
              }
            }
            if (f - 1 >= 0) visible.add(toSq(f - 1, oneAhead));
            if (f + 1 < 8) visible.add(toSq(f + 1, oneAhead));
          }
          break;
        }
        case 'n': {
          const jumps = [
            [1, 2],
            [2, 1],
            [-1, 2],
            [-2, 1],
            [1, -2],
            [2, -1],
            [-1, -2],
            [-2, -1],
          ];
          for (const [df, dr] of jumps) {
            const nf = f + df;
            const nr = r + dr;
            if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
              visible.add(toSq(nf, nr));
            }
          }
          break;
        }
        case 'k': {
          for (let df = -1; df <= 1; df++) {
            for (let dr = -1; dr <= 1; dr++) {
              if (df === 0 && dr === 0) continue;
              const nf = f + df;
              const nr = r + dr;
              if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
                visible.add(toSq(nf, nr));
              }
            }
          }
          break;
        }
        case 'b':
        case 'r':
        case 'q': {
          const dirs: [number, number][] = [];
          if (cell.type === 'r' || cell.type === 'q') {
            dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
          }
          if (cell.type === 'b' || cell.type === 'q') {
            dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
          }
          for (const [df, dr] of dirs) {
            for (let step = 1; step < 8; step++) {
              const nf = f + df * step;
              const nr = r + dr * step;
              if (nf < 0 || nf > 7 || nr < 0 || nr > 7) break;
              visible.add(toSq(nf, nr));
              if (pieceAt(nf, nr)) break;
            }
          }
          break;
        }
      }
    }
  }

  // Reveal enemy pieces that are currently giving check to viewerColor's king
  if (chess.turn() === viewerColor && chess.isCheck()) {
    const kingSq = findKingSquare(chess, viewerColor);
    if (kingSq) {
      const kf = FILES.indexOf(kingSq[0] as (typeof FILES)[number]);
      const kr = RANKS.indexOf(kingSq[1] as (typeof RANKS)[number]);
      const enemy: PlayerColor = viewerColor === 'w' ? 'b' : 'w';

      // Check knights
      const jumps = [
        [1, 2],
        [2, 1],
        [-1, 2],
        [-2, 1],
        [1, -2],
        [2, -1],
        [-1, -2],
        [-2, -1],
      ];
      for (const [df, dr] of jumps) {
        const p = pieceAt(kf + df, kr + dr);
        if (p && p.color === enemy && p.type === 'n') {
          visible.add(toSq(kf + df, kr + dr));
        }
      }

      // Check pawn attackers
      const pawnDir = viewerColor === 'w' ? 1 : -1;
      for (const df of [-1, 1]) {
        const p = pieceAt(kf + df, kr + pawnDir);
        if (p && p.color === enemy && p.type === 'p') {
          visible.add(toSq(kf + df, kr + pawnDir));
        }
      }

      // Check rays (rook/queen, bishop/queen)
      const straightDirs: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [df, dr] of straightDirs) {
        for (let step = 1; step < 8; step++) {
          const nf = kf + df * step;
          const nr = kr + dr * step;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) break;
          const p = pieceAt(nf, nr);
          if (p) {
            if (p.color === enemy && (p.type === 'r' || p.type === 'q')) {
              visible.add(toSq(nf, nr));
            }
            break;
          }
        }
      }

      const diagDirs: [number, number][] = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ];
      for (const [df, dr] of diagDirs) {
        for (let step = 1; step < 8; step++) {
          const nf = kf + df * step;
          const nr = kr + dr * step;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) break;
          const p = pieceAt(nf, nr);
          if (p) {
            if (p.color === enemy && (p.type === 'b' || p.type === 'q')) {
              visible.add(toSq(nf, nr));
            }
            break;
          }
        }
      }
    }
  }

  return visible;
}
