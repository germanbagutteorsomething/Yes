import * as THREE from 'three';
import type { HeistVehicleId } from '../types/heist';
import { STREET_COORDS } from './cityLayout';

export function createCityAsphaltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark asphalt base
  ctx.fillStyle = '#181d26';
  ctx.fillRect(0, 0, size, size);

  // Subtle asphalt grain
  for (let i = 0; i < 6500; i++) {
    const x = (Math.sin(i * 19.3) * 0.5 + 0.5) * size;
    const y = (Math.cos(i * 47.7) * 0.5 + 0.5) * size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, 2, 2);
  }

  // City spans [-120, +120] -> 240m mapped across 1024px
  const worldToPx = (w: number) => ((w + 120) / 240) * size;
  const meterToPx = (m: number) => (m / 240) * size;

  // Sidewalk blocks (between streets)
  const blockCenters = [-72, -24, 24, 72];
  const blockPx = meterToPx(32);
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const cx = worldToPx(bx);
      const cz = worldToPx(bz);
      ctx.fillStyle = '#293241';
      ctx.fillRect(cx - blockPx / 2, cz - blockPx / 2, blockPx, blockPx);
      ctx.strokeStyle = '#3b475c';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - blockPx / 2, cz - blockPx / 2, blockPx, blockPx);
    }
  }

  // Road lane markings along streets
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 14]);
  for (const sc of STREET_COORDS) {
    const p = worldToPx(sc);
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Intersection crosswalk stripes
  ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
  for (const sx of STREET_COORDS) {
    for (const sz of STREET_COORDS) {
      const px = worldToPx(sx);
      const pz = worldToPx(sz);
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(px + k * 7 - 2, pz - meterToPx(8.2), 4, 9);
        ctx.fillRect(px + k * 7 - 2, pz + meterToPx(7.2), 4, 9);
        ctx.fillRect(px - meterToPx(8.2), pz + k * 7 - 2, 9, 4);
        ctx.fillRect(px + meterToPx(7.2), pz + k * 7 - 2, 9, 4);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function createBuildingFacadeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1b2433';
  ctx.fillRect(0, 0, 256, 512);

  // Horizontal concrete bands + lit office windows
  const cols = 8;
  const rows = 18;
  const padX = 12;
  const padY = 12;
  const cellW = (256 - padX * 2) / cols;
  const cellH = (512 - padY * 2) / rows;

  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(0, padY + r * cellH - 2, 256, 3);
    for (let c = 0; c < cols; c++) {
      const seed = Math.sin((r * 17 + c * 31) * 12.9898) * 43758.5453;
      const frac = seed - Math.floor(seed);
      if (frac > 0.34) {
        const warm = frac > 0.72;
        ctx.fillStyle = warm
          ? 'rgba(251, 191, 36, 0.72)'
          : frac > 0.5
          ? 'rgba(56, 189, 248, 0.66)'
          : 'rgba(226, 232, 240, 0.45)';
      } else {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      }
      ctx.fillRect(
        padX + c * cellW + 3,
        padY + r * cellH + 4,
        cellW - 6,
        cellH - 8
      );
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function addContactShadow(group: THREE.Group, radiusX: number, radiusZ: number) {
  const geo = new THREE.CircleGeometry(1, 20);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x04070c,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(geo, mat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.scale.set(radiusX, radiusZ, 1);
  group.add(shadow);
}

export interface PlayerRig {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  weaponBarrel: THREE.Mesh;
  muzzleFlash: THREE.Mesh;
}

export function buildPlayerRig(): PlayerRig {
  const group = new THREE.Group();
  addContactShadow(group, 0.62, 0.62);

  const jacketMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.65,
    metalness: 0.1,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    roughness: 0.42,
    metalness: 0.2,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe6b89c,
    roughness: 0.72,
    metalness: 0.02,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    roughness: 0.8,
    metalness: 0.05,
  });
  const gunMat = new THREE.MeshStandardMaterial({
    color: 0x52525b,
    roughness: 0.3,
    metalness: 0.85,
  });

  // Legs
  const legGeo = new THREE.BoxGeometry(0.24, 0.62, 0.26);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.16, 0.31, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.16, 0.31, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacketMat);
  torso.position.set(0, 0.96, 0);
  torso.castShadow = true;
  group.add(torso);

  // Crimson collar/chest stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.14, 0.38), trimMat);
  stripe.position.set(0, 1.18, 0);
  group.add(stripe);

  // Heist Duffel Bag on back (-Z is back, +Z is forward facing)
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.54, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.7, metalness: 0.12 })
  );
  bag.position.set(0, 0.98, -0.28);
  bag.castShadow = true;
  group.add(bag);

  // Head + Sunglasses visor
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
  head.position.set(0, 1.54, 0);
  head.castShadow = true;
  group.add(head);

  const mask = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.14, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2, metalness: 0.6 })
  );
  mask.position.set(0, 1.58, 0.02);
  group.add(mask);

  // Right arm & weapon extending forward (+Z)
  const gunArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.52), jacketMat);
  gunArm.position.set(0.32, 1.06, 0.28);
  group.add(gunArm);

  const weaponBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.64), gunMat);
  weaponBarrel.position.set(0.32, 1.08, 0.62);
  weaponBarrel.castShadow = true;
  group.add(weaponBarrel);

  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  muzzleFlash.position.set(0.32, 1.08, 1.0);
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  return { group, leftLeg, rightLeg, weaponBarrel, muzzleFlash };
}

