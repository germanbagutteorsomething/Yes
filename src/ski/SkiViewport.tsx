import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ENDLESS_CHUNK_LENGTH,
  generateEndlessChunk,
  generateParkLayout,
  getBaseTerrainHeight,
  getSkiGearById,
  getSkiMapById,
  getTerrainAndRampHeight,
  getTerrainSlopeNormal,
} from '../data/skiMaps';
import type {
  SkiCameraMode,
  SkiGhostSample,
  SkiGrabType,
  SkiHudSnapshot,
  SkiInputState,
  SkiMapId,
  SkiMedalTier,
  SkiParkLayout,
  SkiPhase,
  SkiRailFeature,
  SkiRunCompletionPayload,
} from '../types/ski';
import { playSkiSound } from '../utils/skiAudio';
import {
  buildMountainEnvironment,
  createGhostSkierRig,
  createSkierRig,
  createSkyDome,
  createSnowNormalTexture,
  createSnowTexture,
  updateSkierPose,
  type BuiltParkScene,
} from './skierModel';

interface SkiViewportProps {
  mapId: SkiMapId;
  gearId: string;
  phase: SkiPhase;
  runSeed: number;
  soundEnabled: boolean;
  cameraMode: SkiCameraMode;
  ghostEnabled?: boolean;
  ghostSamples?: SkiGhostSample[];
  inputRef: React.MutableRefObject<SkiInputState>;
  onHudUpdate: (snapshot: SkiHudSnapshot) => void;
  onFinishRun: (payload: SkiRunCompletionPayload) => void;
  onTogglePause: () => void;
  onCycleCamera: () => void;
}

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _dummy = new THREE.Object3D();

interface SnowParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  tone: 'snow' | 'spark' | 'boost';
}

function formatLiveTrick(params: {
  spinDeg: number;
  flipDeg: number;
  grab: SkiGrabType;
  isGrinding: boolean;
  railStyle?: SkiRailFeature['style'];
}): { label: string; basePoints: number; isCork: boolean } {
  const { spinDeg, flipDeg, grab, isGrinding, railStyle } = params;

  if (isGrinding) {
    const railName =
      railStyle === 'box'
        ? 'Rainbow Box Slide'
        : railStyle === 'kink'
          ? 'Kink Rail 50-50'
          : 'Steel Lipslide';
    return { label: railName, basePoints: 260, isCork: false };
  }

  const absSpin = Math.abs(spinDeg);
  const absFlip = Math.abs(flipDeg);

  const spinSnapped = Math.round(absSpin / 180) * 180;
  const flipCount = Math.round(absFlip / 360);
  const isCork = absSpin >= 240 && absFlip >= 210;

  const parts: string[] = [];
  let points = 0;

  if (isCork) {
    const corkDeg = Math.max(360, spinSnapped);
    const styleName =
      flipCount >= 2
        ? 'Double Cork'
        : flipDeg < 0 && spinDeg < 0
          ? 'Rodeo'
          : flipDeg > 0 && absSpin >= 540
            ? 'Misty'
            : 'Cork';
    parts.push(`${styleName} ${corkDeg}`);
    points += corkDeg * 1.65 + flipCount * 580;
  } else if (flipCount >= 1) {
    const dir = flipDeg < 0 ? 'Backflip' : 'Frontflip';
    const flipLabel = flipCount >= 2 ? `Double ${dir}` : dir;
    if (spinSnapped >= 180) {
      parts.push(`${flipLabel} ${spinSnapped}`);
      points += flipCount * 650 + spinSnapped * 1.3;
    } else {
      parts.push(flipLabel);
      points += flipCount * 620;
    }
  } else if (spinSnapped >= 180) {
    parts.push(`${spinSnapped}`);
    points += spinSnapped * 1.25;
  } else if (grab !== 'none') {
    parts.push('Straight Air');
    points += 180;
  }

  if (grab !== 'none') {
    const grabNames: Record<Exclude<SkiGrabType, 'none'>, string> = {
      mute: 'Mute Grab',
      safety: 'Safety Grab',
      tail: 'Tail Grab',
      japan: 'Japan Grab',
    };
    parts.push(grabNames[grab]);
    points = Math.round(points * 1.35 + 160);
  }

  return {
    label: parts.join(' + '),
    basePoints: Math.round(points),
    isCork,
  };
}

function wrapAngleErrorDeg(deg: number, stepDeg: number): number {
  const mod = ((deg % stepDeg) + stepDeg) % stepDeg;
  return Math.min(mod, stepDeg - mod);
}

