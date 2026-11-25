import type {
  SkiGearStyle,
  SkiKickerFeature,
  SkiMapConfig,
  SkiMapId,
  SkiParkLayout,
  SkiRailFeature,
  SkiRockObstacle,
  SkiTreeObstacle,
  SkiGateFeature,
} from '../types/ski';

export const SKI_MAPS: SkiMapConfig[] = [
  {
    id: 'the-yard',
    name: 'The Yard',
    subtitle: 'Wide sunlit groomers, smooth tabletop kickers, and beginner rails.',
    difficulty: 'Park',
    lengthMeters: 1100,
    slopePitch: 0.21,
    halfWidth: 26,
    hasSuperpipe: false,
    treeDensity: 2.2,
    rockDensity: 0.4,
    skyColor: '#5BA4E5',
    horizonColor: '#D6ECFA',
    fogDensity: 0.0048,
    sunColor: '#FFF5E1',
    sunIntensity: 2.1,
    ambientSky: '#BDE0FE',
    ambientGround: '#94A3B8',
    snowBaseColor: '#F5F9FF',
    snowRidgeColor: '#DBE8F6',
    accentColor: '#0EA5E9',
    targetScore: 8000,
  },
  {
    id: 'forest-line',
    name: 'Forest Line',
    subtitle: 'Gladed alpine pines, natural snow rollers, boulders, and stepped rails.',
    difficulty: 'Freeride',
    lengthMeters: 1300,
    slopePitch: 0.245,
    halfWidth: 25,
    hasSuperpipe: false,
    treeDensity: 5.0,
    rockDensity: 1.5,
    skyColor: '#4B8CC8',
    horizonColor: '#CFE4F5',
    fogDensity: 0.0056,
    sunColor: '#FFF0D4',
    sunIntensity: 1.9,
    ambientSky: '#A5C9EC',
    ambientGround: '#7A8C9E',
    snowBaseColor: '#F1F6FC',
    snowRidgeColor: '#CFDCEB',
    accentColor: '#10B981',
    targetScore: 14000,
  },
  {
    id: 'aspen-pipe',
    name: 'Aspen Superpipe',
    subtitle: 'Carved U-pipe canyon walls, coping rails, and massive center Big Air.',
    difficulty: 'Halfpipe',
    lengthMeters: 1350,
    slopePitch: 0.24,
    halfWidth: 24,
    hasSuperpipe: true,
    treeDensity: 1.8,
    rockDensity: 0.5,
    skyColor: '#5B6FA3',
    horizonColor: '#F6BA8E',
    fogDensity: 0.0046,
    sunColor: '#FFB370',
    sunIntensity: 2.25,
    ambientSky: '#F3B699',
    ambientGround: '#6B7794',
    snowBaseColor: '#F7F3F7',
    snowRidgeColor: '#D9D3E6',
    accentColor: '#F59E0B',
    targetScore: 20000,
  },
  {
    id: 'apex-night',
    name: 'Apex Backcountry',
    subtitle: 'Steep night-floodlit pro chute with massive booters and kinked rails.',
    difficulty: 'Pro Night',
    lengthMeters: 1500,
    slopePitch: 0.28,
    halfWidth: 24,
    hasSuperpipe: false,
    treeDensity: 4.2,
    rockDensity: 2.1,
    skyColor: '#0F1B33',
    horizonColor: '#1E3356',
    fogDensity: 0.0062,
    sunColor: '#C4DAFF',
    sunIntensity: 1.35,
    ambientSky: '#4B6B9E',
    ambientGround: '#1E293B',
    snowBaseColor: '#DCE8F7',
    snowRidgeColor: '#9DB4D4',
    accentColor: '#38BDF8',
    targetScore: 26000,
    isNight: true,
  },
];

