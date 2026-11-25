import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Camera,
  ChevronLeft,
  Flag,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  getSkiGearById,
  getSkiMapById,
  SKI_GEAR_STYLES,
  SKI_MAPS,
} from '../data/skiMaps';
import { SkiViewport } from '../ski/SkiViewport';
import type {
  SkiCameraMode,
  SkiGrabType,
  SkiHudSnapshot,
  SkiInputState,
  SkiMapId,
  SkiPhase,
  StoredSkiProgress,
} from '../types/ski';
import {
  loadSkiProgress,
  recordSkiRunResult,
  saveSkiSelection,
} from '../utils/storage';

interface SkiGameWorkspaceProps {
  soundEnabled: boolean;
  requestedMapId?: SkiMapId | null;
  requestedStartNonce?: number;
  onBackToHub?: () => void;
  onStatsChange?: () => void;
}

const INITIAL_HUD: SkiHudSnapshot = {
  score: 0,
  comboScore: 0,
  comboMultiplier: 1,
  speedKmh: 0,
  distanceMeters: 0,
  lengthMeters: 1100,
  progressPct: 0,
  isAirborne: false,
  isGrinding: false,
  isBailing: false,
  airtime: 0,
  spinDeg: 0,
  flipDeg: 0,
  grab: 'none',
  liveTrickText: '',
  calloutText: '',
  calloutSubtext: '',
  calloutTone: 'clean',
  calloutNonce: 0,
  bestTrickName: '',
  bestTrickPoints: 0,
  maxCombo: 1,
  topSpeedKmh: 0,
  railsHit: 0,
  cleanLandings: 0,
  bails: 0,
  cameraMode: 'chase',
};

