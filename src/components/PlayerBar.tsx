import React from 'react';
import { Clock } from 'lucide-react';
import type { PieceSymbol } from 'chess.js';
import type { PieceSet, PlayerColor } from '../types/chess';
import { ChessPieceSvg } from './ChessPieceSvg';

interface PlayerBarProps {
  color: PlayerColor;
  label: string;
  subtitle?: string;
  capturedPieces: PieceSymbol[];
  materialLead: number; // positive if this player is ahead
  isTurn: boolean;
  isThinking?: boolean;
  isCheck?: boolean;
  isGameOver?: boolean;
  timeRemainingMs?: number | null;
  pieceSet?: PieceSet;
}

function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    const tenths = Math.floor(clamped / 100);
    const secs = Math.floor(tenths / 10);
    const dec = tenths % 10;
    return `0:${String(secs).padStart(2, '0')}.${dec}`;
  }
  const totalSecs = Math.ceil(clamped / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  color,
  label,
  subtitle,
  capturedPieces,
  materialLead,
  isTurn,
  isThinking = false,
  isCheck = false,
  isGameOver = false,
  timeRemainingMs = null,
  pieceSet = 'classic',
}) => {
  const capturedPieceColor: PlayerColor = color === 'w' ? 'b' : 'w';

  let statusText = '';
  if (!isGameOver && isTurn) {
    if (isThinking) {
      statusText = 'Thinking…';
    } else if (isCheck) {
      statusText = 'In Check';
    } else {
      statusText = 'Turn';
    }
  } else if (isCheck && !isGameOver) {
    statusText = 'In Check';
  }

  const hasTimer = timeRemainingMs !== null && timeRemainingMs !== undefined;
  const isLowTime = hasTimer && timeRemainingMs <= 15_000 && !isGameOver;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2 transition-colors ${
        isTurn && !isGameOver
          ? 'border-emerald-700/40 dark:border-emerald-500/40 bg-white dark:bg-stone-900 shadow-xs'
          : 'border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/60'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
            color === 'w'
              ? 'border-stone-300 bg-stone-100'
              : 'border-stone-700 bg-stone-800'
          }`}
        >
          <ChessPieceSvg type="k" color={color} pieceSet={pieceSet} className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
              {label}
            </span>
            {subtitle && (
              <span className="text-xs text-stone-500 dark:text-stone-400 truncate hidden sm:inline">
                · {subtitle}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 min-h-[18px]">
            {capturedPieces.length > 0 ? (
              <div className="flex items-center flex-wrap -space-x-1">
                {capturedPieces.map((piece, idx) => (
                  <ChessPieceSvg
                    key={`${piece}-${idx}`}
                    type={piece}
                    color={capturedPieceColor}
                    pieceSet={pieceSet}
                    className="w-4 h-4 shrink-0"
                  />
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-stone-400 dark:text-stone-500">
                {color === 'w' ? 'White' : 'Black'}
              </span>
            )}
            {materialLead > 0 && (
              <span className="ml-1.5 font-mono text-[11px] font-medium text-stone-600 dark:text-stone-300 tabular-nums">
                +{materialLead}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {statusText && (
          <span
            className={`text-xs font-medium whitespace-nowrap shrink-0 px-2.5 py-1 rounded-md ${
              isCheck
                ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60'
                : isThinking
                ? 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
            }`}
          >
            {statusText}
          </span>
        )}

        {hasTimer && (
          <div
            aria-label={`${color === 'w' ? 'White' : 'Black'} clock: ${formatClock(
              timeRemainingMs
            )}`}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-sm font-semibold tabular-nums transition-colors ${
              isLowTime && isTurn
                ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/70 text-red-700 dark:text-red-300'
                : isTurn && !isGameOver
                ? 'border-stone-800 dark:border-stone-200 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                : 'border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5 opacity-75 shrink-0" aria-hidden="true" />
            <span>{formatClock(timeRemainingMs)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
