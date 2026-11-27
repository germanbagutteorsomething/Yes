import * as THREE from 'three';
import type { HeistVehicleId } from '../types/heist';
import { STREET_COORDS } from './cityLayout';

export function createCityAsphaltTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 2048;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d')!;

  // Rich dark wet asphalt base
  ctx.fillStyle = '#0e141e';
  ctx.fillRect(0, 0, size, size);

  // Damp asphalt baseline roughness (~0.62 -> rgb 158)
  rctx.fillStyle = '#9e9e9e';
  rctx.fillRect(0, 0, size, size);

  // Rain puddle patches (glossy dark reflections on roughnessMap)
  for (let i = 0; i < 150; i++) {
    const px = (Math.sin(i * 73.1 + 1.4) * 0.5 + 0.5) * size;
    const py = (Math.cos(i * 41.9 + 0.7) * 0.5 + 0.5) * size;
    const r = 22 + (i % 8) * 15;

    const grad = ctx.createRadialGradient(px, py, 2, px, py, r);
    grad.addColorStop(0, 'rgba(30, 58, 95, 0.22)');
    grad.addColorStop(0.65, 'rgba(12, 18, 30, 0.35)');
    grad.addColorStop(1, 'rgba(12, 18, 30, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    const rGrad = rctx.createRadialGradient(px, py, 2, px, py, r);
    rGrad.addColorStop(0, 'rgba(18, 18, 18, 0.95)'); // near-mirror wet puddle
    rGrad.addColorStop(0.6, 'rgba(55, 55, 55, 0.7)');
    rGrad.addColorStop(1, 'rgba(158, 158, 158, 0)');
    rctx.fillStyle = rGrad;
    rctx.beginPath();
    rctx.arc(px, py, r, 0, Math.PI * 2);
    rctx.fill();
  }

  // Asphalt mineral grain
  for (let i = 0; i < 16000; i++) {
    const x = (Math.sin(i * 19.3) * 0.5 + 0.5) * size;
    const y = (Math.cos(i * 47.7) * 0.5 + 0.5) * size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.032)' : 'rgba(0,0,0,0.24)';
    ctx.fillRect(x, y, 2, 2);
  }

  const worldToPx = (w: number) => ((w + 120) / 240) * size;
  const meterToPx = (m: number) => (m / 240) * size;

  // Tire wear tracks along major streets (slightly smoother rubber polish)
  ctx.fillStyle = 'rgba(7, 10, 16, 0.28)';
  rctx.fillStyle = '#7c7c7c';
  for (const sc of STREET_COORDS) {
    const p = worldToPx(sc);
    const trackOff = meterToPx(2.8);
    const trackW = meterToPx(1.3);
    ctx.fillRect(0, p - trackOff - trackW / 2, size, trackW);
    ctx.fillRect(0, p + trackOff - trackW / 2, size, trackW);
    ctx.fillRect(p - trackOff - trackW / 2, 0, trackW, size);
    ctx.fillRect(p + trackOff - trackW / 2, 0, trackW, size);

    rctx.fillRect(0, p - trackOff - trackW / 2, size, trackW);
    rctx.fillRect(0, p + trackOff - trackW / 2, size, trackW);
    rctx.fillRect(p - trackOff - trackW / 2, 0, trackW, size);
    rctx.fillRect(p + trackOff - trackW / 2, 0, trackW, size);
  }

  // Paved city block plazas with matte concrete tile grid
  const blockCenters = [-72, -24, 24, 72];
  const blockPx = meterToPx(32);
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const cx = worldToPx(bx);
      const cz = worldToPx(bz);
      const left = cx - blockPx / 2;
      const top = cz - blockPx / 2;

      ctx.fillStyle = '#222b3a';
      ctx.fillRect(left, top, blockPx, blockPx);

      rctx.fillStyle = '#d4d4d4'; // matte sidewalk concrete
      rctx.fillRect(left, top, blockPx, blockPx);

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
      ctx.lineWidth = 1.5;
      const step = blockPx / 8;
      for (let g = 1; g < 8; g++) {
        ctx.beginPath();
        ctx.moveTo(left + g * step, top);
        ctx.lineTo(left + g * step, top + blockPx);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(left, top + g * step);
        ctx.lineTo(left + blockPx, top + g * step);
        ctx.stroke();
      }

      ctx.strokeStyle = '#52627a';
      ctx.lineWidth = 5;
      ctx.strokeRect(left, top, blockPx, blockPx);
    }
  }

  // Double yellow road centerlines
  for (const sc of STREET_COORDS) {
    const p = worldToPx(sc);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
    ctx.lineWidth = 2.6;
    ctx.setLineDash([24, 18]);

    ctx.beginPath();
    ctx.moveTo(0, p - 3.5);
    ctx.lineTo(size, p - 3.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p + 3.5);
    ctx.lineTo(size, p + 3.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p - 3.5, 0);
    ctx.lineTo(p - 3.5, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p + 3.5, 0);
    ctx.lineTo(p + 3.5, size);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Intersection zebra crosswalks & stop bars
  ctx.fillStyle = 'rgba(241, 245, 249, 0.55)';
  for (const sx of STREET_COORDS) {
    for (const sz of STREET_COORDS) {
      const px = worldToPx(sx);
      const pz = worldToPx(sz);
      for (let k = -3; k <= 3; k++) {
        ctx.fillRect(px + k * 11 - 3, pz - meterToPx(8.5), 6, 16);
        ctx.fillRect(px + k * 11 - 3, pz + meterToPx(7.0), 6, 16);
        ctx.fillRect(px - meterToPx(8.5), pz + k * 11 - 3, 16, 6);
        ctx.fillRect(px + meterToPx(7.0), pz + k * 11 - 3, 16, 6);
      }
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(16, maxAnisotropy);
  map.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = Math.min(16, maxAnisotropy);
  roughnessMap.needsUpdate = true;

  return { map, roughnessMap };
}

export function createBuildingFacadeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#121a28';
  ctx.fillRect(0, 0, 512, 1024);

  const cols = 10;
  const rows = 24;
  const padX = 18;
  const padY = 18;
  const cellW = (512 - padX * 2) / cols;
  const cellH = (1024 - padY * 2) / rows;

  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.88)';
    ctx.fillRect(0, padY + r * cellH - 3, 512, 5);

    const isGroundLobby = r >= rows - 2;
    for (let c = 0; c < cols; c++) {
      const seed = Math.sin((r * 19 + c * 37) * 12.9898) * 43758.5453;
      const frac = seed - Math.floor(seed);

      const wx = padX + c * cellW + 4;
      const wy = padY + r * cellH + 5;
      const ww = cellW - 8;
      const wh = cellH - 10;

      if (isGroundLobby) {
        ctx.fillStyle = frac > 0.32 ? 'rgba(251, 191, 36, 0.86)' : 'rgba(56, 189, 248, 0.65)';
      } else if (frac > 0.34) {
        const grad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        if (frac > 0.78) {
          grad.addColorStop(0, 'rgba(253, 224, 71, 0.9)');
          grad.addColorStop(1, 'rgba(217, 119, 6, 0.55)');
        } else if (frac > 0.54) {
          grad.addColorStop(0, 'rgba(56, 189, 248, 0.86)');
          grad.addColorStop(1, 'rgba(14, 116, 144, 0.48)');
        } else {
          grad.addColorStop(0, 'rgba(226, 232, 240, 0.62)');
          grad.addColorStop(1, 'rgba(100, 116, 139, 0.32)');
        }
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = 'rgba(9, 14, 26, 0.95)';
      }
      ctx.fillRect(wx, wy, ww, wh);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.fillRect(wx, wy, ww, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(16, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function createNightSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(260, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x030712) },
      uMid: { value: new THREE.Color(0x0e182d) },
      uHorizon: { value: new THREE.Color(0x2b1b3d) },
      uMoonDir: { value: new THREE.Vector3(0.45, 0.62, 0.42).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uMoonDir;
      varying vec3 vWorldPos;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, h));
        col = mix(col, uZenith, smoothstep(0.25, 0.85, h));

        // Subtle urban sodium/magenta horizon glow
        float cityGlow = exp(-abs(dir.y) * 9.0) * 0.2;
        col += vec3(0.32, 0.14, 0.36) * cityGlow;

        // Moonlight disc & atmospheric halo
        float moonDot = max(dot(dir, uMoonDir), 0.0);
        col += vec3(0.45, 0.68, 0.95) * pow(moonDot, 16.0) * 0.35;
        col += vec3(0.9, 0.96, 1.0) * smoothstep(0.9978, 0.9992, moonDot) * 1.1;

        vec2 starUv = floor(dir.xz / max(0.18, dir.y + 0.35) * 145.0);
        float st = hash(starUv);
        if (st > 0.994 && h > 0.14) {
          col += vec3(0.75, 0.88, 1.0) * smoothstep(0.14, 0.48, h) * ((st - 0.994) / 0.006);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  return dome;
}

function addContactShadow(group: THREE.Group, radiusX: number, radiusZ: number) {
  const geo = new THREE.CircleGeometry(1, 20);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x020408,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(geo, mat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  shadow.scale.set(radiusX, radiusZ, 1);
  group.add(shadow);
}

function addHeadlightGroundPools(parent: THREE.Group, zFront: number, width: number, tintHex = 0xfef3c7) {
  const coneGeo = new THREE.ConeGeometry(1.75, 8.2, 16, 1, true);
  coneGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    color: tintHex,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const sx of [-1, 1]) {
    const beam = new THREE.Mesh(coneGeo, poolMat);
    beam.position.set(sx * (width * 0.32), 0.24, zFront + 3.9);
    beam.scale.set(0.85, 0.2, 1);
    parent.add(beam);
  }
}

function createExtrudedCarBody(
  length: number,
  width: number,
  bodyH: number,
  isSuv: boolean
): THREE.BufferGeometry {
  const halfL = length * 0.5;
  const shape = new THREE.Shape();
  // 2D side silhouette (X = Z forward/back, Y = height above ground clearance)
  if (isSuv) {
    shape.moveTo(-halfL, 0.04);
    shape.lineTo(halfL - 0.12, 0.04);
    shape.lineTo(halfL, 0.24);
    shape.lineTo(halfL - 0.18, bodyH);
    shape.lineTo(halfL * 0.42, bodyH + 0.06);
    shape.lineTo(halfL * 0.18, bodyH + 0.72);
    shape.lineTo(-halfL * 0.78, bodyH + 0.72);
    shape.lineTo(-halfL * 0.94, bodyH + 0.1);
    shape.lineTo(-halfL, 0.16);
    shape.closePath();
  } else {
    shape.moveTo(-halfL, 0.04);
    shape.lineTo(halfL - 0.12, 0.04);
    shape.lineTo(halfL, 0.22);
    shape.lineTo(halfL - 0.16, bodyH * 0.78);
    shape.lineTo(halfL * 0.36, bodyH * 0.98);
    shape.lineTo(halfL * 0.08, bodyH + 0.52);
    shape.lineTo(-halfL * 0.55, bodyH + 0.52);
    shape.lineTo(-halfL * 0.88, bodyH * 0.98);
    shape.lineTo(-halfL, bodyH * 0.82);
    shape.lineTo(-halfL, 0.16);
    shape.closePath();
  }

  const extrudeW = width - 0.12;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeW,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  // Center along Z of extrude, then rotate -PI/2 around Y so profile X aligns with +Z forward!
  geo.translate(0, 0, -extrudeW * 0.5);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export interface PlayerRig {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  weaponBarrel: THREE.Mesh;
  muzzleFlash: THREE.Mesh;
}

export function buildPlayerRig(): PlayerRig {
  const group = new THREE.Group();
  addContactShadow(group, 0.64, 0.64);

  const jacketMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.56,
    metalness: 0.18,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    emissive: 0x9f1239,
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.25,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe6b89c,
    roughness: 0.68,
    metalness: 0.02,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    roughness: 0.78,
    metalness: 0.05,
  });
  const gunMat = new THREE.MeshStandardMaterial({
    color: 0x71717a,
    roughness: 0.22,
    metalness: 0.9,
  });

  const legGeo = new THREE.BoxGeometry(0.24, 0.62, 0.26);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.16, 0.31, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.16, 0.31, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacketMat);
  torso.position.set(0, 0.96, 0);
  torso.castShadow = true;
  group.add(torso);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.14, 0.38), trimMat);
  stripe.position.set(0, 1.18, 0);
  group.add(stripe);

  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.56, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.62, metalness: 0.18 })
  );
  bag.position.set(0, 0.98, -0.28);
  bag.castShadow = true;
  group.add(bag);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
  head.position.set(0, 1.54, 0);
  head.castShadow = true;
  group.add(head);

  const mask = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.14, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.16, metalness: 0.75 })
  );
  mask.position.set(0, 1.58, 0.02);
  group.add(mask);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), jacketMat);
  leftArm.position.set(-0.4, 1.0, 0.05);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.54), jacketMat);
  rightArm.position.set(0.34, 1.06, 0.28);
  rightArm.castShadow = true;
  group.add(rightArm);

  const weaponBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.66), gunMat);
  weaponBarrel.position.set(0.34, 1.08, 0.64);
  weaponBarrel.castShadow = true;
  group.add(weaponBarrel);

  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 0.9) })
  );
  muzzleFlash.position.set(0.34, 1.08, 1.02);
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  return { group, leftLeg, rightLeg, leftArm, rightArm, weaponBarrel, muzzleFlash };
}

