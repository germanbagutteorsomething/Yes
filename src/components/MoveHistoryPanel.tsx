import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import type {
  MatchAnalysisResult,
  MoveClassification,
  MoveRecord,
} from '../types/chess';

interface MoveHistoryPanelProps {
  moves: MoveRecord[];
  viewIndex: number | null; // null = live board
  onSelectPly: (plyIndex: number | null) => void;
  pgn: string;
  fen: string;
  analysis?: MatchAnalysisResult | null;
  canEnterSan?: boolean;
  onSubmitSanMove?: (san: string) => boolean;
}

const BADGE_SYMBOL: Partial<Record<MoveClassification, { text: string; cls: string }>> = {
  book: { text: 'B', cls: 'text-amber-700 dark:text-amber-400' },
  brilliant: { text: '!!', cls: 'text-cyan-600 dark:text-cyan-400' },
  great: { text: '!', cls: 'text-sky-600 dark:text-sky-400' },
  inaccuracy: { text: '?!', cls: 'text-amber-600 dark:text-amber-400' },
  mistake: { text: '?', cls: 'text-orange-600 dark:text-orange-400' },
  blunder: { text: '??', cls: 'text-red-600 dark:text-red-400' },
};

export const MoveHistoryPanel: React.FC<MoveHistoryPanelProps> = ({
  moves,
  viewIndex,
  onSelectPly,
  pgn,
  fen,
  analysis,
  canEnterSan = false,
  onSubmitSanMove,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedField, setCopiedField] = useState<'pgn' | 'fen' | null>(null);
  const [sanInput, setSanInput] = useState<string>('');
  const [sanError, setSanError] = useState<boolean>(false);

  const activePly = viewIndex === null ? moves.length - 1 : viewIndex;

  useEffect(() => {
    if (viewIndex === null && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length, viewIndex]);

  const movePairs: {
    moveNumber: number;
    white?: MoveRecord;
    black?: MoveRecord;
    wIdx: number;
    bIdx: number;
  }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
      wIdx: i,
      bIdx: i + 1,
    });
  }

  const handleCopy = async (kind: 'pgn' | 'fen') => {
    const value = kind === 'pgn' ? pgn : fen;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(kind);
      window.setTimeout(() => setCopiedField(null), 1600);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const canGoBack = moves.length > 0 && activePly >= 0;
  const canGoForward = viewIndex !== null && viewIndex < moves.length - 1;
  const isAtLive = viewIndex === null;

  const renderMoveBadge = (idx: number, isActive: boolean) => {
    const item = analysis?.moves[idx];
    if (!item) return null;
    const badge = BADGE_SYMBOL[item.classification];
    if (!badge) return null;
    return (
      <span
        className={`ml-1 font-bold ${
          isActive ? 'text-white/90' : badge.cls
        }`}
      >
        {badge.text}
      </span>
    );
  };

  return (
    <div className="flex flex-col rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-stone-200 dark:border-stone-800 px-3.5 py-2.5">
        <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">
          Move List
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleCopy('pgn')}
            disabled={moves.length === 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
            title="Copy game PGN"
          >
            {copiedField === 'pgn' ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>PGN</span>
          </button>
          <button
            type="button"
            onClick={() => handleCopy('fen')}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
            title="Copy current FEN"
          >
            {copiedField === 'fen' ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>FEN</span>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="h-56 lg:h-64 overflow-y-auto px-2 py-1.5 text-sm font-mono tabular-nums"
      >
        {movePairs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs font-sans text-stone-400 dark:text-stone-500">
            White to move · Make the opening move
          </div>
        ) : (
          <div className="space-y-0.5">
            {movePairs.map((pair) => (
              <div
                key={pair.moveNumber}
                className="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1 rounded px-1 py-0.5 text-[13px]"
              >
                <span className="text-stone-400 dark:text-stone-500 text-xs select-none">
                  {pair.moveNumber}.
                </span>
                {pair.white && (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPly(pair.wIdx === moves.length - 1 ? null : pair.wIdx)
                    }
                    className={`rounded px-2 py-0.5 text-left transition-colors ${
                      activePly === pair.wIdx
                        ? 'bg-emerald-700 text-white font-medium'
                        : 'text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span>{pair.white.san}</span>
                    {renderMoveBadge(pair.wIdx, activePly === pair.wIdx)}
                  </button>
                )}
                {pair.black ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPly(pair.bIdx === moves.length - 1 ? null : pair.bIdx)
                    }
                    className={`rounded px-2 py-0.5 text-left transition-colors ${
                      activePly === pair.bIdx
                        ? 'bg-emerald-700 text-white font-medium'
                        : 'text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span>{pair.black.san}</span>
                    {renderMoveBadge(pair.bIdx, activePly === pair.bIdx)}
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/80 px-2 py-1.5">
        <button
          type="button"
          onClick={() => onSelectPly(-1)}
          disabled={!canGoBack}
          aria-label="Jump to start position"
          className="rounded-md p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
        >
          <ChevronFirst className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (viewIndex === null) {
              onSelectPly(moves.length - 2 >= -1 ? moves.length - 2 : -1);
            } else {
              onSelectPly(Math.max(-1, viewIndex - 1));
            }
          }}
          disabled={!canGoBack}
          aria-label="Previous move"
          className="rounded-md p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (viewIndex === null) return;
            if (viewIndex + 1 >= moves.length - 1) {
              onSelectPly(null);
            } else {
              onSelectPly(viewIndex + 1);
            }
          }}
          disabled={!canGoForward && isAtLive}
          aria-label="Next move"
          className="rounded-md p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onSelectPly(null)}
          disabled={isAtLive}
          aria-label="Jump to live position"
          className="rounded-md p-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
        >
          <ChevronLast className="w-4 h-4" />
        </button>
      </div>

      {onSubmitSanMove && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = sanInput.trim();
            if (!trimmed || !canEnterSan) return;
            const ok = onSubmitSanMove(trimmed);
            if (ok) {
              setSanInput('');
              setSanError(false);
            } else {
              setSanError(true);
            }
          }}
          className="flex items-center gap-1.5 border-t border-stone-200 dark:border-stone-800 px-2.5 py-2 bg-white dark:bg-stone-900"
        >
          <input
            type="text"
            value={sanInput}
            onChange={(e) => {
              setSanInput(e.target.value);
              if (sanError) setSanError(false);
            }}
            disabled={!canEnterSan}
            placeholder={canEnterSan ? 'Type move (e.g. Nf3, e4, O-O)…' : 'Waiting for turn…'}
            aria-label="Enter move in algebraic notation"
            className={`flex-1 min-w-0 rounded-md border px-2.5 py-1 font-mono text-xs bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 ${
              sanError
                ? 'border-red-400 focus:ring-red-500'
                : 'border-stone-200 dark:border-stone-700 focus:ring-emerald-600'
            } disabled:opacity-50`}
          />
          <button
            type="submit"
            disabled={!canEnterSan || !sanInput.trim()}
            className="rounded-md bg-stone-800 dark:bg-stone-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-stone-700 dark:hover:bg-stone-600 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            Play
          </button>
        </form>
      )}
    </div>
  );
};
