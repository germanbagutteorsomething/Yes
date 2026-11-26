import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import {
  Archive,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Bot,
  CircleDot,
  Cpu,
  Crown,
  FileDown,
  Flag,
  Gamepad2,
  Handshake,
  Lightbulb,
  Loader2,
  Lock,
  Moon,
  Mountain,
  Puzzle,
  RotateCcw,
  Settings,
  Sun,
  Swords,
  Undo2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ArchiveWorkspace } from './components/ArchiveWorkspace';
import { ChessBoard } from './components/ChessBoard';
import { CrazyhousePocketBar } from './components/CrazyhousePocketBar';
import { EndgamesWorkspace } from './components/EndgamesWorkspace';
import { EvalBar } from './components/EvalBar';
import { GamesHub } from './components/GamesHub';
import { MatchAnalysisPanel } from './components/MatchAnalysisPanel';
import { MoveHistoryPanel } from './components/MoveHistoryPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PlayerBar } from './components/PlayerBar';
import { PoolGameWorkspace } from './components/PoolGameWorkspace';
import { PuzzlesWorkspace } from './components/PuzzlesWorkspace';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SkiGameWorkspace } from './components/SkiGameWorkspace';
import { detectOpening } from './data/openings';
import { getBotMove } from './engine/botService';
import { stockfishService } from './engine/stockfishService';
import { getVariantEngineMove, getVariantHintMove } from './engine/variantAi';
import {
  BOT_PROFILES,
  GAME_VARIANTS,
  STOCKFISH_LEVELS,
  TIME_CONTROLS,
  type AppView,
  type BoardArrow,
  type BoardHighlight,
  type BoardTheme,
  type BotId,
  type CrazyhouseSetupMode,
  type DroppablePiece,
  type GameMode,
  type GameResult,
  type GameVariant,
  type MatchAnalysisResult,
  type MoveRecord,
  type OpponentKind,
  type PendingPromotion,
  type PieceSet,
  type PlayerColor,
  type Premove,
  type PromotionPiece,
  type SavedMatch,
  type SideChoice,
  type StockfishLevelNumber,
  type TimeControlId,
} from './types/chess';
import { ARCADE_UNLOCKABLES } from './types/arcade';
import type { SkiMapId } from './types/ski';
import {
  isItemUnlocked,
  loadArcadeState,
  recordDailyProgress,
  unlockArcadeItem,
} from './utils/arcadeProgress';
import {
  computeCrazyhouseState,
  executeCrazyhouseDropOnChess,
  getCrazyhouseLegalDropSquares,
  parseCrazyhouseDropNotation,
  replayCrazyhouseChess,
} from './utils/crazyhouse';
import { playChessSound } from './utils/sound';
import {
  clearSavedMatches,
  deleteSavedMatch,
  loadDefeatedBots,
  loadDefeatedLevels,
  loadPreferences,
  loadSavedMatches,
  markBotDefeated,
  markLevelDefeated,
  saveMatchToHistory,
  savePreferences,
  updateMatchAnalysisInHistory,
} from './utils/storage';
import {
  computeFogVisibleSquares,
  evaluateVariantGameEnd,
  findKingSquare,
  generateVariantStartFen,
  getThreeCheckCounts,
  isVariantMoveLegal,
} from './utils/variants';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_ENGINE_HINTS = 3;

type SidebarTab = 'moves' | 'setup' | 'analysis';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const CAPTURE_ORDER: Exclude<PieceSymbol, 'k'>[] = ['q', 'r', 'b', 'n', 'p'];

function countPiecesOnBoard(fen: string): Record<PlayerColor, Record<PieceSymbol, number>> {
  const temp = new Chess();
  try {
    temp.load(fen, { skipValidation: true });
  } catch {
    // fallback to default board if FEN invalid
  }

  const counts: Record<PlayerColor, Record<PieceSymbol, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };

  for (const row of temp.board()) {
    for (const cell of row) {
      if (cell) {
        counts[cell.color][cell.type] += 1;
      }
    }
  }
  return counts;
}

function computeMaterialAndCaptures(fen: string, startFen: string) {
  const startCounts = countPiecesOnBoard(startFen);
  const currentCounts = countPiecesOnBoard(fen);

  const capturedByWhite: PieceSymbol[] = [];
  const capturedByBlack: PieceSymbol[] = [];

  for (const pieceType of CAPTURE_ORDER) {
    const missingBlack = Math.max(0, startCounts.b[pieceType] - currentCounts.b[pieceType]);
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(pieceType);

    const missingWhite = Math.max(0, startCounts.w[pieceType] - currentCounts.w[pieceType]);
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(pieceType);
  }

  let whiteMaterial = 0;
  let blackMaterial = 0;
  for (const pieceType of ['p', 'n', 'b', 'r', 'q'] as PieceSymbol[]) {
    whiteMaterial += currentCounts.w[pieceType] * PIECE_VALUES[pieceType];
    blackMaterial += currentCounts.b[pieceType] * PIECE_VALUES[pieceType];
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
    temp.load(fen, { skipValidation: true });
  } catch {
    return null;
  }
  if (!temp.isCheck()) return null;
  const turn = temp.turn();
  for (const row of temp.board()) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === turn) {
        return cell.square;
      }
    }
  }
  return null;
}

function evaluateGameEnd(
  chess: Chess,
  variant: GameVariant = 'standard',
  moves: MoveRecord[] = [],
  startFen: string = INITIAL_FEN,
  crazyhouseSetup: CrazyhouseSetupMode = 'classic'
): GameResult | null {
  return evaluateVariantGameEnd(chess, variant, moves, undefined, startFen, crazyhouseSetup);
}

