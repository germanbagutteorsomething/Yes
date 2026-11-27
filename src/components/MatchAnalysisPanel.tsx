import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Crown,
  Eye,
  Filter,
  HelpCircle,
  Lightbulb,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type {
  MatchAnalysisResult,
  MoveAnalysis,
  MoveClassification,
  PlayerColor,
} from '../types/chess';
import { formatEvalLabel } from './EvalBar';

interface MatchAnalysisPanelProps {
  hasMoves: boolean;
  isAnalyzing: boolean;
  progress: { completed: number; total: number };
  analysis: MatchAnalysisResult | null;
  error: string | null;
  inspectedPlyIndex: number | null; // 0-indexed into moves, or null for live/latest
  totalMoves: number;
  humanColor?: PlayerColor;
  onStartAnalysis: () => void;
  onCancelAnalysis: () => void;
  onSelectPly: (plyIndex: number | null) => void;
}

export interface ClassificationMeta {
  label: string;
  symbol: string;
  Icon: React.FC<{ className?: string }>;
  colorClass: string;
  badgeBg: string;
  pillBorder: string;
  dotColor: string;
  description: string;
}

export const CLASSIFICATION_META: Record<MoveClassification, ClassificationMeta> = {
  brilliant: {
    label: 'Brilliant',
    symbol: '!!',
    Icon: Sparkles,
    colorClass: 'text-cyan-600 dark:text-cyan-400',
    badgeBg: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
    pillBorder: 'border-cyan-500/40 bg-cyan-500/10',
    dotColor: 'bg-cyan-500 text-white',
    description: 'Spectacular tactical sacrifice winning decisive advantage',
  },
  great: {
    label: 'Great',
    symbol: '!',
    Icon: Zap,
    colorClass: 'text-sky-600 dark:text-sky-400',
    badgeBg: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
    pillBorder: 'border-sky-500/40 bg-sky-500/10',
    dotColor: 'bg-sky-500 text-white',
    description: 'Critical only-move preserving your advantage',
  },
  best: {
    label: 'Best',
    symbol: '★',
    Icon: Crown,
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    badgeBg: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
    pillBorder: 'border-emerald-500/40 bg-emerald-500/10',
    dotColor: 'bg-emerald-600 text-white',
    description: 'Top engine recommendation in this position',
  },
  excellent: {
    label: 'Excellent',
    symbol: '✓',
    Icon: CheckCheck,
    colorClass: 'text-teal-700 dark:text-teal-400',
    badgeBg: 'bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-500/30',
    pillBorder: 'border-teal-500/40 bg-teal-500/10',
    dotColor: 'bg-teal-500 text-white',
    description: 'Nearly as optimal as the engine choice',
  },
  good: {
    label: 'Good',
    symbol: '✓',
    Icon: Check,
    colorClass: 'text-stone-600 dark:text-stone-300',
    badgeBg: 'bg-stone-500/15 text-stone-700 dark:text-stone-300 border-stone-400/30',
    pillBorder: 'border-stone-400/30 bg-stone-500/5',
    dotColor: 'bg-stone-500 text-white',
    description: 'Natural and solid move',
  },
  book: {
    label: 'Book',
    symbol: 'B',
    Icon: BookOpen,
    colorClass: 'text-amber-700 dark:text-amber-400',
    badgeBg: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
    pillBorder: 'border-amber-500/40 bg-amber-500/10',
    dotColor: 'bg-amber-600 text-white',
    description: 'Standard grandmaster opening book theory',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    symbol: '?!',
    Icon: HelpCircle,
    colorClass: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
    pillBorder: 'border-amber-500/40 bg-amber-500/10',
    dotColor: 'bg-amber-400 text-stone-950',
    description: 'Suboptimal move giving away a portion of your advantage',
  },
  mistake: {
    label: 'Mistake',
    symbol: '?',
    Icon: AlertTriangle,
    colorClass: 'text-orange-600 dark:text-orange-400',
    badgeBg: 'bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/30',
    pillBorder: 'border-orange-500/40 bg-orange-500/10',
    dotColor: 'bg-orange-500 text-white',
    description: 'Clear tactical oversight or positional regression',
  },
  blunder: {
    label: 'Blunder',
    symbol: '??',
    Icon: AlertOctagon,
    colorClass: 'text-red-600 dark:text-red-400',
    badgeBg: 'bg-red-500/15 text-red-800 dark:text-red-300 border-red-500/30',
    pillBorder: 'border-red-500/40 bg-red-500/10',
    dotColor: 'bg-red-600 text-white',
    description: 'Severe error giving away material or the game',
  },
};

