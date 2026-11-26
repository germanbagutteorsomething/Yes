export type SkiMapId =
  | 'the-yard'
  | 'forest-line'
  | 'aspen-pipe'
  | 'apex-night'
  | 'endless';

export type SkiDifficulty = 'Park' | 'Freeride' | 'Halfpipe' | 'Pro Night' | 'Endless';

export type SkiGrabType = 'none' | 'mute' | 'safety' | 'tail' | 'japan';

export type SkiCameraMode = 'chase' | 'low' | 'wide' | 'fpv';

export type SkiPhase = 'menu' | 'playing' | 'paused' | 'finished';

/** Compact ghost frame tuple: [elapsedSec, x, y, headingRad] */
export type SkiGhostSample = [number, number, number, number];

export interface SkiObjectiveDef {
  id: string;
  label: string;
  detail: string;
}

export interface SkiTrickGuideEntry {
  name: string;
  category: 'Rotation' | 'Cork & Flip' | 'Grab' | 'Rail' | 'Style';
  points: string;
  controls: string;
  tip: string;
}

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
  isEndless?: boolean;
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
  unlockCostXp?: number;
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

export interface SkiRingCollectible {
  id: string;
  x: number;
  yOffset: number;
  z: number;
  bonus: number;
  kind: 'air' | 'slalom';
}

export interface SkiParkLayout {
  kickers: SkiKickerFeature[];
  rails: SkiRailFeature[];
  trees: SkiTreeObstacle[];
  rocks: SkiRockObstacle[];
  gates: SkiGateFeature[];
  rings: SkiRingCollectible[];
}

export type SkiMedalTier = 'none' | 'bronze' | 'silver' | 'gold';

export interface SkiHudSnapshot {
  score: number;
  comboScore: number;
  comboMultiplier: number;
  comboTimeRatio: number;
  speedKmh: number;
  distanceMeters: number;
  lengthMeters: number;
  progressPct: number;
  isEndless: boolean;
  isAirborne: boolean;
  isGrinding: boolean;
  isBailing: boolean;
  airtime: number;
  spinDeg: number;
  flipDeg: number;
  grab: SkiGrabType;
  liveTrickText: string;
  liveTrickPoints: number;
  calloutText: string;
  calloutSubtext: string;
  calloutTone: 'clean' | 'sketchy' | 'bail' | 'grind' | 'gate' | 'boost' | 'ring';
  calloutNonce: number;
  bestTrickName: string;
  bestTrickPoints: number;
  maxCombo: number;
  topSpeedKmh: number;
  railsHit: number;
  cleanLandings: number;
  bails: number;
  corksLanded: number;
  switchLandings: number;
  trickScoreTotal: number;
  railScoreTotal: number;
  flowScoreTotal: number;
  gatesCleared: number;
  totalGates: number;
  boostCharge: number;
  isBoosting: boolean;
  ringsCollected: number;
  closeCalls: number;
  medalEarned: SkiMedalTier;
  nextMedalLabel: string;
  nextMedalTarget: number;
  ghostDeltaMeters: number | null;
  cameraMode: SkiCameraMode;
}

export interface SkiRunCompletionPayload {
  hud: SkiHudSnapshot;
  ghostSamples: SkiGhostSample[];
  completedObjectiveIds: string[];
  finishedByWipeout?: boolean;
}

export interface SkiInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  analogX: number; // -1 (left) to +1 (right)
  analogY: number; // -1 (down/brake/backflip) to +1 (up/tuck/frontflip)
  jumpPressed: boolean;
  jumpHeld: boolean;
  boostHeld: boolean;
  grab: SkiGrabType;
}

export interface SkiMapRecord {
  bestScore: number;
  bestDistanceMeters?: number;
  bestTrickName: string;
  bestTrickPoints: number;
  runsCompleted: number;
  bestMedal?: SkiMedalTier;
  bestGhost?: SkiGhostSample[];
  completedObjectives?: string[];
}

export interface StoredSkiProgress {
  selectedMapId: SkiMapId;
  selectedGearId: string;
  ghostEnabled: boolean;
  records: Partial<Record<SkiMapId, SkiMapRecord>>;
}
