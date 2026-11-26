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
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  skisGroup: THREE.Group;
  scarfSegments: THREE.Mesh[];
  boostWakeGroup: THREE.Group;
  airContrailGroup: THREE.Group;
  fpvEyeAnchor: THREE.Object3D;
  fpvLookAnchor: THREE.Object3D;
  setFirstPerson: (enabled: boolean) => void;
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

  // Groomed corduroy stripes running downhill
  for (let x = 0; x < 512; x += 16) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = ridgeHex;
    ctx.fillRect(x, 0, 5, 512);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + 5, 0, 3, 512);
  }

  // Wind-carved sastrugi drifts & micro-crystal grain
  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 1 + Math.random() * 2.8;
    const h = 2 + Math.random() * 7;
    ctx.globalAlpha = 0.05 + Math.random() * 0.14;
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
  const size = 512;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rib = Math.cos((x / size) * Math.PI * 40);
      const sastrugi = Math.sin(x * 0.08 + Math.sin(y * 0.045) * 2.1) * 0.65;
      const drift = Math.sin(x * 0.16 + Math.cos(y * 0.09) * 1.4);
      const grain = Math.sin(x * 0.52 + y * 0.37) * Math.cos(x * 0.27 - y * 0.61);
      const nx = THREE.MathUtils.clamp(rib * 0.34 + sastrugi * 0.18 + drift * 0.14 + grain * 0.12, -1, 1);
      const ny = THREE.MathUtils.clamp(grain * 0.22 + sastrugi * 0.12 + drift * 0.08, -1, 1);
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
  tex.repeat.set(20, 280);
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

  ctx.fillStyle = secondaryHex;
  ctx.globalAlpha = 0.88;
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
  ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
  ctx.fillRect(0, 0, 16, 512);
  ctx.fillRect(240, 0, 16, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

function createSkiTopsheetTexture(
  baseHex: string,
  accentHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 128, 512);

  // Subtle racing carbon weave bands at tip and tail
  ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
  for (let y = 0; y < 512; y += 16) {
    ctx.fillRect(0, y, 64, 8);
    ctx.fillRect(64, y + 8, 64, 8);
  }

  // Bold diagonal racing chevrons
  ctx.fillStyle = accentHex;
  for (let y = 40; y < 460; y += 84) {
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(64, y + 36);
    ctx.lineTo(118, y);
    ctx.lineTo(118, y + 22);
    ctx.lineTo(64, y + 58);
    ctx.lineTo(10, y + 22);
    ctx.closePath();
    ctx.fill();
  }

  // Edge pin-stripes
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.65;
  ctx.fillRect(6, 0, 4, 512);
  ctx.fillRect(118, 0, 4, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createBarkTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4A3327';
  ctx.fillRect(0, 0, 128, 256);

  for (let i = 0; i < 240; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 256;
    const h = 12 + Math.random() * 34;
    ctx.fillStyle = i % 2 === 0 ? '#312018' : '#634636';
    ctx.globalAlpha = 0.4 + Math.random() * 0.4;
    ctx.fillRect(x, y, 2 + Math.random() * 3, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

function createWoodWallTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#6E472B';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = y % 64 === 0 ? '#7C5234' : '#633F26';
    ctx.fillRect(0, y, 256, 29);
    ctx.fillStyle = '#3B2314';
    ctx.fillRect(0, y + 29, 256, 3);
  }

  ctx.globalAlpha = 0.14;
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#9A6B49' : '#2C190D';
    ctx.fillRect(Math.random() * 240, Math.random() * 256, 16 + Math.random() * 44, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

function createDiamondNetTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.strokeStyle = '#FB923C';
  ctx.lineWidth = 4;
  for (let i = -128; i < 256; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i + 128, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  // Top and bottom border tape
  ctx.fillStyle = '#F97316';
  ctx.fillRect(0, 0, 128, 10);
  ctx.fillRect(0, 118, 128, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(6, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAnisotropy || 1);
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

  ctx.fillStyle = accentHex;
  ctx.fillRect(128, 0, 768, 18);
  ctx.fillRect(128, 238, 768, 18);

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

function createBibNumberTexture(accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 128, 22);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 74px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('07', 64, 78);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.62)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.24)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createDistanceMarkerTexture(
  labelText: string,
  accentHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 256, 20);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 116);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 54px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, 128, 76);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

function createCheckpointBannerTexture(
  labelText: string,
  accentHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 114, 512, 14);

  // Diagonal chevron accents on ends
  ctx.fillStyle = accentHex;
  for (let side = 0; side < 2; side++) {
    const x0 = side === 0 ? 18 : 446;
    ctx.beginPath();
    ctx.moveTo(x0, 26);
    ctx.lineTo(x0 + 36, 64);
    ctx.lineTo(x0, 102);
    ctx.lineTo(x0 + 18, 102);
    ctx.lineTo(x0 + 54, 64);
    ctx.lineTo(x0 + 18, 26);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, 256, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

function createFloodGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(253, 230, 138, 0.55)');
  grad.addColorStop(0.45, 'rgba(186, 230, 253, 0.24)');
  grad.addColorStop(1, 'rgba(186, 230, 253, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createSkyDome(map: SkiMapConfig): {
  mesh: THREE.Mesh;
  update: (elapsedSec: number, altitudeMeters?: number) => void;
  dispose: () => void;
} {
  const geo = new THREE.SphereGeometry(1250, 44, 30);
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
      uTime: { value: 0 },
      uAltitude: { value: 0 },
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
      uniform float uTime;
      uniform float uAltitude;
      varying vec3 vWorldDir;

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
          mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * valueNoise(p);
          p = p * 2.04 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y * 1.38 + 0.08, 0.0, 1.0);
        float stratoMix = smoothstep(32.0, 280.0, uAltitude);
        vec3 stratoZenith = vec3(0.03, 0.07, 0.19);
        vec3 zenithCol = mix(uTopColor, stratoZenith, stratoMix * (1.0 - uIsNight * 0.4));
        vec3 sky = mix(uHorizonColor, zenithCol, pow(h, 0.58));

        // Atmospheric Rayleigh horizon alpenglow band near the sun
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float horizonGlow = exp(-abs(dir.y) * 10.0) * pow(sunDot, 2.4) * (1.0 - uIsNight * 0.72);
        sky += uSunColor * horizonGlow * 0.22;

        float halo = pow(sunDot, mix(12.0, 26.0, uIsNight));
        float corona = pow(sunDot, 5.0) * 0.16;
        float disc = smoothstep(mix(0.9968, 0.9982, uIsNight), mix(0.9990, 0.9994, uIsNight), sunDot);
        float azim = atan(dir.x, dir.z);
        float sunRays = pow(sunDot, 4.2) * (0.5 + 0.5 * sin(azim * 16.0 + dir.y * 11.0)) * (1.0 - uIsNight) * 0.09;
        sky += uSunColor * (halo * mix(0.42, 0.26, uIsNight) + corona * (1.0 - uIsNight) + sunRays);
        sky += mix(uSunColor, vec3(1.0), 0.78) * disc * mix(1.32, 1.0, uIsNight);

        // Drifting two-tier alpine cirrus & sunlit cumulus cloud bands
        if (dir.y > 0.03) {
          vec2 cloudUv = dir.xz / (dir.y + 0.20);
          cloudUv += vec2(uTime * 0.008, uTime * 0.004);
          float cNoise = fbm(cloudUv * 1.38);
          float cDetail = fbm(cloudUv * 2.9 - vec2(uTime * 0.004, 0.0));
          float cMix = cNoise * 0.72 + cDetail * 0.28;
          float cloudMask = smoothstep(0.50, 0.77, cMix) * smoothstep(0.03, 0.20, dir.y) * (1.0 - smoothstep(0.58, 0.94, dir.y));
          float cloudSunLit = smoothstep(0.45, 0.85, cMix) * pow(sunDot, 1.8);
          vec3 cloudCol = mix(vec3(0.92, 0.96, 1.0), uSunColor * 1.08, 0.38 * cloudSunLit + 0.2 * pow(sunDot, 2.0));
          cloudCol = mix(cloudCol, vec3(0.14, 0.24, 0.42), uIsNight * 0.82);
          float cloudAltFade = 1.0 - smoothstep(140.0, 320.0, uAltitude) * 0.55;
          sky = mix(sky, cloudCol, cloudMask * mix(0.55, 0.24, uIsNight) * cloudAltFade);
        }

        // Crisp starfield (night runs OR high-altitude stratosphere flight) + Aurora Borealis on night runs
        float starVisibility = max(uIsNight, stratoMix * smoothstep(0.15, 0.55, dir.y));
        if (starVisibility > 0.05 && dir.y > 0.05) {
          vec3 grid = floor(dir * 225.0);
          float s = hash3(grid);
          if (s > 0.9938) {
            float b = (s - 0.9938) / 0.0062;
            float twinkle = 0.72 + 0.28 * sin(uTime * 2.6 + s * 95.0);
            sky += vec3(0.80, 0.92, 1.0) * b * twinkle * smoothstep(0.05, 0.30, dir.y) * starVisibility * 0.98;
          }
          if (uIsNight > 0.5) {
            float wave1 = sin(dir.x * 5.2 + dir.z * 3.1 + uTime * 0.35);
            float wave2 = cos(dir.x * 8.4 - dir.z * 4.5 + uTime * 0.5);
            float auroraCurtain = smoothstep(0.10, 0.88, (wave1 * 0.5 + wave2 * 0.5) * 0.5 + 0.5);
            float band = smoothstep(0.10, 0.28, dir.y) * (1.0 - smoothstep(0.34, 0.70, dir.y));
            vec3 auroraGreen = vec3(0.14, 0.88, 0.65);
            vec3 auroraViolet = vec3(0.42, 0.48, 0.96);
            vec3 auroraCol = mix(auroraGreen, auroraViolet, smoothstep(0.24, 0.54, dir.y));
            sky += auroraCol * auroraCurtain * band * 0.52;
          }
        }

        // Three-tier atmospheric distant alpine range silhouette along the horizon
        if (dir.y < 0.26 && dir.y > -0.24) {
          float angle = atan(dir.z, dir.x);
          float farPeak = 0.065 + 0.085 * abs(sin(angle * 4.0 + 0.7)) + 0.048 * fbm(vec2(angle * 3.2, 1.4));
          float midPeak = 0.036 + 0.062 * abs(sin(angle * 5.5 + 2.1)) + 0.036 * fbm(vec2(angle * 4.4, 2.7));
          float nearPeak = 0.014 + 0.044 * abs(sin(angle * 7.2 - 1.2)) + 0.026 * fbm(vec2(angle * 5.8, 4.1));
          vec3 farCol = mix(uHorizonColor * 0.82 + vec3(0.08, 0.14, 0.24), uSunColor * 0.50, pow(sunDot, 3.0) * 0.45);
          vec3 midCol = mix(uHorizonColor * 0.70 + vec3(0.07, 0.12, 0.20), vec3(0.84, 0.91, 0.99), (1.0 - uIsNight) * 0.20);
          vec3 nearCol = mix(uHorizonColor * 0.56 + vec3(0.05, 0.09, 0.17), vec3(0.76, 0.87, 0.96), (1.0 - uIsNight) * 0.24);
          farCol = mix(farCol, vec3(0.04, 0.08, 0.17), uIsNight * 0.66);
          midCol = mix(midCol, vec3(0.035, 0.07, 0.15), uIsNight * 0.70);
          nearCol = mix(nearCol, vec3(0.025, 0.055, 0.12), uIsNight * 0.75);
          float farMask = 1.0 - smoothstep(farPeak - 0.006, farPeak + 0.008, dir.y);
          float midMask = 1.0 - smoothstep(midPeak - 0.005, midPeak + 0.007, dir.y);
          float nearMask = 1.0 - smoothstep(nearPeak - 0.004, nearPeak + 0.006, dir.y);
          sky = mix(sky, farCol, farMask * 0.70);
          sky = mix(sky, midCol, midMask * 0.80);
          sky = mix(sky, nearCol, nearMask * 0.90);
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
    update: (elapsedSec: number, altitudeMeters = 0) => {
      mat.uniforms.uTime.value = elapsedSec;
      mat.uniforms.uAltitude.value = altitudeMeters;
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

function createTwinTipSkiGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.94, 0.085);
  shape.quadraticCurveTo(-0.79, 0.0, -0.62, 0.0);
  shape.lineTo(0.62, 0.0);
  shape.quadraticCurveTo(0.82, 0.0, 0.98, 0.11);
  shape.lineTo(0.95, 0.14);
  shape.quadraticCurveTo(0.79, 0.036, 0.62, 0.034);
  shape.lineTo(-0.62, 0.034);
  shape.quadraticCurveTo(-0.78, 0.036, -0.91, 0.115);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.125,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-0.0625, 0, 0);
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

  // Graphic Racing Topsheet + PBR Contrasts
  const topsheetTex = track(createSkiTopsheetTexture(gear.skiBaseColor, gear.skiAccentColor));
  const bibTex = track(createBibNumberTexture(gear.skiAccentColor));

  const skiBaseMat = track(
    new THREE.MeshPhysicalMaterial({
      map: topsheetTex,
      roughness: 0.18,
      metalness: 0.3,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
    })
  );
  const skiEdgeMat = track(
    new THREE.MeshPhysicalMaterial({
      color: gear.skiAccentColor,
      roughness: 0.16,
      metalness: 0.88,
      clearcoat: 0.6,
    })
  );
  const steelEdgeMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#E2E8F0',
      roughness: 0.14,
      metalness: 0.94,
      anisotropy: 0.8,
    })
  );
  const bootMat = track(
    new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.34,
      metalness: 0.25,
    })
  );
  const pantsMat = track(
    new THREE.MeshStandardMaterial({
      color: gear.pantsColor,
      roughness: 0.82,
      metalness: 0.03,
    })
  );
  const jacketMat = track(
    new THREE.MeshStandardMaterial({
      color: gear.jacketColor,
      roughness: 0.7,
      metalness: 0.05,
    })
  );
  const helmetMat = track(
    new THREE.MeshPhysicalMaterial({
      color: gear.helmetColor,
      roughness: 0.18,
      metalness: 0.18,
      clearcoat: 0.88,
      clearcoatRoughness: 0.12,
    })
  );
  const visorMat = track(
    new THREE.MeshPhysicalMaterial({
      color: gear.visorColor,
      roughness: 0.05,
      metalness: 0.92,
      clearcoat: 1.0,
      iridescence: 0.95,
      iridescenceIOR: 1.4,
      envMapIntensity: 1.75,
    })
  );
  const poleMat = track(
    new THREE.MeshStandardMaterial({
      color: '#CBD5E1',
      roughness: 0.22,
      metalness: 0.88,
    })
  );
  const darkTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: '#0F172A',
      roughness: 0.62,
      metalness: 0.08,
    })
  );
  const bibMat = track(
    new THREE.MeshStandardMaterial({
      map: bibTex,
      roughness: 0.72,
      metalness: 0.02,
    })
  );

  // Cambered Twin-Tip Skis + Brushed Steel Edge Rails + Pro Bindings
  const skiGeo = track(createTwinTipSkiGeometry());
  const railEdgeGeo = track(new THREE.BoxGeometry(0.138, 0.012, 1.38));
  const bindingToeGeo = track(new THREE.BoxGeometry(0.1, 0.05, 0.13));
  const bindingHeelGeo = track(new THREE.BoxGeometry(0.105, 0.075, 0.16));
  const underBaseGeo = track(new THREE.BoxGeometry(0.105, 0.008, 1.28));

  [-0.21, 0.21].forEach((xOffset) => {
    const ski = new THREE.Mesh(skiGeo, skiBaseMat);
    ski.position.set(xOffset, 0, 0);
    ski.castShadow = true;
    skisGroup.add(ski);

    const steelRail = new THREE.Mesh(railEdgeGeo, steelEdgeMat);
    steelRail.position.set(xOffset, 0.014, 0.01);
    skisGroup.add(steelRail);

    const underBase = new THREE.Mesh(underBaseGeo, skiEdgeMat);
    underBase.position.set(xOffset, -0.004, 0);
    skisGroup.add(underBase);

    const toePiece = new THREE.Mesh(bindingToeGeo, darkTrimMat);
    toePiece.position.set(xOffset, 0.056, 0.12);
    skisGroup.add(toePiece);

    const heelPiece = new THREE.Mesh(bindingHeelGeo, skiEdgeMat);
    heelPiece.position.set(xOffset, 0.068, -0.14);
    heelPiece.castShadow = true;
    skisGroup.add(heelPiece);
  });

  // Turbo Boost Icy-Cyan Jet-Wake Blades (hidden at idle, flare up when boosting)
  const boostWakeGroup = new THREE.Group();
  const wakeBladeGeo = track(new THREE.ConeGeometry(0.09, 1.75, 8));
  wakeBladeGeo.rotateX(Math.PI / 2);
  wakeBladeGeo.translate(0, 0, -0.88);
  const wakeMat = track(
    new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  [-0.21, 0.21].forEach((xOffset) => {
    const blade = new THREE.Mesh(wakeBladeGeo, wakeMat);
    blade.position.set(xOffset, 0.04, -0.92);
    boostWakeGroup.add(blade);
  });
  boostWakeGroup.scale.set(0.001, 0.001, 0.001);
  boostWakeGroup.visible = false;
  skisGroup.add(boostWakeGroup);

  // High-Speed & High-Altitude Aerodynamic Wingtip Contrails behind ski tips
  const airContrailGroup = new THREE.Group();
  const contrailGeo = track(new THREE.ConeGeometry(0.032, 2.6, 6));
  contrailGeo.rotateX(Math.PI / 2);
  contrailGeo.translate(0, 0, -1.3);
  const contrailMat = track(
    new THREE.MeshBasicMaterial({
      color: '#E0F2FE',
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  [-0.27, 0.27].forEach((xOffset) => {
    const trail = new THREE.Mesh(contrailGeo, contrailMat);
    trail.position.set(xOffset, 0.07, -0.82);
    airContrailGroup.add(trail);
  });
  airContrailGroup.scale.set(0.001, 0.001, 0.001);
  airContrailGroup.visible = false;
  skisGroup.add(airContrailGroup);

  // Articulated Anatomical Legs + Sculpted Multi-Buckle Ski Boots + Knees
  const bootLowerGeo = track(new THREE.BoxGeometry(0.135, 0.11, 0.29));
  const bootCuffGeo = track(new THREE.CylinderGeometry(0.072, 0.082, 0.18, 10));
  const buckleGeo = track(new THREE.BoxGeometry(0.15, 0.022, 0.04));
  const calfGeo = track(new THREE.CylinderGeometry(0.088, 0.075, 0.28, 10));
  const kneeGeo = track(new THREE.SphereGeometry(0.088, 10, 8));
  const thighGeo = track(new THREE.CylinderGeometry(0.105, 0.088, 0.3, 10));

  const buildLeg = (xOffset: number) => {
    const leg = new THREE.Group();
    leg.position.set(xOffset, -0.24, -0.02);

    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.set(0, -0.14, 0.04);
    thigh.rotation.x = -0.26;
    thigh.castShadow = true;
    leg.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.29, 0.08);
    leg.add(knee);

    const kneeCap = new THREE.Mesh(kneeGeo, pantsMat);
    kneeCap.castShadow = true;
    knee.add(kneeCap);

    const calf = new THREE.Mesh(calfGeo, pantsMat);
    calf.position.set(0, -0.14, -0.04);
    calf.rotation.x = 0.22;
    calf.castShadow = true;
    knee.add(calf);

    const bootCuff = new THREE.Mesh(bootCuffGeo, bootMat);
    bootCuff.position.set(0, -0.34, -0.05);
    bootCuff.rotation.x = 0.18;
    bootCuff.castShadow = true;
    knee.add(bootCuff);

    const bootLower = new THREE.Mesh(bootLowerGeo, bootMat);
    bootLower.position.set(0, -0.45, -0.02);
    bootLower.castShadow = true;
    knee.add(bootLower);

    // 3 metallic micro-buckles on ski boot
    [0, 1, 2].forEach((bIdx) => {
      const buckle = new THREE.Mesh(buckleGeo, skiEdgeMat);
      buckle.position.set(0, -0.42 + bIdx * 0.052, 0.01 - bIdx * 0.015);
      knee.add(buckle);
    });

    trickPivot.add(leg);
    return { leg, knee };
  };

  const leftLegBuild = buildLeg(-0.19);
  const rightLegBuild = buildLeg(0.19);

  // Sculpted Quilted Ski Jacket + Storm Collar + Racing Bib + Backpack + Articulated Scarf
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, -0.16, -0.04);
  trickPivot.add(torsoGroup);

  const fpvHiddenObjects: THREE.Object3D[] = [];

  const jacketGeo = track(new THREE.CapsuleGeometry(0.205, 0.34, 8, 14));
  const jacket = new THREE.Mesh(jacketGeo, jacketMat);
  jacket.position.set(0, 0.25, 0);
  jacket.scale.set(1.14, 1, 0.78);
  jacket.castShadow = true;
  torsoGroup.add(jacket);
  fpvHiddenObjects.push(jacket);

  // Horizontal quilted jacket baffles
  const baffleGeo = track(new THREE.TorusGeometry(0.185, 0.022, 6, 16));
  baffleGeo.rotateX(Math.PI / 2);
  [0.14, 0.24, 0.34].forEach((by, idx) => {
    const baffle = new THREE.Mesh(baffleGeo, idx === 1 ? skiEdgeMat : jacketMat);
    baffle.position.set(0, by, 0);
    baffle.scale.set(1.18, 0.82, 1);
    torsoGroup.add(baffle);
    fpvHiddenObjects.push(baffle);
  });

  // Front waterproof zipper + Racing Bib
  const zipperGeo = track(new THREE.BoxGeometry(0.025, 0.38, 0.03));
  const zipper = new THREE.Mesh(zipperGeo, darkTrimMat);
  zipper.position.set(0, 0.25, 0.16);
  torsoGroup.add(zipper);
  fpvHiddenObjects.push(zipper);

  const bibGeo = track(new THREE.PlaneGeometry(0.22, 0.2));
  const bib = new THREE.Mesh(bibGeo, bibMat);
  bib.position.set(0, 0.27, 0.172);
  torsoGroup.add(bib);
  fpvHiddenObjects.push(bib);

  // Storm collar + hood ridge
  const collarGeo = track(new THREE.CylinderGeometry(0.135, 0.17, 0.13, 12));
  const collar = new THREE.Mesh(collarGeo, darkTrimMat);
  collar.position.set(0, 0.49, 0.01);
  torsoGroup.add(collar);
  fpvHiddenObjects.push(collar);

  // 3-Segment Articulated Flowing Scarf
  const scarfSegments: THREE.Mesh[] = [];
  const scarfSegGeo = track(new THREE.BoxGeometry(0.13, 0.035, 0.2));
  scarfSegGeo.translate(0, 0, -0.1);
  let scarfParent: THREE.Object3D = torsoGroup;
  for (let s = 0; s < 3; s++) {
    const seg = new THREE.Mesh(scarfSegGeo, s === 1 ? steelEdgeMat : skiEdgeMat);
    if (s === 0) {
      seg.position.set(0.05, 0.48, -0.09);
    } else {
      seg.position.set(0, 0, -0.18);
    }
    seg.castShadow = true;
    scarfParent.add(seg);
    scarfSegments.push(seg);
    fpvHiddenObjects.push(seg);
    scarfParent = seg;
  }

  // Alpine Hydration Backpack + Shovel Handle Accent
  const packGeo = track(new THREE.BoxGeometry(0.25, 0.34, 0.13));
  const backpack = new THREE.Mesh(packGeo, bootMat);
  backpack.position.set(0, 0.27, -0.175);
  backpack.castShadow = true;
  torsoGroup.add(backpack);
  fpvHiddenObjects.push(backpack);

  const packStrapGeo = track(new THREE.BoxGeometry(0.26, 0.04, 0.145));
  const packAccent = new THREE.Mesh(packStrapGeo, skiEdgeMat);
  packAccent.position.set(0, 0.35, -0.175);
  torsoGroup.add(packAccent);
  fpvHiddenObjects.push(packAccent);

  const shovelPoleGeo = track(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6));
  const shovelShaft = new THREE.Mesh(shovelPoleGeo, steelEdgeMat);
  shovelShaft.position.set(0.08, 0.38, -0.23);
  shovelShaft.rotation.z = -0.15;
  torsoGroup.add(shovelShaft);
  fpvHiddenObjects.push(shovelShaft);

  // Aerodynamic Racing Helmet + Vent Ridge + Curved Toric Iridescent Goggles
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.65, 0.03);
  torsoGroup.add(headGroup);
  fpvHiddenObjects.push(headGroup);

  // First-person helmet eye & downhill look anchors inside trickPivot
  const fpvEyeAnchor = new THREE.Object3D();
  fpvEyeAnchor.position.set(0, 0.52, -0.02);
  trickPivot.add(fpvEyeAnchor);

  const fpvLookAnchor = new THREE.Object3D();
  fpvLookAnchor.position.set(0, -2.75, 12);
  trickPivot.add(fpvLookAnchor);

  const helmetGeo = track(new THREE.SphereGeometry(0.178, 20, 16));
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.scale.set(0.95, 1.0, 1.09);
  helmet.castShadow = true;
  headGroup.add(helmet);

  // Helmet crown aero fin + rear goggle clip
  const finGeo = track(new THREE.BoxGeometry(0.045, 0.035, 0.2));
  const aeroFin = new THREE.Mesh(finGeo, skiEdgeMat);
  aeroFin.position.set(0, 0.165, -0.04);
  aeroFin.rotation.x = -0.16;
  headGroup.add(aeroFin);

  const strapGeo = track(new THREE.TorusGeometry(0.172, 0.019, 8, 20));
  strapGeo.rotateX(Math.PI / 2);
  const goggleStrap = new THREE.Mesh(strapGeo, darkTrimMat);
  goggleStrap.position.set(0, -0.01, 0.01);
  headGroup.add(goggleStrap);

  // Curved Toric Wrap-Around Goggle Lens
  const visorGeo = track(
    new THREE.CylinderGeometry(0.184, 0.184, 0.095, 18, 1, true, -Math.PI * 0.28, Math.PI * 0.56)
  );
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, -0.012, 0.024);
  headGroup.add(visor);

  const visorFrameGeo = track(
    new THREE.CylinderGeometry(0.178, 0.178, 0.108, 18, 1, true, -Math.PI * 0.3, Math.PI * 0.6)
  );
  const visorFrame = new THREE.Mesh(visorFrameGeo, darkTrimMat);
  visorFrame.position.set(0, -0.012, 0.018);
  headGroup.add(visorFrame);

  // Articulated Arms + Gloves + Ergonomic Grips + Carbon Racing Poles + Baskets
  const upperArmGeo = track(new THREE.CapsuleGeometry(0.068, 0.18, 4, 8));
  const forearmGeo = track(new THREE.CapsuleGeometry(0.062, 0.18, 4, 8));
  const gloveGeo = track(new THREE.SphereGeometry(0.065, 10, 8));
  const poleGeo = track(new THREE.CylinderGeometry(0.012, 0.008, 1.04, 8));
  const gripGeo = track(new THREE.CylinderGeometry(0.02, 0.018, 0.13, 8));
  const basketGeo = track(new THREE.RingGeometry(0.015, 0.048, 12));

  const buildArm = (side: -1 | 1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 0.42, 0.02);

    const upperArm = new THREE.Mesh(upperArmGeo, jacketMat);
    upperArm.position.set(side * 0.03, -0.1, 0.04);
    upperArm.rotation.x = -0.35;
    upperArm.rotation.z = side * 0.22;
    upperArm.castShadow = true;
    arm.add(upperArm);

    const forearm = new THREE.Mesh(forearmGeo, jacketMat);
    forearm.position.set(side * 0.08, -0.25, 0.15);
    forearm.rotation.x = -0.82;
    forearm.rotation.z = side * 0.12;
    forearm.castShadow = true;
    arm.add(forearm);

    const glove = new THREE.Mesh(gloveGeo, darkTrimMat);
    glove.position.set(side * 0.1, -0.34, 0.24);
    arm.add(glove);

    const grip = new THREE.Mesh(gripGeo, skiEdgeMat);
    grip.position.set(side * 0.11, -0.34, 0.22);
    grip.rotation.x = 0.85;
    arm.add(grip);

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(side * 0.11, -0.54, -0.18);
    pole.rotation.x = 0.88;
    arm.add(pole);

    const basket = new THREE.Mesh(basketGeo, skiEdgeMat);
    basket.position.set(side * 0.11, -0.85, -0.54);
    basket.rotation.x = Math.PI / 2;
    arm.add(basket);

    torsoGroup.add(arm);
    return arm;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Soft Ground Contact Shadow
  const shadowTex = track(createContactShadowTexture());
  const shadowGeo = track(new THREE.PlaneGeometry(2.1, 2.5));
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.46,
    })
  );
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.03;

  let isFpvActive = false;
  const setFirstPerson = (enabled: boolean) => {
    if (isFpvActive === enabled) return;
    isFpvActive = enabled;
    for (let i = 0; i < fpvHiddenObjects.length; i++) {
      fpvHiddenObjects[i].visible = !enabled;
    }
  };

  return {
    root,
    carveGroup,
    trickPivot,
    torsoGroup,
    leftLeg: leftLegBuild.leg,
    rightLeg: rightLegBuild.leg,
    leftKnee: leftLegBuild.knee,
    rightKnee: rightLegBuild.knee,
    leftArm,
    rightArm,
    skisGroup,
    scarfSegments,
    boostWakeGroup,
    airContrailGroup,
    fpvEyeAnchor,
    fpvLookAnchor,
    setFirstPerson,
    shadowMesh,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export interface GhostSkierRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  dispose: () => void;
}

