import type { HeistSiteDefinition, HeistVehicleId } from '../types/heist';

export interface CityBuilding {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  colorHex: number;
  accentHex: number;
  hasCrown: boolean;
}

export interface StreetLamp {
  x: number;
  z: number;
  rotY: number;
}

export interface ParkedCarSpawn {
  x: number;
  z: number;
  yaw: number;
  kind: HeistVehicleId;
  colorHex: number;
}

// City runs from -118 to +118 in X and Z.
// Streets sit along [-96, -48, 0, +48, +96] with ~14m drivable width.
export const CITY_HALF_BOUND = 114;
export const STREET_COORDS = [-96, -48, 0, 48, 96] as const;

const BLOCK_CENTERS = [-72, -24, 24, 72] as const;

const BUILDING_PALETTE = [0x1e293b, 0x263244, 0x2a2738, 0x1f2d38, 0x312e3e];
const ACCENT_PALETTE = [0x38bdf8, 0xfbbf24, 0xf43f5e, 0x34d399, 0xa855f7];

function seeded(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function generateCityLayout(): {
  buildings: CityBuilding[];
  lamps: StreetLamp[];
  heistSites: HeistSiteDefinition[];
  parkedCars: ParkedCarSpawn[];
} {
  const buildings: CityBuilding[] = [];
  let idx = 0;

  // 4x4 interior city blocks between street coordinates
  // Each block spans 32m x 32m centered at (bx, bz) leaving 16m street+sidewalk corridors
  for (let gx = 0; gx < BLOCK_CENTERS.length; gx++) {
    for (let gz = 0; gz < BLOCK_CENTERS.length; gz++) {
      const bx = BLOCK_CENTERS[gx];
      const bz = BLOCK_CENTERS[gz];

      // Leave central plaza slightly more open on (0,0) corner by tucking buildings cleanly
      const subLayout = (gx + gz) % 3;
      const specs: Array<{ ox: number; oz: number; w: number; d: number; minH: number; maxH: number }> =
        subLayout === 0
          ? [
              { ox: -6.5, oz: -6.5, w: 12.5, d: 12.5, minH: 18, maxH: 38 },
              { ox: 7.0, oz: -6.0, w: 11.5, d: 13.0, minH: 13, maxH: 26 },
              { ox: -6.0, oz: 7.0, w: 13.0, d: 11.5, minH: 15, maxH: 30 },
              { ox: 7.0, oz: 7.0, w: 11.5, d: 11.5, minH: 11, maxH: 21 },
            ]
          : subLayout === 1
          ? [
              { ox: -6.5, oz: 0, w: 13.0, d: 25.0, minH: 22, maxH: 42 },
              { ox: 7.2, oz: -6.8, w: 11.2, d: 11.8, minH: 12, maxH: 24 },
              { ox: 7.2, oz: 6.8, w: 11.2, d: 11.8, minH: 14, maxH: 28 },
            ]
          : [
              { ox: 0, oz: -6.5, w: 25.0, d: 13.0, minH: 17, maxH: 35 },
              { ox: -6.8, oz: 7.2, w: 11.8, d: 11.2, minH: 12, maxH: 22 },
              { ox: 6.8, oz: 7.2, w: 11.8, d: 11.2, minH: 19, maxH: 33 },
            ];

      for (const s of specs) {
        idx += 1;
        const r1 = seeded(idx * 3.1);
        const r2 = seeded(idx * 7.7);
        const h = s.minH + r1 * (s.maxH - s.minH);
        const x = bx + s.ox;
        const z = bz + s.oz;
        buildings.push({
          id: `b-${idx}`,
          x,
          z,
          w: s.w,
          d: s.d,
          h,
          minX: x - s.w / 2,
          maxX: x + s.w / 2,
          minZ: z - s.d / 2,
          maxZ: z + s.d / 2,
          colorHex: BUILDING_PALETTE[Math.floor(r2 * BUILDING_PALETTE.length) % BUILDING_PALETTE.length],
          accentHex: ACCENT_PALETTE[Math.floor(r1 * ACCENT_PALETTE.length) % ACCENT_PALETTE.length],
          hasCrown: h > 27,
        });
      }
    }
  }

  // Streetlamps along major avenues
  const lamps: StreetLamp[] = [];
  for (const sx of STREET_COORDS) {
    for (let z = -84; z <= 84; z += 42) {
      lamps.push({ x: sx + 7.2, z, rotY: Math.PI });
      lamps.push({ x: sx - 7.2, z: z + 18, rotY: 0 });
    }
  }

  // 8 Robbable Heist Locations placed cleanly on street/plaza edges (guaranteed reachable on foot & car)
  const heistSites: HeistSiteDefinition[] = [
    { id: 'apex-bank', name: 'Apex State Bank', reward: 1800, captureSec: 2.5, x: -48, z: -12, accentHex: '#fbbf24' },
    { id: 'diamond-vault', name: 'Sterling Diamond Vault', reward: 2400, captureSec: 2.8, x: 48, z: -48, accentHex: '#38bdf8' },
    { id: 'neon-mart', name: '24/7 Neon Mart', reward: 950, captureSec: 2.0, x: -96, z: 48, accentHex: '#34d399' },
    { id: 'harbor-depot', name: 'Harbor Cash Depot', reward: 2700, captureSec: 3.0, x: 96, z: 48, accentHex: '#f59e0b' },
    { id: 'metro-pawn', name: 'Metro Pawn & Gold', reward: 1200, captureSec: 2.2, x: 0, z: 96, accentHex: '#fb7185' },
    { id: 'casino-cage', name: 'Eclipse Casino Cage', reward: 3200, captureSec: 3.1, x: 48, z: 96, accentHex: '#c084fc' },
    { id: 'tech-exchange', name: 'Cipher Tech Exchange', reward: 1600, captureSec: 2.4, x: -48, z: -96, accentHex: '#22d3ee' },
    { id: 'armored-van', name: 'Reserve Armored Van', reward: 2200, captureSec: 2.6, x: 96, z: -48, accentHex: '#facc15' },
  ];

  // Initial getaway vehicles parked neatly along avenues
  const parkedCars: ParkedCarSpawn[] = [
    { x: 6.0, z: 8.5, yaw: 0, kind: 'muscle', colorHex: 0xb91c1c },
    { x: -42.5, z: 18, yaw: Math.PI / 2, kind: 'coupe', colorHex: 0x0284c7 },
    { x: 42.5, z: -24, yaw: -Math.PI / 2, kind: 'armored', colorHex: 0x334155 },
    { x: -90.5, z: -42, yaw: 0, kind: 'muscle', colorHex: 0xd97706 },
    { x: 90.5, z: 24, yaw: Math.PI, kind: 'coupe', colorHex: 0x059669 },
    { x: 18, z: 90.5, yaw: Math.PI / 2, kind: 'muscle', colorHex: 0x7c3aed },
    { x: -24, z: -90.5, yaw: -Math.PI / 2, kind: 'coupe', colorHex: 0xe11d48 },
  ];

  return { buildings, lamps, heistSites, parkedCars };
}

export function resolveCircleCityCollision(
  x: number,
  z: number,
  radius: number,
  buildings: CityBuilding[]
): { x: number; z: number; hit: boolean; hitNormalX: number; hitNormalZ: number } {
  let nx = x;
  let nz = z;
  let hit = false;
  let hitNormalX = 0;
  let hitNormalZ = 0;

  const limit = CITY_HALF_BOUND - radius;
  if (nx < -limit) {
    nx = -limit;
    hit = true;
    hitNormalX = 1;
  } else if (nx > limit) {
    nx = limit;
    hit = true;
    hitNormalX = -1;
  }
  if (nz < -limit) {
    nz = -limit;
    hit = true;
    hitNormalZ = 1;
  } else if (nz > limit) {
    nz = limit;
    hit = true;
    hitNormalZ = -1;
  }

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    // Quick broadphase reject
    if (
      nx + radius < b.minX ||
      nx - radius > b.maxX ||
      nz + radius < b.minZ ||
      nz - radius > b.maxZ
    ) {
      continue;
    }

    const closestX = Math.max(b.minX, Math.min(nx, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(nz, b.maxZ));
    const dx = nx - closestX;
    const dz = nz - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      hit = true;
      if (distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        const ux = dx / dist;
        const uz = dz / dist;
        nx += ux * push;
        nz += uz * push;
        hitNormalX = ux;
        hitNormalZ = uz;
      } else {
        // Center fell inside AABB; push out along shallowest axis
        const penLeft = nx - b.minX;
        const penRight = b.maxX - nx;
        const penTop = nz - b.minZ;
        const penBottom = b.maxZ - nz;
        const minPen = Math.min(penLeft, penRight, penTop, penBottom);
        if (minPen === penLeft) {
          nx = b.minX - radius;
          hitNormalX = -1;
        } else if (minPen === penRight) {
          nx = b.maxX + radius;
          hitNormalX = 1;
        } else if (minPen === penTop) {
          nz = b.minZ - radius;
          hitNormalZ = -1;
        } else {
          nz = b.maxZ + radius;
          hitNormalZ = 1;
        }
      }
    }
  }

  return { x: nx, z: nz, hit, hitNormalX, hitNormalZ };
}

export function segmentIntersectsAabb(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  buildings: CityBuilding[]
): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    let t0 = 0;
    let t1 = 1;
    const p = [-dx, dx, -dz, dz];
    const q = [x1 - b.minX, b.maxX - x1, z1 - b.minZ, b.maxZ - z1];
    let intersects = true;
    for (let k = 0; k < 4; k++) {
      if (Math.abs(p[k]) < 1e-6) {
        if (q[k] < 0) {
          intersects = false;
          break;
        }
      } else {
        const t = q[k] / p[k];
        if (p[k] < 0) {
          if (t > t1) {
            intersects = false;
            break;
          }
          if (t > t0) t0 = t;
        } else {
          if (t < t0) {
            intersects = false;
            break;
          }
          if (t < t1) t1 = t;
        }
      }
    }
    if (intersects && t0 <= t1) return true;
  }
  return false;
}