export function buildCopOfficerMesh(isSwat: boolean): THREE.Group {
  const group = new THREE.Group();
  addContactShadow(group, 0.58, 0.58);

  const uniformColor = isSwat ? 0x0f172a : 0x1d4ed8;
  const vestColor = isSwat ? 0x334155 : 0x1e293b;

  const uniformMat = new THREE.MeshStandardMaterial({
    color: uniformColor,
    roughness: 0.72,
    metalness: 0.1,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: vestColor,
    roughness: 0.55,
    metalness: 0.25,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xdeb89a,
    roughness: 0.75,
  });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.26), vestMat);
  legs.position.set(0, 0.31, 0);
  legs.castShadow = true;
  group.add(legs);

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(isSwat ? 0.68 : 0.58, 0.7, 0.36),
    uniformMat
  );
  torso.position.set(0, 0.96, 0);
  torso.castShadow = true;
  group.add(torso);

  const armor = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.44, 0.4), vestMat);
  armor.position.set(0, 1.0, 0);
  group.add(armor);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skinMat);
  head.position.set(0, 1.52, 0);
  head.castShadow = true;
  group.add(head);

  // Police Cap or SWAT Helmet
  const hat = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.18, 0.44),
    new THREE.MeshStandardMaterial({
      color: isSwat ? 0x020617 : 0x1e3a8a,
      roughness: 0.35,
      metalness: 0.4,
    })
  );
  hat.position.set(0, 1.72, 0.02);
  group.add(hat);

  // Gun forward
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.14, 0.56),
    new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.3, metalness: 0.85 })
  );
  gun.position.set(0.3, 1.06, 0.45);
  group.add(gun);

  return group;
}

export interface GetawayCarRig {
  group: THREE.Group;
  bodyShell: THREE.Group;
  frontSteerPivots: THREE.Group[];
  wheelSpinGroups: THREE.Group[];
}

export function buildGetawayCarMesh(kind: HeistVehicleId, bodyColorHex: number): GetawayCarRig {
  const group = new THREE.Group();
  const bodyShell = new THREE.Group();
  group.add(bodyShell);

  const isArmored = kind === 'armored';
  const length = isArmored ? 4.3 : kind === 'muscle' ? 4.0 : 3.7;
  const width = isArmored ? 2.15 : 1.88;
  const bodyH = isArmored ? 0.92 : 0.64;

  addContactShadow(group, width * 0.66, length * 0.56);

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: bodyColorHex,
    roughness: isArmored ? 0.45 : 0.22,
    metalness: isArmored ? 0.5 : 0.72,
    clearcoat: isArmored ? 0.25 : 0.85,
    clearcoatRoughness: 0.14,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.1,
    metalness: 0.85,
  });
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.85,
    metalness: 0.15,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd4d4d8,
    roughness: 0.25,
    metalness: 0.85,
  });

  // Lower chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(width, bodyH, length), paintMat);
  chassis.position.set(0, 0.34 + bodyH / 2, 0);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  bodyShell.add(chassis);

  // Cabin
  const cabinLen = isArmored ? length * 0.68 : length * 0.48;
  const cabinH = isArmored ? 0.72 : 0.52;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.84, cabinH, cabinLen),
    glassMat
  );
  cabin.position.set(0, 0.34 + bodyH + cabinH / 2 - 0.04, isArmored ? -0.15 : -0.2);
  cabin.castShadow = true;
  bodyShell.add(cabin);

  // Roof cap
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.82, 0.1, cabinLen * 0.86),
    paintMat
  );
  roof.position.set(0, 0.34 + bodyH + cabinH, isArmored ? -0.15 : -0.2);
  bodyShell.add(roof);

  // Muscle car spoiler or armored bullbar
  if (kind === 'muscle') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.1, 0.3), paintMat);
    spoiler.position.set(0, 0.34 + bodyH + 0.16, -length / 2 + 0.22);
    bodyShell.add(spoiler);
  } else if (isArmored) {
    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.04, 0.32, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 })
    );
    bumper.position.set(0, 0.48, length / 2 + 0.06);
    bodyShell.add(bumper);
  }

  // Headlights (+Z front) & Taillights (-Z rear)
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), headMat);
    hl.position.set(sx * (width * 0.34), 0.34 + bodyH * 0.52, length / 2 + 0.02);
    bodyShell.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.08), tailMat);
    tl.position.set(sx * (width * 0.33), 0.34 + bodyH * 0.54, -length / 2 - 0.02);
    bodyShell.add(tl);
  }

  // 4 Steerable/Spinning Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.3, 10);
  rimGeo.rotateZ(Math.PI / 2);

  const zOff = length * 0.31;
  const xOff = width * 0.48;
  const frontSteerPivots: THREE.Group[] = [];
  const wheelSpinGroups: THREE.Group[] = [];

  for (const wx of [-xOff, xOff]) {
    for (const wz of [-zOff, zOff]) {
      const steerPivot = new THREE.Group();
      steerPivot.position.set(wx, 0.38, wz);
      group.add(steerPivot);

      const spinGroup = new THREE.Group();
      steerPivot.add(spinGroup);

      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.castShadow = true;
      spinGroup.add(wheel);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      spinGroup.add(rim);

      wheelSpinGroups.push(spinGroup);
      if (wz > 0) frontSteerPivots.push(steerPivot);
    }
  }

  return { group, bodyShell, frontSteerPivots, wheelSpinGroups };
}

