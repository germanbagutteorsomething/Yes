import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Crown,
  Flame,
  Lock,
  Mountain,
  Play,
  Puzzle,
  Sparkles,
  Swords,
  Unlock,
} from 'lucide-react';
import chessHubCover from '../assets/images/chess_hub_cover_1795596698719.jpg';
import poolHubCover from '../assets/images/pool_hub_cover_1795612322722.jpg';
import skiHubCover from '../assets/images/ski_hub_cover_1795596698560.jpg';
import { SKI_MAPS } from '../data/skiMaps';
import { ARCADE_UNLOCKABLES, type StoredArcadeState } from '../types/arcade';
import type { AppView } from '../types/chess';
import type { SkiMapId } from '../types/ski';
import {
  getChallengeMetricValue,
  getDailyChallenges,
  getGameLabel,
  loadArcadeState,
  unlockArcadeItem,
} from '../utils/arcadeProgress';
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
  onSelectPool: () => void;
}

export const GamesHub: React.FC<GamesHubProps> = ({
  onSelectChess,
  onSelectSki,
  onSelectPool,
}) => {
  const [chessImgError, setChessImgError] = useState(false);
  const [skiImgError, setSkiImgError] = useState(false);
  const [poolImgError, setPoolImgError] = useState(false);
  const [arcade, setArcade] = useState<StoredArcadeState>(() => loadArcadeState());
  const [unlockFeedback, setUnlockFeedback] = useState<string | null>(null);

  const dailyChallenges = useMemo(() => getDailyChallenges(arcade.dailyDateKey), [arcade.dailyDateKey]);

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

  const handleUnlock = (unlockId: string) => {
    const res = unlockArcadeItem(unlockId);
    setArcade(res.state);
    if (res.ok) {
      const item = ARCADE_UNLOCKABLES.find((u) => u.id === unlockId);
      setUnlockFeedback(item ? `Unlocked ${item.name}!` : 'Unlocked!');
    } else if (res.error) {
      setUnlockFeedback(res.error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Compact Arcade Intro */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            <span>SquareEight Arcade</span>
            <span aria-hidden="true">·</span>
            <span>3 Games</span>
            <span aria-hidden="true">·</span>
            <span>Offline Ready</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 [text-wrap:balance]">
            Choose a Game to Play
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl">
            Compete in Stockfish Chess and 3-Min Puzzle Rush, drop into five 3D Cork7 Ski runs
            including Endless Backcountry, or break the rack in 8-Ball Pool.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Arcade XP
            </div>
            <div className="font-mono text-base font-bold text-stone-900 dark:text-stone-100 tabular-nums">
              {arcade.xp.toLocaleString()} XP
            </div>
          </div>
        </div>
      </section>

      {/* Three Equal Showcase Cards */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-stretch">
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
                <span>10 Stockfish</span>
                <span aria-hidden="true">·</span>
                <span>Puzzle Rush</span>
              </div>
              <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100">
                SquareEight Chess
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                Full FIDE chess studio with 15 variants (King of the Hill, 3-Check, Fog of War,
                Racing Kings, 960), 6 personalities, 3-Minute Puzzle Rush, and Stockfish review.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-stone-200/80 dark:border-stone-800/80">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectChess('puzzles')}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
                >
                  <Puzzle className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span>Puzzles</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectChess('endgames')}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Endgames</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectChess('archive')}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors whitespace-nowrap"
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
                <span>{SKI_MAPS.length} Runs</span>
                <span aria-hidden="true">·</span>
                <span>Ghost + Endless</span>
              </div>
              <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100">
                Cork7 Alpine Ski
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                Race your Personal Best Ghost down four alpine parks or survive procedural Endless
                Backcountry chutes with Cork 720 grabs and rail combos.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-stone-200/80 dark:border-stone-800/80">
              {/* Direct 5-Run Quick Drop-In Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {SKI_MAPS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectSki(m.id)}
                    title={`Drop into ${m.name} (${m.difficulty})`}
                    className={`flex flex-col items-start rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                      m.id === 'endless' ? 'col-span-2 sm:col-span-1' : ''
                    }`}
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
                <span>Open Ski Lodge</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>

        {/* Card 3: SquareEight 8-Ball Pool */}
        <article className="flex flex-col rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
          <div className="relative aspect-video w-full bg-stone-800 overflow-hidden">
            {!poolImgError ? (
              <img
                src={poolHubCover}
                alt="Overhead emerald felt 8-Ball billiard table with racked balls and wooden cue"
                referrerPolicy="no-referrer"
                onError={() => setPoolImgError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-900 via-stone-900 to-stone-950 text-emerald-300">
                <CircleDot className="w-12 h-12 opacity-70" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums">
                <span>Billiards</span>
                <span aria-hidden="true">·</span>
                <span>vs Pool Bot</span>
                <span aria-hidden="true">·</span>
                <span>2-Player Local</span>
              </div>
              <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-100">
                SquareEight 8-Ball Pool
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                Crisp physics 8-Ball billiards with aim ghost-ball preview, Ball-in-Hand foul
                placement, touch pull-back cue strip, and unlockable cues.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-stone-200/80 dark:border-stone-800/80">
              <div className="grid grid-cols-2 gap-1.5 text-center">
                <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2.5 py-1.5">
                  <div className="text-[10px] text-stone-500 dark:text-stone-400">Matches Won</div>
                  <div className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {arcade.poolStats.wins} / {arcade.poolStats.gamesPlayed}
                  </div>
                </div>
                <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/70 px-2.5 py-1.5">
                  <div className="text-[10px] text-stone-500 dark:text-stone-400">Balls Potted</div>
                  <div className="font-mono text-xs font-bold text-stone-800 dark:text-stone-100 tabular-nums">
                    {arcade.poolStats.ballsPotted}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onSelectPool}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
              >
                <CircleDot className="w-4 h-4" aria-hidden="true" />
                <span>Play 8-Ball Pool</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>
      </section>

      {/* Daily Arcade Challenges & XP Unlockables */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Daily Arcade Challenges */}
        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-100">
                Daily Arcade Challenges
              </h2>
            </div>
            <span className="font-mono text-xs text-stone-500 dark:text-stone-400 tabular-nums">
              {arcade.dailyDateKey}
            </span>
          </div>

          <div className="space-y-2.5">
            {dailyChallenges.map((ch) => {
              const current = getChallengeMetricValue(arcade.dailyCounters, ch.metric);
              const clamped = Math.min(current, ch.target);
              const pct = Math.min(100, Math.round((clamped / ch.target) * 100));
              const done = arcade.claimedChallengeIds.includes(ch.id) || current >= ch.target;
              return (
                <div
                  key={ch.id}
                  className={`rounded-lg border p-3 space-y-2 ${
                    done
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30'
                      : 'border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                          {ch.title}
                        </span>
                        <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400">
                          {getGameLabel(ch.game)}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5">
                        {ch.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 font-mono text-xs font-bold tabular-nums">
                      {done ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>+{ch.rewardXp} XP</span>
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">+{ch.rewardXp} XP</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-xs bg-stone-200 dark:bg-stone-700 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          done ? 'bg-emerald-600' : 'bg-amber-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-stone-600 dark:text-stone-400 tabular-nums shrink-0">
                      {clamped.toLocaleString()}/{ch.target.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Arcade Reward Locker */}
        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-100">
                XP Unlockables Locker
              </h2>
            </div>
            <span className="font-mono text-xs text-stone-500 dark:text-stone-400 tabular-nums">
              {arcade.unlockedIds.length}/{ARCADE_UNLOCKABLES.length} unlocked
            </span>
          </div>

          {unlockFeedback && (
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200">
              {unlockFeedback}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ARCADE_UNLOCKABLES.map((item) => {
              const unlocked = arcade.unlockedIds.includes(item.id);
              const canAfford = arcade.xp >= item.costXp;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={unlocked}
                  onClick={() => handleUnlock(item.id)}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                    unlocked
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 cursor-default'
                      : canAfford
                      ? 'border-amber-400/70 dark:border-amber-600/70 bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                      : 'border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40 opacity-75 hover:opacity-100'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate">
                      {item.subtitle}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] font-bold tabular-nums">
                    {unlocked ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <Unlock className="w-3 h-3" aria-hidden="true" />
                        <span>Owned</span>
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          canAfford
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-stone-500 dark:text-stone-400'
                        }`}
                      >
                        <Lock className="w-3 h-3" aria-hidden="true" />
                        <span>{item.costXp} XP</span>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Full-Width 4-Column Arcade Progress Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">Chess &amp; Rush</div>
          <div className="mt-1 font-mono text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
            {summary.matchesCount}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono tabular-nums">
            {summary.opponentsBeat}/16 AI · Rush {arcade.puzzleRushBestScore}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">Tactics &amp; Drills</div>
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
            {summary.skiMedalsEarned}/{SKI_MAPS.length} medals · {summary.totalSkiRuns} runs
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">8-Ball Pool &amp; XP</div>
          <div className="mt-1 font-mono text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
            {arcade.poolStats.wins}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono tabular-nums">
            {arcade.poolStats.ballsPotted} potted · {arcade.totalChallengesClaimed} dailies
          </div>
        </div>
      </section>
    </div>
  );
};

