import React from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  MatchAnalysisResult,
  MoveAnalysis,
  MoveClassification,
} from '../types/chess';
import { formatEvalLabel } from './EvalBar';

interface MatchAnalysisPanelProps {
  hasMoves: boolean;
  isAnalyzing: boolean;
  progress: { completed: number; total: number };
  analysis: MatchAnalysisResult | null;
  error: string | null;
  inspectedPlyIndex: number | null; // 0-indexed into moves, or null for latest
  totalMoves: number;
  onStartAnalysis: () => void;
  onCancelAnalysis: () => void;
  onSelectPly: (plyIndex: number | null) => void;
}

const CLASSIFICATION_STYLES: Record<
  MoveClassification,
  {
    label: string;
    symbol: string;
    colorClass: string;
    badgeBgClass: string;
  }
> = {
  book: {
    label: 'Book',
    symbol: 'B',
    colorClass: 'text-amber-700 dark:text-amber-400',
    badgeBgClass: 'bg-amber-700 text-white',
  },
  brilliant: {
    label: 'Brilliant',
    symbol: '!!',
    colorClass: 'text-cyan-600 dark:text-cyan-400',
    badgeBgClass: 'bg-cyan-500 text-white',
  },
  great: {
    label: 'Great',
    symbol: '!',
    colorClass: 'text-sky-600 dark:text-sky-400',
    badgeBgClass: 'bg-sky-500 text-white',
  },
  best: {
    label: 'Best',
    symbol: '★',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    badgeBgClass: 'bg-emerald-600 text-white',
  },
  excellent: {
    label: 'Excellent',
    symbol: '✓',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    badgeBgClass: 'bg-emerald-500 text-white',
  },
  good: {
    label: 'Good',
    symbol: '✓',
    colorClass: 'text-stone-600 dark:text-stone-300',
    badgeBgClass: 'bg-stone-500 text-white',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    symbol: '?!',
    colorClass: 'text-amber-600 dark:text-amber-400',
    badgeBgClass: 'bg-amber-400 text-stone-950',
  },
  mistake: {
    label: 'Mistake',
    symbol: '?',
    colorClass: 'text-orange-600 dark:text-orange-400',
    badgeBgClass: 'bg-orange-500 text-white',
  },
  blunder: {
    label: 'Blunder',
    symbol: '??',
    colorClass: 'text-red-600 dark:text-red-400',
    badgeBgClass: 'bg-red-600 text-white',
  },
};

