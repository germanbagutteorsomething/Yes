import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Flag,
  Gamepad2,
  Ghost,
  Lock,
  Medal,
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
  SKI_PARK_OBJECTIVES,
  SKI_TRICK_BOOK,
} from '../data/skiMaps';
import { SkiViewport } from '../ski/SkiViewport';
import { ARCADE_UNLOCKABLES } from '../types/arcade';
import type {
  SkiCameraMode,
  SkiGrabType,
  SkiHudSnapshot,
  SkiInputState,
  SkiMapId,
  SkiPhase,
  SkiRunCompletionPayload,
  StoredSkiProgress,
} from '../types/ski';
import {
  isItemUnlocked,
  loadArcadeState,
  recordDailyProgress,
  unlockArcadeItem,
} from '../utils/arcadeProgress';
import {
  loadSkiProgress,
  recordSkiRunResult,
  saveSkiSelection,
  setSkiGhostEnabled,
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
  comboTimeRatio: 0,
  speedKmh: 0,
  distanceMeters: 0,
  lengthMeters: 1100,
  progressPct: 0,
  isEndless: false,
  isAirborne: false,
  isGrinding: false,
  isBailing: false,
  airtime: 0,
  spinDeg: 0,
  flipDeg: 0,
  grab: 'none',
  liveTrickText: '',
  liveTrickPoints: 0,
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
  corksLanded: 0,
  switchLandings: 0,
  trickScoreTotal: 0,
  railScoreTotal: 0,
  flowScoreTotal: 0,
  gatesCleared: 0,
  totalGates: 0,
  boostCharge: 50,
  isBoosting: false,
  ringsCollected: 0,
  closeCalls: 0,
  medalEarned: 'none',
  nextMedalLabel: 'Bronze',
  nextMedalTarget: 2500,
  ghostDeltaMeters: null,
  cameraMode: 'chase',
};

const MEDAL_STYLES: Record<
  'none' | 'bronze' | 'silver' | 'gold',
  { label: string; colorClass: string; borderClass: string }
> = {
  none: {
    label: 'No Medal',
    colorClass: 'text-stone-400',
    borderClass: 'border-stone-700',
  },
  bronze: {
    label: 'Bronze',
    colorClass: 'text-amber-500',
    borderClass: 'border-amber-600/50',
  },
  silver: {
    label: 'Silver',
    colorClass: 'text-slate-200',
    borderClass: 'border-slate-400/50',
  },
  gold: {
    label: 'Gold',
    colorClass: 'text-yellow-300',
    borderClass: 'border-yellow-400/60',
  },
};

