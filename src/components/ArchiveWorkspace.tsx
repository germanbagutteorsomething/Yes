import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import {
  BarChart3,
  CheckCircle2,
  FileInput,
  History,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  BOT_PROFILES,
  GAME_VARIANTS,
  STOCKFISH_LEVELS,
  type BotId,
  type SavedMatch,
  type StockfishLevelNumber,
} from '../types/chess';
import { getChessRankTitle } from '../utils/elo';
import { loadChessElo, loadPuzzleState } from '../utils/storage';

interface ArchiveWorkspaceProps {
  matches: SavedMatch[];
  defeatedBots: BotId[];
  defeatedLevels: StockfishLevelNumber[];
  onLoadSavedMatch: (match: SavedMatch, autoAnalyze?: boolean) => void;
  onDeleteMatch: (matchId: string) => void;
  onClearMatches: () => void;
  onImportPositionOrGame: (input: string, mode: 'play' | 'analyze') => string | null;
}

export const ArchiveWorkspace: React.FC<ArchiveWorkspaceProps> = ({
  matches,
  defeatedBots,
  defeatedLevels,
  onLoadSavedMatch,
  onDeleteMatch,
  onClearMatches,
  onImportPositionOrGame,
}) => {
  const [importText, setImportText] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);

  const puzzleState = useMemo(() => loadPuzzleState(), []);
  const chessElo = useMemo(() => loadChessElo(), [matches.length]);

  const stats = useMemo(() => {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let accSum = 0;
    let accCount = 0;

    for (const m of matches) {
      if (m.winner === 'draw') draws += 1;
      else if (m.mode === 'stockfish' || m.mode === 'online') {
        if (m.winner === m.humanColor) wins += 1;
        else losses += 1;
      } else {
        wins += 1;
      }

      const humanAcc = m.humanColor === 'w' ? m.whiteAccuracy : m.blackAccuracy;
      if (typeof humanAcc === 'number') {
        accSum += humanAcc;
        accCount += 1;
      }
    }

    const avgAccuracy = accCount > 0 ? (accSum / accCount).toFixed(1) : '—';
    return { wins, draws, losses, avgAccuracy };
  }, [matches]);

  const handleImport = (mode: 'play' | 'analyze') => {
    const trimmed = importText.trim();
    if (!trimmed) {
      setImportError('Paste a valid FEN string or PGN notation first.');
      return;
    }

    // Quick pre-validation
    const test = new Chess();
    let valid = false;
    try {
      test.load(trimmed);
      valid = true;
    } catch {
      try {
        test.loadPgn(trimmed);
        valid = true;
      } catch {
        valid = false;
      }
    }

    if (!valid) {
      setImportError('Could not parse FEN or PGN. Check notation and try again.');
      return;
    }

    const err = onImportPositionOrGame(trimmed, mode);
    if (err) {
      setImportError(err);
    } else {
      setImportError(null);
      setImportText('');
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Overview Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">Chess Elo</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {chessElo.rating}
          </div>
          <div className="mt-1 font-mono text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            {getChessRankTitle(chessElo.rating)} · Peak {chessElo.peakRating}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">Matches Played</div>
          <div className="mt-1 font-mono text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
            {matches.length}
          </div>
          <div className="mt-1 font-mono text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            {stats.wins}W · {stats.draws}D · {stats.losses}L
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">Avg Accuracy</div>
          <div className="mt-1 font-mono text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
            {stats.avgAccuracy === '—' ? '—' : `${stats.avgAccuracy}%`}
          </div>
          <div className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
            Analyzed matches
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">Bots Defeated</div>
          <div className="mt-1 font-mono text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
            {defeatedBots.length}/{BOT_PROFILES.length}
          </div>
          <div className="mt-1 font-mono text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            Stockfish {defeatedLevels.length}/{STOCKFISH_LEVELS.length}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-stone-500 dark:text-stone-400">Puzzle Best Streak</div>
          <div className="mt-1 font-mono text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
            {puzzleState.bestStreak}
          </div>
          <div className="mt-1 font-mono text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            {puzzleState.solvedIds.length} solved
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* Saved Match History */}
        <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                Match History
              </h2>
            </div>
            {matches.length > 0 && (
              <button
                type="button"
                onClick={onClearMatches}
                className="text-[11px] font-medium text-stone-500 hover:text-red-600 dark:text-stone-400 dark:hover:text-red-400 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {matches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-200 dark:border-stone-800 px-4 py-8 text-center text-xs text-stone-500 dark:text-stone-400">
              Completed games are saved automatically here so you can reopen and analyze them anytime offline.
            </div>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {matches.map((m) => {
                const dateLabel = new Date(m.playedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                });
                const outcomeText =
                  m.winner === 'draw'
                    ? 'Draw'
                    : m.mode === 'two-player'
                    ? `${m.winner === 'w' ? 'White' : 'Black'} won`
                    : m.winner === m.humanColor
                    ? 'Victory'
                    : 'Defeat';

                return (
                  <div
                    key={m.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-semibold ${
                            outcomeText === 'Victory'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : outcomeText === 'Defeat'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          {outcomeText}
                        </span>
                        <span className="text-stone-400">·</span>
                        <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                          {m.opponentLabel}
                        </span>
                        <span className="text-stone-400">·</span>
                        <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                          {Math.ceil(m.movesCount / 2)} moves
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-stone-500 dark:text-stone-400">
                        <span>{dateLabel}</span>
                        {m.variant && m.variant !== 'standard' && (
                          <>
                            <span>·</span>
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">
                              {GAME_VARIANTS.find((v) => v.id === m.variant)?.shortLabel ?? m.variant}
                            </span>
                          </>
                        )}
                        {m.openingName && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[240px]">
                              {m.openingEco ? `${m.openingEco} ` : ''}
                              {m.openingName}
                            </span>
                          </>
                        )}
                        {typeof m.whiteAccuracy === 'number' &&
                          typeof m.blackAccuracy === 'number' && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {m.whiteAccuracy.toFixed(0)}% / {m.blackAccuracy.toFixed(0)}%
                              </span>
                            </>
                          )}
                        {typeof m.eloDelta === 'number' && (
                          <>
                            <span>·</span>
                            <span
                              className={`font-mono font-semibold tabular-nums ${
                                m.eloDelta > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : m.eloDelta < 0
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-stone-500 dark:text-stone-400'
                              }`}
                            >
                              {m.eloDelta > 0 ? `+${m.eloDelta}` : m.eloDelta === 0 ? '±0' : m.eloDelta} Elo
                            </span>
                          </>
                        )}
                        {typeof m.brilliantCount === 'number' && m.brilliantCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                              !! {m.brilliantCount}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onLoadSavedMatch(m, true)}
                        className="inline-flex items-center gap-1 rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-2.5 py-1.5 text-[11px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors whitespace-nowrap"
                      >
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                        <span>Review</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteMatch(m.id)}
                        aria-label="Delete saved match"
                        className="inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-700 p-1.5 text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/60 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: PGN/FEN Import & Defeated Checklist */}
        <div className="space-y-4">
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileInput className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                Import PGN or FEN
              </h2>
            </div>
            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                if (importError) setImportError(null);
              }}
              rows={4}
              placeholder="Paste PGN moves (1. e4 e5 2. Nf3…) or a FEN position string"
              className="w-full rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 font-mono text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
            {importError && (
              <p className="text-xs text-red-600 dark:text-red-400">{importError}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleImport('play')}
                className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 py-2 text-xs font-semibold text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors whitespace-nowrap"
              >
                Play Position
              </button>
              <button
                type="button"
                onClick={() => handleImport('analyze')}
                className="rounded-lg bg-emerald-700 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
              >
                Analyze Game
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                Opponent Progress
              </h2>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-stone-600 dark:text-stone-400">
                Chess Bots ({defeatedBots.length}/{BOT_PROFILES.length})
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                {BOT_PROFILES.map((b) => {
                  const beaten = defeatedBots.includes(b.id);
                  return (
                    <div
                      key={b.id}
                      className={`flex items-center justify-between gap-1 rounded-md border px-2.5 py-1.5 text-[11px] ${
                        beaten
                          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                          : 'border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400'
                      }`}
                    >
                      <span className="truncate font-medium">{b.name}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span className="font-mono text-[10px] opacity-70 tabular-nums">{b.eloLabel}</span>
                        {beaten && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-stone-600 dark:text-stone-400">
                Stockfish Levels ({defeatedLevels.length}/{STOCKFISH_LEVELS.length})
              </div>
              <div className="grid grid-cols-5 gap-1">
                {STOCKFISH_LEVELS.map((lvl) => {
                  const beaten = defeatedLevels.includes(lvl.level);
                  return (
                    <div
                      key={lvl.level}
                      title={`${lvl.level}. ${lvl.name}`}
                      className={`flex flex-col items-center justify-center rounded-md border py-1.5 font-mono text-[11px] tabular-nums ${
                        beaten
                          ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/40 font-bold text-emerald-800 dark:text-emerald-300'
                          : 'border-stone-200 dark:border-stone-800 text-stone-400 dark:text-stone-500'
                      }`}
                    >
                      <span>{lvl.level}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
