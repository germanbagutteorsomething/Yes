import type { GameVariant, PlayerColor } from '../types/chess';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Generates a valid FIDE Chess960 back-rank arrangement (bishops on opposite colors,
 * king placed strictly between the two rooks).
 * Standard chess.js only supports castling when King is on e-file and Rook is on a/h-file,
 * so castling flags are enabled strictly when those squares match.
 */
export function generateShuffle960Fen(): { fen: string; spNumber: number } {
  const spNumber = Math.floor(Math.random() * 960);
  const rank = new Array<string>(8).fill('');

  // 1. Light-square bishop (indices 1, 3, 5, 7) & Dark-square bishop (indices 0, 2, 4, 6)
  let n = spNumber;
  const b1 = n % 4;
  n = Math.floor(n / 4);
  const b2 = n % 4;
  n = Math.floor(n / 4);
  const qIdx = n % 6;
  const krnCode = Math.floor(n / 6);

  rank[b1 * 2 + 1] = 'b';
  rank[b2 * 2] = 'b';

  // 2. Place Queen on qIdx-th remaining empty square
  const emptyForQ = rank.map((v, i) => (v === '' ? i : -1)).filter((i) => i !== -1);
  rank[emptyForQ[qIdx]] = 'q';

  // 3. Place 2 Knights among 5 remaining empty squares using standard KRN table
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

  // 4. Remaining 3 empty squares are R, K, R in order
  const emptyForRKR = rank.map((v, i) => (v === '' ? i : -1)).filter((i) => i !== -1);
  rank[emptyForRKR[0]] = 'r';
  rank[emptyForRKR[1]] = 'k';
  rank[emptyForRKR[2]] = 'r';

  const blackRank = rank.join('');
  const whiteRank = blackRank.toUpperCase();

  let castling = '';
  if (rank[4] === 'k') {
    if (rank[7] === 'r') castling += 'K';
    if (rank[0] === 'r') castling += 'Q';
    if (rank[7] === 'r') castling += 'k';
    if (rank[0] === 'r') castling += 'q';
  }
  if (!castling) castling = '-';

  const fen = `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castling} - 0 1`;
  return { fen, spNumber };
}

/**
 * Generates a starting FEN for standard chess or material-odds games.
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

  if (variant === 'shuffle960') {
    const { fen, spNumber } = generateShuffle960Fen();
    return { fen, note: `Setup #${spNumber}` };
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
    if (underdogColor === 'b') blackPawns[5] = ''; // f7
    else whitePawns[5] = ''; // f2
  } else if (variant === 'odds-knight') {
    if (underdogColor === 'b') blackBack[1] = ''; // b8
    else whiteBack[1] = ''; // b1
  } else if (variant === 'odds-rook') {
    if (underdogColor === 'b') {
      blackBack[0] = ''; // a8
      castlingB = 'k';
    } else {
      whiteBack[0] = ''; // a1
      castlingW = 'K';
    }
  } else if (variant === 'odds-queen') {
    if (underdogColor === 'b') blackBack[3] = ''; // d8
    else whiteBack[3] = ''; // d1
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
  const fen = [
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
