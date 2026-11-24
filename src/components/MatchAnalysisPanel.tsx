import React from 'react';
import { BarChart3, Loader2, X } from 'lucide-react';
import type { MatchAnalysisResult, MoveAnalysis, MoveClassification } from '../types/chess';
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
  { label: string; symbol: string; colorClass: string }
> = {
  best: {
    label: 'Best',
    symbol: '★',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
  },
  excellent: {
    label: 'Excellent',
    symbol: '!',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
  },
  good: {
    label: 'Good',
    symbol: '✓',
    colorClass: 'text-stone-600 dark:text-stone-300',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    symbol: '?!',
    colorClass: 'text-amber-600 dark:text-amber-400',
  },
  mistake: {
    label: 'Mistake',
    symbol: '?',
    colorClass: 'text-orange-600 dark:text-orange-400',
  },
  blunder: {
    label: 'Blunder',
    symbol: '??',
    colorClass: 'text-red-600 dark:text-red-400',
  },
};

function evalToGraphY(cp: number, mate: number | null, height: number): number {
  let norm = 0;
  if (mate !== null) {
    norm = mate >= 0 ? 1 : -1;
  } else {
    // Clamp +/- 700cp nicely to chart bounds
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

  return (
    <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
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
            <span>{analysis ? 'Re-analyze' : 'Analyze Match'}</span>
          </button>
        )}
      </div>

      {isAnalyzing && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-stone-600 dark:text-stone-400">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-emerald-700 dark:text-emerald-400" />
              <span>Evaluating positions…</span>
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
            ? 'Run Stockfish over every move to calculate accuracy, find blunders, and inspect best lines.'
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
                  {/* Midline */}
                  <line
                    x1="0"
                    y1="32"
                    x2={Math.max(analysis.moves.length * 14, 140)}
                    y2="32"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth="1"
                  />

                  {/* Filled white advantage area */}
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
                            m.classification === 'blunder'
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
                                  r={isSelected ? 3.2 : 2.3}
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

          {/* Quality Breakdown */}
          <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
            <div className="rounded-md border border-stone-200 dark:border-stone-800 py-1.5 px-1">
              <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {analysis.white.best + analysis.black.best}
              </div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400">Best</div>
            </div>
            <div className="rounded-md border border-stone-200 dark:border-stone-800 py-1.5 px-1">
              <div className="font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                {analysis.white.inaccuracy + analysis.black.inaccuracy}
              </div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400">Inacc.</div>
            </div>
            <div className="rounded-md border border-stone-200 dark:border-stone-800 py-1.5 px-1">
              <div className="font-mono font-semibold text-orange-600 dark:text-orange-400 tabular-nums">
                {analysis.white.mistake + analysis.black.mistake}
              </div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400">Mistake</div>
            </div>
            <div className="rounded-md border border-stone-200 dark:border-stone-800 py-1.5 px-1">
              <div className="font-mono font-semibold text-red-600 dark:text-red-400 tabular-nums">
                {analysis.white.blunder + analysis.black.blunder}
              </div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400">Blunder</div>
            </div>
          </div>

          {/* Inspected Move Detail */}
          {inspectedMove && (
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                    {Math.ceil(inspectedMove.ply / 2)}
                    {inspectedMove.color === 'w' ? '.' : '...'} {inspectedMove.san}
                  </span>
                  <span
                    className={`font-semibold ${
                      CLASSIFICATION_STYLES[inspectedMove.classification].colorClass
                    }`}
                  >
                    · {CLASSIFICATION_STYLES[inspectedMove.classification].label}
                  </span>
                </div>
                <span className="font-mono text-[11px] font-medium text-stone-600 dark:text-stone-300 tabular-nums">
                  {formatEvalLabel(inspectedMove.evalAfter)}
                </span>
              </div>
              {inspectedMove.bestLan &&
                inspectedMove.playedLan !== inspectedMove.bestLan && (
                  <div className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                    Stockfish best:{' '}
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      {inspectedMove.bestLan}
                    </span>{' '}
                    (shown with green arrow)
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
