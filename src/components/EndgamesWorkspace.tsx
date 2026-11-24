import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  ArrowUpDown,
  CheckCircle2,
  Crown,
  Lightbulb,
  RotateCcw,
} from 'lucide-react';
import { ENDGAME_DRILLS } from '../data/endgames';
import { stockfishService } from '../engine/stockfishService';
import {
  STOCKFISH_LEVELS,
  type BoardTheme,
  type EndgameDrillDefinition,
  type PendingPromotion,
  type PieceSet,
  type PlayerColor,
  type PromotionPiece,
} from '../types/chess';
import { playChessSound } from '../utils/sound';
import { loadCompletedEndgames, markEndgameCompleted } from '../utils/storage';
import { ChessBoard } from './ChessBoard';

interface EndgamesWorkspaceProps {
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  soundEnabled: boolean;
  onStatsChange?: () => void;
}

export const EndgamesWorkspace: React.FC<EndgamesWorkspaceProps> = ({
  boardTheme,
  pieceSet,
  soundEnabled,
  onStatsChange,
}) => {
  const [selectedId, setSelectedId] = useState<string>(ENDGAME_DRILLS[0].id);
  const [completedIds, setCompletedIds] = useState<string[]>(() => loadCompletedEndgames());

  const drill: EndgameDrillDefinition = useMemo(
    () => ENDGAME_DRILLS.find((d) => d.id === selectedId) ?? ENDGAME_DRILLS[0],
    [selectedId]
  );

  const chessRef = useRef<Chess>(new Chess(drill.fen));
  const abortRef = useRef<AbortController | null>(null);

  const [fen, setFen] = useState<string>(drill.fen);
  const [lanMoves, setLanMoves] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<boolean>(drill.humanColor === 'b');
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [drillWon, setDrillWon] = useState<boolean>(false);
  const [lastMove, setLastMove] = useState<{
    from: string;
    to: string;
    isCapture?: boolean;
  } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [hintArrow, setHintArrow] = useState<{ from: string; to: string } | null>(null);

  const resetDrill = useCallback((target: EndgameDrillDefinition) => {
    abortRef.current?.abort();
    stockfishService.cancelPending();
    chessRef.current = new Chess(target.fen);
    setFen(target.fen);
    setLanMoves([]);
    setFlipped(target.humanColor === 'b');
    setIsThinking(false);
    setResultText(null);
    setDrillWon(false);
    setLastMove(null);
    setPendingPromotion(null);
    setHintArrow(null);
  }, []);

  useEffect(() => {
    resetDrill(drill);
    return () => {
      abortRef.current?.abort();
      stockfishService.cancelPending();
    };
  }, [drill, resetDrill]);

  const chessInstance = useMemo(() => new Chess(fen), [fen]);
  const turn = chessInstance.turn();

  const checkedKingSquare = useMemo(() => {
    if (!chessInstance.isCheck()) return null;
    for (const row of chessInstance.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) {
          return cell.square;
        }
      }
    }
    return null;
  }, [chessInstance, turn]);

  const applyMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      const chess = chessRef.current;
      try {
        const move = chess.move({ from, to, promotion });
        setFen(chess.fen());
        setLanMoves((prev) => [...prev, move.lan]);
        setLastMove({ from: move.from, to: move.to, isCapture: move.isCapture() });
        setHintArrow(null);

        if (chess.isCheckmate()) {
          const winner: PlayerColor = chess.turn() === 'w' ? 'b' : 'w';
          const succeeded = drill.objective === 'win' && winner === drill.humanColor;
          setDrillWon(succeeded);
          setResultText(
            succeeded
              ? 'Checkmate! Drill completed.'
              : `${winner === 'w' ? 'White' : 'Black'} won by checkmate.`
          );
          if (succeeded) {
            setCompletedIds(markEndgameCompleted(drill.id));
            onStatsChange?.();
          }
          playChessSound('gameover', soundEnabled);
        } else if (chess.isDraw()) {
          const succeeded = drill.objective === 'draw';
          setDrillWon(succeeded);
          setResultText(
            succeeded
              ? 'Draw secured! Objective achieved.'
              : 'Game drawn — retry to force checkmate.'
          );
          if (succeeded) {
            setCompletedIds(markEndgameCompleted(drill.id));
            onStatsChange?.();
          }
          playChessSound('draw', soundEnabled);
        } else if (chess.isCheck()) {
          playChessSound('check', soundEnabled);
        } else if (move.isCapture()) {
          playChessSound('capture', soundEnabled);
        } else {
          playChessSound('move', soundEnabled);
        }
      } catch {
        playChessSound('illegal', soundEnabled);
      }
    },
    [drill.humanColor, drill.id, drill.objective, onStatsChange, soundEnabled]
  );

  // Stockfish Max plays the opposite side automatically
  useEffect(() => {
    if (resultText) return;
    if (turn === drill.humanColor) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsThinking(true);

    const start = performance.now();
    const maxLevel = STOCKFISH_LEVELS[9]; // Grandmaster Max

    stockfishService
      .getBestMove(lanMoves, { ...maxLevel, movetime: 420 }, controller.signal, drill.fen)
      .then(async (best) => {
        const elapsed = performance.now() - start;
        if (elapsed < 280) {
          await new Promise((r) => setTimeout(r, 280 - elapsed));
        }
        if (controller.signal.aborted) return;
        setIsThinking(false);
        applyMove(best.from as Square, best.to as Square, best.promotion);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsThinking(false);
        }
      });

    return () => {
      controller.abort();
      stockfishService.cancelPending();
      setIsThinking(false);
    };
  }, [applyMove, drill.fen, drill.humanColor, lanMoves, resultText, turn]);

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (resultText || turn !== drill.humanColor) return;
      const legal = chessInstance.moves({ square: from, verbose: true }).filter((m) => m.to === to);
      if (legal.length === 0) {
        playChessSound('illegal', soundEnabled);
        return;
      }
      if (legal.some((m) => Boolean(m.promotion))) {
        setPendingPromotion({ from, to, color: turn });
        return;
      }
      applyMove(from, to);
    },
    [applyMove, chessInstance, drill.humanColor, resultText, soundEnabled, turn]
  );

  const handleRequestHint = () => {
    if (resultText || turn !== drill.humanColor || isThinking) return;
    const controller = new AbortController();
    abortRef.current = controller;
    stockfishService
      .getHintMove(lanMoves, drill.fen, controller.signal)
      .then((best) => {
        if (!controller.signal.aborted) {
          setHintArrow({ from: best.from, to: best.to });
        }
      })
      .catch(() => {});
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      {/* Board Column */}
      <div className="flex flex-col items-center">
        <div className="w-full max-w-[580px] lg:max-w-[min(600px,calc(100vh-200px))] space-y-2.5">
          <div className="flex items-center justify-between rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3.5 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                {drill.title}
              </span>
              <span className="text-stone-400" aria-hidden="true">·</span>
              <span className="text-stone-500 dark:text-stone-400 whitespace-nowrap">
                vs Stockfish Max
              </span>
            </div>
            <span className="font-mono text-stone-600 dark:text-stone-300 whitespace-nowrap">
              {isThinking
                ? 'Stockfish thinking…'
                : resultText
                ? 'Finished'
                : `Your turn (${drill.humanColor === 'w' ? 'White' : 'Black'})`}
            </span>
          </div>

          <ChessBoard
            fen={fen}
            flipped={flipped}
            canInteract={!resultText && turn === drill.humanColor}
            activeTurn={turn}
            humanColor={drill.humanColor}
            lastMove={lastMove}
            checkedKingSquare={checkedKingSquare}
            theme={boardTheme}
            pieceSet={pieceSet}
            soundEnabled={soundEnabled}
            pendingPromotion={pendingPromotion}
            onAttemptMove={handleAttemptMove}
            onSelectPromotion={(p) => {
              if (!pendingPromotion) return;
              const { from, to } = pendingPromotion;
              setPendingPromotion(null);
              applyMove(from, to, p);
            }}
            onCancelPromotion={() => setPendingPromotion(null)}
            isReviewingHistory={false}
            onJumpToLive={() => {}}
            hintArrow={hintArrow}
          />
        </div>
      </div>

      {/* Drills Console */}
      <aside className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
              Endgame Drills
            </h2>
          </div>
          <span className="font-mono text-xs text-stone-500 dark:text-stone-400 tabular-nums">
            {completedIds.length}/{ENDGAME_DRILLS.length} mastered
          </span>
        </div>

        <div
          className={`rounded-lg border p-3 text-xs space-y-1.5 ${
            resultText
              ? drillWon
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                : 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
              : 'border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 text-stone-700 dark:text-stone-300'
          }`}
        >
          <div className="flex items-center justify-between font-semibold">
            <span>{resultText ? resultText : `Objective: ${drill.objective === 'win' ? 'Win' : 'Hold Draw'}`}</span>
            <span className="font-mono text-[11px] opacity-80">{drill.difficulty}</span>
          </div>
          <p className="text-[11px] opacity-90">{drill.goalDescription}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={Boolean(resultText) || turn !== drill.humanColor || isThinking}
            onClick={handleRequestHint}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            <span>Hint</span>
          </button>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors whitespace-nowrap"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Flip</span>
          </button>

          <button
            type="button"
            onClick={() => resetDrill(drill)}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>

        <div className="border-t border-stone-200 dark:border-stone-800 pt-3 space-y-1.5">
          <span className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
            Select Endgame Drill
          </span>
          {ENDGAME_DRILLS.map((item) => {
            const active = item.id === drill.id;
            const done = completedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100'
                    : 'border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{item.title}</div>
                  <div className="text-[11px] opacity-75">
                    {item.category} · {item.difficulty}
                  </div>
                </div>
                {done && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
};
