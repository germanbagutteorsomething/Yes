import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Car,
  ChevronLeft,
  Compass,
  Crosshair,
  DollarSign,
  Gamepad2,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Star,
  Timer,
  Trophy,
} from 'lucide-react';
import { HeistViewport } from '../heist/HeistViewport';
import {
  HEIST_WEAPON_ORDER,
  HEIST_WEAPONS,
  type HeistCameraMode,
  type HeistHudSnapshot,
  type HeistInputState,
  type HeistPhase,
  type HeistRunSummary,
  type HeistWeaponId,
  type StoredHeistProgress,
} from '../types/heist';
import { recordDailyProgress } from '../utils/arcadeProgress';
import { loadHeistProgress, recordHeistRunResult } from '../utils/storage';

interface HeistGameWorkspaceProps {
  soundEnabled: boolean;
  onBackToHub?: () => void;
  onStatsChange?: () => void;
}

const INITIAL_HUD: HeistHudSnapshot = {
  score: 0,
  cash: 0,
  survivalSec: 0,
  heistsCompleted: 0,
  copsDown: 0,
  wantedStars: 0,
  heatPct: 0,
  hp: 100,
  maxHp: 100,
  armor: 25,
  maxArmor: 100,
  dashReadyPct: 100,
  inVehicle: false,
  vehicleName: '',
  vehicleHp: 0,
  vehicleMaxHp: 100,
  vehicleSpeedKmh: 0,
  isDrifting: false,
  cameraMode: 'chase',
  pointerLocked: false,
  nearVehiclePrompt: null,
  activeWeaponId: 'pistol',
  weapons: {
    pistol: { unlocked: true, mag: 12, reserve: -1, reloading: false, reloadPct: 0 },
    smg: { unlocked: false, mag: 32, reserve: 96, reloading: false, reloadPct: 0 },
    shotgun: { unlocked: false, mag: 8, reserve: 24, reloading: false, reloadPct: 0 },
    rifle: { unlocked: false, mag: 28, reserve: 84, reloading: false, reloadPct: 0 },
  },
  activeHeist: null,
  calloutText: '',
  calloutTone: 'loot',
  calloutNonce: 0,
  playerX: 0,
  playerZ: 0,
  playerYaw: 0,
  minimapCops: [],
  minimapCars: [],
  minimapPickups: [],
};

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export const HeistGameWorkspace: React.FC<HeistGameWorkspaceProps> = ({
  soundEnabled,
  onBackToHub,
  onStatsChange,
}) => {
  const [phase, setPhase] = useState<HeistPhase>('ready');
  const [cameraMode, setCameraMode] = useState<HeistCameraMode>('chase');
  const [runNonce, setRunNonce] = useState(0);
  const [hud, setHud] = useState<HeistHudSnapshot>(INITIAL_HUD);
  const [progress, setProgress] = useState<StoredHeistProgress>(() => loadHeistProgress());
  const [lastSummary, setLastSummary] = useState<HeistRunSummary | null>(null);
  const [lastRunNewBest, setLastRunNewBest] = useState(false);
  const [lastXpEarned, setLastXpEarned] = useState(0);
  const [touchMode, setTouchMode] = useState<boolean>(() =>
    typeof window !== 'undefined' && navigator.maxTouchPoints > 0
  );
  const [visibleCallout, setVisibleCallout] = useState<string>('');
  const calloutTimerRef = useRef<number | null>(null);

  const inputRef = useRef<HeistInputState>({
    moveX: 0,
    moveY: 0,
    aimActive: false,
    aimX: 0,
    aimY: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    firing: false,
    sprint: false,
    handbrake: false,
    interactQueued: false,
    reloadQueued: false,
    weaponQueued: null,
  });

  // Track touch joystick visuals
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });
  const joyOriginRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hud.calloutText) return;
    setVisibleCallout(hud.calloutText);
    if (calloutTimerRef.current) window.clearTimeout(calloutTimerRef.current);
    calloutTimerRef.current = window.setTimeout(() => {
      setVisibleCallout('');
    }, 3000);
    return () => {
      if (calloutTimerRef.current) window.clearTimeout(calloutTimerRef.current);
    };
  }, [hud.calloutNonce, hud.calloutText]);

  const handleStartRun = useCallback(() => {
    setLastSummary(null);
    setLastRunNewBest(false);
    setLastXpEarned(0);
    setRunNonce((n) => n + 1);
    setPhase('playing');
  }, []);

  const handleTogglePause = useCallback(() => {
    setPhase((prev) => {
      if (prev === 'playing') return 'paused';
      if (prev === 'paused') return 'playing';
      return prev;
    });
  }, []);

  const handleCycleCamera = useCallback(() => {
    setCameraMode((prev) =>
      prev === 'chase' ? 'first-person' : prev === 'first-person' ? 'tactical' : 'chase'
    );
  }, []);

  const cameraModeLabel =
    cameraMode === 'chase'
      ? '3P Chase'
      : cameraMode === 'first-person'
      ? '1st Person'
      : 'Overhead';

  const handleRunEnded = useCallback(
    (summary: HeistRunSummary) => {
      setPhase('busted');
      setLastSummary(summary);

      const saved = recordHeistRunResult({
        score: summary.score,
        cash: summary.cash,
        survivalSec: summary.survivalSec,
        heistsCompleted: summary.heistsCompleted,
        copsDown: summary.copsDown,
      });
      setProgress(saved.progress);
      setLastRunNewBest(saved.isNewBest);

      const xpEarned = Math.max(
        15,
        Math.min(180, Math.round(summary.score / 85) + summary.heistsCompleted * 15)
      );
      setLastXpEarned(xpEarned);
      recordDailyProgress({
        addHeistRuns: 1,
        heistScore: summary.score,
        bonusXp: xpEarned,
      });
      onStatsChange?.();
    },
    [onStatsChange]
  );

  const selectWeapon = (wid: HeistWeaponId) => {
    if (!hud.weapons[wid]?.unlocked) return;
    inputRef.current.weaponQueued = wid;
  };

  // Auto-aim helper for touch fire button
  const handleTouchFireStart = () => {
    if (hud.minimapCops.length > 0) {
      let nearest = hud.minimapCops[0];
      let bestD = Infinity;
      for (const c of hud.minimapCops) {
        const d = Math.hypot(c.x - hud.playerX, c.z - hud.playerZ);
        if (d < bestD) {
          bestD = d;
          nearest = c;
        }
      }
      if (bestD < 45) {
        inputRef.current.aimActive = true;
        inputRef.current.aimX = nearest.x - hud.playerX;
        inputRef.current.aimY = nearest.z - hud.playerZ;
      }
    }
    inputRef.current.firing = true;
  };

  const handleTouchFireEnd = () => {
    inputRef.current.firing = false;
    inputRef.current.aimActive = false;
  };

  // Minimap coordinate helper (maps ±85m around player into 104x104 SVG box)
  const mapRadius = 85;
  const toRadar = (wx: number, wz: number) => {
    const dx = wx - hud.playerX;
    const dz = wz - hud.playerZ;
    const maxR = mapRadius;
    const dist = Math.hypot(dx, dz);
    const scale = dist > maxR ? maxR / dist : 1;
    return {
      x: 52 + ((dx * scale) / maxR) * 44,
      y: 52 + ((dz * scale) / maxR) * 44,
      clamped: dist > maxR,
    };
  };

  const heistRadarPos = hud.activeHeist
    ? toRadar(hud.playerX + hud.activeHeist.dx, hud.playerZ + hud.activeHeist.dz)
    : null;

  return (
    <div className="space-y-3">
      {/* Compact Workspace Top Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3.5 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToHub && (
            <button
              type="button"
              onClick={onBackToHub}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-2.5 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors whitespace-nowrap"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Hub</span>
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
              <h1 className="font-display text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 truncate">
                Metro Heist 3D
              </h1>
            </div>
            <div className="text-[11px] text-stone-500 dark:text-stone-400 font-mono tabular-nums">
              Best {progress.bestScore.toLocaleString()} · Max Cash ${progress.bestCash.toLocaleString()} · Longest {formatClock(progress.bestSurvivalSec)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCycleCamera}
            title="Switch camera view (V)"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              cameraMode === 'first-person'
                ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700'
            }`}
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{cameraModeLabel} [V]</span>
          </button>

          <button
            type="button"
            onClick={() => setTouchMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              touchMode
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{touchMode ? 'Touch Pad On' : 'Touch Pad'}</span>
          </button>

          {phase === 'playing' || phase === 'paused' ? (
            <>
              <button
                type="button"
                onClick={handleTogglePause}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors whitespace-nowrap"
              >
                {phase === 'paused' ? (
                  <>
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleStartRun}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Restart</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleStartRun}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Start Heist</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 3D Viewport Container */}
      <div className="relative h-[560px] sm:h-[620px] w-full rounded-xl border border-stone-800 bg-stone-950 overflow-hidden shadow-lg">
        <HeistViewport
          phase={phase}
          cameraMode={cameraMode}
          runNonce={runNonce}
          soundEnabled={soundEnabled}
          inputRef={inputRef}
          onHudUpdate={setHud}
          onRunEnded={handleRunEnded}
          onPauseRequest={handleTogglePause}
          onCameraCycle={handleCycleCamera}
        />

        {/* First-Person Centered Reticle */}
        {phase === 'playing' && cameraMode === 'first-person' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-6 w-6">
              <div className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-white/90" />
              <div className="absolute left-1/2 bottom-0 h-2 w-0.5 -translate-x-1/2 bg-white/90" />
              <div className="absolute top-1/2 left-0 h-0.5 w-2 -translate-y-1/2 bg-white/90" />
              <div className="absolute top-1/2 right-0 h-0.5 w-2 -translate-y-1/2 bg-white/90" />
              <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 bg-rose-400" />
            </div>
          </div>
        )}

        {/* Live Gameplay HUD (no backdrop-blur over WebGL) */}
        {phase !== 'ready' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
            {/* Top HUD Row */}
            <div className="flex items-start justify-between gap-3">
              {/* Top-Left: Score, Wanted Stars, Cash, Survival Timer */}
              <div className="space-y-2">
                <div className="rounded-lg border border-stone-700/90 bg-stone-950/90 px-3 py-2 text-white min-w-[200px]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-400">Score</div>
                      <div className="font-mono text-xl font-bold leading-tight tabular-nums">
                        {hud.score.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-stone-400">Cash</div>
                      <div className="font-mono text-base font-bold text-emerald-400 leading-tight tabular-nums">
                        ${hud.cash.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Wanted Stars + Heat Progress */}
                  <div className="mt-2 pt-2 border-t border-stone-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1" aria-label={`Wanted level ${hud.wantedStars} stars`}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${
                            s <= hud.wantedStars
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-stone-700'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-xs text-stone-300 tabular-nums">
                      <Timer className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                      <span>{formatClock(hud.survivalSec)}</span>
                    </div>
                  </div>
                </div>

                {/* Active Heist Objective Banner */}
                {hud.activeHeist && (
                  <div className="rounded-lg border border-amber-500/40 bg-stone-950/90 px-3 py-2 text-white max-w-[250px]">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span className="truncate text-amber-300">{hud.activeHeist.name}</span>
                      <span className="font-mono text-emerald-400 shrink-0 tabular-nums">
                        +${hud.activeHeist.reward.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-stone-400 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Compass className="w-3 h-3 text-amber-400" aria-hidden="true" />
                        <span>{hud.activeHeist.distanceMeters}m away</span>
                      </span>
                      <span>
                        {hud.activeHeist.progressPct > 0
                          ? `Robbing ${hud.activeHeist.progressPct}%`
                          : `${hud.heistsCompleted} heists`}
                      </span>
                    </div>
                    {hud.activeHeist.progressPct > 0 && (
                      <div className="mt-1.5 h-1.5 w-full rounded-xs bg-stone-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-75"
                          style={{ width: `${hud.activeHeist.progressPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Top-Right: City Radar Minimap */}
              <div className="flex flex-col items-end gap-2">
                <div className="rounded-lg border border-stone-700/90 bg-stone-950/90 p-1.5">
                  <svg
                    viewBox="0 0 104 104"
                    className="h-24 w-24 sm:h-28 sm:w-28 block bg-stone-900 rounded-sm"
                    aria-label="City tactical radar"
                  >
                    <line x1="52" y1="0" x2="52" y2="104" stroke="#1e293b" strokeWidth="1" />
                    <line x1="0" y1="52" x2="104" y2="52" stroke="#1e293b" strokeWidth="1" />
                    <circle cx="52" cy="52" r="24" fill="none" stroke="#1e293b" strokeWidth="1" />
                    <circle cx="52" cy="52" r="44" fill="none" stroke="#334155" strokeWidth="1" />

                    {/* Parked getaway cars */}
                    {hud.minimapCars.map((c, idx) => {
                      const pt = toRadar(c.x, c.z);
                      if (pt.clamped) return null;
                      return (
                        <rect
                          key={`car-${idx}`}
                          x={pt.x - 1.8}
                          y={pt.y - 1.8}
                          width="3.6"
                          height="3.6"
                          fill="#34d399"
                        />
                      );
                    })}

                    {/* Pickups */}
                    {hud.minimapPickups.map((pk, idx) => {
                      const pt = toRadar(pk.x, pk.z);
                      if (pt.clamped) return null;
                      return (
                        <circle
                          key={`pk-${idx}`}
                          cx={pt.x}
                          cy={pt.y}
                          r="2"
                          fill={pk.kind === 'medkit' ? '#f87171' : pk.kind === 'armor' ? '#38bdf8' : '#fbbf24'}
                        />
                      );
                    })}

                    {/* Police Units */}
                    {hud.minimapCops.map((cop, idx) => {
                      const pt = toRadar(cop.x, cop.z);
                      return (
                        <circle
                          key={`cop-${idx}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={cop.isVehicle ? '3' : '2'}
                          fill={cop.isVehicle ? '#3b82f6' : '#ef4444'}
                        />
                      );
                    })}

                    {/* Active Heist Target */}
                    {heistRadarPos && (
                      <polygon
                        points={`${heistRadarPos.x},${heistRadarPos.y - 4.5} ${heistRadarPos.x + 4.5},${heistRadarPos.y} ${heistRadarPos.x},${heistRadarPos.y + 4.5} ${heistRadarPos.x - 4.5},${heistRadarPos.y}`}
                        fill="#facc15"
                        stroke="#1c1917"
                        strokeWidth="1"
                      />
                    )}

                    {/* Player */}
                    <circle cx="52" cy="52" r="3.4" fill="#ffffff" stroke="#e11d48" strokeWidth="1.5" />
                  </svg>
                </div>

                {progress.bestScore > 0 && (
                  <div className="rounded-md border border-stone-700/80 bg-stone-950/90 px-2.5 py-1 font-mono text-[11px] text-amber-300 tabular-nums">
                    Best: {progress.bestScore.toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            {/* Center Event Callout */}
            {visibleCallout && (
              <div className="mx-auto self-center">
                <div
                  className={`rounded-lg border px-3.5 py-1.5 text-xs sm:text-sm font-bold shadow-md ${
                    hud.calloutTone === 'heat'
                      ? 'border-rose-500/70 bg-rose-950/95 text-rose-100'
                      : hud.calloutTone === 'danger'
                      ? 'border-orange-500/70 bg-orange-950/95 text-orange-100'
                      : hud.calloutTone === 'weapon'
                      ? 'border-sky-500/70 bg-sky-950/95 text-sky-100'
                      : 'border-emerald-500/70 bg-emerald-950/95 text-emerald-100'
                  }`}
                >
                  {visibleCallout}
                </div>
              </div>
            )}

            {/* Bottom HUD Row */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              {/* Bottom-Left: Health, Armor, Vehicle Hull & Interact Prompt */}
              <div className="space-y-2">
                {hud.nearVehiclePrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      inputRef.current.interactQueued = true;
                    }}
                    className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-400/70 bg-stone-950/95 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-stone-900"
                  >
                    <Car className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{hud.nearVehiclePrompt}</span>
                  </button>
                )}

                <div className="rounded-lg border border-stone-700/90 bg-stone-950/90 px-3 py-2 text-white w-[220px] space-y-1.5">
                  {/* HP */}
                  <div className="flex items-center gap-2">
                    <Heart className="w-3.5 h-3.5 text-rose-500 shrink-0" aria-hidden="true" />
                    <div className="h-2 flex-1 rounded-xs bg-stone-800 overflow-hidden">
                      <div
                        className="h-full bg-rose-500 transition-all duration-100"
                        style={{ width: `${Math.round((hud.hp / hud.maxHp) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] w-7 text-right tabular-nums">{hud.hp}</span>
                  </div>
                  {/* Armor */}
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                    <div className="h-2 flex-1 rounded-xs bg-stone-800 overflow-hidden">
                      <div
                        className="h-full bg-sky-400 transition-all duration-100"
                        style={{ width: `${Math.round((hud.armor / hud.maxArmor) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] w-7 text-right tabular-nums">{hud.armor}</span>
                  </div>
                  {/* Vehicle Hull when driving */}
                  {hud.inVehicle && (
                    <div className="flex items-center gap-2 pt-1 border-t border-stone-800">
                      <Car className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                      <div className="h-2 flex-1 rounded-xs bg-stone-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-400 transition-all duration-100"
                          style={{
                            width: `${Math.round((hud.vehicleHp / Math.max(1, hud.vehicleMaxHp)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-amber-300 w-16 text-right tabular-nums">
                        {hud.isDrifting ? 'DRIFT ' : ''}
                        {hud.vehicleSpeedKmh}km/h
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom-Right: 4-Slot Weapon Bar */}
              <div className="pointer-events-auto grid grid-cols-4 gap-1.5">
                {HEIST_WEAPON_ORDER.map((wid) => {
                  const spec = HEIST_WEAPONS[wid];
                  const st = hud.weapons[wid];
                  const active = hud.activeWeaponId === wid;
                  return (
                    <button
                      key={wid}
                      type="button"
                      disabled={!st?.unlocked}
                      onClick={() => selectWeapon(wid)}
                      className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors min-w-[78px] sm:min-w-[92px] ${
                        !st?.unlocked
                          ? 'border-stone-800 bg-stone-950/75 text-stone-600 cursor-not-allowed'
                          : active
                          ? 'border-amber-400 bg-stone-900/95 text-white'
                          : 'border-stone-700 bg-stone-950/90 text-stone-300 hover:border-stone-500'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-stone-400">[{spec.keyLabel}]</span>
                        {st?.unlocked && (
                          <span className="font-bold tabular-nums" style={{ color: spec.accentHex }}>
                            {st.reloading
                              ? 'RLD'
                              : `${st.mag}/${st.reserve < 0 ? '∞' : st.reserve}`}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-semibold truncate mt-0.5">
                        {spec.name.split(' ').slice(-1)[0]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Optional Touch Controls Overlay */}
        {phase === 'playing' && touchMode && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 z-10 flex items-end justify-between px-4">
            {/* Left Virtual Stick */}
            <div
              className="pointer-events-auto relative h-28 w-28 rounded-full border-2 border-stone-500/60 bg-stone-900/70 touch-none"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                joyOriginRef.current = {
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                };
              }}
              onPointerMove={(e) => {
                if (!joyOriginRef.current) return;
                const dx = e.clientX - joyOriginRef.current.x;
                const dy = e.clientY - joyOriginRef.current.y;
                const maxR = 42;
                const dist = Math.hypot(dx, dy);
                const clamped = dist > maxR ? maxR / dist : 1;
                const kx = dx * clamped;
                const ky = dy * clamped;
                setJoyKnob({ x: kx, y: ky });
                inputRef.current.moveX = kx / maxR;
                inputRef.current.moveY = ky / maxR;
              }}
              onPointerUp={() => {
                joyOriginRef.current = null;
                setJoyKnob({ x: 0, y: 0 });
                inputRef.current.moveX = 0;
                inputRef.current.moveY = 0;
              }}
              onPointerCancel={() => {
                joyOriginRef.current = null;
                setJoyKnob({ x: 0, y: 0 });
                inputRef.current.moveX = 0;
                inputRef.current.moveY = 0;
              }}
            >
              <div
                className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-300/90"
                style={{ transform: `translate(calc(-50% + ${joyKnob.x}px), calc(-50% + ${joyKnob.y}px))` }}
              />
            </div>

            {/* Right Action Buttons */}
            <div className="pointer-events-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  inputRef.current.reloadQueued = true;
                }}
                className="h-12 w-12 rounded-lg border border-stone-600 bg-stone-900/90 text-xs font-bold text-stone-200"
              >
                RLD
              </button>
              <button
                type="button"
                onClick={() => {
                  inputRef.current.interactQueued = true;
                }}
                className="h-12 w-12 rounded-lg border border-amber-500/70 bg-stone-900/90 text-xs font-bold text-amber-300"
              >
                CAR
              </button>
              <button
                type="button"
                onPointerDown={handleTouchFireStart}
                onPointerUp={handleTouchFireEnd}
                onPointerCancel={handleTouchFireEnd}
                className="h-16 w-16 rounded-full border-2 border-rose-400 bg-rose-600/90 text-xs font-bold text-white shadow-lg"
              >
                FIRE
              </button>
            </div>
          </div>
        )}

        {/* Ready / Title Overlay */}
        {phase === 'ready' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/75 p-4">
            <div className="w-full max-w-md rounded-xl border border-stone-700 bg-stone-900 p-6 text-white shadow-2xl space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
                  <span>3D ARCADE HEIST</span>
                  <span aria-hidden="true">·</span>
                  <span>NO STORY</span>
                  <span aria-hidden="true">·</span>
                  <span>PURE ESCAPE</span>
                </div>
                <h2 className="font-display text-2xl font-bold tracking-tight">Metro Heist 3D</h2>
                <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                  Hit glowing heist targets across the city, jack getaway cars, unlock stronger
                  guns, and survive escalating 5-Star police chases for as long as possible.
                </p>
              </div>

              {/* Saved Highscore Strip */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-stone-800 bg-stone-950 p-2.5">
                  <div className="text-[10px] uppercase text-stone-400">Highscore</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-amber-400 tabular-nums">
                    {progress.bestScore.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-stone-800 bg-stone-950 p-2.5">
                  <div className="text-[10px] uppercase text-stone-400">Best Cash</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-emerald-400 tabular-nums">
                    ${progress.bestCash.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-stone-800 bg-stone-950 p-2.5">
                  <div className="text-[10px] uppercase text-stone-400">Longest</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-sky-400 tabular-nums">
                    {formatClock(progress.bestSurvivalSec)}
                  </div>
                </div>
              </div>

              {/* Compact Controls */}
              <div className="rounded-lg border border-stone-800 bg-stone-950/90 p-3 text-xs text-stone-300 space-y-1 font-mono">
                <div><span className="text-white font-bold">WASD</span> Move / Drive · <span className="text-white font-bold">Shift</span> Sprint · <span className="text-white font-bold">Space</span> Jump / Drift</div>
                <div><span className="text-white font-bold">Click</span> Shoot · <span className="text-white font-bold">Right-Drag / Q·Z</span> Orbit Look · <span className="text-white font-bold">V</span> Camera</div>
                <div><span className="text-white font-bold">E</span> Enter/Exit Car · <span className="text-white font-bold">1–4</span> Guns · <span className="text-white font-bold">R</span> Reload</div>
              </div>

              <button
                type="button"
                onClick={handleStartRun}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 py-3 px-4 text-sm font-bold text-white hover:bg-rose-700 transition-colors"
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                <span>Drop In &amp; Start Heist</span>
              </button>
            </div>
          </div>
        )}

        {/* Pause Modal */}
        {phase === 'paused' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/80 p-4">
            <div className="w-full max-w-sm rounded-xl border border-stone-700 bg-stone-900 p-6 text-white space-y-4 text-center">
              <h2 className="font-display text-xl font-bold">Heist Paused</h2>
              <p className="text-xs text-stone-400 font-mono tabular-nums">
                Score {hud.score.toLocaleString()} · ${hud.cash.toLocaleString()} · {formatClock(hud.survivalSec)}
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 px-3 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Resume</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartRun}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 py-2.5 px-3 text-xs font-bold text-stone-200 hover:bg-stone-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Restart</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Busted / Game Over Modal */}
        {phase === 'busted' && lastSummary && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/85 p-4">
            <div className="w-full max-w-md rounded-xl border border-rose-500/50 bg-stone-900 p-6 text-white shadow-2xl space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-rose-400">
                    Busted by Metro PD
                  </div>
                  <h2 className="font-display text-2xl font-bold mt-0.5">Run Finished</h2>
                </div>
                {lastRunNewBest && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/60 bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300">
                    <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>New Highscore!</span>
                  </span>
                )}
              </div>

              <div className="rounded-lg border border-stone-800 bg-stone-950 p-4 text-center">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">Final Score</div>
                <div className="font-mono text-3xl font-bold text-amber-400 tabular-nums mt-0.5">
                  {lastSummary.score.toLocaleString()}
                </div>
                <div className="mt-1 font-mono text-xs text-stone-400 tabular-nums">
                  All-Time Best: {progress.bestScore.toLocaleString()}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-lg border border-stone-800 bg-stone-950 p-2.5">
                  <div className="text-[10px] text-stone-400 inline-flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-emerald-400" />
                    <span>Cash</span>
                  </div>
                  <div className="font-mono text-sm font-bold text-emerald-400 tabular-nums mt-0.5">
                    ${lastSummary.cash.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-stone-800 bg-stone-950 p-2.5">
                  <div className="text-[10px] text-stone-400">Survived</div>
                  <div className="font-mono text-sm font-bold text-sky-400 tabular-nums mt-0.5">
                    {formatClock(lastSummary.survivalSec)}
                  </div>
                </div>
                <div className="rounded-lg border border-stone-800 bg-stone-950 p-2.5">
                  <div className="text-[10px] text-stone-400">Heists</div>
                  <div className="font-mono text-sm font-bold text-amber-300 tabular-nums mt-0.5">
                    {lastSummary.heistsCompleted}
                  </div>
                </div>
                <div className="rounded-lg border border-stone-800 bg-stone-950 p-2.5">
                  <div className="text-[10px] text-stone-400">Cops Down</div>
                  <div className="font-mono text-sm font-bold text-rose-400 tabular-nums mt-0.5">
                    {lastSummary.copsDown}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-950/70 px-3 py-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-stone-300">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>SquareEight Arcade XP Earned</span>
                </span>
                <span className="font-mono font-bold text-amber-300 tabular-nums">
                  +{lastXpEarned} XP
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleStartRun}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 py-2.5 px-4 text-xs sm:text-sm font-bold text-white hover:bg-rose-700 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  <span>Run It Back</span>
                </button>
                {onBackToHub && (
                  <button
                    type="button"
                    onClick={onBackToHub}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-700 bg-stone-800 py-2.5 px-4 text-xs sm:text-sm font-semibold text-stone-200 hover:bg-stone-700 transition-colors"
                  >
                    <Gamepad2 className="w-4 h-4" aria-hidden="true" />
                    <span>All Games</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