export interface PoliceVehicleRig {
  group: THREE.Group;
  redBeacon: THREE.Mesh;
  blueBeacon: THREE.Mesh;
}

export function buildPoliceVehicleMesh(kind: 'cruiser' | 'interceptor' | 'swat'): PoliceVehicleRig {
  const isSwat = kind === 'swat';
  const isInterceptor = kind === 'interceptor';
  const length = isSwat ? 4.6 : 4.05;
  const width = isSwat ? 2.2 : 1.9;
  const bodyH = isSwat ? 1.05 : 0.64;

  const group = new THREE.Group();
  addContactShadow(group, width * 0.68, length * 0.58);

  const blackMat = new THREE.MeshPhysicalMaterial({
    color: isSwat ? 0x0f172a : 0x09090b,
    roughness: 0.25,
    metalness: 0.65,
    clearcoat: 0.7,
  });
  const whiteMat = new THREE.MeshPhysicalMaterial({
    color: isInterceptor ? 0x1e293b : 0xf1f5f9,
    roughness: 0.24,
    metalness: 0.35,
    clearcoat: 0.75,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.12,
    metalness: 0.85,
  });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, bodyH, length), blackMat);
  body.position.set(0, 0.34 + bodyH / 2, 0);
  body.castShadow = true;
  group.add(body);

  // White police doors / side panel
  if (!isSwat) {
    const doors = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.03, bodyH * 0.88, length * 0.44),
      whiteMat
    );
    doors.position.set(0, 0.34 + bodyH / 2, -0.05);
    group.add(doors);
  }

  // Cabin
  const cabinLen = isSwat ? length * 0.75 : length * 0.48;
  const cabinH = isSwat ? 0.82 : 0.52;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.84, cabinH, cabinLen),
    glassMat
  );
  cabin.position.set(0, 0.34 + bodyH + cabinH / 2 - 0.04, isSwat ? -0.2 : -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.82, 0.1, cabinLen * 0.88),
    isSwat ? blackMat : whiteMat
  );
  const roofY = 0.34 + bodyH + cabinH;
  roof.position.set(0, roofY, isSwat ? -0.2 : -0.15);
  group.add(roof);

  // Front pushbar
  const pushBar = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.78, 0.34, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.85 })
  );
  pushBar.position.set(0, 0.52, length / 2 + 0.08);
  group.add(pushBar);

  // Red + Blue Roof Lightbar
  const redMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const blueMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
  const redBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.28), redMat);
  redBeacon.position.set(-0.34, roofY + 0.14, 0.05);
  group.add(redBeacon);

  const blueBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.28), blueMat);
  blueBeacon.position.set(0.34, roofY + 0.14, 0.05);
  group.add(blueBeacon);

  // Headlights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.08), headMat);
    hl.position.set(sx * (width * 0.34), 0.34 + bodyH * 0.54, length / 2 + 0.02);
    group.add(hl);
  }

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const zOff = length * 0.32;
  const xOff = width * 0.48;
  for (const wx of [-xOff, xOff]) {
    for (const wz of [-zOff, zOff]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, 0.38, wz);
      group.add(wheel);
    }
  }

  return { group, redBeacon, blueBeacon };
}

export interface HeistBeaconRig {
  group: THREE.Group;
  ring: THREE.Mesh;
  progressRing: THREE.Mesh;
  crystal: THREE.Mesh;
  beam: THREE.Mesh;
}

