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
  scarfTail: THREE.Mesh;
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
  for (let x = 0; x < 512; x += 16) {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = ridgeHex;
    ctx.fillRect(x, 0, 5, 512);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + 5, 0, 3, 512);
  }

  // Wind-swept snow drifts & micro-crystal variation
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 1 + Math.random() * 2.2;
    const h = 2 + Math.random() * 6;
    ctx.globalAlpha = 0.06 + Math.random() * 0.14;
    ctx.fillStyle = i % 3 === 0 ? '#FFFFFF' : ridgeHex;
    ctx.fillRect(x, y, w, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 260);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

export function createSnowNormalTexture(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Groomed corduroy wave along X + subtle crystal grain along Y
      const rib = Math.cos((x / size) * Math.PI * 32);
      const grain = Math.sin(x * 0.43 + y * 0.31) * Math.cos(x * 0.19 - y * 0.57);
      const nx = THREE.MathUtils.clamp(rib * 0.42 + grain * 0.14, -1, 1);
      const ny = THREE.MathUtils.clamp(grain * 0.18, -1, 1);
      const nz = Math.sqrt(Math.max(0.1, 1 - nx * nx - ny * ny));

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 260);
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

function createParkGraphicTexture(
  primaryHex: string,
  secondaryHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 256, 512);

  // Diagonal chevron racing stripes for park boxes & kicker lip mats
  ctx.fillStyle = secondaryHex;
  ctx.globalAlpha = 0.85;
  for (let y = -256; y < 768; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 48);
    ctx.lineTo(256, y);
    ctx.lineTo(256, y + 26);
    ctx.lineTo(128, y + 74);
    ctx.lineTo(0, y + 26);
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.fillRect(0, 0, 14, 512);
  ctx.fillRect(242, 0, 14, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

function createFinishBannerTexture(
  accentHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 1024, 256);

  // Checkered side blocks
  const cell = 32;
  for (let side = 0; side < 2; side++) {
    const startX = side === 0 ? 0 : 1024 - cell * 4;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#F8FAFC' : accentHex;
        ctx.fillRect(startX + c * cell, r * cell, cell, cell);
      }
    }
  }

  // Center banner text
  ctx.fillStyle = accentHex;
  ctx.fillRect(128, 0, 768, 16);
  ctx.fillRect(128, 240, 768, 16);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 92px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FINISH', 512, 134);

  const tex = new THREE.CanvasTexture(canvas);
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
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.58)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSkyDome(map: SkiMapConfig): {
  mesh: THREE.Mesh;
  dispose: () => void;
} {
  const geo = new THREE.SphereGeometry(320, 32, 20);
  const topCol = new THREE.Color(map.skyColor);
  const horCol = new THREE.Color(map.horizonColor);
  const sunCol = new THREE.Color(map.sunColor);

  const sunDir = map.isNight
    ? new THREE.Vector3(0.35, 0.42, 0.84).normalize()
    : new THREE.Vector3(0.45, 0.36, 0.82).normalize();

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTopColor: { value: topCol },
      uHorizonColor: { value: horCol },
      uSunColor: { value: sunCol },
      uSunDir: { value: sunDir },
      uIsNight: { value: map.isNight ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uIsNight;
      varying vec3 vWorldDir;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y * 1.35 + 0.06, 0.0, 1.0);
        vec3 sky = mix(uHorizonColor, uTopColor, pow(h, 0.65));

        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        // Atmospheric sun/moon glow halo
        float halo = pow(sunDot, mix(14.0, 28.0, uIsNight));
        float disc = smoothstep(mix(0.9965, 0.998, uIsNight), mix(0.9988, 0.9994, uIsNight), sunDot);
        sky += uSunColor * halo * mix(0.48, 0.26, uIsNight);
        sky += mix(uSunColor, vec3(1.0), 0.7) * disc * mix(1.4, 0.95, uIsNight);

        if (uIsNight > 0.5 && dir.y > 0.08) {
          vec3 grid = floor(dir * 190.0);
          float s = hash(grid);
          if (s > 0.9945) {
            float b = (s - 0.9945) / 0.0055;
            sky += vec3(0.75, 0.88, 1.0) * b * smoothstep(0.08, 0.35, dir.y) * 0.9;
          }
          // Subtle alpine aurora ribbon
          float aurora = sin(dir.x * 6.0 + dir.z * 3.0) * 0.5 + 0.5;
          float band = smoothstep(0.14, 0.32, dir.y) * (1.0 - smoothstep(0.32, 0.62, dir.y));
          sky += vec3(0.08, 0.36, 0.42) * aurora * band * 0.35;
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  return {
    mesh,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

function createTwinTipSkiGeometry(): THREE.BufferGeometry {
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

  const trickPivot = new THREE.Group();
  trickPivot.position.set(0, 0.88, 0);
  carveGroup.add(trickPivot);

  const skisGroup = new THREE.Group();
  skisGroup.position.set(0, -0.88, 0);
  trickPivot.add(skisGroup);

  // PBR Materials with clear roughness/metalness/iridescence contrast
  const skiBaseMat = track(
    new THREE.MeshPhysicalMaterial({
      color: gear.skiBaseColor,
      roughness: 0.2,
      metalness: 0.35,
      clearcoat: 0.75,
      clearcoatRoughness: 0.18,
    })
  );
  const skiEdgeMat = track(
    new THREE.MeshPhysicalMaterial({
      color: gear.skiAccentColor,
      roughness: 0.18,
      metalness: 0.84,
      clearcoat: 0.5,
    })
  );
  const bootMat = track(
    new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.4,
      metalness: 0.22,
    })
  );
  const pantsMat = track(
    new THREE.MeshStandardMaterial({
      color: gear.pantsColor,
      roughness: 0.8,
      metalness: 0.03,
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
    new THREE.MeshPhysicalMaterial({
      color: gear.helmetColor,
      roughness: 0.2,
      metalness: 0.15,
      clearcoat: 0.8,
      clearcoatRoughness: 0.16,
    })
  );
  const visorMat = track(
    new THREE.MeshPhysicalMaterial({
      color: gear.visorColor,
      roughness: 0.06,
      metalness: 0.92,
      clearcoat: 1.0,
      iridescence: 0.85,
      iridescenceIOR: 1.38,
      envMapIntensity: 1.6,
    })
  );
  const poleMat = track(
    new THREE.MeshStandardMaterial({
      color: '#E2E8F0',
      roughness: 0.24,
      metalness: 0.86,
    })
  );
  const gloveMat = track(
    new THREE.MeshStandardMaterial({
      color: '#0F172A',
      roughness: 0.68,
      metalness: 0.05,
    })
  );

  // Twin-tip Skis + Bright Underside Base Graphic + Bindings
  const skiGeo = track(createTwinTipSkiGeometry());
  const bindingGeo = track(new THREE.BoxGeometry(0.11, 0.06, 0.34));
  const stripeGeo = track(new THREE.BoxGeometry(0.085, 0.012, 1.32));
  const underBaseGeo = track(new THREE.BoxGeometry(0.1, 0.008, 1.24));

  [-0.2, 0.2].forEach((xOffset) => {
    const ski = new THREE.Mesh(skiGeo, skiBaseMat);
    ski.position.set(xOffset, 0, 0);
    ski.castShadow = true;
    skisGroup.add(ski);

    const stripe = new THREE.Mesh(stripeGeo, skiEdgeMat);
    stripe.position.set(xOffset, 0.042, 0.02);
    skisGroup.add(stripe);

    const underBase = new THREE.Mesh(underBaseGeo, skiEdgeMat);
    underBase.position.set(xOffset, -0.003, 0);
    skisGroup.add(underBase);

    const binding = new THREE.Mesh(bindingGeo, skiEdgeMat);
    binding.position.set(xOffset, 0.06, -0.02);
    binding.castShadow = true;
    skisGroup.add(binding);
  });

  // Articulated Legs + Ski Boots
  const bootGeo = track(new THREE.BoxGeometry(0.13, 0.18, 0.28));
  const buckleGeo = track(new THREE.BoxGeometry(0.145, 0.03, 0.06));
  const calfGeo = track(new THREE.CapsuleGeometry(0.085, 0.26, 4, 8));
  const thighGeo = track(new THREE.CapsuleGeometry(0.1, 0.26, 4, 8));

  const buildLeg = (xOffset: number) => {
    const leg = new THREE.Group();
    leg.position.set(xOffset, -0.82, 0);

    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, 0.09, 0.02);
    boot.castShadow = true;
    leg.add(boot);

    const buckle = new THREE.Mesh(buckleGeo, skiEdgeMat);
    buckle.position.set(0, 0.14, 0.05);
    leg.add(buckle);

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

  // Upper Body Torso + Accent Stripe + Backpack + Flowing Scarf + Helmet + Iridescent Goggles
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, -0.14, -0.04);
  trickPivot.add(torsoGroup);

  const jacketGeo = track(new THREE.CapsuleGeometry(0.2, 0.34, 6, 12));
  const jacket = new THREE.Mesh(jacketGeo, jacketMat);
  jacket.position.set(0, 0.25, 0);
  jacket.scale.set(1.1, 1, 0.76);
  jacket.castShadow = true;
  torsoGroup.add(jacket);

  const chestStripeGeo = track(new THREE.BoxGeometry(0.42, 0.08, 0.32));
  const chestStripe = new THREE.Mesh(chestStripeGeo, skiEdgeMat);
  chestStripe.position.set(0, 0.3, 0.01);
  torsoGroup.add(chestStripe);

  const collarGeo = track(new THREE.CylinderGeometry(0.13, 0.16, 0.12, 10));
  const collar = new THREE.Mesh(collarGeo, gloveMat);
  collar.position.set(0, 0.49, 0.02);
  torsoGroup.add(collar);

  const scarfGeo = track(new THREE.BoxGeometry(0.14, 0.04, 0.48));
  scarfGeo.translate(0, 0, -0.24);
  const scarfTail = new THREE.Mesh(scarfGeo, skiEdgeMat);
  scarfTail.position.set(0.05, 0.48, -0.08);
  scarfTail.castShadow = true;
  torsoGroup.add(scarfTail);

  const packGeo = track(new THREE.BoxGeometry(0.26, 0.32, 0.12));
  const backpack = new THREE.Mesh(packGeo, bootMat);
  backpack.position.set(0, 0.28, -0.16);
  backpack.castShadow = true;
  torsoGroup.add(backpack);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.65, 0.03);
  torsoGroup.add(headGroup);

  const helmetGeo = track(new THREE.SphereGeometry(0.175, 18, 14));
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.scale.set(0.95, 1.0, 1.06);
  helmet.castShadow = true;
  headGroup.add(helmet);

  const strapGeo = track(new THREE.TorusGeometry(0.17, 0.018, 6, 18));
  strapGeo.rotateX(Math.PI / 2);
  const goggleStrap = new THREE.Mesh(strapGeo, gloveMat);
  goggleStrap.position.set(0, -0.015, 0.01);
  headGroup.add(goggleStrap);

  const visorGeo = track(new THREE.BoxGeometry(0.25, 0.095, 0.12));
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
  const shadowGeo = track(new THREE.PlaneGeometry(2.0, 2.4));
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.44,
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
    scarfTail,
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
    speedRatio?: number;
    elapsedSec?: number;
    dt: number;
  }
) {
  const {
    tuck,
    grab,
    isAirborne,
    isGrinding,
    speedRatio = 0.5,
    elapsedSec = 0,
    dt,
  } = params;
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
  let targetLegBend = 0;

  if (isAirborne && grab !== 'none') {
    targetTorsoPitch = 0.72;
    targetTorsoY = -0.28;
    targetSkisY = -0.62;
    targetLegBend = 0.35;
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
    targetSkisYaw = Math.PI / 2 - 0.15;
    targetLeftArmZ = -0.65;
    targetRightArmZ = 0.65;
    targetLegBend = 0.2;
  } else if (tuck) {
    targetTorsoPitch = 0.68;
    targetTorsoY = -0.28;
    targetSkisY = -0.78;
    targetLeftArmX = -0.45;
    targetRightArmX = -0.45;
    targetLegBend = 0.28;
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
  rig.leftLeg.rotation.x = THREE.MathUtils.damp(
    rig.leftLeg.rotation.x,
    -targetLegBend,
    lambda,
    dt
  );
  rig.rightLeg.rotation.x = THREE.MathUtils.damp(
    rig.rightLeg.rotation.x,
    -targetLegBend,
    lambda,
    dt
  );

  // Flowing scarf flutter driven by speed
  const flutter = Math.sin(elapsedSec * (9 + speedRatio * 14)) * (0.08 + speedRatio * 0.14);
  rig.scarfTail.rotation.x = 0.12 + speedRatio * 0.22 + flutter;
  rig.scarfTail.rotation.y = Math.cos(elapsedSec * 7.5) * 0.14;
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

  // 1. Sculpted Mountain Terrain Mesh with Physical Snow Sheen & Normal Map
  const totalWidth = (map.halfWidth + 46) * 2;
  const totalLength = map.lengthMeters + 160;
  const segX = 72;
  const segZ = Math.min(460, Math.round(totalLength / 3.5));

  const terrainGeo = track(new THREE.PlaneGeometry(totalWidth, totalLength, segX, segZ));
  terrainGeo.rotateX(-Math.PI / 2);
  terrainGeo.translate(0, 0, totalLength * 0.5 - 35);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const snowColor = new THREE.Color(map.snowBaseColor);
  const bankColor = new THREE.Color(map.snowRidgeColor);
  const pisteTint = new THREE.Color('#FFFFFF');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = getBaseTerrainHeight(map, vx, vz);
    posAttr.setY(i, vy);

    const bankBlend = map.hasSuperpipe
      ? THREE.MathUtils.clamp((Math.abs(vx) - 5.5) / 8, 0, 1)
      : THREE.MathUtils.clamp((Math.abs(vx) - (map.halfWidth - 3)) / 10, 0, 1);

    // Slight crisp brighten along center run + blue-grey shadow tint on side banks
    tmpColor.copy(snowColor).lerp(pisteTint, (1 - bankBlend) * 0.16);
    tmpColor.lerp(bankColor, bankBlend * 0.88);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const snowTex = track(
    createSnowTexture(map.snowBaseColor, map.snowRidgeColor, maxAnisotropy)
  );
  const snowNormalTex = track(createSnowNormalTexture(maxAnisotropy));

  const terrainMat = track(
    new THREE.MeshPhysicalMaterial({
      map: snowTex,
      normalMap: snowNormalTex,
      normalScale: new THREE.Vector2(0.45, 0.35),
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.02,
      clearcoat: 0.16,
      clearcoatRoughness: 0.45,
      sheen: 0.35,
      sheenRoughness: 0.58,
      sheenColor: new THREE.Color(map.isNight ? '#7DD3FC' : '#E0F2FE'),
    })
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // 1b. Distant Snow-Capped Alpine Mountain Backdrop Ridges (Left, Right, & Far Horizon)
  const ridgeConeGeo = track(new THREE.ConeGeometry(1, 1.3, 6));
  const ridgeCapGeo = track(new THREE.ConeGeometry(0.46, 0.56, 6));
  ridgeCapGeo.translate(0, 0.38, 0);

  const ridgeRockMat = track(
    new THREE.MeshStandardMaterial({
      color: map.isNight ? '#1E293B' : '#475569',
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    })
  );
  const ridgeSnowMat = track(
    new THREE.MeshStandardMaterial({
      color: map.snowBaseColor,
      roughness: 0.75,
      metalness: 0.02,
      flatShading: true,
    })
  );

  const ridgeSpots: { x: number; z: number; sx: number; sy: number; rot: number }[] = [];
  for (let z = 60; z < map.lengthMeters + 160; z += 78) {
    [-1, 1].forEach((side) => {
      ridgeSpots.push({
        x: side * (map.halfWidth + 55 + ((z * 13) % 36)),
        z: z + ((z * 7) % 24),
        sx: 34 + ((z * 11) % 24),
        sy: 44 + ((z * 17) % 34),
        rot: (z * 0.37) % Math.PI,
      });
    });
  }
  // Grand peaks beyond finish arch
  for (let i = -3; i <= 3; i++) {
    ridgeSpots.push({
      x: i * 48,
      z: map.lengthMeters + 175 + Math.abs(i) * 18,
      sx: 52 + (Math.abs(i) % 3) * 14,
      sy: 72 + (3 - Math.abs(i)) * 16,
      rot: i * 0.7,
    });
  }

  if (ridgeSpots.length > 0) {
    const rRockInst = new THREE.InstancedMesh(ridgeConeGeo, ridgeRockMat, ridgeSpots.length);
    const rCapInst = new THREE.InstancedMesh(ridgeCapGeo, ridgeSnowMat, ridgeSpots.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < ridgeSpots.length; i++) {
      const sp = ridgeSpots[i];
      const baseY = getBaseTerrainHeight(map, sp.x * 0.4, Math.min(map.lengthMeters + 40, sp.z)) - 14;
      dummy.position.set(sp.x, baseY + sp.sy * 0.45, sp.z);
      dummy.rotation.set(0, sp.rot, 0);
      dummy.scale.set(sp.sx, sp.sy, sp.sx * 0.9);
      dummy.updateMatrix();
      rRockInst.setMatrixAt(i, dummy.matrix);
      rCapInst.setMatrixAt(i, dummy.matrix);
    }
    rRockInst.instanceMatrix.needsUpdate = true;
    rCapInst.instanceMatrix.needsUpdate = true;
    rRockInst.computeBoundingSphere();
    rCapInst.computeBoundingSphere();
    group.add(rRockInst, rCapInst);
  }

  // 1c. Piste Edge Boundary Slalom Stakes + Overhead Chairlift Line
  const stakeGeo = track(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6));
  const stakeMat = track(
    new THREE.MeshStandardMaterial({
      color: '#F97316',
      roughness: 0.4,
      metalness: 0.2,
      emissive: map.isNight ? '#EA580C' : '#000000',
      emissiveIntensity: map.isNight ? 0.55 : 0,
    })
  );
  const stakeCount = Math.floor(map.lengthMeters / 48) * 2;
  if (stakeCount > 0) {
    const stakeInst = new THREE.InstancedMesh(stakeGeo, stakeMat, stakeCount);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let z = 35; z < map.lengthMeters - 20 && idx + 1 < stakeCount; z += 48) {
      [-1, 1].forEach((side) => {
        const sx = side * (map.halfWidth - 0.6);
        const sy = getBaseTerrainHeight(map, sx, z);
        dummy.position.set(sx, sy + 0.65, z);
        dummy.rotation.set(0, 0, side * -0.08);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        stakeInst.setMatrixAt(idx++, dummy.matrix);
      });
    }
    stakeInst.count = idx;
    stakeInst.instanceMatrix.needsUpdate = true;
    stakeInst.computeBoundingSphere();
    group.add(stakeInst);
  }

  // Ski Lift Pylons along far right flank (or Night Floodlight Towers on Apex Night)
  const towerSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.42,
      metalness: 0.78,
    })
  );
  const floodHeadMat = track(
    new THREE.MeshStandardMaterial({
      color: '#FEF3C7',
      emissive: '#FDE68A',
      emissiveIntensity: map.isNight ? 2.4 : 0.2,
      roughness: 0.2,
    })
  );
  const towerPoleGeo = track(new THREE.CylinderGeometry(0.2, 0.32, 10.5, 8));
  const crossArmGeo = track(new THREE.BoxGeometry(3.8, 0.28, 0.34));
  const lampPanelGeo = track(new THREE.BoxGeometry(1.5, 0.65, 0.24));
  const liftX = map.halfWidth + 4.5;

  for (let z = 95; z < map.lengthMeters - 50; z += 140) {
    const ty = getBaseTerrainHeight(map, liftX, z);
    const pole = new THREE.Mesh(towerPoleGeo, towerSteelMat);
    pole.position.set(liftX, ty + 5.0, z);
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(crossArmGeo, towerSteelMat);
    arm.position.set(liftX - 1.0, ty + 9.9, z);
    group.add(arm);

    if (map.isNight) {
      const lamp = new THREE.Mesh(lampPanelGeo, floodHeadMat);
      lamp.position.set(liftX - 2.3, ty + 9.75, z);
      lamp.rotation.y = Math.PI / 5;
      lamp.rotation.x = 0.45;
      group.add(lamp);
    }
  }

  // 2. Kickers (Sculpted snow ramp + painted lip strip + twin guide flags)
  const kickerSnowMat = track(
    new THREE.MeshPhysicalMaterial({
      color: map.snowBaseColor,
      normalMap: snowNormalTex,
      normalScale: new THREE.Vector2(0.3, 0.25),
      roughness: 0.66,
      metalness: 0.04,
      clearcoat: 0.18,
    })
  );
  const lipStripMat = track(
    new THREE.MeshStandardMaterial({
      color: map.accentColor,
      roughness: 0.45,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      emissive: map.isNight ? map.accentColor : '#000000',
      emissiveIntensity: map.isNight ? 0.45 : 0,
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
      roughness: 0.48,
      metalness: 0.12,
      side: THREE.DoubleSide,
    })
  );
  const flagPoleGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 1.9, 6));
  const flagBannerGeo = track(new THREE.PlaneGeometry(0.65, 0.36));

  for (const k of layout.kickers) {
    const kGeo = track(new THREE.BoxGeometry(k.width, 1, k.length, 6, 1, 12));
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

    // Takeoff lip stripe marker right near the kicker top
    const lipGeo = track(new THREE.BoxGeometry(k.width * 0.94, 0.04, 0.45));
    const lipY = getBaseTerrainHeight(map, k.x, k.z - 0.25) + k.height * 0.94;
    const lip = new THREE.Mesh(lipGeo, lipStripMat);
    lip.position.set(k.x, lipY + 0.02, k.z - 0.25);
    lip.rotation.x = -0.32;
    group.add(lip);

    // Lip guide poles on left and right edge
    [-k.width * 0.5 - 0.16, k.width * 0.5 + 0.16].forEach((sideX) => {
      const fx = k.x + sideX;
      const fz = k.z - 0.3;
      const fy = getBaseTerrainHeight(map, fx, fz) + k.height;
      const pole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
      pole.position.set(fx, fy + 0.85, fz);
      group.add(pole);

      const banner = new THREE.Mesh(flagBannerGeo, flagBannerMat);
      banner.position.set(fx + (sideX > 0 ? -0.32 : 0.32), fy + 1.56, fz);
      group.add(banner);
    });
  }

  // 3. Rails & Park Boxes (Brushed anisotropic steel + chevron box graphics)
  const steelMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#E2E8F0',
      roughness: 0.16,
      metalness: 0.92,
      clearcoat: 0.65,
      anisotropy: 0.75,
      envMapIntensity: 1.5,
    })
  );
  const boxTopTex = track(
    createParkGraphicTexture(map.accentColor, '#F8FAFC', maxAnisotropy)
  );
  const boxDeckMat = track(
    new THREE.MeshPhysicalMaterial({
      map: boxTopTex,
      roughness: 0.26,
      metalness: 0.35,
      clearcoat: 0.55,
    })
  );
  const darkSupportMat = track(
    new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.45,
      metalness: 0.72,
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

      const copingGeo = track(new THREE.CylinderGeometry(0.055, 0.055, beamLen, 8));
      copingGeo.rotateX(Math.PI / 2);
      [-r.width * 0.5, r.width * 0.5].forEach((cx) => {
        const coping = new THREE.Mesh(copingGeo, steelMat);
        coping.position.set(r.x + cx, midY + 0.08, midZ);
        coping.rotation.x = pitchAngle;
        railGroup.add(coping);
      });
    } else if (r.style === 'kink') {
      // Double-barrel shotgun rail
      const tubeGeo = track(new THREE.CylinderGeometry(0.085, 0.085, beamLen, 10));
      tubeGeo.rotateX(Math.PI / 2);
      [-0.14, 0.14].forEach((offset) => {
        const tube = new THREE.Mesh(tubeGeo, steelMat);
        tube.position.set(r.x + offset, midY, midZ);
        tube.rotation.x = pitchAngle;
        tube.castShadow = true;
        railGroup.add(tube);
      });
    } else {
      const tubeGeo = track(new THREE.CylinderGeometry(0.115, 0.115, beamLen, 12));
      tubeGeo.rotateX(Math.PI / 2);
      const tube = new THREE.Mesh(tubeGeo, steelMat);
      tube.position.set(r.x, midY, midZ);
      tube.rotation.x = pitchAngle;
      tube.castShadow = true;
      railGroup.add(tube);
    }

    const legGeo = track(new THREE.CylinderGeometry(0.055, 0.068, r.height + 0.85, 6));
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
          emissiveIntensity: 1.8,
        })
      );
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(r.x, startY + 0.25, r.z);
      railGroup.add(beacon);
    }

    group.add(railGroup);
  }

  // 4. Bonus Slalom Gates
  const gatePoleGeo = track(new THREE.CylinderGeometry(0.065, 0.065, 2.6, 8));
  const gateBarGeo = track(new THREE.BoxGeometry(3.85, 0.38, 0.12));
  const gatePoleMat = track(
    new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.3, metalness: 0.35 })
  );
  const gateBannerMat = track(
    new THREE.MeshStandardMaterial({
      color: '#0EA5E9',
      emissive: map.isNight ? '#0EA5E9' : '#0284C7',
      emissiveIntensity: map.isNight ? 0.95 : 0.2,
      roughness: 0.35,
    })
  );

  for (const g of layout.gates) {
    const leftY = getBaseTerrainHeight(map, g.x - 1.85, g.z);
    const rightY = getBaseTerrainHeight(map, g.x + 1.85, g.z);
    const pL = new THREE.Mesh(gatePoleGeo, gatePoleMat);
    pL.position.set(g.x - 1.85, leftY + 1.15, g.z);
    pL.castShadow = true;
    const pR = new THREE.Mesh(gatePoleGeo, gatePoleMat);
    pR.position.set(g.x + 1.85, rightY + 1.15, g.z);
    pR.castShadow = true;
    const bar = new THREE.Mesh(gateBarGeo, gateBannerMat);
    bar.position.set(g.x, Math.max(leftY, rightY) + 2.3, g.z);
    group.add(pL, pR, bar);
  }

  // 5. Detailed Finish Arch with Graphic Banner
  const finishZ = map.lengthMeters;
  const finishY = getBaseTerrainHeight(map, 0, finishZ);
  const finishPostGeo = track(new THREE.CylinderGeometry(0.2, 0.26, 6.4, 12));
  const finishArchGeo = track(new THREE.BoxGeometry(15.2, 1.5, 0.55));
  const finishBannerTex = track(
    createFinishBannerTexture(map.accentColor, maxAnisotropy)
  );
  const finishPostMat = track(
    new THREE.MeshStandardMaterial({
      color: '#DC2626',
      roughness: 0.36,
      metalness: 0.35,
    })
  );
  const finishBannerMat = track(
    new THREE.MeshStandardMaterial({
      map: finishBannerTex,
      roughness: 0.45,
      metalness: 0.1,
    })
  );
  const archL = new THREE.Mesh(finishPostGeo, finishPostMat);
  archL.position.set(-7.2, finishY + 3.0, finishZ);
  archL.castShadow = true;
  const archR = new THREE.Mesh(finishPostGeo, finishPostMat);
  archR.position.set(7.2, finishY + 3.0, finishZ);
  archR.castShadow = true;
  const archTop = new THREE.Mesh(finishArchGeo, finishBannerMat);
  archTop.position.set(0, finishY + 5.85, finishZ);
  archTop.castShadow = true;
  group.add(archL, archR, archTop);

  // 6. Instanced Layered Alpine Pines (Trunk + 3 foliage tiers + snow cap)
  if (layout.trees.length > 0) {
    const count = layout.trees.length;
    const trunkGeo = track(new THREE.CylinderGeometry(0.18, 0.3, 1.65, 6));
    trunkGeo.translate(0, 0.72, 0);
    const trunkMat = track(
      new THREE.MeshStandardMaterial({ color: '#4A3228', roughness: 0.92, metalness: 0 })
    );
    const crownLowerGeo = track(new THREE.ConeGeometry(1.68, 3.0, 8));
    crownLowerGeo.translate(0, 2.35, 0);
    const crownMidGeo = track(new THREE.ConeGeometry(1.32, 2.6, 8));
    crownMidGeo.translate(0, 3.55, 0);
    const crownUpperGeo = track(new THREE.ConeGeometry(0.95, 2.2, 8));
    crownUpperGeo.translate(0, 4.75, 0);
    const snowCapGeo = track(new THREE.ConeGeometry(0.62, 1.2, 8));
    snowCapGeo.translate(0, 5.45, 0);

    const foliageMat = track(
      new THREE.MeshStandardMaterial({
        color: map.isNight ? '#19352F' : '#1E4D3B',
        roughness: 0.86,
        metalness: 0.02,
      })
    );
    const capMat = track(
      new THREE.MeshStandardMaterial({
        color: map.snowBaseColor,
        roughness: 0.72,
        metalness: 0.02,
      })
    );

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const lowerMesh = new THREE.InstancedMesh(crownLowerGeo, foliageMat, count);
    const midMesh = new THREE.InstancedMesh(crownMidGeo, foliageMat, count);
    const upperMesh = new THREE.InstancedMesh(crownUpperGeo, foliageMat, count);
    const capMesh = new THREE.InstancedMesh(snowCapGeo, capMat, count);
    lowerMesh.castShadow = true;
    midMesh.castShadow = true;
    upperMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    const baseTint = new THREE.Color(map.isNight ? '#19352F' : '#1E4D3B');
    const altTint = new THREE.Color(map.isNight ? '#244A41' : '#2E7056');
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
      midMesh.setMatrixAt(i, dummy.matrix);
      upperMesh.setMatrixAt(i, dummy.matrix);
      capMesh.setMatrixAt(i, dummy.matrix);

      instColor.copy(baseTint).lerp(altTint, t.tint);
      lowerMesh.setColorAt(i, instColor);
      midMesh.setColorAt(i, instColor);
      upperMesh.setColorAt(i, instColor);
    }

    [trunkMesh, lowerMesh, midMesh, upperMesh, capMesh].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
  }

  // 7. Instanced Snow-Dusted Granite Boulders
  if (layout.rocks.length > 0) {
    const count = layout.rocks.length;
    const rockGeo = track(new THREE.DodecahedronGeometry(0.95, 1));
    const rockCapGeo = track(new THREE.DodecahedronGeometry(0.76, 1));
    rockCapGeo.scale(1.02, 0.45, 1.02);
    rockCapGeo.translate(0, 0.46, 0);

    const rockMat = track(
      new THREE.MeshStandardMaterial({
        color: '#64748B',
        roughness: 0.88,
        metalness: 0.08,
        flatShading: true,
      })
    );
    const rockSnowMat = track(
      new THREE.MeshStandardMaterial({
        color: map.snowBaseColor,
        roughness: 0.74,
        metalness: 0.02,
        flatShading: true,
      })
    );

    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, count);
    const rockCapMesh = new THREE.InstancedMesh(rockCapGeo, rockSnowMat, count);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const rockColor = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = layout.rocks[i];
      const y = getBaseTerrainHeight(map, r.x, r.z);
      const norm = getTerrainSlopeNormal(map, layout, r.x, r.z);
      dummy.position.set(r.x, y + 0.25 * r.scale, r.z);
      dummy.rotation.set(norm.nz * 0.25, i * 1.3, -norm.nx * 0.25);
      dummy.scale.set(r.scale * 1.15, r.scale * 0.72, r.scale * 1.05);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
      rockCapMesh.setMatrixAt(i, dummy.matrix);
      rockColor.setHSL(0.6, 0.12, 0.36 + (i % 5) * 0.04);
      rockMesh.setColorAt(i, rockColor);
    }
    rockMesh.instanceMatrix.needsUpdate = true;
    rockCapMesh.instanceMatrix.needsUpdate = true;
    if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
    rockMesh.computeBoundingSphere();
    rockCapMesh.computeBoundingSphere();
    group.add(rockMesh, rockCapMesh);
  }

  return {
    group,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