export function createGhostSkierRig(): GhostSkierRig {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const ghostMat = track(
    new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    })
  );
  const edgeMat = track(
    new THREE.MeshBasicMaterial({
      color: '#BAE6FD',
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    })
  );

  const skiGeo = track(createTwinTipSkiGeometry());
  [-0.21, 0.21].forEach((x) => {
    const s = new THREE.Mesh(skiGeo, edgeMat);
    s.position.set(x, 0.01, 0);
    bodyGroup.add(s);
  });

  const legGeo = track(new THREE.CapsuleGeometry(0.085, 0.48, 4, 8));
  [-0.18, 0.18].forEach((x) => {
    const leg = new THREE.Mesh(legGeo, ghostMat);
    leg.position.set(x, 0.42, 0);
    bodyGroup.add(leg);
  });

  const torsoGeo = track(new THREE.CapsuleGeometry(0.195, 0.38, 4, 10));
  const torso = new THREE.Mesh(torsoGeo, ghostMat);
  torso.position.set(0, 0.96, -0.03);
  torso.rotation.x = 0.26;
  torso.scale.set(1.12, 1, 0.78);
  bodyGroup.add(torso);

  const headGeo = track(new THREE.SphereGeometry(0.175, 14, 10));
  const head = new THREE.Mesh(headGeo, edgeMat);
  head.position.set(0, 1.38, 0.05);
  head.scale.set(0.95, 1, 1.08);
  bodyGroup.add(head);

  const visorGeo = track(
    new THREE.CylinderGeometry(0.182, 0.182, 0.085, 12, 1, true, -Math.PI * 0.28, Math.PI * 0.56)
  );
  const visor = new THREE.Mesh(visorGeo, edgeMat);
  visor.position.set(0, 1.37, 0.07);
  bodyGroup.add(visor);

  const ringGeo = track(new THREE.RingGeometry(0.45, 0.6, 24));
  ringGeo.rotateX(-Math.PI / 2);
  const beaconRing = new THREE.Mesh(ringGeo, edgeMat);
  beaconRing.position.set(0, 0.04, 0);
  root.add(beaconRing);

  return {
    root,
    bodyGroup,
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
    isBoosting?: boolean;
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
    isBoosting = false,
    speedRatio = 0.5,
    elapsedSec = 0,
    dt,
  } = params;
  const lambda = 12;

  let targetTorsoPitch = 0.22;
  let targetTorsoY = -0.16;
  let targetSkisY = -0.88;
  let targetLeftArmX = 0;
  let targetRightArmX = 0;
  let targetLeftArmZ = 0;
  let targetRightArmZ = 0;
  let targetSkisRoll = 0;
  let targetSkisYaw = 0;
  let targetLegBend = 0;
  let targetKneeFlex = 0;

  if (isAirborne && grab !== 'none') {
    targetTorsoPitch = 0.74;
    targetTorsoY = -0.28;
    targetSkisY = -0.62;
    targetLegBend = 0.42;
    targetKneeFlex = 0.62;
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
    targetSkisYaw = Math.PI / 2 - 0.14;
    targetLeftArmZ = -0.68;
    targetRightArmZ = 0.68;
    targetLegBend = 0.24;
    targetKneeFlex = 0.36;
  } else if (tuck || isBoosting) {
    targetTorsoPitch = isBoosting ? 0.78 : 0.68;
    targetTorsoY = -0.28;
    targetSkisY = -0.78;
    targetLeftArmX = -0.48;
    targetRightArmX = -0.48;
    targetLegBend = 0.32;
    targetKneeFlex = 0.46;
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
  rig.leftKnee.rotation.x = THREE.MathUtils.damp(
    rig.leftKnee.rotation.x,
    targetKneeFlex,
    lambda,
    dt
  );
  rig.rightKnee.rotation.x = THREE.MathUtils.damp(
    rig.rightKnee.rotation.x,
    targetKneeFlex,
    lambda,
    dt
  );

  // Flowing 3-link scarf wave driven by downhill wind speed
  const speedBoost = isBoosting ? 1.4 : 1.0;
  for (let i = 0; i < rig.scarfSegments.length; i++) {
    const seg = rig.scarfSegments[i];
    const phase = elapsedSec * (10 + speedRatio * 15) * speedBoost - i * 0.9;
    seg.rotation.x = (i === 0 ? 0.14 : 0.04) + speedRatio * 0.16 + Math.sin(phase) * (0.1 + speedRatio * 0.15);
    seg.rotation.y = Math.cos(phase * 0.72) * (0.12 + i * 0.05);
  }

  // Turbo Boost Jet-Wake blades behind ski tails
  const targetWake = isBoosting ? 1.0 : 0.001;
  const curWake = THREE.MathUtils.damp(rig.boostWakeGroup.scale.z, targetWake, 14, dt);
  rig.boostWakeGroup.visible = curWake > 0.03;
  if (rig.boostWakeGroup.visible) {
    const pulse = 0.88 + Math.sin(elapsedSec * 36) * 0.14;
    rig.boostWakeGroup.scale.set(curWake, curWake, curWake * pulse);
  }

  // High-speed & airborne aerodynamic contrail ribbons
  const wantsContrail = (isAirborne && speedRatio > 0.35) || isBoosting || speedRatio > 0.72;
  const targetTrail = wantsContrail ? THREE.MathUtils.clamp(speedRatio * 1.1, 0.45, 1.25) : 0.001;
  const curTrail = THREE.MathUtils.damp(rig.airContrailGroup.scale.z, targetTrail, 10, dt);
  rig.airContrailGroup.visible = curTrail > 0.05;
  if (rig.airContrailGroup.visible) {
    rig.airContrailGroup.scale.set(1, 1, curTrail);
  }
}

