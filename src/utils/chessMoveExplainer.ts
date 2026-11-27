import { Chess, type Square } from 'chess.js';
import type { MoveClassification, PositionEval } from '../types/chess';

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

const CENTER_SQUARES = new Set<Square>(['d4', 'e4', 'd5', 'e5']);
const EXTENDED_CENTER = new Set<Square>(['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5']);

export interface MoveExplanation {
  tacticalTheme: string;
  whatWentWrong?: string;
  whatWasBetter: string;
  whyBetter: string;
  summary: string;
}

export interface EstimatedEloResult {
  elo: number;
  title: string;
  tierColor: string;
  badgeBg: string;
}

/**
 * Computes a calibrated performance rating (Estimated Elo) for a side in a completed game.
 */
export function calculateEstimatedElo(
  accuracy: number,
  acpl: number,
  blunders: number,
  mistakes: number,
  brilliants: number,
  totalMoves: number
): EstimatedEloResult {
  if (totalMoves === 0) {
    return {
      elo: 1200,
      title: 'Even Play',
      tierColor: 'text-stone-500',
      badgeBg: 'bg-stone-500/10 text-stone-700 dark:text-stone-300',
    };
  }

  // Base Elo derived from accuracy (smooth sigmoid-like exponential mapping)
  // Accuracy 100 -> ~2750, 90 -> ~2250, 80 -> ~1800, 70 -> ~1450, 55 -> ~1000, 35 -> ~600
  const normAcc = Math.max(0, Math.min(100, accuracy));
  let baseElo = 350 + Math.pow(normAcc / 100, 1.95) * 2380;

  // ACPL penalty: 0-25 has minimal penalty, higher ACPL pulls rating down
  const acplPenalty = Math.min(300, acpl) * 2.2;
  baseElo -= acplPenalty;

  // Blunder penalty weighted by move count
  const blunderRate = blunders / Math.max(totalMoves, 5);
  const blunderPenalty = blunderRate * 750;
  baseElo -= blunderPenalty;

  // Mistake penalty
  const mistakeRate = mistakes / Math.max(totalMoves, 5);
  const mistakePenalty = mistakeRate * 280;
  baseElo -= mistakePenalty;

  // Brilliant bonus
  baseElo += Math.min(120, brilliants * 45);

  const finalElo = Math.round(Math.max(300, Math.min(2850, baseElo)));

  if (finalElo >= 2500) {
    return {
      elo: finalElo,
      title: 'Grandmaster Level',
      tierColor: 'text-amber-500 dark:text-amber-400',
      badgeBg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    };
  }
  if (finalElo >= 2200) {
    return {
      elo: finalElo,
      title: 'Master Level',
      tierColor: 'text-purple-600 dark:text-purple-400',
      badgeBg: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    };
  }
  if (finalElo >= 1900) {
    return {
      elo: finalElo,
      title: 'Expert Level',
      tierColor: 'text-indigo-600 dark:text-indigo-400',
      badgeBg: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    };
  }
  if (finalElo >= 1600) {
    return {
      elo: finalElo,
      title: 'Strong Club',
      tierColor: 'text-blue-600 dark:text-blue-400',
      badgeBg: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
    };
  }
  if (finalElo >= 1300) {
    return {
      elo: finalElo,
      title: 'Intermediate',
      tierColor: 'text-emerald-600 dark:text-emerald-400',
      badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    };
  }
  if (finalElo >= 950) {
    return {
      elo: finalElo,
      title: 'Developing Club',
      tierColor: 'text-teal-600 dark:text-teal-400',
      badgeBg: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
    };
  }
  if (finalElo >= 650) {
    return {
      elo: finalElo,
      title: 'Casual Player',
      tierColor: 'text-stone-600 dark:text-stone-400',
      badgeBg: 'bg-stone-500/15 text-stone-700 dark:text-stone-300 border-stone-500/30',
    };
  }
  return {
    elo: finalElo,
    title: 'Novice',
    tierColor: 'text-stone-500 dark:text-stone-400',
    badgeBg: 'bg-stone-400/15 text-stone-600 dark:text-stone-400 border-stone-400/30',
  };
}

