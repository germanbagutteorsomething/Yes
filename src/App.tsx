import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import {
  ArrowUpDown,
  BarChart3,
  Bot,
  ChevronRight,
  Cpu,
  FileDown,
  Flag,
  Handshake,
  Loader2,
  Moon,
  RotateCcw,
  Sun,
  Undo2,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ChessBoard } from './components/ChessBoard';
import { EvalBar } from './components/EvalBar';
import { MatchAnalysisPanel } from './components/MatchAnalysisPanel';
import { MoveHistoryPanel } from './components/MoveHistoryPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PlayerBar } from './components/PlayerBar';
import { PWAInstallButton } from './components/PWAInstallButton';
import { getBotMove } from './engine/botService';
import { stockfishService } from './engine/stockfishService';
import {
  BOT_PROFILES,
  STOCKFISH_LEVELS,
  TIME_CONTROLS,
  type BoardTheme,
  type BotId,
  type GameMode,
  type GameResult,
  type MatchAnalysisResult,
  type MoveRecord,
  type OpponentKind,
  type PendingPromotion,
  type PlayerColor,
  type PromotionPiece,
  type SideChoice,
  type StockfishLevelNumber,
  type TimeControlId,
} from './types/chess';
import { playChessSound } from './utils/sound';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const STARTING_COUNTS: Record<Exclude<PieceSymbol, 'k'>, number> = {
  q: 1,
  r: 2,
  b: 2,
  n: 2,
  p: 8,
};

const CAPTURE_ORDER: Exclude<PieceSymbol, 'k'>[] = ['q', 'r', 'b', 'n', 'p'];

function computeMaterialAndCaptures(fen: string) {
  const temp = new Chess();
  try {
    temp.load(fen);
  } catch {
    // fallback
  }

  const onBoard: Record<PlayerColor, Record<PieceSymbol, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };

  for (const row of temp.board()) {
    for (const cell of row) {
      if (cell) {
        onBoard[cell.color][cell.type] += 1;
      }
    }
  }

  const capturedByWhite: PieceSymbol[] = [];
  const capturedByBlack: PieceSymbol[] = [];

  for (const pieceType of CAPTURE_ORDER) {
    const missingBlack = Math.max(0, STARTING_COUNTS[pieceType] - onBoard.b[pieceType]);
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(pieceType);

    const missingWhite = Math.max(0, STARTING_COUNTS[pieceType] - onBoard.w[pieceType]);
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(pieceType);
  }

  let whiteMaterial = 0;
  let blackMaterial = 0;
  for (const pieceType of ['p', 'n', 'b', 'r', 'q'] as PieceSymbol[]) {
    whiteMaterial += onBoard.w[pieceType] * PIECE_VALUES[pieceType];
    blackMaterial += onBoard.b[pieceType] * PIECE_VALUES[pieceType];
  }

  return {
    capturedByWhite,
    capturedByBlack,
    whiteLead: Math.max(0, whiteMaterial - blackMaterial),
    blackLead: Math.max(0, blackMaterial - whiteMaterial),
  };
}

function findCheckedKingSquare(fen: string): Square | null {
  const temp = new Chess();
  try {
    temp.load(fen);
  } catch {
    return null;
  }
  if (!temp.isCheck()) return null;
  const turn = temp.turn();
  const board = temp.board();
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === turn) {
        return cell.square;
      }
    }
  }
  return null;
}

