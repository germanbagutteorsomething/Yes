import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  HEIST_VEHICLE_SPECS,
  HEIST_WEAPON_ORDER,
  HEIST_WEAPONS,
  type HeistCameraMode,
  type HeistHudSnapshot,
  type HeistInputState,
  type HeistPhase,
  type HeistRunSummary,
  type HeistVehicleId,
  type HeistWeaponId,
  type HeistWeaponStateSnapshot,
} from '../types/heist';
import { heistAudio } from '../utils/heistAudio';
import {
  CITY_HALF_BOUND,
  generateCityLayout,
  resolveCircleCityCollision,
  segmentIntersectsAabb,
  type CityBuilding,
} from './cityLayout';
import {
  buildCopOfficerMesh,
  buildFirstPersonCockpitRig,
  buildFirstPersonWeaponRig,
  buildGetawayCarMesh,
  buildHeistBeaconMesh,
  buildPickupMesh,
  buildPlayerRig,
  buildPoliceVehicleMesh,
  createBuildingFacadeTexture,
  createCityAsphaltTexture,
  type GetawayCarRig,
} from './heistModels';

interface HeistViewportProps {
  phase: HeistPhase;
  cameraMode: HeistCameraMode;
  runNonce: number;
  soundEnabled: boolean;
  inputRef: React.MutableRefObject<HeistInputState>;
  onHudUpdate: (hud: HeistHudSnapshot) => void;
  onRunEnded: (summary: HeistRunSummary) => void;
  onPauseRequest?: () => void;
  onCameraCycle?: () => void;
}

interface SimCar {
  id: number;
  kind: HeistVehicleId;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  speed: number;
  steerAngle: number;
  wheelRoll: number;
  bodyPitch: number;
  bodyRoll: number;
  hp: number;
  maxHp: number;
  rig: GetawayCarRig;
  destroyed: boolean;
}

interface SimCopFoot {
  id: number;
  isSwat: boolean;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  fireCd: number;
  strafeSign: number;
  mesh: THREE.Group;
}

interface SimCopVehicle {
  id: number;
  kind: 'cruiser' | 'interceptor' | 'swat';
  x: number;
  z: number;
  yaw: number;
  speed: number;
  hp: number;
  maxHp: number;
  fireCd: number;
  ramCd: number;
  mesh: THREE.Group;
  redBeacon: THREE.Mesh;
  blueBeacon: THREE.Mesh;
}

interface SimBullet {
  active: boolean;
  fromPlayer: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  life: number;
  color: number;
  scaleZ: number;
}

interface SimParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

interface SimPickup {
  id: number;
  kind: 'medkit' | 'armor' | 'weapon' | 'cash';
  weaponGrant?: HeistWeaponId;
  x: number;
  z: number;
  life: number;
  mesh: THREE.Group;
}

const MAX_BULLETS = 160;
const MAX_PARTICLES = 240;
const WEAPON_UNLOCK_ORDER: HeistWeaponId[] = ['pistol', 'smg', 'shotgun', 'rifle'];

function disposeObjectTree(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });
}

function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function getWantedFromHeat(heat: number): { stars: number; pct: number } {
  const thresholds = [0, 20, 90, 220, 420, 720];
  let stars = 0;
  for (let s = 1; s <= 5; s++) {
    if (heat >= thresholds[s]) stars = s;
  }
  if (stars >= 5) return { stars: 5, pct: 100 };
  const lo = thresholds[stars];
  const hi = thresholds[stars + 1];
  const pct = Math.max(0, Math.min(100, ((heat - lo) / (hi - lo)) * 100));
  return { stars, pct };
}