export function buildCopOfficerMesh(isSwat: boolean): THREE.Group {
  const group = new THREE.Group();
  addContactShadow(group, 0.58, 0.58);

  const uniformColor = isSwat ? 0x0f172a : 0x1d4ed8;
  const vestColor = isSwat ? 0x334155 : 0x1e293b;

  const uniformMat = new THREE.MeshStandardMaterial({
    color: uniformColor,
    roughness: 0.66,
    metalness: 0.16,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: vestColor,
    roughness: 0.48,
    metalness: 0.34,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xdeb89a,
    roughness: 0.72,
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

  const hat = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.18, 0.44),
    new THREE.MeshStandardMaterial({
      color: isSwat ? 0x020617 : 0x1e3a8a,
      roughness: 0.3,
      metalness: 0.48,
    })
  );
  hat.position.set(0, 1.72, 0.02);
  group.add(hat);

  if (isSwat) {
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.09, 0.06),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.6, 2.6) })
    );
    visor.position.set(0, 1.56, 0.2);
    group.add(visor);
  }

  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.14, 0.58),
    new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.26, metalness: 0.88 })
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
  brakeMat: THREE.MeshBasicMaterial;
  nitroFlames: THREE.Mesh[];
}

export function buildGetawayCarMesh(kind: HeistVehicleId, bodyColorHex: number): GetawayCarRig {
  const group = new THREE.Group();
  const bodyShell = new THREE.Group();
  group.add(bodyShell);

  const isArmored = kind === 'armored';
  const length = isArmored ? 4.35 : kind === 'muscle' ? 4.1 : 3.8;
  const width = isArmored ? 2.15 : 1.9;
  const bodyH = isArmored ? 0.88 : 0.62;

  addContactShadow(group, width * 0.72, length * 0.6);
  addHeadlightGroundPools(bodyShell, length / 2, width);

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: bodyColorHex,
    roughness: isArmored ? 0.38 : 0.14,
    metalness: isArmored ? 0.58 : 0.82,
    clearcoat: isArmored ? 0.35 : 1.0,
    clearcoatRoughness: 0.08,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x091120,
    roughness: 0.06,
    metalness: 0.92,
    clearcoat: 1.0,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.42, metalness: 0.55 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe4e4e7, roughness: 0.18, metalness: 0.94 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.84, metalness: 0.12 });

  // Sculpted extruded automotive shell
  const bodyGeo = createExtrudedCarBody(length, width, bodyH, isArmored);
  const bodyMesh = new THREE.Mesh(bodyGeo, paintMat);
  bodyMesh.position.set(0, 0.34, 0);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyShell.add(bodyMesh);

  // Tinted panoramic cabin greenhouse wrap
  const greenhouse = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.84, isArmored ? 0.52 : 0.38, isArmored ? length * 0.56 : length * 0.42),
    glassMat
  );
  greenhouse.position.set(0, 0.34 + bodyH + (isArmored ? 0.28 : 0.18), isArmored ? -0.22 : -0.25);
  bodyShell.add(greenhouse);

  // Side skirts + front splitter + rear diffuser
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, 0.14, length * 0.84), trimMat);
  skirt.position.set(0, 0.36, 0);
  bodyShell.add(skirt);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.08, 0.24), trimMat);
  splitter.position.set(0, 0.32, length * 0.49);
  bodyShell.add(splitter);

  if (kind === 'muscle') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.09, 0.28), paintMat);
    spoiler.position.set(0, 0.34 + bodyH + 0.18, -length / 2 + 0.24);
    bodyShell.add(spoiler);

    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.11, 0.78), trimMat);
    scoop.position.set(0, 0.34 + bodyH * 0.95, length * 0.22);
    bodyShell.add(scoop);
  } else if (kind === 'coupe') {
    // Twin racing stripe across hood & roof
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.4 });
    const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, length * 0.34), stripeMat);
    hoodStripe.position.set(0, 0.34 + bodyH * 0.91, length * 0.28);
    bodyShell.add(hoodStripe);
  } else if (isArmored) {
    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.05, 0.34, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.36, metalness: 0.86 })
    );
    bumper.position.set(0, 0.48, length / 2 + 0.08);
    bodyShell.add(bumper);
  }

  // Twin chrome exhausts + Nitro flame cones
  const exhaustGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.22, 8);
  exhaustGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.11, 0.75, 8);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.4, 2.2, 3.2),
    transparent: true,
    opacity: 0.92,
  });
  const nitroFlames: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(sx * (width * 0.24), 0.32, -length / 2 - 0.06);
    bodyShell.add(pipe);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(sx * (width * 0.24), 0.32, -length / 2 - 0.45);
    flame.visible = false;
    bodyShell.add(flame);
    nitroFlames.push(flame);
  }

  // HDR Headlights & Dynamic Brake Taillights
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.9, 1.5) });
  const brakeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.16, 0.12) });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), headMat);
    hl.position.set(sx * (width * 0.34), 0.34 + bodyH * 0.48, length / 2 + 0.02);
    bodyShell.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.08), brakeMat);
    tl.position.set(sx * (width * 0.32), 0.34 + bodyH * 0.56, -length / 2 - 0.02);
    bodyShell.add(tl);
  }

  // 4 Steerable/Spinning Wheels with Rims & Lug Detail
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.3, 10);
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.32, 0.4, 0.06);

  const zOff = length * 0.31;
  const xOff = width * 0.47;
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

      const rim = new THREE.Mesh(rimGeo, chromeMat);
      spinGroup.add(rim);

      const spoke = new THREE.Mesh(spokeGeo, trimMat);
      spinGroup.add(spoke);

      wheelSpinGroups.push(spinGroup);
      if (wz > 0) frontSteerPivots.push(steerPivot);
    }
  }

  return { group, bodyShell, frontSteerPivots, wheelSpinGroups, brakeMat, nitroFlames };
}