function evaluateGameEnd(chess: Chess): GameResult | null {
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
  if (chess.isStalemate()) {
    return {
      winner: 'draw',
      reason: 'stalemate',
      headline: 'Draw by Stalemate',
      detail: `${chess.turn() === 'w' ? 'White' : 'Black'} has no legal moves and is not in check.`,
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
  if (chess.isInsufficientMaterial()) {
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

function hasSufficientMaterialForTimeout(chess: Chess, color: PlayerColor): boolean {
  let knights = 0;
  let bishops = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== color) continue;
      if (cell.type === 'p' || cell.type === 'r' || cell.type === 'q') {
        return true;
      }
      if (cell.type === 'n') knights += 1;
      if (cell.type === 'b') bishops += 1;
    }
  }
  return bishops >= 2 || (bishops >= 1 && knights >= 1) || knights >= 3;
}

function resolveSideChoice(choice: SideChoice): PlayerColor {
  if (choice === 'random') {
    return Math.random() < 0.5 ? 'w' : 'b';
  }
  return choice;
}

export default function App() {
  const chessRef = useRef<Chess>(new Chess());
  const engineAbortRef = useRef<AbortController | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);

  const [gameMode, setGameMode] = useState<GameMode>('stockfish');
  const [opponentKind, setOpponentKind] = useState<OpponentKind>('stockfish');
  const [stockfishLevel, setStockfishLevel] = useState<StockfishLevelNumber>(4);
  const [selectedBotId, setSelectedBotId] = useState<BotId>('tara');
  const [sideChoice, setSideChoice] = useState<SideChoice>('w');
  const [humanColor, setHumanColor] = useState<PlayerColor>('w');
  const [timeControlId, setTimeControlId] = useState<TimeControlId>('blitz-5');
  const [autoFlipTwoPlayer, setAutoFlipTwoPlayer] = useState<boolean>(false);
  const [flipped, setFlipped] = useState<boolean>(false);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>('tournament');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(false);

  const [fen, setFen] = useState<string>(INITIAL_FEN);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [turn, setTurn] = useState<PlayerColor>('w');
  const [isCheck, setIsCheck] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [isEngineThinking, setIsEngineThinking] = useState<boolean>(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [clocksMs, setClocksMs] = useState<{ w: number; b: number }>({
    w: 300_000,
    b: 300_000,
  });

  const [analysisResult, setAnalysisResult] = useState<MatchAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 0 });
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      engineAbortRef.current?.abort();
      analysisAbortRef.current?.abort();
      stockfishService.terminate();
    };
  }, []);

  const currentLevelConfig = useMemo(
    () => STOCKFISH_LEVELS.find((l) => l.level === stockfishLevel) ?? STOCKFISH_LEVELS[3],
    [stockfishLevel]
  );

  const currentBot = useMemo(
    () => BOT_PROFILES.find((b) => b.id === selectedBotId) ?? BOT_PROFILES[2],
    [selectedBotId]
  );

  const currentTimeControl = useMemo(
    () => TIME_CONTROLS.find((t) => t.id === timeControlId) ?? TIME_CONTROLS[4],
    [timeControlId]
  );

  // Active move timer / chess clock tick
  useEffect(() => {
    if (currentTimeControl.id === 'none') return;
    if (gameResult) return;
    if (moves.length === 0) return;

    let lastTick = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const delta = now - lastTick;
      lastTick = now;

      setClocksMs((prev) => {
        const nextRemaining = Math.max(0, prev[turn] - delta);
        if (nextRemaining === 0 && prev[turn] > 0) {
          // Flag fell! Check FIDE timeout vs insufficient material rule
          const opponent: PlayerColor = turn === 'w' ? 'b' : 'w';
          const opponentCanWin = hasSufficientMaterialForTimeout(
            chessRef.current,
            opponent
          );

          engineAbortRef.current?.abort();
          stockfishService.cancelPending();
          setIsEngineThinking(false);
          setPendingPromotion(null);

          if (opponentCanWin) {
            const winnerName = opponent === 'w' ? 'White' : 'Black';
            const loserName = turn === 'w' ? 'White' : 'Black';
            setGameResult({
              winner: opponent,
              reason: 'timeout',
              headline: `${winnerName} wins on Time`,
              detail: `${loserName}'s move timer expired.`,
            });
            playChessSound('gameover', soundEnabled);
          } else {
            setGameResult({
              winner: 'draw',
              reason: 'timeout',
              headline: 'Draw by Timeout vs Insufficient Material',
              detail: 'Timer expired, but the opponent lacks mating material.',
            });
            playChessSound('draw', soundEnabled);
          }
        }
        return { ...prev, [turn]: nextRemaining };
      });
    }, 100);

    return () => window.clearInterval(interval);
  }, [currentTimeControl.id, gameResult, moves.length, soundEnabled, turn]);

  const startNewGame = useCallback(
    (overrides?: {
      mode?: GameMode;
      opponentKind?: OpponentKind;
      side?: SideChoice;
      level?: StockfishLevelNumber;
      botId?: BotId;
      timeControl?: TimeControlId;
    }) => {
      engineAbortRef.current?.abort();
      analysisAbortRef.current?.abort();
      stockfishService.cancelPending();

      const nextMode = overrides?.mode ?? gameMode;
      const nextSide = overrides?.side ?? sideChoice;
      const nextTcId = overrides?.timeControl ?? timeControlId;
      const nextTc = TIME_CONTROLS.find((t) => t.id === nextTcId) ?? TIME_CONTROLS[4];
      const resolvedHuman = nextMode === 'stockfish' ? resolveSideChoice(nextSide) : 'w';

      if (overrides?.mode !== undefined) setGameMode(overrides.mode);
      if (overrides?.opponentKind !== undefined) setOpponentKind(overrides.opponentKind);
      if (overrides?.side !== undefined) setSideChoice(overrides.side);
      if (overrides?.level !== undefined) setStockfishLevel(overrides.level);
      if (overrides?.botId !== undefined) setSelectedBotId(overrides.botId);
      if (overrides?.timeControl !== undefined) setTimeControlId(overrides.timeControl);

      chessRef.current = new Chess();
      setHumanColor(resolvedHuman);
      setFlipped(nextMode === 'stockfish' ? resolvedHuman === 'b' : false);
      setFen(INITIAL_FEN);
      setMoves([]);
      setTurn('w');
      setIsCheck(false);
      setGameResult(null);
      setPendingPromotion(null);
      setViewIndex(null);
      setIsEngineThinking(false);
      setEngineError(null);
      setAnalysisResult(null);
      setIsAnalyzing(false);
      setAnalysisError(null);
      setAnalysisProgress({ completed: 0, total: 0 });
      setClocksMs({
        w: nextTc.baseSeconds * 1000,
        b: nextTc.baseSeconds * 1000,
      });
    },
    [gameMode, sideChoice, timeControlId]
  );

  const syncFromChess = useCallback(
    (newMoveRecord?: MoveRecord) => {
      const chess = chessRef.current;
      const nextFen = chess.fen();
      const nextTurn = chess.turn();
      const nextCheck = chess.isCheck();
      const result = evaluateGameEnd(chess);

      setFen(nextFen);
      setTurn(nextTurn);
      setIsCheck(nextCheck);
      setGameResult(result);
      setViewIndex(null);

      if (newMoveRecord) {
        setMoves((prev) => [...prev, newMoveRecord]);
        setAnalysisResult(null);
        setAnalysisError(null);

        if (currentTimeControl.id !== 'none' && !result) {
          setClocksMs((prev) => {
            if (currentTimeControl.perMove) {
              return {
                ...prev,
                [newMoveRecord.color]: currentTimeControl.baseSeconds * 1000,
              };
            }
            if (currentTimeControl.incrementSeconds > 0) {
              return {
                ...prev,
                [newMoveRecord.color]:
                  prev[newMoveRecord.color] + currentTimeControl.incrementSeconds * 1000,
              };
            }
            return prev;
          });
        }

        if (result) {
          playChessSound(result.winner === 'draw' ? 'draw' : 'gameover', soundEnabled);
        } else if (newMoveRecord.isCheck) {
          playChessSound('check', soundEnabled);
        } else if (newMoveRecord.isPromotion) {
          playChessSound('promote', soundEnabled);
        } else if (newMoveRecord.isCastle) {
          playChessSound('castle', soundEnabled);
        } else if (newMoveRecord.isCapture) {
          playChessSound('capture', soundEnabled);
        } else {
          playChessSound('move', soundEnabled);
        }
      }

      if (gameMode === 'two-player' && autoFlipTwoPlayer && !result) {
        setFlipped(nextTurn === 'b');
      }
    },
    [autoFlipTwoPlayer, currentTimeControl, gameMode, soundEnabled]
  );

  const executeMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      const chess = chessRef.current;
      try {
        const move = chess.move({ from, to, promotion });
        const record: MoveRecord = {
          ply: chess.history().length,
          san: move.san,
          lan: move.lan,
          from: move.from,
          to: move.to,
          fen: chess.fen(),
          color: move.color,
          isCheck: chess.isCheck(),
          isCheckmate: chess.isCheckmate(),
          isCapture: move.isCapture(),
          isCastle: move.isKingsideCastle() || move.isQueensideCastle(),
          isPromotion: move.isPromotion(),
        };
        syncFromChess(record);
        return true;
      } catch {
        playChessSound('illegal', soundEnabled);
        return false;
      }
    },
    [soundEnabled, syncFromChess]
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (gameResult || viewIndex !== null) return;
      if (gameMode === 'stockfish' && turn !== humanColor) return;

      const chess = chessRef.current;
      const legalMoves = chess.moves({ square: from, verbose: true });
      const matchingMoves = legalMoves.filter((m) => m.to === to);

      if (matchingMoves.length === 0) {
        playChessSound('illegal', soundEnabled);
        return;
      }

      // Check if this move requires pawn promotion choice
      const needsPromotion = matchingMoves.some((m) => Boolean(m.promotion));
      if (needsPromotion) {
        setPendingPromotion({ from, to, color: turn });
        return;
      }

      executeMove(from, to);
    },
    [executeMove, gameMode, gameResult, humanColor, soundEnabled, turn, viewIndex]
  );

  const handleSelectPromotion = useCallback(
    (piece: PromotionPiece) => {
      if (!pendingPromotion) return;
      const { from, to } = pendingPromotion;
      setPendingPromotion(null);
      executeMove(from, to, piece);
    },
    [executeMove, pendingPromotion]
  );

  const handleCancelPromotion = useCallback(() => {
    setPendingPromotion(null);
  }, []);

  // Trigger Stockfish engine or selected Bot automatically when it is the AI's turn
  useEffect(() => {
    if (gameMode !== 'stockfish') return;
    if (gameResult) return;
    if (isAnalyzing) return;
    if (turn === humanColor) return;

    const controller = new AbortController();
    engineAbortRef.current = controller;
    setIsEngineThinking(true);
    setEngineError(null);

    const lanHistory = moves.map((m) => m.lan);
    const startTime = performance.now();

    const movePromise =
      opponentKind === 'bot'
        ? getBotMove(fen, lanHistory, currentBot, controller.signal)
        : stockfishService
            .getBestMove(lanHistory, currentLevelConfig, controller.signal)
            .then(async (best) => {
              const elapsed = performance.now() - startTime;
              if (elapsed < 320) {
                await new Promise((r) => setTimeout(r, 320 - elapsed));
              }
              return best;
            });

    movePromise
      .then((best) => {
        if (controller.signal.aborted) return;
        setIsEngineThinking(false);
        executeMove(best.from as Square, best.to as Square, best.promotion);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setIsEngineThinking(false);
        setEngineError(
          err instanceof Error ? err.message : 'Engine failed to respond.'
        );
      });

    return () => {
      controller.abort();
      stockfishService.cancelPending();
      setIsEngineThinking(false);
    };
  }, [
    gameMode,
    opponentKind,
    gameResult,
    isAnalyzing,
    turn,
    humanColor,
    moves,
    fen,
    currentBot,
    currentLevelConfig,
    executeMove,
  ]);

  const handleStartAnalysis = useCallback(() => {
    if (moves.length === 0 || isAnalyzing) return;

    engineAbortRef.current?.abort();
    analysisAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsEngineThinking(false);

    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress({ completed: 0, total: moves.length + 1 });

    const snapshotMoves = [...moves];

    stockfishService
      .analyzeMatch(
        snapshotMoves,
        (completed, total) => {
          if (!controller.signal.aborted) {
            setAnalysisProgress({ completed, total });
          }
        },
        controller.signal
      )
      .then((res) => {
        if (controller.signal.aborted) return;
        setAnalysisResult(res);
        setIsAnalyzing(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setIsAnalyzing(false);
        setAnalysisError(
          err instanceof Error ? err.message : 'Unable to analyze match.'
        );
      });
  }, [isAnalyzing, moves]);

  const handleCancelAnalysis = useCallback(() => {
    analysisAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsAnalyzing(false);
  }, []);

  const handleUndo = useCallback(() => {
    if (moves.length === 0 || gameResult) return;

    engineAbortRef.current?.abort();
    analysisAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsEngineThinking(false);
    setIsAnalyzing(false);
    setAnalysisResult(null);
    setPendingPromotion(null);

    const chess = chessRef.current;

    if (gameMode === 'two-player') {
      const undone = chess.undo();
      if (!undone) return;
      setMoves((prev) => prev.slice(0, -1));
      syncFromChess();
      playChessSound('move', soundEnabled);
      return;
    }

    // In Stockfish mode, undo back to human's turn
    let popCount = 0;
    if (turn !== humanColor) {
      // Bot was thinking; undo the human's last move
      if (chess.undo()) popCount += 1;
    } else {
      // It is human's turn; undo bot's reply AND human's previous move
      if (moves.length >= 2) {
        if (chess.undo()) popCount += 1;
        if (chess.undo()) popCount += 1;
      } else if (humanColor === 'b' && moves.length === 1) {
        // Special case: human plays Black and hasn't moved yet
        return;
      }
    }

    if (popCount > 0) {
      setMoves((prev) => prev.slice(0, prev.length - popCount));
      syncFromChess();
      playChessSound('move', soundEnabled);
    }
  }, [gameMode, gameResult, humanColor, moves.length, soundEnabled, syncFromChess, turn]);

  const handleResign = useCallback(() => {
    if (gameResult) return;
    engineAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsEngineThinking(false);
    setPendingPromotion(null);

    const losingSide: PlayerColor = gameMode === 'stockfish' ? humanColor : turn;
    const winner: PlayerColor = losingSide === 'w' ? 'b' : 'w';
    const winnerName = winner === 'w' ? 'White' : 'Black';
    const loserName = losingSide === 'w' ? 'White' : 'Black';

    setGameResult({
      winner,
      reason: 'resignation',
      headline: `${winnerName} wins by Resignation`,
      detail: `${loserName} resigned the game.`,
    });
    playChessSound('gameover', soundEnabled);
  }, [gameMode, gameResult, humanColor, soundEnabled, turn]);

  const handleMutualDraw = useCallback(() => {
    if (gameResult || gameMode !== 'two-player') return;
    setPendingPromotion(null);
    setGameResult({
      winner: 'draw',
      reason: 'agreement',
      headline: 'Draw by Agreement',
      detail: 'Both players agreed to a draw.',
    });
    playChessSound('draw', soundEnabled);
  }, [gameMode, gameResult, soundEnabled]);

  const handleSelectHistoryPly = useCallback(
    (plyIndex: number | null) => {
      setViewIndex(plyIndex);
      const targetIdx = plyIndex === null ? moves.length - 1 : plyIndex;
      const move = targetIdx >= 0 ? moves[targetIdx] : undefined;
      if (move) {
        if (move.isCheck) playChessSound('check', soundEnabled);
        else if (move.isCastle) playChessSound('castle', soundEnabled);
        else if (move.isCapture) playChessSound('capture', soundEnabled);
        else playChessSound('move', soundEnabled);
      } else if (plyIndex === -1 && moves.length > 0) {
        playChessSound('select', soundEnabled);
      }
    },
    [moves, soundEnabled]
  );

  // Keyboard shortcuts for history review and board flip
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (pendingPromotion) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        if (moves.length === 0) return;
        e.preventDefault();
        const nextIdx =
          viewIndex === null
            ? moves.length - 2 >= -1
              ? moves.length - 2
              : -1
            : Math.max(-1, viewIndex - 1);
        handleSelectHistoryPly(nextIdx);
      } else if (e.key === 'ArrowRight') {
        if (viewIndex === null) return;
        e.preventDefault();
        const nextIdx = viewIndex + 1 >= moves.length - 1 ? null : viewIndex + 1;
        handleSelectHistoryPly(nextIdx);
      } else if (e.key.toLowerCase() === 'f') {
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSelectHistoryPly, moves.length, pendingPromotion, viewIndex]);

  // Compute displayed board FEN & metadata (live or historical)
  const isReviewingHistory = viewIndex !== null;
  const displayFen = useMemo(() => {
    if (viewIndex === null) return fen;
    if (viewIndex < 0) return INITIAL_FEN;
    return moves[viewIndex]?.fen ?? fen;
  }, [fen, moves, viewIndex]);

  const displayLastMove = useMemo(() => {
    if (viewIndex === null) {
      const last = moves[moves.length - 1];
      return last
        ? { from: last.from, to: last.to, isCapture: last.isCapture }
        : null;
    }
    if (viewIndex < 0) return null;
    const item = moves[viewIndex];
    return item
      ? { from: item.from, to: item.to, isCapture: item.isCapture }
      : null;
  }, [moves, viewIndex]);

  const checkedKingSquare = useMemo(
    () => findCheckedKingSquare(displayFen),
    [displayFen]
  );

  const materialStats = useMemo(
    () => computeMaterialAndCaptures(displayFen),
    [displayFen]
  );

  const canInteractWithBoard =
    !isReviewingHistory &&
    !gameResult &&
    !isAnalyzing &&
    (gameMode === 'two-player' || turn === humanColor);

  const canUndo =
    !gameResult &&
    !isAnalyzing &&
    moves.length > 0 &&
    !(gameMode === 'stockfish' && humanColor === 'b' && moves.length === 1);

  const pgnString = useMemo(() => {
    return chessRef.current.pgn();
  }, [fen]);

  const currentDisplayedEval = useMemo(() => {
    if (!analysisResult) return null;
    if (viewIndex === -1) return analysisResult.startEval;
    const idx = viewIndex === null ? moves.length - 1 : viewIndex;
    if (idx < 0) return analysisResult.startEval;
    return analysisResult.moves[idx]?.evalAfter ?? analysisResult.startEval;
  }, [analysisResult, moves.length, viewIndex]);

  const bestMoveArrow = useMemo(() => {
    if (!currentDisplayedEval?.bestMove || currentDisplayedEval.bestMove.length < 4) {
      return null;
    }
    return {
      from: currentDisplayedEval.bestMove.slice(0, 2),
      to: currentDisplayedEval.bestMove.slice(2, 4),
    };
  }, [currentDisplayedEval]);

  const currentMoveMarker = useMemo(() => {
    if (!analysisResult) return null;
    if (viewIndex === -1) return null;
    const idx = viewIndex === null ? moves.length - 1 : viewIndex;
    if (idx < 0) return null;
    const item = analysisResult.moves[idx];
    if (!item) return null;
    return {
      square: item.to,
      classification: item.classification,
    };
  }, [analysisResult, moves.length, viewIndex]);

  // Top & Bottom PlayerBar assignments based on board orientation
  const topColor: PlayerColor = flipped ? 'w' : 'b';
  const bottomColor: PlayerColor = flipped ? 'b' : 'w';

  const getPlayerLabel = (color: PlayerColor) => {
    if (gameMode === 'stockfish') {
      if (color === humanColor) {
        return 'You';
      }
      if (opponentKind === 'bot') {
        return currentBot.name;
      }
      return `Stockfish · ${currentLevelConfig.name}`;
    }
    return color === 'w' ? 'Player 1' : 'Player 2';
  };

  const getPlayerSubtitle = (color: PlayerColor) => {
    if (gameMode === 'stockfish') {
      if (color === humanColor) {
        return color === 'w' ? 'White' : 'Black';
      }
      if (opponentKind === 'bot') {
        return `${currentBot.tagline} · ${currentBot.eloLabel}`;
      }
      return `Lv ${currentLevelConfig.level} · ${currentLevelConfig.eloLabel} Elo`;
    }
    return color === 'w' ? 'White' : 'Black';
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 transition-colors">
      {/* Top Bar */}
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 shrink-0">
            <svg
              viewBox="0 0 512 512"
              fill="none"
              className="h-7 w-7 rounded-md shrink-0"
              aria-hidden="true"
            >
              <rect width="512" height="512" rx="112" fill="#1C1917" />
              <rect x="88" y="88" width="168" height="168" rx="18" fill="#2F6F4E" />
              <rect x="256" y="88" width="168" height="168" rx="18" fill="#F5F5F4" />
              <rect x="88" y="256" width="168" height="168" rx="18" fill="#F5F5F4" />
              <rect x="256" y="256" width="168" height="168" rx="18" fill="#2F6F4E" />
              <g transform="translate(256 256)">
                <circle cx="0" cy="0" r="98" fill="#1C1917" />
                <path
                  d="M-38 52h76v16h-76V52zm6-14l8-56h48l8 56h-64zm-10-80h16v14h14v-14h16v14h14v-14h16v26h-92v-26z"
                  fill="#F5F5F4"
                />
              </g>
            </svg>
            <span className="font-display text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100 whitespace-nowrap shrink-0">
              SquareEight
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              aria-label={soundEnabled ? 'Mute board sounds' : 'Enable board sounds'}
              title={soundEnabled ? 'Sound On' : 'Sound Off'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shrink-0"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4 text-stone-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              title={darkMode ? 'Light theme' : 'Dark theme'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shrink-0"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => startNewGame()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>New Game</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Chess Workspace */}
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {/* Board Column */}
          <div className="flex flex-col items-center">
            <div className="w-full max-w-[580px] lg:max-w-[min(600px,calc(100vh-220px))] space-y-2.5">
              {/* Top Player Bar */}
              <PlayerBar
                color={topColor}
                label={getPlayerLabel(topColor)}
                subtitle={getPlayerSubtitle(topColor)}
                capturedPieces={
                  topColor === 'w'
                    ? materialStats.capturedByWhite
                    : materialStats.capturedByBlack
                }
                materialLead={
                  topColor === 'w' ? materialStats.whiteLead : materialStats.blackLead
                }
                isTurn={turn === topColor}
                isThinking={
                  gameMode === 'stockfish' && topColor !== humanColor && isEngineThinking
                }
                isCheck={isCheck && turn === topColor}
                isGameOver={Boolean(gameResult)}
                timeRemainingMs={
                  currentTimeControl.id !== 'none' ? clocksMs[topColor] : null
                }
              />

              {/* Chessboard + Optional Stockfish Eval Bar */}
              <div className="flex items-stretch gap-2">
                {currentDisplayedEval && (
                  <EvalBar evaluation={currentDisplayedEval} flipped={flipped} />
                )}
                <div className="flex-1 min-w-0">
                  <ChessBoard
                    fen={displayFen}
                    flipped={flipped}
                    canInteract={canInteractWithBoard}
                    activeTurn={turn}
                    lastMove={displayLastMove}
                    checkedKingSquare={checkedKingSquare}
                    theme={boardTheme}
                    soundEnabled={soundEnabled}
                    pendingPromotion={pendingPromotion}
                    onAttemptMove={handleAttemptMove}
                    onSelectPromotion={handleSelectPromotion}
                    onCancelPromotion={handleCancelPromotion}
                    isReviewingHistory={isReviewingHistory}
                    onJumpToLive={() => handleSelectHistoryPly(null)}
                    bestMoveArrow={bestMoveArrow}
                    moveMarker={currentMoveMarker}
                  />
                </div>
              </div>

              {/* Bottom Player Bar */}
              <PlayerBar
                color={bottomColor}
                label={getPlayerLabel(bottomColor)}
                subtitle={getPlayerSubtitle(bottomColor)}
                capturedPieces={
                  bottomColor === 'w'
                    ? materialStats.capturedByWhite
                    : materialStats.capturedByBlack
                }
                materialLead={
                  bottomColor === 'w' ? materialStats.whiteLead : materialStats.blackLead
                }
                isTurn={turn === bottomColor}
                isThinking={
                  gameMode === 'stockfish' &&
                  bottomColor !== humanColor &&
                  isEngineThinking
                }
                isCheck={isCheck && turn === bottomColor}
                isGameOver={Boolean(gameResult)}
                timeRemainingMs={
                  currentTimeControl.id !== 'none' ? clocksMs[bottomColor] : null
                }
              />

              {/* Engine Error Banner (if any) */}
              {engineError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-200"
                >
                  <span>Engine notice: {engineError}</span>
                  <button
                    type="button"
                    onClick={() => startNewGame()}
                    className="font-semibold underline whitespace-nowrap"
                  >
                    Restart
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Control & Notation Sidebar */}
          <aside className="space-y-4">
            {/* Game Over Summary & Post-Match Analysis Card */}
            {gameResult && (
              <section
                aria-live="polite"
                className="rounded-xl border border-emerald-700/35 dark:border-emerald-500/40 bg-white dark:bg-stone-900 p-4 shadow-sm animate-chess-modal space-y-3"
              >
                <div>
                  <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Game Complete
                  </div>
                  <h2 className="mt-1 font-display text-lg font-bold text-stone-900 dark:text-stone-100">
                    {gameResult.headline}
                  </h2>
                  <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                    {gameResult.detail}
                  </p>
                </div>

                {isAnalyzing && (
                  <div className="space-y-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-stone-600 dark:text-stone-300">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-emerald-400" />
                        <span>Analyzing all moves…</span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {analysisProgress.completed}/{analysisProgress.total}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                      <div
                        className="h-full bg-emerald-700 dark:bg-emerald-500 transition-[width] duration-150"
                        style={{
                          width: `${
                            analysisProgress.total > 0
                              ? Math.round(
                                  (analysisProgress.completed / analysisProgress.total) * 100
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {analysisResult && !isAnalyzing && (
                  <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/50 p-2.5 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-[10px] text-stone-500 dark:text-stone-400">
                          White Accuracy
                        </div>
                        <div className="font-mono text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                          {analysisResult.white.accuracy.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-stone-500 dark:text-stone-400">
                          Black Accuracy
                        </div>
                        <div className="font-mono text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                          {analysisResult.black.accuracy.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums">
                      {(analysisResult.white.brilliant + analysisResult.black.brilliant) > 0 && (
                        <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                          !! {analysisResult.white.brilliant + analysisResult.black.brilliant} Brilliant
                        </span>
                      )}
                      {(analysisResult.white.great + analysisResult.black.great) > 0 && (
                        <span className="font-semibold text-sky-600 dark:text-sky-400">
                          ! {analysisResult.white.great + analysisResult.black.great} Great
                        </span>
                      )}
                      <span className="text-emerald-700 dark:text-emerald-400">
                        ★ {analysisResult.white.best + analysisResult.black.best} Best
                      </span>
                      {(analysisResult.white.blunder + analysisResult.black.blunder) > 0 && (
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          ?? {analysisResult.white.blunder + analysisResult.black.blunder} Blunder
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        handleSelectHistoryPly(moves.length > 0 ? 0 : null);
                        document
                          .getElementById('match-analysis-panel')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }}
                      className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 py-1.5 text-[11px] font-semibold text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                    >
                      <span>Step Through All Moves</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className={`grid gap-2 ${moves.length > 0 && !analysisResult && !isAnalyzing ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {moves.length > 0 && !analysisResult && !isAnalyzing && (
                    <button
                      type="button"
                      onClick={handleStartAnalysis}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-700/40 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/40 py-2 px-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/70 transition-colors whitespace-nowrap"
                    >
                      <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Analyze Match</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startNewGame()}
                    className="w-full rounded-lg bg-emerald-700 py-2 px-3 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
                  >
                    Play Again
                  </button>
                </div>
              </section>
            )}

            {/* Mode & Engine Settings Card */}
            <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-4">
              {/* Mode Switch */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">
                  Game Mode
                </label>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (gameMode !== 'stockfish') {
                        startNewGame({ mode: 'stockfish' });
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      gameMode === 'stockfish'
                        ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>vs Engine</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (gameMode !== 'two-player') {
                        startNewGame({ mode: 'two-player' });
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      gameMode === 'two-player'
                        ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>2 Players</span>
                  </button>
                </div>
              </div>

              {/* Engine / Bot & Side Selection */}
              {gameMode === 'stockfish' ? (
                <>
                  {/* Stockfish (10 Levels) vs Chess Bots (6 Personalities) */}
                  <div>
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 p-1 mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (opponentKind !== 'stockfish') {
                            startNewGame({ opponentKind: 'stockfish' });
                          }
                        }}
                        className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          opponentKind === 'stockfish'
                            ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                            : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                        }`}
                      >
                        <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Stockfish (10)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (opponentKind !== 'bot') {
                            startNewGame({ opponentKind: 'bot' });
                          }
                        }}
                        className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          opponentKind === 'bot'
                            ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                            : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                        }`}
                      >
                        <Bot className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Chess Bots (6)</span>
                      </button>
                    </div>

                    {opponentKind === 'stockfish' ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                            Stockfish Level
                          </span>
                          <span className="font-mono text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                            {currentLevelConfig.name} ({currentLevelConfig.eloLabel})
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {STOCKFISH_LEVELS.map((lvl) => {
                            const active = stockfishLevel === lvl.level;
                            return (
                              <button
                                key={lvl.level}
                                type="button"
                                title={`${lvl.level}. ${lvl.name} (${lvl.eloLabel})`}
                                onClick={() => setStockfishLevel(lvl.level)}
                                className={`flex flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center transition-colors ${
                                  active
                                    ? 'border-emerald-700 bg-emerald-50/70 dark:border-emerald-500 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
                                    : 'border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                                }`}
                              >
                                <span className="text-xs font-semibold leading-tight tabular-nums">
                                  {lvl.level}
                                </span>
                                <span className="font-mono text-[10px] opacity-75 mt-0.5 tabular-nums">
                                  {lvl.eloLabel}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                            Select Opponent
                          </span>
                          <span className="font-mono text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                            {currentBot.name} ({currentBot.eloLabel})
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {BOT_PROFILES.map((bot) => {
                            const active = selectedBotId === bot.id;
                            return (
                              <button
                                key={bot.id}
                                type="button"
                                onClick={() => {
                                  if (selectedBotId !== bot.id) {
                                    startNewGame({ opponentKind: 'bot', botId: bot.id });
                                  }
                                }}
                                className={`flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-colors ${
                                  active
                                    ? 'border-emerald-700 bg-emerald-50/70 dark:border-emerald-500 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
                                    : 'border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 w-full">
                                  <span className="text-[11px] font-semibold leading-tight truncate">
                                    {bot.name}
                                  </span>
                                  <span className="font-mono text-[10px] opacity-80 shrink-0 tabular-nums">
                                    {bot.eloLabel}
                                  </span>
                                </div>
                                <span className="text-[10px] opacity-70 mt-0.5 truncate w-full">
                                  {bot.tagline}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">
                      Play As
                    </span>
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 p-1">
                      {(
                        [
                          { id: 'w', label: 'White' },
                          { id: 'random', label: 'Random' },
                          { id: 'b', label: 'Black' },
                        ] as { id: SideChoice; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => startNewGame({ side: opt.id })}
                          className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                            sideChoice === opt.id
                              ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-3 py-2.5">
                  <div>
                    <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                      Auto-Flip Board
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">
                      Rotate perspective after each move
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoFlipTwoPlayer}
                    onClick={() => {
                      const next = !autoFlipTwoPlayer;
                      setAutoFlipTwoPlayer(next);
                      if (next) setFlipped(turn === 'b');
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      autoFlipTwoPlayer ? 'bg-emerald-700' : 'bg-stone-300 dark:bg-stone-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        autoFlipTwoPlayer ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Move Timer / Clock Preset */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                    Move Timer
                  </span>
                  <span className="font-mono text-xs text-stone-500 dark:text-stone-400">
                    {currentTimeControl.label}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {TIME_CONTROLS.map((tc) => (
                    <button
                      key={tc.id}
                      type="button"
                      onClick={() => startNewGame({ timeControl: tc.id })}
                      className={`rounded-md border px-1.5 py-1.5 font-mono text-[11px] font-medium transition-colors whitespace-nowrap ${
                        timeControlId === tc.id
                          ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
                          : 'border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/60 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                    >
                      {tc.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Game Controls */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
                >
                  <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors whitespace-nowrap"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Flip</span>
                </button>
                {gameMode === 'two-player' ? (
                  <button
                    type="button"
                    onClick={handleMutualDraw}
                    disabled={Boolean(gameResult)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
                  >
                    <Handshake className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Draw</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleResign}
                    disabled={Boolean(gameResult) || moves.length === 0}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
                  >
                    <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Resign</span>
                  </button>
                )}
              </div>

              {gameMode === 'two-player' && (
                <button
                  type="button"
                  onClick={handleResign}
                  disabled={Boolean(gameResult) || moves.length === 0}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Resign ({turn === 'w' ? 'White' : 'Black'})</span>
                </button>
              )}
            </section>

            {/* Move History Panel */}
            <MoveHistoryPanel
              moves={moves}
              viewIndex={viewIndex}
              onSelectPly={handleSelectHistoryPly}
              pgn={pgnString}
              fen={displayFen}
              analysis={analysisResult}
            />

            {/* Stockfish Match Analysis */}
            <MatchAnalysisPanel
              hasMoves={moves.length > 0}
              isAnalyzing={isAnalyzing}
              progress={analysisProgress}
              analysis={analysisResult}
              error={analysisError}
              inspectedPlyIndex={viewIndex}
              totalMoves={moves.length}
              onStartAnalysis={handleStartAnalysis}
              onCancelAnalysis={handleCancelAnalysis}
              onSelectPly={handleSelectHistoryPly}
            />

            {/* Board Appearance */}
            <div className="flex items-center justify-between rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3.5 py-2.5">
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                Board Style
              </span>
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'tournament', label: 'Green', light: '#EEEED2', dark: '#769656' },
                    { id: 'walnut', label: 'Walnut', light: '#F0D9B5', dark: '#B58863' },
                    { id: 'slate', label: 'Slate', light: '#E6E9EE', dark: '#6B7D92' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBoardTheme(item.id)}
                    aria-label={`${item.label} board theme`}
                    title={item.label}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                      boardTheme === item.id
                        ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-stone-900 dark:text-stone-100'
                        : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 rounded-xs border border-stone-400/50"
                      style={{
                        background: `linear-gradient(135deg, ${item.light} 50%, ${item.dark} 50%)`,
                      }}
                    />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {typeof window !== 'undefined' && !window.__EMBEDDED_STOCKFISH_ASM__ && (
              <a
                href="./squareeight-chess.html"
                download="squareeight-chess.html"
                className="flex items-center justify-between rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3.5 py-2.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
              >
                <span>Download Standalone HTML</span>
                <FileDown className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              </a>
            )}
          </aside>
        </div>
      </main>

      <footer className="border-t border-stone-200/80 dark:border-stone-800/80 py-3 px-4 text-center text-xs text-stone-500 dark:text-stone-400">
        Made by Anas Messaoud
      </footer>

      <OfflineIndicator />
    </div>
  );
}