export interface BuiltParkScene {
  group: THREE.Group;
  update: (elapsedSec: number, dt: number) => void;
  collectRing: (id: string) => void;
  dispose: () => void;
}

export interface MountainBuildRange {
  zStart: number;
  zEnd: number;
  omitFinish?: boolean;
  sharedSnowTex?: THREE.CanvasTexture;
  sharedSnowNormalTex?: THREE.DataTexture;
}

/** Deterministic irregular jagged foliage cone for organic pine boughs */
function createOrganicFoliageCone(
  radius: number,
  height: number,
  radialSegments: number,
  seed: number
): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(radius, height, radialSegments, 2, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.05) {
      const angle = Math.atan2(z, x);
      const wave = 0.84 + 0.24 * Math.sin(angle * 3.0 + seed) * Math.cos(angle * 5.0 - seed * 0.7);
      const droop = (y < 0 ? -0.18 : 0) * (r / radius);
      pos.setXYZ(i, x * wave, y + droop, z * wave);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** Deterministic faceted granite boulder with natural cliff ridges */
function createSculptedRockGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const factor =
      0.82 +
      0.28 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 - seed * 0.5) +
      0.14 * Math.sin(y * 4.3 + x * 2.1);
    pos.setXYZ(i, x * factor, y * (0.72 + 0.16 * Math.abs(Math.sin(seed + y))), z * factor);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Sculpted jagged alpine massif peak with ridge crags and vertex color snowline */