export const SkiViewport: React.FC<SkiViewportProps> = ({
  mapId,
  gearId,
  phase,
  runSeed,
  soundEnabled,
  cameraMode,
  ghostEnabled = true,
  ghostSamples,
  inputRef,
  onHudUpdate,
  onFinishRun,
  onTogglePause,
  onCycleCamera,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;
  const ghostSamplesRef = useRef(ghostSamples);
  ghostSamplesRef.current = ghostSamples;
  const ghostEnabledRef = useRef(ghostEnabled);
  ghostEnabledRef.current = ghostEnabled;
  const onHudRef = useRef(onHudUpdate);
  onHudRef.current = onHudUpdate;
  const onFinishRef = useRef(onFinishRun);
  onFinishRef.current = onFinishRun;
  const onTogglePauseRef = useRef(onTogglePause);
  onTogglePauseRef.current = onTogglePause;
  const onCycleCameraRef = useRef(onCycleCamera);
  onCycleCameraRef.current = onCycleCamera;

  // Keyboard listener bound cleanly once
  useEffect(() => {
    const downKeys = new Set<string>();

    const syncInput = () => {
      const inp = inputRef.current;
      inp.left = downKeys.has('ArrowLeft') || downKeys.has('KeyA');
      inp.right = downKeys.has('ArrowRight') || downKeys.has('KeyD');
      inp.up = downKeys.has('ArrowUp') || downKeys.has('KeyW');
      inp.down = downKeys.has('ArrowDown') || downKeys.has('KeyS');
      inp.jumpHeld = downKeys.has('Space');
      inp.boostHeld = downKeys.has('KeyB') || downKeys.has('KeyF');

      if (downKeys.has('KeyJ') || downKeys.has('ShiftLeft') || downKeys.has('ShiftRight')) {
        inp.grab = 'mute';
      } else if (downKeys.has('KeyK') || downKeys.has('KeyE')) {
        inp.grab = 'tail';
      } else if (downKeys.has('KeyL') || downKeys.has('KeyQ')) {
        inp.grab = 'japan';
      } else {
        inp.grab = 'none';
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'playing' && phaseRef.current !== 'paused') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)
      ) {
        e.preventDefault();
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!e.repeat) onTogglePauseRef.current();
        return;
      }
      if (e.code === 'KeyC' && !e.repeat) {
        onCycleCameraRef.current();
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        inputRef.current.jumpPressed = true;
      }

      downKeys.add(e.code);
      syncInput();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      downKeys.delete(e.code);
      syncInput();
    };

    const onBlur = () => {
      downKeys.clear();
      syncInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [inputRef]);

  // Direct canvas swipe-up to Ollie gesture (natural touch shortcut on mobile/tablet)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let swipePointerId: number | null = null;
    let startY = 0;
    let triggered = false;

    const onPointerDown = (e: PointerEvent) => {
      if (phaseRef.current !== 'playing') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      swipePointerId = e.pointerId;
      startY = e.clientY;
      triggered = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (swipePointerId !== e.pointerId || triggered) return;
      const dy = e.clientY - startY;
      if (dy < -24) {
        triggered = true;
        inputRef.current.jumpPressed = true;
        inputRef.current.jumpHeld = true;
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (swipePointerId !== e.pointerId) return;
      if (triggered) {
        inputRef.current.jumpHeld = false;
      }
      swipePointerId = null;
      triggered = false;
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerEnd);
    container.addEventListener('pointercancel', onPointerEnd);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerEnd);
      container.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [inputRef]);

  // Isolated Three.js scene lifecycle per map/gear/runSeed
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const map = getSkiMapById(mapId);
    const gear = getSkiGearById(gearId);
    const layout = generateParkLayout(map);

    // Detect software WebGL cleanly
    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL is unavailable in this browser context.');
      return;
    }

    setWebglError(null);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = map.isNight ? 1.15 : 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 540;
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('3D graphics context paused. Waiting to restore…');
    };
    const handleContextRestored = () => {
      setWebglError(null);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // Scene + Atmosphere + Procedural Sky Dome + RoomEnvironment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(map.skyColor);
    scene.fog = new THREE.FogExp2(map.horizonColor, map.fogDensity);

    const skyDome = createSkyDome(map);
    scene.add(skyDome.mesh);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // Camera
    const camera = new THREE.PerspectiveCamera(64, width / height, 0.2, 460);

    // 3-Point Warm/Cool Alpine Lighting Rig
    const hemiLight = new THREE.HemisphereLight(map.ambientSky, map.ambientGround, map.isNight ? 0.9 : 1.0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(map.sunColor, map.sunIntensity);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 96;
    const shadowBound = 28;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const rimLight = new THREE.DirectionalLight(map.isNight ? '#38BDF8' : '#E0F2FE', 0.52);
    rimLight.position.set(-22, 20, 26);
    scene.add(rimLight);

    // Build Mountain World (Fixed Park or Infinite Streaming Endless Chunks) + Skier + Ghost
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const endlessChunks = new Map<number, { layout: SkiParkLayout; built: BuiltParkScene }>();
    let sharedSnowTex: THREE.CanvasTexture | null = null;
    let sharedSnowNormalTex: THREE.DataTexture | null = null;
    let parkScene: BuiltParkScene | null = null;

    const rebuildActiveLayout = () => {
      layout.kickers = [];
      layout.rails = [];
      layout.trees = [];
      layout.rocks = [];
      layout.gates = [];
      layout.rings = [];
      endlessChunks.forEach((ch) => {
        layout.kickers.push(...ch.layout.kickers);
        layout.rails.push(...ch.layout.rails);
        layout.trees.push(...ch.layout.trees);
        layout.rocks.push(...ch.layout.rocks);
        layout.gates.push(...ch.layout.gates);
        layout.rings.push(...ch.layout.rings);
      });
    };

    const ensureEndlessChunk = (chunkIdx: number) => {
      if (endlessChunks.has(chunkIdx)) return;
      if (!sharedSnowTex) {
        sharedSnowTex = createSnowTexture(map.snowBaseColor, map.snowRidgeColor, maxAniso);
        sharedSnowTex.repeat.set(16, 48);
      }
      if (!sharedSnowNormalTex) {
        sharedSnowNormalTex = createSnowNormalTexture(maxAniso);
        sharedSnowNormalTex.repeat.set(16, 48);
      }
      const chunkLayout = generateEndlessChunk(map, chunkIdx, runSeed);
      const zStart = chunkIdx * ENDLESS_CHUNK_LENGTH;
      const built = buildMountainEnvironment(map, chunkLayout, maxAniso, {
        zStart,
        zEnd: zStart + ENDLESS_CHUNK_LENGTH,
        omitFinish: true,
        sharedSnowTex,
        sharedSnowNormalTex,
      });
      scene.add(built.group);
      endlessChunks.set(chunkIdx, { layout: chunkLayout, built });
      rebuildActiveLayout();
    };

    if (map.isEndless) {
      ensureEndlessChunk(0);
      ensureEndlessChunk(1);
    } else {
      parkScene = buildMountainEnvironment(map, layout, maxAniso);
      scene.add(parkScene.group);
    }

    const skier = createSkierRig(gear);
    scene.add(skier.root);
    scene.add(skier.shadowMesh);

    const activeGhostSamples = ghostSamplesRef.current;
    const showGhost =
      ghostEnabledRef.current &&
      !map.isEndless &&
      Boolean(activeGhostSamples && activeGhostSamples.length > 1);
    const ghostRig = showGhost ? createGhostSkierRig() : null;
    if (ghostRig) {
      scene.add(ghostRig.root);
    }

    // Sculpted Powder Puff + Rail Spark + Turbo Boost Particle Pool (InstancedMesh)
    const PARTICLE_COUNT = 240;
    const partGeo = new THREE.IcosahedronGeometry(0.11, 0);
    const partMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
    const particleMesh = new THREE.InstancedMesh(partGeo, partMat, PARTICLE_COUNT);
    particleMesh.frustumCulled = false;
    particleMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(PARTICLE_COUNT * 3),
      3
    );

    // Dynamic Carved Twin-Ski Tracks on Snow (InstancedMesh)
    const TRACK_COUNT = 240;
    const trackGeo = new THREE.PlaneGeometry(0.16, 0.96);
    trackGeo.rotateX(-Math.PI / 2);
    const trackMat = new THREE.MeshBasicMaterial({
      color: map.snowRidgeColor,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const trackMesh = new THREE.InstancedMesh(trackGeo, trackMat, TRACK_COUNT);
    trackMesh.frustumCulled = false;
    for (let i = 0; i < TRACK_COUNT; i++) {
      _dummy.position.set(0, -999, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      trackMesh.setMatrixAt(i, _dummy.matrix);
    }
    trackMesh.instanceMatrix.needsUpdate = true;
    scene.add(trackMesh);
    let trackCursor = 0;
    let lastTrackZ = -10;

    // Ambient Falling Alpine Snow Flurries (InstancedMesh)
    const FLURRY_COUNT = 110;
    const flurryGeo = new THREE.OctahedronGeometry(0.055, 0);
    const flurryMat = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: map.isNight ? 0.58 : 0.72,
    });
    const flurryMesh = new THREE.InstancedMesh(flurryGeo, flurryMat, FLURRY_COUNT);
    flurryMesh.frustumCulled = false;
    const flurries = Array.from({ length: FLURRY_COUNT }, (_, i) => ({
      dx: ((i * 37) % 44) - 22,
      dy: ((i * 19) % 16) + 1,
      dz: ((i * 53) % 46) - 6,
      fallSpeed: 1.8 + (i % 5) * 0.45,
      driftPhase: i * 0.7,
    }));
    scene.add(flurryMesh);
    const particles: SnowParticle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      active: false,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.4,
      scale: 0,
      tone: 'snow',
    }));
    const snowTintColor = new THREE.Color('#FFFFFF');
    const sparkTintColor = new THREE.Color('#FACC15');
    const boostTintColor = new THREE.Color('#38BDF8');
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      _dummy.position.set(0, -999, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      particleMesh.setMatrixAt(i, _dummy.matrix);
      particleMesh.setColorAt(i, snowTintColor);
    }
    particleMesh.instanceMatrix.needsUpdate = true;
    particleMesh.instanceColor.needsUpdate = true;
    scene.add(particleMesh);

    let particleCursor = 0;
    const spawnParticle = (
      px: number,
      py: number,
      pz: number,
      vx: number,
      vy: number,
      vz: number,
      tone: SnowParticle['tone']
    ) => {
      const p = particles[particleCursor];
      particleCursor = (particleCursor + 1) % PARTICLE_COUNT;
      p.active = true;
      p.x = px;
      p.y = py;
      p.z = pz;
      p.vx = vx;
      p.vy = vy;
      p.vz = vz;
      p.life = 0;
      p.maxLife =
        tone === 'spark'
          ? 0.28 + Math.random() * 0.16
          : tone === 'boost'
            ? 0.24 + Math.random() * 0.14
            : 0.38 + Math.random() * 0.25;
      p.scale =
        tone === 'spark'
          ? 0.78
          : tone === 'boost'
            ? 0.95 + Math.random() * 0.45
            : 1.05 + Math.random() * 0.85;
      p.tone = tone;
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const COMBO_WINDOW_SEC = 3.5;
    const bronzeTarget = Math.round(map.targetScore * 0.5);
    const silverTarget = map.targetScore;
    const goldTarget = Math.round(map.targetScore * 1.6);

    const computeMedalState = (
      scoreVal: number
    ): { medal: SkiMedalTier; nextLabel: string; nextTarget: number } => {
      if (scoreVal >= goldTarget) {
        return { medal: 'gold', nextLabel: 'Gold Cleared', nextTarget: goldTarget };
      }
      if (scoreVal >= silverTarget) {
        return { medal: 'silver', nextLabel: 'Gold', nextTarget: goldTarget };
      }
      if (scoreVal >= bronzeTarget) {
        return { medal: 'bronze', nextLabel: 'Silver', nextTarget: silverTarget };
      }
      return { medal: 'none', nextLabel: 'Bronze', nextTarget: bronzeTarget };
    };

    // Physics State
    const startY = getBaseTerrainHeight(map, 0, 0);
    const state = {
      x: 0,
      y: startY,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 14,
      heading: 0,
      carveRoll: 0,
      onGround: true,
      wasOnKicker: false,
      lastKickerSlope: 0,
      airtime: 0,
      airSpinRad: 0,
      airFlipRad: 0,
      airCorkTilt: 0,
      bestGrabInAir: 'none' as SkiGrabType,
      grindingRail: null as SkiRailFeature | null,
      grindPointsAccum: 0,
      grindSparkCooldown: 0,
      bailTimer: 0,
      score: 0,
      comboScore: 0,
      comboTrickBase: 0,
      comboRailBase: 0,
      comboGateBase: 0,
      comboMultiplier: 1,
      comboTimer: 0,
      maxCombo: 1,
      bestTrickName: '',
      bestTrickPoints: 0,
      topSpeedKmh: 0,
      railsHit: 0,
      cleanLandings: 0,
      bails: 0,
      corksLanded: 0,
      switchLandings: 0,
      trickScoreTotal: 0,
      railScoreTotal: 0,
      flowScoreTotal: 0,
      gatesCleared: 0,
      boostCharge: 50,
      isBoosting: false,
      boostSfxCooldown: 0,
      ringsCollected: 0,
      closeCalls: 0,
      landingSquash: 0,
      unlockedMedal: 'none' as SkiMedalTier,
      finished: false,
      runElapsedSec: 0,
      ghostSampleTimer: 0,
      ghostDeltaMeters: null as number | null,
      recordedGhost: [[0, 0, startY, 0]] as SkiGhostSample[],
      passedGates: new Set<string>(),
      collectedRings: new Set<string>(),
      nearMissedObstacles: new Set<string>(),
      hitRails: new Set<string>(),
      calloutText: '',
      calloutSubtext: '',
      calloutTone: 'clean' as SkiHudSnapshot['calloutTone'],
      calloutNonce: 0,
      calloutTimer: 0,
    };

    // Initialize camera behind skier
    camera.position.set(0, startY + 4.4, -8.5);
    camera.lookAt(0, startY + 1.2, 12);

    const evaluateCompletedObjectives = (): string[] => {
      const dist = Math.round(state.z);
      const out: string[] = [];
      if (map.id === 'the-yard') {
        if (state.corksLanded >= 1) out.push('yard-cork');
        if (state.railsHit >= 3) out.push('yard-rails');
        if (state.score >= 8000) out.push('yard-silver');
      } else if (map.id === 'forest-line') {
        if (state.bails === 0) out.push('forest-clean');
        if (state.bestTrickPoints >= 2200) out.push('forest-trick');
        if (state.score >= 14000) out.push('forest-silver');
      } else if (map.id === 'aspen-pipe') {
        if (state.switchLandings >= 2) out.push('pipe-switch');
        if (state.corksLanded >= 2) out.push('pipe-corks');
        if (state.score >= 20000) out.push('pipe-silver');
      } else if (map.id === 'apex-night') {
        if (state.gatesCleared >= 3) out.push('apex-gates');
        if (state.topSpeedKmh >= 125) out.push('apex-speed');
        if (state.score >= 26000) out.push('apex-silver');
      } else if (map.id === 'endless') {
        if (dist >= 1500) out.push('endless-1500');
        if (dist >= 3000) out.push('endless-3000');
        if (state.score >= 25000) out.push('endless-score');
      }
      return out;
    };

    const buildSnapshot = (
      liveLabel: string,
      livePoints: number,
      grab: SkiGrabType,
      speedKmh: number
    ): SkiHudSnapshot => {
      const projectedTotal =
        state.score + state.comboScore * state.comboMultiplier;
      const medalInfo = computeMedalState(projectedTotal);
      const dist = map.isEndless
        ? Math.max(0, Math.round(state.z))
        : Math.min(map.lengthMeters, Math.max(0, Math.round(state.z)));
      return {
        score: Math.round(state.score),
        comboScore: Math.round(state.comboScore),
        comboMultiplier: state.comboMultiplier,
        comboTimeRatio:
          state.comboScore > 0 ? Math.max(0, Math.min(1, state.comboTimer / COMBO_WINDOW_SEC)) : 0,
        speedKmh: Math.round(speedKmh),
        distanceMeters: dist,
        lengthMeters: map.isEndless ? dist : map.lengthMeters,
        progressPct: map.isEndless
          ? Math.min(100, ((dist % 1000) / 1000) * 100)
          : Math.min(100, Math.max(0, (state.z / map.lengthMeters) * 100)),
        isEndless: Boolean(map.isEndless),
        isAirborne: !state.onGround && !state.grindingRail,
        isGrinding: Boolean(state.grindingRail),
        isBailing: state.bailTimer > 0,
        airtime: state.airtime,
        spinDeg: Math.round(THREE.MathUtils.radToDeg(Math.abs(state.airSpinRad))),
        flipDeg: Math.round(THREE.MathUtils.radToDeg(Math.abs(state.airFlipRad))),
        grab,
        liveTrickText: liveLabel,
        liveTrickPoints: Math.round(livePoints),
        calloutText: state.calloutTimer > 0 ? state.calloutText : '',
        calloutSubtext: state.calloutTimer > 0 ? state.calloutSubtext : '',
        calloutTone: state.calloutTone,
        calloutNonce: state.calloutNonce,
        bestTrickName: state.bestTrickName,
        bestTrickPoints: Math.round(state.bestTrickPoints),
        maxCombo: state.maxCombo,
        topSpeedKmh: Math.round(state.topSpeedKmh),
        railsHit: state.railsHit,
        cleanLandings: state.cleanLandings,
        bails: state.bails,
        corksLanded: state.corksLanded,
        switchLandings: state.switchLandings,
        trickScoreTotal: Math.round(state.trickScoreTotal),
        railScoreTotal: Math.round(state.railScoreTotal),
        flowScoreTotal: Math.round(state.flowScoreTotal),
        gatesCleared: state.gatesCleared,
        totalGates: map.isEndless ? Math.max(state.gatesCleared, 6) : layout.gates.length,
        boostCharge: Math.round(state.boostCharge),
        isBoosting: state.isBoosting,
        ringsCollected: state.ringsCollected,
        closeCalls: state.closeCalls,
        medalEarned: medalInfo.medal,
        nextMedalLabel: medalInfo.nextLabel,
        nextMedalTarget: medalInfo.nextTarget,
        ghostDeltaMeters: state.ghostDeltaMeters,
        cameraMode: cameraModeRef.current,
      };
    };

    const triggerCallout = (
      text: string,
      subtext: string,
      tone: SkiHudSnapshot['calloutTone']
    ) => {
      state.calloutText = text;
      state.calloutSubtext = subtext;
      state.calloutTone = tone;
      state.calloutNonce += 1;
      state.calloutTimer = 1.9;
    };

    const checkMedalUnlock = () => {
      const m = computeMedalState(state.score).medal;
      const rank: Record<SkiMedalTier, number> = {
        none: 0,
        bronze: 1,
        silver: 2,
        gold: 3,
      };
      if (rank[m] > rank[state.unlockedMedal]) {
        state.unlockedMedal = m;
        const label = m === 'gold' ? 'GOLD MEDAL!' : m === 'silver' ? 'SILVER MEDAL!' : 'BRONZE MEDAL!';
        triggerCallout(label, `${Math.round(state.score).toLocaleString()} pts`, 'clean');
        playSkiSound('gate', soundRef.current);
      }
    };

    const bankCombo = (silent = false) => {
      if (state.comboScore > 0) {
        const mult = state.comboMultiplier;
        const tPts = state.comboTrickBase * mult;
        const rPts = state.comboRailBase * mult;
        const gPts = state.comboGateBase * mult;
        const banked = Math.round(tPts + rPts + gPts);
        state.trickScoreTotal += tPts;
        state.railScoreTotal += rPts;
        state.flowScoreTotal += gPts;
        state.score += banked;
        state.comboScore = 0;
        state.comboTrickBase = 0;
        state.comboRailBase = 0;
        state.comboGateBase = 0;
        state.comboMultiplier = 1;
        state.comboTimer = 0;
        if (!silent && banked >= 350) {
          triggerCallout('COMBO BANKED!', `+${banked.toLocaleString()} (${mult}x)`, 'clean');
          playSkiSound('stomp', soundRef.current, mult);
        }
        checkMedalUnlock();
      }
    };

    const triggerBail = (reasonText: string) => {
      if (state.bailTimer > 0 || state.finished) return;
      state.bailTimer = 1.05;
      state.bails += 1;
      state.comboScore = 0;
      state.comboTrickBase = 0;
      state.comboRailBase = 0;
      state.comboGateBase = 0;
      state.comboMultiplier = 1;
      state.comboTimer = 0;
      state.grindingRail = null;
      state.airSpinRad = 0;
      state.airFlipRad = 0;
      state.airCorkTilt = 0;
      state.airtime = 0;
      state.isBoosting = false;
      state.vz = Math.max(9, state.vz * 0.42);
      state.vx *= 0.35;
      cameraShake = 0.55;
      triggerCallout('WIPEOUT!', reasonText, 'bail');
      playSkiSound('bail', soundRef.current);

      for (let i = 0; i < 22; i++) {
        spawnParticle(
          state.x + (Math.random() - 0.5) * 0.8,
          state.y + 0.5,
          state.z + (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 8,
          2.5 + Math.random() * 5,
          state.vz * 0.3 + (Math.random() - 0.5) * 5,
          'snow'
        );
      }

      if (map.isEndless) {
        state.finished = true;
        const speedKmh = Math.hypot(state.vx, state.vz) * 3.6;
        onFinishRef.current({
          hud: buildSnapshot('', 0, 'none', speedKmh),
          ghostSamples: [],
          completedObjectiveIds: evaluateCompletedObjectives(),
          finishedByWipeout: true,
        });
      }
    };

    // Resize observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 960;
      const h = container.clientHeight || 540;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let hudEmitTimer = 0;
    let cameraShake = 0;
    let elapsedSec = 0;

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;

      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      elapsedSec += dt;

      const inp = inputRef.current;
      const isPlaying = phaseRef.current === 'playing' && !state.finished;

      if (isPlaying) {
        state.runElapsedSec += dt;
        if (state.calloutTimer > 0) {
          state.calloutTimer = Math.max(0, state.calloutTimer - dt);
        }

        // Stream Endless chunks ahead & recycle distant chunks behind
        if (map.isEndless) {
          const curChunk = Math.max(0, Math.floor(state.z / ENDLESS_CHUNK_LENGTH));
          ensureEndlessChunk(curChunk);
          ensureEndlessChunk(curChunk + 1);
          const staleChunk = curChunk - 2;
          if (staleChunk >= 0 && endlessChunks.has(staleChunk)) {
            const stale = endlessChunks.get(staleChunk)!;
            scene.remove(stale.built.group);
            stale.built.dispose();
            endlessChunks.delete(staleChunk);
            rebuildActiveLayout();
          }
        } else {
          // Sample compact ghost keyframes every ~0.35s
          state.ghostSampleTimer += dt;
          if (state.ghostSampleTimer >= 0.35) {
            state.ghostSampleTimer = 0;
            state.recordedGhost.push([
              Number(state.runElapsedSec.toFixed(2)),
              Number(state.x.toFixed(2)),
              Number(state.y.toFixed(2)),
              Number(state.z.toFixed(2)),
            ]);
          }
        }

        const jumpTriggered = inp.jumpPressed;
        inp.jumpPressed = false;

        if (state.bailTimer > 0) {
          state.bailTimer = Math.max(0, state.bailTimer - dt);
        }

        const terrainInfo = getTerrainAndRampHeight(map, layout, state.x, state.z);
        const groundY = terrainInfo.height;

        // 1. Rail Grind Update
        if (state.grindingRail) {
          const rail = state.grindingRail;
          state.x = THREE.MathUtils.damp(state.x, rail.x, 16, dt);
          state.vx = 0;
          state.vz = Math.max(17, state.vz * (1 - 0.08 * dt));
          state.z += state.vz * dt;
          state.y = getBaseTerrainHeight(map, rail.x, state.z) + rail.height + 0.14;
          state.vy = 0;
          state.onGround = false;

          const addPts = 280 * dt;
          state.grindPointsAccum += addPts;
          state.comboRailBase += addPts;
          state.comboScore += addPts;
          state.comboTimer = COMBO_WINDOW_SEC;

          state.grindSparkCooldown -= dt;
          if (state.grindSparkCooldown <= 0) {
            state.grindSparkCooldown = 0.04;
            state.boostCharge = Math.min(100, state.boostCharge + 1.2);
            playSkiSound('grind', soundRef.current);
            spawnParticle(
              state.x + (Math.random() - 0.5) * 0.28,
              state.y,
              state.z - 0.3,
              (Math.random() - 0.5) * 4.2,
              1.6 + Math.random() * 2.5,
              state.vz * 0.4,
              'spark'
            );
          }

          if (jumpTriggered) {
            // Pop off rail into air!
            state.grindingRail = null;
            state.vy = 7.6;
            state.onGround = false;
            state.airtime = 0.05;
            state.comboMultiplier = Math.min(10, state.comboMultiplier + 1);
            state.maxCombo = Math.max(state.maxCombo, state.comboMultiplier);
            playSkiSound('ollie', soundRef.current);
          } else if (state.z > rail.z + rail.length) {
            // Clean exit off end of rail
            state.grindingRail = null;
            state.onGround = false;
            state.vy = 2.4;
            state.airtime = 0.05;
            state.comboMultiplier = Math.min(10, state.comboMultiplier + 1);
            state.maxCombo = Math.max(state.maxCombo, state.comboMultiplier);
            triggerCallout(
              'RAIL CLEAN!',
              `+${Math.round(state.grindPointsAccum * (state.comboMultiplier - 1)).toLocaleString()} · ${state.comboMultiplier}x`,
              'grind'
            );
            state.grindPointsAccum = 0;
          }
        } else if (state.onGround) {
          // 2. Ground Carving, Turbo Boost & Kicker Launch Physics (Keyboard + Analog Thumbstick)
          const rawSteer = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
          const steerAxis =
            Math.abs(inp.analogX) > 0.08 ? -inp.analogX : rawSteer;

          const tuckAmount = Math.max(
            inp.up && !inp.down ? 1 : 0,
            inp.analogY > 0.22 ? inp.analogY : 0
          );
          const brakeAmount = Math.max(
            inp.down && !inp.up ? 1 : 0,
            inp.analogY < -0.25 ? -inp.analogY : 0
          );
          const tucking = tuckAmount > 0.15 && brakeAmount < 0.15 && state.bailTimer <= 0;

          if (state.boostSfxCooldown > 0) state.boostSfxCooldown = Math.max(0, state.boostSfxCooldown - dt);
          const wantsBoost = inp.boostHeld && state.bailTimer <= 0 && brakeAmount < 0.2;
          if (wantsBoost && state.boostCharge > (state.isBoosting ? 1 : 12)) {
            if (!state.isBoosting && state.boostSfxCooldown <= 0) {
              playSkiSound('boost', soundRef.current);
              state.boostSfxCooldown = 0.55;
            }
            state.isBoosting = true;
            state.boostCharge = Math.max(0, state.boostCharge - 32 * dt);
          } else {
            state.isBoosting = false;
          }

          if (state.bailTimer <= 0) {
            state.heading = THREE.MathUtils.clamp(
              state.heading + steerAxis * 2.08 * dt,
              -0.96,
              0.96
            );
            if (Math.abs(steerAxis) < 0.06) {
              state.heading = THREE.MathUtils.damp(state.heading, 0, 2.2, dt);
            }
          }

          // Combo window countdown on snow
          if (state.comboScore > 0) {
            state.comboTimer -= dt;
            if (state.comboTimer <= 0) {
              bankCombo();
            }
          }

          // Forward speed acceleration down pitch
          const gravityAccel =
            map.slopePitch * 23.5 +
            tuckAmount * 10.5 +
            (state.isBoosting ? 22.0 : 0) -
            brakeAmount * 18;
          const drag = 0.011 * state.vz * state.vz * (tucking || state.isBoosting ? 0.62 : 1.0);
          const maxForwardSpeed = state.isBoosting ? 46.5 : tucking ? 37.5 : 31.5;
          const forwardSpeed = THREE.MathUtils.clamp(
            Math.hypot(state.vx, state.vz) + (gravityAccel - drag) * dt,
            brakeAmount > 0.35 ? 7.5 : 13.5,
            maxForwardSpeed
          );

          state.vx = Math.sin(state.heading) * forwardSpeed;
          state.vz = Math.cos(state.heading) * forwardSpeed;
          state.carveRoll = THREE.MathUtils.damp(
            state.carveRoll,
            -steerAxis * 0.46,
            10,
            dt
          );

          // Continuous Carving & Speed Flow Score (doubled during Turbo Boost)
          const curKmh = forwardSpeed * 3.6;
          if (state.bailTimer <= 0 && curKmh > 52) {
            const carveBonus = Math.abs(steerAxis) > 0.25 ? 1.35 : 1.0;
            const boostFlowMult = state.isBoosting ? 2.0 : 1.0;
            const flowPts = (curKmh - 42) * 0.9 * carveBonus * boostFlowMult * dt;
            state.flowScoreTotal += flowPts;
            state.score += flowPts;
            checkMedalUnlock();
          }

          state.x += state.vx * dt;
          state.z += state.vz * dt;

          // Keep skier inside outer mountain canyon walls
          const maxLat = map.halfWidth + 4.5;
          if (Math.abs(state.x) > maxLat) {
            state.x = Math.sign(state.x) * maxLat;
            state.heading *= -0.4;
          }

          // Dual-Edge Snow Carve Spray Plumes + Cyan Boost Trails
          if (Math.abs(steerAxis) > 0.2 && state.bailTimer <= 0 && Math.random() < 0.85) {
            const sprayDir = Math.sign(steerAxis);
            spawnParticle(
              state.x - sprayDir * 0.26,
              groundY + 0.08,
              state.z - 0.55,
              -sprayDir * (2.6 + Math.random() * 2.8),
              1.2 + Math.random() * 1.9,
              state.vz * 0.35,
              state.isBoosting ? 'boost' : 'snow'
            );
          }
          if (state.isBoosting && Math.random() < 0.78) {
            [-0.21, 0.21].forEach((offset) => {
              spawnParticle(
                state.x + offset,
                groundY + 0.08,
                state.z - 0.85,
                (Math.random() - 0.5) * 1.1,
                0.5 + Math.random() * 0.9,
                state.vz * 0.25,
                'boost'
              );
            });
          }

          const nextTerrain = getTerrainAndRampHeight(map, layout, state.x, state.z);

          // Check kicker lip launch!
          if (state.wasOnKicker && !nextTerrain.isOnKicker) {
            const popBonus = jumpTriggered || inp.jumpHeld ? 3.2 : 1.1;
            const slopeBoost = Math.max(0.24, state.lastKickerSlope);
            state.vy = state.vz * slopeBoost + popBonus;
            state.onGround = false;
            state.airtime = 0.02;
            state.airSpinRad = 0;
            state.airFlipRad = 0;
            state.airCorkTilt = 0;
            state.bestGrabInAir = 'none';
            playSkiSound('ollie', soundRef.current);
          } else if (
            map.hasSuperpipe &&
            Math.abs(state.x) > 12.2 &&
            Math.abs(state.vx) > 6.5 &&
            Math.sign(state.x) === Math.sign(state.vx)
          ) {
            // Superpipe lip air out!
            state.vy = Math.abs(state.vx) * 0.68 + (jumpTriggered ? 3.0 : 1.4);
            state.vx *= 0.25;
            state.heading *= 0.25;
            state.onGround = false;
            state.airtime = 0.02;
            state.airSpinRad = 0;
            state.airFlipRad = 0;
            state.airCorkTilt = 0;
            state.bestGrabInAir = 'none';
            playSkiSound('ollie', soundRef.current);
          } else if (jumpTriggered && state.bailTimer <= 0) {
            // Flat-ground Ollie
            state.vy = 6.9 + (nextTerrain.isOnKicker ? 2.1 : 0);
            state.onGround = false;
            state.airtime = 0.02;
            state.airSpinRad = 0;
            state.airFlipRad = 0;
            state.airCorkTilt = 0;
            state.bestGrabInAir = 'none';
            playSkiSound('ollie', soundRef.current);
          } else {
            state.y = nextTerrain.height;
            state.vy = (nextTerrain.height - groundY) / dt;
          }

          state.wasOnKicker = nextTerrain.isOnKicker;
          state.lastKickerSlope = nextTerrain.kickerSlopeLift;
        } else {
          // 3. Airborne Freestyle Tricks & Gravity
          state.airtime += dt;
          state.vy -= 18.2 * dt;
          state.x += state.vx * dt;
          state.z += state.vz * dt;
          state.y += state.vy * dt;

          const maxLat = map.halfWidth + 4.5;
          if (Math.abs(state.x) > maxLat) {
            state.x = Math.sign(state.x) * maxLat;
            state.vx *= -0.3;
          }

          const grabSpeedBoost = inp.grab !== 'none' ? 1.18 : 1.0;
          const rawSpin = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
          const rawFlip = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
          const spinInput =
            Math.abs(inp.analogX) > 0.14 ? -inp.analogX : rawSpin;
          const flipInput =
            Math.abs(inp.analogY) > 0.14 ? inp.analogY : rawFlip;

          state.airSpinRad += spinInput * 6.45 * grabSpeedBoost * dt;
          state.airFlipRad += flipInput * 5.95 * grabSpeedBoost * dt;

          if (inp.grab !== 'none') {
            state.bestGrabInAir = inp.grab;
          }

          const targetCork =
            Math.abs(state.airSpinRad) > 0.35 && Math.abs(state.airFlipRad) > 0.35
              ? Math.sign(state.airSpinRad) * 0.48
              : 0;
          state.airCorkTilt = THREE.MathUtils.damp(state.airCorkTilt, targetCork, 9, dt);

          // Check catching a rail mid-descent!
          if (state.vy <= 3.5 && state.bailTimer <= 0) {
            for (const rail of layout.rails) {
              if (state.z >= rail.z - 0.6 && state.z <= rail.z + rail.length) {
                if (Math.abs(state.x - rail.x) <= rail.width * 0.5 + 0.72) {
                  const railTopY =
                    getBaseTerrainHeight(map, rail.x, state.z) + rail.height + 0.14;
                  if (state.y <= railTopY + 0.95 && state.y >= railTopY - 0.65) {
                    state.grindingRail = rail;
                    state.y = railTopY;
                    state.vy = 0;
                    state.grindPointsAccum = 150;
                    if (!state.hitRails.has(rail.id)) {
                      state.hitRails.add(rail.id);
                      state.railsHit += 1;
                    }
                    // Bank air trick before rail if rotated!
                    const spinErr = wrapAngleErrorDeg(
                      THREE.MathUtils.radToDeg(Math.abs(state.airSpinRad)),
                      180
                    );
                    const flipErr = wrapAngleErrorDeg(
                      THREE.MathUtils.radToDeg(Math.abs(state.airFlipRad)),
                      360
                    );
                    if (spinErr <= 55 && flipErr <= 55) {
                      const trick = formatLiveTrick({
                        spinDeg: THREE.MathUtils.radToDeg(state.airSpinRad),
                        flipDeg: THREE.MathUtils.radToDeg(state.airFlipRad),
                        grab: state.bestGrabInAir,
                        isGrinding: false,
                      });
                      if (trick.basePoints > 0) {
                        state.comboTrickBase += trick.basePoints;
                        state.comboScore += trick.basePoints;
                        state.comboMultiplier = Math.min(10, state.comboMultiplier + 1);
                        state.maxCombo = Math.max(state.maxCombo, state.comboMultiplier);
                        state.comboTimer = COMBO_WINDOW_SEC;
                      }
                    }
                    state.airSpinRad = 0;
                    state.airFlipRad = 0;
                    state.airCorkTilt = 0;
                    state.airtime = 0;
                    playSkiSound('grind', soundRef.current);
                    break;
                  }
                }
              }
            }
          }

          // Check Touchdown on Snow
          const landTerrain = getTerrainAndRampHeight(map, layout, state.x, state.z);
          if (!state.grindingRail && state.y <= landTerrain.height) {
            if (state.airtime > 0.35) {
              cameraShake = Math.min(0.45, state.airtime * 0.28);
              state.landingSquash = Math.min(0.24, state.airtime * 0.16);
            }
            state.y = landTerrain.height;
            state.onGround = true;
            state.wasOnKicker = landTerrain.isOnKicker;

            const spinDeg = THREE.MathUtils.radToDeg(state.airSpinRad);
            const flipDeg = THREE.MathUtils.radToDeg(state.airFlipRad);
            const spinErr = wrapAngleErrorDeg(Math.abs(spinDeg), 180);
            const flipErr = wrapAngleErrorDeg(Math.abs(flipDeg), 360);

            const didMeaningfulTrick =
              Math.abs(spinDeg) >= 135 ||
              Math.abs(flipDeg) >= 240 ||
              state.bestGrabInAir !== 'none';

            if (didMeaningfulTrick) {
              const trick = formatLiveTrick({
                spinDeg,
                flipDeg,
                grab: state.bestGrabInAir,
                isGrinding: false,
              });
              const airBonus = Math.round(state.airtime * 145);
              const baseTotalTrickPts = trick.basePoints + airBonus;

              if (spinErr <= 48 && flipErr <= 48) {
                const isBoltsStomp = spinErr <= 16 && flipErr <= 16;
                const totalTrickPts = isBoltsStomp
                  ? Math.round(baseTotalTrickPts * 1.25)
                  : baseTotalTrickPts;

                state.cleanLandings += 1;
                if (trick.isCork) state.corksLanded += 1;
                const snappedHalfTurns = Math.round(Math.abs(spinDeg) / 180);
                const isSwitch = snappedHalfTurns % 2 === 1;
                if (isSwitch) state.switchLandings += 1;
                state.boostCharge = Math.min(100, state.boostCharge + (isBoltsStomp ? 30 : 20));
                const earnedPreview = Math.round(totalTrickPts * state.comboMultiplier);
                state.comboTrickBase += totalTrickPts;
                state.comboScore += totalTrickPts;
                state.comboMultiplier = Math.min(10, state.comboMultiplier + 1);
                state.maxCombo = Math.max(state.maxCombo, state.comboMultiplier);
                state.comboTimer = COMBO_WINDOW_SEC;
                if (earnedPreview > state.bestTrickPoints) {
                  state.bestTrickPoints = earnedPreview;
                  state.bestTrickName = trick.label || 'Clean Air';
                }
                const prefixLabel = isSwitch && !trick.label.includes('Switch')
                  ? `Switch ${trick.label || '180'}`
                  : trick.label || 'STOMPED';
                triggerCallout(
                  isBoltsStomp ? `BOLTS ${prefixLabel}!` : `${prefixLabel}!`,
                  `+${earnedPreview.toLocaleString()} · Combo ${state.comboMultiplier}x`,
                  'clean'
                );
                playSkiSound('stomp', soundRef.current, state.comboMultiplier);

                if (isBoltsStomp) {
                  for (let i = 0; i < 12; i++) {
                    spawnParticle(
                      state.x + (Math.random() - 0.5) * 0.5,
                      state.y + 0.35,
                      state.z,
                      (Math.random() - 0.5) * 5.5,
                      2.2 + Math.random() * 2.8,
                      state.vz * 0.35 + (Math.random() - 0.5) * 2,
                      'spark'
                    );
                  }
                }
              } else if (spinErr <= 72 && flipErr <= 72) {
                const earned = Math.round(baseTotalTrickPts * 0.55);
                state.trickScoreTotal += earned;
                state.score += earned;
                bankCombo(true);
                triggerCallout(
                  `SKETCHY ${trick.label}`,
                  `+${earned.toLocaleString()} pts`,
                  'sketchy'
                );
                playSkiSound('sketchy', soundRef.current);
                checkMedalUnlock();
              } else {
                triggerBail(`Over-rotated ${trick.label || 'landing'}`);
              }
            } else if (state.airtime > 0.35) {
              const airOnly = Math.round(state.airtime * 120);
              state.flowScoreTotal += airOnly;
              state.score += airOnly;
              state.comboTimer = state.comboScore > 0 ? COMBO_WINDOW_SEC : 0;
              checkMedalUnlock();
            }

            state.airSpinRad = 0;
            state.airFlipRad = 0;
            state.airCorkTilt = 0;
            state.airtime = 0;
            state.bestGrabInAir = 'none';

            // Landing snow puff
            for (let i = 0; i < 12; i++) {
              spawnParticle(
                state.x + (Math.random() - 0.5) * 0.7,
                state.y + 0.08,
                state.z,
                (Math.random() - 0.5) * 4.5,
                0.9 + Math.random() * 1.6,
                state.vz * 0.35,
                'snow'
              );
            }
          }
        }

        // 4. Obstacle Collisions, Near-Miss Close Calls, Gates & Collectible Air Rings
        const curSpeedSq = state.vx * state.vx + state.vz * state.vz;
        if (state.bailTimer <= 0) {
          for (const tree of layout.trees) {
            const dz = Math.abs(tree.z - state.z);
            const dx = Math.abs(tree.x - state.x);
            if (dz < 1.25 && dx < 1.08) {
              state.x += state.x >= tree.x ? 1.5 : -1.5;
              triggerBail('Clipped an alpine pine');
              break;
            } else if (
              curSpeedSq > 280 &&
              !state.nearMissedObstacles.has(tree.id) &&
              dz < 1.8 &&
              dx < 2.25
            ) {
              state.nearMissedObstacles.add(tree.id);
              state.closeCalls += 1;
              state.boostCharge = Math.min(100, state.boostCharge + 18);
              const ccPts = 300 * state.comboMultiplier;
              state.flowScoreTotal += ccPts;
              state.score += ccPts;
              if (state.comboScore > 0) state.comboTimer = COMBO_WINDOW_SEC;
              triggerCallout('CLOSE CALL!', `+${ccPts.toLocaleString()} · +18% Boost`, 'boost');
              playSkiSound('closecall', soundRef.current);
              checkMedalUnlock();
            }
          }
        }

        if (state.bailTimer <= 0 && !state.grindingRail) {
          for (const rock of layout.rocks) {
            const ry = getBaseTerrainHeight(map, rock.x, rock.z);
            const dz = Math.abs(rock.z - state.z);
            const dx = Math.abs(rock.x - state.x);
            if (
              dz < 1.1 * rock.scale &&
              dx < 1.05 * rock.scale &&
              state.y < ry + 1.05 * rock.scale
            ) {
              state.x += state.x >= rock.x ? 1.4 : -1.4;
              triggerBail('Struck a granite boulder');
              break;
            } else if (
              curSpeedSq > 280 &&
              !state.nearMissedObstacles.has(rock.id) &&
              dz < 1.7 * rock.scale &&
              dx < 2.15 * rock.scale &&
              state.y < ry + 1.4 * rock.scale
            ) {
              state.nearMissedObstacles.add(rock.id);
              state.closeCalls += 1;
              state.boostCharge = Math.min(100, state.boostCharge + 18);
              const ccPts = 300 * state.comboMultiplier;
              state.flowScoreTotal += ccPts;
              state.score += ccPts;
              if (state.comboScore > 0) state.comboTimer = COMBO_WINDOW_SEC;
              triggerCallout('CLOSE CALL!', `+${ccPts.toLocaleString()} · +18% Boost`, 'boost');
              playSkiSound('closecall', soundRef.current);
              checkMedalUnlock();
            }
          }
        }

        for (const gate of layout.gates) {
          if (
            !state.passedGates.has(gate.id) &&
            Math.abs(state.z - gate.z) < 1.65 &&
            Math.abs(state.x - gate.x) < 2.35
          ) {
            state.passedGates.add(gate.id);
            state.gatesCleared += 1;
            state.boostCharge = Math.min(100, state.boostCharge + 20);
            const gatePreview = gate.bonus * state.comboMultiplier;
            state.comboGateBase += gate.bonus;
            state.comboScore += gate.bonus;
            state.comboMultiplier = Math.min(10, state.comboMultiplier + 1);
            state.maxCombo = Math.max(state.maxCombo, state.comboMultiplier);
            state.comboTimer = COMBO_WINDOW_SEC;
            triggerCallout(
              'GATE CLEARED!',
              `+${gatePreview.toLocaleString()} · Combo ${state.comboMultiplier}x`,
              'gate'
            );
            playSkiSound('gate', soundRef.current);
          }
        }

        // Collectible Air & Slalom Rings
        for (const rg of layout.rings) {
          if (state.collectedRings.has(rg.id)) continue;
          const rgWorldY = getBaseTerrainHeight(map, rg.x, rg.z) + rg.yOffset;
          if (
            Math.abs(state.z - rg.z) < 2.1 &&
            Math.abs(state.x - rg.x) < 2.2 &&
            Math.abs(state.y + 0.8 - rgWorldY) < 2.35
          ) {
            state.collectedRings.add(rg.id);
            state.ringsCollected += 1;
            state.boostCharge = Math.min(100, state.boostCharge + 26);
            if (parkScene) {
              parkScene.collectRing(rg.id);
            } else {
              endlessChunks.forEach((ch) => ch.built.collectRing(rg.id));
            }
            const rgPts = rg.bonus * state.comboMultiplier;
            state.comboGateBase += rg.bonus;
            state.comboScore += rg.bonus;
            state.comboTimer = COMBO_WINDOW_SEC;
            triggerCallout(
              rg.kind === 'air' ? 'AIR RING!' : 'ALPINE RING!',
              `+${rgPts.toLocaleString()} · +26% Boost`,
              'ring'
            );
            playSkiSound('ring', soundRef.current);
            for (let p = 0; p < 14; p++) {
              spawnParticle(
                rg.x + (Math.random() - 0.5) * 0.8,
                rgWorldY + (Math.random() - 0.5) * 0.8,
                rg.z,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.3) * 5,
                state.vz * 0.25 + (Math.random() - 0.5) * 4,
                rg.kind === 'air' ? 'spark' : 'boost'
              );
            }
          }
        }

        // 5. Check Finish Arch (standard parks only)
        if (!map.isEndless && state.z >= map.lengthMeters) {
          state.finished = true;
          bankCombo(true);
          state.flowScoreTotal += 1000;
          state.score += 1000; // Finish bonus
          state.recordedGhost.push([
            Number(state.runElapsedSec.toFixed(2)),
            Number(state.x.toFixed(2)),
            Number(state.y.toFixed(2)),
            Number(state.z.toFixed(2)),
          ]);
          playSkiSound('finish', soundRef.current);
          const speedKmh = Math.hypot(state.vx, state.vz) * 3.6;
          onFinishRef.current({
            hud: buildSnapshot('', 0, 'none', speedKmh),
            ghostSamples: state.recordedGhost,
            completedObjectiveIds: evaluateCompletedObjectives(),
            finishedByWipeout: false,
          });
        }

        // 6. Interpolate Personal Best Ghost Skier
        if (ghostRig && activeGhostSamples && activeGhostSamples.length > 1) {
          const tNow = state.runElapsedSec;
          let gIdx = 0;
          while (
            gIdx < activeGhostSamples.length - 2 &&
            activeGhostSamples[gIdx + 1][0] < tNow
          ) {
            gIdx++;
          }
          const a = activeGhostSamples[gIdx];
          const b = activeGhostSamples[Math.min(gIdx + 1, activeGhostSamples.length - 1)];
          const span = Math.max(0.001, b[0] - a[0]);
          const alpha = THREE.MathUtils.clamp((tNow - a[0]) / span, 0, 1);
          const gx = THREE.MathUtils.lerp(a[1], b[1], alpha);
          const gy = THREE.MathUtils.lerp(a[2], b[2], alpha);
          const gz = THREE.MathUtils.lerp(a[3], b[3], alpha);
          ghostRig.root.position.set(gx, gy, gz);
          const heading = Math.atan2(b[1] - a[1], Math.max(0.1, b[3] - a[3]));
          ghostRig.bodyGroup.rotation.y = heading;
          state.ghostDeltaMeters = Math.round(state.z - gz);
        }
      }

      // Update Environment Animations (Sky clouds/aurora, Snow crystal glints, Chairlifts, Rotating Rings)
      skyDome.update(elapsedSec);
      if (parkScene) {
        parkScene.update(elapsedSec, dt);
      } else {
        endlessChunks.forEach((ch) => ch.built.update(elapsedSec, dt));
      }

      // Sync Skier 3D Transforms + Landing Suspension Compression
      state.landingSquash = THREE.MathUtils.damp(state.landingSquash, 0, 11, dt);
      skier.root.position.set(state.x, state.y, state.z);
      skier.carveGroup.scale.set(
        1 + state.landingSquash * 0.4,
        1 - state.landingSquash,
        1 + state.landingSquash * 0.4
      );
      const slopeNorm = getTerrainSlopeNormal(map, layout, state.x, state.z);

      if (state.bailTimer > 0) {
        skier.carveGroup.rotation.set(0, 0, 0);
        skier.trickPivot.rotation.set(
          (1.05 - state.bailTimer) * 9.5,
          (1.05 - state.bailTimer) * 5.2,
          (1.05 - state.bailTimer) * 6.5
        );
      } else if (!state.onGround && !state.grindingRail) {
        skier.carveGroup.rotation.set(0, state.heading * 0.5, 0);
        skier.trickPivot.rotation.set(
          state.airFlipRad,
          state.airSpinRad,
          state.airCorkTilt
        );
      } else {
        const slopePitchAngle = Math.atan2(-slopeNorm.nz, slopeNorm.ny);
        const slopeRollAngle = Math.atan2(slopeNorm.nx, slopeNorm.ny);
        skier.carveGroup.rotation.x = THREE.MathUtils.damp(
          skier.carveGroup.rotation.x,
          -slopePitchAngle,
          14,
          dt
        );
        skier.carveGroup.rotation.y = THREE.MathUtils.damp(
          skier.carveGroup.rotation.y,
          state.heading,
          14,
          dt
        );
        skier.carveGroup.rotation.z = THREE.MathUtils.damp(
          skier.carveGroup.rotation.z,
          state.carveRoll - slopeRollAngle * 0.55,
          12,
          dt
        );
        skier.trickPivot.rotation.x = THREE.MathUtils.damp(
          skier.trickPivot.rotation.x,
          0,
          16,
          dt
        );
        skier.trickPivot.rotation.y = THREE.MathUtils.damp(
          skier.trickPivot.rotation.y,
          0,
          16,
          dt
        );
        skier.trickPivot.rotation.z = THREE.MathUtils.damp(
          skier.trickPivot.rotation.z,
          0,
          16,
          dt
        );
      }

      const speed = Math.hypot(state.vx, state.vz);
      const speedRatio = THREE.MathUtils.clamp((speed - 12) / 30, 0, 1);

      const tuckHeld =
        (inp.up && state.onGround && !inp.down) ||
        (inp.analogY > 0.25 && state.onGround);
      updateSkierPose(skier, {
        tuck: tuckHeld,
        grab: inp.grab,
        isAirborne: !state.onGround && !state.grindingRail,
        isGrinding: Boolean(state.grindingRail),
        isBoosting: state.isBoosting,
        speedRatio,
        elapsedSec,
        dt,
      });

      // Stamp Carved Twin-Ski Tracks on Snow
      if (state.onGround && !state.grindingRail && state.bailTimer <= 0 && state.z - lastTrackZ >= 0.72) {
        lastTrackZ = state.z;
        const slopePitchAngle = Math.atan2(-slopeNorm.nz, slopeNorm.ny);
        const cosH = Math.cos(state.heading);
        const sinH = Math.sin(state.heading);
        [-0.21, 0.21].forEach((offset) => {
          const tx = state.x + offset * cosH;
          const tz = state.z - offset * sinH;
          const ty = getTerrainAndRampHeight(map, layout, tx, tz).height + 0.028;
          _dummy.position.set(tx, ty, tz);
          _dummy.rotation.set(-slopePitchAngle, state.heading, 0);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          trackMesh.setMatrixAt(trackCursor, _dummy.matrix);
          trackCursor = (trackCursor + 1) % TRACK_COUNT;
        });
        trackMesh.instanceMatrix.needsUpdate = true;
      }

      // Contact Shadow positioned flush on terrain directly below skier
      const shadowTerrainY = getTerrainAndRampHeight(map, layout, state.x, state.z).height;
      const heightAboveSnow = Math.max(0, state.y - shadowTerrainY);
      skier.shadowMesh.position.set(state.x, shadowTerrainY + 0.04, state.z);
      const shadowScale = Math.max(0.45, 1 - heightAboveSnow * 0.055);
      skier.shadowMesh.scale.setScalar(shadowScale);
      (skier.shadowMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0.08,
        0.46 - heightAboveSnow * 0.038
      );

      // Update Particle Pool (zero allocations)
      let particlesDirty = false;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];
        if (!p.active) continue;
        particlesDirty = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _dummy.position.set(0, -999, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          particleMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        p.vy -= 12 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const fade = 1 - p.life / p.maxLife;
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.scale.setScalar(p.scale * fade);
        _dummy.updateMatrix();
        particleMesh.setMatrixAt(i, _dummy.matrix);
        particleMesh.setColorAt(
          i,
          p.tone === 'spark'
            ? sparkTintColor
            : p.tone === 'boost'
              ? boostTintColor
              : snowTintColor
        );
      }
      if (particlesDirty) {
        particleMesh.instanceMatrix.needsUpdate = true;
        if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
      }

      // Update Ambient Falling Snow Flurries relative to skier
      for (let i = 0; i < FLURRY_COUNT; i++) {
        const f = flurries[i];
        f.dy -= f.fallSpeed * dt;
        if (f.dy < -1) f.dy += 17;
        const fx = state.x + f.dx + Math.sin(elapsedSec * 1.4 + f.driftPhase) * 1.1;
        const fy = state.y + f.dy;
        const fz = state.z + f.dz;
        _dummy.position.set(fx, fy, fz);
        _dummy.rotation.set(elapsedSec + i, elapsedSec * 0.6, 0);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        flurryMesh.setMatrixAt(i, _dummy.matrix);
      }
      flurryMesh.instanceMatrix.needsUpdate = true;

      // Move directional shadow frustum cleanly with skier
      sunLight.position.set(state.x + 20, state.y + 36, state.z + 10);
      sunLight.target.position.set(state.x, state.y, state.z + 14);
      sunLight.target.updateMatrixWorld();

      // Smooth Exponential Chase Camera + Carve Bank + Boost FOV Surge
      const speedKmh = speed * 3.6;
      if (speedKmh > state.topSpeedKmh) state.topSpeedKmh = speedKmh;
      cameraShake = THREE.MathUtils.damp(cameraShake, 0, 9, dt);
      const shakeX = (Math.random() - 0.5) * cameraShake;
      const shakeY = (Math.random() - 0.5) * cameraShake;

      const camMode = cameraModeRef.current;
      const distBack = camMode === 'low' ? 6.2 : camMode === 'wide' ? 12.2 : 8.8;
      const heightUp = camMode === 'low' ? 2.5 : camMode === 'wide' ? 5.6 : 4.1;

      _camTarget.set(
        state.x - state.vx * 0.08 + shakeX,
        Math.max(shadowTerrainY + 1.8, state.y + heightUp) + shakeY,
        state.z - distBack
      );
      _lookTarget.set(state.x + state.vx * 0.07, state.y + 1.0, state.z + 14);

      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTarget.x, 8.5, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTarget.y, 7.5, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTarget.z, 12, dt);

      // Keep sky dome centered around camera so horizon never clips
      skyDome.mesh.position.copy(camera.position);

      _vecA.lerpVectors(_vecB.copy(_lookTarget), _lookTarget, 1);
      camera.lookAt(_vecA);
      camera.rotateZ(state.carveRoll * -0.14);

      const targetFov = THREE.MathUtils.clamp(
        58 + (speed - 14) * 0.72 + (state.isBoosting ? 5.5 : 0),
        60,
        84
      );
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6.5, dt);
        camera.updateProjectionMatrix();
      }

      // Emit throttled HUD snapshot (~18 Hz) so React HUD stays snappy without frame stutter
      hudEmitTimer += dt;
      if (hudEmitTimer >= 0.055) {
        hudEmitTimer = 0;
        let liveLabel = '';
        let livePoints = 0;
        if (state.grindingRail) {
          const railInfo = formatLiveTrick({
            spinDeg: 0,
            flipDeg: 0,
            grab: 'none',
            isGrinding: true,
            railStyle: state.grindingRail.style,
          });
          liveLabel = railInfo.label;
          livePoints = state.grindPointsAccum * state.comboMultiplier;
        } else if (!state.onGround && state.airtime > 0.14) {
          const airInfo = formatLiveTrick({
            spinDeg: THREE.MathUtils.radToDeg(state.airSpinRad),
            flipDeg: THREE.MathUtils.radToDeg(state.airFlipRad),
            grab: state.bestGrabInAir,
            isGrinding: false,
          });
          liveLabel = airInfo.label;
          if (airInfo.basePoints > 0) {
            livePoints = (airInfo.basePoints + state.airtime * 140) * state.comboMultiplier;
          }
        }
        onHudRef.current(buildSnapshot(liveLabel, livePoints, inp.grab, speedKmh));
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    if (isSoftwareGl) afterDraw(tick);
    else frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      skyDome.dispose();
      skier.dispose();
      if (ghostRig) ghostRig.dispose();
      if (parkScene) parkScene.dispose();
      endlessChunks.forEach((ch) => ch.built.dispose());
      if (sharedSnowTex) sharedSnowTex.dispose();
      if (sharedSnowNormalTex) sharedSnowNormalTex.dispose();
      partGeo.dispose();
      partMat.dispose();
      trackGeo.dispose();
      trackMat.dispose();
      flurryGeo.dispose();
      flurryMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [gearId, inputRef, mapId, runSeed]);

  if (webglError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-stone-900 text-stone-100 p-6">
        <div className="max-w-md rounded-xl border border-stone-700 bg-stone-800/90 p-5 text-center space-y-2">
          <div className="font-display text-base font-bold">3D Slope Paused</div>
          <p className="text-xs text-stone-300">{webglError}</p>
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className="h-full w-full select-none touch-none" />;
};
