import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Heart,
  HelpCircle,
  Lightbulb,
  Play,
  RotateCcw,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { PUZZLES } from '../data/puzzles';
import type {
  BoardTheme,
  PendingPromotion,
  PieceSet,
  PlayerColor,
  PromotionPiece,
  PuzzleDefinition,
  PuzzleTheme,
} from '../types/chess';
import {
  loadArcadeState,
  recordDailyProgress,
  recordPuzzleRushResult,
} from '../utils/arcadeProgress';
import { playChessSound } from '../utils/sound';
import { loadPuzzleState, savePuzzleState, type StoredPuzzleState } from '../utils/storage';
import { ChessBoard } from './ChessBoard';

interface PuzzlesWorkspaceProps {
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  soundEnabled: boolean;
  onStatsChange?: () => void;
}

type PuzzleSubMode = 'classic' | 'rush';
type RushPhase = 'idle' | 'active' | 'finished';

const RUSH_DURATION_SEC = 180;
const RUSH_MAX_LIVES = 3;

const THEMES: ('All' | PuzzleTheme)[] = [
  'All',
  'Mate in 1',
  'Mate in 2',
  'Fork & Tactics',
  'Pin & Skewer',
  'Sacrifice',
];

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildEscalatingRushDeck(): PuzzleDefinition[] {
  const easy = shuffleArray(PUZZLES.filter((p) => p.rating <= 1050));
  const medium = shuffleArray(PUZZLES.filter((p) => p.rating > 1050 && p.rating <= 1350));
  const hard = shuffleArray(PUZZLES.filter((p) => p.rating > 1350));
  return [...easy, ...medium, ...hard];
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export const PuzzlesWorkspace: React.FC<PuzzlesWorkspaceProps> = ({
  boardTheme,
  pieceSet,
  soundEnabled,
  onStatsChange,
}) => {
  const [subMode, setSubMode] = useState<PuzzleSubMode>('classic');
  const [selectedTheme, setSelectedTheme] = useState<'All' | PuzzleTheme>('All');
  const [puzzleIdx, setPuzzleIdx] = useState<number>(0);
  const [stored, setStored] = useState<StoredPuzzleState>(() => loadPuzzleState());
  const [arcadeState, setArcadeState] = useState(() => loadArcadeState());

  // Rush mode state
  const [rushPhase, setRushPhase] = useState<RushPhase>('idle');
  const [rushDeck, setRushDeck] = useState<PuzzleDefinition[]>(() => buildEscalatingRushDeck());
  const [rushIdx, setRushIdx] = useState<number>(0);
  const [rushSecondsLeft, setRushSecondsLeft] = useState<number>(RUSH_DURATION_SEC);
  const [rushLives, setRushLives] = useState<number>(RUSH_MAX_LIVES);
  const [rushSolved, setRushSolved] = useState<number>(0);
  const [rushStreak, setRushStreak] = useState<number>(0);
  const [rushBestStreakInRun, setRushBestStreakInRun] = useState<number>(0);
  const [rushEndReason, setRushEndReason] = useState<'time' | 'strikes' | null>(null);
  const [rushIsNewBest, setRushIsNewBest] = useState<boolean>(false);

  const rushScoreRef = useRef(0);
  const rushBestStreakRef = useRef(0);
  const rushTransitionTimerRef = useRef<number | null>(null);

  const filteredPuzzles = useMemo(() => {
    if (selectedTheme === 'All') return PUZZLES;
    return PUZZLES.filter((p) => p.theme === selectedTheme);
  }, [selectedTheme]);

  const classicPuzzle = filteredPuzzles[puzzleIdx % filteredPuzzles.length] ?? PUZZLES[0];
  const rushPuzzle = rushDeck[rushIdx % rushDeck.length] ?? PUZZLES[0];
  const puzzle = subMode === 'rush' ? rushPuzzle : classicPuzzle;

  const [fen, setFen] = useState<string>(puzzle.fen);
  const [stepIndex, setStepIndex] = useState<number>(0);
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

  const clearTimers = useCallback(() => {
    if (replyTimerRef.current) {
      window.clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
    }
    if (rushTransitionTimerRef.current) {
      window.clearTimeout(rushTransitionTimerRef.current);
      rushTransitionTimerRef.current = null;
    }
  }, []);

  const resetPuzzle = useCallback(
    (target = puzzle) => {
      clearTimers();
      setFen(target.fen);
      setStepIndex(0);
      setStatus('playing');
      setHintTier(0);
      setHadMistake(false);
      setLastMove(null);
      setPendingPromotion(null);
    },
    [clearTimers, puzzle]
  );

  useEffect(() => {
    resetPuzzle(puzzle);
    return () => {
      clearTimers();
    };
  }, [clearTimers, puzzle, resetPuzzle]);

  const finishRush = useCallback(
    (reason: 'time' | 'strikes') => {
      clearTimers();
      setRushPhase('finished');
      setRushEndReason(reason);
      const { state, isNewBest } = recordPuzzleRushResult(
        rushScoreRef.current,
        rushBestStreakRef.current
      );
      setArcadeState(state);
      setRushIsNewBest(isNewBest);
      playChessSound('gameover', soundEnabled);
      onStatsChange?.();
    },
    [clearTimers, onStatsChange, soundEnabled]
  );

  const startRush = useCallback(() => {
    clearTimers();
    const deck = buildEscalatingRushDeck();
    setRushDeck(deck);
    setRushIdx(0);
    setRushSecondsLeft(RUSH_DURATION_SEC);
    setRushLives(RUSH_MAX_LIVES);
    setRushSolved(0);
    setRushStreak(0);
    setRushBestStreakInRun(0);
    setRushEndReason(null);
    setRushIsNewBest(false);
    rushScoreRef.current = 0;
    rushBestStreakRef.current = 0;
    setRushPhase('active');

    const first = deck[0] ?? PUZZLES[0];
    setFen(first.fen);
    setStepIndex(0);
    setStatus('playing');
    setHintTier(0);
    setLastMove(null);
    setPendingPromotion(null);
  }, [clearTimers]);

  // 1-second Rush timer
  useEffect(() => {
    if (subMode !== 'rush' || rushPhase !== 'active') return;
    const id = window.setInterval(() => {
      setRushSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          finishRush('time');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [finishRush, rushPhase, subMode]);

  const handleSwitchMode = useCallback(
    (nextMode: PuzzleSubMode) => {
      clearTimers();
      setSubMode(nextMode);
      if (nextMode === 'classic') {
        setRushPhase('idle');
      }
    },
    [clearTimers]
  );

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
      if (subMode === 'rush' && rushPhase !== 'active') return;

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

      const isExpected = played.lan === expectedUci || temp.isCheckmate();

      if (!isExpected) {
        playChessSound('illegal', soundEnabled);
        setStatus('wrong');

        if (subMode === 'rush') {
          const nextLives = rushLives - 1;
          setRushLives(nextLives);
          setRushStreak(0);
          if (nextLives <= 0) {
            finishRush('strikes');
          } else {
            rushTransitionTimerRef.current = window.setTimeout(() => {
              setRushIdx((idx) => idx + 1);
            }, 380);
          }
          return;
        }

        setHadMistake(true);
        if (stored.streak > 0) {
          const nextState: StoredPuzzleState = { ...stored, streak: 0 };
          setStored(nextState);
          savePuzzleState(nextState);
          onStatsChange?.();
        }
        return;
      }

      // Correct move
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

        const updatedArcade = recordDailyProgress({
          addPuzzlesSolved: 1,
          bonusXp: 15,
        });
        setArcadeState(updatedArcade);
        onStatsChange?.();

        if (subMode === 'rush') {
          const nextRushSolved = rushSolved + 1;
          const nextRushStreak = rushStreak + 1;
          const nextBestRushStreak = Math.max(rushBestStreakInRun, nextRushStreak);
          rushScoreRef.current = nextRushSolved;
          rushBestStreakRef.current = nextBestRushStreak;
          setRushSolved(nextRushSolved);
          setRushStreak(nextRushStreak);
          setRushBestStreakInRun(nextBestRushStreak);

          rushTransitionTimerRef.current = window.setTimeout(() => {
            setRushIdx((idx) => idx + 1);
          }, 300);
        }
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
        }, 280);
      }
    },
    [
      fen,
      finishRush,
      hadMistake,
      onStatsChange,
      puzzle.id,
      puzzle.solution,
      rushBestStreakInRun,
      rushLives,
      rushPhase,
      rushSolved,
      rushStreak,
      soundEnabled,
      stepIndex,
      stored,
      subMode,
    ]
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (subMode === 'rush' && rushPhase !== 'active') return;
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
    [chessInstance, executePuzzleMove, playerColor, rushPhase, soundEnabled, status, subMode, turn]
  );

  const expectedMove = puzzle.solution[stepIndex];
  const hintHighlight =
    subMode === 'classic' && hintTier === 2 && expectedMove
      ? [{ square: expectedMove.slice(0, 2) as Square, color: 'amber' as const }]
      : [];
  const hintArrow =
    subMode === 'classic' && hintTier === 3 && expectedMove
      ? { from: expectedMove.slice(0, 2), to: expectedMove.slice(2, 4) }
      : null;

  const isAlreadySolved = stored.solvedIds.includes(puzzle.id);
  const canBoardInteract =
    subMode === 'rush'
      ? rushPhase === 'active' && status === 'playing' && turn === playerColor
      : status !== 'solved' && turn === playerColor;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      {/* Board Column */}
      <div className="flex flex-col items-center">
        <div className="w-full max-w-[580px] lg:max-w-[min(600px,calc(100vh-200px))] space-y-2.5">
          {subMode === 'rush' ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3.5 py-2 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center gap-1.5 font-mono font-bold text-sm tabular-nums text-stone-900 dark:text-stone-100">
                  <Clock
                    className={`w-4 h-4 ${
                      rushPhase === 'active' && rushSecondsLeft <= 20
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span
                    className={
                      rushPhase === 'active' && rushSecondsLeft <= 20
                        ? 'text-red-600 dark:text-red-400'
                        : ''
                    }
                  >
                    {formatCountdown(rushSecondsLeft)}
                  </span>
                </span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {rushSolved} solved
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1" aria-label={`${rushLives} lives left`}>
                  {Array.from({ length: RUSH_MAX_LIVES }).map((_, idx) => (
                    <Heart
                      key={idx}
                      className={`w-4 h-4 ${
                        idx < rushLives
                          ? 'fill-red-500 text-red-500'
                          : 'text-stone-300 dark:text-stone-700'
                      }`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <span className="font-mono font-semibold text-stone-600 dark:text-stone-300 tabular-nums">
                  {playerColor === 'w' ? 'White' : 'Black'}
                </span>
              </div>
            </div>
          ) : (
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
          )}

          <div className="relative">
            <ChessBoard
              fen={fen}
              flipped={playerColor === 'b'}
              canInteract={canBoardInteract}
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

            {subMode === 'rush' && rushPhase !== 'active' && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-stone-950/75 p-4">
                <div className="w-full max-w-sm rounded-xl border border-stone-700 bg-stone-900 p-5 text-center text-stone-100 shadow-lg space-y-3">
                  {rushPhase === 'idle' ? (
                    <>
                      <Zap className="w-8 h-8 text-amber-400 mx-auto" aria-hidden="true" />
                      <h3 className="font-display text-lg font-bold">3-Minute Puzzle Rush</h3>
                      <p className="text-xs text-stone-300 leading-relaxed">
                        Solve as many escalating tactical puzzles as possible in 3:00. Three
                        wrong moves end the run.
                      </p>
                      <div className="grid grid-cols-2 gap-2 rounded-lg border border-stone-800 bg-stone-950/60 p-2.5 text-xs">
                        <div>
                          <div className="text-[10px] text-stone-400">Best Score</div>
                          <div className="font-mono font-bold text-emerald-400 tabular-nums">
                            {arcadeState.puzzleRushBestScore}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-stone-400">Best Streak</div>
                          <div className="font-mono font-bold text-stone-100 tabular-nums">
                            {arcadeState.puzzleRushBestStreak}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={startRush}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 px-4 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors"
                      >
                        <Play className="w-4 h-4" aria-hidden="true" />
                        <span>Start 3-Min Rush</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <Trophy className="w-8 h-8 text-amber-400 mx-auto" aria-hidden="true" />
                      <div>
                        <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300">
                          {rushEndReason === 'strikes' ? 'Three Strikes' : "Time's Up"}
                        </div>
                        <h3 className="font-display text-xl font-bold mt-0.5">
                          {rushSolved} Puzzles Solved
                        </h3>
                        {rushIsNewBest && rushSolved > 0 && (
                          <div className="mt-1 text-xs font-semibold text-emerald-400">
                            New Personal Best!
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 rounded-lg border border-stone-800 bg-stone-950/60 p-2.5 text-xs">
                        <div>
                          <div className="text-[10px] text-stone-400">Solved</div>
                          <div className="font-mono font-bold text-emerald-400 tabular-nums">
                            {rushSolved}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-stone-400">Run Streak</div>
                          <div className="font-mono font-bold text-stone-100 tabular-nums">
                            {rushBestStreakInRun}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-stone-400">All-Time</div>
                          <div className="font-mono font-bold text-amber-300 tabular-nums">
                            {arcadeState.puzzleRushBestScore}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={startRush}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 px-4 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" aria-hidden="true" />
                        <span>Run Again</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Puzzle Console Sidebar */}
      <aside className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-4">
        {/* Sub-Mode Switcher */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 p-1">
          <button
            type="button"
            onClick={() => handleSwitchMode('classic')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              subMode === 'classic'
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Classic Tactics</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('rush')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              subMode === 'rush'
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            <span>3-Min Rush</span>
          </button>
        </div>

        {subMode === 'rush' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-500" aria-hidden="true" />
                <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                  Puzzle Rush Console
                </h2>
              </div>
              <span className="font-mono text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                +15 XP / solve
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-2 py-2">
                <div className="text-[10px] text-stone-500 dark:text-stone-400">Run Score</div>
                <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {rushSolved}
                </div>
              </div>
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-2 py-2">
                <div className="text-[10px] text-stone-500 dark:text-stone-400">Streak</div>
                <div className="font-mono text-base font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                  {rushStreak}
                </div>
              </div>
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-2 py-2">
                <div className="text-[10px] text-stone-500 dark:text-stone-400">Best Rush</div>
                <div className="font-mono text-base font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {arcadeState.puzzleRushBestScore}
                </div>
              </div>
            </div>

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
                <span>
                  {rushPhase === 'idle'
                    ? 'Ready when you are'
                    : rushPhase === 'finished'
                    ? `Final Score: ${rushSolved} solved`
                    : status === 'solved'
                    ? 'Correct! Next puzzle...'
                    : status === 'wrong'
                    ? 'Strike! Moving on...'
                    : `${puzzle.title} (${puzzle.rating})`}
                </span>
                <span className="font-mono text-[11px] opacity-80">{puzzle.theme}</span>
              </div>
              <p className="text-[11px] opacity-85">
                {rushPhase === 'active'
                  ? `Find the winning continuation for ${playerColor === 'w' ? 'White' : 'Black'}.`
                  : 'Puzzles scale from 1100 to 1700+ rating as you solve.'}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={startRush}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
              >
                {rushPhase === 'active' ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Restart Rush</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Start 3-Min Rush</span>
                  </>
                )}
              </button>
              {rushPhase === 'active' && (
                <button
                  type="button"
                  onClick={() => finishRush('time')}
                  className="inline-flex items-center justify-center rounded-lg border border-stone-200 dark:border-stone-700 px-3 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
                >
                  End Run
                </button>
              )}
            </div>

            <div className="border-t border-stone-200 dark:border-stone-800 pt-3 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span>All-Time Best Streak</span>
              <span className="font-mono font-bold text-stone-800 dark:text-stone-200 tabular-nums">
                {arcadeState.puzzleRushBestStreak} in a row
              </span>
            </div>
          </div>
        ) : (
          <>
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
                  {status === 'solved' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span>
                    {status === 'solved'
                      ? 'Puzzle Solved (+15 XP)'
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
                <span>Puzzle Deck ({filteredPuzzles.length})</span>
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
          </>
        )}
      </aside>
    </div>
  );
};