export const SKI_GEAR_STYLES: SkiGearStyle[] = [
  {
    id: 'alpine-orange',
    name: 'Summit Orange',
    jacketColor: '#EA580C',
    pantsColor: '#1E293B',
    skiBaseColor: '#0EA5E9',
    skiAccentColor: '#FACC15',
    helmetColor: '#F8FAFC',
    visorColor: '#F59E0B',
  },
  {
    id: 'emerald-pro',
    name: 'Pine Emerald',
    jacketColor: '#059669',
    pantsColor: '#1C1917',
    skiBaseColor: '#ECFDF5',
    skiAccentColor: '#10B981',
    helmetColor: '#18181B',
    visorColor: '#34D399',
  },
  {
    id: 'glacier-cyan',
    name: 'Glacier Cobalt',
    jacketColor: '#0284C7',
    pantsColor: '#0F172A',
    skiBaseColor: '#F8FAFC',
    skiAccentColor: '#38BDF8',
    helmetColor: '#0F172A',
    visorColor: '#06B6D4',
  },
  {
    id: 'volt-gold',
    name: 'Solar Volt',
    jacketColor: '#EAB308',
    pantsColor: '#18181B',
    skiBaseColor: '#18181B',
    skiAccentColor: '#FDE047',
    helmetColor: '#F4F4F5',
    visorColor: '#F97316',
  },
  {
    id: 'crimson-peak',
    name: 'Crimson Ridge',
    jacketColor: '#DC2626',
    pantsColor: '#1F2937',
    skiBaseColor: '#111827',
    skiAccentColor: '#EF4444',
    helmetColor: '#E5E7EB',
    visorColor: '#60A5FA',
  },
  {
    id: 'midnight-stealth',
    name: 'Midnight Carbon',
    jacketColor: '#334155',
    pantsColor: '#0F172A',
    skiBaseColor: '#0F172A',
    skiAccentColor: '#38BDF8',
    helmetColor: '#1E293B',
    visorColor: '#A855F7',
  },
];

export function getSkiMapById(id: SkiMapId): SkiMapConfig {
  return SKI_MAPS.find((m) => m.id === id) ?? SKI_MAPS[0];
}

export function getSkiGearById(id: string): SkiGearStyle {
  return SKI_GEAR_STYLES.find((g) => g.id === id) ?? SKI_GEAR_STYLES[0];
}

