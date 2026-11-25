import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  generateParkLayout,
  getBaseTerrainHeight,
  getSkiGearById,
  getSkiMapById,
  getTerrainAndRampHeight,
  getTerrainSlopeNormal,
} from '../data/skiMaps';
import type {
  SkiCameraMode,
  SkiGrabType,
  SkiHudSnapshot,
  SkiInputState,
  SkiMapId,
  SkiPhase,
  SkiRailFeature,
} from '../types/ski';
import { playSkiSound } from '../utils/skiAudio';
import {
  buildMountainEnvironment,
  createSkierRig,
  updateSkierPose,
} from './skierModel';

interface SkiViewportProps {
  mapId: SkiMapId;
  gearId: string;
  phase: SkiPhase;
  runSeed: number;
  soundEnabled: boolean;
  cameraMode: SkiCameraMode;
  inputRef: React.MutableRefObject<SkiInputState>;
  onHudUpdate: (snapshot: SkiHudSnapshot) => void;
  onFinishRun: (snapshot: SkiHudSnapshot) => void;
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
  isSpark: boolean;
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
          : 'Steel Rail Boardslide';
    return { label: railName, basePoints: 250, isCork: false };
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
    const prefix = flipCount >= 2 ? 'Double Cork' : 'Cork';
    parts.push(`${prefix} ${corkDeg}`);
    points += corkDeg * 1.6 + flipCount * 550;
  } else if (flipCount >= 1) {
    const dir = flipDeg < 0 ? 'Backflip' : 'Frontflip';
    const flipLabel = flipCount >= 2 ? `Double ${dir}` : dir;
    if (spinSnapped >= 180) {
      parts.push(`${flipLabel} ${spinSnapped}`);
      points += flipCount * 650 + spinSnapped * 1.25;
    } else {
      parts.push(flipLabel);
      points += flipCount * 600;
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

    // Scene + Atmosphere + RoomEnvironment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(map.skyColor);
    scene.fog = new THREE.FogExp2(map.horizonColor, map.fogDensity);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // Camera
    const camera = new THREE.PerspectiveCamera(64, width / height, 0.2, 420);

    // 3-Point Warm/Cool Alpine Lighting Rig
    const hemiLight = new THREE.HemisphereLight(map.ambientSky, map.ambientGround, map.isNight ? 0.85 : 0.95);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(map.sunColor, map.sunIntensity);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 90;
    const shadowBound = 26;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const rimLight = new THREE.DirectionalLight(map.isNight ? '#38BDF8' : '#E0F2FE', 0.45);
    rimLight.position.set(-20, 18, 25);
    scene.add(rimLight);

    // Build Mountain World + Skier Rig
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const parkScene = buildMountainEnvironment(map, layout, maxAniso);
    scene.add(parkScene.group);

    const skier = createSkierRig(gear);
    scene.add(skier.root);
    scene.add(skier.shadowMesh);

    // Particle Pool for snow spray + rail grind sparks (InstancedMesh)
    const PARTICLE_COUNT = 96;
    const partGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const partMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
    const particleMesh = new THREE.InstancedMesh(partGeo, partMat, PARTICLE_COUNT);
    particleMesh.frustumCulled = false;
    particleMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(PARTICLE_COUNT * 3),
      3
    );
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
      isSpark: false,
    }));
    const snowTintColor = new THREE.Color('#FFFFFF');
    const sparkTintColor = new THREE.Color('#FACC15');
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
      isSpark: boolean
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
      p.maxLife = isSpark ? 0.28 + Math.random() * 0.16 : 0.36 + Math.random() * 0.25;
      p.scale = isSpark ? 0.75 : 1.0 + Math.random() * 0.8;
      p.isSpark = isSpark;
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

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
      comboMultiplier: 1,
      maxCombo: 1,
      bestTrickName: '',
      bestTrickPoints: 0,
      topSpeedKmh: 0,
      railsHit: 0,
      cleanLandings: 0,
      bails: 0,
      finished: false,
      passedGates: new Set<string>(),
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

    const buildSnapshot = (liveLabel: string, grab: SkiGrabType, speedKmh: number): SkiHudSnapshot => ({
      score: Math.round(state.score),
      comboScore: Math.round(state.comboScore),
      comboMultiplier: state.comboMultiplier,
      speedKmh: Math.round(speedKmh),
      distanceMeters: Math.min(map.lengthMeters, Math.max(0, Math.round(state.z))),
      lengthMeters: map.lengthMeters,
      progressPct: Math.min(100, Math.max(0, (state.z / map.lengthMeters) * 100)),
      isAirborne: !state.onGround && !state.grindingRail,
      isGrinding: Boolean(state.grindingRail),
      isBailing: state.bailTimer > 0,
      airtime: state.airtime,
      spinDeg: Math.round(THREE.MathUtils.radToDeg(Math.abs(state.airSpinRad))),
      flipDeg: Math.round(THREE.MathUtils.radToDeg(Math.abs(state.airFlipRad))),
      grab,
      liveTrickText: liveLabel,
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
      cameraMode: cameraModeRef.current,
    });

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

    const bankCombo = () => {
      if (state.comboScore > 0) {
        state.score += state.comboScore * state.comboMultiplier;
        state.comboScore = 0;
        state.comboMultiplier = 1;
      }
    };

    const triggerBail = (reasonText: string) => {
      if (state.bailTimer > 0) return;
      state.bailTimer = 1.05;
      state.bails += 1;
      state.comboScore = 0;
      state.comboMultiplier = 1;
      state.grindingRail = null;
      state.airSpinRad = 0;
      state.airFlipRad = 0;
      state.airCorkTilt = 0;
      state.airtime = 0;
      state.vz = Math.max(9, state.vz * 0.42);
      state.vx *= 0.35;
      triggerCallout('WIPEOUT!', reasonText, 'bail');
      playSkiSound('bail', soundRef.current);

      for (let i = 0; i < 18; i++) {
        spawnParticle(
          state.x + (Math.random() - 0.5) * 0.8,
          state.y + 0.5,
          state.z + (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 8,
          2.5 + Math.random() * 5,
          state.vz * 0.3 + (Math.random() - 0.5) * 5,
          false
        );
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

      const inp = inputRef.current;
      const isPlaying = phaseRef.current === 'playing' && !state.finished;

      if (isPlaying) {
        if (state.calloutTimer > 0) {
          state.calloutTimer = Math.max(0, state.calloutTimer - dt);
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

          const addPts = 260 * dt;
          state.grindPointsAccum += addPts;
          state.comboScore += addPts;

          state.grindSparkCooldown -= dt;
          if (state.grindSparkCooldown <= 0) {
            state.grindSparkCooldown = 0.045;
            playSkiSound('grind', soundRef.current);
            spawnParticle(
              state.x + (Math.random() - 0.5) * 0.25,
              state.y,
              state.z - 0.3,
              (Math.random() - 0.5) * 3.5,
              1.6 + Math.random() * 2.2,
              state.vz * 0.4,
              true
            );
          }

          if (jumpTriggered) {
            // Pop off rail into air!
            state.grindingRail = null;
            state.vy = 7.4;
            state.onGround = false;
            state.airtime = 0.05;
            playSkiSound('ollie', soundRef.current);
          } else if (state.z > rail.z + rail.length) {
            // Clean exit off end of rail
            state.grindingRail = null;
            state.onGround = false;
            state.vy = 2.4;
            state.airtime = 0.05;
            triggerCallout(
              'RAIL CLEAN!',
              `+${Math.round(state.grindPointsAccum)} pts`,
              'grind'
            );
            state.grindPointsAccum = 0;
          }
        } else if (state.onGround) {
          // 2. Ground Carving & Kicker Launch Physics
          const steerDir = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
          const tucking = inp.up && !inp.down && state.bailTimer <= 0;
          const braking = inp.down && !inp.up;

          if (state.bailTimer <= 0) {
            state.heading = THREE.MathUtils.clamp(
              state.heading + steerDir * 1.95 * dt,
              -0.95,
              0.95
            );
            if (steerDir === 0) {
              state.heading = THREE.MathUtils.damp(state.heading, 0, 2.2, dt);
            }
          }

          // Forward speed acceleration down pitch
          const gravityAccel = map.slopePitch * 23.5 + (tucking ? 10.5 : 0) - (braking ? 18 : 0);
          const drag = 0.011 * state.vz * state.vz * (tucking ? 0.68 : 1.0);
          const forwardSpeed = THREE.MathUtils.clamp(
            Math.hypot(state.vx, state.vz) + (gravityAccel - drag) * dt,
            braking ? 7.5 : 13.5,
            tucking ? 37.5 : 31.5
          );

          state.vx = Math.sin(state.heading) * forwardSpeed;
          state.vz = Math.cos(state.heading) * forwardSpeed;
          state.carveRoll = THREE.MathUtils.damp(
            state.carveRoll,
            -steerDir * 0.42,
            10,
            dt
          );

          state.x += state.vx * dt;
          state.z += state.vz * dt;

          // Keep skier inside outer mountain canyon walls
          const maxLat = map.halfWidth + 4.5;
          if (Math.abs(state.x) > maxLat) {
            state.x = Math.sign(state.x) * maxLat;
            state.heading *= -0.4;
          }

          // Snow carve spray particles
          if (Math.abs(steerDir) > 0 && state.bailTimer <= 0 && Math.random() < 0.65) {
            spawnParticle(
              state.x - steerDir * 0.28,
              groundY + 0.08,
              state.z - 0.4,
              -steerDir * (2.2 + Math.random() * 2.5),
              1.1 + Math.random() * 1.6,
              state.vz * 0.35,
              false
            );
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
          const spinInput = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
          const flipInput = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);

          state.airSpinRad += spinInput * 6.35 * grabSpeedBoost * dt;
          state.airFlipRad += flipInput * 5.85 * grabSpeedBoost * dt;

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
                        state.comboScore += trick.basePoints;
                        state.comboMultiplier = Math.min(8, state.comboMultiplier + 1);
                        state.maxCombo = Math.max(state.maxCombo, state.comboMultiplier);
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
              const airBonus = Math.round(state.airtime * 120);
              const totalTrickPts = trick.basePoints + airBonus;

              if (spinErr <= 44 && flipErr <= 44) {
                state.cleanLandings += 1;
                state.comboScore += totalTrickPts;
                const earned = Math.round(totalTrickPts * state.comboMultiplier);
                state.comboMultiplier = Math.min(8, state.comboMultiplier + 1);
                state.maxCombo = Math.max(state.maxCombo, state.comboMultiplier);
                if (earned > state.bestTrickPoints) {
                  state.bestTrickPoints = earned;
                  state.bestTrickName = trick.label || 'Clean Air';
                }
                triggerCallout(
                  `${trick.label || 'STOMPED'}!`,
                  `+${earned.toLocaleString()} · ${state.comboMultiplier - 1}x Combo`,
                  'clean'
                );
                playSkiSound('stomp', soundRef.current, state.comboMultiplier);
                // Immediate partial bank if no further trick within combo? Bank continuously on clean run or keep combo chaining!
                state.score += state.comboScore * 0.45;
                state.comboScore *= 0.55;
              } else if (spinErr <= 68 && flipErr <= 68) {
                const earned = Math.round(totalTrickPts * 0.55);
                state.score += earned + state.comboScore;
                state.comboScore = 0;
                state.comboMultiplier = 1;
                triggerCallout(
                  `SKETCHY ${trick.label}`,
                  `+${earned.toLocaleString()} pts`,
                  'sketchy'
                );
                playSkiSound('sketchy', soundRef.current);
              } else {
                triggerBail(`Over-rotated ${trick.label || 'landing'}`);
              }
            } else if (state.airtime > 0.35) {
              bankCombo();
            }

            state.airSpinRad = 0;
            state.airFlipRad = 0;
            state.airCorkTilt = 0;
            state.airtime = 0;
            state.bestGrabInAir = 'none';

            // Landing snow puff
            for (let i = 0; i < 8; i++) {
              spawnParticle(
                state.x + (Math.random() - 0.5) * 0.6,
                state.y + 0.08,
                state.z,
                (Math.random() - 0.5) * 4,
                0.8 + Math.random() * 1.4,
                state.vz * 0.35,
                false
              );
            }
          }
        }

        // 4. Obstacle & Bonus Gate Collisions
        if (state.bailTimer <= 0) {
          for (const tree of layout.trees) {
            if (Math.abs(tree.z - state.z) < 1.25 && Math.abs(tree.x - state.x) < 1.08) {
              state.x += state.x >= tree.x ? 1.5 : -1.5;
              triggerBail('Clipped an alpine pine');
              break;
            }
          }
        }

        if (state.bailTimer <= 0 && !state.grindingRail) {
          for (const rock of layout.rocks) {
            const ry = getBaseTerrainHeight(map, rock.x, rock.z);
            if (
              Math.abs(rock.z - state.z) < 1.1 * rock.scale &&
              Math.abs(rock.x - state.x) < 1.05 * rock.scale &&
              state.y < ry + 1.05 * rock.scale
            ) {
              state.x += state.x >= rock.x ? 1.4 : -1.4;
              triggerBail('Struck a granite boulder');
              break;
            }
          }
        }

        for (const gate of layout.gates) {
          if (
            !state.passedGates.has(gate.id) &&
            Math.abs(state.z - gate.z) < 1.6 &&
            Math.abs(state.x - gate.x) < 2.25
          ) {
            state.passedGates.add(gate.id);
            state.score += gate.bonus * state.comboMultiplier;
            state.comboMultiplier = Math.min(8, state.comboMultiplier + 1);
            state.maxCombo = Math.max(state.maxCombo, state.comboMultiplier);
            triggerCallout(
              'GATE CLEARED!',
              `+${gate.bonus * (state.comboMultiplier - 1)} · ${state.comboMultiplier}x`,
              'gate'
            );
            playSkiSound('gate', soundRef.current);
          }
        }

        // 5. Check Finish Arch
        if (state.z >= map.lengthMeters) {
          state.finished = true;
          bankCombo();
          state.score += 1000; // Finish bonus
          playSkiSound('finish', soundRef.current);
          const speedKmh = Math.hypot(state.vx, state.vz) * 3.6;
          onFinishRef.current(buildSnapshot('', 'none', speedKmh));
        }
      }

      // Sync Skier 3D Transforms smoothly
      skier.root.position.set(state.x, state.y, state.z);
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

      updateSkierPose(skier, {
        tuck: inp.up && state.onGround && !inp.down,
        grab: inp.grab,
        isAirborne: !state.onGround && !state.grindingRail,
        isGrinding: Boolean(state.grindingRail),
        dt,
      });

      // Contact Shadow positioned flush on terrain directly below skier
      const shadowTerrainY = getTerrainAndRampHeight(map, layout, state.x, state.z).height;
      const heightAboveSnow = Math.max(0, state.y - shadowTerrainY);
      skier.shadowMesh.position.set(state.x, shadowTerrainY + 0.04, state.z);
      const shadowScale = Math.max(0.45, 1 - heightAboveSnow * 0.055);
      skier.shadowMesh.scale.setScalar(shadowScale);
      (skier.shadowMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0.08,
        0.44 - heightAboveSnow * 0.038
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
        particleMesh.setColorAt(i, p.isSpark ? sparkTintColor : snowTintColor);
      }
      if (particlesDirty) {
        particleMesh.instanceMatrix.needsUpdate = true;
        if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
      }

      // Move directional shadow frustum cleanly with skier
      sunLight.position.set(state.x + 18, state.y + 34, state.z + 10);
      sunLight.target.position.set(state.x, state.y, state.z + 14);
      sunLight.target.updateMatrixWorld();

      // Smooth Exponential Chase Camera + Dynamic FOV widening
      const speed = Math.hypot(state.vx, state.vz);
      const speedKmh = speed * 3.6;
      if (speedKmh > state.topSpeedKmh) state.topSpeedKmh = speedKmh;

      const camMode = cameraModeRef.current;
      const distBack = camMode === 'low' ? 6.2 : camMode === 'wide' ? 12.2 : 8.8;
      const heightUp = camMode === 'low' ? 2.5 : camMode === 'wide' ? 5.6 : 4.1;

      _camTarget.set(
        state.x - state.vx * 0.08,
        Math.max(shadowTerrainY + 1.8, state.y + heightUp),
        state.z - distBack
      );
      _lookTarget.set(state.x + state.vx * 0.07, state.y + 1.0, state.z + 14);

      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTarget.x, 8.5, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTarget.y, 7.5, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTarget.z, 12, dt);

      _vecA.lerpVectors(_vecB.copy(_lookTarget), _lookTarget, 1);
      camera.lookAt(_vecA);

      const targetFov = THREE.MathUtils.clamp(58 + (speed - 14) * 0.72, 60, 77);
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
        camera.updateProjectionMatrix();
      }

      // Emit throttled HUD snapshot (~18 Hz) so React HUD stays snappy without frame stutter
      hudEmitTimer += dt;
      if (hudEmitTimer >= 0.055) {
        hudEmitTimer = 0;
        let liveLabel = '';
        if (state.grindingRail) {
          liveLabel = formatLiveTrick({
            spinDeg: 0,
            flipDeg: 0,
            grab: 'none',
            isGrinding: true,
            railStyle: state.grindingRail.style,
          }).label;
        } else if (!state.onGround && state.airtime > 0.14) {
          liveLabel = formatLiveTrick({
            spinDeg: THREE.MathUtils.radToDeg(state.airSpinRad),
            flipDeg: THREE.MathUtils.radToDeg(state.airFlipRad),
            grab: state.bestGrabInAir,
            isGrinding: false,
          }).label;
        }
        onHudRef.current(buildSnapshot(liveLabel, inp.grab, speedKmh));
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
      skier.dispose();
      parkScene.dispose();
      partGeo.dispose();
      partMat.dispose();
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

  return <div ref={mountRef} className="h-full w-full select-none" />;
};