const BREAKDOWN_ROWS: {
  key: 'book' | 'brilliant' | 'great' | 'best' | 'inaccuracy' | 'mistake' | 'blunder';
  label: string;
  symbol: string;
  dotColor: string;
  textColor: string;
}[] = [
  {
    key: 'brilliant',
    label: 'Brilliant',
    symbol: '!!',
    dotColor: 'bg-cyan-500 text-white',
    textColor: 'text-cyan-700 dark:text-cyan-400',
  },
  {
    key: 'great',
    label: 'Great',
    symbol: '!',
    dotColor: 'bg-sky-500 text-white',
    textColor: 'text-sky-700 dark:text-sky-400',
  },
  {
    key: 'best',
    label: 'Best',
    symbol: '★',
    dotColor: 'bg-emerald-600 text-white',
    textColor: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    key: 'book',
    label: 'Book',
    symbol: 'B',
    dotColor: 'bg-amber-700 text-white',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
  {
    key: 'inaccuracy',
    label: 'Inaccuracy',
    symbol: '?!',
    dotColor: 'bg-amber-400 text-stone-950',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
  {
    key: 'mistake',
    label: 'Mistake',
    symbol: '?',
    dotColor: 'bg-orange-500 text-white',
    textColor: 'text-orange-700 dark:text-orange-400',
  },
  {
    key: 'blunder',
    label: 'Blunder',
    symbol: '??',
    dotColor: 'bg-red-600 text-white',
    textColor: 'text-red-700 dark:text-red-400',
  },
];

const KEY_MOMENT_TYPES = new Set<MoveClassification>([
  'brilliant',
  'great',
  'inaccuracy',
  'mistake',
  'blunder',
]);

function evalToGraphY(cp: number, mate: number | null, height: number): number {
  let norm = 0;
  if (mate !== null) {
    norm = mate >= 0 ? 1 : -1;
  } else {
    const clamped = Math.max(-700, Math.min(700, cp));
    norm = Math.tanh(clamped / 320);
  }
  const mid = height / 2;
  return mid - norm * (mid - 4);
}

export const MatchAnalysisPanel: React.FC<MatchAnalysisPanelProps> = ({
  hasMoves,
  isAnalyzing,
  progress,
  analysis,
  error,
  inspectedPlyIndex,
  totalMoves,
  onStartAnalysis,
  onCancelAnalysis,
  onSelectPly,
}) => {
  const activeMoveIdx =
    inspectedPlyIndex === null ? totalMoves - 1 : inspectedPlyIndex;
  const inspectedMove: MoveAnalysis | undefined =
    analysis && activeMoveIdx >= 0 ? analysis.moves[activeMoveIdx] : undefined;

  const pct =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  const handleJumpNextKeyMove = () => {
    if (!analysis || analysis.moves.length === 0) return;
    const startSearch = activeMoveIdx + 1;
    let foundIdx = analysis.moves.findIndex(
      (m, idx) => idx >= startSearch && KEY_MOMENT_TYPES.has(m.classification)
    );
    if (foundIdx === -1) {
      foundIdx = analysis.moves.findIndex((m) =>
        KEY_MOMENT_TYPES.has(m.classification)
      );
    }
    if (foundIdx !== -1) {
      onSelectPly(foundIdx === totalMoves - 1 ? null : foundIdx);
    }
  };

  const hasKeyMoments = Boolean(
    analysis?.moves.some((m) => KEY_MOMENT_TYPES.has(m.classification))
  );

  return (
    <section
      id="match-analysis-panel"
      className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3
            className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
            aria-hidden="true"
          />
          <h2 className="text-xs font-semibold text-stone-800 dark:text-stone-200">
            Stockfish Match Analysis
          </h2>
        </div>

        {isAnalyzing ? (
          <button
            type="button"
            onClick={onCancelAnalysis}
            className="inline-flex items-center gap-1 rounded-md border border-stone-300 dark:border-stone-700 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Cancel</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartAnalysis}
            disabled={!hasMoves}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            <span>{analysis ? 'Re-analyze' : 'Analyze All Moves'}</span>
          </button>
        )}
      </div>

      {isAnalyzing && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-stone-600 dark:text-stone-400">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-emerald-700 dark:text-emerald-400" />
              <span>Evaluating all moves…</span>
            </span>
            <span className="font-mono tabular-nums">
              {progress.completed}/{progress.total} ({pct}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
            <div
              className="h-full bg-emerald-700 dark:bg-emerald-500 transition-[width] duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {!isAnalyzing && !analysis && !error && (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {hasMoves
            ? 'Run Stockfish across every move to calculate accuracy, spot Brilliant (!!) sacrifices, and find mistakes or best lines.'
            : 'Play a few moves to unlock Stockfish post-match or mid-game analysis.'}
        </p>
      )}

      {analysis && !isAnalyzing && (
        <div className="space-y-3">
          {/* Accuracy Scores */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-3 py-2">
              <div className="text-[11px] text-stone-500 dark:text-stone-400">
                White Accuracy
              </div>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="font-mono text-base font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                  {analysis.white.accuracy.toFixed(1)}%
                </span>
                <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400">
                  {analysis.white.acpl} acpl
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-3 py-2">
              <div className="text-[11px] text-stone-500 dark:text-stone-400">
                Black Accuracy
              </div>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="font-mono text-base font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                  {analysis.black.accuracy.toFixed(1)}%
                </span>
                <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400">
                  {analysis.black.acpl} acpl
                </span>
              </div>
            </div>
          </div>

          {/* Interactive SVG Evaluation Graph */}
          {analysis.moves.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400">
                <span>Advantage Timeline (click move to inspect)</span>
                <span className="font-mono">+White / -Black</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-900">
                <svg
                  viewBox={`0 0 ${Math.max(analysis.moves.length * 14, 140)} 64`}
                  preserveAspectRatio="none"
                  className="h-16 w-full block cursor-pointer"
                  role="img"
                  aria-label="Stockfish evaluation advantage graph"
                >
                  <line
                    x1="0"
                    y1="32"
                    x2={Math.max(analysis.moves.length * 14, 140)}
                    y2="32"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth="1"
                  />

                  {(() => {
                    const width = Math.max(analysis.moves.length * 14, 140);
                    const step = width / analysis.moves.length;
                    const pts = analysis.moves.map((m, idx) => {
                      const x = (idx + 0.5) * step;
                      const y = evalToGraphY(m.evalAfter.cp, m.evalAfter.mate, 64);
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    });
                    const polyPts = `0,32 ${pts.join(' ')} ${width},32`;
                    return (
                      <>
                        <polygon points={polyPts} fill="rgba(245,245,244,0.85)" />
                        <polyline
                          points={pts.join(' ')}
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="1.5"
                        />
                        {analysis.moves.map((m, idx) => {
                          const x = (idx + 0.5) * step;
                          const y = evalToGraphY(m.evalAfter.cp, m.evalAfter.mate, 64);
                          const isSelected = activeMoveIdx === idx;
                          const dotColor =
                            m.classification === 'brilliant'
                              ? '#06B6D4'
                              : m.classification === 'great'
                              ? '#0EA5E9'
                              : m.classification === 'blunder'
                              ? '#EF4444'
                              : m.classification === 'mistake'
                              ? '#F97316'
                              : m.classification === 'inaccuracy'
                              ? '#F59E0B'
                              : 'transparent';

                          return (
                            <g
                              key={m.ply}
                              onClick={() =>
                                onSelectPly(idx === totalMoves - 1 ? null : idx)
                              }
                            >
                              <rect
                                x={idx * step}
                                y={0}
                                width={step}
                                height={64}
                                fill="transparent"
                              />
                              {isSelected && (
                                <line
                                  x1={x}
                                  y1={0}
                                  x2={x}
                                  y2={64}
                                  stroke="#10B981"
                                  strokeWidth="1.5"
                                />
                              )}
                              {(dotColor !== 'transparent' || isSelected) && (
                                <circle
                                  cx={x}
                                  cy={y}
                                  r={isSelected ? 3.4 : 2.5}
                                  fill={isSelected ? '#10B981' : dotColor}
                                />
                              )}
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}

          {/* Move Quality Breakdown (White vs Black) */}
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 overflow-hidden text-[11px]">
            <div className="grid grid-cols-[1fr_2.75rem_2.75rem] items-center bg-stone-50 dark:bg-stone-800/60 px-2.5 py-1.5 text-[10px] font-semibold text-stone-500 dark:text-stone-400">
              <span>Move Rating</span>
              <span className="text-center">White</span>
              <span className="text-center">Black</span>
            </div>
            <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
              {BREAKDOWN_ROWS.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[1fr_2.75rem_2.75rem] items-center px-2.5 py-1"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] font-extrabold leading-none ${row.dotColor}`}
                    >
                      {row.symbol}
                    </span>
                    <span className={`font-medium ${row.textColor}`}>
                      {row.label}
                    </span>
                  </div>
                  <span className="text-center font-mono font-semibold text-stone-800 dark:text-stone-200 tabular-nums">
                    {analysis.white[row.key]}
                  </span>
                  <span className="text-center font-mono font-semibold text-stone-800 dark:text-stone-200 tabular-nums">
                    {analysis.black[row.key]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Inspected Move Detail + Step Controls */}
          {inspectedMove && (
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-3 py-2.5 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 font-mono text-[10px] font-extrabold leading-none ${
                      CLASSIFICATION_STYLES[inspectedMove.classification].badgeBgClass
                    }`}
                  >
                    {CLASSIFICATION_STYLES[inspectedMove.classification].symbol}
                  </span>
                  <span className="font-mono font-semibold text-stone-900 dark:text-stone-100 truncate">
                    {Math.ceil(inspectedMove.ply / 2)}
                    {inspectedMove.color === 'w' ? '.' : '...'} {inspectedMove.san}
                  </span>
                  <span
                    className={`font-semibold shrink-0 ${
                      CLASSIFICATION_STYLES[inspectedMove.classification].colorClass
                    }`}
                  >
                    {CLASSIFICATION_STYLES[inspectedMove.classification].label}
                  </span>
                </div>
                <span className="font-mono text-[11px] font-medium text-stone-600 dark:text-stone-300 tabular-nums shrink-0">
                  {formatEvalLabel(inspectedMove.evalBefore)} →{' '}
                  {formatEvalLabel(inspectedMove.evalAfter)}
                </span>
              </div>

              {inspectedMove.bestLan &&
                inspectedMove.playedLan !== inspectedMove.bestLan && (
                  <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                    <span>
                      Best move:{' '}
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {inspectedMove.bestSan || inspectedMove.bestLan}
                      </span>
                    </span>
                    {inspectedMove.cpLoss > 0 && (
                      <span className="font-mono text-[10px] tabular-nums">
                        −{(inspectedMove.cpLoss / 100).toFixed(2)} eval
                      </span>
                    )}
                  </div>
                )}

              <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-stone-200/80 dark:border-stone-700/70">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPly(activeMoveIdx <= 0 ? -1 : activeMoveIdx - 1)
                    }
                    disabled={activeMoveIdx < 0}
                    className="inline-flex items-center gap-0.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeMoveIdx + 1 >= totalMoves - 1) {
                        onSelectPly(null);
                      } else {
                        onSelectPly(activeMoveIdx + 1);
                      }
                    }}
                    disabled={activeMoveIdx >= totalMoves - 1}
                    className="inline-flex items-center gap-0.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {hasKeyMoments && (
                  <button
                    type="button"
                    onClick={handleJumpNextKeyMove}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-700/30 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/40 px-2 py-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/70 transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Key Move</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
