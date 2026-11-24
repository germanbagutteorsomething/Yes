import React from 'react';
import type { PositionEval } from '../types/chess';

interface EvalBarProps {
  evaluation: PositionEval;
  flipped: boolean;
}

function computeWhiteShare(ev: PositionEval): number {
  if (ev.mate !== null) {
    return ev.mate >= 0 ? 100 : 0;
  }
  // Smooth sigmoid mapping centipawns [-1000, +1000] to [4%, 96%]
  const clamped = Math.max(-1200, Math.min(1200, ev.cp));
  const winProb = 1 / (1 + Math.pow(10, -clamped / 400));
  return Math.max(4, Math.min(96, winProb * 100));
}

export function formatEvalLabel(ev: PositionEval): string {
  if (ev.mate !== null) {
    if (ev.mate === 0) return 'Mate';
    return `${ev.mate > 0 ? '+' : '-'}M${Math.abs(ev.mate)}`;
  }
  const pawns = ev.cp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export const EvalBar: React.FC<EvalBarProps> = ({ evaluation, flipped }) => {
  const whitePct = computeWhiteShare(evaluation);
  const label = formatEvalLabel(evaluation);
  const whiteAhead =
    evaluation.mate !== null ? evaluation.mate >= 0 : evaluation.cp >= 0;

  return (
    <div
      className="relative flex w-6 sm:w-7 shrink-0 flex-col overflow-hidden rounded-md border border-stone-300 dark:border-stone-700 bg-stone-800 select-none"
      aria-label={`Stockfish evaluation: ${label}`}
      title={`Evaluation: ${label}`}
    >
      {/* When not flipped: Black at top, White at bottom. When flipped: White at top, Black at bottom. */}
      {flipped ? (
        <>
          <div
            className="w-full bg-stone-100 transition-[height] duration-300 ease-out"
            style={{ height: `${whitePct}%` }}
          />
          <div className="w-full flex-1 bg-stone-800" />
        </>
      ) : (
        <>
          <div
            className="w-full bg-stone-800 transition-[height] duration-300 ease-out"
            style={{ height: `${100 - whitePct}%` }}
          />
          <div className="w-full flex-1 bg-stone-100" />
        </>
      )}

      {/* Score label pinned at the winning side's end */}
      <span
        className={`pointer-events-none absolute inset-x-0 text-center font-mono text-[9px] sm:text-[10px] font-bold leading-none tabular-nums ${
          whiteAhead
            ? flipped
              ? 'top-1.5 text-stone-900'
              : 'bottom-1.5 text-stone-900'
            : flipped
            ? 'bottom-1.5 text-stone-100'
            : 'top-1.5 text-stone-100'
        }`}
      >
        {label}
      </span>
    </div>
  );
};