function createMountainMassifGeometry(
  seed: number,
  rockColorHex: string,
  snowColorHex: string
): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(1.0, 1.45, 12, 6);
  const pos = geo.attributes.position;
  const rockCol = new THREE.Color(rockColorHex);
  const slateCol = rockCol.clone().lerp(new THREE.Color('#64748B'), 0.35);
  const snowCol = new THREE.Color(snowColorHex);
  const tmp = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const normH = THREE.MathUtils.clamp((y + 0.725) / 1.45, 0, 1);
    const angle = Math.atan2(z, x);

    // Sculpt sharp glacial ridges and couloirs down the mountain face
    const ridgeWave =
      0.86 +
      0.24 * Math.abs(Math.sin(angle * 3.0 + seed)) +
      0.12 * Math.cos(angle * 5.0 - normH * 3.2 + seed * 1.3);
    if (normH < 0.98) {
      x *= ridgeWave;
      z *= ridgeWave * 0.94;
      y += Math.sin(angle * 4.0 + seed) * 0.06 * (1 - normH);
    }
    pos.setXYZ(i, x, y, z);

    // Vertex color blend: dark rock base -> snow-dusted couloirs -> bright glacial peak
    const snowLine = 0.42 + 0.14 * Math.sin(angle * 3.0 + seed);
    const snowFactor = THREE.MathUtils.smoothstep(normH, snowLine - 0.08, snowLine + 0.22);
    tmp.copy(rockCol).lerp(slateCol, normH * 0.5).lerp(snowCol, snowFactor);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildMountainEnvironment(
  map: SkiMapConfig,
  layout: SkiParkLayout,
  maxAnisotropy: number,
  range?: MountainBuildRange
): BuiltParkScene {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const zMin = range ? range.zStart - (range.zStart === 0 ? 35 : 0) : -35;
  const zMax = range ? range.zEnd : map.lengthMeters + 125;
  const totalWidth = (map.halfWidth + 84) * 2;
  const totalLength = zMax - zMin;
  const segX = 96;
  const segZ = Math.min(480, Math.max(52, Math.round(totalLength / 3.2)));

  const terrainGeo = track(new THREE.PlaneGeometry(totalWidth, totalLength, segX, segZ));
  terrainGeo.rotateX(-Math.PI / 2);
  terrainGeo.translate(0, 0, zMin + totalLength * 0.5);

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
      : THREE.MathUtils.clamp((Math.abs(vx) - (map.halfWidth - 3)) / 12, 0, 1);
    const centerGroom = Math.exp(-(vx * vx) / Math.max(24, map.halfWidth * 1.4));

    tmpColor.copy(snowColor).lerp(pisteTint, (1 - bankBlend) * (0.16 + centerGroom * 0.14));
    tmpColor.lerp(bankColor, bankBlend * 0.9);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const snowTex =
    range?.sharedSnowTex ??
    track(createSnowTexture(map.snowBaseColor, map.snowRidgeColor, maxAnisotropy));
  const snowNormalTex =
    range?.sharedSnowNormalTex ?? track(createSnowNormalTexture(maxAnisotropy));

  const snowSparkleUniforms = {
    uTime: { value: 0 },
    uSparkleColor: { value: new THREE.Color(map.isNight ? '#BAE6FD' : '#FFFBEB') },
    uRockTint: { value: new THREE.Color(map.isNight ? '#1E293B' : '#475569') },
    uIceTint: { value: new THREE.Color(map.isNight ? '#38BDF8' : '#7DD3FC') },
  };

  const terrainMat = track(
    new THREE.MeshPhysicalMaterial({
      map: snowTex,
      normalMap: snowNormalTex,
      normalScale: new THREE.Vector2(0.62, 0.48),
      vertexColors: true,
      roughness: 0.66,
      metalness: 0.02,
      clearcoat: 0.14,
      clearcoatRoughness: 0.36,
      sheen: 0.26,
      sheenRoughness: 0.48,
      sheenColor: new THREE.Color(map.isNight ? '#7DD3FC' : '#BAE6FD'),
      envMapIntensity: 0.24,
    })
  );

  // Inject real-time SSS snow translucency, slope granite strata, ice sheen & diamond-dust sparkles
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = snowSparkleUniforms.uTime;
    shader.uniforms.uSparkleColor = snowSparkleUniforms.uSparkleColor;
    shader.uniforms.uRockTint = snowSparkleUniforms.uRockTint;
    shader.uniforms.uIceTint = snowSparkleUniforms.uIceTint;

    shader.vertexShader =
      `varying vec3 vSnowWorldPos;\nvarying vec3 vSnowWorldNormal;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vSnowWorldPos = transformed;
        vSnowWorldNormal = normalize(normal);
        `
      );

    shader.fragmentShader =
      `uniform float uTime;\nuniform vec3 uSparkleColor;\nuniform vec3 uRockTint;\nuniform vec3 uIceTint;\nvarying vec3 vSnowWorldPos;\nvarying vec3 vSnowWorldNormal;\n` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float slopeFlatness = clamp(vSnowWorldNormal.y, 0.0, 1.0);
        float strataNoise = sin(vSnowWorldPos.y * 1.45 + vSnowWorldPos.x * 0.22) * 0.5 + 0.5;
        float steepCliffMask = smoothstep(0.78, 0.52, slopeFlatness);
        float windIceMask = smoothstep(0.89, 0.72, slopeFlatness) * (1.0 - steepCliffMask);
        diffuseColor.rgb = mix(diffuseColor.rgb, uIceTint, windIceMask * 0.24);
        diffuseColor.rgb = mix(diffuseColor.rgb, uRockTint * (0.78 + 0.35 * strataNoise), steepCliffMask * 0.65);
        `
      ).replace(
        '#include <opaque_fragment>',
        `
        vec3 snowViewDir = normalize(cameraPosition - vSnowWorldPos);
        float distCam = length(cameraPosition - vSnowWorldPos);
        vec2 sCell = floor(vSnowWorldPos.xz * 7.8);
        vec2 sLocal = fract(vSnowWorldPos.xz * 7.8) - 0.5;
        float sRnd = fract(sin(dot(sCell, vec2(127.1, 311.7))) * 43758.5453);
        float sRnd2 = fract(sin(dot(sCell, vec2(269.5, 183.3))) * 43758.5453);
        float sTwinkle = pow(max(0.0, sin(sRnd * 6.2831 + snowViewDir.x * 11.0 + snowViewDir.z * 8.0 + uTime * 2.6)), 16.0);
        float sDot = smoothstep(0.32, 0.04, length(sLocal));
        float sFade = 1.0 - smoothstep(16.0, 82.0, distCam);
        float sparkle = step(0.68, sRnd2) * sTwinkle * sDot * sFade;
        float sssWrap = pow(1.0 - max(0.0, dot(snowViewDir, normalize(vSnowWorldNormal))), 2.6) * sFade;
        float sunIceGlint = pow(max(0.0, snowViewDir.z * 0.72 + snowViewDir.y * 0.45), 6.0) * sFade * 0.035;
        outgoingLight += uSparkleColor * (sparkle * 0.85 + sunIceGlint) + uIceTint * (sssWrap * 0.065);
        #include <opaque_fragment>
        `
      );
  };
  terrainMat.customProgramCacheKey = () => `ski-crystal-snow-v3-${map.isNight ? 'night' : 'day'}`;

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // 1b. Multi-Layered Sculpted Alpine Mountain Massifs, Towering Glacier Spires & Valley Cliffs
  const massifGeoA = track(
    createMountainMassifGeometry(
      1.7,
      map.isNight ? '#1E293B' : '#334155',
      map.snowBaseColor
    )
  );
  const massifGeoB = track(
    createMountainMassifGeometry(
      4.3,
      map.isNight ? '#172033' : '#475569',
      map.snowRidgeColor
    )
  );
  const massifMat = track(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.05,
      flatShading: true,
    })
  );

  const ridgeSpotsA: { x: number; z: number; sx: number; sy: number; rot: number }[] = [];
  const ridgeSpotsB: { x: number; z: number; sx: number; sy: number; rot: number }[] = [];
  const ridgeStartZ = range ? Math.max(20, range.zStart + 20) : 45;
  const ridgeEndZ = range ? range.zEnd : map.lengthMeters + 180;

  for (let z = ridgeStartZ; z < ridgeEndZ; z += 52) {
    [-1, 1].forEach((side, sIdx) => {
      // Inner valley foothills / granite shoulders closer to treeline
      ridgeSpotsB.push({
        x: side * (map.halfWidth + 46 + ((z * 9 + sIdx * 11) % 22)),
        z: z + ((z * 5) % 18),
        sx: 22 + ((z * 7) % 16),
        sy: 30 + ((z * 11) % 22),
        rot: (z * 0.43 + sIdx) % Math.PI,
      });
      // Towering background alpine massifs
      ridgeSpotsA.push({
        x: side * (map.halfWidth + 92 + ((z * 13 + sIdx * 17) % 44)),
        z: z + 18 + ((z * 7) % 22),
        sx: 52 + ((z * 11) % 30),
        sy: 78 + ((z * 19) % 52),
        rot: (z * 0.37) % Math.PI,
      });
      // Monumental far glacial spires framing high-altitude flights
      if (z % 104 < 52) {
        ridgeSpotsA.push({
          x: side * (map.halfWidth + 168 + ((z * 17 + sIdx * 19) % 48)),
          z: z + 34,
          sx: 78 + ((z * 13) % 32),
          sy: 128 + ((z * 23) % 48),
          rot: (z * 0.71 + sIdx) % Math.PI,
        });
      }
    });
  }
  if (!range?.omitFinish) {
    for (let i = -5; i <= 5; i++) {
      ridgeSpotsA.push({
        x: i * 50,
        z: map.lengthMeters + 210 + Math.abs(i) * 18,
        sx: 64 + (Math.abs(i) % 3) * 18,
        sy: 105 + (5 - Math.abs(i)) * 18,
        rot: i * 0.7,
      });
    }
  }

  const spawnMassifInstanced = (
    geo: THREE.BufferGeometry,
    spots: { x: number; z: number; sx: number; sy: number; rot: number }[]
  ) => {
    if (spots.length === 0) return;
    const inst = track(new THREE.InstancedMesh(geo, massifMat, spots.length));
    const dummy = new THREE.Object3D();
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      const baseY =
        getBaseTerrainHeight(
          map,
          sp.x * 0.25,
          range?.omitFinish ? sp.z : Math.min(map.lengthMeters + 40, sp.z)
        ) - 8;
      dummy.position.set(sp.x, baseY + sp.sy * 0.44, sp.z);
      dummy.rotation.set(0, sp.rot, 0);
      dummy.scale.set(sp.sx, sp.sy, sp.sx * 0.92);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  };

  spawnMassifInstanced(massifGeoA, ridgeSpotsA);
  spawnMassifInstanced(massifGeoB, ridgeSpotsB);

  // 1b-1. Volumetric 3D Stylized Alpine Cloud Deck (drifting over valleys so sky-high launches soar above the clouds!)
  const cloudPuffGeo = track(new THREE.IcosahedronGeometry(1, 1));
  const cloudMat = track(
    new THREE.MeshStandardMaterial({
      color: map.isNight ? '#1E3A5F' : '#E2E8F0',
      emissive: map.isNight ? '#0F172A' : '#BAE6FD',
      emissiveIntensity: map.isNight ? 0.18 : 0.04,
      roughness: 0.96,
      metalness: 0.0,
      transparent: true,
      opacity: map.isNight ? 0.56 : 0.78,
      flatShading: true,
    })
  );
  const cloudItems: { baseX: number; baseY: number; baseZ: number; sx: number; sy: number; sz: number; speed: number }[] = [];
  for (let cz = ridgeStartZ; cz < ridgeEndZ; cz += 95) {
    const side = (Math.floor(cz / 95) % 2 === 0 ? -1 : 1);
    const cx = side * (map.halfWidth + 28 + ((cz * 13) % 52));
    const cy = getBaseTerrainHeight(map, 0, cz) + 48 + ((cz * 7) % 44);
    for (let p = 0; p < 3; p++) {
      cloudItems.push({
        baseX: cx + (p - 1) * 9.5,
        baseY: cy + (p === 1 ? 2.4 : 0),
        baseZ: cz + (p - 1) * 4.5,
        sx: p === 1 ? 14 : 10,
        sy: p === 1 ? 5.2 : 3.8,
        sz: p === 1 ? 9.5 : 7.5,
        speed: 1.4 + (cz % 3) * 0.45,
      });
    }
  }
  let cloudInst: THREE.InstancedMesh | null = null;
  if (cloudItems.length > 0) {
    cloudInst = track(new THREE.InstancedMesh(cloudPuffGeo, cloudMat, cloudItems.length));
    cloudInst.frustumCulled = false;
    const cDummy = new THREE.Object3D();
    for (let i = 0; i < cloudItems.length; i++) {
      const c = cloudItems[i];
      cDummy.position.set(c.baseX, c.baseY, c.baseZ);
      cDummy.scale.set(c.sx, c.sy, c.sz);
      cDummy.updateMatrix();
      cloudInst.setMatrixAt(i, cDummy.matrix);
    }
    cloudInst.instanceMatrix.needsUpdate = true;
    group.add(cloudInst);
  }

  // 1b-2. Steep Flanking Granite Cliff Outcrops right beside the outer treeline
  const cliffGeo = track(createSculptedRockGeometry(3.2, 6.7));
  const cliffMat = track(
    new THREE.MeshStandardMaterial({
      color: map.isNight ? '#334155' : '#64748B',
      roughness: 0.9,
      metalness: 0.06,
      flatShading: true,
    })
  );
  const cliffSpots: { x: number; z: number; sx: number; sy: number; rot: number }[] = [];
  for (let z = ridgeStartZ + 15; z < ridgeEndZ - 15; z += 68) {
    [-1, 1].forEach((side, sIdx) => {
      if (((z + sIdx * 17) % 3) === 0) return;
      cliffSpots.push({
        x: side * (map.halfWidth + 9 + ((z * 5 + sIdx * 9) % 10)),
        z: z + ((z * 11) % 20),
        sx: 1.6 + ((z * 3) % 4) * 0.35,
        sy: 1.4 + ((z * 7) % 5) * 0.45,
        rot: (z * 0.61 + sIdx) % (Math.PI * 2),
      });
    });
  }
  if (cliffSpots.length > 0) {
    const cliffInst = track(new THREE.InstancedMesh(cliffGeo, cliffMat, cliffSpots.length));
    const dummy = new THREE.Object3D();
    for (let i = 0; i < cliffSpots.length; i++) {
      const c = cliffSpots[i];
      const cy = getBaseTerrainHeight(map, c.x, c.z);
      dummy.position.set(c.x, cy + c.sy * 0.8, c.z);
      dummy.rotation.set(0.1, c.rot, -0.08);
      dummy.scale.set(c.sx, c.sy, c.sx * 1.1);
      dummy.updateMatrix();
      cliffInst.setMatrixAt(i, dummy.matrix);
    }
    cliffInst.instanceMatrix.needsUpdate = true;
    cliffInst.computeBoundingSphere();
    group.add(cliffInst);
  }

  // 1c. Alpine Timber Start Gate Cabin + Chimney Smoke Puffs (at Start Corral only)
  const smokePuffs: { mesh: THREE.Mesh; phase: number; baseX: number; baseY: number; baseZ: number }[] = [];
  if (!range || range.zStart === 0) {
    const cabinX = -Math.min(13.5, map.halfWidth - 6);
    const cabinZ = -7;
    const cabinY = getBaseTerrainHeight(map, cabinX, cabinZ);
    const woodTex = track(createWoodWallTexture(maxAnisotropy));

    const cabinGroup = new THREE.Group();
    cabinGroup.position.set(cabinX, cabinY, cabinZ);
    cabinGroup.rotation.y = 0.28;

    const wallMat = track(
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85, metalness: 0.04 })
    );
    const roofSnowMat = track(
      new THREE.MeshStandardMaterial({ color: map.snowBaseColor, roughness: 0.7, metalness: 0.02 })
    );
    const windowGlowMat = track(
      new THREE.MeshStandardMaterial({
        color: '#FEF3C7',
        emissive: '#F59E0B',
        emissiveIntensity: map.isNight ? 1.85 : 0.65,
        roughness: 0.25,
      })
    );

    const bodyMesh = new THREE.Mesh(track(new THREE.BoxGeometry(5.2, 3.2, 4.4)), wallMat);
    bodyMesh.position.y = 1.6;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    cabinGroup.add(bodyMesh);

    const roofGeo = track(new THREE.ConeGeometry(4.2, 2.2, 4));
    roofGeo.rotateY(Math.PI / 4);
    const roofMesh = new THREE.Mesh(roofGeo, roofSnowMat);
    roofMesh.position.y = 4.25;
    roofMesh.castShadow = true;
    cabinGroup.add(roofMesh);

    // Stone chimney
    const chimneyMesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.65, 1.8, 0.65)),
      track(new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.9 }))
    );
    chimneyMesh.position.set(1.2, 4.5, -0.6);
    cabinGroup.add(chimneyMesh);

    const winGeo = track(new THREE.BoxGeometry(1.1, 0.95, 0.12));
    [-1.25, 1.25].forEach((wx) => {
      const win = new THREE.Mesh(winGeo, windowGlowMat);
      win.position.set(wx, 1.85, 2.21);
      cabinGroup.add(win);
    });

    const doorMesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.95, 2.0, 0.14)),
      track(new THREE.MeshStandardMaterial({ color: '#3B2314', roughness: 0.8 }))
    );
    doorMesh.position.set(0, 1.0, 2.21);
    cabinGroup.add(doorMesh);

    group.add(cabinGroup);

    const smokeGeo = track(new THREE.IcosahedronGeometry(0.32, 0));
    const smokeMat = track(
      new THREE.MeshStandardMaterial({
        color: '#F1F5F9',
        transparent: true,
        opacity: 0.42,
        roughness: 0.95,
      })
    );
    for (let s = 0; s < 5; s++) {
      const puff = new THREE.Mesh(smokeGeo, smokeMat);
      const sx = cabinX + 1.05;
      const sy = cabinY + 5.6;
      const sz = cabinZ - 0.8;
      puff.position.set(sx, sy, sz);
      group.add(puff);
      smokePuffs.push({ mesh: puff, phase: s / 5, baseX: sx, baseY: sy, baseZ: sz });
    }
  }

  // 1d. Orange Diamond Safety Netting Fencing along Piste Edges
  const stakeGeo = track(new THREE.CylinderGeometry(0.045, 0.045, 1.55, 6));
  const stakeMat = track(
    new THREE.MeshStandardMaterial({
      color: '#F97316',
      roughness: 0.38,
      metalness: 0.2,
      emissive: map.isNight ? '#EA580C' : '#000000',
      emissiveIntensity: map.isNight ? 0.5 : 0,
    })
  );
  const netTex = track(createDiamondNetTexture(maxAnisotropy));
  const netMat = track(
    new THREE.MeshStandardMaterial({
      map: netTex,
      transparent: true,
      alphaTest: 0.32,
      side: THREE.DoubleSide,
      roughness: 0.6,
    })
  );

  const stakeStart = range ? Math.max(35, range.zStart + 20) : 35;
  const stakeEnd = range ? range.zEnd - 12 : map.lengthMeters - 20;
  const stakeCount = Math.max(0, Math.floor((stakeEnd - stakeStart) / 44) + 1) * 2;
  if (stakeCount > 0) {
    const stakeInst = new THREE.InstancedMesh(stakeGeo, stakeMat, stakeCount);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let z = stakeStart; z < stakeEnd && idx + 1 < stakeCount; z += 44) {
      [-1, 1].forEach((side) => {
        const sx = side * (map.halfWidth - 0.5);
        const sy = getBaseTerrainHeight(map, sx, z);
        dummy.position.set(sx, sy + 0.68, z);
        dummy.rotation.set(0, 0, side * -0.07);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        stakeInst.setMatrixAt(idx++, dummy.matrix);
      });
    }
    stakeInst.count = idx;
    stakeInst.instanceMatrix.needsUpdate = true;
    stakeInst.computeBoundingSphere();
    group.add(stakeInst);

    // Periodic safety fence panels along outer chute curves (with grounded end-posts)
    const netPanelGeo = track(new THREE.PlaneGeometry(14, 1.15));
    netPanelGeo.rotateY(Math.PI / 2);
    for (let z = stakeStart + 22; z < stakeEnd - 16; z += 120) {
      [-1, 1].forEach((side) => {
        const nx = side * (map.halfWidth - 0.35);
        const ny = getBaseTerrainHeight(map, nx, z);
        const nNextY = getBaseTerrainHeight(map, nx, z + 14);
        const slopeAng = Math.atan2(nNextY - ny, 14);
        const netMesh = new THREE.Mesh(netPanelGeo, netMat);
        netMesh.position.set(nx, (ny + nNextY) * 0.5 + 0.56, z + 7);
        netMesh.rotation.x = -slopeAng;
        const postA = new THREE.Mesh(stakeGeo, stakeMat);
        postA.position.set(nx, ny + 0.62, z);
        const postB = new THREE.Mesh(stakeGeo, stakeMat);
        postB.position.set(nx, nNextY + 0.62, z + 14);
        group.add(netMesh, postA, postB);
      });
    }
  }

  // 1e. Animated Moving Chairlift System & Floodlight Towers along Right Flank
  const towerSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.4,
      metalness: 0.8,
    })
  );
  const floodHeadMat = track(
    new THREE.MeshStandardMaterial({
      color: '#FEF3C7',
      emissive: '#FDE68A',
      emissiveIntensity: map.isNight ? 2.4 : 0.25,
      roughness: 0.2,
    })
  );
  const cableMat = track(
    new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.35, metalness: 0.85 })
  );
  const chairAccentMat = track(
    new THREE.MeshStandardMaterial({ color: map.accentColor, roughness: 0.4, metalness: 0.3 })
  );

  const towerPoleGeo = track(new THREE.CylinderGeometry(0.22, 0.36, 11.0, 8));
  const crossArmGeo = track(new THREE.BoxGeometry(4.2, 0.28, 0.36));
  const bullwheelGeo = track(new THREE.CylinderGeometry(0.45, 0.45, 0.16, 12));
  bullwheelGeo.rotateZ(Math.PI / 2);
  const lampPanelGeo = track(new THREE.BoxGeometry(1.5, 0.65, 0.24));
  const liftX = map.halfWidth + 4.8;

  const towerStart = range ? Math.max(85, range.zStart + 35) : 85;
  const towerEnd = range ? range.zEnd - 20 : map.lengthMeters - 45;
  const towerPositions: { x: number; y: number; z: number }[] = [];

  for (let z = towerStart; z < towerEnd; z += 135) {
    const ty = getBaseTerrainHeight(map, liftX, z);
    const pole = new THREE.Mesh(towerPoleGeo, towerSteelMat);
    pole.position.set(liftX, ty + 5.2, z);
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(crossArmGeo, towerSteelMat);
    arm.position.set(liftX - 0.8, ty + 10.35, z);
    group.add(arm);

    const wheelL = new THREE.Mesh(bullwheelGeo, towerSteelMat);
    wheelL.position.set(liftX - 2.6, ty + 10.35, z);
    const wheelR = new THREE.Mesh(bullwheelGeo, towerSteelMat);
    wheelR.position.set(liftX + 1.0, ty + 10.35, z);
    group.add(wheelL, wheelR);

    towerPositions.push({ x: liftX - 2.6, y: ty + 10.35, z });

    if (map.isNight) {
      const lamp = new THREE.Mesh(lampPanelGeo, floodHeadMat);
      lamp.position.set(liftX - 2.8, ty + 9.95, z);
      lamp.rotation.y = Math.PI / 5;
      lamp.rotation.x = 0.45;
      group.add(lamp);

      const poolTex = track(createFloodGlowTexture());
      const poolMat = track(
        new THREE.MeshBasicMaterial({
          map: poolTex,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const poolGeo = track(new THREE.PlaneGeometry(24, 24));
      poolGeo.rotateX(-Math.PI / 2);
      const poolMesh = new THREE.Mesh(poolGeo, poolMat);
      const poolY = getBaseTerrainHeight(map, map.halfWidth * 0.45, z + 6);
      poolMesh.position.set(map.halfWidth * 0.45, poolY + 0.08, z + 6);
      group.add(poolMesh);
    }
  }

  // 1f. Alpine Snow-Making Cannons, Distance Mileposts (250m/500m/...) & Overhead Checkpoint Banners
  const cannonYellowMat = track(
    new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.35, metalness: 0.45 })
  );
  const cannonStandGeo = track(new THREE.CylinderGeometry(0.12, 0.18, 2.2, 6));
  const cannonBarrelGeo = track(new THREE.CylinderGeometry(0.28, 0.36, 1.35, 10));
  cannonBarrelGeo.rotateX(Math.PI / 2 - 0.35);

  const markerStartZ = range ? Math.max(250, Math.ceil((range.zStart + 10) / 250) * 250) : 250;
  const markerEndZ = range ? range.zEnd - 15 : map.lengthMeters - 60;
  const postWoodMat = track(
    new THREE.MeshStandardMaterial({ color: '#4A3327', roughness: 0.85, metalness: 0.05 })
  );
  const signPostGeo = track(new THREE.CylinderGeometry(0.08, 0.09, 2.8, 6));
  const signBoardGeo = track(new THREE.BoxGeometry(2.1, 1.05, 0.12));

  for (let mz = markerStartZ; mz <= markerEndZ; mz += 250) {
    // Left flank Distance Milepost Sign
    const mx = -(map.halfWidth - 1.4);
    const my = getBaseTerrainHeight(map, mx, mz);
    const signPost = new THREE.Mesh(signPostGeo, postWoodMat);
    signPost.position.set(mx, my + 1.3, mz);
    signPost.castShadow = true;
    const signTex = track(createDistanceMarkerTexture(`${mz}m`, map.accentColor, maxAnisotropy));
    const signMat = track(
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.42, metalness: 0.1 })
    );
    const signBoard = new THREE.Mesh(signBoardGeo, signMat);
    signBoard.position.set(mx, my + 2.35, mz);
    signBoard.rotation.y = 0.28;
    group.add(signPost, signBoard);

    // Opposite flank Snow-Making Cannon
    const cx = map.halfWidth + 0.6;
    const cy = getBaseTerrainHeight(map, cx, mz + 18);
    const stand = new THREE.Mesh(cannonStandGeo, towerSteelMat);
    stand.position.set(cx, cy + 1.0, mz + 18);
    const barrel = new THREE.Mesh(cannonBarrelGeo, cannonYellowMat);
    barrel.position.set(cx - 0.15, cy + 2.1, mz + 18);
    barrel.rotation.y = -0.65;
    group.add(stand, barrel);

    // Every 500m spawn an overhead Alpine Checkpoint Arch for exhilarating speed perception
    if (mz % 500 === 0) {
      const archHalf = Math.min(11.5, map.halfWidth - 3.0);
      const archLY = getBaseTerrainHeight(map, -archHalf, mz);
      const archRY = getBaseTerrainHeight(map, archHalf, mz);
      const midY = Math.max(archLY, archRY) + 5.8;
      const archPoleGeo = track(new THREE.CylinderGeometry(0.16, 0.22, 6.4, 8));
      const pL = new THREE.Mesh(archPoleGeo, towerSteelMat);
      pL.position.set(-archHalf, archLY + 3.0, mz);
      pL.castShadow = true;
      const pR = new THREE.Mesh(archPoleGeo, towerSteelMat);
      pR.position.set(archHalf, archRY + 3.0, mz);
      pR.castShadow = true;
      const bannerGeo = track(new THREE.BoxGeometry(archHalf * 2 + 0.8, 1.35, 0.42));
      const bannerLabel = mz >= 1000 ? `${mz}M ALPINE` : `${mz}M DROP`;
      const bannerTex = track(
        createCheckpointBannerTexture(bannerLabel, map.accentColor, maxAnisotropy)
      );
      const bannerMat = track(
        new THREE.MeshStandardMaterial({
          map: bannerTex,
          roughness: 0.4,
          emissive: map.isNight ? map.accentColor : '#000000',
          emissiveIntensity: map.isNight ? 0.38 : 0,
        })
      );
      const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
      bannerMesh.position.set(0, midY, mz);
      bannerMesh.castShadow = true;
      group.add(pL, pR, bannerMesh);
    }
  }

  // Span overhead haul cables between lift pylons + spawn animated moving chairlift cabins
  const animatedChairs: {
    group: THREE.Group;
    progress: number;
    laneOffsetX: number;
    dir: 1 | -1;
  }[] = [];
  const cableMinZ = towerStart;
  const cableMaxZ = Math.max(cableMinZ + 40, towerEnd);

  if (towerPositions.length >= 2) {
    for (let i = 0; i < towerPositions.length - 1; i++) {
      const a = towerPositions[i];
      const b = towerPositions[i + 1];
      [-0.1, 3.6].forEach((offsetX) => {
        const dx = 0;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dy, dz);
        const cableGeo = track(new THREE.CylinderGeometry(0.035, 0.035, len, 6));
        cableGeo.rotateX(Math.PI / 2);
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.set(a.x + offsetX, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
        cable.rotation.x = -Math.atan2(dy, dz);
        group.add(cable);
      });
    }

    const hangerGeo = track(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 6));
    const seatGeo = track(new THREE.BoxGeometry(1.45, 0.14, 0.56));
    const backGeo = track(new THREE.BoxGeometry(1.45, 0.65, 0.12));
    const spanLen = cableMaxZ - cableMinZ;
    const chairCount = Math.max(4, Math.floor(spanLen / 90));

    for (let c = 0; c < chairCount; c++) {
      const dir: 1 | -1 = c % 2 === 0 ? -1 : 1;
      const laneOffsetX = dir === -1 ? liftX - 2.6 : liftX + 1.0;
      const chairGroup = new THREE.Group();

      const hanger = new THREE.Mesh(hangerGeo, towerSteelMat);
      hanger.position.y = -1.05;
      const seat = new THREE.Mesh(seatGeo, chairAccentMat);
      seat.position.set(0, -2.05, 0);
      const back = new THREE.Mesh(backGeo, chairAccentMat);
      back.position.set(0, -1.7, dir === -1 ? 0.24 : -0.24);
      chairGroup.add(hanger, seat, back);
      group.add(chairGroup);

      animatedChairs.push({
        group: chairGroup,
        progress: (c / chairCount) % 1,
        laneOffsetX,
        dir,
      });
    }
  }

  // 2. Kickers (Sculpted snow ramp + painted lip strip + twin guide flags)
  const kickerSnowMat = track(
    new THREE.MeshPhysicalMaterial({
      color: map.snowBaseColor,
      normalMap: snowNormalTex,
      normalScale: new THREE.Vector2(0.32, 0.26),
      roughness: 0.68,
      metalness: 0.03,
      clearcoat: 0.12,
      envMapIntensity: 0.24,
    })
  );
  const lipStripMat = track(
    new THREE.MeshStandardMaterial({
      color: map.accentColor,
      roughness: 0.42,
      metalness: 0.12,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      emissive: map.isNight ? map.accentColor : '#000000',
      emissiveIntensity: map.isNight ? 0.5 : 0,
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
  const flagPoleGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 1.95, 6));
  const flagBannerGeo = track(new THREE.PlaneGeometry(0.7, 0.38));

  const animatedFlags: { mesh: THREE.Mesh; phase: number; baseY: number }[] = [];

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

    const lipGeo = track(new THREE.BoxGeometry(k.width * 0.94, 0.045, 0.48));
    const lipY = getBaseTerrainHeight(map, k.x, k.z - 0.25) + k.height * 0.94;
    const lip = new THREE.Mesh(lipGeo, lipStripMat);
    lip.position.set(k.x, lipY + 0.02, k.z - 0.25);
    lip.rotation.x = -0.32;
    group.add(lip);

    [-k.width * 0.5 - 0.16, k.width * 0.5 + 0.16].forEach((sideX, fIdx) => {
      const fx = k.x + sideX;
      const fz = k.z - 0.3;
      const fy = getBaseTerrainHeight(map, fx, fz) + k.height;
      const pole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
      pole.position.set(fx, fy + 0.85, fz);
      group.add(pole);

      const banner = new THREE.Mesh(flagBannerGeo, flagBannerMat);
      banner.position.set(fx + (sideX > 0 ? -0.34 : 0.34), fy + 1.58, fz);
      group.add(banner);
      animatedFlags.push({ mesh: banner, phase: k.z * 0.2 + fIdx * 1.4, baseY: fy + 1.58 });
    });
  }

  // 3. Rails & Park Boxes
  const steelMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#E2E8F0',
      roughness: 0.14,
      metalness: 0.94,
      clearcoat: 0.7,
      anisotropy: 0.8,
      envMapIntensity: 1.55,
    })
  );
  const boxTopTex = track(
    createParkGraphicTexture(map.accentColor, '#F8FAFC', maxAnisotropy)
  );
  const boxDeckMat = track(
    new THREE.MeshPhysicalMaterial({
      map: boxTopTex,
      roughness: 0.24,
      metalness: 0.35,
      clearcoat: 0.6,
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
      const tubeGeo = track(new THREE.CylinderGeometry(0.088, 0.088, beamLen, 10));
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
          emissiveIntensity: 1.85,
        })
      );
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(r.x, startY + 0.25, r.z);
      railGroup.add(beacon);
    }

    group.add(railGroup);
  }

  // 4. Bonus Slalom Gates
  const gatePoleGeo = track(new THREE.CylinderGeometry(0.068, 0.068, 2.7, 8));
  const gateBarGeo = track(new THREE.BoxGeometry(3.9, 0.4, 0.14));
  const gatePoleMat = track(
    new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.28, metalness: 0.38 })
  );
  const gateBannerMat = track(
    new THREE.MeshStandardMaterial({
      color: '#0EA5E9',
      emissive: map.isNight ? '#0EA5E9' : '#0284C7',
      emissiveIntensity: map.isNight ? 0.95 : 0.24,
      roughness: 0.35,
    })
  );

  for (const g of layout.gates) {
    const leftY = getBaseTerrainHeight(map, g.x - 1.85, g.z);
    const rightY = getBaseTerrainHeight(map, g.x + 1.85, g.z);
    const pL = new THREE.Mesh(gatePoleGeo, gatePoleMat);
    pL.position.set(g.x - 1.85, leftY + 1.2, g.z);
    pL.castShadow = true;
    const pR = new THREE.Mesh(gatePoleGeo, gatePoleMat);
    pR.position.set(g.x + 1.85, rightY + 1.2, g.z);
    pR.castShadow = true;
    const bar = new THREE.Mesh(gateBarGeo, gateBannerMat);
    bar.position.set(g.x, Math.max(leftY, rightY) + 2.38, g.z);
    group.add(pL, pR, bar);
  }

  // 4b. Collectible Floating Air & Slalom Rings
  const ringEntries = new Map<string, { group: THREE.Group; baseY: number; phase: number }>();
  if (layout.rings.length > 0) {
    const airRingGeo = track(new THREE.TorusGeometry(1.12, 0.11, 10, 24));
    const slalomRingGeo = track(new THREE.TorusGeometry(0.95, 0.095, 10, 22));
    const innerCoreGeo = track(new THREE.OctahedronGeometry(0.28, 0));

    const airRingMat = track(
      new THREE.MeshPhysicalMaterial({
        color: '#FACC15',
        emissive: '#F59E0B',
        emissiveIntensity: map.isNight ? 1.55 : 1.35,
        roughness: 0.16,
        metalness: 0.85,
        clearcoat: 0.9,
      })
    );
    const slalomRingMat = track(
      new THREE.MeshPhysicalMaterial({
        color: '#38BDF8',
        emissive: '#0EA5E9',
        emissiveIntensity: map.isNight ? 1.45 : 1.25,
        roughness: 0.18,
        metalness: 0.8,
        clearcoat: 0.9,
      })
    );
    const coreMat = track(
      new THREE.MeshBasicMaterial({
        color: '#FFFFFF',
      })
    );

    layout.rings.forEach((rg, idx) => {
      const baseY = getBaseTerrainHeight(map, rg.x, rg.z) + rg.yOffset;
      const rgGroup = new THREE.Group();
      rgGroup.position.set(rg.x, baseY, rg.z);

      const outer = new THREE.Mesh(
        rg.kind === 'air' ? airRingGeo : slalomRingGeo,
        rg.kind === 'air' ? airRingMat : slalomRingMat
      );
      const core = new THREE.Mesh(innerCoreGeo, coreMat);
      rgGroup.add(outer, core);
      group.add(rgGroup);

      ringEntries.set(rg.id, { group: rgGroup, baseY, phase: idx * 0.75 });
    });
  }

  // 5. Upgraded Multi-Part Finish Arena (omitted in Endless chunks)
  if (!range?.omitFinish) {
    const finishZ = map.lengthMeters;
    const finishY = getBaseTerrainHeight(map, 0, finishZ);
    const finishPostGeo = track(new THREE.CylinderGeometry(0.22, 0.3, 6.8, 12));
    const finishArchGeo = track(new THREE.BoxGeometry(16.2, 1.7, 0.65));
    const finishBannerTex = track(
      createFinishBannerTexture(map.accentColor, maxAnisotropy)
    );
    const finishPostMat = track(
      new THREE.MeshStandardMaterial({
        color: '#DC2626',
        roughness: 0.34,
        metalness: 0.4,
      })
    );
    const finishBannerMat = track(
      new THREE.MeshStandardMaterial({
        map: finishBannerTex,
        roughness: 0.42,
        metalness: 0.12,
      })
    );
    const archL = new THREE.Mesh(finishPostGeo, finishPostMat);
    archL.position.set(-7.6, finishY + 3.2, finishZ);
    archL.castShadow = true;
    const archR = new THREE.Mesh(finishPostGeo, finishPostMat);
    archR.position.set(7.6, finishY + 3.2, finishZ);
    archR.castShadow = true;
    const archTop = new THREE.Mesh(finishArchGeo, finishBannerMat);
    archTop.position.set(0, finishY + 6.1, finishZ);
    archTop.castShadow = true;
    group.add(archL, archR, archTop);

    // Inflatable podium corral bollards flanking finish line
    const bollardGeo = track(new THREE.CylinderGeometry(0.45, 0.55, 2.4, 12));
    const bollardMat = track(
      new THREE.MeshStandardMaterial({
        color: map.accentColor,
        roughness: 0.35,
        metalness: 0.1,
      })
    );
    [-9.5, 9.5].forEach((bx) => {
      const bollard = new THREE.Mesh(bollardGeo, bollardMat);
      bollard.position.set(bx, finishY + 1.1, finishZ - 4);
      bollard.castShadow = true;
      group.add(bollard);
    });
  }

  // 6. Instanced Organic 4-Tier Alpine Pines (Bark-Textured Trunk + Perturbed Branch Whorls + Snow Caps)
  if (layout.trees.length > 0) {
    const count = layout.trees.length;
    const barkTex = track(createBarkTexture(maxAnisotropy));
    const trunkGeo = track(new THREE.CylinderGeometry(0.16, 0.34, 2.3, 7));
    trunkGeo.translate(0, 0.55, 0);
    const trunkMat = track(
      new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.92, metalness: 0 })
    );

    const crownLowerGeo = track(createOrganicFoliageCone(1.82, 2.8, 7, 1.1));
    crownLowerGeo.translate(0, 2.25, 0);
    const crownMidGeo = track(createOrganicFoliageCone(1.48, 2.45, 7, 2.4));
    crownMidGeo.translate(0, 3.35, 0);
    const crownUpperGeo = track(createOrganicFoliageCone(1.12, 2.1, 7, 3.9));
    crownUpperGeo.translate(0, 4.45, 0);
    const crownTipGeo = track(createOrganicFoliageCone(0.75, 1.55, 7, 5.2));
    crownTipGeo.translate(0, 5.35, 0);
    const snowCapGeo = track(createOrganicFoliageCone(0.62, 1.15, 7, 5.2));
    snowCapGeo.translate(0, 5.65, 0);

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
        roughness: 0.7,
        metalness: 0.02,
      })
    );

    const trunkMesh = track(new THREE.InstancedMesh(trunkGeo, trunkMat, count));
    const lowerMesh = track(new THREE.InstancedMesh(crownLowerGeo, foliageMat, count));
    const midMesh = track(new THREE.InstancedMesh(crownMidGeo, foliageMat, count));
    const upperMesh = track(new THREE.InstancedMesh(crownUpperGeo, foliageMat, count));
    const tipMesh = track(new THREE.InstancedMesh(crownTipGeo, foliageMat, count));
    const capMesh = track(new THREE.InstancedMesh(snowCapGeo, capMat, count));
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
      dummy.position.set(t.x, y - 0.34 * t.scale, t.z);
      dummy.rotation.set((t.tint - 0.5) * 0.06, t.tint * Math.PI * 2, (t.tint - 0.5) * 0.05);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();

      trunkMesh.setMatrixAt(i, dummy.matrix);
      lowerMesh.setMatrixAt(i, dummy.matrix);
      midMesh.setMatrixAt(i, dummy.matrix);
      upperMesh.setMatrixAt(i, dummy.matrix);
      tipMesh.setMatrixAt(i, dummy.matrix);
      capMesh.setMatrixAt(i, dummy.matrix);

      instColor.copy(baseTint).lerp(altTint, t.tint);
      lowerMesh.setColorAt(i, instColor);
      midMesh.setColorAt(i, instColor);
      upperMesh.setColorAt(i, instColor);
      tipMesh.setColorAt(i, instColor);
    }

    [trunkMesh, lowerMesh, midMesh, upperMesh, tipMesh, capMesh].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
  }

  // 7. Instanced Sculpted Granite Cliff Boulders + Talus Base Rocks + Snow Caps
  if (layout.rocks.length > 0) {
    const count = layout.rocks.length;
    const rockGeo = track(createSculptedRockGeometry(0.98, 2.3));
    const talusGeo = track(createSculptedRockGeometry(0.48, 4.9));
    talusGeo.translate(0.75, -0.18, 0.42);

    const rockCapGeo = track(createSculptedRockGeometry(0.78, 2.3));
    rockCapGeo.scale(1.02, 0.42, 1.02);
    rockCapGeo.translate(0, 0.48, 0);

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
        roughness: 0.72,
        metalness: 0.02,
        flatShading: true,
      })
    );

    const rockMesh = track(new THREE.InstancedMesh(rockGeo, rockMat, count));
    const talusMesh = track(new THREE.InstancedMesh(talusGeo, rockMat, count));
    const rockCapMesh = track(new THREE.InstancedMesh(rockCapGeo, rockSnowMat, count));
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
      dummy.scale.set(r.scale * 1.18, r.scale * 0.74, r.scale * 1.08);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
      talusMesh.setMatrixAt(i, dummy.matrix);
      rockCapMesh.setMatrixAt(i, dummy.matrix);
      rockColor.setHSL(0.6, 0.12, 0.34 + (i % 5) * 0.045);
      rockMesh.setColorAt(i, rockColor);
      talusMesh.setColorAt(i, rockColor);
    }
    [rockMesh, talusMesh, rockCapMesh].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
  }

  const cloudDummy = new THREE.Object3D();
  const update = (elapsedSec: number, dt: number) => {
    snowSparkleUniforms.uTime.value = elapsedSec;

    // Spin & gently bob collectible air/slalom rings
    ringEntries.forEach((entry) => {
      entry.group.rotation.y = elapsedSec * 2.1 + entry.phase;
      entry.group.position.y = entry.baseY + Math.sin(elapsedSec * 2.8 + entry.phase) * 0.18;
    });

    // Flutter kicker guide flags in alpine wind
    for (let i = 0; i < animatedFlags.length; i++) {
      const fl = animatedFlags[i];
      fl.mesh.rotation.y = Math.sin(elapsedSec * 6.5 + fl.phase) * 0.26;
      fl.mesh.position.y = fl.baseY + Math.sin(elapsedSec * 4.2 + fl.phase) * 0.03;
    }

    // Drift 3D alpine valley cloud puffs gently across mountain ridges
    if (cloudInst) {
      for (let i = 0; i < cloudItems.length; i++) {
        const c = cloudItems[i];
        const driftX = Math.sin(elapsedSec * 0.06 * c.speed + i * 0.7) * 8.5;
        const bobY = Math.cos(elapsedSec * 0.18 + i) * 0.65;
        cloudDummy.position.set(c.baseX + driftX, c.baseY + bobY, c.baseZ);
        cloudDummy.scale.set(c.sx, c.sy, c.sz);
        cloudDummy.updateMatrix();
        cloudInst.setMatrixAt(i, cloudDummy.matrix);
      }
      cloudInst.instanceMatrix.needsUpdate = true;
    }

    // Rise & dissipate chimney smoke above start lodge
    for (let i = 0; i < smokePuffs.length; i++) {
      const sp = smokePuffs[i];
      const t = (elapsedSec * 0.28 + sp.phase) % 1;
      sp.mesh.position.set(
        sp.baseX + Math.sin(elapsedSec * 1.4 + i) * 0.25 + t * 0.9,
        sp.baseY + t * 3.8,
        sp.baseZ - t * 0.6
      );
      sp.mesh.scale.setScalar((0.6 + t * 1.35) * (1 - t * 0.35));
    }

    // Move chairlift cabins smoothly along the haul cables
    if (animatedChairs.length > 0 && cableMaxZ > cableMinZ) {
      const span = cableMaxZ - cableMinZ;
      for (let i = 0; i < animatedChairs.length; i++) {
        const ch = animatedChairs[i];
        ch.progress = (ch.progress + (ch.dir * dt * 4.5) / span + 1) % 1;
        const cz = cableMinZ + ch.progress * span;
        const cy = getBaseTerrainHeight(map, liftX, cz) + 10.35;
        ch.group.position.set(ch.laneOffsetX, cy, cz);
      }
    }
  };

  const collectRing = (id: string) => {
    const entry = ringEntries.get(id);
    if (entry) {
      entry.group.visible = false;
      ringEntries.delete(id);
    }
  };

  return {
    group,
    update,
    collectRing,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
