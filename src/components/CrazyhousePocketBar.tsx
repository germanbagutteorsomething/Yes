import React from 'react';
import type {
  CrazyhousePocket,
  DroppablePiece,
  PieceSet,
  PlayerColor,
} from '../types/chess';
import { DROPPABLE_PIECES } from '../utils/crazyhouse';
import { ChessPieceSvg } from './ChessPieceSvg';

interface CrazyhousePocketBarProps {
  color: PlayerColor;
  pocket: CrazyhousePocket;
  pieceSet: PieceSet;
  canInteract: boolean;
  isTurn: boolean;
  selectedDropPiece: DroppablePiece | null;
  hintDropPiece?: DroppablePiece | null;
  onSelectDropPiece: (piece: DroppablePiece | null) => void;
}

const PIECE_NAMES: Record<DroppablePiece, string> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
  p: 'Pawn',
};

export const CrazyhousePocketBar: React.FC<CrazyhousePocketBarProps> = ({
  color,
  pocket,
  pieceSet,
  canInteract,
  isTurn,
  selectedDropPiece,
  hintDropPiece = null,
  onSelectDropPiece,
}) => {
  const canPick = canInteract && isTurn;
  const totalInPocket = DROPPABLE_PIECES.reduce((sum, p) => sum + (pocket[p] ?? 0), 0);

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
        isTurn
          ? 'border-emerald-700/35 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20'
          : 'border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/75'
      }`}
    >
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-300">
          {color === 'w' ? 'White' : 'Black'} Reserve
        </span>
        {totalInPocket === 0 && (
          <span className="text-[11px] text-stone-400 dark:text-stone-500">
            · Empty
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto">
        {DROPPABLE_PIECES.map((piece) => {
          const count = pocket[piece] ?? 0;
          const isSelected = canPick && selectedDropPiece === piece;
          const isHinted = canPick && hintDropPiece === piece;
          const clickable = canPick && count > 0;

          return (
            <button
              key={piece}
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (!clickable) return;
                onSelectDropPiece(isSelected ? null : piece);
              }}
              title={
                count > 0
                  ? clickable
                    ? `Drop ${PIECE_NAMES[piece]} (${count} in reserve)`
                    : `${PIECE_NAMES[piece]} (${count} in reserve)`
                  : `No ${PIECE_NAMES[piece]} in reserve`
              }
              aria-pressed={isSelected}
              className={`relative inline-flex h-10 min-w-[42px] items-center justify-center gap-0.5 rounded-md border px-1.5 transition-all ${
                count === 0
                  ? 'border-stone-200/70 dark:border-stone-800/70 bg-stone-50/40 dark:bg-stone-900/40 opacity-30 cursor-default'
                  : isSelected
                    ? 'border-emerald-700 dark:border-emerald-400 bg-emerald-100/90 dark:bg-emerald-900/60 ring-2 ring-emerald-600/35 shadow-xs scale-[1.03]'
                    : isHinted
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 ring-2 ring-amber-400/50'
                      : clickable
                        ? 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 hover:border-emerald-600 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 cursor-pointer active:scale-95'
                        : 'border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/70 cursor-default'
              }`}
            >
              <ChessPieceSvg
                type={piece}
                color={color}
                pieceSet={pieceSet}
                className="w-7 h-7 shrink-0"
              />
              {count > 0 && (
                <span className="font-mono text-[11px] font-bold text-stone-800 dark:text-stone-100 tabular-nums">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