function createRng(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Base mountain snow height at world coordinates (x lateral, z distance downhill).
 * Positive z runs down the mountain, so y decreases as z increases.
 */
export function getBaseTerrainHeight(map: SkiMapConfig, x: number, z: number): number {
  let y = -z * map.slopePitch;

  // Natural broad mountain undulations / rollers
  if (map.id === 'forest-line') {
    y += Math.sin(z * 0.032) * 1.15 + Math.cos(z * 0.015 + x * 0.08) * 0.7;
  } else if (map.id === 'apex-night') {
    y += Math.sin(z * 0.04) * 1.4 + Math.cos(x * 0.09) * 0.45;
  } else {
    y += Math.sin(z * 0.024) * 0.65;
  }

  // Superpipe sculpted halfpipe walls on Aspen Superpipe
  if (map.hasSuperpipe) {
    const absX = Math.abs(x);
    const pipeHalf = 13.5;
    if (absX > 5.5) {
      const t = Math.min(1, (absX - 5.5) / (pipeHalf - 5.5));
      y += t * t * 5.4;
    }
    if (absX > pipeHalf) {
      const bank = Math.min(1, (absX - pipeHalf) / 8);
      y += bank * 2.2;
    }
  } else {
    // Gentle natural chute walls outside main groomer edge
    const edgeStart = map.halfWidth - 4;
    const absX = Math.abs(x);
    if (absX > edgeStart) {
      const overflow = absX - edgeStart;
      y += Math.min(14, overflow * overflow * 0.14);
    }
  }

  return y;
}

/**
 * Includes kicker ramp geometry lift so skis drive cleanly up jump faces.
 */
export function getTerrainAndRampHeight(
  map: SkiMapConfig,
  layout: SkiParkLayout,
  x: number,
  z: number
): {
  height: number;
  isOnKicker: boolean;
  kicker?: SkiKickerFeature;
  kickerSlopeLift: number;
} {
  const base = getBaseTerrainHeight(map, x, z);

  for (const k of layout.kickers) {
    const halfW = k.width * 0.5;
    if (Math.abs(x - k.x) <= halfW && z >= k.z - k.length && z <= k.z) {
      const u = (z - (k.z - k.length)) / k.length; // 0 at base -> 1 at lip
      // Smooth concave transition into crisp upward lip
      const rampLift = Math.pow(u, 1.45) * k.height;
      const slopeDerivative = 1.45 * Math.pow(Math.max(0.05, u), 0.45) * (k.height / k.length);
      return {
        height: base + rampLift,
        isOnKicker: true,
        kicker: k,
        kickerSlopeLift: slopeDerivative,
      };
    }
  }

  return { height: base, isOnKicker: false, kickerSlopeLift: 0 };
}

export function getTerrainSlopeNormal(
  map: SkiMapConfig,
  layout: SkiParkLayout,
  x: number,
  z: number
): { nx: number; ny: number; nz: number } {
  const eps = 0.6;
  const hL = getTerrainAndRampHeight(map, layout, x - eps, z).height;
  const hR = getTerrainAndRampHeight(map, layout, x + eps, z).height;
  const hB = getTerrainAndRampHeight(map, layout, x, z - eps).height;
  const hF = getTerrainAndRampHeight(map, layout, x, z + eps).height;

  const dx = (hR - hL) / (2 * eps);
  const dz = (hF - hB) / (2 * eps);

  // Tangent X = (1, dx, 0), Tangent Z = (0, dz, 1) -> Normal = Z x X = (-dx, 1, -dz)
  const nx = -dx;
  const ny = 1;
  const nz = -dz;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}

export function generateParkLayout(map: SkiMapConfig): SkiParkLayout {
  const rand = createRng(`squareeight-ski-${map.id}`);
  const kickers: SkiKickerFeature[] = [];
  const rails: SkiRailFeature[] = [];
  const trees: SkiTreeObstacle[] = [];
  const rocks: SkiRockObstacle[] = [];
  const gates: SkiGateFeature[] = [];

  // Place rhythmic freestyle lines from z = 70m up to finish - 65m
  let zCursor = 65;
  let zoneIndex = 0;

  while (zCursor < map.lengthMeters - 75) {
    zoneIndex += 1;

    if (map.hasSuperpipe) {
      // Aspen Superpipe: center big air kickers alternating with coping rails near lips
      if (zoneIndex % 2 === 1) {
        const big = zoneIndex % 4 === 3;
        kickers.push({
          id: `k-${zoneIndex}`,
          kind: 'kicker',
          x: (rand() - 0.5) * 4,
          z: zCursor,
          width: big ? 8.2 : 6.8,
          length: big ? 13 : 10.5,
          height: big ? 3.5 : 2.5,
          label: big ? 'Mega Booter' : 'Park Kicker',
        });
      } else {
        // Pipe lip coping rails + center box
        const side = zoneIndex % 4 === 0 ? 1 : -1;
        rails.push({
          id: `r-pipe-${zoneIndex}`,
          kind: 'rail',
          style: 'tube',
          x: side * 12.8,
          z: zCursor,
          length: 14,
          width: 0.7,
          height: 0.75,
        });
        rails.push({
          id: `r-mid-${zoneIndex}`,
          kind: 'rail',
          style: 'box',
          x: -side * 2.5,
          z: zCursor + 12,
          length: 11,
          width: 1.4,
          height: 0.7,
        });
      }
      if (zoneIndex % 3 === 0) {
        gates.push({
          id: `g-${zoneIndex}`,
          x: (zoneIndex % 2 === 0 ? 1 : -1) * 10.5,
          z: zCursor + 24,
          bonus: 350,
        });
      }
      zCursor += 74 + rand() * 18;
    } else {
      const pattern = zoneIndex % 3;
      const laneOffset = (rand() - 0.5) * (map.halfWidth * 0.9);

      if (pattern === 1) {
        // Kicker zone (often paired with side rail)
        const isPro = map.id === 'apex-night';
        const isBig = isPro || zoneIndex % 4 === 1;
        kickers.push({
          id: `k-${zoneIndex}`,
          kind: 'kicker',
          x: laneOffset,
          z: zCursor,
          width: isBig ? 7.4 : 6.4,
          length: isBig ? 12.2 : 10,
          height: isPro ? 3.7 : isBig ? 2.8 : 2.1,
          label: isPro ? 'Apex Step-Down' : isBig ? 'Big Air' : 'Tabletop',
        });

        // Secondary rail on opposite lane
        const oppX = laneOffset > 0 ? -Math.min(10, laneOffset + 7) : Math.min(10, -laneOffset + 7);
        rails.push({
          id: `r-side-${zoneIndex}`,
          kind: 'rail',
          style: isPro ? 'kink' : 'tube',
          x: oppX,
          z: zCursor + 6,
          length: 13,
          width: 0.65,
          height: 0.85,
        });
      } else if (pattern === 2) {
        // Rail plaza
        const railStyle: SkiRailFeature['style'] =
          map.id === 'the-yard' ? 'box' : map.id === 'apex-night' ? 'kink' : 'tube';
        rails.push({
          id: `r-${zoneIndex}`,
          kind: 'rail',
          style: railStyle,
          x: laneOffset,
          z: zCursor,
          length: railStyle === 'box' ? 12 : 15,
          width: railStyle === 'box' ? 1.5 : 0.7,
          height: 0.8,
        });
        // Bonus slalom gate nearby
        gates.push({
          id: `g-${zoneIndex}`,
          x: Math.max(-map.halfWidth + 5, Math.min(map.halfWidth - 5, -laneOffset * 0.85)),
          z: zCursor + 18,
          bonus: 300,
        });
      } else {
        // Twin staggered kickers
        kickers.push({
          id: `k-a-${zoneIndex}`,
          kind: 'kicker',
          x: -7.5,
          z: zCursor,
          width: 6.4,
          length: 10.5,
          height: map.id === 'apex-night' ? 3.2 : 2.4,
          label: 'Left Lip',
        });
        kickers.push({
          id: `k-b-${zoneIndex}`,
          kind: 'kicker',
          x: 7.5,
          z: zCursor + 16,
          width: 6.4,
          length: 10.5,
          height: map.id === 'apex-night' ? 3.4 : 2.6,
          label: 'Right Lip',
        });
      }

      zCursor += map.id === 'apex-night' ? 76 + rand() * 20 : 68 + rand() * 18;
    }
  }

  // Helper to ensure obstacles don't block kicker approaches, landings, or rails
  const isNearParkFeature = (x: number, z: number, padX: number, padZ: number): boolean => {
    for (const k of kickers) {
      if (Math.abs(x - k.x) < k.width * 0.5 + padX && z > k.z - k.length - 14 && z < k.z + 24) {
        return true;
      }
    }
    for (const r of rails) {
      if (Math.abs(x - r.x) < r.width + padX && z > r.z - 12 && z < r.z + r.length + 14) {
        return true;
      }
    }
    for (const g of gates) {
      if (Math.abs(x - g.x) < 4.5 && Math.abs(z - g.z) < 8) {
        return true;
      }
    }
    return false;
  };

  // Perimeter forest framing + interior glade obstacles
  const totalPerimeterTrees = Math.floor(map.lengthMeters * 0.28);
  for (let i = 0; i < totalPerimeterTrees; i++) {
    const z = 10 + rand() * (map.lengthMeters + 40);
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (map.halfWidth + 2.5 + rand() * 22);
    trees.push({
      id: `tp-${i}`,
      x,
      z,
      scale: 0.85 + rand() * 0.65,
      tint: rand(),
    });
  }

  const runTrees = Math.floor((map.lengthMeters / 100) * map.treeDensity);
  for (let i = 0; i < runTrees; i++) {
    const z = 55 + rand() * (map.lengthMeters - 100);
    const x = (rand() - 0.5) * (map.halfWidth * 1.75);
    if (map.hasSuperpipe && Math.abs(x) < 15.5) continue;
    if (isNearParkFeature(x, z, 4.2, 6)) continue;
    trees.push({
      id: `tr-${i}`,
      x,
      z,
      scale: 0.82 + rand() * 0.48,
      tint: rand(),
    });
  }

  const runRocks = Math.floor((map.lengthMeters / 100) * map.rockDensity);
  for (let i = 0; i < runRocks; i++) {
    const z = 70 + rand() * (map.lengthMeters - 120);
    const x = (rand() - 0.5) * (map.halfWidth * 1.65);
    if (map.hasSuperpipe && Math.abs(x) < 15.5) continue;
    if (isNearParkFeature(x, z, 4.0, 6)) continue;
    rocks.push({
      id: `rk-${i}`,
      x,
      z,
      scale: 0.75 + rand() * 0.65,
    });
  }

  return { kickers, rails, trees, rocks, gates };
}