export interface PoliceVehicleRig {
  group: THREE.Group;
  bodyShell: THREE.Group;
  redBeacon: THREE.Mesh;
  blueBeacon: THREE.Mesh;
  wheelSpinGroups: THREE.Group[];
}

export function buildPoliceVehicleMesh(kind: 'cruiser' | 'interceptor' | 'swat'): PoliceVehicleRig {
  const isSwat = kind === 'swat';
  const isInterceptor = kind === 'interceptor';
  const length = isSwat ? 4.6 : 4.1;
  const width = isSwat ? 2.2 : 1.92;
  const bodyH = isSwat ? 0.96 : 0.62;

  const group = new THREE.Group();
  const bodyShell = new THREE.Group();
  group.add(bodyShell);

  addContactShadow(group, width * 0.72, length * 0.6);
  addHeadlightGroundPools(bodyShell, length / 2, width, 0xdbeafe);

  const blackMat = new THREE.MeshPhysicalMaterial({
    color: isSwat ? 0x0f172a : 0x090b10,
    roughness: 0.18,
    metalness: 0.75,
    clearcoat: 0.9,
  });
  const whiteMat = new THREE.MeshPhysicalMaterial({
    color: isInterceptor ? 0x1e293b : 0xf1f5f9,
    roughness: 0.2,
    metalness: 0.42,
    clearcoat: 0.85,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x070d19,
    roughness: 0.06,
    metalness: 0.92,
    clearcoat: 1.0,
  });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.88 });

  const bodyGeo = createExtrudedCarBody(length, width, bodyH, isSwat);
  const body = new THREE.Mesh(bodyGeo, blackMat);
  body.position.set(0, 0.34, 0);
  body.castShadow = true;
  bodyShell.add(body);

  if (!isSwat) {
    const doors = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.03, bodyH * 0.76, length * 0.42),
      whiteMat
    );
    doors.position.set(0, 0.34 + bodyH * 0.45, -0.08);
    bodyShell.add(doors);
  }

  const greenhouse = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.84, isSwat ? 0.56 : 0.38, isSwat ? length * 0.64 : length * 0.44),
    glassMat
  );
  greenhouse.position.set(0, 0.34 + bodyH + (isSwat ? 0.32 : 0.18), isSwat ? -0.24 : -0.2);
  bodyShell.add(greenhouse);

  const roofY = 0.34 + bodyH + (isSwat ? 0.78 : 0.56);

  const pushBar = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.8, 0.36, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.32, metalness: 0.88 })
  );
  pushBar.position.set(0, 0.52, length / 2 + 0.09);
  bodyShell.add(pushBar);

  // HDR Red + Blue Roof Lightbar
  const redMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.2, 0.2) });
  const blueMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.2, 2.9) });
  const redBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.3), redMat);
  redBeacon.position.set(-0.34, roofY + 0.08, -0.05);
  bodyShell.add(redBeacon);

  const blueBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.3), blueMat);
  blueBeacon.position.set(0.34, roofY + 0.08, -0.05);
  bodyShell.add(blueBeacon);

  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 2.0, 2.2) });
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.2, 0.2) });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), headMat);
    hl.position.set(sx * (width * 0.34), 0.34 + bodyH * 0.48, length / 2 + 0.02);
    bodyShell.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.08), tailMat);
    tl.position.set(sx * (width * 0.32), 0.34 + bodyH * 0.52, -length / 2 - 0.02);
    bodyShell.add(tl);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8);
  rimGeo.rotateZ(Math.PI / 2);
  const zOff = length * 0.31;
  const xOff = width * 0.47;
  const wheelSpinGroups: THREE.Group[] = [];
  for (const wx of [-xOff, xOff]) {
    for (const wz of [-zOff, zOff]) {
      const wg = new THREE.Group();
      wg.position.set(wx, 0.38, wz);
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wg.add(wheel);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      wg.add(rim);
      group.add(wg);
      wheelSpinGroups.push(wg);
    }
  }

  return { group, bodyShell, redBeacon, blueBeacon, wheelSpinGroups };
}