function hasSufficientMaterialForTimeout(
  chess: Chess,
  color: PlayerColor,
  variant: GameVariant = 'standard'
): boolean {
  if (
    variant === 'king-of-the-hill' ||
    variant === 'racing-kings' ||
    variant === 'crazyhouse'
  ) {
    return true;
  }
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

function createMatchId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const initialPrefs = useMemo(() => loadPreferences(), []);

  const chessRef = useRef<Chess>(new Chess());
  const engineAbortRef = useRef<AbortController | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const hintAbortRef = useRef<AbortController | null>(null);
  const currentMatchIdRef = useRef<string | null>(null);
  const isLoadedArchiveRef = useRef<boolean>(false);

  // Top-Level Game Hub & Studio Layout
  const [activeGame, setActiveGame] = useState<'hub' | 'chess' | 'ski' | 'pool'>('hub');
  const [activeView, setActiveView] = useState<AppView>('play');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('moves');
  const [requestedSkiMapId, setRequestedSkiMapId] = useState<SkiMapId | null>(null);
  const [requestedSkiNonce, setRequestedSkiNonce] = useState<number>(0);
  const [arcadeState, setArcadeState] = useState(() => loadArcadeState());
  const [boardUnlockNotice, setBoardUnlockNotice] = useState<string | null>(null);

  // Preferences (persisted)
  const [darkMode, setDarkMode] = useState<boolean>(initialPrefs.darkMode);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(initialPrefs.soundEnabled);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(initialPrefs.boardTheme);
  const [pieceSet, setPieceSet] = useState<PieceSet>(initialPrefs.pieceSet);
  const [skiLegacyPhysics, setSkiLegacyPhysics] = useState<boolean>(
    Boolean(initialPrefs.skiLegacyPhysics)
  );
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // Game configuration
  const [gameMode, setGameMode] = useState<GameMode>('stockfish');
  const [opponentKind, setOpponentKind] = useState<OpponentKind>('stockfish');
  const [stockfishLevel, setStockfishLevel] = useState<StockfishLevelNumber>(4);
  const [selectedBotId, setSelectedBotId] = useState<BotId>('tara');
  const [sideChoice, setSideChoice] = useState<SideChoice>('w');
  const [humanColor, setHumanColor] = useState<PlayerColor>('w');
  const [variant, setVariant] = useState<GameVariant>('standard');
  const [crazyhouseSetup, setCrazyhouseSetup] = useState<CrazyhouseSetupMode>('classic');
  const [selectedDropPiece, setSelectedDropPiece] = useState<DroppablePiece | null>(null);
  const [startFen, setStartFen] = useState<string>(INITIAL_FEN);
  const [variantNote, setVariantNote] = useState<string | null>(null);
  const [timeControlId, setTimeControlId] = useState<TimeControlId>('blitz-5');
  const [autoFlipTwoPlayer, setAutoFlipTwoPlayer] = useState<boolean>(false);
  const [flipped, setFlipped] = useState<boolean>(false);

  // Live board & move state
  const [fen, setFen] = useState<string>(INITIAL_FEN);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [turn, setTurn] = useState<PlayerColor>('w');
  const [isCheck, setIsCheck] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [isEngineThinking, setIsEngineThinking] = useState<boolean>(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  // Premoves, hints, annotations
  const [premove, setPremove] = useState<Premove | null>(null);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [highlights, setHighlights] = useState<BoardHighlight[]>([]);
  const [hintArrow, setHintArrow] = useState<{ from: string; to: string } | null>(null);
  const [hintDrop, setHintDrop] = useState<{ piece: DroppablePiece; to: Square } | null>(null);
  const [isFetchingHint, setIsFetchingHint] = useState<boolean>(false);
  const [hintsUsed, setHintsUsed] = useState<number>(0);

  // Clocks
  const [clocksMs, setClocksMs] = useState<{ w: number; b: number }>({
    w: 300_000,
    b: 300_000,
  });

  // Match Analysis
  const [analysisResult, setAnalysisResult] = useState<MatchAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 0 });
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Archive & progress persistence
  const [savedMatches, setSavedMatches] = useState<SavedMatch[]>(() => loadSavedMatches());
  const [defeatedBots, setDefeatedBots] = useState<BotId[]>(() => loadDefeatedBots());
  const [defeatedLevels, setDefeatedLevels] = useState<StockfishLevelNumber[]>(() =>
    loadDefeatedLevels()
  );

  const refreshArchiveData = useCallback(() => {
    setSavedMatches(loadSavedMatches());
    setDefeatedBots(loadDefeatedBots());
    setDefeatedLevels(loadDefeatedLevels());
    setArcadeState(loadArcadeState());
  }, []);

  // Persist UI preferences & sync <html>.dark
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');

    savePreferences({ darkMode, soundEnabled, boardTheme, pieceSet, skiLegacyPhysics });
  }, [boardTheme, darkMode, pieceSet, skiLegacyPhysics, soundEnabled]);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      engineAbortRef.current?.abort();
      analysisAbortRef.current?.abort();
      hintAbortRef.current?.abort();
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

  const openingInfo = useMemo(() => {
    if (startFen !== INITIAL_FEN) return null;
    return detectOpening(moves);
  }, [moves, startFen]);

  // Save finished game & update defeated checklist once per finished match
  useEffect(() => {
    if (!gameResult) return;
    if (isLoadedArchiveRef.current) return;
    if (currentMatchIdRef.current) return;
    if (moves.length === 0) return;

    const matchId = createMatchId();
    currentMatchIdRef.current = matchId;

    const opponentLabel =
      gameMode === 'two-player'
        ? '2-Player Local'
        : opponentKind === 'bot'
          ? `${currentBot.name} (${currentBot.eloLabel})`
          : `Stockfish Lv ${currentLevelConfig.level} · ${currentLevelConfig.name}`;

    const record: SavedMatch = {
      id: matchId,
      playedAt: new Date().toISOString(),
      mode: gameMode,
      opponentKind: gameMode === 'stockfish' ? opponentKind : undefined,
      opponentLabel,
      stockfishLevel:
        gameMode === 'stockfish' && opponentKind === 'stockfish'
          ? currentLevelConfig.level
          : undefined,
      botId: gameMode === 'stockfish' && opponentKind === 'bot' ? currentBot.id : undefined,
      variant,
      crazyhouseSetup: variant === 'crazyhouse' ? crazyhouseSetup : undefined,
      openingEco: openingInfo?.eco,
      openingName: openingInfo?.name,
      winner: gameResult.winner,
      reason: gameResult.reason,
      headline: gameResult.headline,
      humanColor,
      movesCount: moves.length,
      startFen,
      moves,
      pgn: chessRef.current.pgn(),
    };

    setSavedMatches(saveMatchToHistory(record));

    if (gameMode === 'stockfish' && gameResult.winner === humanColor) {
      if (opponentKind === 'bot') {
        setDefeatedBots(markBotDefeated(currentBot.id));
      } else {
        setDefeatedLevels(markLevelDefeated(currentLevelConfig.level));
      }
      setArcadeState(recordDailyProgress({ addChessWins: 1, bonusXp: 40 }));
    }
  }, [
    crazyhouseSetup,
    currentBot.eloLabel,
    currentBot.id,
    currentBot.name,
    currentLevelConfig.level,
    currentLevelConfig.name,
    gameMode,
    gameResult,
    humanColor,
    moves,
    openingInfo,
    opponentKind,
    startFen,
    variant,
  ]);

  // Active move timer / chess clock tick
  useEffect(() => {
    if (activeGame !== 'chess' || activeView !== 'play') return;
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
          const opponent: PlayerColor = turn === 'w' ? 'b' : 'w';
          const opponentCanWin = hasSufficientMaterialForTimeout(
            chessRef.current,
            opponent,
            variant
          );

          engineAbortRef.current?.abort();
          hintAbortRef.current?.abort();
          stockfishService.cancelPending();
          setIsEngineThinking(false);
          setIsFetchingHint(false);
          setPendingPromotion(null);
          setPremove(null);

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
  }, [activeGame, activeView, currentTimeControl.id, gameResult, moves.length, soundEnabled, turn, variant]);

  const startNewGame = useCallback(
    (overrides?: {
      mode?: GameMode;
      opponentKind?: OpponentKind;
      side?: SideChoice;
      level?: StockfishLevelNumber;
      botId?: BotId;
      timeControl?: TimeControlId;
      variant?: GameVariant;
      crazyhouseSetup?: CrazyhouseSetupMode;
    }) => {
      engineAbortRef.current?.abort();
      analysisAbortRef.current?.abort();
      hintAbortRef.current?.abort();
      stockfishService.cancelPending();

      const nextMode = overrides?.mode ?? gameMode;
      const nextSide = overrides?.side ?? sideChoice;
      const nextTcId = overrides?.timeControl ?? timeControlId;
      const nextVariant = overrides?.variant ?? variant;
      const nextCrazyhouseSetup = overrides?.crazyhouseSetup ?? crazyhouseSetup;
      const nextTc = TIME_CONTROLS.find((t) => t.id === nextTcId) ?? TIME_CONTROLS[4];
      const resolvedHuman = nextMode === 'stockfish' ? resolveSideChoice(nextSide) : 'w';

      const { fen: generatedFen, note } = generateVariantStartFen(
        nextVariant,
        resolvedHuman,
        nextCrazyhouseSetup
      );

      if (overrides?.mode !== undefined) setGameMode(overrides.mode);
      if (overrides?.opponentKind !== undefined) setOpponentKind(overrides.opponentKind);
      if (overrides?.side !== undefined) setSideChoice(overrides.side);
      if (overrides?.level !== undefined) setStockfishLevel(overrides.level);
      if (overrides?.botId !== undefined) setSelectedBotId(overrides.botId);
      if (overrides?.timeControl !== undefined) setTimeControlId(overrides.timeControl);
      if (overrides?.variant !== undefined) setVariant(overrides.variant);
      if (overrides?.crazyhouseSetup !== undefined) setCrazyhouseSetup(overrides.crazyhouseSetup);

      currentMatchIdRef.current = null;
      isLoadedArchiveRef.current = false;

      const fresh = new Chess();
      fresh.load(generatedFen, { skipValidation: true });
      chessRef.current = fresh;
      setStartFen(generatedFen);
      setVariantNote(note ?? null);
      setHumanColor(resolvedHuman);
      setFlipped(nextMode === 'stockfish' ? resolvedHuman === 'b' : false);
      setFen(generatedFen);
      setMoves([]);
      setTurn(fresh.turn());
      setIsCheck(false);
      setGameResult(null);
      setPendingPromotion(null);
      setSelectedDropPiece(null);
      setViewIndex(null);
      setIsEngineThinking(false);
      setEngineError(null);
      setPremove(null);
      setArrows([]);
      setHighlights([]);
      setHintArrow(null);
      setHintDrop(null);
      setIsFetchingHint(false);
      setHintsUsed(0);
      setAnalysisResult(null);
      setIsAnalyzing(false);
      setAnalysisError(null);
      setAnalysisProgress({ completed: 0, total: 0 });
      setClocksMs({
        w: nextTc.baseSeconds * 1000,
        b: nextTc.baseSeconds * 1000,
      });
      setActiveView('play');
    },
    [crazyhouseSetup, gameMode, sideChoice, timeControlId, variant]
  );

  const syncFromChess = useCallback(
    (newMoveRecord?: MoveRecord, overrideMoves?: MoveRecord[]) => {
      const chess = chessRef.current;
      const nextFen = chess.fen();
      const nextTurn = chess.turn();
      const nextCheck = chess.isCheck();
      const nextMoves =
        overrideMoves ?? (newMoveRecord ? [...moves, newMoveRecord] : moves);
      const result = evaluateGameEnd(chess, variant, nextMoves, startFen, crazyhouseSetup);

      setFen(nextFen);
      setTurn(nextTurn);
      setIsCheck(nextCheck);
      setGameResult(result);
      setSelectedDropPiece(null);
      setViewIndex(null);
      setHintArrow(null);
      setHintDrop(null);
      setArrows([]);
      setHighlights([]);

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
    [
      autoFlipTwoPlayer,
      crazyhouseSetup,
      currentTimeControl,
      gameMode,
      moves,
      soundEnabled,
      startFen,
      variant,
    ]
  );

  const executeMove = useCallback(
    (
      from: Square,
      to: Square,
      promotion?: PromotionPiece,
      silentOnIllegal = false
    ): boolean => {
      const chess = chessRef.current;
      try {
        const legal = isVariantMoveLegal(chess, from, to, variant);
        if (legal.length === 0) {
          if (!silentOnIllegal) playChessSound('illegal', soundEnabled);
          return false;
        }
        const move = chess.move({ from, to, promotion });
        const record: MoveRecord = {
          ply: moves.length + 1,
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
        if (!silentOnIllegal) {
          playChessSound('illegal', soundEnabled);
        }
        return false;
      }
    },
    [moves.length, soundEnabled, syncFromChess, variant]
  );

  const executeCrazyhouseDrop = useCallback(
    (piece: DroppablePiece, to: Square, silentOnIllegal = false): boolean => {
      if (variant !== 'crazyhouse') return false;
      const chess = chessRef.current;
      const active = chess.turn();
      const chState = computeCrazyhouseState(startFen, moves, crazyhouseSetup);
      if ((chState[active]?.[piece] ?? 0) <= 0) {
        if (!silentOnIllegal) playChessSound('illegal', soundEnabled);
        return false;
      }

      const opp: PlayerColor = active === 'w' ? 'b' : 'w';
      const dropped = executeCrazyhouseDropOnChess(chess, piece, to, chState[opp]);
      if (!dropped) {
        if (!silentOnIllegal) playChessSound('illegal', soundEnabled);
        return false;
      }

      const record: MoveRecord = {
        ply: moves.length + 1,
        san: dropped.san,
        lan: dropped.lan,
        from: to,
        to,
        fen: dropped.fen,
        color: dropped.color,
        isCheck: dropped.isCheck,
        isCheckmate: dropped.isCheckmate,
        isCapture: false,
        isCastle: false,
        isPromotion: false,
      };
      syncFromChess(record);
      return true;
    },
    [crazyhouseSetup, moves, soundEnabled, startFen, syncFromChess, variant]
  );

  const handleSubmitSanMove = useCallback(
    (sanText: string): boolean => {
      if (gameResult || viewIndex !== null || isAnalyzing) return false;
      if (gameMode === 'stockfish' && turn !== humanColor) return false;

      const trimmed = sanText.trim();
      if (!trimmed) return false;

      if (variant === 'crazyhouse') {
        const parsedDrop = parseCrazyhouseDropNotation(trimmed);
        if (parsedDrop) {
          return executeCrazyhouseDrop(parsedDrop.piece, parsedDrop.to);
        }
      }

      const chess = chessRef.current;
      try {
        const move = chess.move(trimmed);
        if (variant === 'racing-kings' && chess.isCheck()) {
          chess.undo();
          playChessSound('illegal', soundEnabled);
          return false;
        }
        const record: MoveRecord = {
          ply: moves.length + 1,
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
    [
      executeCrazyhouseDrop,
      gameMode,
      gameResult,
      humanColor,
      isAnalyzing,
      moves.length,
      soundEnabled,
      syncFromChess,
      turn,
      variant,
      viewIndex,
    ]
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (gameResult || viewIndex !== null || isAnalyzing) return;
      if (gameMode === 'stockfish' && turn !== humanColor) return;

      const chess = chessRef.current;
      const matchingMoves = isVariantMoveLegal(chess, from, to, variant);

      if (matchingMoves.length === 0) {
        playChessSound('illegal', soundEnabled);
        return;
      }

      const needsPromotion = matchingMoves.some((m) => Boolean(m.promotion));
      if (needsPromotion) {
        setPendingPromotion({ from, to, color: turn });
        return;
      }

      executeMove(from, to);
    },
    [
      executeMove,
      gameMode,
      gameResult,
      humanColor,
      isAnalyzing,
      soundEnabled,
      turn,
      variant,
      viewIndex,
    ]
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
    if (activeGame !== 'chess' || activeView !== 'play') return;
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
        ? getBotMove(
            fen,
            lanHistory,
            currentBot,
            controller.signal,
            startFen,
            variant,
            moves,
            crazyhouseSetup
          )
        : getVariantEngineMove(
            variant,
            fen,
            lanHistory,
            currentLevelConfig,
            moves,
            controller.signal,
            startFen,
            crazyhouseSetup
          ).then(async (best) => {
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
        if (best.dropPiece) {
          executeCrazyhouseDrop(best.dropPiece, best.to as Square);
        } else {
          executeMove(best.from as Square, best.to as Square, best.promotion);
        }
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
    activeGame,
    activeView,
    crazyhouseSetup,
    gameMode,
    opponentKind,
    gameResult,
    isAnalyzing,
    turn,
    humanColor,
    moves,
    fen,
    startFen,
    variant,
    currentBot,
    currentLevelConfig,
    executeCrazyhouseDrop,
    executeMove,
  ]);

  const canInteractWithBoard =
    activeGame === 'chess' &&
    activeView === 'play' &&
    viewIndex === null &&
    !gameResult &&
    !isAnalyzing &&
    (gameMode === 'two-player' || turn === humanColor);

  // Execute queued premove as soon as human's turn returns
  useEffect(() => {
    if (!canInteractWithBoard || !premove) return;
    const queued = premove;
    setPremove(null);

    const chess = chessRef.current;
    const matching = isVariantMoveLegal(chess, queued.from, queued.to, variant);
    if (matching.length === 0) return;

    const needsPromo = matching.some((m) => Boolean(m.promotion));
    const promo = queued.promotion ?? (needsPromo ? 'q' : undefined);
    executeMove(queued.from, queued.to, promo, true);
  }, [canInteractWithBoard, executeMove, premove, variant]);

  const runMatchAnalysis = useCallback(
    (
      targetMoves: MoveRecord[],
      targetStartFen: string,
      targetBookPlies: number,
      targetMatchId: string | null
    ) => {
      if (targetMoves.length === 0) return;

      engineAbortRef.current?.abort();
      analysisAbortRef.current?.abort();
      hintAbortRef.current?.abort();
      stockfishService.cancelPending();
      setIsEngineThinking(false);
      setIsFetchingHint(false);

      const controller = new AbortController();
      analysisAbortRef.current = controller;
      setIsAnalyzing(true);
      setAnalysisError(null);
      setAnalysisProgress({ completed: 0, total: targetMoves.length + 1 });
      setSidebarTab('analysis');

      stockfishService
        .analyzeMatch(
          [...targetMoves],
          (completed, total) => {
            if (!controller.signal.aborted) {
              setAnalysisProgress({ completed, total });
            }
          },
          controller.signal,
          {
            startFen: targetStartFen,
            bookPlies: targetBookPlies,
          }
        )
        .then((res) => {
          if (controller.signal.aborted) return;
          setAnalysisResult(res);
          setIsAnalyzing(false);

          if (targetMatchId) {
            const brilliantCount = res.white.brilliant + res.black.brilliant;
            const updated = updateMatchAnalysisInHistory(
              targetMatchId,
              res.white.accuracy,
              res.black.accuracy,
              brilliantCount
            );
            setSavedMatches(updated);
          }
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setIsAnalyzing(false);
          setAnalysisError(
            err instanceof Error ? err.message : 'Unable to analyze match.'
          );
        });
    },
    []
  );

  const handleStartAnalysis = useCallback(() => {
    if (moves.length === 0 || isAnalyzing || variant === 'crazyhouse') return;
    const bookPlies = startFen === INITIAL_FEN ? (openingInfo?.matchedPlies ?? 0) : 0;
    runMatchAnalysis(moves, startFen, bookPlies, currentMatchIdRef.current);
  }, [isAnalyzing, moves, openingInfo?.matchedPlies, runMatchAnalysis, startFen, variant]);

  const handleCancelAnalysis = useCallback(() => {
    analysisAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsAnalyzing(false);
  }, []);

  const handleRequestHint = useCallback(() => {
    if (!canInteractWithBoard || isFetchingHint) return;
    if (gameMode === 'stockfish' && hintsUsed >= MAX_ENGINE_HINTS) return;

    hintAbortRef.current?.abort();
    const controller = new AbortController();
    hintAbortRef.current = controller;
    setIsFetchingHint(true);

    const lanHistory = moves.map((m) => m.lan);
    getVariantHintMove(
      variant,
      fen,
      lanHistory,
      moves,
      startFen,
      controller.signal,
      crazyhouseSetup
    )
      .then((best) => {
        if (controller.signal.aborted) return;
        if (best.dropPiece) {
          setHintDrop({ piece: best.dropPiece, to: best.to as Square });
          setHintArrow(null);
          setSelectedDropPiece(best.dropPiece);
        } else {
          setHintArrow({ from: best.from, to: best.to });
          setHintDrop(null);
        }
        setHintsUsed((c) => c + 1);
        setIsFetchingHint(false);
        playChessSound('select', soundEnabled);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsFetchingHint(false);
        }
      });
  }, [
    canInteractWithBoard,
    crazyhouseSetup,
    fen,
    gameMode,
    hintsUsed,
    isFetchingHint,
    moves,
    soundEnabled,
    startFen,
    variant,
  ]);

  const handleUndo = useCallback(() => {
    if (moves.length === 0 || gameResult) return;

    engineAbortRef.current?.abort();
    analysisAbortRef.current?.abort();
    hintAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsEngineThinking(false);
    setIsFetchingHint(false);
    setIsAnalyzing(false);
    setAnalysisResult(null);
    setPendingPromotion(null);
    setSelectedDropPiece(null);
    setPremove(null);
    setHintArrow(null);
    setHintDrop(null);

    if (variant === 'crazyhouse') {
      const popCount =
        gameMode === 'two-player'
          ? 1
          : turn !== humanColor
            ? 1
            : moves.length >= 2
              ? 2
              : 0;
      if (popCount <= 0) return;
      const nextMoves = moves.slice(0, moves.length - popCount);
      chessRef.current = replayCrazyhouseChess(startFen, nextMoves);
      setMoves(nextMoves);
      syncFromChess(undefined, nextMoves);
      playChessSound('move', soundEnabled);
      return;
    }

    const chess = chessRef.current;

    if (gameMode === 'two-player') {
      const undone = chess.undo();
      if (!undone) return;
      const nextMoves = moves.slice(0, -1);
      setMoves(nextMoves);
      syncFromChess(undefined, nextMoves);
      playChessSound('move', soundEnabled);
      return;
    }

    let popCount = 0;
    if (turn !== humanColor) {
      if (chess.undo()) popCount += 1;
    } else {
      if (moves.length >= 2) {
        if (chess.undo()) popCount += 1;
        if (chess.undo()) popCount += 1;
      } else if (humanColor === 'b' && moves.length === 1) {
        return;
      }
    }

    if (popCount > 0) {
      const nextMoves = moves.slice(0, moves.length - popCount);
      setMoves(nextMoves);
      syncFromChess(undefined, nextMoves);
      playChessSound('move', soundEnabled);
    }
  }, [gameMode, gameResult, humanColor, moves, soundEnabled, startFen, syncFromChess, turn, variant]);

  const handleResign = useCallback(() => {
    if (gameResult) return;
    engineAbortRef.current?.abort();
    hintAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsEngineThinking(false);
    setIsFetchingHint(false);
    setPendingPromotion(null);
    setSelectedDropPiece(null);
    setPremove(null);

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
    setSelectedDropPiece(null);
    setPremove(null);
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
      setHintArrow(null);
      setHintDrop(null);
      setSelectedDropPiece(null);
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

  // Annotation toggles
  const handleToggleArrow = useCallback((arrow: BoardArrow) => {
    setArrows((prev) => {
      const idx = prev.findIndex(
        (a) => a.from === arrow.from && a.to === arrow.to && a.color === arrow.color
      );
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev.filter((a) => !(a.from === arrow.from && a.to === arrow.to)), arrow];
    });
  }, []);

  const handleToggleHighlight = useCallback((hl: BoardHighlight) => {
    setHighlights((prev) => {
      const idx = prev.findIndex(
        (h) => h.square === hl.square && h.color === hl.color
      );
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev.filter((h) => h.square !== hl.square), hl];
    });
  }, []);

  const handleClearAnnotations = useCallback(() => {
    setArrows([]);
    setHighlights([]);
  }, []);

  // Load match from Archive
  const handleLoadSavedMatch = useCallback(
    (match: SavedMatch, autoAnalyze = false) => {
      engineAbortRef.current?.abort();
      analysisAbortRef.current?.abort();
      hintAbortRef.current?.abort();
      stockfishService.cancelPending();

      const loadedVariant = match.variant ?? 'standard';
      const loadedSetup = match.crazyhouseSetup ?? 'classic';

      const replay =
        loadedVariant === 'crazyhouse'
          ? replayCrazyhouseChess(match.startFen || INITIAL_FEN, match.moves)
          : (() => {
              const r = new Chess(match.startFen || INITIAL_FEN);
              for (const m of match.moves) {
                try {
                  r.move(m.lan);
                } catch {
                  try {
                    r.move(m.san);
                  } catch {
                    break;
                  }
                }
              }
              return r;
            })();

      currentMatchIdRef.current = match.id;
      isLoadedArchiveRef.current = true;

      chessRef.current = replay;
      setGameMode(match.mode);
      if (match.opponentKind) setOpponentKind(match.opponentKind);
      if (match.stockfishLevel) setStockfishLevel(match.stockfishLevel);
      if (match.botId) setSelectedBotId(match.botId);
      setVariant(loadedVariant);
      setCrazyhouseSetup(loadedSetup);
      setStartFen(match.startFen || INITIAL_FEN);
      setVariantNote(
        loadedVariant === 'crazyhouse'
          ? 'Saved Crazyhouse Match'
          : loadedVariant === 'shuffle960'
            ? 'Saved 960 Match'
            : loadedVariant !== 'standard'
              ? 'Saved Variant Match'
              : null
      );
      setHumanColor(match.humanColor);
      setFlipped(match.humanColor === 'b');
      setFen(replay.fen());
      setMoves(match.moves);
      setTurn(replay.turn());
      setIsCheck(replay.isCheck());
      setGameResult({
        winner: match.winner,
        reason: match.reason,
        headline: match.headline,
        detail: `Loaded from Archive · ${match.opponentLabel}`,
      });
      setPendingPromotion(null);
      setSelectedDropPiece(null);
      setViewIndex(match.moves.length > 0 ? 0 : null);
      setIsEngineThinking(false);
      setEngineError(null);
      setPremove(null);
      setArrows([]);
      setHighlights([]);
      setHintArrow(null);
      setHintDrop(null);
      setIsFetchingHint(false);
      setAnalysisResult(null);
      setIsAnalyzing(false);
      setAnalysisError(null);
      setAnalysisProgress({ completed: 0, total: 0 });
      setActiveView('play');
      setSidebarTab(autoAnalyze && loadedVariant !== 'crazyhouse' ? 'analysis' : 'moves');

      if (autoAnalyze && loadedVariant !== 'crazyhouse' && match.moves.length > 0) {
        const opening = match.startFen === INITIAL_FEN ? detectOpening(match.moves) : null;
        runMatchAnalysis(
          match.moves,
          match.startFen || INITIAL_FEN,
          opening?.matchedPlies ?? 0,
          match.id
        );
      }
    },
    [runMatchAnalysis]
  );

  // Import custom FEN or PGN from ArchiveWorkspace
  const handleImportPositionOrGame = useCallback(
    (rawInput: string, mode: 'play' | 'analyze'): string | null => {
      const input = rawInput.trim();
      if (!input) return 'Paste a valid FEN string or PGN notation first.';

      engineAbortRef.current?.abort();
      analysisAbortRef.current?.abort();
      hintAbortRef.current?.abort();
      stockfishService.cancelPending();

      // 1. Try FEN first
      try {
        const fenChess = new Chess(input);
        const loadedFen = fenChess.fen();

        currentMatchIdRef.current = null;
        isLoadedArchiveRef.current = false;
        chessRef.current = fenChess;
        setStartFen(loadedFen);
        setVariant('standard');
        setVariantNote('Custom FEN');
        setFen(loadedFen);
        setMoves([]);
        setTurn(fenChess.turn());
        setIsCheck(fenChess.isCheck());
        setHumanColor(fenChess.turn());
        setFlipped(fenChess.turn() === 'b');
        setGameResult(evaluateGameEnd(fenChess));
        setPendingPromotion(null);
        setViewIndex(null);
        setIsEngineThinking(false);
        setEngineError(null);
        setPremove(null);
        setArrows([]);
        setHighlights([]);
        setHintArrow(null);
        setHintsUsed(0);
        setAnalysisResult(null);
        setIsAnalyzing(false);
        setAnalysisError(null);
        setActiveView('play');
        setSidebarTab('moves');
        return null;
      } catch {
        // Not a standalone FEN — try PGN below
      }

      // 2. Try PGN
      try {
        const pgnChess = new Chess();
        pgnChess.loadPgn(input);
        const headers = pgnChess.getHeaders();
        const customStart =
          headers.SetUp === '1' && headers.FEN ? headers.FEN : INITIAL_FEN;

        const replay = new Chess(customStart);
        const verboseHistory = pgnChess.history({ verbose: true });
        const importedMoves: MoveRecord[] = [];

        for (const m of verboseHistory) {
          const executed = replay.move(m.lan);
          importedMoves.push({
            ply: importedMoves.length + 1,
            san: executed.san,
            lan: executed.lan,
            from: executed.from,
            to: executed.to,
            fen: replay.fen(),
            color: executed.color,
            isCheck: replay.isCheck(),
            isCheckmate: replay.isCheckmate(),
            isCapture: executed.isCapture(),
            isCastle: executed.isKingsideCastle() || executed.isQueensideCastle(),
            isPromotion: executed.isPromotion(),
          });
        }

        const ended = evaluateGameEnd(replay);
        const hasMoves = importedMoves.length > 0;

        currentMatchIdRef.current = null;
        isLoadedArchiveRef.current = mode === 'analyze';
        chessRef.current = replay;
        setStartFen(customStart);
        setVariant('standard');
        setVariantNote(customStart === INITIAL_FEN ? 'Imported PGN' : 'Imported Custom PGN');
        setGameMode(mode === 'analyze' && hasMoves ? 'two-player' : gameMode);
        setFen(replay.fen());
        setMoves(importedMoves);
        setTurn(replay.turn());
        setIsCheck(replay.isCheck());
        setHumanColor(replay.turn());
        setFlipped(false);
        setGameResult(
          ended ??
            (mode === 'analyze' && hasMoves
              ? {
                  winner: 'draw',
                  reason: 'agreement',
                  headline: 'Imported PGN Ready for Review',
                  detail: `${importedMoves.length} half-moves loaded.`,
                }
              : null)
        );
        setPendingPromotion(null);
        setViewIndex(hasMoves ? 0 : null);
        setIsEngineThinking(false);
        setEngineError(null);
        setPremove(null);
        setArrows([]);
        setHighlights([]);
        setHintArrow(null);
        setHintsUsed(0);
        setAnalysisResult(null);
        setIsAnalyzing(false);
        setAnalysisError(null);
        setActiveView('play');
        setSidebarTab(mode === 'analyze' && hasMoves ? 'analysis' : 'moves');

        if (mode === 'analyze' && hasMoves) {
          const opening =
            customStart === INITIAL_FEN ? detectOpening(importedMoves) : null;
          runMatchAnalysis(
            importedMoves,
            customStart,
            opening?.matchedPlies ?? 0,
            null
          );
        }

        return null;
      } catch {
        return 'Could not parse FEN or PGN. Check notation and try again.';
      }
    },
    [gameMode, runMatchAnalysis]
  );

  // Keyboard shortcuts for history review and board flip in Play view
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeGame !== 'chess' || activeView !== 'play') return;
      if (pendingPromotion) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
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
  }, [activeGame, activeView, handleSelectHistoryPly, moves.length, pendingPromotion, viewIndex]);

  // Displayed board state (live or historical)
  const isReviewingHistory = viewIndex !== null;
  const displayFen = useMemo(() => {
    if (viewIndex === null) return fen;
    if (viewIndex < 0) return startFen;
    return moves[viewIndex]?.fen ?? fen;
  }, [fen, moves, startFen, viewIndex]);

  const displayLastMove = useMemo(() => {
    if (viewIndex === null) {
      const last = moves[moves.length - 1];
      return last
        ? { from: last.from, to: last.to, isCapture: last.isCapture }
        : null;
    }
    if (viewIndex < 0) return null;
    const item = moves[viewIndex];
    return item ? { from: item.from, to: item.to, isCapture: item.isCapture } : null;
  }, [moves, viewIndex]);

  const checkedKingSquare = useMemo(
    () => findCheckedKingSquare(displayFen),
    [displayFen]
  );

  const materialStats = useMemo(
    () => computeMaterialAndCaptures(displayFen, startFen),
    [displayFen, startFen]
  );

  const canUndo =
    !gameResult &&
    !isAnalyzing &&
    moves.length > 0 &&
    !(gameMode === 'stockfish' && humanColor === 'b' && moves.length === 1);

  const pgnString = useMemo(() => {
    if (variant === 'crazyhouse') {
      const pairs: string[] = [];
      for (let i = 0; i < moves.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const wSan = moves[i]?.san ?? '';
        const bSan = moves[i + 1]?.san;
        pairs.push(bSan ? `${moveNum}. ${wSan} ${bSan}` : `${moveNum}. ${wSan}`);
      }
      return `[Variant "Crazyhouse"]\n${pairs.join(' ')}`;
    }
    return chessRef.current.pgn();
  }, [fen, moves, variant]);

  const displayMoves = useMemo(() => {
    if (viewIndex === null) return moves;
    if (viewIndex < 0) return [];
    return moves.slice(0, viewIndex + 1);
  }, [moves, viewIndex]);

  const crazyhouseState = useMemo(() => {
    if (variant !== 'crazyhouse') return null;
    return computeCrazyhouseState(startFen, displayMoves, crazyhouseSetup);
  }, [crazyhouseSetup, displayMoves, startFen, variant]);

  const legalDropSquares = useMemo(() => {
    if (
      variant !== 'crazyhouse' ||
      !canInteractWithBoard ||
      !selectedDropPiece ||
      !crazyhouseState
    ) {
      return null;
    }
    if ((crazyhouseState[turn]?.[selectedDropPiece] ?? 0) <= 0) return null;
    const temp = new Chess();
    try {
      temp.load(displayFen, { skipValidation: true });
    } catch {
      return null;
    }
    return new Set<Square>(getCrazyhouseLegalDropSquares(temp, turn, selectedDropPiece));
  }, [canInteractWithBoard, crazyhouseState, displayFen, selectedDropPiece, turn, variant]);

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

  const allowPremove =
    activeView === 'play' &&
    gameMode === 'stockfish' &&
    !gameResult &&
    !isReviewingHistory &&
    !isAnalyzing &&
    turn !== humanColor;

  const hintsRemaining =
    gameMode === 'stockfish' ? Math.max(0, MAX_ENGINE_HINTS - hintsUsed) : null;
  const canRequestHint =
    canInteractWithBoard &&
    !isFetchingHint &&
    (hintsRemaining === null || hintsRemaining > 0);

  const fogVisibleSquares = useMemo(() => {
    if (variant !== 'fog-of-war' || gameResult || isReviewingHistory) {
      return null;
    }
    const viewerColor: PlayerColor = gameMode === 'stockfish' ? humanColor : turn;
    return computeFogVisibleSquares(displayFen, viewerColor);
  }, [displayFen, gameMode, gameResult, humanColor, isReviewingHistory, turn, variant]);

  const threeCheckCounts = useMemo(() => {
    if (variant !== 'three-check') return null;
    const slice =
      viewIndex === null
        ? moves
        : viewIndex < 0
        ? []
        : moves.slice(0, viewIndex + 1);
    return getThreeCheckCounts(slice);
  }, [moves, variant, viewIndex]);

  const racingKingRanks = useMemo(() => {
    if (variant !== 'racing-kings') return null;
    const temp = new Chess();
    try {
      temp.load(displayFen);
    } catch {
      return null;
    }
    const wSq = findKingSquare(temp, 'w');
    const bSq = findKingSquare(temp, 'b');
    return {
      w: wSq ? Number(wSq[1]) : 1,
      b: bSq ? Number(bSq[1]) : 1,
    };
  }, [displayFen, variant]);

  const getVariantPlayerBadge = (color: PlayerColor): string | null => {
    if (threeCheckCounts) {
      return `${threeCheckCounts[color]}/3 checks`;
    }
    if (racingKingRanks) {
      return `Rank ${racingKingRanks[color]}/8`;
    }
    return null;
  };

  // Top & Bottom PlayerBar assignments based on board orientation
  const topColor: PlayerColor = flipped ? 'w' : 'b';
  const bottomColor: PlayerColor = flipped ? 'b' : 'w';

  const getPlayerLabel = (color: PlayerColor) => {
    if (gameMode === 'stockfish') {
      if (color === humanColor) return 'You';
      if (opponentKind === 'bot') return currentBot.name;
      return `Stockfish · ${currentLevelConfig.name}`;
    }
    return color === 'w' ? 'Player 1' : 'Player 2';
  };

  const getPlayerSubtitle = (color: PlayerColor) => {
    if (gameMode === 'stockfish') {
      if (color === humanColor) return color === 'w' ? 'White' : 'Black';
      if (opponentKind === 'bot') return `${currentBot.tagline} · ${currentBot.eloLabel}`;
      return `Lv ${currentLevelConfig.level} · ${currentLevelConfig.eloLabel} Elo`;
    }
    return color === 'w' ? 'White' : 'Black';
  };

  const handleSelectHub = useCallback(() => {
    engineAbortRef.current?.abort();
    hintAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsEngineThinking(false);
    setIsFetchingHint(false);
    setActiveGame('hub');
  }, []);

  const handleSelectChess = useCallback((chessView?: AppView) => {
    setActiveGame('chess');
    if (chessView) setActiveView(chessView);
  }, []);

  const handleSelectSki = useCallback((mapId?: SkiMapId) => {
    engineAbortRef.current?.abort();
    hintAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsEngineThinking(false);
    setIsFetchingHint(false);
    setActiveGame('ski');
    if (mapId) {
      setRequestedSkiMapId(mapId);
      setRequestedSkiNonce((n) => n + 1);
    } else {
      setRequestedSkiMapId(null);
    }
  }, []);

  const handleSelectPool = useCallback(() => {
    engineAbortRef.current?.abort();
    hintAbortRef.current?.abort();
    stockfishService.cancelPending();
    setIsEngineThinking(false);
    setIsFetchingHint(false);
    setActiveGame('pool');
  }, []);

  const chessNavItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    { id: 'play', label: 'Play', icon: <Swords className="w-3.5 h-3.5" aria-hidden="true" /> },
    { id: 'puzzles', label: 'Puzzles', icon: <Puzzle className="w-3.5 h-3.5" aria-hidden="true" /> },
    { id: 'endgames', label: 'Endgames', icon: <Crown className="w-3.5 h-3.5" aria-hidden="true" /> },
    { id: 'archive', label: 'Archive', icon: <Archive className="w-3.5 h-3.5" aria-hidden="true" /> },
  ];

  const gameNavItems: {
    id: 'hub' | 'chess' | 'ski' | 'pool';
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  }[] = [
    {
      id: 'hub',
      label: 'Games',
      icon: <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" />,
      onClick: handleSelectHub,
    },
    {
      id: 'chess',
      label: 'Chess',
      icon: <Swords className="w-3.5 h-3.5" aria-hidden="true" />,
      onClick: () => handleSelectChess(),
    },
    {
      id: 'ski',
      label: 'Cork7 Ski',
      icon: <Mountain className="w-3.5 h-3.5" aria-hidden="true" />,
      onClick: () => handleSelectSki(),
    },
    {
      id: 'pool',
      label: '8-Ball Pool',
      icon: <CircleDot className="w-3.5 h-3.5" aria-hidden="true" />,
      onClick: handleSelectPool,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 transition-colors">
      {/* 3-Zone Top Navigation Bar */}
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand Identity */}
          <button
            type="button"
            onClick={handleSelectHub}
            className="flex items-center gap-2.5 shrink-0 text-left focus:outline-none"
          >
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
          </button>

          {/* Zone 2: Desktop Multi-Game Navigation */}
          <nav aria-label="Games navigation" className="hidden md:flex items-center gap-2 h-full">
            {gameNavItems.map((item) => {
              const active = activeGame === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`inline-flex h-full items-center gap-1.5 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-emerald-700 dark:border-emerald-400 text-emerald-800 dark:text-emerald-300'
                      : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Utility Controls & Primary Contextual CTA */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              aria-label={soundEnabled ? 'Mute game sounds' : 'Enable game sounds'}
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
              onClick={() => setSettingsOpen(true)}
              aria-label="Open Settings"
              title="Settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shrink-0"
            >
              <Settings className="w-4 h-4" />
            </button>

            {activeGame === 'chess' ? (
              <button
                type="button"
                onClick={() => startNewGame()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Game</span>
              </button>
            ) : activeGame === 'ski' || activeGame === 'pool' ? (
              <button
                type="button"
                onClick={handleSelectHub}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>All Games</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSelectSki('the-yard')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Mountain className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Drop In Ski</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Multi-Game Strip */}
        <nav
          aria-label="Mobile games navigation"
          className="md:hidden border-t border-stone-200/80 dark:border-stone-800/80 grid grid-cols-4 bg-stone-50/70 dark:bg-stone-900"
        >
          {gameNavItems.map((item) => {
            const active = activeGame === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`inline-flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-emerald-700 dark:border-emerald-400 text-emerald-800 dark:text-emerald-300 bg-white dark:bg-stone-900'
                    : 'border-transparent text-stone-600 dark:text-stone-400'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Secondary Chess Studio Sub-Navigation (when inside Chess) */}
      {activeGame === 'chess' && (
        <div className="border-b border-stone-200/80 dark:border-stone-800/80 bg-stone-50/90 dark:bg-stone-900/70">
          <nav
            aria-label="Chess studio sections"
            className="mx-auto flex max-w-[1200px] items-center gap-1 px-4 sm:px-6 overflow-x-auto"
          >
            {chessNavItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-emerald-700 dark:border-emerald-400 text-emerald-800 dark:text-emerald-300'
                      : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.id === 'archive' && savedMatches.length > 0 && (
                    <span className="font-mono text-[10px] opacity-70 tabular-nums">
                      ({savedMatches.length})
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* Active Game / Hub Workspace */}
      <main
        className={`mx-auto w-full max-w-[1200px] flex-1 ${
          activeGame === 'ski'
            ? 'px-2 py-2 sm:px-6 sm:py-6'
            : 'px-4 py-4 sm:px-6 sm:py-6'
        }`}
      >
        {activeGame === 'hub' && (
          <GamesHub
            onSelectChess={handleSelectChess}
            onSelectSki={handleSelectSki}
            onSelectPool={handleSelectPool}
          />
        )}

        {activeGame === 'ski' && (
          <SkiGameWorkspace
            soundEnabled={soundEnabled}
            legacyPhysics={skiLegacyPhysics}
            onToggleLegacyPhysics={() => setSkiLegacyPhysics((prev) => !prev)}
            requestedMapId={requestedSkiMapId}
            requestedStartNonce={requestedSkiNonce}
            onBackToHub={handleSelectHub}
            onStatsChange={refreshArchiveData}
          />
        )}

        {activeGame === 'pool' && (
          <PoolGameWorkspace
            soundEnabled={soundEnabled}
            onBackToHub={handleSelectHub}
            onStatsChange={refreshArchiveData}
          />
        )}

        {activeGame === 'chess' && activeView === 'play' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
            {/* Left Column: Board & Player Bars */}
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
                  pieceSet={pieceSet}
                  variantBadge={getVariantPlayerBadge(topColor)}
                />

                {variant === 'crazyhouse' && crazyhouseState && (
                  <CrazyhousePocketBar
                    color={topColor}
                    pocket={crazyhouseState[topColor]}
                    pieceSet={pieceSet}
                    canInteract={canInteractWithBoard}
                    isTurn={turn === topColor}
                    selectedDropPiece={turn === topColor ? selectedDropPiece : null}
                    hintDropPiece={turn === topColor ? hintDrop?.piece ?? null : null}
                    onSelectDropPiece={(piece) => {
                      setSelectedDropPiece(piece);
                      if (piece) playChessSound('select', soundEnabled);
                    }}
                  />
                )}

                {/* Board + Optional Analysis Eval Bar */}
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
                      humanColor={humanColor}
                      lastMove={displayLastMove}
                      checkedKingSquare={checkedKingSquare}
                      theme={boardTheme}
                      pieceSet={pieceSet}
                      soundEnabled={soundEnabled}
                      pendingPromotion={pendingPromotion}
                      onAttemptMove={handleAttemptMove}
                      onSelectPromotion={handleSelectPromotion}
                      onCancelPromotion={handleCancelPromotion}
                      isReviewingHistory={isReviewingHistory}
                      onJumpToLive={() => handleSelectHistoryPly(null)}
                      bestMoveArrow={bestMoveArrow}
                      hintArrow={hintArrow}
                      moveMarker={currentMoveMarker}
                      allowPremove={allowPremove}
                      premove={premove}
                      onSetPremove={setPremove}
                      arrows={arrows}
                      highlights={highlights}
                      onToggleArrow={handleToggleArrow}
                      onToggleHighlight={handleToggleHighlight}
                      onClearAnnotations={handleClearAnnotations}
                      variant={variant}
                      fogVisibleSquares={fogVisibleSquares}
                      selectedDropPiece={selectedDropPiece}
                      legalDropSquares={legalDropSquares}
                      onDropPiece={(piece, to) => executeCrazyhouseDrop(piece, to)}
                      onCancelDrop={() => setSelectedDropPiece(null)}
                      hintDropSquare={hintDrop?.to ?? null}
                    />
                  </div>
                </div>

                {variant === 'crazyhouse' && crazyhouseState && (
                  <CrazyhousePocketBar
                    color={bottomColor}
                    pocket={crazyhouseState[bottomColor]}
                    pieceSet={pieceSet}
                    canInteract={canInteractWithBoard}
                    isTurn={turn === bottomColor}
                    selectedDropPiece={turn === bottomColor ? selectedDropPiece : null}
                    hintDropPiece={turn === bottomColor ? hintDrop?.piece ?? null : null}
                    onSelectDropPiece={(piece) => {
                      setSelectedDropPiece(piece);
                      if (piece) playChessSound('select', soundEnabled);
                    }}
                  />
                )}

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
                    gameMode === 'stockfish' && bottomColor !== humanColor && isEngineThinking
                  }
                  isCheck={isCheck && turn === bottomColor}
                  isGameOver={Boolean(gameResult)}
                  timeRemainingMs={
                    currentTimeControl.id !== 'none' ? clocksMs[bottomColor] : null
                  }
                  pieceSet={pieceSet}
                  variantBadge={getVariantPlayerBadge(bottomColor)}
                />

                {/* Live Opening & Annotation Status Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 px-3 py-2 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0 text-stone-700 dark:text-stone-300">
                    <BookOpen
                      className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
                      aria-hidden="true"
                    />
                    {variantNote || variant !== 'standard' ? (
                      <span className="truncate">
                        <span className="font-semibold text-stone-900 dark:text-stone-100">
                          {GAME_VARIANTS.find((v) => v.id === variant)?.label ?? 'Custom'}
                        </span>
                        {variantNote && (
                          <span className="ml-1.5 font-mono text-stone-500 dark:text-stone-400">
                            · {variantNote}
                          </span>
                        )}
                      </span>
                    ) : openingInfo ? (
                      <span className="truncate">
                        <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                          {openingInfo.eco}
                        </span>
                        <span className="mx-1.5 text-stone-400">·</span>
                        <span>{openingInfo.name}</span>
                      </span>
                    ) : (
                      <span className="text-stone-500 dark:text-stone-400 truncate">
                        Standard Opening · Play a move to detect ECO line
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {premove && (
                      <button
                        type="button"
                        onClick={() => setPremove(null)}
                        className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:underline"
                      >
                        <span>
                          Premove {premove.from}→{premove.to}
                        </span>
                        <X className="w-3 h-3" />
                      </button>
                    )}

                    {(arrows.length > 0 || highlights.length > 0) && (
                      <button
                        type="button"
                        onClick={handleClearAnnotations}
                        className="text-[11px] font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 underline"
                      >
                        Clear marks
                      </button>
                    )}

                    {!premove && arrows.length === 0 && highlights.length === 0 && (
                      <span className="hidden sm:inline text-[10px] text-stone-400 dark:text-stone-500">
                        Right-click: arrows
                      </span>
                    )}
                  </div>
                </div>

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

            {/* Right Column: Unified Tabbed Play Studio */}
            <aside className="space-y-3">
              {/* Post-Game Summary Card */}
              {gameResult && (
                <section
                  aria-live="polite"
                  className="rounded-xl border border-emerald-700/35 dark:border-emerald-500/40 bg-white dark:bg-stone-900 p-4 shadow-sm animate-chess-modal space-y-3"
                >
                  <div>
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Game Complete
                    </div>
                    <h2 className="mt-0.5 font-display text-lg font-bold text-stone-900 dark:text-stone-100">
                      {gameResult.headline}
                    </h2>
                    <p className="mt-0.5 text-xs text-stone-600 dark:text-stone-400">
                      {gameResult.detail}
                    </p>
                  </div>

                  {analysisResult && !isAnalyzing && (
                    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/50 p-2.5 flex items-center justify-between text-xs">
                      <div className="font-mono tabular-nums">
                        <span className="text-stone-500 dark:text-stone-400 mr-1.5">W:</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {analysisResult.white.accuracy.toFixed(1)}%
                        </span>
                        <span className="mx-2 text-stone-300 dark:text-stone-700">|</span>
                        <span className="text-stone-500 dark:text-stone-400 mr-1.5">B:</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {analysisResult.black.accuracy.toFixed(1)}%
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSidebarTab('analysis');
                          handleSelectHistoryPly(moves.length > 0 ? 0 : null);
                        }}
                        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
                      >
                        Review Report
                      </button>
                    </div>
                  )}

                  <div
                    className={`grid gap-2 ${
                      moves.length > 0 &&
                      variant !== 'crazyhouse' &&
                      !analysisResult &&
                      !isAnalyzing
                        ? 'grid-cols-2'
                        : 'grid-cols-1'
                    }`}
                  >
                    {moves.length > 0 &&
                      variant !== 'crazyhouse' &&
                      !analysisResult &&
                      !isAnalyzing && (
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

              {/* Quick Actions Bar */}
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2 space-y-1.5">
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={handleRequestHint}
                    disabled={!canRequestHint}
                    title={
                      hintsRemaining !== null
                        ? `${hintsRemaining} engine hints left this game`
                        : 'Suggest best move'
                    }
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/80 px-2 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
                  >
                    {isFetchingHint ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {hintsRemaining !== null ? `Hint (${hintsRemaining})` : 'Hint'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/80 px-2 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
                  >
                    <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Undo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFlipped((f) => !f)}
                    title="Flip board (F)"
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/80 px-2 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Flip</span>
                  </button>

                  {gameMode === 'two-player' ? (
                    <button
                      type="button"
                      onClick={handleMutualDraw}
                      disabled={Boolean(gameResult)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/80 px-2 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
                    >
                      <Handshake className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Draw</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResign}
                      disabled={Boolean(gameResult) || moves.length === 0}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/80 px-2 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
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
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/80 px-3 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <Flag className="w-3 h-3" aria-hidden="true" />
                    <span>Resign ({turn === 'w' ? 'White' : 'Black'})</span>
                  </button>
                )}
              </div>

              {/* 3-Tab Studio Switcher */}
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-1">
                {(
                  [
                    {
                      id: 'moves',
                      label: moves.length > 0 ? `Moves (${moves.length})` : 'Moves',
                    },
                    { id: 'setup', label: 'Setup' },
                    {
                      id: 'analysis',
                      label: isAnalyzing
                        ? `Analyzing ${analysisProgress.completed}/${analysisProgress.total}`
                        : analysisResult
                          ? 'Analysis ✓'
                          : 'Analysis',
                    },
                  ] as { id: SidebarTab; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSidebarTab(tab.id)}
                    className={`rounded-lg py-2 px-2 text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                      sidebarTab === tab.id
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab 1: Moves & SAN Entry */}
              {sidebarTab === 'moves' && (
                <div className="space-y-3">
                  <MoveHistoryPanel
                    moves={moves}
                    viewIndex={viewIndex}
                    onSelectPly={handleSelectHistoryPly}
                    pgn={pgnString}
                    fen={displayFen}
                    analysis={analysisResult}
                    canEnterSan={canInteractWithBoard}
                    onSubmitSanMove={handleSubmitSanMove}
                  />

                  {moves.length > 0 &&
                    variant !== 'crazyhouse' &&
                    !analysisResult &&
                    !isAnalyzing && (
                      <button
                        type="button"
                        onClick={handleStartAnalysis}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 py-2.5 px-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 transition-colors"
                      >
                        <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Run Stockfish Match Analysis</span>
                      </button>
                    )}
                </div>
              )}

              {/* Tab 2: Game Setup, Variants & Appearance */}
              {sidebarTab === 'setup' && (
                <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-4">
                  {/* Game Mode */}
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

                  {/* Variant Selection */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                        Chess Variant
                      </span>
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 truncate max-w-[180px]">
                        {GAME_VARIANTS.find((v) => v.id === variant)?.label}
                      </span>
                    </div>

                    {(
                      [
                        { key: 'rules', label: 'Rules & Twists', cols: 'grid-cols-3' },
                        { key: 'setups', label: 'Custom Armies & 960', cols: 'grid-cols-3' },
                        { key: 'odds', label: 'Material Odds', cols: 'grid-cols-4' },
                      ] as const
                    ).map((group) => (
                      <div key={group.key} className="space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                          {group.label}
                        </div>
                        <div className={`grid ${group.cols} gap-1`}>
                          {GAME_VARIANTS.filter((v) => v.category === group.key).map((v) => {
                            const active = variant === v.id;
                            return (
                              <button
                                key={v.id}
                                type="button"
                                title={v.description}
                                onClick={() => startNewGame({ variant: v.id })}
                                className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap truncate ${
                                  active
                                    ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
                                    : 'border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                                }`}
                              >
                                {v.shortLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <div className="rounded-lg border border-stone-200/80 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-2.5 py-2 text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed space-y-2">
                      <div>
                        {GAME_VARIANTS.find((v) => v.id === variant)?.description}
                        {(variant === 'shuffle960' ||
                          variant === 'double-960' ||
                          (variant === 'crazyhouse' && crazyhouseSetup === '960')) && (
                          <span className="block mt-0.5 text-[10px] text-stone-400 dark:text-stone-500">
                            Castling is active when a side’s King begins on the e-file.
                          </span>
                        )}
                      </div>

                      {variant === 'crazyhouse' && (
                        <div className="pt-1.5 border-t border-stone-200/70 dark:border-stone-700/70 space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                            Crazyhouse Setup
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                { id: 'classic', label: 'Classic' },
                                { id: '960', label: '960 Setup' },
                                { id: 'starter', label: '+B·N·P Drop' },
                              ] as { id: CrazyhouseSetupMode; label: string }[]
                            ).map((modeOpt) => {
                              const active = crazyhouseSetup === modeOpt.id;
                              return (
                                <button
                                  key={modeOpt.id}
                                  type="button"
                                  onClick={() =>
                                    startNewGame({
                                      variant: 'crazyhouse',
                                      crazyhouseSetup: modeOpt.id,
                                    })
                                  }
                                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                                    active
                                      ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-600 text-white'
                                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                                  }`}
                                >
                                  {modeOpt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Engine / Bots / Side */}
                  {gameMode === 'stockfish' ? (
                    <>
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
                          autoFlipTwoPlayer
                            ? 'bg-emerald-700'
                            : 'bg-stone-300 dark:bg-stone-600'
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

                  {/* Move Timer */}
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

                  {/* Board Theme & Piece Set */}
                  <div className="space-y-2.5 pt-1 border-t border-stone-200/80 dark:border-stone-800/80">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                          Board Style
                        </span>
                        <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400 tabular-nums">
                          {arcadeState.xp} XP
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: 'tournament', label: 'Green', light: '#EEEED2', dark: '#769656' },
                            { id: 'walnut', label: 'Walnut', light: '#F0D9B5', dark: '#B58863' },
                            { id: 'slate', label: 'Slate', light: '#E6E9EE', dark: '#6B7D92' },
                            { id: 'midnight', label: 'Midnight', light: '#CBD5E1', dark: '#1E293B' },
                            { id: 'royal', label: 'Royal', light: '#F5EED6', dark: '#1B5E3F' },
                          ] as const
                        ).map((item) => {
                          const unlocked = isItemUnlocked(arcadeState, 'chess-board', item.id);
                          const unlockDef = ARCADE_UNLOCKABLES.find(
                            (u) => u.category === 'chess-board' && u.targetId === item.id
                          );
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                if (unlocked) {
                                  setBoardTheme(item.id);
                                  setBoardUnlockNotice(null);
                                  return;
                                }
                                if (unlockDef) {
                                  const res = unlockArcadeItem(unlockDef.id);
                                  setArcadeState(res.state);
                                  if (res.ok) {
                                    setBoardTheme(item.id);
                                    setBoardUnlockNotice(`Unlocked ${item.label} board!`);
                                  } else if (res.error) {
                                    setBoardUnlockNotice(`${item.label}: ${res.error}`);
                                  }
                                }
                              }}
                              aria-label={`${item.label} board theme`}
                              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                                boardTheme === item.id
                                  ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-stone-900 dark:text-stone-100'
                                  : unlocked
                                  ? 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                                  : 'border-stone-200 dark:border-stone-800 text-stone-400 dark:text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800'
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
                              {!unlocked && unlockDef && (
                                <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400 tabular-nums">
                                  <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                                  {unlockDef.costXp}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {boardUnlockNotice && (
                        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          {boardUnlockNotice}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                        Piece Set
                      </span>
                      <div className="flex items-center gap-1.5">
                        {(
                          [
                            { id: 'classic', label: 'Classic' },
                            { id: 'neo', label: 'Neo' },
                            { id: 'pixel', label: 'Pixel' },
                          ] as { id: PieceSet; label: string }[]
                        ).map((setOpt) => (
                          <button
                            key={setOpt.id}
                            type="button"
                            onClick={() => setPieceSet(setOpt.id)}
                            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                              pieceSet === setOpt.id
                                ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-stone-900 dark:text-stone-100'
                                : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                            }`}
                          >
                            {setOpt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {typeof window !== 'undefined' && !window.__EMBEDDED_STOCKFISH_ASM__ && (
                    <a
                      href="./squareeight-chess.html"
                      download="squareeight-chess.html"
                      className="flex items-center justify-between rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/50 px-3 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    >
                      <span>Download Standalone HTML</span>
                      <FileDown
                        className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                    </a>
                  )}
                </section>
              )}

              {/* Tab 3: Stockfish Match Analysis */}
              {sidebarTab === 'analysis' && (
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
              )}
            </aside>
          </div>
        )}

        {activeGame === 'chess' && activeView === 'puzzles' && (
          <PuzzlesWorkspace
            boardTheme={boardTheme}
            pieceSet={pieceSet}
            soundEnabled={soundEnabled}
            onStatsChange={refreshArchiveData}
          />
        )}

        {activeGame === 'chess' && activeView === 'endgames' && (
          <EndgamesWorkspace
            boardTheme={boardTheme}
            pieceSet={pieceSet}
            soundEnabled={soundEnabled}
            onStatsChange={refreshArchiveData}
          />
        )}

        {activeGame === 'chess' && activeView === 'archive' && (
          <ArchiveWorkspace
            matches={savedMatches}
            defeatedBots={defeatedBots}
            defeatedLevels={defeatedLevels}
            onLoadSavedMatch={handleLoadSavedMatch}
            onDeleteMatch={(id) => setSavedMatches(deleteSavedMatch(id))}
            onClearMatches={() => setSavedMatches(clearSavedMatches())}
            onImportPositionOrGame={handleImportPositionOrGame}
          />
        )}
      </main>

      <footer className="border-t border-stone-200/80 dark:border-stone-800/80 py-3 px-4 text-center text-xs text-stone-500 dark:text-stone-400">
        Made by Anas Messaoud
      </footer>

      {/* Global Settings Modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-settings-title"
            className="w-full max-w-md rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-xl space-y-4 animate-chess-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-stone-200/80 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <h2
                  id="global-settings-title"
                  className="font-display text-base font-bold text-stone-900 dark:text-stone-100"
                >
                  Settings
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close Settings"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Cork7 Ski Physics Mode */}
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-stone-900 dark:text-stone-100">
                      Cork7 Ski Physics
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                      {skiLegacyPhysics
                        ? 'Legacy mode: original arcadey rail carving and fixed slope gravity.'
                        : 'Pro Alpine: momentum drift carving, real slope pitch, crest airtime & landing pump.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-stone-200/70 dark:bg-stone-900 p-1">
                  <button
                    type="button"
                    onClick={() => setSkiLegacyPhysics(false)}
                    className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${
                      !skiLegacyPhysics
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    Pro Alpine (Better)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkiLegacyPhysics(true)}
                    className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${
                      skiLegacyPhysics
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    Legacy Physics
                  </button>
                </div>
              </div>

              {/* Sound & Appearance */}
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-stone-200 dark:border-stone-800 px-3 py-2.5">
                  <span className="font-medium text-stone-800 dark:text-stone-200">
                    Game Sound Effects
                  </span>
                  <button
                    type="button"
                    onClick={() => setSoundEnabled((s) => !s)}
                    className={`rounded-md px-3 py-1 font-semibold transition-colors ${
                      soundEnabled
                        ? 'bg-emerald-700 text-white'
                        : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    {soundEnabled ? 'On' : 'Off'}
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-stone-200 dark:border-stone-800 px-3 py-2.5">
                  <span className="font-medium text-stone-800 dark:text-stone-200">
                    Appearance Theme
                  </span>
                  <button
                    type="button"
                    onClick={() => setDarkMode((d) => !d)}
                    className="rounded-md border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 px-3 py-1 font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                  >
                    {darkMode ? 'Dark' : 'Light'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
