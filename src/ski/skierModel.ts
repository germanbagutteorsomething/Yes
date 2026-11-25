import * as THREE from 'three';
import {
  getBaseTerrainHeight,
  getTerrainSlopeNormal,
} from '../data/skiMaps';
import type {
  SkiGearStyle,
  SkiGrabType,
  SkiMapConfig,
  SkiParkLayout,
} from '../types/ski';

export interface SkierRig {
  root: THREE.Group;
  carveGroup: THREE.Group;
  trickPivot: THREE.Group;
  torsoGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  skisGroup: THREE.Group;
  shadowMesh: THREE.Mesh;
  dispose: () => void;
}

export function createSnowTexture(
  baseHex: string,
  ridgeHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  // Groomed corduroy stripes running downhill (vertical in UV)
  ctx.fillStyle = ridgeHex;
  ctx.globalAlpha = 0.22;
  for (let x = 0; x < 512; x += 16) {
    ctx.fillRect(x, 0, 5, 512);
  }

  // Subtle ice & snow grain variation for velocity read
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const size = 1 + Math.random() * 2.5;
    ctx.globalAlpha = 0.08 + Math.random() * 0.14;
    ctx.fillStyle = i % 3 === 0 ? '#FFFFFF' : ridgeHex;
    ctx.fillRect(x, y, size, size * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 240);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTwinTipSkiGeometry(): THREE.BufferGeometry {
  // Side profile extruded along width for authentic upturned twin tips
  const shape = new THREE.Shape();
  shape.moveTo(-0.92, 0.08);
  shape.quadraticCurveTo(-0.78, 0.0, -0.62, 0.0);
  shape.lineTo(0.62, 0.0);
  shape.quadraticCurveTo(0.82, 0.0, 0.96, 0.1);
  shape.lineTo(0.93, 0.13);
  shape.quadraticCurveTo(0.78, 0.035, 0.62, 0.035);
  shape.lineTo(-0.62, 0.035);
  shape.quadraticCurveTo(-0.78, 0.035, -0.9, 0.11);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  // Rotate so length runs along Z, width centered on X
  geo.rotateY(Math.PI / 2);
  geo.translate(-0.06, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

export function createSkierRig(gear: SkiGearStyle): SkierRig {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const root = new THREE.Group();
  const carveGroup = new THREE.Group();
  root.add(carveGroup);

  // Center-of-mass pivot at y=0.88 so spins, flips, and corks look natural in mid-air
  const trickPivot = new THREE.Group();
  trickPivot.position.set(0, 0.88, 0);
  carveGroup.add(trickPivot);

  const skisGroup = new THREE.Group();
  skisGroup.position.set(0, -0.88, 0);
  trickPivot.add(skisGroup);

  // Materials with calibrated roughness/metalness variation
  const skiBaseMat = track(
    new THREE.MeshStandardMaterial({
      color: gear.skiBaseColor,
      roughness: 0.25,
      metalness: 0.35,
    })
  );
  const skiEdgeMat = track(
    new THREE.MeshStandardMaterial({
      color: gear.skiAccentColor,
      roughness: 0.22,
      metalness: 0.78,
    })
  );
  const bootMat = track(
    new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.42,
      metalness: 0.2,
    })
  );
  const pantsMat = track(
    new THREE.MeshStandardMaterial({
      color: gear.pantsColor,
      roughness: 0.78,
      metalness: 0.04,
    })
  );
  const jacketMat = track(
    new THREE.MeshStandardMaterial({
      color: gear.jacketColor,
      roughness: 0.72,
      metalness: 0.05,
    })
  );
  const helmetMat = track(
    new THREE.MeshStandardMaterial({
      color: gear.helmetColor,
      roughness: 0.22,
      metalness: 0.15,
    })
  );
  const visorMat = track(
    new THREE.MeshStandardMaterial({
      color: gear.visorColor,
      roughness: 0.08,
      metalness: 0.92,
      envMapIntensity: 1.4,
    })
  );
  const poleMat = track(
    new THREE.MeshStandardMaterial({
      color: '#E2E8F0',
      roughness: 0.28,
      metalness: 0.82,
    })
  );
  const gloveMat = track(
    new THREE.MeshStandardMaterial({
      color: '#0F172A',
      roughness: 0.68,
      metalness: 0.05,
    })
  );

  // Twin-tip Skis + Bindings
  const skiGeo = track(createTwinTipSkiGeometry());
  const bindingGeo = track(new THREE.BoxGeometry(0.11, 0.06, 0.34));
  const stripeGeo = track(new THREE.BoxGeometry(0.08, 0.012, 1.32));

  [-0.2, 0.2].forEach((xOffset) => {
    const ski = new THREE.Mesh(skiGeo, skiBaseMat);
    ski.position.set(xOffset, 0, 0);
    ski.castShadow = true;
    skisGroup.add(ski);

    const stripe = new THREE.Mesh(stripeGeo, skiEdgeMat);
    stripe.position.set(xOffset, 0.042, 0.02);
    skisGroup.add(stripe);

    const binding = new THREE.Mesh(bindingGeo, skiEdgeMat);
    binding.position.set(xOffset, 0.06, -0.02);
    binding.castShadow = true;
    skisGroup.add(binding);
  });

  // Articulated Legs + Boots
  const bootGeo = track(new THREE.BoxGeometry(0.13, 0.18, 0.28));
  const calfGeo = track(new THREE.CapsuleGeometry(0.085, 0.26, 4, 8));
  const thighGeo = track(new THREE.CapsuleGeometry(0.1, 0.26, 4, 8));

  const buildLeg = (xOffset: number) => {
    const leg = new THREE.Group();
    leg.position.set(xOffset, -0.82, 0);

    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, 0.09, 0.02);
    boot.castShadow = true;
    leg.add(boot);

    const calf = new THREE.Mesh(calfGeo, pantsMat);
    calf.position.set(0, 0.3, 0.02);
    calf.rotation.x = 0.18;
    calf.castShadow = true;
    leg.add(calf);

    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.set(0, 0.56, -0.04);
    thigh.rotation.x = -0.24;
    thigh.castShadow = true;
    leg.add(thigh);

    trickPivot.add(leg);
    return leg;
  };

  const leftLeg = buildLeg(-0.18);
  const rightLeg = buildLeg(0.18);

  // Upper Body Torso + Backpack + Helmet + Visor
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, -0.14, -0.04);
  trickPivot.add(torsoGroup);

  const jacketGeo = track(new THREE.CapsuleGeometry(0.2, 0.34, 6, 10));
  const jacket = new THREE.Mesh(jacketGeo, jacketMat);
  jacket.position.set(0, 0.25, 0);
  jacket.scale.set(1.1, 1, 0.76);
  jacket.castShadow = true;
  torsoGroup.add(jacket);

  const collarGeo = track(new THREE.CylinderGeometry(0.13, 0.16, 0.12, 10));
  const collar = new THREE.Mesh(collarGeo, gloveMat);
  collar.position.set(0, 0.49, 0.02);
  torsoGroup.add(collar);

  const packGeo = track(new THREE.BoxGeometry(0.26, 0.32, 0.12));
  const backpack = new THREE.Mesh(packGeo, bootMat);
  backpack.position.set(0, 0.28, -0.16);
  backpack.castShadow = true;
  torsoGroup.add(backpack);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.65, 0.03);
  torsoGroup.add(headGroup);

  const helmetGeo = track(new THREE.SphereGeometry(0.175, 16, 14));
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.scale.set(0.95, 1.0, 1.06);
  helmet.castShadow = true;
  headGroup.add(helmet);

  const visorGeo = track(new THREE.BoxGeometry(0.24, 0.095, 0.12));
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, -0.015, 0.125);
  headGroup.add(visor);

  // Arms + Gloves + Ski Poles
  const sleeveGeo = track(new THREE.CapsuleGeometry(0.068, 0.36, 4, 8));
  const gloveGeo = track(new THREE.SphereGeometry(0.065, 10, 8));
  const poleGeo = track(new THREE.CylinderGeometry(0.011, 0.008, 1.02, 6));
  const basketGeo = track(new THREE.RingGeometry(0.015, 0.045, 10));

  const buildArm = (side: -1 | 1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 0.42, 0.02);

    const sleeve = new THREE.Mesh(sleeveGeo, jacketMat);
    sleeve.position.set(side * 0.05, -0.18, 0.1);
    sleeve.rotation.x = -0.55;
    sleeve.rotation.z = side * 0.22;
    sleeve.castShadow = true;
    arm.add(sleeve);

    const glove = new THREE.Mesh(gloveGeo, gloveMat);
    glove.position.set(side * 0.1, -0.34, 0.22);
    arm.add(glove);

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(side * 0.12, -0.52, -0.18);
    pole.rotation.x = 0.85;
    arm.add(pole);

    const basket = new THREE.Mesh(basketGeo, skiEdgeMat);
    basket.position.set(side * 0.12, -0.82, -0.52);
    basket.rotation.x = Math.PI / 2;
    arm.add(basket);

    torsoGroup.add(arm);
    return arm;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Soft Ground Contact Shadow
  const shadowTex = track(createContactShadowTexture());
  const shadowGeo = track(new THREE.PlaneGeometry(1.9, 2.3));
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.42,
    })
  );
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.03;

  return {
    root,
    carveGroup,
    trickPivot,
    torsoGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    skisGroup,
    shadowMesh,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function updateSkierPose(
  rig: SkierRig,
  params: {
    tuck: boolean;
    grab: SkiGrabType;
    isAirborne: boolean;
    isGrinding: boolean;
    dt: number;
  }
) {
  const { tuck, grab, isAirborne, isGrinding, dt } = params;
  const lambda = 12;

  let targetTorsoPitch = 0.22;
  let targetTorsoY = -0.14;
  let targetSkisY = -0.88;
  let targetLeftArmX = 0;
  let targetRightArmX = 0;
  let targetLeftArmZ = 0;
  let targetRightArmZ = 0;
  let targetSkisRoll = 0;
  let targetSkisYaw = 0;

  if (isAirborne && grab !== 'none') {
    targetTorsoPitch = 0.72;
    targetTorsoY = -0.28;
    targetSkisY = -0.62;
    if (grab === 'mute') {
      targetRightArmX = -0.95;
      targetRightArmZ = 0.45;
      targetLeftArmZ = -0.55;
      targetSkisRoll = 0.25;
    } else if (grab === 'safety') {
      targetLeftArmX = -0.85;
      targetLeftArmZ = -0.15;
      targetRightArmZ = 0.55;
    } else if (grab === 'tail') {
      targetRightArmX = 0.65;
      targetLeftArmZ = -0.5;
      targetSkisRoll = -0.22;
    } else if (grab === 'japan') {
      targetLeftArmX = -0.75;
      targetSkisYaw = 0.42;
      targetSkisRoll = 0.35;
    }
  } else if (isGrinding) {
    targetTorsoPitch = 0.16;
    targetTorsoY = -0.18;
    targetSkisYaw = Math.PI / 2 - 0.15; // sideways boardslide style
    targetLeftArmZ = -0.65;
    targetRightArmZ = 0.65;
  } else if (tuck) {
    targetTorsoPitch = 0.68;
    targetTorsoY = -0.28;
    targetSkisY = -0.78;
    targetLeftArmX = -0.45;
    targetRightArmX = -0.45;
  }

  rig.torsoGroup.rotation.x = THREE.MathUtils.damp(
    rig.torsoGroup.rotation.x,
    targetTorsoPitch,
    lambda,
    dt
  );
  rig.torsoGroup.position.y = THREE.MathUtils.damp(
    rig.torsoGroup.position.y,
    targetTorsoY,
    lambda,
    dt
  );
  rig.skisGroup.position.y = THREE.MathUtils.damp(
    rig.skisGroup.position.y,
    targetSkisY,
    lambda,
    dt
  );
  rig.skisGroup.rotation.z = THREE.MathUtils.damp(
    rig.skisGroup.rotation.z,
    targetSkisRoll,
    lambda,
    dt
  );
  rig.skisGroup.rotation.y = THREE.MathUtils.damp(
    rig.skisGroup.rotation.y,
    targetSkisYaw,
    lambda,
    dt
  );
  rig.leftArm.rotation.x = THREE.MathUtils.damp(
    rig.leftArm.rotation.x,
    targetLeftArmX,
    lambda,
    dt
  );
  rig.rightArm.rotation.x = THREE.MathUtils.damp(
    rig.rightArm.rotation.x,
    targetRightArmX,
    lambda,
    dt
  );
  rig.leftArm.rotation.z = THREE.MathUtils.damp(
    rig.leftArm.rotation.z,
    targetLeftArmZ,
    lambda,
    dt
  );
  rig.rightArm.rotation.z = THREE.MathUtils.damp(
    rig.rightArm.rotation.z,
    targetRightArmZ,
    lambda,
    dt
  );
}

export interface BuiltParkScene {
  group: THREE.Group;
  dispose: () => void;
}

export function buildMountainEnvironment(
  map: SkiMapConfig,
  layout: SkiParkLayout,
  maxAnisotropy: number
): BuiltParkScene {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // 1. Mountain Terrain Mesh extending well past playable width
  const totalWidth = (map.halfWidth + 32) * 2;
  const totalLength = map.lengthMeters + 130;
  const segX = 64;
  const segZ = Math.min(420, Math.round(totalLength / 4));

  const terrainGeo = track(new THREE.PlaneGeometry(totalWidth, totalLength, segX, segZ));
  terrainGeo.rotateX(-Math.PI / 2);
  // Shift so z goes from -35 to map.lengthMeters + 95
  terrainGeo.translate(0, 0, totalLength * 0.5 - 35);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const snowColor = new THREE.Color(map.snowBaseColor);
  const bankColor = new THREE.Color(map.snowRidgeColor);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = getBaseTerrainHeight(map, vx, vz);
    posAttr.setY(i, vy);

    const bankBlend = map.hasSuperpipe
      ? THREE.MathUtils.clamp((Math.abs(vx) - 5.5) / 8, 0, 1)
      : THREE.MathUtils.clamp((Math.abs(vx) - (map.halfWidth - 3)) / 10, 0, 1);
    tmpColor.copy(snowColor).lerp(bankColor, bankBlend * 0.85);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const snowTex = track(
    createSnowTexture(map.snowBaseColor, map.snowRidgeColor, maxAnisotropy)
  );
  const terrainMat = track(
    new THREE.MeshStandardMaterial({
      map: snowTex,
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.02,
    })
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // 2. Kickers (Sculpted snow ramp + side guide flags)
  const kickerSnowMat = track(
    new THREE.MeshStandardMaterial({
      color: map.snowBaseColor,
      roughness: 0.68,
      metalness: 0.04,
    })
  );
  const flagPoleMat = track(
    new THREE.MeshStandardMaterial({
      color: '#F97316',
      roughness: 0.35,
      metalness: 0.25,
    })
  );
  const flagBannerMat = track(
    new THREE.MeshStandardMaterial({
      color: map.accentColor,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
  );
  const flagPoleGeo = track(new THREE.CylinderGeometry(0.05, 0.05, 1.75, 6));
  const flagBannerGeo = track(new THREE.PlaneGeometry(0.55, 0.32));

  for (const k of layout.kickers) {
    const kGeo = track(new THREE.BoxGeometry(k.width, 1, k.length, 4, 1, 10));
    const kPos = kGeo.attributes.position;
    for (let i = 0; i < kPos.count; i++) {
      const lx = kPos.getX(i);
      const ly = kPos.getY(i);
      const lz = kPos.getZ(i);
      const worldX = k.x + lx;
      const worldZ = k.z - k.length * 0.5 + lz;
      const baseY = getBaseTerrainHeight(map, worldX, worldZ);
      const u = THREE.MathUtils.clamp((lz + k.length * 0.5) / k.length, 0, 1);
      const topLift = Math.pow(u, 1.45) * k.height;

      const finalY = ly > 0 ? baseY + topLift : baseY - 0.5;
      kPos.setXYZ(i, worldX, finalY, worldZ);
    }
    kGeo.computeVertexNormals();
    const kickerMesh = new THREE.Mesh(kGeo, kickerSnowMat);
    kickerMesh.castShadow = true;
    kickerMesh.receiveShadow = true;
    group.add(kickerMesh);

    // Lip guide poles on left and right edge
    [-k.width * 0.5 - 0.15, k.width * 0.5 + 0.15].forEach((sideX) => {
      const fx = k.x + sideX;
      const fz = k.z - 0.35;
      const fy = getBaseTerrainHeight(map, fx, fz) + k.height;
      const pole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
      pole.position.set(fx, fy + 0.75, fz);
      group.add(pole);

      const banner = new THREE.Mesh(flagBannerGeo, flagBannerMat);
      banner.position.set(fx + (sideX > 0 ? -0.28 : 0.28), fy + 1.38, fz);
      group.add(banner);
    });
  }

  // 3. Rails & Park Boxes (Metallic tubes + steel stanchions)
  const steelMat = track(
    new THREE.MeshStandardMaterial({
      color: '#CBD5E1',
      roughness: 0.22,
      metalness: 0.88,
      envMapIntensity: 1.3,
    })
  );
  const boxDeckMat = track(
    new THREE.MeshStandardMaterial({
      color: map.accentColor,
      roughness: 0.32,
      metalness: 0.45,
    })
  );
  const darkSupportMat = track(
    new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.5,
      metalness: 0.7,
    })
  );

  for (const r of layout.rails) {
    const startY = getBaseTerrainHeight(map, r.x, r.z) + r.height;
    const endY = getBaseTerrainHeight(map, r.x, r.z + r.length) + r.height;
    const midZ = r.z + r.length * 0.5;
    const midY = (startY + endY) * 0.5;
    const dz = r.length;
    const dy = endY - startY;
    const pitchAngle = -Math.atan2(dy, dz);
    const beamLen = Math.hypot(dz, dy);

    const railGroup = new THREE.Group();
    if (r.style === 'box') {
      const boxGeo = track(new THREE.BoxGeometry(r.width, 0.22, beamLen));
      const boxMesh = new THREE.Mesh(boxGeo, boxDeckMat);
      boxMesh.position.set(r.x, midY, midZ);
      boxMesh.rotation.x = pitchAngle;
      boxMesh.castShadow = true;
      boxMesh.receiveShadow = true;
      railGroup.add(boxMesh);

      const edgeGeo = track(new THREE.BoxGeometry(r.width + 0.08, 0.06, beamLen));
      const edgeMesh = new THREE.Mesh(edgeGeo, steelMat);
      edgeMesh.position.set(r.x, midY + 0.09, midZ);
      edgeMesh.rotation.x = pitchAngle;
      railGroup.add(edgeMesh);
    } else {
      const tubeGeo = track(new THREE.CylinderGeometry(0.11, 0.11, beamLen, 10));
      tubeGeo.rotateX(Math.PI / 2);
      const tube = new THREE.Mesh(tubeGeo, steelMat);
      tube.position.set(r.x, midY, midZ);
      tube.rotation.x = pitchAngle;
      tube.castShadow = true;
      railGroup.add(tube);
    }

    // Anchored steel stanchions along the rail
    const legGeo = track(new THREE.CylinderGeometry(0.055, 0.065, r.height + 0.8, 6));
    [0.12, 0.5, 0.88].forEach((t) => {
      const lz = r.z + r.length * t;
      const ly = getBaseTerrainHeight(map, r.x, lz);
      const leg = new THREE.Mesh(legGeo, darkSupportMat);
      leg.position.set(r.x, ly + (r.height - 0.15) * 0.5, lz);
      railGroup.add(leg);
    });

    if (map.isNight) {
      const beaconGeo = track(new THREE.SphereGeometry(0.14, 8, 8));
      const beaconMat = track(
        new THREE.MeshStandardMaterial({
          color: '#F59E0B',
          emissive: '#F59E0B',
          emissiveIntensity: 1.6,
        })
      );
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(r.x, startY + 0.25, r.z);
      railGroup.add(beacon);
    }

    group.add(railGroup);
  }

  // 4. Bonus Slalom Gates
  const gatePoleGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 8));
  const gateBarGeo = track(new THREE.BoxGeometry(3.8, 0.36, 0.1));
  const gatePoleMat = track(
    new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.35, metalness: 0.3 })
  );
  const gateBannerMat = track(
    new THREE.MeshStandardMaterial({
      color: '#0EA5E9',
      emissive: map.isNight ? '#0EA5E9' : '#000000',
      emissiveIntensity: map.isNight ? 0.8 : 0,
      roughness: 0.4,
    })
  );

  for (const g of layout.gates) {
    const leftY = getBaseTerrainHeight(map, g.x - 1.85, g.z);
    const rightY = getBaseTerrainHeight(map, g.x + 1.85, g.z);
    const pL = new THREE.Mesh(gatePoleGeo, gatePoleMat);
    pL.position.set(g.x - 1.85, leftY + 1.1, g.z);
    const pR = new THREE.Mesh(gatePoleGeo, gatePoleMat);
    pR.position.set(g.x + 1.85, rightY + 1.1, g.z);
    const bar = new THREE.Mesh(gateBarGeo, gateBannerMat);
    bar.position.set(g.x, Math.max(leftY, rightY) + 2.25, g.z);
    group.add(pL, pR, bar);
  }

  // 5. Finish Arch at map.lengthMeters
  const finishZ = map.lengthMeters;
  const finishY = getBaseTerrainHeight(map, 0, finishZ);
  const finishPostGeo = track(new THREE.CylinderGeometry(0.18, 0.22, 6.2, 10));
  const finishArchGeo = track(new THREE.BoxGeometry(15.2, 1.3, 0.55));
  const finishMat = track(
    new THREE.MeshStandardMaterial({
      color: '#DC2626',
      roughness: 0.4,
      metalness: 0.25,
    })
  );
  const archL = new THREE.Mesh(finishPostGeo, finishMat);
  archL.position.set(-7.2, finishY + 2.9, finishZ);
  const archR = new THREE.Mesh(finishPostGeo, finishMat);
  archR.position.set(7.2, finishY + 2.9, finishZ);
  const archTop = new THREE.Mesh(finishArchGeo, finishMat);
  archTop.position.set(0, finishY + 5.7, finishZ);
  group.add(archL, archR, archTop);

  // 6. Instanced Pine Trees (3-part layered pine cones + trunks)
  if (layout.trees.length > 0) {
    const count = layout.trees.length;
    const trunkGeo = track(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6));
    trunkGeo.translate(0, 0.7, 0);
    const trunkMat = track(
      new THREE.MeshStandardMaterial({ color: '#5C4033', roughness: 0.9, metalness: 0 })
    );
    const crownLowerGeo = track(new THREE.ConeGeometry(1.55, 3.2, 7));
    crownLowerGeo.translate(0, 2.5, 0);
    const crownUpperGeo = track(new THREE.ConeGeometry(1.1, 2.6, 7));
    crownUpperGeo.translate(0, 4.1, 0);
    const snowCapGeo = track(new THREE.ConeGeometry(0.7, 1.35, 7));
    snowCapGeo.translate(0, 4.9, 0);

    const foliageMat = track(
      new THREE.MeshStandardMaterial({
        color: map.isNight ? '#1E3A34' : '#1E4D3B',
        roughness: 0.85,
        metalness: 0.02,
      })
    );
    const capMat = track(
      new THREE.MeshStandardMaterial({
        color: map.snowBaseColor,
        roughness: 0.75,
        metalness: 0.02,
      })
    );

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const lowerMesh = new THREE.InstancedMesh(crownLowerGeo, foliageMat, count);
    const upperMesh = new THREE.InstancedMesh(crownUpperGeo, foliageMat, count);
    const capMesh = new THREE.InstancedMesh(snowCapGeo, capMat, count);
    lowerMesh.castShadow = true;
    upperMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    const baseTint = new THREE.Color(map.isNight ? '#1E3A34' : '#1E4D3B');
    const altTint = new THREE.Color(map.isNight ? '#274E45' : '#2C6B52');
    const instColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const t = layout.trees[i];
      const y = getBaseTerrainHeight(map, t.x, t.z);
      dummy.position.set(t.x, y - 0.15, t.z);
      dummy.rotation.set(0, t.tint * Math.PI * 2, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();

      trunkMesh.setMatrixAt(i, dummy.matrix);
      lowerMesh.setMatrixAt(i, dummy.matrix);
      upperMesh.setMatrixAt(i, dummy.matrix);
      capMesh.setMatrixAt(i, dummy.matrix);

      instColor.copy(baseTint).lerp(altTint, t.tint);
      lowerMesh.setColorAt(i, instColor);
      upperMesh.setColorAt(i, instColor);
    }

    [trunkMesh, lowerMesh, upperMesh, capMesh].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
  }

  // 7. Instanced Granite Rocks
  if (layout.rocks.length > 0) {
    const count = layout.rocks.length;
    const rockGeo = track(new THREE.DodecahedronGeometry(0.95, 0));
    const rockMat = track(
      new THREE.MeshStandardMaterial({
        color: '#64748B',
        roughness: 0.88,
        metalness: 0.08,
        flatShading: true,
      })
    );
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, count);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const rockColor = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = layout.rocks[i];
      const y = getBaseTerrainHeight(map, r.x, r.z);
      const norm = getTerrainSlopeNormal(map, layout, r.x, r.z);
      dummy.position.set(r.x, y + 0.28 * r.scale, r.z);
      dummy.rotation.set(norm.nz * 0.25, i * 1.3, -norm.nx * 0.25);
      dummy.scale.set(r.scale * 1.15, r.scale * 0.72, r.scale * 1.05);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
      rockColor.setHSL(0.6, 0.12, 0.36 + (i % 5) * 0.04);
      rockMesh.setColorAt(i, rockColor);
    }
    rockMesh.instanceMatrix.needsUpdate = true;
    if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
    rockMesh.computeBoundingSphere();
    group.add(rockMesh);
  }

  return {
    group,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