function triggerHaptic(ms = 10) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore unsupported environments
  }
}

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
  const [newObjectivesThisRun, setNewObjectivesThisRun] = useState<string[]>([]);
  const [runEndedByWipeout, setRunEndedByWipeout] = useState<boolean>(false);
  const [lodgeGuideTab, setLodgeGuideTab] = useState<'controls' | 'tricks'>('tricks');
  const [arcadeState, setArcadeState] = useState(() => loadArcadeState());
  const [unlockNotice, setUnlockNotice] = useState<string | null>(null);
  const [touchHudOverride, setTouchHudOverride] = useState<boolean | null>(null);
  const [isTouchViewport, setIsTouchViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    return coarse || window.innerWidth < 1024;
  });

  useEffect(() => {
    const update = () => {
      const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
      setIsTouchViewport(coarse || window.innerWidth < 1024);
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const showTouchControls = touchHudOverride ?? isTouchViewport;

  const inputRef = useRef<SkiInputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    analogX: 0,
    analogY: 0,
    jumpPressed: false,
    jumpHeld: false,
    boostHeld: false,
    grab: 'none',
  });

  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const [joystickActive, setJoystickActive] = useState(false);

  const olliePointerIdRef = useRef<number | null>(null);
  const [olliePressedUi, setOlliePressedUi] = useState(false);

  const boostPointerIdRef = useRef<number | null>(null);
  const [boostPressedUi, setBoostPressedUi] = useState(false);

  const grabPointerIdRef = useRef<number | null>(null);
  const [activeGrabUi, setActiveGrabUi] = useState<SkiGrabType>('none');

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
  const currentMapBest = progress.records[mapId]?.bestScore ?? 0;

  const resetStickVisual = useCallback(() => {
    joystickPointerIdRef.current = null;
    inputRef.current.analogX = 0;
    inputRef.current.analogY = 0;
    setJoystickActive(false);
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
  }, []);

  const clearInputs = useCallback(() => {
    inputRef.current = {
      left: false,
      right: false,
      up: false,
      down: false,
      analogX: 0,
      analogY: 0,
      jumpPressed: false,
      jumpHeld: false,
      boostHeld: false,
      grab: 'none',
    };
    resetStickVisual();
    olliePointerIdRef.current = null;
    boostPointerIdRef.current = null;
    grabPointerIdRef.current = null;
    setOlliePressedUi(false);
    setBoostPressedUi(false);
    setActiveGrabUi('none');
  }, [resetStickVisual]);

  const handleDropIn = useCallback(
    (targetMapId: SkiMapId = mapId) => {
      clearInputs();
      const targetMap = getSkiMapById(targetMapId);
      setMapId(targetMapId);
      setProgress(saveSkiSelection(targetMapId, gearId));
      setHud({
        ...INITIAL_HUD,
        lengthMeters: targetMap.lengthMeters,
        isEndless: Boolean(targetMap.isEndless),
      });
      setIsNewBest(false);
      setNewObjectivesThisRun([]);
      setRunEndedByWipeout(false);
      setRunSeed((n) => n + 1);
      setPhase('playing');
    },
    [clearInputs, gearId, mapId]
  );

  const handleSelectGear = useCallback(
    (nextGearId: string) => {
      const unlocked = isItemUnlocked(arcadeState, 'ski-gear', nextGearId);
      if (!unlocked) {
        const unlockDef = ARCADE_UNLOCKABLES.find(
          (u) => u.category === 'ski-gear' && u.targetId === nextGearId
        );
        if (unlockDef) {
          const res = unlockArcadeItem(unlockDef.id);
          setArcadeState(res.state);
          if (!res.ok) {
            setUnlockNotice(res.error ?? 'Earn more Arcade XP from Daily Challenges or runs.');
            return;
          }
          setUnlockNotice(`Unlocked ${unlockDef.name}!`);
          onStatsChange?.();
        }
      } else {
        setUnlockNotice(null);
      }
      setGearId(nextGearId);
      setProgress(saveSkiSelection(mapId, nextGearId));
    },
    [arcadeState, mapId, onStatsChange]
  );

  const handleToggleGhost = useCallback(() => {
    setProgress((prev) => setSkiGhostEnabled(!prev.ghostEnabled));
  }, []);

  const handleTogglePause = useCallback(() => {
    clearInputs();
    setPhase((prev) => {
      if (prev === 'playing') return 'paused';
      if (prev === 'paused') return 'playing';
      return prev;
    });
  }, [clearInputs]);

  const handleCycleCamera = useCallback(() => {
    setCameraMode((prev) =>
      prev === 'chase'
        ? 'low'
        : prev === 'low'
          ? 'wide'
          : prev === 'wide'
            ? 'fpv'
            : 'chase'
    );
  }, []);

  const handleFinishRun = useCallback(
    (payload: SkiRunCompletionPayload) => {
      clearInputs();
      const finalSnapshot = payload.hud;
      setHud(finalSnapshot);
      setRunEndedByWipeout(Boolean(payload.finishedByWipeout));
      const res = recordSkiRunResult({
        mapId,
        score: finalSnapshot.score,
        distanceMeters: finalSnapshot.distanceMeters,
        bestTrickName: finalSnapshot.bestTrickName,
        bestTrickPoints: finalSnapshot.bestTrickPoints,
        medal: finalSnapshot.medalEarned,
        completed: true,
        ghostSamples: payload.ghostSamples,
        completedObjectiveIds: payload.completedObjectiveIds,
      });
      setProgress(res.progress);
      setIsNewBest(res.isNewBest);
      setNewObjectivesThisRun(res.newlyCompletedObjectives);

      const nextArcade = recordDailyProgress({
        addSkiRuns: 1,
        skiScore: finalSnapshot.score,
        bonusXp: 25 + res.newlyCompletedObjectives.length * 35,
      });
      setArcadeState(nextArcade);
      setPhase('finished');
      onStatsChange?.();
    },
    [clearInputs, mapId, onStatsChange]
  );

  // Analog Virtual Thumbstick Pointer Handlers (Zero-lag DOM transform + Multi-touch capture)
  const updateJoystickFromPointer = useCallback((clientX: number, clientY: number) => {
    const base = joystickBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = Math.max(36, rect.width * 0.36);

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      const scale = maxRadius / dist;
      dx *= scale;
      dy *= scale;
    }

    inputRef.current.analogX = Number((dx / maxRadius).toFixed(3));
    inputRef.current.analogY = Number((-dy / maxRadius).toFixed(3));

    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    }
  }, []);

  const handleJoystickDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      joystickPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      setJoystickActive(true);
      updateJoystickFromPointer(e.clientX, e.clientY);
    },
    [updateJoystickFromPointer]
  );

  const handleJoystickMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      updateJoystickFromPointer(e.clientX, e.clientY);
    },
    [updateJoystickFromPointer]
  );

  const handleJoystickUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if already released
      }
      resetStickVisual();
    },
    [resetStickVisual]
  );

  const handleOllieDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    olliePointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    inputRef.current.jumpPressed = true;
    inputRef.current.jumpHeld = true;
    setOlliePressedUi(true);
    triggerHaptic(12);
  }, []);

  const handleOllieUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (olliePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    olliePointerIdRef.current = null;
    inputRef.current.jumpHeld = false;
    setOlliePressedUi(false);
  }, []);

  const handleGrabDown = useCallback(
    (grab: Exclude<SkiGrabType, 'none'>) => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      grabPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      inputRef.current.grab = grab;
      setActiveGrabUi(grab);
      triggerHaptic(8);
    },
    []
  );

  const handleGrabUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (grabPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    grabPointerIdRef.current = null;
    inputRef.current.grab = 'none';
    setActiveGrabUi('none');
  }, []);

  const handleBoostDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    boostPointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    inputRef.current.boostHeld = true;
    setBoostPressedUi(true);
    triggerHaptic(10);
  }, []);

  const handleBoostUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (boostPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    boostPointerIdRef.current = null;
    inputRef.current.boostHeld = false;
    setBoostPressedUi(false);
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
                <span>5 Runs & Endless Mode</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                Cork7 Alpine Lodge
              </h1>
              <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl">
                Pick a mountain park or drop into Endless Backcountry, race your Personal Best
                Ghost, clear park objectives, and unlock pro rider gear with Arcade XP.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleToggleGhost}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  progress.ghostEnabled
                    ? 'border-sky-600/50 dark:border-sky-500/50 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200'
                    : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                }`}
              >
                <Ghost className="w-4 h-4" aria-hidden="true" />
                <span>Ghost: {progress.ghostEnabled ? 'On' : 'Off'}</span>
              </button>

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

        {/* Mountain Park & Endless Mode Selector */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-100">
              Select Mountain Park
            </h2>
            <span className="text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums">
              {activeMap.isEndless
                ? `${activeMap.name} · Infinite Descent`
                : `Selected: ${activeMap.name} (${activeMap.lengthMeters.toLocaleString()}m)`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SKI_MAPS.map((m) => {
              const selected = m.id === mapId;
              const rec = progress.records[m.id];
              const parkObjectives = SKI_PARK_OBJECTIVES[m.id] ?? [];
              const completedSet = new Set(rec?.completedObjectives ?? []);
              const hasGhost = Boolean(rec?.bestGhost && rec.bestGhost.length > 1);

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
                  className={`group flex flex-col justify-between cursor-pointer rounded-xl border p-4 transition-colors ${
                    selected
                      ? 'border-emerald-700 dark:border-emerald-500 bg-white dark:bg-stone-900 ring-1 ring-emerald-700/25 dark:ring-emerald-500/25'
                      : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-stone-300 dark:hover:border-stone-700'
                  } ${m.isEndless ? 'md:col-span-2 lg:col-span-1' : ''}`}
                >
                  <div>
                    {/* Procedural Alpine Sky & Slope Preview */}
                    <div
                      className="relative h-24 w-full overflow-hidden rounded-lg mb-3 border border-stone-200/70 dark:border-stone-800"
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
                        <polygon
                          points="0,112 0,68 75,34 155,70 235,28 320,62 400,36 400,112"
                          fill={m.snowRidgeColor}
                          opacity="0.72"
                        />
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

                      <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[11px] font-mono font-semibold text-white bg-stone-950/70 px-2 py-0.5 rounded tabular-nums">
                        <span>{m.difficulty}</span>
                        <span aria-hidden="true">·</span>
                        <span>{m.isEndless ? '∞ m' : `${m.lengthMeters}m`}</span>
                      </div>

                      {hasGhost && !m.isEndless && (
                        <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-sky-200 bg-stone-950/75 px-1.5 py-0.5 rounded">
                          <Ghost className="w-3 h-3" />
                          <span>Ghost PB</span>
                        </div>
                      )}
                    </div>

                    <h3 className="font-display text-base font-bold text-stone-900 dark:text-stone-100">
                      {m.name}
                    </h3>
                    <p className="mt-1 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                      {m.subtitle}
                    </p>

                    {/* 3 Park Objectives Checklist */}
                    <div className="mt-3 space-y-1 border-t border-stone-100 dark:border-stone-800/80 pt-2.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600 dark:text-stone-400">
                        <span>Park Objectives</span>
                        <span className="font-mono tabular-nums">
                          {completedSet.size}/{parkObjectives.length}
                        </span>
                      </div>
                      {parkObjectives.map((obj) => {
                        const done = completedSet.has(obj.id);
                        return (
                          <div
                            key={obj.id}
                            title={obj.detail}
                            className={`flex items-center gap-1.5 text-[11px] ${
                              done
                                ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {done ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Circle className="w-3.5 h-3.5 shrink-0 opacity-60" />
                            )}
                            <span className="truncate">{obj.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-stone-200/80 dark:border-stone-800/80 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 font-mono tabular-nums truncate">
                      <span>
                        Best: {rec?.bestScore ? rec.bestScore.toLocaleString() : '—'}
                      </span>
                      {m.isEndless && rec?.bestDistanceMeters ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{rec.bestDistanceMeters.toLocaleString()}m</span>
                        </>
                      ) : rec?.bestMedal && rec.bestMedal !== 'none' ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-amber-600 dark:text-amber-400 capitalize">
                            {rec.bestMedal}
                          </span>
                        </>
                      ) : null}
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
                      <span>Ski</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Split: Rider Gear Locker + Interactive Trick Book / Controls */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Gear Locker (with XP unlockable pro suits) */}
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                Rider Gear Locker
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  {arcadeState.xp} XP
                </span>
                <span aria-hidden="true" className="text-stone-300 dark:text-stone-700">·</span>
                <span className="font-medium text-stone-500 dark:text-stone-400">
                  {activeGear.name}
                </span>
              </div>
            </div>

            {unlockNotice && (
              <div className="rounded-lg border border-amber-300/70 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200">
                {unlockNotice}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SKI_GEAR_STYLES.map((g) => {
                const active = g.id === gearId;
                const unlocked = isItemUnlocked(arcadeState, 'ski-gear', g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleSelectGear(g.id)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                      active
                        ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-stone-900 dark:text-stone-100'
                        : 'border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 rounded-sm border border-black/15 shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${g.jacketColor} 55%, ${g.skiAccentColor} 55%)`,
                        }}
                      />
                      <span className="truncate">{g.name}</span>
                    </div>
                    {!unlocked && g.unlockCostXp && (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
                        <Lock className="w-2.5 h-2.5" />
                        {g.unlockCostXp}
                      </span>
                    )}
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

          {/* Trick Book & Controls Switcher */}
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                  {lodgeGuideTab === 'tricks' ? 'Cork7 Trick Book' : 'Controls Reference'}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setLodgeGuideTab('tricks')}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    lodgeGuideTab === 'tricks'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400'
                  }`}
                >
                  Trick Book
                </button>
                <button
                  type="button"
                  onClick={() => setLodgeGuideTab('controls')}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    lodgeGuideTab === 'controls'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400'
                  }`}
                >
                  Controls
                </button>
              </div>
            </div>

            {lodgeGuideTab === 'tricks' ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {SKI_TRICK_BOOK.map((entry) => (
                  <div
                    key={entry.name}
                    className="rounded-lg border border-stone-200/80 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-3 py-2 space-y-0.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {entry.name}
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                        {entry.points}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-sky-700 dark:text-sky-300">
                      {entry.controls}
                    </div>
                    <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-snug">
                      {entry.tip}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
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
                <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-1.5">
                  <span className="text-stone-600 dark:text-stone-400">Turbo Boost</span>
                  <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                    B / F
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-1.5">
                  <span className="text-stone-600 dark:text-stone-400">Camera Angle</span>
                  <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                    C
                  </span>
                </div>
                <div className="col-span-2 pt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                  Tip: Hold Spin + Flip diagonally off any kicker to throw a <strong>Cork / Rodeo</strong>, and skim trees or fly through Air Rings to charge Boost!
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // Active 3D Viewport (Playing / Paused / Finished)
  const projectedRunTotal = hud.score + hud.comboScore * hud.comboMultiplier;
  const beatingRecordLive = currentMapBest > 0 && projectedRunTotal > currentMapBest;
  const activeMedalMeta = MEDAL_STYLES[hud.medalEarned];

  return (
    <div className="relative w-full h-[calc(100dvh-118px)] sm:h-[calc(100dvh-138px)] min-h-[400px] sm:min-h-[520px] max-h-[860px] overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-950 shadow-sm touch-none select-none">
      {/* Isolated WebGL Canvas Container */}
      <SkiViewport
        mapId={mapId}
        gearId={gearId}
        phase={phase}
        runSeed={runSeed}
        soundEnabled={soundEnabled}
        cameraMode={cameraMode}
        ghostEnabled={progress.ghostEnabled}
        ghostSamples={progress.records[mapId]?.bestGhost}
        inputRef={inputRef}
        onHudUpdate={setHud}
        onFinishRun={handleFinishRun}
        onTogglePause={handleTogglePause}
        onCycleCamera={handleCycleCamera}
      />

      {/* Subtle First-Person Ski Goggle Peripheral Vignette */}
      {cameraMode === 'fpv' && phase === 'playing' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            background:
              'radial-gradient(ellipse 78% 74% at 50% 50%, rgba(0,0,0,0) 68%, rgba(12,18,30,0.42) 94%, rgba(6,10,18,0.68) 100%)',
          }}
        />
      )}

      {/* Top HUD Bar (No backdrop-blur over WebGL; solid rgba surfaces) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 sm:gap-3 p-2.5 sm:p-4">
        {/* Top-Left Telemetry: Map + Distance + Speed + Turbo Boost + Ghost Split */}
        <div className="pointer-events-auto rounded-lg border border-white/15 bg-stone-950/85 px-2.5 py-2 sm:px-3 text-white space-y-1.5 min-w-[148px] sm:min-w-[206px]">
          <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
            <span className="font-display font-bold tracking-tight truncate">
              {activeMap.name}
            </span>
            <span
              className={`font-mono text-[11px] tabular-nums shrink-0 font-semibold ${
                hud.isBoosting ? 'text-cyan-300' : 'text-sky-300'
              }`}
            >
              {hud.speedKmh} km/h
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-75"
              style={{ width: `${hud.progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 shrink-0">
              Boost
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full transition-[width] duration-75 ${
                  hud.isBoosting
                    ? 'bg-cyan-300'
                    : hud.boostCharge >= 20
                      ? 'bg-sky-400'
                      : 'bg-stone-500'
                }`}
                style={{ width: `${hud.boostCharge}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-cyan-200 tabular-nums w-7 text-right">
              {hud.boostCharge}%
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-stone-300 tabular-nums">
            <span>{hud.distanceMeters.toLocaleString()}m</span>
            {hud.ghostDeltaMeters !== null ? (
              <span
                className={
                  hud.ghostDeltaMeters >= 0 ? 'text-emerald-400 font-semibold' : 'text-sky-300 font-semibold'
                }
              >
                Ghost {hud.ghostDeltaMeters >= 0 ? `+${hud.ghostDeltaMeters}m` : `${hud.ghostDeltaMeters}m`}
              </span>
            ) : (
              <span>{hud.isEndless ? 'Endless Run' : `${hud.lengthMeters.toLocaleString()}m`}</span>
            )}
          </div>
        </div>

        {/* Top-Right Telemetry: Score + Combo Bank Timer + Medal + Quick Controls */}
        <div className="pointer-events-auto flex items-start gap-1.5 sm:gap-2">
          <div className="rounded-lg border border-white/15 bg-stone-950/85 px-3 py-1.5 sm:px-3.5 sm:py-2 text-right text-white min-w-[132px] sm:min-w-[164px]">
            <div className="flex items-center justify-end gap-2 text-[10px] font-medium">
              {hud.medalEarned !== 'none' && (
                <span className={`font-semibold ${activeMedalMeta.colorClass}`}>
                  {activeMedalMeta.label}
                </span>
              )}
              <span className="text-stone-300">Score</span>
            </div>
            <div className="font-mono text-lg sm:text-2xl font-bold leading-tight tabular-nums">
              {hud.score.toLocaleString()}
            </div>

            {hud.comboScore > 0 ? (
              <div className="mt-1 space-y-1">
                <div className="font-mono text-[11px] font-semibold text-amber-300 tabular-nums">
                  {hud.comboMultiplier}x · +{hud.comboScore.toLocaleString()}
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full bg-amber-400 transition-[width] duration-75"
                    style={{ width: `${Math.round(hud.comboTimeRatio * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-0.5 font-mono text-[10px] tabular-nums text-stone-400">
                {beatingRecordLive ? (
                  <span className="font-semibold text-emerald-400">New Record Pace</span>
                ) : currentMapBest > 0 ? (
                  <span>Best {currentMapBest.toLocaleString()}</span>
                ) : (
                  <span>
                    {hud.nextMedalLabel} {hud.nextMedalTarget.toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() =>
                setTouchHudOverride((prev) =>
                  prev === null ? !isTouchViewport : !prev
                )
              }
              title={showTouchControls ? 'Hide Touch Controls' : 'Show Touch Controls'}
              className={`inline-flex h-9 w-9 sm:w-auto items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                showTouchControls
                  ? 'border-emerald-400/50 bg-emerald-950/80 text-emerald-200'
                  : 'border-white/15 bg-stone-950/80 text-white hover:bg-stone-900'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Touch</span>
            </button>

            <button
              type="button"
              onClick={handleCycleCamera}
              title={`Camera: ${cameraMode === 'fpv' ? '1st Person' : cameraMode} (C)`}
              className={`inline-flex h-9 w-9 sm:w-auto items-center justify-center gap-1.5 rounded-lg border sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                cameraMode === 'fpv'
                  ? 'border-sky-400/60 bg-sky-950/85 text-sky-200'
                  : 'border-white/15 bg-stone-950/80 text-white hover:bg-stone-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline capitalize">
                {cameraMode === 'fpv' ? '1st Person' : cameraMode}
              </span>
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
              className="inline-flex h-9 w-9 sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-stone-950/80 sm:px-2.5 text-xs font-medium text-white hover:bg-stone-900 transition-colors whitespace-nowrap"
            >
              <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Menu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Mid-Air Trick & Stomp Callout (Top Center, never occluding skier) */}
      <div className="pointer-events-none absolute inset-x-0 top-[76px] sm:top-4 z-10 flex flex-col items-center gap-1.5 px-4">
        {hud.liveTrickText && (
          <div className="rounded-lg border border-amber-400/50 bg-stone-950/85 px-3.5 py-1.5 text-center text-white shadow-md">
            <div className="flex items-center justify-center gap-2">
              <span className="font-display text-sm sm:text-base font-bold tracking-wide text-amber-300">
                {hud.liveTrickText}
              </span>
              {hud.liveTrickPoints > 0 && (
                <span className="font-mono text-xs sm:text-sm font-bold text-emerald-300 tabular-nums">
                  +{hud.liveTrickPoints.toLocaleString()}
                </span>
              )}
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
                ? 'border-red-400/60 bg-red-950/88 text-red-100'
                : hud.calloutTone === 'sketchy'
                  ? 'border-amber-400/60 bg-amber-950/88 text-amber-100'
                  : hud.calloutTone === 'boost'
                    ? 'border-cyan-400/70 bg-cyan-950/90 text-cyan-100'
                    : hud.calloutTone === 'ring'
                      ? 'border-yellow-400/70 bg-amber-950/90 text-yellow-100'
                      : hud.calloutTone === 'gate'
                        ? 'border-sky-400/60 bg-sky-950/88 text-sky-100'
                        : 'border-emerald-400/60 bg-emerald-950/88 text-emerald-100'
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

      {/* Bottom Controls Dock: 360° Analog Thumbstick + Multi-Touch Ollie/Grab Arc */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-3 sm:p-5">
          {showTouchControls ? (
            <>
              {/* Left Thumb: 360° Proportional Analog Thumbstick (Carve, Tuck, Brake, & Cork) */}
              <div className="pointer-events-auto flex flex-col items-center gap-1 touch-none">
                <div
                  ref={joystickBaseRef}
                  onPointerDown={handleJoystickDown}
                  onPointerMove={handleJoystickMove}
                  onPointerUp={handleJoystickUp}
                  onPointerCancel={handleJoystickUp}
                  className={`relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-full border-2 transition-colors touch-none select-none ${
                    joystickActive
                      ? 'border-emerald-400/80 bg-stone-950/75'
                      : 'border-white/25 bg-stone-950/55'
                  }`}
                  aria-label="360 degree carve, tuck, and cork joystick"
                >
                  {/* Cardinal directional ticks */}
                  <span className="pointer-events-none absolute top-1.5 text-[9px] font-mono font-semibold text-stone-300/80">
                    {hud.isAirborne ? 'FLIP' : 'TUCK'}
                  </span>
                  <span className="pointer-events-none absolute bottom-1.5 text-[9px] font-mono font-semibold text-stone-300/80">
                    {hud.isAirborne ? 'BACK' : 'BRAKE'}
                  </span>
                  <span className="pointer-events-none absolute left-2 text-[10px] font-bold text-stone-300/80">
                    ←
                  </span>
                  <span className="pointer-events-none absolute right-2 text-[10px] font-bold text-stone-300/80">
                    →
                  </span>
                  <div className="pointer-events-none h-12 w-12 rounded-full border border-white/10" />

                  {/* Draggable Thumb Puck */}
                  <div
                    ref={joystickKnobRef}
                    className={`pointer-events-none flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full border shadow-lg transition-colors ${
                      joystickActive
                        ? 'border-emerald-300 bg-emerald-500/90 text-white'
                        : 'border-white/40 bg-stone-800/90 text-stone-200'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-white/85" />
                  </div>
                </div>
                <span className="text-[10px] font-mono text-white/75 bg-stone-950/65 px-2 py-0.5 rounded">
                  {hud.isAirborne ? 'Drag Diagonal = Cork' : 'Drag Stick to Carve'}
                </span>
              </div>

              {/* Center Desktop Tip (Visible only on large screens when Touch HUD is toggled ON) */}
              <div className="hidden lg:flex items-center gap-3 rounded-lg border border-white/15 bg-stone-950/80 px-3 py-1.5 text-[11px] text-stone-200 font-mono">
                <span>WASD / Arrows: Carve & Cork</span>
                <span aria-hidden="true">·</span>
                <span>Space: Ollie</span>
                <span aria-hidden="true">·</span>
                <span>J / K / L: Grabs</span>
                <span aria-hidden="true">·</span>
                <span>B / F: Boost</span>
              </div>

              {/* Right Thumb: Grab Arc + BOOST & Primary OLLIE Triggers */}
              <div className="pointer-events-auto flex flex-col items-end gap-2 touch-none">
                {/* 3 Grab Triggers */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onPointerDown={handleGrabDown('mute')}
                    onPointerUp={handleGrabUp}
                    onPointerCancel={handleGrabUp}
                    className={`h-12 min-w-[54px] px-3 rounded-xl border text-xs font-bold transition-transform touch-none select-none ${
                      activeGrabUi === 'mute'
                        ? 'scale-95 border-amber-300 bg-amber-500 text-stone-950'
                        : 'border-white/20 bg-stone-950/75 text-amber-300'
                    }`}
                  >
                    Mute
                  </button>
                  <button
                    type="button"
                    onPointerDown={handleGrabDown('tail')}
                    onPointerUp={handleGrabUp}
                    onPointerCancel={handleGrabUp}
                    className={`h-12 min-w-[54px] px-3 rounded-xl border text-xs font-bold transition-transform touch-none select-none ${
                      activeGrabUi === 'tail'
                        ? 'scale-95 border-sky-300 bg-sky-500 text-stone-950'
                        : 'border-white/20 bg-stone-950/75 text-sky-300'
                    }`}
                  >
                    Tail
                  </button>
                  <button
                    type="button"
                    onPointerDown={handleGrabDown('japan')}
                    onPointerUp={handleGrabUp}
                    onPointerCancel={handleGrabUp}
                    className={`h-12 min-w-[56px] px-3 rounded-xl border text-xs font-bold transition-transform touch-none select-none ${
                      activeGrabUi === 'japan'
                        ? 'scale-95 border-rose-300 bg-rose-500 text-white'
                        : 'border-white/20 bg-stone-950/75 text-rose-300'
                    }`}
                  >
                    Japan
                  </button>
                </div>

                {/* BOOST + Primary OLLIE Triggers */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onPointerDown={handleBoostDown}
                    onPointerUp={handleBoostUp}
                    onPointerCancel={handleBoostUp}
                    disabled={hud.boostCharge < 12 && !hud.isBoosting}
                    className={`h-16 w-[74px] sm:h-[70px] sm:w-20 rounded-2xl border-2 text-xs font-extrabold tracking-wide shadow-lg transition-transform touch-none select-none ${
                      boostPressedUi || hud.isBoosting
                        ? 'scale-95 border-cyan-200 bg-cyan-500 text-stone-950'
                        : hud.boostCharge >= 12
                          ? 'border-cyan-400/60 bg-cyan-700/90 text-white hover:bg-cyan-600'
                          : 'border-white/15 bg-stone-900/75 text-stone-500'
                    }`}
                  >
                    BOOST
                  </button>
                  <button
                    type="button"
                    onPointerDown={handleOllieDown}
                    onPointerUp={handleOllieUp}
                    onPointerCancel={handleOllieUp}
                    className={`h-16 w-24 sm:h-[70px] sm:w-28 rounded-2xl border-2 text-sm font-extrabold tracking-wide text-white shadow-lg transition-transform touch-none select-none ${
                      olliePressedUi
                        ? 'scale-95 border-emerald-200 bg-emerald-500'
                        : 'border-emerald-300/60 bg-emerald-600/95 hover:bg-emerald-500'
                    }`}
                  >
                    OLLIE
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="mx-auto flex items-center gap-3 rounded-lg border border-white/15 bg-stone-950/80 px-3.5 py-1.5 text-[11px] text-stone-200 font-mono">
              <span>WASD / Arrows: Carve & Cork</span>
              <span aria-hidden="true">·</span>
              <span>Space: Ollie</span>
              <span aria-hidden="true">·</span>
              <span>J / K / L: Mute · Tail · Japan</span>
              <span aria-hidden="true">·</span>
              <span>B / F: Boost</span>
              <span aria-hidden="true">·</span>
              <span>C: Camera</span>
            </div>
          )}
        </div>
      )}

      {/* Pause Modal */}
      {phase === 'paused' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/75 p-4">
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
                onClick={() =>
                  setTouchHudOverride((prev) =>
                    prev === null ? !isTouchViewport : !prev
                  )
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-stone-700 bg-stone-800 py-2.5 px-4 text-xs font-semibold text-stone-100 hover:bg-stone-700 transition-colors"
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>
                  On-Screen Touch Joystick: {showTouchControls ? 'On' : 'Off'}
                </span>
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

      {/* Finish Run Summary Modal with Full Score Breakdown & Objectives */}
      {phase === 'finished' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/78 p-4">
          <div className="w-full max-w-md rounded-xl border border-emerald-500/40 bg-stone-900 p-5 text-white space-y-4 animate-chess-modal max-h-full overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="text-emerald-400">
                    {isNewBest
                      ? 'New Mountain Record!'
                      : runEndedByWipeout
                        ? `Survived ${hud.distanceMeters.toLocaleString()}m`
                        : 'Finish Arch Cleared'}
                  </span>
                  {hud.medalEarned !== 'none' && (
                    <>
                      <span aria-hidden="true" className="text-stone-600">·</span>
                      <span className={`inline-flex items-center gap-1 ${activeMedalMeta.colorClass}`}>
                        <Medal className="w-3.5 h-3.5" />
                        <span>{activeMedalMeta.label} Medal</span>
                      </span>
                    </>
                  )}
                </div>
                <h2 className="mt-0.5 font-display text-xl font-bold">{activeMap.name}</h2>
                <p className="mt-0.5 text-xs text-stone-400 font-mono tabular-nums">
                  {hud.isEndless
                    ? `Distance: ${hud.distanceMeters.toLocaleString()}m · +25 XP Earned`
                    : `Silver: ${activeMap.targetScore.toLocaleString()} · Gold: ${Math.round(activeMap.targetScore * 1.6).toLocaleString()}`}
                </p>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-stone-400">Final Score</div>
                <div className="font-mono text-2xl font-bold text-amber-300 tabular-nums">
                  {hud.score.toLocaleString()}
                </div>
              </div>
            </div>

            {newObjectivesThisRun.length > 0 && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 py-2 space-y-1 text-xs">
                <div className="font-semibold text-emerald-300">
                  Objectives Cleared (+{newObjectivesThisRun.length * 35} XP)
                </div>
                {(SKI_PARK_OBJECTIVES[mapId] ?? [])
                  .filter((o) => newObjectivesThisRun.includes(o.id))
                  .map((o) => (
                    <div key={o.id} className="flex items-center gap-1.5 text-emerald-100">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{o.label}</span>
                    </div>
                  ))}
              </div>
            )}

            {/* Score Breakdown */}
            <div className="rounded-lg border border-stone-800 bg-stone-950/70 p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-stone-300">
                <span>Tricks & Corks ({hud.cleanLandings} stomped)</span>
                <span className="font-mono font-semibold tabular-nums text-white">
                  +{hud.trickScoreTotal.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-stone-300">
                <span>Rails & Boxes ({hud.railsHit} hit)</span>
                <span className="font-mono font-semibold tabular-nums text-white">
                  +{hud.railScoreTotal.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-stone-300">
                <span>
                  Flow, Rings ({hud.ringsCollected}), Close Calls ({hud.closeCalls}) & Gates ({hud.gatesCleared}/{hud.totalGates})
                </span>
                <span className="font-mono font-semibold tabular-nums text-white">
                  +{hud.flowScoreTotal.toLocaleString()}
                </span>
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
                  <span>Wipeouts</span>
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                  {hud.bails}
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
