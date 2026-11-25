export type SkiMapId = 'the-yard' | 'forest-line' | 'aspen-pipe' | 'apex-night';

export type SkiDifficulty = 'Park' | 'Freeride' | 'Halfpipe' | 'Pro Night';

export type SkiGrabType = 'none' | 'mute' | 'safety' | 'tail' | 'japan';

export type SkiCameraMode = 'chase' | 'low' | 'wide';

export type SkiPhase = 'menu' | 'playing' | 'paused' | 'finished';

export interface SkiMapConfig {
  id: SkiMapId;
  name: string;
  subtitle: string;
  difficulty: SkiDifficulty;
  lengthMeters: number;
  slopePitch: number; // tan(pitch) drop per meter forward
  halfWidth: number;
  hasSuperpipe: boolean;
  treeDensity: number; // obstacles per 100m along sides/run
  rockDensity: number;
  skyColor: string;
  horizonColor: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  ambientSky: string;
  ambientGround: string;
  snowBaseColor: string;
  snowRidgeColor: string;
  accentColor: string;
  targetScore: number;
  isNight?: boolean;
}

export interface SkiGearStyle {
  id: string;
  name: string;
  jacketColor: string;
  pantsColor: string;
  skiBaseColor: string;
  skiAccentColor: string;
  helmetColor: string;
  visorColor: string;
}

export interface SkiKickerFeature {
  id: string;
  kind: 'kicker';
  x: number;
  z: number; // positive distance down mountain
  width: number;
  length: number;
  height: number;
  label: string;
}

export interface SkiRailFeature {
  id: string;
  kind: 'rail';
  style: 'tube' | 'box' | 'kink';
  x: number;
  z: number;
  length: number;
  width: number;
  height: number; // height above local terrain
}

export interface SkiTreeObstacle {
  id: string;
  x: number;
  z: number;
  scale: number;
  tint: number;
}

export interface SkiRockObstacle {
  id: string;
  x: number;
  z: number;
  scale: number;
}

export interface SkiGateFeature {
  id: string;
  x: number;
  z: number;
  bonus: number;
}

export interface SkiParkLayout {
  kickers: SkiKickerFeature[];
  rails: SkiRailFeature[];
  trees: SkiTreeObstacle[];
  rocks: SkiRockObstacle[];
  gates: SkiGateFeature[];
}

export interface SkiHudSnapshot {
  score: number;
  comboScore: number;
  comboMultiplier: number;
  speedKmh: number;
  distanceMeters: number;
  lengthMeters: number;
  progressPct: number;
  isAirborne: boolean;
  isGrinding: boolean;
  isBailing: boolean;
  airtime: number;
  spinDeg: number;
  flipDeg: number;
  grab: SkiGrabType;
  liveTrickText: string;
  calloutText: string;
  calloutSubtext: string;
  calloutTone: 'clean' | 'sketchy' | 'bail' | 'grind' | 'gate';
  calloutNonce: number;
  bestTrickName: string;
  bestTrickPoints: number;
  maxCombo: number;
  topSpeedKmh: number;
  railsHit: number;
  cleanLandings: number;
  bails: number;
  cameraMode: SkiCameraMode;
}

export interface SkiInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  grab: SkiGrabType;
}

export interface SkiMapRecord {
  bestScore: number;
  bestTrickName: string;
  bestTrickPoints: number;
  runsCompleted: number;
}

export interface StoredSkiProgress {
  selectedMapId: SkiMapId;
  selectedGearId: string;
  records: Partial<Record<SkiMapId, SkiMapRecord>>;
}
