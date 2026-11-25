import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  Crown,
  Mountain,
  Play,
  Puzzle,
  Swords,
} from 'lucide-react';
import chessHubCover from '../assets/images/chess_hub_cover_1795596698719.jpg';
import skiHubCover from '../assets/images/ski_hub_cover_1795596698560.jpg';
import { SKI_MAPS } from '../data/skiMaps';
import type { AppView } from '../types/chess';
import type { SkiMapId } from '../types/ski';
import {
  loadCompletedEndgames,
  loadDefeatedBots,
  loadDefeatedLevels,
  loadPuzzleState,
  loadSavedMatches,
  loadSkiProgress,
} from '../utils/storage';

interface GamesHubProps {
  onSelectChess: (chessView?: AppView) => void;
  onSelectSki: (mapId?: SkiMapId) => void;
}

export const GamesHub: React.FC<GamesHubProps> = ({
  onSelectChess,
  onSelectSki,
}) => {
  const [chessImgError, setChessImgError] = useState(false);
  const [skiImgError, setSkiImgError] = useState(false);

  const summary = useMemo(() => {
    const matches = loadSavedMatches();
    const puzzles = loadPuzzleState();
    const endgames = loadCompletedEndgames();
    const bots = loadDefeatedBots();
    const levels = loadDefeatedLevels();
    const ski = loadSkiProgress();

    let bestSkiScore = 0;
    let totalSkiScore = 0;
    let totalSkiRuns = 0;
    let skiMedalsEarned = 0;
    for (const m of SKI_MAPS) {
      const rec = ski.records[m.id];
      if (rec) {
        if (rec.bestScore > bestSkiScore) bestSkiScore = rec.bestScore;
        totalSkiScore += rec.bestScore;
        totalSkiRuns += rec.runsCompleted;
        if (rec.bestMedal && rec.bestMedal !== 'none') skiMedalsEarned += 1;
      }
    }

    return {
      matchesCount: matches.length,
      puzzlesSolved: puzzles.solvedIds.length,
      endgamesDone: endgames.length,
      opponentsBeat: bots.length + levels.length,
      bestSkiScore,
      totalSkiScore,
      totalSkiRuns,
      skiMedalsEarned,
      skiRecords: ski.records,
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Compact Arcade Intro */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
          <span>SquareEight Arcade</span>
          <span aria-hidden="true">·</span>
          <span>2 Games</span>
          <span aria-hidden="true">·</span>
          <span>Offline Ready</span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 [text-wrap:balance]">
          Choose a Game to Play
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl">
          Jump into a classic board against calibrated Stockfish engines and bots, or drop
          into four 3D alpine snow parks to throw Cork 720s and rail combos.
        </p>
      </section>

      {/* Two Equal Showcase Cards */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
        {/* Card 1: SquareEight Chess */}
        <article className="flex flex-col rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
          <div className="relative aspect-video w-full bg-stone-800 overflow-hidden">
            {!chessImgError ? (
              <img
                src={chessHubCover}
                alt="Tournament wooden and emerald chessboard mid-game"
                referrerPolicy="no-referrer"
                onError={() => setChessImgError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-950 via-stone-900 to-stone-950 text-emerald-300">
                <Swords className="w-12 h-12 opacity-70" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums">
                <span>Strategy</span>
                <span aria-hidden="true">·</span>
                <span>10 Stockfish Levels</span>
                <span aria-hidden="true">·</span>
                <span>6 Bots</span>
              </div>
              <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100">
                SquareEight Chess
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                Full FIDE chess studio with Chess960, material odds, live ECO opening
                detection, Stockfish post-match analysis, tactical puzzles, and endgame drills.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-stone-200/80 dark:border-stone-800/80">
              {/* Quick Mode Shortcuts */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectChess('puzzles')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
                >
                  <Puzzle className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span>Puzzles</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectChess('endgames')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Endgames</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectChess('archive')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
                >
                  <Archive className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Archive</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => onSelectChess('play')}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
              >
                <Swords className="w-4 h-4" aria-hidden="true" />
                <span>Play Chess</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>

        {/* Card 2: Cork7 Alpine Freestyle Ski */}
        <article className="flex flex-col rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
          <div className="relative aspect-video w-full bg-stone-800 overflow-hidden">
            {!skiImgError ? (
              <img
                src={skiHubCover}
                alt="Freestyle skier performing an airborne cork grab over a sunlit alpine park"
                referrerPolicy="no-referrer"
                onError={() => setSkiImgError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-900 via-slate-900 to-stone-950 text-sky-300">
                <Mountain className="w-12 h-12 opacity-70" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums">
                <span>3D Freestyle</span>
                <span aria-hidden="true">·</span>
                <span>4 Mountain Maps</span>
                <span aria-hidden="true">·</span>
                <span>Cork & Rail Combos</span>
              </div>
              <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100">
                Cork7 Alpine Ski
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                Carve down sunlit parks, timber glades, a sculpted superpipe, and floodlit
                night chutes. Launch big air booters to stomp Cork 720 grabs and chain rail grinds.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-stone-200/80 dark:border-stone-800/80">
              {/* Direct 4-Map Quick Drop-In Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {SKI_MAPS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectSki(m.id)}
                    title={`Drop into ${m.name} (${m.difficulty})`}
                    className="flex flex-col items-start rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2.5 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  >
                    <span className="text-[11px] font-semibold text-stone-800 dark:text-stone-100 truncate w-full">
                      {m.name}
                    </span>
                    <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400 tabular-nums">
                      {summary.skiRecords[m.id]?.bestScore
                        ? `${summary.skiRecords[m.id]!.bestScore.toLocaleString()}`
                        : m.difficulty}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onSelectSki()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                <span>Open Ski Lodge & Maps</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>
      </section>

      {/* Full-Width 4-Column Arcade Progress Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">Chess Matches</div>
          <div className="mt-1 font-mono text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
            {summary.matchesCount}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono tabular-nums">
            {summary.opponentsBeat}/16 AI beaten
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">Tactics & Drills</div>
          <div className="mt-1 font-mono text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
            {summary.puzzlesSolved + summary.endgamesDone}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono tabular-nums">
            {summary.puzzlesSolved} puzzles · {summary.endgamesDone} endgames
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">Best Ski Score</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {summary.bestSkiScore > 0 ? summary.bestSkiScore.toLocaleString() : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono tabular-nums">
            {summary.totalSkiRuns} mountain runs
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">All-Mountain Score</div>
          <div className="mt-1 font-mono text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
            {summary.totalSkiScore > 0 ? summary.totalSkiScore.toLocaleString() : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono tabular-nums">
            {summary.skiMedalsEarned}/{SKI_MAPS.length} park medals
          </div>
        </div>
      </section>
    </div>
  );
};