const BREAKDOWN_ROWS: MoveClassification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'book',
  'inaccuracy',
  'mistake',
  'blunder',
];

const MISTAKE_TYPES = new Set<MoveClassification>(['inaccuracy', 'mistake', 'blunder']);
const KEY_MOMENT_TYPES = new Set<MoveClassification>([
  'brilliant',
  'great',
  'inaccuracy',
  'mistake',
  'blunder',
]);

type FilterTab = 'all' | 'mistakes' | 'key' | 'white' | 'black';

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
  humanColor = 'w',
  onStartAnalysis,
  onCancelAnalysis,
  onSelectPly,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const activeMoveIdx = inspectedPlyIndex === null ? totalMoves - 1 : inspectedPlyIndex;
  const inspectedMove: MoveAnalysis | undefined =
    analysis && activeMoveIdx >= 0 ? analysis.moves[activeMoveIdx] : undefined;

  const pct =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  // Filtered moves for quick stepping
  const filteredIndices = useMemo(() => {
    if (!analysis) return [];
    return analysis.moves
      .map((m, idx) => ({ m, idx }))
      .filter(({ m }) => {
        if (activeFilter === 'mistakes') return MISTAKE_TYPES.has(m.classification);
        if (activeFilter === 'key') return KEY_MOMENT_TYPES.has(m.classification);
        if (activeFilter === 'white') return m.color === 'w';
        if (activeFilter === 'black') return m.color === 'b';
        return true;
      })
      .map(({ idx }) => idx);
  }, [analysis, activeFilter]);

  const handleStepFilter = (direction: 'next' | 'prev') => {
    if (!analysis || filteredIndices.length === 0) return;
    if (direction === 'next') {
      const next = filteredIndices.find((idx) => idx > activeMoveIdx);
      if (next !== undefined) {
        onSelectPly(next === totalMoves - 1 ? null : next);
      } else {
        onSelectPly(filteredIndices[0] === totalMoves - 1 ? null : filteredIndices[0]);
      }
    } else {
      const prevList = filteredIndices.filter((idx) => idx < activeMoveIdx);
      if (prevList.length > 0) {
        const prev = prevList[prevList.length - 1];
        onSelectPly(prev === totalMoves - 1 ? null : prev);
      } else {
        const last = filteredIndices[filteredIndices.length - 1];
        onSelectPly(last === totalMoves - 1 ? null : last);
      }
    }
  };

  const handleJumpNextMistake = () => {
    if (!analysis || analysis.moves.length === 0) return;
    const start = activeMoveIdx + 1;
    let found = analysis.moves.findIndex(
      (m, idx) => idx >= start && MISTAKE_TYPES.has(m.classification)
    );
    if (found === -1) {
      found = analysis.moves.findIndex((m) => MISTAKE_TYPES.has(m.classification));
    }
    if (found !== -1) {
      onSelectPly(found === totalMoves - 1 ? null : found);
    }
  };

  const handleJumpNextKeyMove = () => {
    if (!analysis || analysis.moves.length === 0) return;
    const start = activeMoveIdx + 1;
    let found = analysis.moves.findIndex(
      (m, idx) => idx >= start && KEY_MOMENT_TYPES.has(m.classification)
    );
    if (found === -1) {
      found = analysis.moves.findIndex((m) => KEY_MOMENT_TYPES.has(m.classification));
    }
    if (found !== -1) {
      onSelectPly(found === totalMoves - 1 ? null : found);
    }
  };

  const hasMistakes = Boolean(
    analysis?.moves.some((m) => MISTAKE_TYPES.has(m.classification))
  );
  const hasKeyMoments = Boolean(
    analysis?.moves.some((m) => KEY_MOMENT_TYPES.has(m.classification))
  );

  return (
    <section
      id="match-analysis-panel"
      className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-4"
    >
      {/* Top Header & Trigger */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award
            className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <span>Game Review & Analysis</span>
              {analysis && (
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  Stockfish 16
                </span>
              )}
            </h2>
          </div>
        </div>

        {isAnalyzing ? (
          <button
            type="button"
            onClick={onCancelAnalysis}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-300 dark:border-stone-700 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartAnalysis}
            disabled={!hasMoves}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1 text-[11px] font-semibold text-white shadow hover:bg-emerald-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{analysis ? 'Re-Analyze Match' : 'Run Full Review'}</span>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {isAnalyzing && (
        <div className="space-y-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5">
          <div className="flex items-center justify-between text-[11px] text-stone-700 dark:text-stone-300">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-emerald-400" />
              <span>Analyzing tactical moves & calculating Elo…</span>
            </span>
            <span className="font-mono tabular-nums font-semibold">
              {progress.completed}/{progress.total} ({pct}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 transition-[width] duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-2.5 text-xs text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {!isAnalyzing && !analysis && !error && (
        <div className="rounded-lg border border-dashed border-stone-200 dark:border-stone-800 p-3 text-center space-y-1">
          <p className="text-xs font-medium text-stone-700 dark:text-stone-300">
            Comprehensive Move-by-Move Analysis
          </p>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 max-w-xs mx-auto">
            {hasMoves
              ? 'Click "Run Full Review" to get your Estimated Performance Elo, move ratings with distinctive icons, and clear explanations of what went wrong and what move was better.'
              : 'Play some chess moves to unlock engine tactical analysis, blunder refutations, and estimated Elo ratings.'}
          </p>
        </div>
      )}

      {analysis && !isAnalyzing && (
        <div className="space-y-4">
          {/* Estimated Elo Performance Rating Cards */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Estimated Performance Elo</span>
              </span>
              <span>Based on Accuracy & Tactical Play</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* White Card */}
              <div
                className={`rounded-xl border p-3 space-y-2 relative overflow-hidden transition-all ${
                  humanColor === 'w'
                    ? 'border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/30 dark:to-stone-900 shadow-sm ring-1 ring-emerald-500/20'
                    : 'border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-stone-400 shadow-xs" />
                    <span className="text-[11px] font-semibold text-stone-800 dark:text-stone-200">
                      White
                    </span>
                    {humanColor === 'w' && (
                      <span className="rounded-full bg-emerald-600 text-white px-1.5 py-0.2 text-[9px] font-bold">
                        YOU
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400">
                    {analysis.white.acpl} acpl
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-stone-500 dark:text-stone-400">
                      Estimated Elo
                    </div>
                    <div className="font-mono text-xl font-extrabold text-stone-900 dark:text-stone-100 tabular-nums">
                      ~{analysis.white.estimatedElo}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-semibold text-stone-500 dark:text-stone-400">
                      Accuracy
                    </div>
                    <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {analysis.white.accuracy.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="pt-1 border-t border-stone-200/70 dark:border-stone-800/80 flex items-center justify-between text-[10px]">
                  <span className="font-medium text-stone-600 dark:text-stone-400">
                    {analysis.white.performanceTitle}
                  </span>
                  <span className="text-stone-500 dark:text-stone-500 font-mono">
                    {analysis.white.blunder === 0 ? '0 blunders' : `${analysis.white.blunder} blunders`}
                  </span>
                </div>
              </div>

              {/* Black Card */}
              <div
                className={`rounded-xl border p-3 space-y-2 relative overflow-hidden transition-all ${
                  humanColor === 'b'
                    ? 'border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/30 dark:to-stone-900 shadow-sm ring-1 ring-emerald-500/20'
                    : 'border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-stone-900 border border-stone-600 shadow-xs" />
                    <span className="text-[11px] font-semibold text-stone-800 dark:text-stone-200">
                      Black
                    </span>
                    {humanColor === 'b' && (
                      <span className="rounded-full bg-emerald-600 text-white px-1.5 py-0.2 text-[9px] font-bold">
                        YOU
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400">
                    {analysis.black.acpl} acpl
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-stone-500 dark:text-stone-400">
                      Estimated Elo
                    </div>
                    <div className="font-mono text-xl font-extrabold text-stone-900 dark:text-stone-100 tabular-nums">
                      ~{analysis.black.estimatedElo}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-semibold text-stone-500 dark:text-stone-400">
                      Accuracy
                    </div>
                    <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {analysis.black.accuracy.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="pt-1 border-t border-stone-200/70 dark:border-stone-800/80 flex items-center justify-between text-[10px]">
                  <span className="font-medium text-stone-600 dark:text-stone-400">
                    {analysis.black.performanceTitle}
                  </span>
                  <span className="text-stone-500 dark:text-stone-500 font-mono">
                    {analysis.black.blunder === 0 ? '0 blunders' : `${analysis.black.blunder} blunders`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Advantage Graph */}
          {analysis.moves.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400">
                <span className="font-medium">Advantage Timeline</span>
                <span className="font-mono text-[9px]">+White / -Black</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-950 p-1">
                <svg
                  viewBox={`0 0 ${Math.max(analysis.moves.length * 14, 140)} 56`}
                  preserveAspectRatio="none"
                  className="h-14 w-full block cursor-pointer select-none"
                  role="img"
                  aria-label="Advantage timeline"
                >
                  {/* Zero / equality center line */}
                  <line
                    x1="0"
                    y1="28"
                    x2={Math.max(analysis.moves.length * 14, 140)}
                    y2="28"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />

                  {(() => {
                    const width = Math.max(analysis.moves.length * 14, 140);
                    const step = width / analysis.moves.length;
                    const pts = analysis.moves.map((m, idx) => {
                      const x = (idx + 0.5) * step;
                      const y = evalToGraphY(m.evalAfter.cp, m.evalAfter.mate, 56);
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    });
                    const polyPts = `0,28 ${pts.join(' ')} ${width},28`;

                    return (
                      <>
                        <polygon points={polyPts} fill="rgba(255,255,255,0.15)" />
                        <polyline
                          points={pts.join(' ')}
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="1.5"
                        />
                        {analysis.moves.map((m, idx) => {
                          const x = (idx + 0.5) * step;
                          const y = evalToGraphY(m.evalAfter.cp, m.evalAfter.mate, 56);
                          const isSelected = activeMoveIdx === idx;
                          const meta = CLASSIFICATION_META[m.classification];
                          const dotFill =
                            m.classification === 'blunder'
                              ? '#EF4444'
                              : m.classification === 'mistake'
                              ? '#F97316'
                              : m.classification === 'inaccuracy'
                              ? '#F59E0B'
                              : m.classification === 'brilliant'
                              ? '#06B6D4'
                              : m.classification === 'great'
                              ? '#0EA5E9'
                              : isSelected
                              ? '#10B981'
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
                                height={56}
                                fill="transparent"
                              />
                              {isSelected && (
                                <line
                                  x1={x}
                                  y1={0}
                                  x2={x}
                                  y2={56}
                                  stroke="#10B981"
                                  strokeWidth="1.5"
                                />
                              )}
                              {(dotFill !== 'transparent' || isSelected) && (
                                <circle
                                  cx={x}
                                  cy={y}
                                  r={isSelected ? 3.5 : 2.5}
                                  fill={isSelected ? '#10B981' : dotFill}
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

          {/* Quick Filter Navigation Bar */}
          <div className="flex items-center justify-between gap-1 border-y border-stone-200/80 dark:border-stone-800/80 py-2">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-[10px]">
              <span className="text-stone-400 dark:text-stone-500 mr-0.5">
                <Filter className="w-3 h-3" />
              </span>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`rounded-md px-2 py-0.8 font-medium transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-semibold'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                All Moves ({analysis.moves.length})
              </button>
              {hasMistakes && (
                <button
                  type="button"
                  onClick={() => setActiveFilter('mistakes')}
                  className={`rounded-md px-2 py-0.8 font-medium transition-colors inline-flex items-center gap-1 ${
                    activeFilter === 'mistakes'
                      ? 'bg-red-600 text-white font-semibold'
                      : 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Mistakes & Blunders</span>
                </button>
              )}
              {hasKeyMoments && (
                <button
                  type="button"
                  onClick={() => setActiveFilter('key')}
                  className={`rounded-md px-2 py-0.8 font-medium transition-colors inline-flex items-center gap-1 ${
                    activeFilter === 'key'
                      ? 'bg-emerald-700 text-white font-semibold'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Key Moments</span>
                </button>
              )}
            </div>

            {/* Step buttons for filtered list */}
            {filteredIndices.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStepFilter('prev')}
                  className="rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-1 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700"
                  title="Previous in filter"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStepFilter('next')}
                  className="rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-1 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700"
                  title="Next in filter"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Detailed Inspected Move Card: What went wrong & What would have been better */}
          {inspectedMove && (() => {
            const meta = CLASSIFICATION_META[inspectedMove.classification];
            const Icon = meta.Icon;
            const isError = MISTAKE_TYPES.has(inspectedMove.classification);
            const isPraise =
              inspectedMove.classification === 'brilliant' ||
              inspectedMove.classification === 'great' ||
              inspectedMove.classification === 'best';

            return (
              <div
                className={`rounded-xl border p-3.5 space-y-3 transition-all ${
                  isError
                    ? 'border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20'
                    : isPraise
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40'
                }`}
              >
                {/* Header row: Move number, Move SAN, Classification Icon Badge, Eval */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold border ${meta.badgeBg}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{meta.label}</span>
                    </span>

                    <span className="font-mono font-bold text-stone-900 dark:text-stone-100 text-sm truncate">
                      {Math.ceil(inspectedMove.ply / 2)}
                      {inspectedMove.color === 'w' ? '.' : '...'} {inspectedMove.san}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-xs font-semibold text-stone-700 dark:text-stone-300 tabular-nums">
                      {formatEvalLabel(inspectedMove.evalBefore)} →{' '}
                      {formatEvalLabel(inspectedMove.evalAfter)}
                    </span>
                    {inspectedMove.cpLoss > 0 && (
                      <span className="font-mono text-[10px] font-medium text-red-600 dark:text-red-400">
                        (-{(inspectedMove.cpLoss / 100).toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Tactical Theme Pill if available */}
                {inspectedMove.tacticalTheme && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                      Theme:
                    </span>
                    <span className="rounded-md bg-stone-200/80 dark:bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-stone-800 dark:text-stone-200">
                      {inspectedMove.tacticalTheme}
                    </span>
                  </div>
                )}

                {/* 1. What Went Wrong Card (for inaccuracies, mistakes, blunders) */}
                {isError && inspectedMove.whatWentWrong && (
                  <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-white/90 dark:bg-stone-900/90 p-2.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                      <span>What went wrong:</span>
                    </div>
                    <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed pl-5.5">
                      {inspectedMove.whatWentWrong}
                    </p>
                  </div>
                )}

                {/* 2. What Would Have Been Better Card (Always shown when played != best) */}
                {inspectedMove.bestSan &&
                  inspectedMove.playedLan !== inspectedMove.bestLan && (
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-white/90 dark:bg-stone-900/90 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          <Lightbulb className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>What would have been better:</span>
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300/60 dark:border-emerald-700/60 rounded px-2 py-0.5">
                          {inspectedMove.bestSan}
                        </span>
                      </div>

                      {inspectedMove.whyBetter && (
                        <div className="space-y-0.5 pl-5.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            Why it would have been better:
                          </div>
                          <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                            {inspectedMove.whyBetter}
                          </p>
                        </div>
                      )}

                      {/* Interactive Board Position Toggles */}
                      <div className="pt-1.5 pl-5.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onSelectPly(activeMoveIdx <= 0 ? -1 : activeMoveIdx - 1)
                          }
                          className="inline-flex items-center gap-1 rounded border border-emerald-300/80 dark:border-emerald-700/80 bg-emerald-50/70 dark:bg-emerald-950/40 px-2 py-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                          title="Shows the board right before this move, displaying the engine best move arrow"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Show Position Before Move</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectPly(activeMoveIdx)}
                          className="inline-flex items-center gap-1 rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                          title="Shows the board after the move was made"
                        >
                          <span>Show Played Move</span>
                        </button>
                      </div>
                    </div>
                  )}

                {/* 3. Praise Card for Brilliant, Great, or Top choices */}
                {isPraise && inspectedMove.whyBetter && (
                  <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-white/90 dark:bg-stone-900/90 p-2.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      <Icon className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>Engine verdict:</span>
                    </div>
                    <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed pl-5.5">
                      {inspectedMove.whyBetter}
                    </p>
                  </div>
                )}

                {/* Navigation Buttons: Prev, Next, Jump to Next Mistake, Key Move */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-stone-200/80 dark:border-stone-700/80">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectPly(activeMoveIdx <= 0 ? -1 : activeMoveIdx - 1)
                      }
                      disabled={activeMoveIdx < 0}
                      className="inline-flex items-center gap-0.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
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
                      className="inline-flex items-center gap-0.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {hasMistakes && (
                      <button
                        type="button"
                        onClick={handleJumpNextMistake}
                        className="inline-flex items-center gap-1 rounded-md border border-red-300/60 dark:border-red-700/60 bg-red-50/70 dark:bg-red-950/40 px-2 py-1 text-[11px] font-medium text-red-700 dark:text-red-300 hover:bg-red-100/70 dark:hover:bg-red-900/50 transition-colors whitespace-nowrap"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>Next Error</span>
                      </button>
                    )}

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
              </div>
            );
          })()}

          {/* Move Quality Breakdown Table with Actual Icons */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Move Quality Breakdown
            </div>
            <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden text-[11px]">
              <div className="grid grid-cols-[1fr_3rem_3rem] items-center bg-stone-50 dark:bg-stone-800/60 px-3 py-1.5 text-[10px] font-semibold text-stone-500 dark:text-stone-400">
                <span>Classification & Icon</span>
                <span className="text-center">White</span>
                <span className="text-center">Black</span>
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {BREAKDOWN_ROWS.map((category) => {
                  const meta = CLASSIFICATION_META[category];
                  const Icon = meta.Icon;
                  const whiteCount = analysis.white[category];
                  const blackCount = analysis.black[category];

                  return (
                    <div
                      key={category}
                      className="grid grid-cols-[1fr_3rem_3rem] items-center px-3 py-1.5 hover:bg-stone-50/80 dark:hover:bg-stone-800/40 transition-colors cursor-pointer"
                      onClick={() => {
                        // Find first move of this category
                        const foundIdx = analysis.moves.findIndex(
                          (m) => m.classification === category
                        );
                        if (foundIdx !== -1) {
                          onSelectPly(foundIdx === totalMoves - 1 ? null : foundIdx);
                        }
                      }}
                      title={`Click to inspect first ${meta.label} move`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${meta.dotColor} shrink-0`}
                        >
                          <Icon className="w-3 h-3" />
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`font-semibold ${meta.colorClass}`}>
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">
                            {meta.symbol}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-center font-mono font-bold tabular-nums ${
                          whiteCount > 0
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-400 dark:text-stone-600'
                        }`}
                      >
                        {whiteCount}
                      </span>
                      <span
                        className={`text-center font-mono font-bold tabular-nums ${
                          blackCount > 0
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-400 dark:text-stone-600'
                        }`}
                      >
                        {blackCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