export function buildHeistBeaconMesh(): HeistBeaconRig {
  const group = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 3.9, 40),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);

  const progressRing = new THREE.Mesh(
    new THREE.CircleGeometry(3.35, 36),
    new THREE.MeshBasicMaterial({
      color: 0x34d399,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  progressRing.rotation.x = -Math.PI / 2;
  progressRing.position.y = 0.05;
  progressRing.scale.set(0.01, 0.01, 1);
  group.add(progressRing);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.85, 0),
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xd97706,
      emissiveIntensity: 0.8,
      roughness: 0.18,
      metalness: 0.75,
    })
  );
  crystal.position.y = 2.4;
  group.add(crystal);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 2.2, 22, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  beam.position.y = 11;
  group.add(beam);

  return { group, ring, progressRing, crystal, beam };
}

export function buildPickupMesh(kind: 'medkit' | 'armor' | 'weapon' | 'cash'): THREE.Group {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color:
      kind === 'medkit'
        ? 0xef4444
        : kind === 'armor'
        ? 0x38bdf8
        : kind === 'weapon'
        ? 0xf59e0b
        : 0x10b981,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 20), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  if (kind === 'medkit') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.6, 0.65),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 })
    );
    box.position.y = 0.9;
    group.add(box);
    const crossA = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.16, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    crossA.position.y = 0.9;
    group.add(crossA);
    const crossB = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.42, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    crossB.position.y = 0.9;
    group.add(crossB);
  } else if (kind === 'armor') {
    const vest = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.62, 0),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.5,
        roughness: 0.25,
        metalness: 0.7,
      })
    );
    vest.position.y = 0.95;
    group.add(vest);
  } else if (kind === 'weapon') {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.45, 0.55),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xb45309,
        emissiveIntensity: 0.45,
        roughness: 0.35,
        metalness: 0.65,
      })
    );
    crate.position.y = 0.9;
    group.add(crate);
  } else {
    const cash = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.42, 0.52),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x047857,
        emissiveIntensity: 0.45,
        roughness: 0.4,
      })
    );
    cash.position.y = 0.85;
    group.add(cash);
  }

  return group;
}

export interface FirstPersonWeaponRig {
  group: THREE.Group;
  gunPivot: THREE.Group;
  barrel: THREE.Mesh;
  body: THREE.Mesh;
  accentStrip: THREE.Mesh;
  muzzleFlash: THREE.Mesh;
}

export function buildFirstPersonWeaponRig(): FirstPersonWeaponRig {
  const group = new THREE.Group();
  const gunPivot = new THREE.Group();
  gunPivot.position.set(0.26, -0.22, -0.44);
  group.add(gunPivot);

  const handMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.72 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.32, metalness: 0.8 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.25, metalness: 0.9 });
  const accentMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

  // Forearm + Grip
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.34), handMat);
  arm.position.set(0.03, -0.1, 0.16);
  arm.rotation.x = 0.2;
  gunPivot.add(arm);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.14, 0.08), handMat);
  grip.position.set(0, -0.07, 0.06);
  grip.rotation.x = -0.18;
  gunPivot.add(grip);

  // Receiver body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.28), gunMat);
  body.position.set(0, 0.01, -0.04);
  gunPivot.add(body);

  // Barrel
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.3), barrelMat);
  barrel.position.set(0, 0.025, -0.22);
  gunPivot.add(barrel);

  // Glowing iron-sight / accent rail
  const accentStrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.18), accentMat);
  accentStrip.position.set(0, 0.062, -0.06);
  gunPivot.add(accentStrip);

  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  muzzleFlash.position.set(0, 0.025, -0.4);
  muzzleFlash.visible = false;
  gunPivot.add(muzzleFlash);

  return { group, gunPivot, barrel, body, accentStrip, muzzleFlash };
}

export interface FirstPersonCockpitRig {
  group: THREE.Group;
  steeringWheel: THREE.Group;
}

export function buildFirstPersonCockpitRig(): FirstPersonCockpitRig {
  const group = new THREE.Group();

  const dashMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.75 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.6 });

  // Lower dashboard shelf
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.36), dashMat);
  dash.position.set(0, -0.44, -0.68);
  group.add(dash);

  // Glowing instrument gauge strip
  const gauge = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.06, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  gauge.position.set(0, -0.34, -0.52);
  group.add(gauge);

  // A-pillar frames left & right for cockpit depth
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.08), trimMat);
    pillar.position.set(sx * 0.68, 0.02, -0.62);
    pillar.rotation.z = sx * 0.14;
    group.add(pillar);
  }

  // Steering wheel
  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(0, -0.33, -0.45);
  steeringWheel.rotation.x = -0.32;
  group.add(steeringWheel);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 18), dashMat);
  steeringWheel.add(rim);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.025), trimMat);
  steeringWheel.add(spoke);

  return { group, steeringWheel };
}