export interface PoliceChopperRig {
  group: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
  searchBeam: THREE.Mesh;
  groundSpot: THREE.Mesh;
}

export function buildPoliceChopperMesh(): PoliceChopperRig {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.3,
    metalness: 0.78,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x082f49,
    roughness: 0.08,
    metalness: 0.9,
    clearcoat: 1.0,
  });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35 });

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.35, 3.6), hullMat);
  group.add(cabin);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.92, 12, 10), glassMat);
  nose.scale.set(0.92, 0.72, 1.25);
  nose.position.set(0, -0.06, 1.65);
  group.add(nose);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.24, 2.8), stripeMat);
  stripe.position.set(0, -0.22, -0.1);
  group.add(stripe);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 3.8), hullMat);
  tail.position.set(0, 0.16, -3.2);
  group.add(tail);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.65), hullMat);
  fin.position.set(0, 0.56, -4.8);
  group.add(fin);

  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.0), stripeMat);
    skid.position.set(sx * 0.78, -0.96, 0.2);
    group.add(skid);
  }

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 0.92, 0.1);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
  const bladeA = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.06, 0.24), bladeMat);
  const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 7.6), bladeMat);
  mainRotor.add(bladeA, bladeB);
  group.add(mainRotor);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.18, 0.62, -4.85);
  const tBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 0.16), bladeMat);
  tailRotor.add(tBlade);
  group.add(tailRotor);

  // Volumetric searchlight cone pointing downward
  const coneGeo = new THREE.ConeGeometry(4.8, 28, 18, 1, true);
  coneGeo.translate(0, -14, 0);
  const searchBeam = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  searchBeam.position.set(0, -0.6, 1.2);
  group.add(searchBeam);

  const groundSpot = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 24),
    new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  groundSpot.rotation.x = -Math.PI / 2;
  groundSpot.position.y = 0.07;

  return { group, mainRotor, tailRotor, searchBeam, groundSpot };
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
    new THREE.RingGeometry(3.4, 3.95, 44),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 1.7, 0.2),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
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
      opacity: 0.34,
      depthWrite: false,
    })
  );
  progressRing.rotation.x = -Math.PI / 2;
  progressRing.position.y = 0.05;
  progressRing.scale.set(0.01, 0.01, 1);
  group.add(progressRing);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.95, 0),
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.9,
      roughness: 0.14,
      metalness: 0.82,
    })
  );
  crystal.position.y = 2.4;
  group.add(crystal);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 2.3, 28, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  beam.position.y = 14;
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
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.08, 22), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  if (kind === 'medkit') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.6, 0.65),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
    );
    box.position.y = 0.9;
    group.add(box);
    const crossA = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.16, 0.7),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.25, 0.25) })
    );
    crossA.position.y = 0.9;
    group.add(crossA);
    const crossB = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.42, 0.7),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.25, 0.25) })
    );
    crossB.position.y = 0.9;
    group.add(crossB);
  } else if (kind === 'armor') {
    const vest = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.62, 0),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.2,
        roughness: 0.2,
        metalness: 0.78,
      })
    );
    vest.position.y = 0.95;
    group.add(vest);
  } else if (kind === 'weapon') {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.45, 0.55),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 1.1,
        roughness: 0.28,
        metalness: 0.7,
      })
    );
    crate.position.y = 0.9;
    group.add(crate);
  } else {
    const cash = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.42, 0.52),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 1.1,
        roughness: 0.35,
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

  const handMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.26, metalness: 0.85 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.2, metalness: 0.94 });
  const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.5, 0.25) });

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.34), handMat);
  arm.position.set(0.03, -0.1, 0.16);
  arm.rotation.x = 0.2;
  gunPivot.add(arm);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.14, 0.08), handMat);
  grip.position.set(0, -0.07, 0.06);
  grip.rotation.x = -0.18;
  gunPivot.add(grip);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.092, 0.3), gunMat);
  body.position.set(0, 0.01, -0.04);
  gunPivot.add(body);

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.046, 0.32), barrelMat);
  barrel.position.set(0, 0.025, -0.22);
  gunPivot.add(barrel);

  const holoFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.052, 0.04, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.3, metalness: 0.8 })
  );
  holoFrame.position.set(0, 0.072, -0.02);
  gunPivot.add(holoFrame);

  const accentStrip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.018, 0.18), accentMat);
  accentStrip.position.set(0, 0.062, -0.09);
  gunPivot.add(accentStrip);

  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 0.9) })
  );
  muzzleFlash.position.set(0, 0.025, -0.41);
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

  const dashMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.72 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.72 });

  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.36), dashMat);
  dash.position.set(0, -0.44, -0.68);
  group.add(dash);

  const gauge = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.065, 0.02),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.5, 2.2) })
  );
  gauge.position.set(0, -0.34, -0.52);
  group.add(gauge);

  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.08), trimMat);
    pillar.position.set(sx * 0.68, 0.02, -0.62);
    pillar.rotation.z = sx * 0.14;
    group.add(pillar);
  }

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