/**
 * Analyzes the board position before and after a move to generate concrete,
 * human-readable explanations of:
 * 1. What went wrong with the played move (if an error).
 * 2. What would have been better (best engine move).
 * 3. Why the best move is superior (tactics, material, king safety, center control).
 */
export function explainMove(
  fenBefore: string,
  playedLan: string,
  bestLan: string,
  bestSan: string,
  evalBefore: PositionEval,
  evalAfter: PositionEval,
  classification: MoveClassification,
  moverColor: 'w' | 'b'
): MoveExplanation {
  const moverSign = moverColor === 'w' ? 1 : -1;
  const isTopChoice = playedLan === bestLan || classification === 'best';

  try {
    const gameBefore = new Chess(fenBefore);
    const fromSquare = playedLan.slice(0, 2) as Square;
    const toSquare = playedLan.slice(2, 4) as Square;
    const promoChar = playedLan.slice(4, 5);

    const movedPieceObj = gameBefore.get(fromSquare);
    const movedPieceType = movedPieceObj?.type ?? 'p';
    const movedPieceName = PIECE_NAMES[movedPieceType] || 'piece';

    // Simulate played move
    const gameAfterPlayed = new Chess(fenBefore);
    let playedMoveObj;
    try {
      playedMoveObj = gameAfterPlayed.move({
        from: fromSquare,
        to: toSquare,
        promotion: (promoChar as 'q' | 'r' | 'b' | 'n') || undefined,
      });
    } catch {
      playedMoveObj = null;
    }

    // Simulate best move
    const bestFrom = bestLan.slice(0, 2) as Square;
    const bestTo = bestLan.slice(2, 4) as Square;
    const bestPromo = bestLan.slice(4, 5);

    const bestPieceObj = gameBefore.get(bestFrom);
    const bestPieceType = bestPieceObj?.type ?? 'p';
    const bestPieceName = PIECE_NAMES[bestPieceType] || 'piece';

    const gameAfterBest = new Chess(fenBefore);
    let bestMoveObj;
    try {
      bestMoveObj = gameAfterBest.move({
        from: bestFrom,
        to: bestTo,
        promotion: (bestPromo as 'q' | 'r' | 'b' | 'n') || undefined,
      });
    } catch {
      bestMoveObj = null;
    }

    // 1. Brilliant Move
    if (classification === 'brilliant') {
      return {
        tacticalTheme: 'Tactical Sacrifice',
        whatWasBetter: `Your move ${playedMoveObj?.san || playedLan} was brilliant!`,
        whyBetter: `A magnificent sacrifice of the ${movedPieceName}! You recognized that giving up material cracks open the opponent's defensive posture and unleashes irresistible tactical compensation.`,
        summary: `Brilliant sacrifice of the ${movedPieceName} creating unstoppable tactical threats.`,
      };
    }

    // 2. Great Move
    if (classification === 'great') {
      return {
        tacticalTheme: 'Critical Find',
        whatWasBetter: `Excellent find with ${playedMoveObj?.san || playedLan}!`,
        whyBetter: `The only critical move that preserves your winning advantage. Other candidate moves would have allowed counterplay, but this precise move maintains complete tactical command.`,
        summary: `Crucial only-move that seizes control and keeps the initiative.`,
      };
    }

    // 3. Opening Book Move
    if (classification === 'book') {
      return {
        tacticalTheme: 'Opening Theory',
        whatWasBetter: `${playedMoveObj?.san || playedLan} follows established opening theory.`,
        whyBetter: `Standard grandmaster opening preparation. Develops your ${movedPieceName} efficiently and secures healthy central piece harmony.`,
        summary: `Adheres to established master-level opening principles.`,
      };
    }

    // 4. Best or Excellent Move
    if (isTopChoice || classification === 'excellent') {
      let positiveTheme = 'Piece Harmony';
      let positiveWhy = `Accurately coordinates your ${movedPieceName} to maximize board influence while keeping your structure completely sound.`;

      if (playedMoveObj?.captured) {
        positiveTheme = 'Material Capture';
        const capturedName = PIECE_NAMES[playedMoveObj.captured] || 'piece';
        positiveWhy = `Decisively captures the enemy ${capturedName} on ${toSquare}, winning material with zero defensive concessions.`;
      } else if (playedMoveObj?.san.includes('#')) {
        positiveTheme = 'Checkmate';
        positiveWhy = `Delivers a lethal checkmate to the opponent's king, finishing the game on the spot!`;
      } else if (playedMoveObj?.san.includes('+')) {
        positiveTheme = 'Forcing Check';
        positiveWhy = `Puts the enemy king in check with tempo, disrupting the opponent's coordination and keeping the attack alive.`;
      } else if (CENTER_SQUARES.has(toSquare)) {
        positiveTheme = 'Center Dominance';
        positiveWhy = `Plants the ${movedPieceName} firmly into the vital central square ${toSquare}, restricting opponent piece mobility.`;
      } else if (playedMoveObj?.flags.includes('k') || playedMoveObj?.flags.includes('q')) {
        positiveTheme = 'King Safety';
        positiveWhy = `Safely tucks your king into the fortress while connecting your rooks for the middlegame.`;
      }

      return {
        tacticalTheme: positiveTheme,
        whatWasBetter: `Playing ${playedMoveObj?.san || playedLan} was top engine choice.`,
        whyBetter: positiveWhy,
        summary: `Optimal move that preserves maximum positional advantage and dynamic pressure.`,
      };
    }

    if (classification === 'good') {
      return {
        tacticalTheme: 'Solid Play',
        whatWasBetter: `Better was ${bestSan} (${bestPieceName} to ${bestTo}).`,
        whyBetter: `${bestSan} activates the ${bestPieceName} more aggressively. Your played move was solid, but the engine alternative exerted slightly more pressure.`,
        summary: `Solid choice, though ${bestSan} offered a slightly sharper continuation.`,
      };
    }

    // 5. Blunders, Mistakes, and Inaccuracies
    // Determine what went wrong and why best was better
    let tacticalTheme = 'Positional Concession';
    let whatWentWrong = '';
    let whyBetter = '';

    // Checkmate scenarios
    const walkedIntoMate =
      evalAfter.mate !== null &&
      evalAfter.mate * moverSign < 0 &&
      !(evalBefore.mate !== null && evalBefore.mate * moverSign < 0);

    const missedForcedMate =
      evalBefore.mate !== null &&
      evalBefore.mate * moverSign > 0 &&
      !(evalAfter.mate !== null && evalAfter.mate * moverSign > 0);

    if (walkedIntoMate) {
      const mateCount = Math.abs(evalAfter.mate!);
      tacticalTheme = 'Walked into Checkmate';
      whatWentWrong = `This move fatally compromises your defenses and allows your opponent a forced checkmate in ${mateCount} move${mateCount === 1 ? '' : 's'}.`;
      whyBetter = `${bestSan} was required to keep the defensive perimeter intact and prevent an immediate mating net.`;
    } else if (missedForcedMate) {
      tacticalTheme = 'Missed Checkmate';
      whatWentWrong = `Overlooked a decisive mating sequence that would have wrapped up the game immediately.`;
      whyBetter = `${bestSan} was a forced checkmate sequence against the exposed enemy king.`;
    } else {
      // Check for hanging piece on the destination square
      let movedPieceHanging = false;
      let pieceHangingName = '';
      let hangingSquare = toSquare;

      if (playedMoveObj) {
        const oppReplies = gameAfterPlayed.moves({ verbose: true });
        const directCapture = oppReplies.find((r) => r.to === toSquare);
        if (directCapture) {
          const capValue = PIECE_VALUES[directCapture.piece];
          const movedValue = PIECE_VALUES[movedPieceType];
          if (movedValue > capValue || (movedValue === capValue && movedValue >= 3)) {
            // Check if destination is protected
            const sim = new Chess(gameAfterPlayed.fen());
            sim.move(directCapture);
            const recaptures = sim.moves({ verbose: true }).filter((r) => r.to === toSquare);
            if (recaptures.length === 0) {
              movedPieceHanging = true;
              pieceHangingName = movedPieceName;
              hangingSquare = toSquare;
            }
          }
        }

        // Check if an existing valuable piece was left undefended
        if (!movedPieceHanging) {
          for (const oppMove of oppReplies) {
            if (oppMove.captured && PIECE_VALUES[oppMove.captured] >= 3 && oppMove.to !== toSquare) {
              const sim = new Chess(gameAfterPlayed.fen());
              sim.move(oppMove);
              const recaps = sim.moves({ verbose: true }).filter((r) => r.to === oppMove.to);
              if (recaps.length === 0) {
                movedPieceHanging = true;
                pieceHangingName = PIECE_NAMES[oppMove.captured] || 'piece';
                hangingSquare = oppMove.to;
                break;
              }
            }
          }
        }
      }

      // Check best move characteristics
      const bestCaptures = bestMoveObj?.captured;
      const bestDeliversCheck = bestMoveObj?.san.includes('+');
      const bestIsCastle = bestMoveObj?.flags.includes('k') || bestMoveObj?.flags.includes('q');

      if (movedPieceHanging) {
        tacticalTheme = 'Hanging Piece';
        whatWentWrong = `Leaves your ${pieceHangingName} on ${hangingSquare} completely unguarded and free for the taking.`;
        if (bestCaptures) {
          const capName = PIECE_NAMES[bestCaptures] || 'piece';
          whyBetter = `${bestSan} would have captured the undefended enemy ${capName} on ${bestTo} instead of giving away material.`;
        } else {
          whyBetter = `${bestSan} moves the ${bestPieceName} to safety or reinforces your threatened pieces without losing material.`;
        }
      } else if (bestCaptures) {
        tacticalTheme = 'Missed Free Material';
        const capName = PIECE_NAMES[bestCaptures] || 'piece';
        whatWentWrong = `Missed an opportunity to win the enemy ${capName} on ${bestTo}.`;
        whyBetter = `${bestSan} wins the loose ${capName} on ${bestTo}, securing a decisive material advantage.`;
      } else if (bestDeliversCheck) {
        tacticalTheme = 'Missed Forcing Attack';
        whatWentWrong = `Relinquishes attacking pressure and lets the opponent regroup comfortably.`;
        whyBetter = `${bestSan} delivers check with tempo, pinning the enemy monarch and forcing passive replies.`;
      } else if (bestIsCastle) {
        tacticalTheme = 'King Safety';
        whatWentWrong = `Leaves your king stranded in the dangerous center file while delaying rook connection.`;
        whyBetter = `${bestSan} castles your king safely out of harm's way and activates your rook onto the central files.`;
      } else if (CENTER_SQUARES.has(bestTo) && !CENTER_SQUARES.has(toSquare)) {
        tacticalTheme = 'Loss of Center Control';
        whatWentWrong = `Moves away from the center of the board, allowing opponent pawns to dictate the pace.`;
        whyBetter = `${bestSan} seizes the critical central square ${bestTo}, establishing central dominance and opening lines.`;
      } else if (movedPieceType === 'k') {
        tacticalTheme = 'King Exposure';
        whatWentWrong = `Moving the King unprompted exposes it to open attacking lines and forfeits castling rights.`;
        whyBetter = `${bestSan} keeps your king sheltered while developing your ${bestPieceName} to an active square.`;
      } else {
        tacticalTheme = classification === 'blunder' ? 'Tactical Oversight' : 'Positional Inaccuracy';
        whatWentWrong = `A passive move that weakens your piece coordination and concedes the initiative to your opponent.`;
        whyBetter = `${bestSan} (${bestPieceName} to ${bestTo}) activates your forces, tightens piece synergy, and maintains pressure.`;
      }
    }

    return {
      tacticalTheme,
      whatWentWrong,
      whatWasBetter: `Best was ${bestSan} (${bestPieceName} to ${bestTo})`,
      whyBetter,
      summary: whatWentWrong
        ? `${tacticalTheme}: ${whatWentWrong}`
        : `Better was ${bestSan}: ${whyBetter}`,
    };
  } catch {
    // Fallback if parsing fails
    return {
      tacticalTheme: classification === 'blunder' ? 'Blunder' : 'Inaccuracy',
      whatWentWrong: classification === 'blunder' ? 'Major tactical concession.' : undefined,
      whatWasBetter: `Best was ${bestSan || bestLan}`,
      whyBetter: `Stockfish found ${bestSan || bestLan} provides stronger piece activity and tactical safety.`,
      summary: `Best move was ${bestSan || bestLan}.`,
    };
  }
}
