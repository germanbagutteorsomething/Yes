export type HeistWeaponId = 'pistol' | 'smg' | 'shotgun' | 'rifle';

export type HeistVehicleId = 'coupe' | 'muscle' | 'armored';

export type HeistPhase = 'ready' | 'playing' | 'paused' | 'busted';

export type HeistCameraMode = 'chase' | 'first-person' | 'tactical';

export interface HeistWeaponSpec {
  id: HeistWeaponId;
  name: string;
  keyLabel: string;
  damage: number;
  fireRateSec: number;
  bulletSpeed: number;
  pellets: number;
  spreadRad: number;
  range: number;
  magSize: number;
  reloadSec: number;
  reserveMax: number; // -1 = unlimited
  tracerColor: number;
  accentHex: string;
  unlockHint: string;
}

export const HEIST_WEAPONS: Record<HeistWeaponId, HeistWeaponSpec> = {
  pistol: {
    id: 'pistol',
    name: '9mm Pistol',
    keyLabel: '1',
    damage: 34,
    fireRateSec: 0.24,
    bulletSpeed: 64,
    pellets: 1,
    spreadRad: 0.03,
    range: 42,
    magSize: 12,
    reloadSec: 0.95,
    reserveMax: -1,
    tracerColor: 0xfef08a,
    accentHex: '#facc15',
    unlockHint: 'Starter sidearm',
  },
  smg: {
    id: 'smg',
    name: 'Street SMG',
    keyLabel: '2',
    damage: 20,
    fireRateSec: 0.085,
    bulletSpeed: 72,
    pellets: 1,
    spreadRad: 0.09,
    range: 36,
    magSize: 32,
    reloadSec: 1.15,
    reserveMax: 192,
    tracerColor: 0x38bdf8,
    accentHex: '#38bdf8',
    unlockHint: 'Heist #1 or Crate',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Pump Shotgun',
    keyLabel: '3',
    damage: 22,
    fireRateSec: 0.62,
    bulletSpeed: 60,
    pellets: 6,
    spreadRad: 0.24,
    range: 24,
    magSize: 8,
    reloadSec: 1.35,
    reserveMax: 48,
    tracerColor: 0xf97316,
    accentHex: '#fb923c',
    unlockHint: 'Heist #2 or Crate',
  },
  rifle: {
    id: 'rifle',
    name: 'Carbine Rifle',
    keyLabel: '4',
    damage: 42,
    fireRateSec: 0.125,
    bulletSpeed: 88,
    pellets: 1,
    spreadRad: 0.035,
    range: 54,
    magSize: 28,
    reloadSec: 1.25,
    reserveMax: 168,
    tracerColor: 0x34d399,
    accentHex: '#34d399',
    unlockHint: 'Heist #3 or SWAT Drop',
  },
};

export const HEIST_WEAPON_ORDER: HeistWeaponId[] = ['pistol', 'smg', 'shotgun', 'rifle'];

export interface HeistVehicleSpec {
  id: HeistVehicleId;
  name: string;
  maxSpeed: number;
  accel: number;
  turnRate: number;
  maxHp: number;
  radius: number;
  ramDamage: number;
}

export const HEIST_VEHICLE_SPECS: Record<HeistVehicleId, HeistVehicleSpec> = {
  coupe: {
    id: 'coupe',
    name: 'Street Coupe',
    maxSpeed: 28,
    accel: 34,
    turnRate: 3.1,
    maxHp: 180,
    radius: 1.9,
    ramDamage: 65,
  },
  muscle: {
    id: 'muscle',
    name: 'Crimson Muscle',
    maxSpeed: 33,
    accel: 38,
    turnRate: 2.85,
    maxHp: 230,
    radius: 2.0,
    ramDamage: 90,
  },
  armored: {
    id: 'armored',
    name: 'Armored SUV',
    maxSpeed: 25,
    accel: 28,
    turnRate: 2.4,
    maxHp: 380,
    radius: 2.25,
    ramDamage: 135,
  },
};

export interface HeistSiteDefinition {
  id: string;
  name: string;
  reward: number;
  captureSec: number;
  x: number;
  z: number;
  accentHex: string;
}

export interface HeistWeaponStateSnapshot {
  unlocked: boolean;
  mag: number;
  reserve: number;
  reloading: boolean;
  reloadPct: number;
}

export interface HeistHudSnapshot {
  score: number;
  cash: number;
  survivalSec: number;
  heistsCompleted: number;
  copsDown: number;
  wantedStars: number;
  heatPct: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  dashReadyPct: number;
  nitroPct: number;
  vehicleBoostActive: boolean;
  pitCount: number;
  inVehicle: boolean;
  vehicleName: string;
  vehicleHp: number;
  vehicleMaxHp: number;
  vehicleSpeedKmh: number;
  isDrifting: boolean;
  cameraMode: HeistCameraMode;
  pointerLocked: boolean;
  nearVehiclePrompt: string | null;
  activeWeaponId: HeistWeaponId;
  weapons: Record<HeistWeaponId, HeistWeaponStateSnapshot>;
  activeHeist: {
    name: string;
    reward: number;
    progressPct: number;
    distanceMeters: number;
    dx: number;
    dz: number;
  } | null;
  calloutText: string;
  calloutTone: 'loot' | 'heat' | 'weapon' | 'danger';
  calloutNonce: number;
  damageFlashNonce: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  minimapCops: Array<{ x: number; z: number; isVehicle: boolean }>;
  minimapCars: Array<{ x: number; z: number }>;
  minimapPickups: Array<{ x: number; z: number; kind: 'medkit' | 'armor' | 'weapon' | 'cash' }>;
}

export interface HeistRunSummary {
  score: number;
  cash: number;
  survivalSec: number;
  heistsCompleted: number;
  copsDown: number;
  maxWantedStars: number;
  pitCount: number;
}

export interface HeistInputState {
  moveX: number;
  moveY: number;
  aimActive: boolean;
  aimX: number;
  aimY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  firing: boolean;
  sprint: boolean;
  handbrake: boolean;
  interactQueued: boolean;
  reloadQueued: boolean;
  weaponQueued: HeistWeaponId | null;
}

export interface StoredHeistProgress {
  bestScore: number;
  bestCash: number;
  bestSurvivalSec: number;
  bestHeists: number;
  bestCopsDown: number;
  runsPlayed: number;
}
