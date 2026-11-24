import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  Target,
} from 'lucide-react';
import { PUZZLES } from '../data/puzzles';
import type {
  BoardTheme,
  PendingPromotion,
  PieceSet,
  PlayerColor,
  PromotionPiece,
  PuzzleTheme,
} from '../types/chess';
import { playChessSound } from '../utils/sound';
import { loadPuzzleState, savePuzzleState, type StoredPuzzleState } from '../utils/storage';
import { ChessBoard } from './ChessBoard';

interface PuzzlesWorkspaceProps {
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  soundEnabled: boolean;
  onStatsChange?: () => void;
}

const THEMES: ('All' | PuzzleTheme)[] = [
  'All',
  'Mate in 1',
  'Mate in 2',
  'Fork & Tactics',
  'Pin & Skewer',
  'Sacrifice',
];

export const PuzzlesWorkspace: React.FC<PuzzlesWorkspaceProps> = ({
  boardTheme,
  pieceSet,
  soundEnabled,
  onStatsChange,
}) => {
  const [selectedTheme, setSelectedTheme] = useState<'All' | PuzzleTheme>('All');
  const [puzzleIdx, setPuzzleIdx] = useState<number>(0);
  const [stored, setStored] = useState<StoredPuzzleState>(() => loadPuzzleState());

  const filteredPuzzles = useMemo(() => {
    if (selectedTheme === 'All') return PUZZLES;
    return PUZZLES.filter((p) => p.theme === selectedTheme);
  }, [selectedTheme]);

  const puzzle = filteredPuzzles[puzzleIdx % filteredPuzzles.length] ?? PUZZLES[0];

  const [fen, setFen] = useState<string>(puzzle.fen);
  const [stepIndex, setStepIndex] = useState<number>(0); // index in puzzle.solution
  const [status, setStatus] = useState<'playing' | 'wrong' | 'solved'>('playing');
  const [hintTier, setHintTier] = useState<0 | 1 | 2 | 3>(0);
  const [hadMistake, setHadMistake] = useState<boolean>(false);
  const [lastMove, setLastMove] = useState<{
    from: string;
    to: string;
    isCapture?: boolean;
  } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const replyTimerRef = useRef<number | null>(null);

  const playerColor: PlayerColor = useMemo(() => {
    return puzzle.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  }, [puzzle.fen]);

  const resetPuzzle = useCallback(
    (target = puzzle) => {
      if (replyTimerRef.current) {
        window.clearTimeout(replyTimerRef.current);
        replyTimerRef.current = null;
      }
      setFen(target.fen);
      setStepIndex(0);
      setStatus('playing');
      setHintTier(0);
      setHadMistake(false);
      setLastMove(null);
      setPendingPromotion(null);
    },
    [puzzle]
  );

  useEffect(() => {
    resetPuzzle(puzzle);
    return () => {
      if (replyTimerRef.current) {
        window.clearTimeout(replyTimerRef.current);
      }
    };
  }, [puzzle, resetPuzzle]);

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

  const executePuzzleMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      const expectedUci = puzzle.solution[stepIndex];
      if (!expectedUci) return;

      const temp = new Chess(fen);
      let played;
      try {
        played = temp.move({ from, to, promotion });
      } catch {
        playChessSound('illegal', soundEnabled);
        return;
      }

      // Check if played move matches expected solution OR delivers immediate checkmate
      const isExpected = played.lan === expectedUci || temp.isCheckmate();

      if (!isExpected) {
        playChessSound('illegal', soundEnabled);
        setStatus('wrong');
        setHadMistake(true);
        if (stored.streak > 0) {
          const nextState: StoredPuzzleState = { ...stored, streak: 0 };
          setStored(nextState);
          savePuzzleState(nextState);
          onStatsChange?.();
        }
        return;
      }

      // Correct move!
      setFen(temp.fen());
      setLastMove({ from: played.from, to: played.to, isCapture: played.isCapture() });
      setHintTier(0);

      if (temp.isCheck()) playChessSound('check', soundEnabled);
      else if (played.isCapture()) playChessSound('capture', soundEnabled);
      else playChessSound('move', soundEnabled);

      const nextStep = stepIndex + 1;
      if (nextStep >= puzzle.solution.length || temp.isCheckmate()) {
        setStatus('solved');
        playChessSound('gameover', soundEnabled);

        const nextSolved = stored.solvedIds.includes(puzzle.id)
          ? stored.solvedIds
          : [...stored.solvedIds, puzzle.id];
        const nextStreak = hadMistake ? stored.streak : stored.streak + 1;
        const nextBest = Math.max(stored.bestStreak, nextStreak);
        const nextState: StoredPuzzleState = {
          solvedIds: nextSolved,
          streak: nextStreak,
          bestStreak: nextBest,
        };
        setStored(nextState);
        savePuzzleState(nextState);
        onStatsChange?.();
        return;
      }

      setStepIndex(nextStep);
      setStatus('playing');

      // Auto-play opponent's reply move
      const oppUci = puzzle.solution[nextStep];
      if (oppUci) {
        replyTimerRef.current = window.setTimeout(() => {
          const afterOpp = new Chess(temp.fen());
          try {
            const oppMove = afterOpp.move({
              from: oppUci.slice(0, 2) as Square,
              to: oppUci.slice(2, 4) as Square,
              promotion: (oppUci[4] as PromotionPiece | undefined) || undefined,
            });
            setFen(afterOpp.fen());
            setLastMove({
              from: oppMove.from,
              to: oppMove.to,
              isCapture: oppMove.isCapture(),
            });
            setStepIndex(nextStep + 1);
            if (afterOpp.isCheck()) playChessSound('check', soundEnabled);
            else if (oppMove.isCapture()) playChessSound('capture', soundEnabled);
            else playChessSound('move', soundEnabled);
          } catch {
            // ignore
          }
        }, 320);
      }
    },
    [fen, hadMistake, onStatsChange, puzzle.id, puzzle.solution, soundEnabled, stepIndex, stored]
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (status === 'solved' || turn !== playerColor) return;
      const legal = chessInstance.moves({ square: from, verbose: true }).filter((m) => m.to === to);
      if (legal.length === 0) {
        playChessSound('illegal', soundEnabled);
        return;
      }
      if (legal.some((m) => Boolean(m.promotion))) {
        setPendingPromotion({ from, to, color: turn });
        return;
      }
      executePuzzleMove(from, to);
    },
    [chessInstance, executePuzzleMove, playerColor, soundEnabled, status, turn]
  );

  const expectedMove = puzzle.solution[stepIndex];
  const hintHighlight =
    hintTier === 2 && expectedMove
      ? [{ square: expectedMove.slice(0, 2) as Square, color: 'amber' as const }]
      : [];
  const hintArrow =
    hintTier === 3 && expectedMove
      ? { from: expectedMove.slice(0, 2), to: expectedMove.slice(2, 4) }
      : null;

  const isAlreadySolved = stored.solvedIds.includes(puzzle.id);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      {/* Board Column */}
      <div className="flex flex-col items-center">
        <div className="w-full max-w-[580px] lg:max-w-[min(600px,calc(100vh-200px))] space-y-2.5">
          <div className="flex items-center justify-between rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3.5 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                {puzzle.title}
              </span>
              <span className="text-stone-400" aria-hidden="true">·</span>
              <span className="text-stone-500 dark:text-stone-400 whitespace-nowrap">
                {puzzle.theme}
              </span>
            </div>
            <span className="font-mono font-semibold text-stone-700 dark:text-stone-300 tabular-nums shrink-0">
              {playerColor === 'w' ? 'White to move' : 'Black to move'}
            </span>
          </div>

          <ChessBoard
            fen={fen}
            flipped={playerColor === 'b'}
            canInteract={status !== 'solved' && turn === playerColor}
            activeTurn={turn}
            humanColor={playerColor}
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
              executePuzzleMove(from, to, p);
            }}
            onCancelPromotion={() => setPendingPromotion(null)}
            isReviewingHistory={false}
            onJumpToLive={() => {}}
            hintArrow={hintArrow}
            highlights={hintHighlight}
          />
        </div>
      </div>

      {/* Puzzle Console Sidebar */}
      <aside className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
              Tactical Puzzles
            </h2>
          </div>
          <span className="font-mono text-xs text-stone-500 dark:text-stone-400 tabular-nums">
            {stored.solvedIds.length}/{PUZZLES.length} solved
          </span>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-2 py-2">
            <div className="text-[10px] text-stone-500 dark:text-stone-400">Streak</div>
            <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {stored.streak}
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-2 py-2">
            <div className="text-[10px] text-stone-500 dark:text-stone-400">Best Streak</div>
            <div className="font-mono text-base font-bold text-stone-900 dark:text-stone-100 tabular-nums">
              {stored.bestStreak}
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-2 py-2">
            <div className="text-[10px] text-stone-500 dark:text-stone-400">Rating</div>
            <div className="font-mono text-base font-bold text-stone-900 dark:text-stone-100 tabular-nums">
              {puzzle.rating}
            </div>
          </div>
        </div>

        {/* Theme Filter */}
        <div>
          <span className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">
            Puzzle Theme
          </span>
          <div className="grid grid-cols-3 gap-1">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setSelectedTheme(t);
                  setPuzzleIdx(0);
                }}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors truncate ${
                  selectedTheme === t
                    ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
                    : 'border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/60 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Status Banner */}
        <div
          className={`rounded-lg border p-3 text-xs space-y-1 ${
            status === 'solved'
              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
              : status === 'wrong'
              ? 'border-red-300 dark:border-red-900 bg-red-50/80 dark:bg-red-950/50 text-red-800 dark:text-red-200'
              : 'border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 text-stone-700 dark:text-stone-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2 font-semibold">
            <span className="inline-flex items-center gap-1.5">
              {status === 'solved' && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
              <span>
                {status === 'solved'
                  ? 'Puzzle Solved'
                  : status === 'wrong'
                  ? 'Not quite — try another move'
                  : `Find the best move for ${playerColor === 'w' ? 'White' : 'Black'}`}
              </span>
            </span>
            <span className="font-mono text-[11px] opacity-80">
              {puzzle.difficulty}
            </span>
          </div>
          {hintTier >= 1 && (
            <p className="text-[11px] opacity-90 pt-1">
              {puzzle.hintText}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={status === 'solved'}
            onClick={() => setHintTier((h) => (h < 3 ? ((h + 1) as 1 | 2 | 3) : 3))}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            {hintTier === 0 ? (
              <HelpCircle className="w-3.5 h-3.5" />
            ) : (
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            )}
            <span>
              {hintTier === 0
                ? 'Clue'
                : hintTier === 1
                ? 'Piece'
                : hintTier === 2
                ? 'Arrow'
                : 'Shown'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => resetPuzzle(puzzle)}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>

          <button
            type="button"
            onClick={() => setPuzzleIdx((i) => (i + 1) % filteredPuzzles.length)}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Puzzle List Quick Selector */}
        <div className="border-t border-stone-200 dark:border-stone-800 pt-3">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-stone-700 dark:text-stone-300">
            <span>Puzzle Deck</span>
            {isAlreadySolved && (
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                Completed
              </span>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
            {filteredPuzzles.map((item, idx) => {
              const active = item.id === puzzle.id;
              const solved = stored.solvedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPuzzleIdx(idx)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                    active
                      ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100'
                      : 'border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <span className="truncate font-medium">
                    {idx + 1}. {item.title}
                  </span>
                  <span className="flex items-center gap-2 shrink-0 font-mono text-[11px] tabular-nums">
                    <span className="opacity-70">{item.rating}</span>
                    {solved && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
};