export const HeistViewport: React.FC<HeistViewportProps> = ({
  phase,
  cameraMode,
  runNonce,
  soundEnabled,
  inputRef,
  onHudUpdate,
  onRunEnded,
  onPauseRequest,
  onCameraCycle,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<HeistPhase>(phase);
  const camModeRef = useRef<HeistCameraMode>(cameraMode);
  const soundRef = useRef<boolean>(soundEnabled);
  const onHudRef = useRef(onHudUpdate);
  const onRunEndedRef = useRef(onRunEnded);
  const onPauseRef = useRef(onPauseRequest);
  const onCamCycleRef = useRef(onCameraCycle);
  const [contextLost, setContextLost] = useState(false);

  phaseRef.current = phase;
  camModeRef.current = cameraMode;
  soundRef.current = soundEnabled;
  onHudRef.current = onHudUpdate;
  onRunEndedRef.current = onRunEnded;
  onPauseRef.current = onPauseRequest;
  onCamCycleRef.current = onCameraCycle;

  const resetHookRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (runNonce > 0 && resetHookRef.current) {
      resetHookRef.current();
    }
  }, [runNonce]);

  useEffect(() => {
    if (phase !== 'playing' && document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // ignore
      }
    }
  }, [phase]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Renderer + Software GL detection
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    const gl = renderer.getContext();
    let isSoftwareGl = false;
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const unmasked = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      const rawRenderer = String(gl.getParameter(gl.RENDERER) || '');
      const combined = `${unmasked} ${rawRenderer}`;
      isSoftwareGl = /SwiftShader|llvmpipe|Software|SubZero/i.test(combined);
    } catch {
      isSoftwareGl = false;
    }

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 560);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    if (!isSoftwareGl) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    // 2. Scene + Fog + RoomEnvironment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090e1a);
    scene.fog = new THREE.FogExp2(0x090e1a, 0.0072);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;

    const camera = new THREE.PerspectiveCamera(
      58,
      (container.clientWidth || 800) / (container.clientHeight || 560),
      0.12,
      280
    );
    camera.position.set(0, 8, -12);
    scene.add(camera);

    // First-person rigs mounted to camera
    const fpWeaponRig = buildFirstPersonWeaponRig();
    fpWeaponRig.group.visible = false;
    camera.add(fpWeaponRig.group);

    const fpCockpitRig = buildFirstPersonCockpitRig();
    fpCockpitRig.group.visible = false;
    camera.add(fpCockpitRig.group);

    // 3. Lighting
    const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 0.9);
    scene.add(hemi);

    const moonLight = new THREE.DirectionalLight(0xe0f2fe, 1.85);
    moonLight.position.set(32, 56, 26);
    if (!isSoftwareGl) {
      moonLight.castShadow = true;
      moonLight.shadow.mapSize.set(1024, 1024);
      moonLight.shadow.camera.near = 10;
      moonLight.shadow.camera.far = 140;
      const d = 48;
      moonLight.shadow.camera.left = -d;
      moonLight.shadow.camera.right = d;
      moonLight.shadow.camera.top = d;
      moonLight.shadow.camera.bottom = -d;
      moonLight.shadow.bias = -0.0005;
    }
    scene.add(moonLight);
    scene.add(moonLight.target);

    const rimLight = new THREE.DirectionalLight(0xfbbf24, 0.48);
    rimLight.position.set(-40, 25, -35);
    scene.add(rimLight);

    // 4. City Ground, Perimeter, Buildings, Streetlamps
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const asphaltTex = createCityAsphaltTexture(maxAniso);
    const facadeTex = createBuildingFacadeTexture(maxAniso);

    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.72, metalness: 0.14 })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = !isSoftwareGl;
    scene.add(groundMesh);

    const outerGround = new THREE.Mesh(
      new THREE.PlaneGeometry(640, 640),
      new THREE.MeshStandardMaterial({ color: 0x060b14, roughness: 0.3, metalness: 0.6 })
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.25;
    scene.add(outerGround);

    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: 0x0f172a,
      roughness: 0.5,
      metalness: 0.4,
    });
    const borderSize = CITY_HALF_BOUND * 2 + 4;
    const borderN = new THREE.Mesh(new THREE.BoxGeometry(borderSize, 1.4, 2), curbMat);
    borderN.position.set(0, 0.7, -CITY_HALF_BOUND - 1);
    const borderS = borderN.clone();
    borderS.position.set(0, 0.7, CITY_HALF_BOUND + 1);
    const borderW = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, borderSize), curbMat);
    borderW.position.set(-CITY_HALF_BOUND - 1, 0.7, 0);
    const borderE = borderW.clone();
    borderE.position.set(CITY_HALF_BOUND + 1, 0.7, 0);
    scene.add(borderN, borderS, borderW, borderE);

    const layout = generateCityLayout();
    const buildings: CityBuilding[] = layout.buildings;

    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    const bMat = new THREE.MeshStandardMaterial({
      map: facadeTex,
      roughness: 0.55,
      metalness: 0.25,
    });
    const buildingInst = new THREE.InstancedMesh(bGeo, bMat, buildings.length);
    buildingInst.castShadow = !isSoftwareGl;
    buildingInst.receiveShadow = !isSoftwareGl;

    const crownList = buildings.filter((b) => b.hasCrown);
    const crownInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.5, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      Math.max(1, crownList.length)
    );

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    let crownIdx = 0;

    buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      buildingInst.setMatrixAt(i, dummy.matrix);
      tmpColor.setHex(b.colorHex).multiplyScalar(1.35);
      buildingInst.setColorAt(i, tmpColor);

      if (b.hasCrown) {
        dummy.position.set(b.x, b.h + 0.25, b.z);
        dummy.scale.set(b.w * 0.94, 1, b.d * 0.94);
        dummy.updateMatrix();
        crownInst.setMatrixAt(crownIdx, dummy.matrix);
        tmpColor.setHex(b.accentHex);
        crownInst.setColorAt(crownIdx, tmpColor);
        crownIdx += 1;
      }
    });
    buildingInst.instanceMatrix.needsUpdate = true;
    if (buildingInst.instanceColor) buildingInst.instanceColor.needsUpdate = true;
    crownInst.count = crownIdx;
    crownInst.instanceMatrix.needsUpdate = true;
    if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
    scene.add(buildingInst, crownInst);

    const poleInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.4 }),
      layout.lamps.length
    );
    const bulbInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.42, 0.14, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xfef3c7 }),
      layout.lamps.length
    );
    layout.lamps.forEach((lamp, i) => {
      dummy.position.set(lamp.x, 2.3, lamp.z);
      dummy.rotation.set(0, lamp.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(lamp.x, 4.62, lamp.z);
      dummy.updateMatrix();
      bulbInst.setMatrixAt(i, dummy.matrix);
    });
    poleInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    scene.add(poleInst, bulbInst);

    // 5. Instanced Bullets & Particles
    const bulletInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.95),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_BULLETS
    );
    bulletInst.frustumCulled = false;
    bulletInst.count = 0;
    scene.add(bulletInst);

    const particleInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_PARTICLES
    );
    particleInst.frustumCulled = false;
    particleInst.count = 0;
    scene.add(particleInst);

    // 6. Dynamic Entities
    const playerRig = buildPlayerRig();
    scene.add(playerRig.group);

    const beaconRig = buildHeistBeaconMesh();
    scene.add(beaconRig.group);

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    const bullets: SimBullet[] = Array.from({ length: MAX_BULLETS }, () => ({
      active: false,
      fromPlayer: true,
      x: 0,
      y: 1,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      damage: 0,
      life: 0,
      color: 0xffffff,
      scaleZ: 1,
    }));

    const particles: SimParticle[] = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1,
      size: 0.3,
      color: 0xffffff,
    }));

    // Simulation state
    const sim = {
      nextEntityId: 1,
      playerX: 0,
      playerY: 0,
      playerZ: 0,
      walkVx: 0,
      walkVz: 0,
      playerVy: 0,
      grounded: true,
      playerYaw: 0,
      hp: 100,
      maxHp: 100,
      armor: 25,
      maxArmor: 100,
      dashCd: 0,
      dashTimer: 0,
      dashVx: 0,
      dashVz: 0,
      inVehicleId: null as number | null,
      fireCd: 0,
      muzzleTimer: 0,
      fpRecoil: 0,
      walkPhase: 0,
      activeWeapon: 'pistol' as HeistWeaponId,
      weapons: {} as Record<
        HeistWeaponId,
        { unlocked: boolean; mag: number; reserve: number; reloadTimer: number }
      >,
      cash: 0,
      survivalSec: 0,
      heistsCompleted: 0,
      copsDown: 0,
      heat: 0,
      wantedStars: 0,
      maxWantedStars: 0,
      activeHeistIdx: 0,
      heistProgress: 0,
      calloutText: '',
      calloutTone: 'loot' as 'loot' | 'heat' | 'weapon' | 'danger',
      calloutNonce: 0,
      copSpawnCd: 2.0,
      copCarSpawnCd: 5.0,
      carRespawnCd: 14.0,
      smokeCd: 0,
      cars: [] as SimCar[],
      copsFoot: [] as SimCopFoot[],
      copsVeh: [] as SimCopVehicle[],
      pickups: [] as SimPickup[],
      hudPushTimer: 0,
      endedEmitted: false,
      camX: 0,
      camY: 6.5,
      camZ: -11,
      camLookX: 0,
      camLookY: 1.4,
      camLookZ: 0,
      camYaw: 0,
      camPitch: -0.22,
      fpYaw: 0,
      fpPitch: 0,
      camFov: 58,
      shake: 0,
      isDrifting: false,
    };

    const setCallout = (
      text: string,
      tone: 'loot' | 'heat' | 'weapon' | 'danger'
    ) => {
      sim.calloutText = text;
      sim.calloutTone = tone;
      sim.calloutNonce += 1;
    };

    const updateFirstPersonWeaponAppearance = (wid: HeistWeaponId) => {
      const spec = HEIST_WEAPONS[wid];
      (fpWeaponRig.accentStrip.material as THREE.MeshBasicMaterial).color.setHex(
        spec.tracerColor
      );
      if (wid === 'pistol') {
        fpWeaponRig.body.scale.set(0.85, 0.9, 0.75);
        fpWeaponRig.barrel.scale.set(0.9, 0.9, 0.65);
      } else if (wid === 'smg') {
        fpWeaponRig.body.scale.set(1.0, 1.05, 1.15);
        fpWeaponRig.barrel.scale.set(1.0, 1.0, 0.9);
      } else if (wid === 'shotgun') {
        fpWeaponRig.body.scale.set(1.15, 1.0, 1.25);
        fpWeaponRig.barrel.scale.set(1.35, 1.35, 1.35);
      } else {
        fpWeaponRig.body.scale.set(1.05, 1.05, 1.38);
        fpWeaponRig.barrel.scale.set(1.05, 1.05, 1.55);
      }
    };

    const spawnParticles = (
      x: number,
      y: number,
      z: number,
      count: number,
      color: number,
      speed = 8,
      size = 0.32
    ) => {
      let spawned = 0;
      for (let i = 0; i < particles.length && spawned < count; i++) {
        const p = particles[i];
        if (!p.active) {
          const ang = Math.random() * Math.PI * 2;
          const spd = (0.35 + Math.random() * 0.85) * speed;
          p.active = true;
          p.x = x;
          p.y = y;
          p.z = z;
          p.vx = Math.cos(ang) * spd;
          p.vy = 2.2 + Math.random() * speed * 0.65;
          p.vz = Math.sin(ang) * spd;
          p.maxLife = 0.32 + Math.random() * 0.35;
          p.life = p.maxLife;
          p.size = size * (0.7 + Math.random() * 0.7);
          p.color = color;
          spawned += 1;
        }
      }
    };

    const spawnBullet = (
      fromPlayer: boolean,
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      damage: number,
      life: number,
      color: number,
      scaleZ = 1
    ) => {
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!b.active) {
          b.active = true;
          b.fromPlayer = fromPlayer;
          b.x = x;
          b.y = y;
          b.z = z;
          b.vx = vx;
          b.vy = vy;
          b.vz = vz;
          b.damage = damage;
          b.life = life;
          b.color = color;
          b.scaleZ = scaleZ;
          return;
        }
      }
    };

    const spawnPickup = (
      kind: 'medkit' | 'armor' | 'weapon' | 'cash',
      x: number,
      z: number,
      weaponGrant?: HeistWeaponId
    ) => {
      if (sim.pickups.length > 18) {
        const oldest = sim.pickups.shift();
        if (oldest) {
          dynamicGroup.remove(oldest.mesh);
          disposeObjectTree(oldest.mesh);
        }
      }
      const mesh = buildPickupMesh(kind);
      mesh.position.set(x, 0, z);
      dynamicGroup.add(mesh);
      sim.pickups.push({
        id: sim.nextEntityId++,
        kind,
        weaponGrant,
        x,
        z,
        life: 32,
        mesh,
      });
    };

    const spawnGetawayCar = (
      x: number,
      z: number,
      yaw: number,
      kind: HeistVehicleId,
      colorHex: number
    ) => {
      const spec = HEIST_VEHICLE_SPECS[kind];
      const rig = buildGetawayCarMesh(kind, colorHex);
      rig.group.position.set(x, 0, z);
      rig.group.rotation.y = yaw;
      dynamicGroup.add(rig.group);
      sim.cars.push({
        id: sim.nextEntityId++,
        kind,
        x,
        z,
        vx: 0,
        vz: 0,
        yaw,
        speed: 0,
        steerAngle: 0,
        wheelRoll: 0,
        bodyPitch: 0,
        bodyRoll: 0,
        hp: spec.maxHp,
        maxHp: spec.maxHp,
        rig,
        destroyed: false,
      });
    };

    const pickSpawnStreetPoint = (minDist = 34, maxDist = 66): { x: number; z: number } => {
      const streets = [-96, -48, 0, 48, 96];
      for (let attempt = 0; attempt < 24; attempt++) {
        const horizontal = Math.random() > 0.5;
        const lane = streets[Math.floor(Math.random() * streets.length)];
        const along = -96 + Math.random() * 192;
        const sx = horizontal ? along : lane;
        const sz = horizontal ? lane : along;
        const dist = Math.hypot(sx - sim.playerX, sz - sim.playerZ);
        if (dist >= minDist && dist <= maxDist) return { x: sx, z: sz };
      }
      const angle = Math.random() * Math.PI * 2;
      const clampedX = Math.max(-106, Math.min(106, sim.playerX + Math.cos(angle) * 42));
      const clampedZ = Math.max(-106, Math.min(106, sim.playerZ + Math.sin(angle) * 42));
      const res = resolveCircleCityCollision(clampedX, clampedZ, 2.2, buildings);
      return { x: res.x, z: res.z };
    };

    const spawnCopFoot = (x: number, z: number, isSwat: boolean) => {
      const mesh = buildCopOfficerMesh(isSwat);
      mesh.position.set(x, 0, z);
      dynamicGroup.add(mesh);
      sim.copsFoot.push({
        id: sim.nextEntityId++,
        isSwat,
        x,
        z,
        yaw: 0,
        hp: isSwat ? 115 : 62,
        maxHp: isSwat ? 115 : 62,
        fireCd: 0.6 + Math.random() * 0.8,
        strafeSign: Math.random() > 0.5 ? 1 : -1,
        mesh,
      });
    };

    const spawnCopVehicle = (kind: 'cruiser' | 'interceptor' | 'swat') => {
      const pt = pickSpawnStreetPoint(38, 72);
      const rig = buildPoliceVehicleMesh(kind);
      const yaw = Math.atan2(sim.playerX - pt.x, sim.playerZ - pt.z);
      rig.group.position.set(pt.x, 0, pt.z);
      rig.group.rotation.y = yaw;
      dynamicGroup.add(rig.group);
      const hp = kind === 'swat' ? 260 : kind === 'interceptor' ? 145 : 120;
      sim.copsVeh.push({
        id: sim.nextEntityId++,
        kind,
        x: pt.x,
        z: pt.z,
        yaw,
        speed: 10,
        hp,
        maxHp: hp,
        fireCd: 1.2,
        ramCd: 0,
        mesh: rig.group,
        redBeacon: rig.redBeacon,
        blueBeacon: rig.blueBeacon,
      });
    };

    const updateBeaconPlacement = () => {
      const site = layout.heistSites[sim.activeHeistIdx];
      beaconRig.group.position.set(site.x, 0, site.z);
      const col = new THREE.Color(site.accentHex);
      (beaconRig.ring.material as THREE.MeshBasicMaterial).color.copy(col);
      (beaconRig.beam.material as THREE.MeshBasicMaterial).color.copy(col);
    };

    const computeScore = () =>
      Math.floor(
        sim.cash +
          sim.survivalSec * 15 +
          sim.copsDown * 180 +
          sim.heistsCompleted * 850
      );

    const buildWeaponSnapshot = (): Record<HeistWeaponId, HeistWeaponStateSnapshot> => {
      const out = {} as Record<HeistWeaponId, HeistWeaponStateSnapshot>;
      for (const wid of HEIST_WEAPON_ORDER) {
        const w = sim.weapons[wid];
        const spec = HEIST_WEAPONS[wid];
        out[wid] = {
          unlocked: w.unlocked,
          mag: w.mag,
          reserve: w.reserve,
          reloading: w.reloadTimer > 0,
          reloadPct:
            w.reloadTimer > 0
              ? Math.max(0, Math.min(100, (1 - w.reloadTimer / spec.reloadSec) * 100))
              : 0,
        };
      }
      return out;
    };

    const pushHudSnapshot = () => {
      const activeCar =
        sim.inVehicleId !== null
          ? sim.cars.find((c) => c.id === sim.inVehicleId) ?? null
          : null;

      let nearCarPrompt: string | null = null;
      if (activeCar) {
        nearCarPrompt = `Exit ${HEIST_VEHICLE_SPECS[activeCar.kind].name} [E]`;
      } else {
        let bestDist = 4.4;
        for (const c of sim.cars) {
          if (c.destroyed) continue;
          const d = Math.hypot(c.x - sim.playerX, c.z - sim.playerZ);
          if (d < bestDist) {
            bestDist = d;
            nearCarPrompt = `Drive ${HEIST_VEHICLE_SPECS[c.kind].name} [E]`;
          }
        }
      }

      const site = layout.heistSites[sim.activeHeistIdx];
      const dx = site.x - sim.playerX;
      const dz = site.z - sim.playerZ;
      const dist = Math.hypot(dx, dz);
      const wanted = getWantedFromHeat(sim.heat);

      onHudRef.current({
        score: computeScore(),
        cash: sim.cash,
        survivalSec: sim.survivalSec,
        heistsCompleted: sim.heistsCompleted,
        copsDown: sim.copsDown,
        wantedStars: wanted.stars,
        heatPct: wanted.pct,
        hp: Math.max(0, Math.round(sim.hp)),
        maxHp: sim.maxHp,
        armor: Math.max(0, Math.round(sim.armor)),
        maxArmor: sim.maxArmor,
        dashReadyPct:
          sim.dashCd <= 0 ? 100 : Math.max(0, Math.round((1 - sim.dashCd / 1.1) * 100)),
        inVehicle: Boolean(activeCar),
        vehicleName: activeCar ? HEIST_VEHICLE_SPECS[activeCar.kind].name : '',
        vehicleHp: activeCar ? Math.max(0, Math.round(activeCar.hp)) : 0,
        vehicleMaxHp: activeCar ? activeCar.maxHp : 100,
        vehicleSpeedKmh: activeCar ? Math.round(Math.abs(activeCar.speed) * 4.2) : 0,
        isDrifting: sim.isDrifting,
        cameraMode: camModeRef.current,
        pointerLocked: Boolean(document.pointerLockElement === renderer.domElement),
        nearVehiclePrompt: nearCarPrompt,
        activeWeaponId: sim.activeWeapon,
        weapons: buildWeaponSnapshot(),
        activeHeist: {
          name: site.name,
          reward: site.reward,
          progressPct: Math.min(100, Math.round((sim.heistProgress / site.captureSec) * 100)),
          distanceMeters: Math.round(dist),
          dx,
          dz,
        },
        calloutText: sim.calloutText,
        calloutTone: sim.calloutTone,
        calloutNonce: sim.calloutNonce,
        playerX: sim.playerX,
        playerZ: sim.playerZ,
        playerYaw: sim.playerYaw,
        minimapCops: [
          ...sim.copsFoot.map((c) => ({ x: c.x, z: c.z, isVehicle: false })),
          ...sim.copsVeh.map((v) => ({ x: v.x, z: v.z, isVehicle: true })),
        ],
        minimapCars: sim.cars.filter((c) => !c.destroyed).map((c) => ({ x: c.x, z: c.z })),
        minimapPickups: sim.pickups.map((p) => ({ x: p.x, z: p.z, kind: p.kind })),
      });
    };

    const resetWorld = () => {
      for (const c of sim.cars) {
        dynamicGroup.remove(c.rig.group);
        disposeObjectTree(c.rig.group);
      }
      for (const cop of sim.copsFoot) {
        dynamicGroup.remove(cop.mesh);
        disposeObjectTree(cop.mesh);
      }
      for (const cv of sim.copsVeh) {
        dynamicGroup.remove(cv.mesh);
        disposeObjectTree(cv.mesh);
      }
      for (const p of sim.pickups) {
        dynamicGroup.remove(p.mesh);
        disposeObjectTree(p.mesh);
      }
      sim.cars = [];
      sim.copsFoot = [];
      sim.copsVeh = [];
      sim.pickups = [];

      for (const b of bullets) b.active = false;
      for (const pt of particles) pt.active = false;

      sim.playerX = 0;
      sim.playerY = 0;
      sim.playerZ = 0;
      sim.walkVx = 0;
      sim.walkVz = 0;
      sim.playerVy = 0;
      sim.grounded = true;
      sim.playerYaw = Math.PI;
      sim.camYaw = Math.PI;
      sim.camPitch = -0.22;
      sim.fpYaw = Math.PI;
      sim.fpPitch = 0;
      sim.hp = 100;
      sim.maxHp = 100;
      sim.armor = 25;
      sim.maxArmor = 100;
      sim.dashCd = 0;
      sim.dashTimer = 0;
      sim.inVehicleId = null;
      sim.fireCd = 0;
      sim.muzzleTimer = 0;
      sim.fpRecoil = 0;
      sim.activeWeapon = 'pistol';
      updateFirstPersonWeaponAppearance('pistol');
      sim.weapons = {
        pistol: { unlocked: true, mag: HEIST_WEAPONS.pistol.magSize, reserve: -1, reloadTimer: 0 },
        smg: { unlocked: false, mag: HEIST_WEAPONS.smg.magSize, reserve: 96, reloadTimer: 0 },
        shotgun: { unlocked: false, mag: HEIST_WEAPONS.shotgun.magSize, reserve: 24, reloadTimer: 0 },
        rifle: { unlocked: false, mag: HEIST_WEAPONS.rifle.magSize, reserve: 84, reloadTimer: 0 },
      };

      sim.cash = 0;
      sim.survivalSec = 0;
      sim.heistsCompleted = 0;
      sim.copsDown = 0;
      sim.heat = 0;
      sim.wantedStars = 0;
      sim.maxWantedStars = 0;
      sim.activeHeistIdx = 0;
      sim.heistProgress = 0;
      sim.copSpawnCd = 2.0;
      sim.copCarSpawnCd = 4.5;
      sim.carRespawnCd = 12.0;
      sim.endedEmitted = false;
      sim.shake = 0;
      sim.isDrifting = false;
      sim.camX = 0;
      sim.camY = 6.5;
      sim.camZ = 11;

      playerRig.group.visible = true;
      playerRig.group.position.set(0, 0, 0);

      for (const pc of layout.parkedCars) {
        spawnGetawayCar(pc.x, pc.z, pc.yaw, pc.kind, pc.colorHex);
      }
      spawnPickup('armor', -8, -8);
      spawnPickup('weapon', 8, -14, 'smg');

      updateBeaconPlacement();
      setCallout('Rob the gold Heist Zone or press [E] near a car! [V] Camera', 'loot');
      pushHudSnapshot();
    };

    resetHookRef.current = resetWorld;
    resetWorld();

    // 7. Keyboard + Mouse + PointerLock Input Handling
    const keys = new Set<string>();
    let leftMouseDown = false;
    let rightMouseDown = false;
    let lastClientX: number | null = null;
    let lastClientY: number | null = null;
    const pointerNdc = new THREE.Vector2(0, 0);
    const raycaster = new THREE.Raycaster();
    const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
    const aimPoint = new THREE.Vector3();
    let pointerActive = false;

    const tryRequestPointerLock = () => {
      if (phaseRef.current !== 'playing') return;
      if (camModeRef.current !== 'first-person' && camModeRef.current !== 'chase') return;
      if (document.pointerLockElement === renderer.domElement) return;
      try {
        const res = renderer.domElement.requestPointerLock?.() as unknown;
        if (res && typeof (res as Promise<void>).catch === 'function') {
          (res as Promise<void>).catch(() => {});
        }
      } catch {
        // Safe fallback if iframe blocks pointer lock
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        if (phaseRef.current === 'playing') e.preventDefault();
      }
      keys.add(code);

      if (code === 'Escape' || code === 'KeyP') {
        if (phaseRef.current === 'playing' || phaseRef.current === 'paused') {
          onPauseRef.current?.();
        }
        return;
      }

      if (code === 'KeyV' || code === 'KeyC') {
        if (phaseRef.current === 'playing') {
          onCamCycleRef.current?.();
        }
        return;
      }

      if (phaseRef.current !== 'playing') return;

      if (code === 'KeyE') {
        inputRef.current.interactQueued = true;
      } else if (code === 'KeyR') {
        inputRef.current.reloadQueued = true;
      } else if (code === 'Digit1') {
        inputRef.current.weaponQueued = 'pistol';
      } else if (code === 'Digit2') {
        inputRef.current.weaponQueued = 'smg';
      } else if (code === 'Digit3') {
        inputRef.current.weaponQueued = 'shotgun';
      } else if (code === 'Digit4') {
        inputRef.current.weaponQueued = 'rifle';
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };

    const updatePointerFromEvent = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      pointerActive = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const locked = document.pointerLockElement === renderer.domElement;

      if (locked) {
        const sens = camModeRef.current === 'first-person' ? 0.0024 : 0.0032;
        if (camModeRef.current === 'first-person') {
          sim.fpYaw -= e.movementX * sens;
          sim.fpPitch = Math.max(-0.95, Math.min(0.85, sim.fpPitch - e.movementY * sens));
        } else if (camModeRef.current === 'chase') {
          sim.camYaw -= e.movementX * sens;
          sim.camPitch = Math.max(-0.65, Math.min(0.05, sim.camPitch - e.movementY * sens));
        }
        return;
      }

      updatePointerFromEvent(e.clientX, e.clientY);

      if (lastClientX !== null && lastClientY !== null) {
        const dx = e.clientX - lastClientX;
        const dy = e.clientY - lastClientY;
        if (
          rightMouseDown ||
          (camModeRef.current === 'first-person' && phaseRef.current === 'playing')
        ) {
          const sens = camModeRef.current === 'first-person' ? 0.0035 : 0.0045;
          if (camModeRef.current === 'first-person') {
            sim.fpYaw -= dx * sens;
            sim.fpPitch = Math.max(-0.95, Math.min(0.85, sim.fpPitch - dy * sens));
          } else if (camModeRef.current === 'chase') {
            sim.camYaw -= dx * sens;
            sim.camPitch = Math.max(-0.65, Math.min(0.05, sim.camPitch - dy * sens));
          }
        }
      }
      lastClientX = e.clientX;
      lastClientY = e.clientY;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      updatePointerFromEvent(e.clientX, e.clientY);

      if (e.button === 0) {
        leftMouseDown = true;
        if (camModeRef.current === 'first-person') {
          tryRequestPointerLock();
        }
      } else if (e.button === 2) {
        rightMouseDown = true;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) leftMouseDown = false;
      if (e.button === 2) rightMouseDown = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onWindowBlur = () => {
      keys.clear();
      leftMouseDown = false;
      rightMouseDown = false;
      lastClientX = null;
      lastClientY = null;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(320, Math.floor(entry.contentRect.width));
      const h = Math.max(260, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const damagePlayer = (amount: number) => {
      if (sim.dashTimer > 0 || phaseRef.current !== 'playing') return;
      let rem = amount;
      if (sim.armor > 0) {
        const absorbed = Math.min(sim.armor, rem * 0.72);
        sim.armor -= absorbed;
        rem -= absorbed;
      }
      sim.hp = Math.max(0, sim.hp - rem);
      sim.shake = Math.min(0.9, sim.shake + 0.25);
      heistAudio.playHit(soundRef.current, false);

      if (sim.hp <= 0 && !sim.endedEmitted) {
        sim.endedEmitted = true;
        heistAudio.playBusted(soundRef.current);
        onRunEndedRef.current({
          score: computeScore(),
          cash: sim.cash,
          survivalSec: sim.survivalSec,
          heistsCompleted: sim.heistsCompleted,
          copsDown: sim.copsDown,
          maxWantedStars: sim.maxWantedStars,
        });
      }
    };

    const addHeat = (amount: number) => {
      const prevStars = sim.wantedStars;
      sim.heat += amount;
      const next = getWantedFromHeat(sim.heat);
      sim.wantedStars = next.stars;
      if (next.stars > sim.maxWantedStars) sim.maxWantedStars = next.stars;
      if (next.stars > prevStars) {
        heistAudio.playStarUp(soundRef.current);
        const msg =
          next.stars === 1
            ? '1★ WANTED — Patrol Units Dispatched!'
            : next.stars === 2
            ? '2★ WANTED — Police Cruisers En Route!'
            : next.stars === 3
            ? '3★ WANTED — Fast Interceptors Deployed!'
            : next.stars === 4
            ? '4★ WANTED — Tactical SWAT Inbound!'
            : '5★ MAX HEAT — Citywide Lockdown!';
        setCallout(msg, 'heat');
      }
    };

    const startReload = (wid: HeistWeaponId) => {
      const w = sim.weapons[wid];
      const spec = HEIST_WEAPONS[wid];
      if (!w.unlocked || w.reloadTimer > 0 || w.mag >= spec.magSize) return;
      if (w.reserve === 0) return;
      w.reloadTimer = spec.reloadSec;
      heistAudio.playReload(soundRef.current);
    };

    const completeReload = (wid: HeistWeaponId) => {
      const w = sim.weapons[wid];
      const spec = HEIST_WEAPONS[wid];
      const needed = spec.magSize - w.mag;
      if (needed <= 0) return;
      if (w.reserve < 0) {
        w.mag = spec.magSize;
      } else {
        const take = Math.min(needed, w.reserve);
        w.mag += take;
        w.reserve -= take;
      }
    };

    // Scratch vectors (zero GC)
    const camDirVec = new THREE.Vector3();
    const camRightVec = new THREE.Vector3();
    const shootDirVec = new THREE.Vector3();

    // 8. Main Animation & Simulation Loop
    let disposed = false;
    let rafId = 0;
    let lastTime = performance.now();

    const afterDraw = (cb: FrameRequestCallback) => {
      if (!isSoftwareGl) {
        rafId = requestAnimationFrame(cb);
        return;
      }
      const gl2 = gl as WebGL2RenderingContext;
      if (typeof gl2.fenceSync === 'function') {
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!sync) {
          rafId = requestAnimationFrame(cb);
          return;
        }
        gl2.flush();
        const poll = () => {
          if (disposed) {
            gl2.deleteSync(sync);
            return;
          }
          const st = gl2.clientWaitSync(sync, 0, 0);
          if (st === gl2.TIMEOUT_EXPIRED) {
            setTimeout(poll, 4);
          } else {
            gl2.deleteSync(sync);
            rafId = requestAnimationFrame(cb);
          }
        };
        setTimeout(poll, 0);
      } else {
        rafId = requestAnimationFrame(cb);
      }
    };

    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const activePhase = phaseRef.current;
      const mode = camModeRef.current;

      beaconRig.crystal.rotation.y += dt * 1.9;
      beaconRig.crystal.position.y = 2.35 + Math.sin(now * 0.004) * 0.35;
      const site = layout.heistSites[sim.activeHeistIdx];
      const progFrac = Math.max(0.01, Math.min(1, sim.heistProgress / site.captureSec));
      beaconRig.progressRing.scale.set(progFrac, progFrac, 1);

      for (const p of sim.pickups) {
        p.mesh.rotation.y += dt * 2.1;
      }

      if (activePhase === 'ready') {
        fpWeaponRig.group.visible = false;
        fpCockpitRig.group.visible = false;
        playerRig.group.visible = true;
        const ang = now * 0.0003;
        camera.fov = 52;
        camera.updateProjectionMatrix();
        camera.position.set(Math.sin(ang) * 28, 20, Math.cos(ang) * 28);
        camera.lookAt(0, 1.5, 0);
        renderer.render(scene, camera);
        afterDraw(tick);
        return;
      }

      if (activePhase === 'playing') {
        sim.survivalSec += dt;
        if (sim.wantedStars > 0) {
          addHeat(dt * 2.6);
        }

        const inp = inputRef.current;
        // Touch look deltas
        if (Math.abs(inp.lookDeltaX) > 0 || Math.abs(inp.lookDeltaY) > 0) {
          if (mode === 'first-person') {
            sim.fpYaw -= inp.lookDeltaX * 0.0045;
            sim.fpPitch = Math.max(-0.95, Math.min(0.85, sim.fpPitch - inp.lookDeltaY * 0.0045));
          } else if (mode === 'chase') {
            sim.camYaw -= inp.lookDeltaX * 0.0045;
          }
          inp.lookDeltaX = 0;
          inp.lookDeltaY = 0;
        }

        // Q / Arrow keys / Edge mouse turning in first-person
        const keyTurn = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyZ') ? 1 : 0);
        if (keyTurn !== 0) {
          if (mode === 'first-person') sim.fpYaw += keyTurn * 2.3 * dt;
          else if (mode === 'chase') sim.camYaw += keyTurn * 2.3 * dt;
        }
        // Gentle edge turn when pointer is unlocked in first-person
        if (
          mode === 'first-person' &&
          document.pointerLockElement !== renderer.domElement &&
          pointerActive &&
          Math.abs(pointerNdc.x) > 0.45
        ) {
          const edgeStrength = (Math.abs(pointerNdc.x) - 0.45) / 0.55;
          sim.fpYaw -= Math.sign(pointerNdc.x) * edgeStrength * 2.1 * dt;
        }

        if (inp.weaponQueued) {
          const targetW = inp.weaponQueued;
          inp.weaponQueued = null;
          if (sim.weapons[targetW].unlocked) {
            sim.activeWeapon = targetW;
            updateFirstPersonWeaponAppearance(targetW);
          }
        }
        if (inp.reloadQueued) {
          inp.reloadQueued = false;
          startReload(sim.activeWeapon);
        }

        // Enter / Exit Vehicle [E]
        if (inp.interactQueued) {
          inp.interactQueued = false;
          if (sim.inVehicleId !== null) {
            const car = sim.cars.find((c) => c.id === sim.inVehicleId);
            sim.inVehicleId = null;
            if (car) {
              const sideX = Math.cos(car.yaw) * 2.35;
              const sideZ = -Math.sin(car.yaw) * 2.35;
              const exitCol = resolveCircleCityCollision(
                car.x + sideX,
                car.z + sideZ,
                0.65,
                buildings
              );
              sim.playerX = exitCol.x;
              sim.playerZ = exitCol.z;
              sim.walkVx = car.vx * 0.25;
              sim.walkVz = car.vz * 0.25;
              sim.fpYaw = car.yaw;
              sim.camYaw = car.yaw;
            }
            heistAudio.playCarDoor(soundRef.current);
          } else {
            let bestCar: SimCar | null = null;
            let bestDist = 4.6;
            for (const c of sim.cars) {
              if (c.destroyed) continue;
              const d = Math.hypot(c.x - sim.playerX, c.z - sim.playerZ);
              if (d < bestDist) {
                bestDist = d;
                bestCar = c;
              }
            }
            if (bestCar) {
              sim.inVehicleId = bestCar.id;
              sim.playerY = 0;
              sim.playerVy = 0;
              sim.grounded = true;
              sim.fpYaw = bestCar.yaw;
              sim.camYaw = bestCar.yaw;
              heistAudio.playCarDoor(soundRef.current);
            }
          }
        }

        // Raw movement inputs
        let inputX = inp.moveX;
        let inputY = inp.moveY;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) inputX -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) inputX += 1;
        if (keys.has('KeyW') || keys.has('ArrowUp')) inputY -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) inputY += 1;
        const inputMag = Math.hypot(inputX, inputY);
        if (inputMag > 1) {
          inputX /= inputMag;
          inputY /= inputMag;
        }
        const spacePressed = keys.has('Space') || inp.handbrake;
        const sprintPressed = keys.has('ShiftLeft') || keys.has('ShiftRight') || inp.sprint;

        // Weapon timers & recoil recovery
        if (sim.fireCd > 0) sim.fireCd -= dt;
        if (sim.muzzleTimer > 0) {
          sim.muzzleTimer -= dt;
          if (sim.muzzleTimer <= 0) {
            playerRig.muzzleFlash.visible = false;
            fpWeaponRig.muzzleFlash.visible = false;
          }
        }
        sim.fpRecoil = THREE.MathUtils.damp(sim.fpRecoil, 0, 16, dt);

        for (const wid of HEIST_WEAPON_ORDER) {
          const w = sim.weapons[wid];
          if (w.reloadTimer > 0) {
            w.reloadTimer -= dt;
            if (w.reloadTimer <= 0) {
              w.reloadTimer = 0;
              completeReload(wid);
            }
          }
        }

        // --- Player On-Foot vs Driving Physics ---
        const drivingCar =
          sim.inVehicleId !== null
            ? sim.cars.find((c) => c.id === sim.inVehicleId && !c.destroyed) ?? null
            : null;

        sim.isDrifting = false;

        if (drivingCar) {
          const spec = HEIST_VEHICLE_SPECS[drivingCar.kind];
          const rawThrottle =
            (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
            (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
            (Math.abs(inp.moveY) > 0.12 ? inp.moveY : 0);
          const throttle = Math.max(-1, Math.min(1, rawThrottle));

          const rawSteer =
            (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) -
            (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
            (Math.abs(inp.moveX) > 0.12 ? inp.moveX : 0);
          const targetSteer = Math.max(-1, Math.min(1, rawSteer));

          // Smooth steering angle with speed sensitivity
          drivingCar.steerAngle = THREE.MathUtils.damp(
            drivingCar.steerAngle,
            targetSteer,
            11,
            dt
          );

          const fwdX = Math.sin(drivingCar.yaw);
          const fwdZ = Math.cos(drivingCar.yaw);
          const rightX = Math.cos(drivingCar.yaw);
          const rightZ = -Math.sin(drivingCar.yaw);

          // Decompose velocity into forward & lateral components for real drift physics
          let vFwd = drivingCar.vx * fwdX + drivingCar.vz * fwdZ;
          let vLat = drivingCar.vx * rightX + drivingCar.vz * rightZ;

          if (throttle > 0.05) {
            vFwd += spec.accel * throttle * dt;
          } else if (throttle < -0.05) {
            // Braking feels strong when moving forward, smooth in reverse
            const brakeMult = vFwd > 1.5 ? 1.55 : 0.72;
            vFwd += spec.accel * brakeMult * throttle * dt;
          } else {
            // Rolling drag
            vFwd *= Math.exp(-1.55 * dt);
          }

          if (spacePressed) {
            vFwd *= Math.exp(-2.2 * dt);
          }

          vFwd = Math.max(-spec.maxSpeed * 0.48, Math.min(spec.maxSpeed, vFwd));

          // Lateral tire grip drops sharply when handbraking -> smooth rear-end drift!
          const lateralGrip = spacePressed ? 2.4 : 10.2;
          vLat *= Math.exp(-lateralGrip * dt);

          const absFwd = Math.abs(vFwd);
          const steerAuthority = Math.min(1, absFwd / 5.5) * (0.45 + 0.55 * (1 - absFwd / (spec.maxSpeed * 1.4)));
          const reverseSign = vFwd >= -0.25 ? 1 : -1;
          const driftTurnMult = spacePressed ? 1.38 : 1.0;

          const yawRate =
            drivingCar.steerAngle *
            spec.turnRate *
            steerAuthority *
            reverseSign *
            driftTurnMult;
          drivingCar.yaw += yawRate * dt;

          // Reconstruct world velocity after yaw rotation
          const nFwdX = Math.sin(drivingCar.yaw);
          const nFwdZ = Math.cos(drivingCar.yaw);
          const nRightX = Math.cos(drivingCar.yaw);
          const nRightZ = -Math.sin(drivingCar.yaw);

          drivingCar.vx = nFwdX * vFwd + nRightX * vLat;
          drivingCar.vz = nFwdZ * vFwd + nRightZ * vLat;
          drivingCar.speed = vFwd;

          const lateralSlip = Math.abs(vLat);
          sim.isDrifting = lateralSlip > 3.6 && absFwd > 7.5;

          // Tire smoke / drift sparks
          if (sim.isDrifting) {
            sim.smokeCd -= dt;
            if (sim.smokeCd <= 0) {
              sim.smokeCd = 0.045;
              const rearX = drivingCar.x - nFwdX * 1.35;
              const rearZ = drivingCar.z - nFwdZ * 1.35;
              spawnParticles(rearX, 0.2, rearZ, 2, 0xcbd5e1, 3.2, 0.36);
            }
          }

          // City collision with smooth glancing wall-slide
          const nextX = drivingCar.x + drivingCar.vx * dt;
          const nextZ = drivingCar.z + drivingCar.vz * dt;
          const col = resolveCircleCityCollision(nextX, nextZ, spec.radius, buildings);
          drivingCar.x = col.x;
          drivingCar.z = col.z;

          if (col.hit) {
            const impactDot =
              drivingCar.vx * col.hitNormalX + drivingCar.vz * col.hitNormalZ;
            if (impactDot < 0) {
              // Remove velocity component into wall so car slides cleanly along walls
              drivingCar.vx -= col.hitNormalX * impactDot * 1.15;
              drivingCar.vz -= col.hitNormalZ * impactDot * 1.15;
              const slamSpeed = Math.abs(impactDot);
              if (slamSpeed > 9.5) {
                drivingCar.hp -= (slamSpeed - 7) * 0.9;
                sim.shake = Math.min(0.75, sim.shake + slamSpeed * 0.018);
                heistAudio.playHit(soundRef.current, true);
                spawnParticles(drivingCar.x, 0.8, drivingCar.z, 7, 0xfacc15, 7, 0.25);
              }
            }
          }

          // Visual wheel spin, front steering, and chassis suspension tilt!
          drivingCar.wheelRoll += (vFwd / 0.38) * dt;
          const targetPitch = -throttle * 0.055 + (spacePressed && vFwd > 4 ? 0.06 : 0);
          const targetRoll = -drivingCar.steerAngle * Math.min(1, absFwd / 16) * 0.095;
          drivingCar.bodyPitch = THREE.MathUtils.damp(drivingCar.bodyPitch, targetPitch, 9, dt);
          drivingCar.bodyRoll = THREE.MathUtils.damp(drivingCar.bodyRoll, targetRoll, 9, dt);

          drivingCar.rig.group.position.set(drivingCar.x, 0, drivingCar.z);
          drivingCar.rig.group.rotation.y = drivingCar.yaw;
          drivingCar.rig.bodyShell.rotation.x = drivingCar.bodyPitch;
          drivingCar.rig.bodyShell.rotation.z = drivingCar.bodyRoll;

          for (const pivot of drivingCar.rig.frontSteerPivots) {
            pivot.rotation.y = drivingCar.steerAngle * 0.44;
          }
          for (const wSpin of drivingCar.rig.wheelSpinGroups) {
            wSpin.rotation.x = drivingCar.wheelRoll;
          }

          fpCockpitRig.steeringWheel.rotation.z = drivingCar.steerAngle * 0.95;

          sim.playerX = drivingCar.x;
          sim.playerY = 0;
          sim.playerZ = drivingCar.z;

          if (drivingCar.hp <= 0) {
            drivingCar.destroyed = true;
            dynamicGroup.remove(drivingCar.rig.group);
            disposeObjectTree(drivingCar.rig.group);
            spawnParticles(drivingCar.x, 1.0, drivingCar.z, 28, 0xf97316, 14, 0.55);
            spawnParticles(drivingCar.x, 1.2, drivingCar.z, 18, 0xfacc15, 11, 0.4);
            sim.inVehicleId = null;
            damagePlayer(24);
            setCallout('Getaway Car Wrecked! Bail Out!', 'danger');
          }
        } else {
          // On-Foot Physics (momentum, sprint, jump/dash, camera-relative direction)
          if (sim.dashCd > 0) sim.dashCd = Math.max(0, sim.dashCd - dt);

          // Convert inputX (A/D) and inputY (W=-1, S=+1) into world direction
          let worldMoveX = inputX;
          let worldMoveZ = inputY;
          if (mode === 'first-person' || mode === 'chase') {
            const refYaw = mode === 'first-person' ? sim.fpYaw : sim.camYaw;
            const fwdX = Math.sin(refYaw);
            const fwdZ = Math.cos(refYaw);
            // Forward is W (inputY = -1), right is D (inputX = +1)
            // Note: in Three.js with +Y up, forward (sin(yaw), cos(yaw)) -> right is (-cos(yaw), sin(yaw))
            const rgtX = -Math.cos(refYaw);
            const rgtZ = Math.sin(refYaw);
            const fwdInput = -inputY;
            worldMoveX = fwdX * fwdInput + rgtX * inputX;
            worldMoveZ = fwdZ * fwdInput + rgtZ * inputX;
            const m = Math.hypot(worldMoveX, worldMoveZ);
            if (m > 1) {
              worldMoveX /= m;
              worldMoveZ /= m;
            }
          }

          // Jump + Dash Boost on Space
          if (spacePressed && sim.grounded) {
            sim.playerVy = 8.4;
            sim.grounded = false;
            if (sim.dashCd <= 0 && inputMag > 0.1) {
              sim.dashTimer = 0.22;
              sim.dashCd = 1.1;
              sim.dashVx = worldMoveX * 19.5;
              sim.dashVz = worldMoveZ * 19.5;
              spawnParticles(sim.playerX, 0.35, sim.playerZ, 7, 0x38bdf8, 5, 0.22);
            }
          }

          const topWalkSpeed = sprintPressed ? 14.2 : 10.2;
          const accelRate = sim.grounded ? 52 : 24;
          const frictionRate = sim.grounded ? 13 : 2.5;

          if (sim.dashTimer > 0) {
            sim.dashTimer -= dt;
            sim.walkVx = sim.dashVx;
            sim.walkVz = sim.dashVz;
          } else if (inputMag > 0.05) {
            const targetVx = worldMoveX * topWalkSpeed;
            const targetVz = worldMoveZ * topWalkSpeed;
            sim.walkVx = THREE.MathUtils.damp(sim.walkVx, targetVx, accelRate * 0.22, dt);
            sim.walkVz = THREE.MathUtils.damp(sim.walkVz, targetVz, accelRate * 0.22, dt);
          } else {
            sim.walkVx *= Math.exp(-frictionRate * dt);
            sim.walkVz *= Math.exp(-frictionRate * dt);
          }

          // Vertical jump/gravity
          if (!sim.grounded) {
            sim.playerVy -= 24 * dt;
            sim.playerY += sim.playerVy * dt;
            if (sim.playerY <= 0) {
              sim.playerY = 0;
              sim.playerVy = 0;
              sim.grounded = true;
            }
          }

          const col = resolveCircleCityCollision(
            sim.playerX + sim.walkVx * dt,
            sim.playerZ + sim.walkVz * dt,
            0.55,
            buildings
          );
          if (col.hit) {
            const dot = sim.walkVx * col.hitNormalX + sim.walkVz * col.hitNormalZ;
            if (dot < 0) {
              sim.walkVx -= col.hitNormalX * dot;
              sim.walkVz -= col.hitNormalZ * dot;
            }
          }
          sim.playerX = col.x;
          sim.playerZ = col.z;

          const walkSpeed = Math.hypot(sim.walkVx, sim.walkVz);
          if (walkSpeed > 0.6 && sim.grounded) {
            sim.walkPhase += dt * (walkSpeed * 1.25);
            const swing = Math.sin(sim.walkPhase) * 0.48;
            playerRig.leftLeg.rotation.x = swing;
            playerRig.rightLeg.rotation.x = -swing;
          } else {
            playerRig.leftLeg.rotation.x = THREE.MathUtils.lerp(playerRig.leftLeg.rotation.x, 0, 0.25);
            playerRig.rightLeg.rotation.x = THREE.MathUtils.lerp(playerRig.rightLeg.rotation.x, 0, 0.25);
          }

          playerRig.group.position.set(sim.playerX, sim.playerY, sim.playerZ);
        }

        // --- Camera Placement & Aim Direction ---
        const isFirstPerson = mode === 'first-person';
        playerRig.group.visible = !drivingCar && !isFirstPerson;
        fpWeaponRig.group.visible = isFirstPerson && !drivingCar;
        fpCockpitRig.group.visible = isFirstPerson && Boolean(drivingCar);

        if (isFirstPerson) {
          // Smoothly align fpYaw behind car steering subtly when driving unless actively looking
          if (drivingCar && document.pointerLockElement !== renderer.domElement && !rightMouseDown) {
            sim.fpYaw += normalizeAngle(drivingCar.yaw - sim.fpYaw) * Math.min(1, dt * 3.5);
          }

          const bobY =
            !drivingCar && sim.grounded && Math.hypot(sim.walkVx, sim.walkVz) > 0.8
              ? Math.sin(sim.walkPhase * 2) * 0.055
              : 0;

          const eyeHeight = drivingCar ? 1.28 : 1.62 + sim.playerY + bobY;
          const eyeFwdOffset = drivingCar ? 0.15 : 0;
          const sx = (Math.random() - 0.5) * sim.shake * 0.22;
          const sy = (Math.random() - 0.5) * sim.shake * 0.22;

          camera.position.set(
            sim.playerX + Math.sin(sim.fpYaw) * eyeFwdOffset + sx,
            eyeHeight + sy,
            sim.playerZ + Math.cos(sim.fpYaw) * eyeFwdOffset
          );

          const cosP = Math.cos(sim.fpPitch);
          const lookX = camera.position.x + Math.sin(sim.fpYaw) * cosP * 10;
          const lookY = camera.position.y + Math.sin(sim.fpPitch) * 10;
          const lookZ = camera.position.z + Math.cos(sim.fpYaw) * cosP * 10;
          camera.lookAt(lookX, lookY, lookZ);

          // Speed & sprint FOV
          const speedRatio = drivingCar
            ? Math.min(1, Math.abs(drivingCar.speed) / 30)
            : sprintPressed && Math.hypot(sim.walkVx, sim.walkVz) > 8
            ? 0.35
            : 0;
          sim.camFov = THREE.MathUtils.damp(sim.camFov, 68 + speedRatio * 12, 7, dt);
          camera.fov = sim.camFov;
          camera.updateProjectionMatrix();

          sim.playerYaw = sim.fpYaw;

          // First-person weapon sway & recoil
          const wState = sim.weapons[sim.activeWeapon];
          const reloadDip = wState.reloadTimer > 0 ? -0.18 : 0;
          const swayX = Math.cos(sim.walkPhase) * (Math.hypot(sim.walkVx, sim.walkVz) > 1 ? 0.018 : 0.002);
          const swayY = Math.abs(Math.sin(sim.walkPhase)) * (Math.hypot(sim.walkVx, sim.walkVz) > 1 ? 0.018 : 0.002);
          fpWeaponRig.gunPivot.position.set(
            0.26 + swayX,
            -0.22 - swayY + reloadDip,
            -0.44 + sim.fpRecoil * 0.09
          );
          fpWeaponRig.gunPivot.rotation.x = sim.fpRecoil * 0.22 + reloadDip * 2.2;
        } else if (mode === 'chase') {
          // 3rd-Person GTA Chase Camera
          if (drivingCar) {
            // Swing smoothly behind the car!
            if (!rightMouseDown && document.pointerLockElement !== renderer.domElement) {
              sim.camYaw += normalizeAngle(drivingCar.yaw - sim.camYaw) * Math.min(1, dt * 4.2);
            }
          }

          const speedBoost = drivingCar ? Math.min(1, Math.abs(drivingCar.speed) / 32) : 0;
          const distBack = drivingCar ? 9.8 + speedBoost * 2.8 : 9.2;
          const heightUp = drivingCar ? 4.4 + speedBoost * 0.9 : 4.8;

          const desiredCamX = sim.playerX - Math.sin(sim.camYaw) * distBack;
          const desiredCamY = sim.playerY + heightUp - sim.camPitch * 5.2;
          const desiredCamZ = sim.playerZ - Math.cos(sim.camYaw) * distBack;

          sim.camX = THREE.MathUtils.damp(sim.camX, desiredCamX, 9.5, dt);
          sim.camY = THREE.MathUtils.damp(sim.camY, desiredCamY, 8.5, dt);
          sim.camZ = THREE.MathUtils.damp(sim.camZ, desiredCamZ, 9.5, dt);

          const desiredLookX = sim.playerX + Math.sin(sim.camYaw) * 4.2;
          const desiredLookY = sim.playerY + (drivingCar ? 1.3 : 1.55);
          const desiredLookZ = sim.playerZ + Math.cos(sim.camYaw) * 4.2;
          sim.camLookX = THREE.MathUtils.damp(sim.camLookX, desiredLookX, 12, dt);
          sim.camLookY = THREE.MathUtils.damp(sim.camLookY, desiredLookY, 12, dt);
          sim.camLookZ = THREE.MathUtils.damp(sim.camLookZ, desiredLookZ, 12, dt);

          if (sim.shake > 0) sim.shake = Math.max(0, sim.shake - dt * 2.4);
          const sx = (Math.random() - 0.5) * sim.shake * 0.8;
          const sy = (Math.random() - 0.5) * sim.shake * 0.5;

          camera.position.set(sim.camX + sx, sim.camY + sy, sim.camZ);
          camera.lookAt(sim.camLookX, sim.camLookY, sim.camLookZ);

          const sprintFov =
            !drivingCar && sprintPressed && Math.hypot(sim.walkVx, sim.walkVz) > 8 ? 5 : 0;
          sim.camFov = THREE.MathUtils.damp(sim.camFov, 55 + speedBoost * 12 + sprintFov, 7, dt);
          camera.fov = sim.camFov;
          camera.updateProjectionMatrix();

          // Player yaw aiming in 3rd-person chase
          if (inp.aimActive && (Math.abs(inp.aimX) > 0.1 || Math.abs(inp.aimY) > 0.1)) {
            sim.playerYaw = Math.atan2(inp.aimX, inp.aimY);
          } else if (document.pointerLockElement === renderer.domElement) {
            sim.playerYaw = sim.camYaw;
          } else if (pointerActive && !drivingCar) {
            raycaster.setFromCamera(pointerNdc, camera);
            if (raycaster.ray.intersectPlane(aimPlane, aimPoint)) {
              const dx = aimPoint.x - sim.playerX;
              const dz = aimPoint.z - sim.playerZ;
              if (dx * dx + dz * dz > 0.25) {
                sim.playerYaw = Math.atan2(dx, dz);
              }
            }
          } else if (Math.hypot(sim.walkVx, sim.walkVz) > 0.8) {
            sim.playerYaw = Math.atan2(sim.walkVx, sim.walkVz);
          } else {
            sim.playerYaw = sim.camYaw;
          }
        } else {
          // Tactical Angled Overhead Camera
          const speedZoom = drivingCar ? Math.min(8, Math.abs(drivingCar.speed) * 0.26) : 0;
          const lookAheadX = drivingCar
            ? Math.sin(drivingCar.yaw) * Math.min(6, Math.abs(drivingCar.speed) * 0.18)
            : Math.sin(sim.playerYaw) * 2.0;
          const lookAheadZ = drivingCar
            ? Math.cos(drivingCar.yaw) * Math.min(6, Math.abs(drivingCar.speed) * 0.18)
            : Math.cos(sim.playerYaw) * 2.0;

          const desiredCamX = sim.playerX + lookAheadX * 0.6;
          const desiredCamY = 23 + speedZoom;
          const desiredCamZ = sim.playerZ + 18.5 + speedZoom * 0.75 + lookAheadZ * 0.4;

          sim.camX = THREE.MathUtils.damp(sim.camX, desiredCamX, 6.5, dt);
          sim.camY = THREE.MathUtils.damp(sim.camY, desiredCamY, 5.5, dt);
          sim.camZ = THREE.MathUtils.damp(sim.camZ, desiredCamZ, 6.5, dt);

          if (sim.shake > 0) sim.shake = Math.max(0, sim.shake - dt * 2.4);
          const sx = (Math.random() - 0.5) * sim.shake * 1.1;
          const sz = (Math.random() - 0.5) * sim.shake * 1.1;

          camera.position.set(sim.camX + sx, sim.camY, sim.camZ + sz);
          camera.lookAt(sim.playerX + lookAheadX * 0.35, 0.8, sim.playerZ + lookAheadZ * 0.35);
          sim.camFov = THREE.MathUtils.damp(sim.camFov, 48, 8, dt);
          camera.fov = sim.camFov;
          camera.updateProjectionMatrix();

          if (inp.aimActive && (Math.abs(inp.aimX) > 0.1 || Math.abs(inp.aimY) > 0.1)) {
            sim.playerYaw = Math.atan2(inp.aimX, inp.aimY);
          } else if (pointerActive) {
            raycaster.setFromCamera(pointerNdc, camera);
            if (raycaster.ray.intersectPlane(aimPlane, aimPoint)) {
              const dx = aimPoint.x - sim.playerX;
              const dz = aimPoint.z - sim.playerZ;
              if (dx * dx + dz * dz > 0.15) {
                sim.playerYaw = Math.atan2(dx, dz);
              }
            }
          }
        }

        if (sim.shake > 0 && mode === 'first-person') {
          sim.shake = Math.max(0, sim.shake - dt * 2.6);
        }

        playerRig.group.rotation.y = sim.playerYaw;
        moonLight.position.set(sim.playerX + 30, 56, sim.playerZ + 24);
        moonLight.target.position.set(sim.playerX, 0, sim.playerZ);

        // --- Shooting ---
        const wantFire = leftMouseDown || keys.has('KeyF') || inp.firing;
        if (wantFire && sim.fireCd <= 0) {
          const w = sim.weapons[sim.activeWeapon];
          const spec = HEIST_WEAPONS[sim.activeWeapon];
          if (w.reloadTimer <= 0) {
            if (w.mag > 0) {
              w.mag -= 1;
              sim.fireCd = spec.fireRateSec;
              sim.muzzleTimer = 0.055;
              sim.fpRecoil = 1.0;
              playerRig.muzzleFlash.visible = !isFirstPerson;
              fpWeaponRig.muzzleFlash.visible = isFirstPerson && !drivingCar;
              (playerRig.muzzleFlash.material as THREE.MeshBasicMaterial).color.setHex(
                spec.tracerColor
              );
              (fpWeaponRig.muzzleFlash.material as THREE.MeshBasicMaterial).color.setHex(
                spec.tracerColor
              );

              if (isFirstPerson) {
                camera.getWorldDirection(camDirVec);
                camRightVec.crossVectors(camDirVec, camera.up).normalize();
                const startX = camera.position.x + camDirVec.x * 0.8 + camRightVec.x * 0.14;
                const startY = camera.position.y + camDirVec.y * 0.8 - 0.08;
                const startZ = camera.position.z + camDirVec.z * 0.8 + camRightVec.z * 0.14;

                for (let p = 0; p < spec.pellets; p++) {
                  const sYaw = (Math.random() - 0.5) * spec.spreadRad;
                  const sPitch = (Math.random() - 0.5) * spec.spreadRad * 0.7;
                  shootDirVec
                    .copy(camDirVec)
                    .addScaledVector(camRightVec, sYaw)
                    .addScaledVector(camera.up, sPitch)
                    .normalize();
                  spawnBullet(
                    true,
                    startX,
                    startY,
                    startZ,
                    shootDirVec.x * spec.bulletSpeed,
                    shootDirVec.y * spec.bulletSpeed,
                    shootDirVec.z * spec.bulletSpeed,
                    spec.damage,
                    spec.range / spec.bulletSpeed,
                    spec.tracerColor,
                    spec.id === 'rifle' ? 1.5 : 1.0
                  );
                }
              } else {
                const muzzleX = sim.playerX + Math.sin(sim.playerYaw) * 1.15;
                const muzzleZ = sim.playerZ + Math.cos(sim.playerYaw) * 1.15;
                const muzzleY = 1.08 + sim.playerY;
                for (let p = 0; p < spec.pellets; p++) {
                  const spread = (Math.random() - 0.5) * spec.spreadRad;
                  const ang = sim.playerYaw + spread;
                  spawnBullet(
                    true,
                    muzzleX,
                    muzzleY,
                    muzzleZ,
                    Math.sin(ang) * spec.bulletSpeed,
                    0,
                    Math.cos(ang) * spec.bulletSpeed,
                    spec.damage,
                    spec.range / spec.bulletSpeed,
                    spec.tracerColor,
                    spec.id === 'rifle' ? 1.5 : 1.0
                  );
                }
              }

              heistAudio.playGunshot(soundRef.current, sim.activeWeapon);
              if (sim.wantedStars === 0) addHeat(22);
              if (w.mag === 0) startReload(sim.activeWeapon);
            } else {
              startReload(sim.activeWeapon);
            }
          }
        }

        // --- Heist Capture Zone Check ---
        const distToHeist = Math.hypot(site.x - sim.playerX, site.z - sim.playerZ);
        if (distToHeist <= 4.4) {
          if (sim.wantedStars === 0) addHeat(24);
          sim.heistProgress += dt;
          if (sim.heistProgress >= site.captureSec) {
            sim.heistProgress = 0;
            sim.heistsCompleted += 1;
            sim.cash += site.reward;
            addHeat(75);
            heistAudio.playHeistComplete(soundRef.current);
            spawnParticles(site.x, 1.5, site.z, 26, 0x10b981, 11, 0.36);
            spawnParticles(site.x, 1.8, site.z, 18, 0xfacc15, 9, 0.3);

            let unlockMsg = '';
            if (sim.heistsCompleted <= 3) {
              const nextWid = WEAPON_UNLOCK_ORDER[sim.heistsCompleted];
              if (nextWid && !sim.weapons[nextWid].unlocked) {
                sim.weapons[nextWid].unlocked = true;
                sim.activeWeapon = nextWid;
                updateFirstPersonWeaponAppearance(nextWid);
                unlockMsg = ` · ${HEIST_WEAPONS[nextWid].name} Unlocked!`;
              }
            }
            if (!unlockMsg) {
              for (const wid of ['smg', 'shotgun', 'rifle'] as HeistWeaponId[]) {
                const w = sim.weapons[wid];
                if (w.unlocked) {
                  const spec = HEIST_WEAPONS[wid];
                  w.reserve = Math.min(spec.reserveMax, w.reserve + spec.magSize * 2);
                }
              }
            }

            setCallout(
              `+$${site.reward.toLocaleString()} Looted (${site.name})${unlockMsg}`,
              unlockMsg ? 'weapon' : 'loot'
            );

            spawnPickup(
              sim.hp < 75 ? 'medkit' : 'armor',
              site.x + (Math.random() - 0.5) * 5,
              site.z + (Math.random() - 0.5) * 5
            );

            const nextIdx =
              (sim.activeHeistIdx + 1 + Math.floor(Math.random() * (layout.heistSites.length - 1))) %
              layout.heistSites.length;
            sim.activeHeistIdx = nextIdx;
            updateBeaconPlacement();
          }
        } else {
          sim.heistProgress = Math.max(0, sim.heistProgress - dt * 0.6);
        }

        // --- Pickups Collection ---
        for (let i = sim.pickups.length - 1; i >= 0; i--) {
          const pk = sim.pickups[i];
          pk.life -= dt;
          if (pk.life <= 0) {
            dynamicGroup.remove(pk.mesh);
            disposeObjectTree(pk.mesh);
            sim.pickups.splice(i, 1);
            continue;
          }
          const d = Math.hypot(pk.x - sim.playerX, pk.z - sim.playerZ);
          if (d < (drivingCar ? 2.8 : 1.7)) {
            heistAudio.playPickup(soundRef.current);
            if (pk.kind === 'medkit') {
              sim.hp = Math.min(sim.maxHp, sim.hp + 40);
              if (drivingCar) drivingCar.hp = Math.min(drivingCar.maxHp, drivingCar.hp + 60);
              setCallout('+40 Health Restored', 'loot');
            } else if (pk.kind === 'armor') {
              sim.armor = Math.min(sim.maxArmor, sim.armor + 50);
              setCallout('+50 Kevlar Armor', 'weapon');
            } else if (pk.kind === 'cash') {
              sim.cash += 350;
              setCallout('+$350 Stash Picked Up', 'loot');
            } else if (pk.kind === 'weapon') {
              const grant = pk.weaponGrant ?? 'smg';
              const w = sim.weapons[grant];
              const spec = HEIST_WEAPONS[grant];
              if (!w.unlocked) {
                w.unlocked = true;
                sim.activeWeapon = grant;
                updateFirstPersonWeaponAppearance(grant);
                setCallout(`${spec.name} Equipped!`, 'weapon');
              } else {
                w.reserve =
                  spec.reserveMax < 0 ? -1 : Math.min(spec.reserveMax, w.reserve + spec.magSize * 2);
                setCallout(`+${spec.name} Ammo`, 'weapon');
              }
            }
            spawnParticles(pk.x, 0.9, pk.z, 10, 0x38bdf8, 6, 0.25);
            dynamicGroup.remove(pk.mesh);
            disposeObjectTree(pk.mesh);
            sim.pickups.splice(i, 1);
          }
        }

        // --- Police Spawning ---
        if (sim.wantedStars > 0) {
          const maxFootCops = 3 + sim.wantedStars * 3;
          const maxCopCars = sim.wantedStars === 1 ? 1 : sim.wantedStars === 2 ? 2 : sim.wantedStars + 1;

          sim.copSpawnCd -= dt;
          if (sim.copSpawnCd <= 0 && sim.copsFoot.length < maxFootCops) {
            const pt = pickSpawnStreetPoint(26, 52);
            const isSwat = sim.wantedStars >= 4 || (sim.wantedStars === 3 && Math.random() < 0.35);
            spawnCopFoot(pt.x, pt.z, isSwat);
            sim.copSpawnCd = Math.max(1.2, 4.4 - sim.wantedStars * 0.65);
          }

          sim.copCarSpawnCd -= dt;
          if (sim.copCarSpawnCd <= 0 && sim.copsVeh.length < maxCopCars) {
            const kind: 'cruiser' | 'interceptor' | 'swat' =
              sim.wantedStars >= 4 && Math.random() < 0.45
                ? 'swat'
                : sim.wantedStars >= 3 && Math.random() < 0.55
                ? 'interceptor'
                : 'cruiser';
            spawnCopVehicle(kind);
            sim.copCarSpawnCd = Math.max(2.6, 7.5 - sim.wantedStars * 0.9);
          }
        }

        sim.carRespawnCd -= dt;
        if (sim.carRespawnCd <= 0) {
          sim.carRespawnCd = 14.0;
          if (sim.cars.length < 6) {
            const pt = pickSpawnStreetPoint(28, 70);
            const kinds: HeistVehicleId[] = ['coupe', 'muscle', 'armored'];
            const colors = [0xb91c1c, 0x0284c7, 0xd97706, 0x059669, 0x7c3aed];
            spawnGetawayCar(
              pt.x,
              pt.z,
              Math.random() * Math.PI * 2,
              kinds[Math.floor(Math.random() * kinds.length)],
              colors[Math.floor(Math.random() * colors.length)]
            );
          }
        }

        // --- Police Foot AI ---
        for (let i = sim.copsFoot.length - 1; i >= 0; i--) {
          const cop = sim.copsFoot[i];
          const dx = sim.playerX - cop.x;
          const dz = sim.playerZ - cop.z;
          const dist = Math.hypot(dx, dz);

          if (dist > 115) {
            dynamicGroup.remove(cop.mesh);
            disposeObjectTree(cop.mesh);
            sim.copsFoot.splice(i, 1);
            continue;
          }

          const targetYaw = Math.atan2(dx, dz);
          cop.yaw = targetYaw;
          cop.mesh.rotation.y = cop.yaw;

          const desiredDist = cop.isSwat ? 11.5 : 13.5;
          const moveSpeed = cop.isSwat ? 6.8 : 6.1;
          let vx = 0;
          let vz = 0;
          if (dist > desiredDist) {
            vx = (dx / dist) * moveSpeed;
            vz = (dz / dist) * moveSpeed;
          } else if (dist < 6.5) {
            vx = -(dx / dist) * moveSpeed * 0.55;
            vz = -(dz / dist) * moveSpeed * 0.55;
          } else {
            vx = (-dz / dist) * moveSpeed * 0.5 * cop.strafeSign;
            vz = (dx / dist) * moveSpeed * 0.5 * cop.strafeSign;
          }

          const col = resolveCircleCityCollision(cop.x + vx * dt, cop.z + vz * dt, 0.55, buildings);
          if (col.hit) {
            const altX = cop.x + col.hitNormalZ * cop.strafeSign * moveSpeed * 0.85 * dt;
            const altZ = cop.z + -col.hitNormalX * cop.strafeSign * moveSpeed * 0.85 * dt;
            const col2 = resolveCircleCityCollision(altX, altZ, 0.55, buildings);
            cop.x = col2.x;
            cop.z = col2.z;
          } else {
            cop.x = col.x;
            cop.z = col.z;
          }
          cop.mesh.position.set(cop.x, 0, cop.z);

          if (drivingCar && dist < 2.25 && Math.abs(drivingCar.speed) > 7.5) {
            const ramDmg =
              HEIST_VEHICLE_SPECS[drivingCar.kind].ramDamage *
              (Math.abs(drivingCar.speed) / 18);
            cop.hp -= ramDmg;
            spawnParticles(cop.x, 0.9, cop.z, 10, 0xef4444, 7, 0.28);
            heistAudio.playHit(soundRef.current, true);
            if (cop.hp <= 0) {
              sim.copsDown += 1;
              addHeat(16);
              if (Math.random() < 0.25) spawnPickup('cash', cop.x, cop.z);
              dynamicGroup.remove(cop.mesh);
              disposeObjectTree(cop.mesh);
              sim.copsFoot.splice(i, 1);
              continue;
            }
          }

          cop.fireCd -= dt;
          if (cop.fireCd <= 0 && dist < 26) {
            cop.fireCd = cop.isSwat
              ? 0.55 + Math.random() * 0.45
              : Math.max(0.7, 1.4 - sim.wantedStars * 0.12) + Math.random() * 0.5;
            if (!segmentIntersectsAabb(cop.x, cop.z, sim.playerX, sim.playerZ, buildings)) {
              const spread = (Math.random() - 0.5) * (cop.isSwat ? 0.12 : 0.18);
              const shotAng = targetYaw + spread;
              const spd = cop.isSwat ? 34 : 28;
              spawnBullet(
                false,
                cop.x + Math.sin(shotAng) * 0.8,
                1.08,
                cop.z + Math.cos(shotAng) * 0.8,
                Math.sin(shotAng) * spd,
                0,
                Math.cos(shotAng) * spd,
                cop.isSwat ? 11 : 7,
                1.1,
                0xf43f5e,
                1.0
              );
            }
          }
        }

        // --- Police Vehicles AI ---
        const flashOnRed = Math.floor(now / 150) % 2 === 0;
        for (let i = sim.copsVeh.length - 1; i >= 0; i--) {
          const cv = sim.copsVeh[i];
          (cv.redBeacon.material as THREE.MeshBasicMaterial).color.setHex(
            flashOnRed ? 0xff2a2a : 0x450a0a
          );
          (cv.blueBeacon.material as THREE.MeshBasicMaterial).color.setHex(
            flashOnRed ? 0x172554 : 0x38bdf8
          );

          const dx = sim.playerX - cv.x;
          const dz = sim.playerZ - cv.z;
          const dist = Math.hypot(dx, dz);

          const targetYaw = Math.atan2(dx, dz);
          const yawDiff = normalizeAngle(targetYaw - cv.yaw);
          const turnSpeed = cv.kind === 'interceptor' ? 2.6 : 2.1;
          cv.yaw += Math.max(-turnSpeed * dt, Math.min(turnSpeed * dt, yawDiff));

          const maxSpd =
            cv.kind === 'interceptor'
              ? 24 + sim.wantedStars * 1.1
              : cv.kind === 'swat'
              ? 18
              : 21 + sim.wantedStars * 0.7;

          const desiredSpd = dist > 7 ? maxSpd : 8;
          cv.speed = THREE.MathUtils.lerp(cv.speed, desiredSpd, 1 - Math.exp(-3.2 * dt));

          const stepX = cv.x + Math.sin(cv.yaw) * cv.speed * dt;
          const stepZ = cv.z + Math.cos(cv.yaw) * cv.speed * dt;
          const col = resolveCircleCityCollision(stepX, stepZ, 2.05, buildings);
          if (col.hit) {
            const awayYaw = Math.atan2(col.hitNormalX, col.hitNormalZ);
            cv.yaw += normalizeAngle(awayYaw - cv.yaw) * 0.35;
            cv.speed *= 0.65;
          }
          cv.x = col.x;
          cv.z = col.z;
          cv.mesh.position.set(cv.x, 0, cv.z);
          cv.mesh.rotation.y = cv.yaw;

          if (cv.ramCd > 0) cv.ramCd -= dt;

          const hitRadius = drivingCar ? 3.5 : 2.3;
          if (dist < hitRadius && cv.ramCd <= 0) {
            cv.ramCd = 0.85;
            if (drivingCar) {
              const relSpeed = Math.abs(drivingCar.speed) + cv.speed * 0.5;
              drivingCar.hp -= 18;
              cv.hp -= Math.max(20, relSpeed * 1.4);
              const pushX = (drivingCar.x - cv.x) / Math.max(0.5, dist);
              const pushZ = (drivingCar.z - cv.z) / Math.max(0.5, dist);
              drivingCar.vx += pushX * 9;
              drivingCar.vz += pushZ * 9;
              sim.shake = Math.min(0.8, sim.shake + 0.28);
              heistAudio.playHit(soundRef.current, true);
              spawnParticles(
                (cv.x + drivingCar.x) / 2,
                0.9,
                (cv.z + drivingCar.z) / 2,
                12,
                0xfbbf24,
                9,
                0.3
              );
            } else {
              damagePlayer(cv.kind === 'swat' ? 22 : 15);
              const pushX = (sim.playerX - cv.x) / Math.max(0.5, dist);
              const pushZ = (sim.playerZ - cv.z) / Math.max(0.5, dist);
              const knock = resolveCircleCityCollision(
                sim.playerX + pushX * 2.5,
                sim.playerZ + pushZ * 2.5,
                0.55,
                buildings
              );
              sim.playerX = knock.x;
              sim.playerZ = knock.z;
            }
          }

          cv.fireCd -= dt;
          if (cv.fireCd <= 0 && dist < 29 && dist > 6) {
            cv.fireCd = cv.kind === 'swat' ? 0.65 : 1.05;
            if (!segmentIntersectsAabb(cv.x, cv.z, sim.playerX, sim.playerZ, buildings)) {
              const shotAng = targetYaw + (Math.random() - 0.5) * 0.16;
              spawnBullet(
                false,
                cv.x + Math.sin(shotAng) * 2.1,
                1.08,
                cv.z + Math.cos(shotAng) * 2.1,
                Math.sin(shotAng) * 32,
                0,
                Math.cos(shotAng) * 32,
                cv.kind === 'swat' ? 10 : 6,
                1.05,
                0x38bdf8,
                1.0
              );
            }
          }

          if (cv.hp <= 0) {
            sim.copsDown += 2;
            sim.cash += 400;
            addHeat(45);
            heistAudio.playHit(soundRef.current, true);
            spawnParticles(cv.x, 1.1, cv.z, 32, 0xf97316, 15, 0.52);
            spawnParticles(cv.x, 1.3, cv.z, 20, 0xfacc15, 11, 0.38);
            if (cv.kind === 'swat') {
              spawnPickup('weapon', cv.x, cv.z, 'rifle');
            } else {
              spawnPickup(Math.random() < 0.5 ? 'armor' : 'cash', cv.x, cv.z);
            }
            dynamicGroup.remove(cv.mesh);
            disposeObjectTree(cv.mesh);
            sim.copsVeh.splice(i, 1);
          }
        }

        // --- Bullets Update ---
        let activeBulletCount = 0;
        for (let i = 0; i < bullets.length; i++) {
          const b = bullets[i];
          if (!b.active) continue;
          b.life -= dt;
          if (b.life <= 0) {
            b.active = false;
            continue;
          }

          const nextX = b.x + b.vx * dt;
          const nextY = b.y + b.vy * dt;
          const nextZ = b.z + b.vz * dt;
          if (nextY < 0.05) {
            b.active = false;
            spawnParticles(nextX, 0.1, nextZ, 4, 0xfde047, 5, 0.18);
            continue;
          }
          if (segmentIntersectsAabb(b.x, b.z, nextX, nextZ, buildings)) {
            b.active = false;
            spawnParticles(b.x, b.y, b.z, 4, 0xfde047, 5, 0.18);
            continue;
          }
          b.x = nextX;
          b.y = nextY;
          b.z = nextZ;

          let hitSomething = false;
          if (b.fromPlayer) {
            for (let cIdx = sim.copsFoot.length - 1; cIdx >= 0; cIdx--) {
              const cop = sim.copsFoot[cIdx];
              if (
                Math.hypot(b.x - cop.x, b.z - cop.z) < 0.9 &&
                b.y >= 0 &&
                b.y <= 2.2
              ) {
                cop.hp -= b.damage;
                hitSomething = true;
                spawnParticles(b.x, b.y, b.z, 6, 0xef4444, 6, 0.2);
                if (cop.hp <= 0) {
                  sim.copsDown += 1;
                  sim.cash += cop.isSwat ? 180 : 90;
                  addHeat(cop.isSwat ? 26 : 16);
                  if (cop.isSwat && Math.random() < 0.45) {
                    spawnPickup(Math.random() < 0.5 ? 'armor' : 'weapon', cop.x, cop.z, 'rifle');
                  } else if (Math.random() < 0.25) {
                    spawnPickup(Math.random() < 0.5 ? 'medkit' : 'cash', cop.x, cop.z);
                  }
                  dynamicGroup.remove(cop.mesh);
                  disposeObjectTree(cop.mesh);
                  sim.copsFoot.splice(cIdx, 1);
                }
                break;
              }
            }
            if (!hitSomething) {
              for (let vIdx = 0; vIdx < sim.copsVeh.length; vIdx++) {
                const cv = sim.copsVeh[vIdx];
                if (
                  Math.hypot(b.x - cv.x, b.z - cv.z) < 2.25 &&
                  b.y >= 0 &&
                  b.y <= 2.6
                ) {
                  cv.hp -= b.damage;
                  hitSomething = true;
                  spawnParticles(b.x, b.y, b.z, 5, 0xfacc15, 7, 0.22);
                  break;
                }
              }
            }
          } else {
            const hitRad = drivingCar ? 2.1 : 0.72;
            if (
              Math.hypot(b.x - sim.playerX, b.z - sim.playerZ) < hitRad &&
              Math.abs(b.y - (sim.playerY + 1.0)) < 1.25
            ) {
              hitSomething = true;
              if (drivingCar) {
                drivingCar.hp -= b.damage * 0.75;
                spawnParticles(b.x, b.y, b.z, 4, 0xfbbf24, 6, 0.2);
              } else {
                damagePlayer(b.damage);
                spawnParticles(b.x, b.y, b.z, 5, 0xef4444, 5, 0.22);
              }
            }
          }

          if (hitSomething) {
            b.active = false;
            continue;
          }

          dummy.position.set(b.x, b.y, b.z);
          dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
          dummy.scale.set(1, 1, b.scaleZ);
          dummy.updateMatrix();
          bulletInst.setMatrixAt(activeBulletCount, dummy.matrix);
          tmpColor.setHex(b.color);
          bulletInst.setColorAt(activeBulletCount, tmpColor);
          activeBulletCount += 1;
        }
        bulletInst.count = activeBulletCount;
        bulletInst.instanceMatrix.needsUpdate = true;
        if (bulletInst.instanceColor) bulletInst.instanceColor.needsUpdate = true;

        // --- Particles Update ---
        let activeParticleCount = 0;
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (!p.active) continue;
          p.life -= dt;
          if (p.life <= 0) {
            p.active = false;
            continue;
          }
          p.vy -= 18 * dt;
          p.x += p.vx * dt;
          p.y = Math.max(0.1, p.y + p.vy * dt);
          p.z += p.vz * dt;
          const sc = p.size * (p.life / p.maxLife);
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(p.life * 4, p.life * 6, 0);
          dummy.scale.set(sc, sc, sc);
          dummy.updateMatrix();
          particleInst.setMatrixAt(activeParticleCount, dummy.matrix);
          tmpColor.setHex(p.color);
          particleInst.setColorAt(activeParticleCount, tmpColor);
          activeParticleCount += 1;
        }
        particleInst.count = activeParticleCount;
        particleInst.instanceMatrix.needsUpdate = true;
        if (particleInst.instanceColor) particleInst.instanceColor.needsUpdate = true;

        sim.hudPushTimer += dt;
        if (sim.hudPushTimer >= 0.05) {
          sim.hudPushTimer = 0;
          pushHudSnapshot();
        }
      }

      renderer.render(scene, camera);
      afterDraw(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      disposeObjectTree(scene);
      asphaltTex.dispose();
      facadeTex.dispose();
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [inputRef]);

  return (
    <div ref={mountRef} className="relative h-full w-full select-none overflow-hidden bg-stone-950">
      {contextLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-stone-950/90 text-center p-6">
          <div className="space-y-2">
            <div className="font-display text-lg font-bold text-white">Graphics Context Paused</div>
            <p className="text-xs text-stone-400">Restoring 3D city renderer automatically…</p>
          </div>
        </div>
      )}
    </div>
  );
};
