import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square, type PieceSymbol } from 'chess.js';
import type {
  BoardAnnotationColor,
  BoardArrow,
  BoardHighlight,
  BoardTheme,
  MoveClassification,
  PendingPromotion,
  PieceSet,
  PlayerColor,
  Premove,
  PromotionPiece,
} from '../types/chess';
import { playChessSound } from '../utils/sound';
import { ChessPieceSvg } from './ChessPieceSvg';

interface ChessBoardProps {
  fen: string;
  flipped: boolean;
  canInteract: boolean;
  activeTurn: PlayerColor;
  humanColor?: PlayerColor;
  lastMove: { from: string; to: string; isCapture?: boolean } | null;
  checkedKingSquare: Square | null;
  theme: BoardTheme;
  pieceSet?: PieceSet;
  soundEnabled: boolean;
  pendingPromotion: PendingPromotion | null;
  onAttemptMove: (from: Square, to: Square) => void;
  onSelectPromotion: (piece: PromotionPiece) => void;
  onCancelPromotion: () => void;
  isReviewingHistory: boolean;
  onJumpToLive: () => void;
  bestMoveArrow?: { from: string; to: string } | null;
  hintArrow?: { from: string; to: string } | null;
  moveMarker?: { square: Square; classification: MoveClassification } | null;
  // Premoves
  allowPremove?: boolean;
  premove?: Premove | null;
  onSetPremove?: (premove: Premove | null) => void;
  // Right-click annotations
  arrows?: BoardArrow[];
  highlights?: BoardHighlight[];
  onToggleArrow?: (arrow: BoardArrow) => void;
  onToggleHighlight?: (highlight: BoardHighlight) => void;
  onClearAnnotations?: () => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

const THEME_PALETTES: Record<
  BoardTheme,
  {
    light: string;
    dark: string;
    lightCoord: string;
    darkCoord: string;
    lastLight: string;
    lastDark: string;
    selected: string;
  }
> = {
  tournament: {
    light: '#EEEED2',
    dark: '#769656',
    lightCoord: '#5E7A42',
    darkCoord: '#EEEED2',
    lastLight: '#F4F286',
    lastDark: '#BACB44',
    selected: '#DDD763',
  },
  walnut: {
    light: '#F0D9B5',
    dark: '#B58863',
    lightCoord: '#8C623F',
    darkCoord: '#F0D9B5',
    lastLight: '#E6DC75',
    lastDark: '#C2B14B',
    selected: '#D9C95B',
  },
  slate: {
    light: '#E6E9EE',
    dark: '#6B7D92',
    lightCoord: '#4B5B6E',
    darkCoord: '#E6E9EE',
    lastLight: '#BAE0F5',
    lastDark: '#5A9EC2',
    selected: '#9CD2EE',
  },
  midnight: {
    light: '#CBD5E1',
    dark: '#334155',
    lightCoord: '#334155',
    darkCoord: '#CBD5E1',
    lastLight: '#93C5FD',
    lastDark: '#2563EB',
    selected: '#60A5FA',
  },
  royal: {
    light: '#F3EFE0',
    dark: '#1D5C4B',
    lightCoord: '#1D5C4B',
    darkCoord: '#F3EFE0',
    lastLight: '#FDE68A',
    lastDark: '#B48A2C',
    selected: '#FCD34D',
  },
};

const ANNOTATION_COLORS: Record<
  BoardAnnotationColor,
  { arrow: string; highlight: string }
> = {
  emerald: {
    arrow: 'rgba(16, 185, 129, 0.85)',
    highlight: 'rgba(16, 185, 129, 0.42)',
  },
  red: {
    arrow: 'rgba(239, 68, 68, 0.85)',
    highlight: 'rgba(239, 68, 68, 0.44)',
  },
  amber: {
    arrow: 'rgba(245, 158, 11, 0.88)',
    highlight: 'rgba(245, 158, 11, 0.44)',
  },
  sky: {
    arrow: 'rgba(14, 165, 233, 0.86)',
    highlight: 'rgba(14, 165, 233, 0.42)',
  },
};

type PieceMotion = {
  xPct: number;
  yPct: number;
  isSettle: boolean;
  key: string;
};

const MOVE_MARKER_META: Record<
  MoveClassification,
  { symbol: string; title: string; className: string }
> = {
  book: {
    symbol: 'B',
    title: 'Opening Book Move',
    className: 'bg-amber-700 text-white ring-white',
  },
  brilliant: {
    symbol: '!!',
    title: 'Brilliant Move',
    className: 'bg-cyan-500 text-white ring-white',
  },
  great: {
    symbol: '!',
    title: 'Great Move',
    className: 'bg-sky-500 text-white ring-white',
  },
  best: {
    symbol: '★',
    title: 'Best Move',
    className: 'bg-emerald-600 text-white ring-white',
  },
  excellent: {
    symbol: '✓',
    title: 'Excellent Move',
    className: 'bg-emerald-500 text-white ring-white',
  },
  good: {
    symbol: '✓',
    title: 'Good Move',
    className: 'bg-stone-600 text-white ring-white',
  },
  inaccuracy: {
    symbol: '?!',
    title: 'Inaccuracy',
    className: 'bg-amber-400 text-stone-950 ring-white',
  },
  mistake: {
    symbol: '?',
    title: 'Mistake',
    className: 'bg-orange-500 text-white ring-white',
  },
  blunder: {
    symbol: '??',
    title: 'Blunder',
    className: 'bg-red-600 text-white ring-white',
  },
};

function getAnnotationColorFromEvent(e: {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): BoardAnnotationColor {
  if (e.shiftKey) return 'red';
  if (e.altKey) return 'amber';
  if (e.ctrlKey || e.metaKey) return 'sky';
  return 'emerald';
}

function getPseudoPremoveSquares(
  from: Square,
  type: PieceSymbol,
  color: PlayerColor
): Set<Square> {
  const targets = new Set<Square>();
  const f0 = FILES.indexOf(from[0] as (typeof FILES)[number]);
  const r0 = RANKS.indexOf(from[1] as (typeof RANKS)[number]);
  if (f0 === -1 || r0 === -1) return targets;

  const add = (f: number, r: number) => {
    if (f >= 0 && f < 8 && r >= 0 && r < 8) {
      targets.add(`${FILES[f]}${RANKS[r]}` as Square);
    }
  };

  switch (type) {
    case 'p': {
      const dir = color === 'w' ? -1 : 1; // RANKS[0] is '8', RANKS[7] is '1'
      add(f0, r0 + dir);
      add(f0 - 1, r0 + dir);
      add(f0 + 1, r0 + dir);
      if ((color === 'w' && r0 === 6) || (color === 'b' && r0 === 1)) {
        add(f0, r0 + dir * 2);
      }
      break;
    }
    case 'n': {
      const jumps = [
        [1, 2], [2, 1], [-1, 2], [-2, 1],
        [1, -2], [2, -1], [-1, -2], [-2, -1],
      ];
      for (const [df, dr] of jumps) add(f0 + df, r0 + dr);
      break;
    }
    case 'k': {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df !== 0 || dr !== 0) add(f0 + df, r0 + dr);
        }
      }
      add(f0 + 2, r0);
      add(f0 - 2, r0);
      break;
    }
    case 'r':
    case 'b':
    case 'q': {
      const dirs: [number, number][] = [];
      if (type === 'r' || type === 'q') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
      if (type === 'b' || type === 'q') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
      for (const [df, dr] of dirs) {
        for (let step = 1; step < 8; step++) {
          add(f0 + df * step, r0 + dr * step);
        }
      }
      break;
    }
  }
  targets.delete(from);
  return targets;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  flipped,
  canInteract,
  activeTurn,
  humanColor,
  lastMove,
  checkedKingSquare,
  theme,
  pieceSet = 'classic',
  soundEnabled,
  pendingPromotion,
  onAttemptMove,
  onSelectPromotion,
  onCancelPromotion,
  isReviewingHistory,
  onJumpToLive,
  bestMoveArrow = null,
  hintArrow = null,
  moveMarker = null,
  allowPremove = false,
  premove = null,
  onSetPremove,
  arrows = [],
  highlights = [],
  onToggleArrow,
  onToggleHighlight,
  onClearAnnotations,
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const lastDraggedMoveRef = useRef<string | null>(null);
  const prevFenRef = useRef<string>(fen);

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [premoveSelected, setPremoveSelected] = useState<Square | null>(null);
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null);
  const [animCounter, setAnimCounter] = useState<number>(0);

  const [dragState, setDragState] = useState<{
    from: Square;
    type: PieceSymbol;
    color: PlayerColor;
    isPremoveDrag: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
    squareSize: number;
  } | null>(null);

  const [rightDragOrigin, setRightDragOrigin] = useState<{
    from: Square;
    color: BoardAnnotationColor;
  } | null>(null);

  const palette = THEME_PALETTES[theme];

  const gameAtFen = useMemo(() => {
    const instance = new Chess();
    try {
      instance.load(fen);
    } catch {
      // Fallback to default position if malformed
    }
    return instance;
  }, [fen]);

  useEffect(() => {
    setSelectedSquare(null);
    setPremoveSelected(null);
    setDragState(null);
    setHoverSquare(null);
    if (prevFenRef.current !== fen) {
      prevFenRef.current = fen;
      setAnimCounter((c) => c + 1);
    }
  }, [fen]);

  useEffect(() => {
    if (!canInteract && !allowPremove) {
      setSelectedSquare(null);
      setPremoveSelected(null);
      setDragState(null);
      setHoverSquare(null);
    }
  }, [allowPremove, canInteract]);

  const legalTargets = useMemo(() => {
    const activeSquare =
      dragState && !dragState.isPremoveDrag ? dragState.from : selectedSquare;
    if (!canInteract || !activeSquare) return new Map<Square, boolean>();
    const moves = gameAtFen.moves({ square: activeSquare, verbose: true });
    const map = new Map<Square, boolean>();
    for (const m of moves) {
      const targetHasPiece = Boolean(gameAtFen.get(m.to)) || m.isEnPassant();
      map.set(m.to, targetHasPiece);
    }
    return map;
  }, [canInteract, dragState, selectedSquare, gameAtFen]);

  const premoveTargets = useMemo(() => {
    if (!allowPremove || canInteract) return new Set<Square>();
    const src =
      dragState?.isPremoveDrag ? dragState.from : premoveSelected;
    if (!src) return new Set<Square>();
    const p = gameAtFen.get(src);
    if (!p) return new Set<Square>();
    return getPseudoPremoveSquares(src, p.type, p.color);
  }, [allowPremove, canInteract, dragState, premoveSelected, gameAtFen]);

  const displayFiles = useMemo(() => (flipped ? [...FILES].reverse() : [...FILES]), [flipped]);
  const displayRanks = useMemo(() => (flipped ? [...RANKS].reverse() : [...RANKS]), [flipped]);

  const pieceMotions = useMemo(() => {
    const map = new Map<Square, PieceMotion>();
    if (!lastMove || animCounter === 0) return map;

    const fromFile = lastMove.from[0] as (typeof FILES)[number];
    const fromRank = lastMove.from[1] as (typeof RANKS)[number];
    const toFile = lastMove.to[0] as (typeof FILES)[number];
    const toRank = lastMove.to[1] as (typeof RANKS)[number];

    const fromCol = displayFiles.indexOf(fromFile);
    const fromRow = displayRanks.indexOf(fromRank);
    const toCol = displayFiles.indexOf(toFile);
    const toRow = displayRanks.indexOf(toRank);

    if (fromCol === -1 || fromRow === -1 || toCol === -1 || toRow === -1) {
      return map;
    }

    const toSq = lastMove.to as Square;
    const moveKey = `${lastMove.from}-${lastMove.to}`;
    const wasDragged = lastDraggedMoveRef.current === moveKey;
    if (wasDragged) {
      lastDraggedMoveRef.current = null;
    }

    map.set(toSq, {
      xPct: (fromCol - toCol) * 100,
      yPct: (fromRow - toRow) * 100,
      isSettle: wasDragged,
      key: `${animCounter}-${toSq}`,
    });

    const landedPiece = gameAtFen.get(toSq);
    if (landedPiece?.type === 'k') {
      const fileDelta = FILES.indexOf(toFile) - FILES.indexOf(fromFile);
      if (Math.abs(fileDelta) === 2) {
        const rookFromFile: (typeof FILES)[number] = fileDelta > 0 ? 'h' : 'a';
        const rookToFile: (typeof FILES)[number] = fileDelta > 0 ? 'f' : 'd';
        const rookToSq = `${rookToFile}${toRank}` as Square;
        const rFromCol = displayFiles.indexOf(rookFromFile);
        const rToCol = displayFiles.indexOf(rookToFile);
        if (rFromCol !== -1 && rToCol !== -1 && gameAtFen.get(rookToSq)?.type === 'r') {
          map.set(rookToSq, {
            xPct: (rFromCol - rToCol) * 100,
            yPct: 0,
            isSettle: false,
            key: `${animCounter}-${rookToSq}`,
          });
        }
      }
    }

    return map;
  }, [animCounter, displayFiles, displayRanks, gameAtFen, lastMove]);

  const getSquareFromPoint = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const el = boardRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }
      const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      return `${displayFiles[col]}${displayRanks[row]}` as Square;
    },
    [displayFiles, displayRanks]
  );

  // Global pointer listeners during left drag
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const movedEnough = dragState.isDragging || Math.hypot(dx, dy) > 5;

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentY: e.clientY,
              isDragging: movedEnough,
            }
          : null
      );

      if (movedEnough) {
        setHoverSquare(getSquareFromPoint(e.clientX, e.clientY));
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const target = getSquareFromPoint(e.clientX, e.clientY);

      if (dragState.isPremoveDrag) {
        if (dragState.isDragging) {
          if (target && target !== dragState.from && premoveTargets.has(target)) {
            const promo =
              dragState.type === 'p' && (target[1] === '8' || target[1] === '1')
                ? 'q'
                : undefined;
            onSetPremove?.({ from: dragState.from, to: target, promotion: promo });
            setPremoveSelected(null);
          } else if (target === dragState.from) {
            setPremoveSelected(dragState.from);
          } else {
            setPremoveSelected(null);
          }
        } else {
          if (
            premoveSelected &&
            premoveSelected !== dragState.from &&
            premoveTargets.has(dragState.from)
          ) {
            const srcPiece = gameAtFen.get(premoveSelected);
            const promo =
              srcPiece?.type === 'p' && (dragState.from[1] === '8' || dragState.from[1] === '1')
                ? 'q'
                : undefined;
            onSetPremove?.({ from: premoveSelected, to: dragState.from, promotion: promo });
            setPremoveSelected(null);
          } else if (premoveSelected === dragState.from) {
            setPremoveSelected(null);
          } else {
            playChessSound('select', soundEnabled);
            setPremoveSelected(dragState.from);
          }
        }
      } else if (dragState.isDragging) {
        if (target && target !== dragState.from && legalTargets.has(target)) {
          lastDraggedMoveRef.current = `${dragState.from}-${target}`;
          onAttemptMove(dragState.from, target);
          setSelectedSquare(null);
        } else if (target === dragState.from) {
          setSelectedSquare(dragState.from);
        } else {
          if (target && target !== dragState.from) {
            playChessSound('illegal', soundEnabled);
          }
          setSelectedSquare(null);
        }
      } else {
        if (selectedSquare && selectedSquare !== dragState.from && legalTargets.has(dragState.from)) {
          onAttemptMove(selectedSquare, dragState.from);
          setSelectedSquare(null);
        } else if (selectedSquare === dragState.from) {
          setSelectedSquare(null);
        } else {
          playChessSound('select', soundEnabled);
          setSelectedSquare(dragState.from);
        }
      }

      setDragState(null);
      setHoverSquare(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    dragState,
    gameAtFen,
    getSquareFromPoint,
    legalTargets,
    onAttemptMove,
    onSetPremove,
    premoveSelected,
    premoveTargets,
    selectedSquare,
    soundEnabled,
  ]);

  // Global pointerup for right-click annotations (arrows & square highlights)
  useEffect(() => {
    if (!rightDragOrigin) return;

    const handleRightUp = (e: PointerEvent) => {
      const target = getSquareFromPoint(e.clientX, e.clientY);
      if (target) {
        if (target === rightDragOrigin.from) {
          onToggleHighlight?.({ square: target, color: rightDragOrigin.color });
        } else {
          onToggleArrow?.({
            from: rightDragOrigin.from,
            to: target,
            color: rightDragOrigin.color,
          });
        }
      }
      setRightDragOrigin(null);
    };

    window.addEventListener('pointerup', handleRightUp);
    window.addEventListener('pointercancel', handleRightUp);
    return () => {
      window.removeEventListener('pointerup', handleRightUp);
      window.removeEventListener('pointercancel', handleRightUp);
    };
  }, [getSquareFromPoint, onToggleArrow, onToggleHighlight, rightDragOrigin]);

  useEffect(() => {
    if (!pendingPromotion) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'q') onSelectPromotion('q');
      else if (k === 'r') onSelectPromotion('r');
      else if (k === 'b') onSelectPromotion('b');
      else if (k === 'n') onSelectPromotion('n');
      else if (k === 'escape') onCancelPromotion();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingPromotion, onSelectPromotion, onCancelPromotion]);

  const handleSquarePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    sq: Square
  ) => {
    // Right click: cancel premove or start annotation arrow/highlight
    if (e.button === 2) {
      e.preventDefault();
      if (premove) {
        onSetPremove?.(null);
        setPremoveSelected(null);
        return;
      }
      setRightDragOrigin({
        from: sq,
        color: getAnnotationColorFromEvent(e),
      });
      return;
    }

    if (e.button !== 0 && e.pointerType === 'mouse') return;
    onClearAnnotations?.();

    if (pendingPromotion) return;

    const piece = gameAtFen.get(sq);

    // Premove flow when waiting on AI's turn
    if (!canInteract && allowPremove) {
      const targetColor = humanColor ?? (activeTurn === 'w' ? 'b' : 'w');

      if (premoveSelected && premoveTargets.has(sq)) {
        e.preventDefault();
        const srcPiece = gameAtFen.get(premoveSelected);
        const promo =
          srcPiece?.type === 'p' && (sq[1] === '8' || sq[1] === '1')
            ? 'q'
            : undefined;
        onSetPremove?.({ from: premoveSelected, to: sq, promotion: promo });
        setPremoveSelected(null);
        return;
      }

      if (piece && piece.color === targetColor) {
        e.preventDefault();
        const boardWidth = boardRef.current?.getBoundingClientRect().width ?? 480;
        setDragState({
          from: sq,
          type: piece.type,
          color: piece.color,
          isPremoveDrag: true,
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          currentY: e.clientY,
          isDragging: false,
          squareSize: boardWidth / 8,
        });
        return;
      }

      setPremoveSelected(null);
      if (premove) onSetPremove?.(null);
      return;
    }

    if (!canInteract) return;

    if (selectedSquare && legalTargets.has(sq)) {
      e.preventDefault();
      onAttemptMove(selectedSquare, sq);
      setSelectedSquare(null);
      return;
    }

    if (piece && piece.color === activeTurn) {
      e.preventDefault();
      const boardWidth = boardRef.current?.getBoundingClientRect().width ?? 480;
      setDragState({
        from: sq,
        type: piece.type,
        color: piece.color,
        isPremoveDrag: false,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        isDragging: false,
        squareSize: boardWidth / 8,
      });
      return;
    }

    if (selectedSquare && selectedSquare !== sq) {
      playChessSound('illegal', soundEnabled);
    }
    setSelectedSquare(null);
  };

  const renderSvgArrow = (
    from: string,
    to: string,
    strokeColor: string,
    headColor: string,
    key: string
  ) => {
    const fromFile = from[0] as (typeof FILES)[number];
    const fromRank = from[1] as (typeof RANKS)[number];
    const toFile = to[0] as (typeof FILES)[number];
    const toRank = to[1] as (typeof RANKS)[number];

    const fromCol = displayFiles.indexOf(fromFile);
    const fromRow = displayRanks.indexOf(fromRank);
    const toCol = displayFiles.indexOf(toFile);
    const toRow = displayRanks.indexOf(toRank);

    if (fromCol === -1 || fromRow === -1 || toCol === -1 || toRow === -1) {
      return null;
    }

    const x1 = fromCol * 100 + 50;
    const y1 = fromRow * 100 + 50;
    const x2 = toCol * 100 + 50;
    const y2 = toRow * 100 + 50;

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 26;
    const endX = x2 - Math.cos(angle) * 14;
    const endY = y2 - Math.sin(angle) * 14;
    const leftX = x2 - Math.cos(angle - Math.PI / 6) * headLen;
    const leftY = y2 - Math.sin(angle - Math.PI / 6) * headLen;
    const rightX = x2 - Math.cos(angle + Math.PI / 6) * headLen;
    const rightY = y2 - Math.sin(angle + Math.PI / 6) * headLen;

    return (
      <g key={key}>
        <line
          x1={x1}
          y1={y1}
          x2={endX}
          y2={endY}
          stroke={strokeColor}
          strokeWidth="15"
          strokeLinecap="round"
        />
        <polygon
          points={`${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}`}
          fill={headColor}
        />
      </g>
    );
  };

  const hasSvgArrows = Boolean(bestMoveArrow || hintArrow || arrows.length > 0);

  return (
    <div className="relative w-full select-none">
      <div
        ref={boardRef}
        role="grid"
        aria-label="Chessboard"
        onContextMenu={(e) => e.preventDefault()}
        className="relative aspect-square w-full overflow-hidden rounded-xl border border-stone-300 dark:border-stone-700 shadow-sm touch-none"
      >
        <div className="grid h-full w-full grid-cols-8 grid-rows-8">
          {displayRanks.map((rank, rowIdx) =>
            displayFiles.map((file, colIdx) => {
              const sq = `${file}${rank}` as Square;
              const fileIdx = FILES.indexOf(file);
              const rankNum = Number(rank);
              const isLight = (fileIdx + rankNum) % 2 === 1;
              const piece = gameAtFen.get(sq);

              const isSelected = selectedSquare === sq || premoveSelected === sq;
              const isLastMove =
                lastMove !== null && (lastMove.from === sq || lastMove.to === sq);
              const isPremoveSq =
                premove !== null && (premove.from === sq || premove.to === sq);
              const isCaptureLanding =
                animCounter > 0 && lastMove?.to === sq && Boolean(lastMove.isCapture);
              const isKingInCheck = checkedKingSquare === sq;
              const isLegalTarget = legalTargets.has(sq);
              const isPremoveTarget = premoveTargets.has(sq);
              const isCaptureTarget = legalTargets.get(sq) === true;
              const isDragOrigin = dragState?.isDragging && dragState.from === sq;
              const isDragHover =
                dragState?.isDragging &&
                hoverSquare === sq &&
                (dragState.isPremoveDrag ? isPremoveTarget : isLegalTarget);
              const motion = pieceMotions.get(sq);
              const squareHighlight = highlights.find((h) => h.square === sq);

              let bgColor = isLight ? palette.light : palette.dark;
              if (isLastMove) {
                bgColor = isLight ? palette.lastLight : palette.lastDark;
              }
              if (isSelected) {
                bgColor = palette.selected;
              }

              const coordColor = isLight ? palette.lightCoord : palette.darkCoord;

              return (
                <button
                  key={sq}
                  type="button"
                  role="gridcell"
                  aria-label={`${sq}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}` : ''}`}
                  onPointerDown={(e) => handleSquarePointerDown(e, sq)}
                  style={{ backgroundColor: bgColor }}
                  className={`relative flex items-center justify-center p-0 border-0 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${
                    (canInteract && piece && piece.color === activeTurn) ||
                    (allowPremove && !canInteract && piece && piece.color !== activeTurn)
                      ? 'cursor-grab active:cursor-grabbing'
                      : (canInteract && isLegalTarget) || (allowPremove && !canInteract && isPremoveTarget)
                      ? 'cursor-pointer'
                      : 'cursor-default'
                  }`}
                >
                  {/* Premove queued square tint */}
                  {isPremoveSq && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-sky-500/35 ring-2 ring-inset ring-sky-400/70"
                    />
                  )}

                  {/* User right-click square highlight */}
                  {squareHighlight && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{ backgroundColor: ANNOTATION_COLORS[squareHighlight.color].highlight }}
                    />
                  )}

                  {/* Check highlight */}
                  {isKingInCheck && (
                    <span
                      key={`check-${fen}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 animate-chess-check"
                      style={{
                        background:
                          'radial-gradient(circle, rgba(220,38,38,0.88) 0%, rgba(220,38,38,0.45) 55%, rgba(220,38,38,0) 76%)',
                      }}
                    />
                  )}

                  {/* Capture impact ripple */}
                  {isCaptureLanding && (
                    <span
                      key={`cap-${animCounter}-${sq}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[10%] z-10 rounded-full border-2 border-stone-900/45 animate-chess-capture"
                    />
                  )}

                  {/* Drag-over legal highlight ring */}
                  {isDragHover && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-10 ring-4 ring-inset ring-stone-900/35"
                    />
                  )}

                  {/* Rank coordinate on left column */}
                  {colIdx === 0 && (
                    <span
                      aria-hidden="true"
                      style={{ color: coordColor }}
                      className="pointer-events-none absolute top-0.5 left-1 font-mono text-[10px] sm:text-[11px] font-semibold leading-none opacity-85"
                    >
                      {rank}
                    </span>
                  )}

                  {/* File coordinate on bottom row */}
                  {rowIdx === 7 && (
                    <span
                      aria-hidden="true"
                      style={{ color: coordColor }}
                      className="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[10px] sm:text-[11px] font-semibold leading-none opacity-85"
                    >
                      {file}
                    </span>
                  )}

                  {/* Piece SVG */}
                  {piece && (
                    <div
                      key={motion ? motion.key : `static-${sq}`}
                      style={
                        motion && !motion.isSettle
                          ? ({
                              '--slide-x': `${motion.xPct}%`,
                              '--slide-y': `${motion.yPct}%`,
                            } as React.CSSProperties)
                          : undefined
                      }
                      className={`relative z-10 flex h-full w-full items-center justify-center ${
                        motion
                          ? motion.isSettle
                            ? 'animate-chess-settle'
                            : 'animate-chess-slide'
                          : ''
                      }`}
                    >
                      <div
                        className={`h-[84%] w-[84%] transition-transform duration-150 ease-out ${
                          isDragOrigin
                            ? 'opacity-20 scale-95'
                            : isSelected
                            ? 'scale-[1.07] -translate-y-0.5 drop-shadow-sm'
                            : 'opacity-100 scale-100'
                        }`}
                      >
                        <ChessPieceSvg type={piece.type} color={piece.color} pieceSet={pieceSet} />
                      </div>
                    </div>
                  )}

                  {/* Legal move / premove dot */}
                  {((isLegalTarget && !isCaptureTarget) || isPremoveTarget) && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute z-20 h-[28%] w-[28%] rounded-full animate-chess-dot ${
                        isPremoveTarget ? 'bg-sky-500/40' : 'bg-stone-900/22'
                      }`}
                    />
                  )}

                  {/* Legal capture ring */}
                  {isLegalTarget && isCaptureTarget && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[6%] z-20 rounded-full border-[5px] border-stone-900/25 animate-chess-dot"
                    />
                  )}

                  {/* Analysis move classification marker */}
                  {moveMarker && moveMarker.square === sq && (() => {
                    const meta = MOVE_MARKER_META[moveMarker.classification];
                    return (
                      <span
                        title={meta.title}
                        aria-label={meta.title}
                        className={`pointer-events-none absolute top-0.5 right-0.5 z-30 flex h-[18px] min-w-[18px] sm:h-[21px] sm:min-w-[21px] items-center justify-center rounded-full px-0.5 font-mono text-[9px] sm:text-[10px] font-extrabold leading-none shadow-md ring-1.5 ${meta.className}`}
                      >
                        {meta.symbol}
                      </span>
                    );
                  })()}
                </button>
              );
            })
          )}
        </div>

        {/* SVG Arrows Overlay (User Annotations + Hint + Stockfish Best Move) */}
        {hasSvgArrows && (
          <svg
            viewBox="0 0 800 800"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-25 h-full w-full"
          >
            {arrows.map((arrow) =>
              renderSvgArrow(
                arrow.from,
                arrow.to,
                ANNOTATION_COLORS[arrow.color].arrow,
                ANNOTATION_COLORS[arrow.color].arrow,
                `user-${arrow.from}-${arrow.to}-${arrow.color}`
              )
            )}
            {hintArrow &&
              renderSvgArrow(
                hintArrow.from,
                hintArrow.to,
                'rgba(245, 158, 11, 0.88)',
                'rgba(245, 158, 11, 0.96)',
                `hint-${hintArrow.from}-${hintArrow.to}`
              )}
            {bestMoveArrow &&
              renderSvgArrow(
                bestMoveArrow.from,
                bestMoveArrow.to,
                'rgba(16, 185, 129, 0.85)',
                'rgba(16, 185, 129, 0.92)',
                `best-${bestMoveArrow.from}-${bestMoveArrow.to}`
              )}
          </svg>
        )}

        {/* History Review Notice */}
        {isReviewingHistory && (
          <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center px-3 pointer-events-none">
            <button
              type="button"
              onClick={onJumpToLive}
              className="pointer-events-auto rounded-lg border border-stone-700 bg-stone-900/95 px-3.5 py-1.5 text-xs font-medium text-stone-100 shadow-lg hover:bg-stone-800 transition-colors animate-chess-modal"
            >
              Viewing Move History · Jump to Live Board
            </button>
          </div>
        )}

        {/* Pawn Promotion Picker Modal */}
        {pendingPromotion && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose pawn promotion piece"
            className="absolute inset-0 z-40 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-[1px]"
            onClick={onCancelPromotion}
          >
            <div
              className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 shadow-xl animate-chess-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 text-center text-xs font-semibold text-stone-700 dark:text-stone-200">
                Promote Pawn
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['q', 'r', 'b', 'n'] as PromotionPiece[]).map((promoPiece) => {
                  const labels: Record<PromotionPiece, string> = {
                    q: 'Queen',
                    r: 'Rook',
                    b: 'Bishop',
                    n: 'Knight',
                  };
                  return (
                    <button
                      key={promoPiece}
                      type="button"
                      onClick={() => onSelectPromotion(promoPiece)}
                      className="flex flex-col items-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 p-2.5 hover:border-emerald-600 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 active:scale-95 transition-all min-w-[60px]"
                    >
                      <ChessPieceSvg
                        type={promoPiece}
                        color={pendingPromotion.color}
                        pieceSet={pieceSet}
                        className="w-10 h-10"
                      />
                      <span className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                        {labels[promoPiece]}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onCancelPromotion}
                className="mt-3 w-full rounded-lg py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 dark:text-stone-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating dragged piece */}
      {dragState?.isDragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 z-50 drop-shadow-md"
          style={{
            width: dragState.squareSize,
            height: dragState.squareSize,
            transform: `translate3d(${dragState.currentX - dragState.squareSize / 2}px, ${
              dragState.currentY - dragState.squareSize / 2
            }px, 0) scale(1.12)`,
          }}
        >
          <ChessPieceSvg type={dragState.type} color={dragState.color} pieceSet={pieceSet} />
        </div>
      )}
    </div>
  );
};