export const SkiGameWorkspace: React.FC<SkiGameWorkspaceProps> = ({
  soundEnabled,
  requestedMapId = null,
  requestedStartNonce = 0,
  onBackToHub,
  onStatsChange,
}) => {
  const [progress, setProgress] = useState<StoredSkiProgress>(() => loadSkiProgress());
  const [mapId, setMapId] = useState<SkiMapId>(
    () => requestedMapId ?? progress.selectedMapId
  );
  const [gearId, setGearId] = useState<string>(() => progress.selectedGearId);
  const [phase, setPhase] = useState<SkiPhase>(() =>
    requestedMapId ? 'playing' : 'menu'
  );
  const [runSeed, setRunSeed] = useState<number>(1);
  const [cameraMode, setCameraMode] = useState<SkiCameraMode>('chase');
  const [hud, setHud] = useState<SkiHudSnapshot>(INITIAL_HUD);
  const [isNewBest, setIsNewBest] = useState<boolean>(false);

  const inputRef = useRef<SkiInputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    jumpPressed: false,
    jumpHeld: false,
    grab: 'none',
  });

  const gearIdRef = useRef<string>(gearId);
  gearIdRef.current = gearId;
  const lastHandledStartNonceRef = useRef<number>(requestedStartNonce);

  // React to direct map launch requests from the Games Hub
  useEffect(() => {
    if (!requestedMapId || requestedStartNonce === 0) return;
    if (lastHandledStartNonceRef.current === requestedStartNonce) return;
    lastHandledStartNonceRef.current = requestedStartNonce;
    setMapId(requestedMapId);
    setProgress(saveSkiSelection(requestedMapId, gearIdRef.current));
    setHud({
      ...INITIAL_HUD,
      lengthMeters: getSkiMapById(requestedMapId).lengthMeters,
    });
    setIsNewBest(false);
    setRunSeed((n) => n + 1);
    setPhase('playing');
  }, [requestedMapId, requestedStartNonce]);

  const activeMap = useMemo(() => getSkiMapById(mapId), [mapId]);
  const activeGear = useMemo(() => getSkiGearById(gearId), [gearId]);

  const clearInputs = useCallback(() => {
    inputRef.current = {
      left: false,
      right: false,
      up: false,
      down: false,
      jumpPressed: false,
      jumpHeld: false,
      grab: 'none',
    };
  }, []);

  const handleDropIn = useCallback(
    (targetMapId: SkiMapId = mapId) => {
      clearInputs();
      setMapId(targetMapId);
      setProgress(saveSkiSelection(targetMapId, gearId));
      setHud({
        ...INITIAL_HUD,
        lengthMeters: getSkiMapById(targetMapId).lengthMeters,
      });
      setIsNewBest(false);
      setRunSeed((n) => n + 1);
      setPhase('playing');
    },
    [clearInputs, gearId, mapId]
  );

  const handleSelectGear = useCallback(
    (nextGearId: string) => {
      setGearId(nextGearId);
      setProgress(saveSkiSelection(mapId, nextGearId));
    },
    [mapId]
  );

  const handleTogglePause = useCallback(() => {
    setPhase((prev) => {
      if (prev === 'playing') return 'paused';
      if (prev === 'paused') return 'playing';
      return prev;
    });
  }, []);

  const handleCycleCamera = useCallback(() => {
    setCameraMode((prev) =>
      prev === 'chase' ? 'low' : prev === 'low' ? 'wide' : 'chase'
    );
  }, []);

  const handleFinishRun = useCallback(
    (finalSnapshot: SkiHudSnapshot) => {
      setHud(finalSnapshot);
      const res = recordSkiRunResult({
        mapId,
        score: finalSnapshot.score,
        bestTrickName: finalSnapshot.bestTrickName,
        bestTrickPoints: finalSnapshot.bestTrickPoints,
        completed: true,
      });
      setProgress(res.progress);
      setIsNewBest(res.isNewBest);
      setPhase('finished');
      onStatsChange?.();
    },
    [mapId, onStatsChange]
  );

  const setTouchFlag = useCallback(
    (field: 'left' | 'right' | 'up' | 'down', val: boolean) => {
      inputRef.current[field] = val;
    },
    []
  );

  const triggerTouchJump = useCallback((down: boolean) => {
    if (down) {
      inputRef.current.jumpPressed = true;
      inputRef.current.jumpHeld = true;
    } else {
      inputRef.current.jumpHeld = false;
    }
  }, []);

  const setTouchGrab = useCallback((grab: SkiGrabType) => {
    inputRef.current.grab = grab;
  }, []);

  if (phase === 'menu') {
    const selectedRecord = progress.records[mapId];

    return (
      <div className="space-y-6">
        {/* Top Banner & Primary Drop-In Header */}
        <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                {onBackToHub && (
                  <>
                    <button
                      type="button"
                      onClick={onBackToHub}
                      className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>All Games</span>
                    </button>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>3D Freestyle Skiing</span>
                <span aria-hidden="true">·</span>
                <span>4 Mountain Parks</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                Cork7 Alpine Lodge
              </h1>
              <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl">
                Pick a mountain park, dial in your rider gear, and stomp Cork 720s, rails, and
                superpipe airs down four distinct 3D runs.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleDropIn(mapId)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                <span>Drop In · {activeMap.name}</span>
              </button>
            </div>
          </div>
        </section>

        {/* 4 Mountain Park Map Selector */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-100">
              Select Mountain Park
            </h2>
            <span className="text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums">
              Selected: {activeMap.name} ({activeMap.lengthMeters.toLocaleString()}m)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {SKI_MAPS.map((m) => {
              const selected = m.id === mapId;
              const rec = progress.records[m.id];

              return (
                <div
                  key={m.id}
                  onClick={() => {
                    setMapId(m.id);
                    setProgress(saveSkiSelection(m.id, gearId));
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setMapId(m.id);
                      setProgress(saveSkiSelection(m.id, gearId));
                    }
                  }}
                  className={`group cursor-pointer rounded-xl border p-4 transition-colors ${
                    selected
                      ? 'border-emerald-700 dark:border-emerald-500 bg-white dark:bg-stone-900 ring-1 ring-emerald-700/25 dark:ring-emerald-500/25'
                      : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-stone-300 dark:hover:border-stone-700'
                  }`}
                >
                  {/* Procedural Alpine Sky & Slope Preview */}
                  <div
                    className="relative h-28 w-full overflow-hidden rounded-lg mb-3.5 border border-stone-200/70 dark:border-stone-800"
                    style={{
                      background: `linear-gradient(180deg, ${m.skyColor} 0%, ${m.horizonColor} 100%)`,
                    }}
                  >
                    <svg
                      viewBox="0 0 400 112"
                      className="h-full w-full"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      {/* Distant mountain silhouettes */}
                      <polygon
                        points="0,112 0,68 75,34 155,70 235,28 320,62 400,36 400,112"
                        fill={m.snowRidgeColor}
                        opacity="0.72"
                      />
                      {/* Foreground slope profile */}
                      {m.hasSuperpipe ? (
                        <path
                          d="M0,62 Q85,104 200,98 Q315,104 400,62 L400,112 L0,112 Z"
                          fill={m.snowBaseColor}
                        />
                      ) : (
                        <path
                          d="M0,58 Q120,74 220,86 T400,104 L400,112 L0,112 Z"
                          fill={m.snowBaseColor}
                        />
                      )}
                      {/* Stylized kicker / rail icon cue */}
                      <polygon
                        points="160,92 195,78 195,94"
                        fill={m.accentColor}
                        opacity="0.9"
                      />
                      <line
                        x1="235"
                        y1="88"
                        x2="288"
                        y2="93"
                        stroke={m.isNight ? '#FACC15' : '#334155'}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>

                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 text-[11px] font-mono font-semibold text-white bg-stone-950/70 px-2 py-0.5 rounded tabular-nums">
                      <span>{m.difficulty}</span>
                      <span aria-hidden="true">·</span>
                      <span>{m.lengthMeters}m</span>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold text-stone-900 dark:text-stone-100">
                        {m.name}
                      </h3>
                      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                        {m.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-stone-200/80 dark:border-stone-800/80 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 font-mono tabular-nums">
                      <span>
                        Best: {rec?.bestScore ? rec.bestScore.toLocaleString() : '—'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Target: {m.targetScore.toLocaleString()}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDropIn(m.id);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        selected
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                          : 'border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700'
                      }`}
                    >
                      <Play className="w-3 h-3" />
                      <span>Ski {m.name}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Split: Rider Gear Locker + Controls Reference */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Gear Locker */}
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                Rider Gear Locker
              </h2>
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                {activeGear.name}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SKI_GEAR_STYLES.map((g) => {
                const active = g.id === gearId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleSelectGear(g.id)}
                    className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                      active
                        ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-stone-900 dark:text-stone-100'
                        : 'border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-sm border border-black/15 shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${g.jacketColor} 55%, ${g.skiAccentColor} 55%)`,
                      }}
                    />
                    <span className="truncate">{g.name}</span>
                  </button>
                );
              })}
            </div>

            {selectedRecord && selectedRecord.bestTrickPoints > 0 && (
              <div className="pt-2 border-t border-stone-200/80 dark:border-stone-800/80 flex items-center justify-between text-xs text-stone-600 dark:text-stone-400">
                <span>
                  Top Trick on {activeMap.name}:{' '}
                  <strong className="text-stone-900 dark:text-stone-100">
                    {selectedRecord.bestTrickName}
                  </strong>
                </span>
                <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {selectedRecord.bestTrickPoints.toLocaleString()} pts
                </span>
              </div>
            )}
          </section>

          {/* Freestyle Controls */}
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
            <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
              Cork7 Trick & Carve Controls
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-1.5">
                <span className="text-stone-600 dark:text-stone-400">Carve / Air Spin</span>
                <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                  A / D or ← / →
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-1.5">
                <span className="text-stone-600 dark:text-stone-400">Tuck / Air Flip</span>
                <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                  W / S or ↑ / ↓
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-1.5">
                <span className="text-stone-600 dark:text-stone-400">Ollie / Lip Pop</span>
                <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                  Space
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-1.5">
                <span className="text-stone-600 dark:text-stone-400">Grabs (+Spin Speed)</span>
                <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                  J · K · L
                </span>
              </div>
              <div className="flex items-center justify-between col-span-2 pt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                <span>
                  Tip: Hold Spin + Flip together off any kicker to throw a <strong>Cork 720</strong>!
                </span>
                <span className="font-mono">C: Camera</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Active 3D Viewport (Playing / Paused / Finished)
  return (
    <div className="relative w-full h-[calc(100vh-146px)] min-h-[520px] max-h-[840px] overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-950 shadow-sm">
      {/* Isolated WebGL Canvas Container */}
      <SkiViewport
        mapId={mapId}
        gearId={gearId}
        phase={phase}
        runSeed={runSeed}
        soundEnabled={soundEnabled}
        cameraMode={cameraMode}
        inputRef={inputRef}
        onHudUpdate={setHud}
        onFinishRun={handleFinishRun}
        onTogglePause={handleTogglePause}
        onCycleCamera={handleCycleCamera}
      />

      {/* Top HUD Bar (No backdrop-blur over WebGL; solid rgba surfaces) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 sm:p-4">
        {/* Top-Left Telemetry: Map + Distance + Speed */}
        <div className="pointer-events-auto rounded-lg border border-white/15 bg-stone-950/80 px-3 py-2 text-white space-y-1.5 min-w-[180px]">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-display font-bold tracking-tight truncate">
              {activeMap.name}
            </span>
            <span className="font-mono text-[11px] text-sky-300 tabular-nums shrink-0">
              {hud.speedKmh} km/h
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-75"
              style={{ width: `${hud.progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-stone-300 tabular-nums">
            <span>{hud.distanceMeters.toLocaleString()}m</span>
            <span>{hud.lengthMeters.toLocaleString()}m</span>
          </div>
        </div>

        {/* Top-Right Telemetry: Score + Combo + Controls */}
        <div className="pointer-events-auto flex items-start gap-2">
          <div className="rounded-lg border border-white/15 bg-stone-950/80 px-3.5 py-2 text-right text-white">
            <div className="text-[10px] font-medium text-stone-300">Run Score</div>
            <div className="font-mono text-lg sm:text-xl font-bold leading-tight tabular-nums">
              {hud.score.toLocaleString()}
            </div>
            {(hud.comboScore > 0 || hud.comboMultiplier > 1) && (
              <div className="mt-0.5 font-mono text-[11px] font-semibold text-amber-300 tabular-nums">
                {hud.comboMultiplier}x · +{hud.comboScore.toLocaleString()}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-1.5">
            <button
              type="button"
              onClick={handleCycleCamera}
              title={`Camera: ${cameraMode} (C)`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-stone-950/80 px-2.5 text-xs font-medium text-white hover:bg-stone-900 transition-colors whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline capitalize">{cameraMode}</span>
            </button>

            <button
              type="button"
              onClick={() => handleDropIn(mapId)}
              title="Restart Run"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-stone-950/80 text-white hover:bg-stone-900 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleTogglePause}
              title="Pause / Parks (Esc)"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-stone-950/80 px-2.5 text-xs font-medium text-white hover:bg-stone-900 transition-colors whitespace-nowrap"
            >
              <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Menu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Mid-Air Trick & Stomp Callout (Top Center, never occluding skier) */}
      <div className="pointer-events-none absolute inset-x-0 top-20 sm:top-4 z-10 flex flex-col items-center gap-1.5 px-4">
        {hud.liveTrickText && (
          <div className="rounded-lg border border-amber-400/50 bg-stone-950/85 px-3.5 py-1.5 text-center text-white shadow-md">
            <div className="font-display text-sm sm:text-base font-bold tracking-wide text-amber-300">
              {hud.liveTrickText}
            </div>
            {(hud.spinDeg >= 90 || hud.flipDeg >= 90) && (
              <div className="font-mono text-[10px] text-stone-300 tabular-nums">
                Spin {hud.spinDeg}° · Flip {hud.flipDeg}°
              </div>
            )}
          </div>
        )}

        {hud.calloutText && !hud.liveTrickText && (
          <div
            key={hud.calloutNonce}
            className={`rounded-lg border px-3.5 py-1.5 text-center shadow-md animate-chess-modal ${
              hud.calloutTone === 'bail'
                ? 'border-red-400/60 bg-red-950/85 text-red-100'
                : hud.calloutTone === 'sketchy'
                  ? 'border-amber-400/60 bg-amber-950/85 text-amber-100'
                  : hud.calloutTone === 'gate'
                    ? 'border-sky-400/60 bg-sky-950/85 text-sky-100'
                    : 'border-emerald-400/60 bg-emerald-950/85 text-emerald-100'
            }`}
          >
            <div className="font-display text-xs sm:text-sm font-bold">
              {hud.calloutText}
            </div>
            {hud.calloutSubtext && (
              <div className="font-mono text-[10px] opacity-90 tabular-nums">
                {hud.calloutSubtext}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls Dock (Touch-Friendly + Desktop Reminder) */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-3 sm:p-4">
          {/* Left Steer & Tuck/Flip Controls */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={() => setTouchFlag('left', true)}
              onPointerUp={() => setTouchFlag('left', false)}
              onPointerLeave={() => setTouchFlag('left', false)}
              onPointerCancel={() => setTouchFlag('left', false)}
              className="h-11 w-11 rounded-lg border border-white/15 bg-stone-950/80 text-sm font-bold text-white active:bg-emerald-700 select-none"
              aria-label="Steer or spin left"
            >
              ←
            </button>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onPointerDown={() => setTouchFlag('up', true)}
                onPointerUp={() => setTouchFlag('up', false)}
                onPointerLeave={() => setTouchFlag('up', false)}
                onPointerCancel={() => setTouchFlag('up', false)}
                className="h-7 px-2.5 rounded-md border border-white/15 bg-stone-950/80 text-[11px] font-semibold text-white active:bg-emerald-700 select-none"
              >
                Tuck / Front
              </button>
              <button
                type="button"
                onPointerDown={() => setTouchFlag('down', true)}
                onPointerUp={() => setTouchFlag('down', false)}
                onPointerLeave={() => setTouchFlag('down', false)}
                onPointerCancel={() => setTouchFlag('down', false)}
                className="h-7 px-2.5 rounded-md border border-white/15 bg-stone-950/80 text-[11px] font-semibold text-white active:bg-emerald-700 select-none"
              >
                Brake / Back
              </button>
            </div>
            <button
              type="button"
              onPointerDown={() => setTouchFlag('right', true)}
              onPointerUp={() => setTouchFlag('right', false)}
              onPointerLeave={() => setTouchFlag('right', false)}
              onPointerCancel={() => setTouchFlag('right', false)}
              className="h-11 w-11 rounded-lg border border-white/15 bg-stone-950/80 text-sm font-bold text-white active:bg-emerald-700 select-none"
              aria-label="Steer or spin right"
            >
              →
            </button>
          </div>

          {/* Center Desktop Keyboard Shortcut Tip */}
          <div className="hidden lg:flex items-center gap-3 rounded-lg border border-white/15 bg-stone-950/80 px-3 py-1.5 text-[11px] text-stone-200 font-mono">
            <span>WASD / Arrows: Carve & Cork</span>
            <span aria-hidden="true">·</span>
            <span>Space: Ollie</span>
            <span aria-hidden="true">·</span>
            <span>J / K / L: Grabs</span>
          </div>

          {/* Right Jump & Grab Buttons */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={() => setTouchGrab('mute')}
              onPointerUp={() => setTouchGrab('none')}
              onPointerLeave={() => setTouchGrab('none')}
              onPointerCancel={() => setTouchGrab('none')}
              className="h-11 px-3 rounded-lg border border-white/15 bg-stone-950/80 text-xs font-semibold text-amber-300 active:bg-amber-600 active:text-white select-none"
            >
              Mute
            </button>
            <button
              type="button"
              onPointerDown={() => setTouchGrab('tail')}
              onPointerUp={() => setTouchGrab('none')}
              onPointerLeave={() => setTouchGrab('none')}
              onPointerCancel={() => setTouchGrab('none')}
              className="h-11 px-3 rounded-lg border border-white/15 bg-stone-950/80 text-xs font-semibold text-sky-300 active:bg-sky-600 active:text-white select-none"
            >
              Tail
            </button>
            <button
              type="button"
              onPointerDown={() => triggerTouchJump(true)}
              onPointerUp={() => triggerTouchJump(false)}
              onPointerLeave={() => triggerTouchJump(false)}
              onPointerCancel={() => triggerTouchJump(false)}
              className="h-11 px-4 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 active:bg-emerald-700 select-none"
            >
              Ollie
            </button>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {phase === 'paused' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-stone-700 bg-stone-900 p-5 text-white space-y-4 animate-chess-modal">
            <div>
              <div className="text-xs font-medium text-emerald-400">Run Paused</div>
              <h2 className="mt-0.5 font-display text-xl font-bold">{activeMap.name}</h2>
              <p className="mt-1 text-xs text-stone-400 font-mono tabular-nums">
                Score: {hud.score.toLocaleString()} · {hud.distanceMeters}m / {hud.lengthMeters}m
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setPhase('playing')}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume Run</span>
              </button>
              <button
                type="button"
                onClick={() => handleDropIn(mapId)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-stone-700 bg-stone-800 py-2.5 px-4 text-xs font-semibold text-stone-100 hover:bg-stone-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart Park</span>
              </button>
              <button
                type="button"
                onClick={() => setPhase('menu')}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-stone-700 bg-stone-800 py-2.5 px-4 text-xs font-semibold text-stone-100 hover:bg-stone-700 transition-colors"
              >
                <Mountain className="w-3.5 h-3.5" />
                <span>Change Mountain Park</span>
              </button>
              {onBackToHub && (
                <button
                  type="button"
                  onClick={onBackToHub}
                  className="w-full py-2 text-xs font-medium text-stone-400 hover:text-white transition-colors"
                >
                  Back to All Games
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finish Run Summary Modal */}
      {phase === 'finished' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-emerald-500/40 bg-stone-900 p-5 text-white space-y-4 animate-chess-modal">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-emerald-400">
                  {isNewBest ? 'New Mountain Record!' : 'Finish Arch Cleared'}
                </div>
                <h2 className="mt-0.5 font-display text-xl font-bold">{activeMap.name}</h2>
                <p className="mt-0.5 text-xs text-stone-400">
                  Target Score: {activeMap.targetScore.toLocaleString()} pts
                </p>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-stone-400">Final Score</div>
                <div className="font-mono text-2xl font-bold text-amber-300 tabular-nums">
                  {hud.score.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-stone-800 bg-stone-950/60 p-3 text-center">
              <div>
                <div className="text-[10px] text-stone-400 flex items-center justify-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Top Speed</span>
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                  {hud.topSpeedKmh} km/h
                </div>
              </div>
              <div>
                <div className="text-[10px] text-stone-400 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>Max Combo</span>
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                  {hud.maxCombo}x
                </div>
              </div>
              <div>
                <div className="text-[10px] text-stone-400 flex items-center justify-center gap-1">
                  <Award className="w-3 h-3 text-sky-400" />
                  <span>Rails / Clean</span>
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                  {hud.railsHit} / {hud.cleanLandings}
                </div>
              </div>
            </div>

            {hud.bestTrickName && (
              <div className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-800/40 px-3 py-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-stone-300">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span>Best Trick: <strong>{hud.bestTrickName}</strong></span>
                </span>
                <span className="font-mono font-semibold text-amber-300 tabular-nums">
                  +{hud.bestTrickPoints.toLocaleString()}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDropIn(mapId)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 px-3 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Drop In Again</span>
              </button>
              <button
                type="button"
                onClick={() => setPhase('menu')}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 py-2.5 px-3 text-xs font-semibold text-stone-100 hover:bg-stone-700 transition-colors"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Mountain Parks</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
