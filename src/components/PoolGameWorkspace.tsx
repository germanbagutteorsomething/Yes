import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronLeft,
  CircleDot,
  Lock,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { useFullscreen } from '../hooks/useFullscreen';
import { ARCADE_UNLOCKABLES, POOL_CUE_STYLES, type PoolCueStyle } from '../types/arcade';
import {
  isItemUnlocked,
  loadArcadeState,
  recordPoolMatchResult,
  selectPoolCue,
  unlockArcadeItem,
} from '../utils/arcadeProgress';
import { playPoolSound } from '../utils/poolAudio';

interface PoolGameWorkspaceProps {
  soundEnabled: boolean;
  onBackToHub?: () => void;
  onStatsChange?: () => void;
}

type PoolMode = 'vs-ai' | 'two-player';
type BallGroup = 'solid' | 'stripe' | null;

interface PoolBall {
  id: number; // 0 = cue, 1..7 = solid, 8 = eight, 9..15 = stripe
  x: number;
  y: number;
  vx: number;
  vy: number;
  potted: boolean;
}

const TABLE_W = 880;
const TABLE_H = 440;
const RAIL_PAD = 42;
const FELT_X0 = RAIL_PAD;
const FELT_X1 = TABLE_W - RAIL_PAD;
const FELT_Y0 = RAIL_PAD;
const FELT_Y1 = TABLE_H - RAIL_PAD;
const BALL_R = 12.2;

const POCKETS = [
  { x: FELT_X0 + 4, y: FELT_Y0 + 4, r: 22 },
  { x: TABLE_W / 2, y: FELT_Y0 - 2, r: 20 },
  { x: FELT_X1 - 4, y: FELT_Y0 + 4, r: 22 },
  { x: FELT_X0 + 4, y: FELT_Y1 - 4, r: 22 },
  { x: TABLE_W / 2, y: FELT_Y1 + 2, r: 20 },
  { x: FELT_X1 - 4, y: FELT_Y1 - 4, r: 22 },
];

const BALL_COLORS: Record<number, string> = {
  0: '#F8FAFC',
  1: '#EAB308',
  2: '#2563EB',
  3: '#DC2626',
  4: '#7C3AED',
  5: '#EA580C',
  6: '#16A34A',
  7: '#881337',
  8: '#111827',
  9: '#EAB308',
  10: '#2563EB',
  11: '#DC2626',
  12: '#7C3AED',
  13: '#EA580C',
  14: '#16A34A',
  15: '#881337',
};

function createInitialRack(): PoolBall[] {
  const balls: PoolBall[] = [
    { id: 0, x: 228, y: TABLE_H / 2, vx: 0, vy: 0, potted: false },
  ];

  // Classic 8-ball triangle order (8 in center of row 3, one solid & one stripe in corners)
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const apexX = 626;
  const apexY = TABLE_H / 2;
  const dx = BALL_R * 1.76;
  const dy = BALL_R * 2.04;

  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const id = order[idx++];
      balls.push({
        id,
        x: apexX + row * dx,
        y: apexY + (col - row / 2) * dy,
        vx: 0,
        vy: 0,
        potted: false,
      });
    }
  }
  return balls;
}

export const PoolGameWorkspace: React.FC<PoolGameWorkspaceProps> = ({
  soundEnabled,
  onBackToHub,
  onStatsChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<PoolMode>('vs-ai');
  const [arcadeState, setArcadeState] = useState(() => loadArcadeState());
  const [cueStyleId, setCueStyleId] = useState<string>(
    () => loadArcadeState().poolStats.selectedCueId
  );
  const [unlockNote, setUnlockNote] = useState<string | null>(null);
  const {
    containerRef: poolFullscreenRef,
    isFullscreen,
    toggleFullscreen,
  } = useFullscreen<HTMLDivElement>();

  const [turn, setTurn] = useState<1 | 2>(1);
  const [groups, setGroups] = useState<{ 1: BallGroup; 2: BallGroup }>({ 1: null, 2: null });
  const [isShooting, setIsShooting] = useState<boolean>(false);
  const [ballInHand, setBallInHand] = useState<boolean>(false);
  const [powerPct, setPowerPct] = useState<number>(68);
  const [statusBanner, setStatusBanner] = useState<string>(
    'Drag anywhere on felt to aim · Pull Cue Power or tap Strike'
  );
  const [winner, setWinner] = useState<{
    player: 1 | 2;
    reason: string;
  } | null>(null);
  const [pottedIds, setPottedIds] = useState<number[]>([]);
  const [player1MatchPots, setPlayer1MatchPots] = useState<number>(0);

  const ballsRef = useRef<PoolBall[]>(createInitialRack());
  const aimAngleRef = useRef<number>(0);
  const powerRef = useRef<number>(0.68);
  const cuePullUiRef = useRef<number>(0);
  const turnRef = useRef<1 | 2>(1);
  turnRef.current = turn;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const winnerRef = useRef(winner);
  winnerRef.current = winner;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const cueStyleRef = useRef<PoolCueStyle>(
    POOL_CUE_STYLES.find((c) => c.id === cueStyleId) ?? POOL_CUE_STYLES[0]
  );
  cueStyleRef.current =
    POOL_CUE_STYLES.find((c) => c.id === cueStyleId) ?? POOL_CUE_STYLES[0];

  const shotTrackingRef = useRef<{
    active: boolean;
    firstHitId: number | null;
    pottedThisTurn: number[];
    cueScratched: boolean;
  }>({
    active: false,
    firstHitId: null,
    pottedThisTurn: [],
    cueScratched: false,
  });

  const dragAimRef = useRef<boolean>(false);
  const powerSliderDragRef = useRef<{
    active: boolean;
    startX: number;
    currentPower: number;
  }>({ active: false, startX: 0, currentPower: 0 });
  const [sliderPullPct, setSliderPullPct] = useState<number>(0);

  const p1PotsRef = useRef<number>(0);
  p1PotsRef.current = player1MatchPots;

  const resetRack = useCallback(
    (nextMode: PoolMode = mode) => {
      ballsRef.current = createInitialRack();
      aimAngleRef.current = 0;
      powerRef.current = 0.68;
      setPowerPct(68);
      setMode(nextMode);
      setTurn(1);
      setGroups({ 1: null, 2: null });
      setIsShooting(false);
      setBallInHand(false);
      setWinner(null);
      setPottedIds([]);
      setPlayer1MatchPots(0);
      p1PotsRef.current = 0;
      shotTrackingRef.current = {
        active: false,
        firstHitId: null,
        pottedThisTurn: [],
        cueScratched: false,
      };
      setStatusBanner(
        nextMode === 'vs-ai'
          ? 'Your break · Drag on felt to aim, then Strike'
          : 'Player 1 break · Drag on felt to aim, then Strike'
      );
    },
    [mode]
  );

  const strikeCueBall = useCallback((angle: number, strengthRatio: number) => {
    const cue = ballsRef.current.find((b) => b.id === 0);
    if (!cue || cue.potted || winnerRef.current) return;
    const clamped = Math.max(0.14, Math.min(1, strengthRatio));
    const speed = 4.8 + clamped * 17.5;
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    shotTrackingRef.current = {
      active: true,
      firstHitId: null,
      pottedThisTurn: [],
      cueScratched: false,
    };
    setBallInHand(false);
    setIsShooting(true);
    playPoolSound('cue', soundRef.current, clamped);
  }, []);

  // Evaluate AI shot cleanly when it is Player 2's turn in vs-ai mode
  useEffect(() => {
    if (mode !== 'vs-ai' || turn !== 2 || isShooting || winner) return;

    const timer = window.setTimeout(() => {
      const balls = ballsRef.current;
      let cue = balls.find((b) => b.id === 0)!;

      // Place cue ball cleanly if AI has ball-in-hand
      if (ballInHand || cue.potted) {
        cue.potted = false;
        cue.vx = 0;
        cue.vy = 0;
        let placedX = 240;
        let placedY = TABLE_H / 2;
        for (let attempt = 0; attempt < 24; attempt++) {
          const tx = 200 + (attempt % 6) * 75;
          const ty = 120 + Math.floor(attempt / 6) * 65;
          const blocked = balls.some(
            (b) => b.id !== 0 && !b.potted && Math.hypot(b.x - tx, b.y - ty) < BALL_R * 2.5
          );
          if (!blocked) {
            placedX = tx;
            placedY = ty;
            break;
          }
        }
        cue.x = placedX;
        cue.y = placedY;
        setBallInHand(false);
      }

      const aiGroup = groupsRef.current[2];
      const remainingGroupBalls = balls.filter((b) => {
        if (b.potted || b.id === 0 || b.id === 8) return false;
        if (!aiGroup) return true;
        return aiGroup === 'solid' ? b.id <= 7 : b.id >= 9;
      });
      const targetList =
        remainingGroupBalls.length > 0
          ? remainingGroupBalls
          : balls.filter((b) => !b.potted && b.id === 8);

      let bestAngle = 0;
      let bestScore = -9999;
      let bestPower = 0.72;

      for (const obj of targetList) {
        for (const p of POCKETS) {
          const toPx = p.x - obj.x;
          const toPy = p.y - obj.y;
          const distObjPocket = Math.hypot(toPx, toPy) || 1;
          const ux = toPx / distObjPocket;
          const uy = toPy / distObjPocket;

          const ghostX = obj.x - ux * (BALL_R * 2);
          const ghostY = obj.y - uy * (BALL_R * 2);
          if (
            ghostX < FELT_X0 + BALL_R ||
            ghostX > FELT_X1 - BALL_R ||
            ghostY < FELT_Y0 + BALL_R ||
            ghostY > FELT_Y1 - BALL_R
          ) {
            continue;
          }

          const toCx = ghostX - cue.x;
          const toCy = ghostY - cue.y;
          const distCueGhost = Math.hypot(toCx, toCy) || 1;
          const cux = toCx / distCueGhost;
          const cuy = toCy / distCueGhost;

          const alignment = cux * ux + cuy * uy;
          if (alignment < 0.28) continue;

          // Check obstacle blocking along cue->ghost or obj->pocket
          const blocked = balls.some((other) => {
            if (other.potted || other.id === 0 || other.id === obj.id) return false;
            const proj1 = (other.x - cue.x) * cux + (other.y - cue.y) * cuy;
            if (proj1 > 0 && proj1 < distCueGhost) {
              const perp1 = Math.abs((other.x - cue.x) * cuy - (other.y - cue.y) * cux);
              if (perp1 < BALL_R * 2.05) return true;
            }
            const proj2 = (other.x - obj.x) * ux + (other.y - obj.y) * uy;
            if (proj2 > 0 && proj2 < distObjPocket) {
              const perp2 = Math.abs((other.x - obj.x) * uy - (other.y - obj.y) * ux);
              if (perp2 < BALL_R * 2.05) return true;
            }
            return false;
          });

          const score =
            alignment * 100 -
            (distObjPocket + distCueGhost) * 0.08 -
            (blocked ? 120 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestAngle = Math.atan2(toCy, toCx);
            bestPower = Math.min(0.92, Math.max(0.45, 0.42 + (distCueGhost + distObjPocket) / 1100));
          }
        }
      }

      if (bestScore < -500 && targetList[0]) {
        bestAngle = Math.atan2(targetList[0].y - cue.y, targetList[0].x - cue.x);
        bestPower = 0.78;
      }

      // Slight human-like bot variance so matches stay competitive
      const jitter = (Math.random() - 0.5) * 0.035;
      aimAngleRef.current = bestAngle + jitter;
      strikeCueBall(aimAngleRef.current, bestPower);
    }, 680);

    return () => window.clearTimeout(timer);
  }, [ballInHand, isShooting, mode, strikeCueBall, turn, winner]);

  // Main 60 FPS Canvas Simulation + Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();

    const finishTurnRules = () => {
      const balls = ballsRef.current;
      const track = shotTrackingRef.current;
      track.active = false;
      setIsShooting(false);

      const shooter = turnRef.current;
      const opp: 1 | 2 = shooter === 1 ? 2 : 1;
      const curGroups = groupsRef.current;
      const shooterName =
        modeRef.current === 'vs-ai'
          ? shooter === 1
            ? 'You'
            : 'Pool Bot'
          : `Player ${shooter}`;
      const oppName =
        modeRef.current === 'vs-ai' ? (opp === 1 ? 'You' : 'Pool Bot') : `Player ${opp}`;

      const pottedNonCue = track.pottedThisTurn.filter((id) => id !== 0);
      const pottedEight = pottedNonCue.includes(8);
      const cue = balls.find((b) => b.id === 0)!;

      // Update UI potted rack & Player 1 pot counter
      setPottedIds(balls.filter((b) => b.id !== 0 && b.potted).map((b) => b.id));
      if (shooter === 1 && pottedNonCue.length > 0) {
        const nextP1 = p1PotsRef.current + pottedNonCue.length;
        p1PotsRef.current = nextP1;
        setPlayer1MatchPots(nextP1);
      }

      // Check 8-ball potted
      if (pottedEight) {
        const myGroup = curGroups[shooter];
        const remainingMine = myGroup
          ? balls.some(
              (b) =>
                !b.potted &&
                b.id !== 0 &&
                b.id !== 8 &&
                (myGroup === 'solid' ? b.id <= 7 : b.id >= 9)
            )
          : true;

        const matchWinner = track.cueScratched || remainingMine ? opp : shooter;
        const winReason =
          track.cueScratched
            ? `${shooterName} scratched on the 8-ball!`
            : remainingMine
              ? `${shooterName} sunk the 8-ball early!`
              : `${matchWinner === 1 ? (modeRef.current === 'vs-ai' ? 'You' : 'Player 1') : oppName} sunk the 8-ball cleanly!`;
        setWinner({ player: matchWinner, reason: winReason });
        setStatusBanner(winReason);
        playPoolSound('win', soundRef.current);

        const nextArcade = recordPoolMatchResult({
          wonVsAi: modeRef.current === 'vs-ai' && matchWinner === 1,
          ballsPotted: p1PotsRef.current,
        });
        setArcadeState(nextArcade);
        onStatsChange?.();
        return;
      }

      // Assign solids/stripes on first legal non-8 pot
      let activeGroups = { ...curGroups };
      if (!activeGroups[1] && !track.cueScratched) {
        const firstAssigned = pottedNonCue.find((id) => id !== 8);
        if (firstAssigned) {
          const isSolid = firstAssigned <= 7;
          activeGroups = {
            1: shooter === 1 ? (isSolid ? 'solid' : 'stripe') : isSolid ? 'stripe' : 'solid',
            2: shooter === 2 ? (isSolid ? 'solid' : 'stripe') : isSolid ? 'stripe' : 'solid',
          };
          setGroups(activeGroups);
        }
      }

      // Check fouls (scratch or no ball contacted)
      let foulReason: string | null = null;
      if (track.cueScratched) {
        foulReason = `${shooterName} scratched! ${oppName} gets Ball-in-Hand.`;
      } else if (track.firstHitId === null) {
        foulReason = `Foul: Cue ball missed all balls. ${oppName} gets Ball-in-Hand.`;
      } else if (activeGroups[shooter]) {
        const hitSolid = track.firstHitId <= 7;
        const hitStripe = track.firstHitId >= 9;
        const mustHitEight = !balls.some(
          (b) =>
            !b.potted &&
            b.id !== 0 &&
            b.id !== 8 &&
            (activeGroups[shooter] === 'solid' ? b.id <= 7 : b.id >= 9)
        );
        if (mustHitEight && track.firstHitId !== 8) {
          foulReason = `Foul: Must strike the 8-ball first. ${oppName} gets Ball-in-Hand.`;
        } else if (
          !mustHitEight &&
          ((activeGroups[shooter] === 'solid' && !hitSolid) ||
            (activeGroups[shooter] === 'stripe' && !hitStripe))
        ) {
          foulReason = `Foul: Struck opponent's ball first. ${oppName} gets Ball-in-Hand.`;
        }
      }

      if (foulReason) {
        if (cue.potted) {
          cue.potted = false;
          cue.x = 228;
          cue.y = TABLE_H / 2;
          cue.vx = 0;
          cue.vy = 0;
        }
        playPoolSound('foul', soundRef.current);
        setTurn(opp);
        setBallInHand(true);
        setStatusBanner(foulReason);
        return;
      }

      // Legal shot: check if shooter pocketed any of their own balls
      const shooterGroup = activeGroups[shooter];
      const pocketedOwn = pottedNonCue.some((id) =>
        shooterGroup ? (shooterGroup === 'solid' ? id <= 7 : id >= 9) : id !== 8
      );

      if (pocketedOwn) {
        setStatusBanner(`${shooterName} sunk a ball — keep shooting!`);
      } else {
        setTurn(opp);
        setStatusBanner(
          modeRef.current === 'vs-ai'
            ? opp === 1
              ? 'Your turn · Drag felt to aim'
              : 'Pool Bot lining up shot…'
            : `Player ${opp}'s turn`
        );
      }
    };

    const stepPhysics = (subDt: number) => {
      const balls = ballsRef.current;
      const scale = subDt * 60;
      const friction = Math.pow(0.985, scale);

      for (const b of balls) {
        if (b.potted) continue;
        b.x += b.vx * scale;
        b.y += b.vy * scale;
        b.vx *= friction;
        b.vy *= friction;
        if (Math.hypot(b.vx, b.vy) < 0.045) {
          b.vx = 0;
          b.vy = 0;
        }

        // Pocket detection before rail bounce
        let sunk = false;
        for (const p of POCKETS) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) {
            b.potted = true;
            b.vx = 0;
            b.vy = 0;
            sunk = true;
            if (b.id === 0) {
              shotTrackingRef.current.cueScratched = true;
              playPoolSound('foul', soundRef.current);
            } else {
              shotTrackingRef.current.pottedThisTurn.push(b.id);
              playPoolSound('pocket', soundRef.current);
            }
            break;
          }
        }
        if (sunk) continue;

        // Cushion bounces (skip pocket mouth openings cleanly)
        const nearMidX = Math.abs(b.x - TABLE_W / 2) < 22;
        const nearCornerY = b.y < FELT_Y0 + 20 || b.y > FELT_Y1 - 20;
        const nearCornerX = b.x < FELT_X0 + 20 || b.x > FELT_X1 - 20;

        if (b.x - BALL_R < FELT_X0 && !nearCornerY) {
          b.x = FELT_X0 + BALL_R;
          b.vx = Math.abs(b.vx) * 0.84;
          if (Math.abs(b.vx) > 0.7) playPoolSound('cushion', soundRef.current, Math.abs(b.vx) / 14);
        } else if (b.x + BALL_R > FELT_X1 && !nearCornerY) {
          b.x = FELT_X1 - BALL_R;
          b.vx = -Math.abs(b.vx) * 0.84;
          if (Math.abs(b.vx) > 0.7) playPoolSound('cushion', soundRef.current, Math.abs(b.vx) / 14);
        }

        if (b.y - BALL_R < FELT_Y0 && !nearMidX && !nearCornerX) {
          b.y = FELT_Y0 + BALL_R;
          b.vy = Math.abs(b.vy) * 0.84;
          if (Math.abs(b.vy) > 0.7) playPoolSound('cushion', soundRef.current, Math.abs(b.vy) / 14);
        } else if (b.y + BALL_R > FELT_Y1 && !nearMidX && !nearCornerX) {
          b.y = FELT_Y1 - BALL_R;
          b.vy = -Math.abs(b.vy) * 0.84;
          if (Math.abs(b.vy) > 0.7) playPoolSound('cushion', soundRef.current, Math.abs(b.vy) / 14);
        }
      }

      // Elastic Ball-to-Ball Collisions
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.potted) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.potted) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const minDist = BALL_R * 2;
          if (dist > 0 && dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = (minDist - dist) * 0.5;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;

            const dvx = a.vx - b.vx;
            const dvy = a.vy - b.vy;
            const impact = dvx * nx + dvy * ny;
            if (impact > 0) {
              const restitution = 0.94;
              const impulse = impact * restitution;
              a.vx -= impulse * nx;
              a.vy -= impulse * ny;
              b.vx += impulse * nx;
              b.vy += impulse * ny;

              if (shotTrackingRef.current.firstHitId === null) {
                if (a.id === 0) shotTrackingRef.current.firstHitId = b.id;
                else if (b.id === 0) shotTrackingRef.current.firstHitId = a.id;
              }
              if (impact > 0.45) {
                playPoolSound('clack', soundRef.current, Math.min(1, impact / 13));
              }
            }
          }
        }
      }
    };

    const drawTable = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = TABLE_W * dpr;
      const targetH = TABLE_H * dpr;
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Outer Walnut Wooden Frame
      ctx.fillStyle = '#3B2314';
      ctx.beginPath();
      ctx.roundRect(0, 0, TABLE_W, TABLE_H, 22);
      ctx.fill();

      // Subtle bevel trim around wood frame
      ctx.strokeStyle = '#6B4226';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(2, 2, TABLE_W - 4, TABLE_H - 4, 20);
      ctx.stroke();

      // Brass Corner Brackets
      ctx.fillStyle = '#C99A3B';
      const cornerPads = [
        [8, 8],
        [TABLE_W - 48, 8],
        [8, TABLE_H - 48],
        [TABLE_W - 48, TABLE_H - 48],
      ];
      for (const [cx, cy] of cornerPads) {
        ctx.beginPath();
        ctx.roundRect(cx, cy, 40, 40, 12);
        ctx.fill();
      }

      // Cushion Inner Lip
      ctx.fillStyle = '#0D4A34';
      ctx.fillRect(FELT_X0 - 6, FELT_Y0 - 6, FELT_X1 - FELT_X0 + 12, FELT_Y1 - FELT_Y0 + 12);

      // Tournament Emerald Baize Felt with Overhead Studio Radial Lighting
      const feltGrad = ctx.createRadialGradient(
        TABLE_W * 0.5,
        TABLE_H * 0.5,
        40,
        TABLE_W * 0.5,
        TABLE_H * 0.5,
        TABLE_W * 0.62
      );
      feltGrad.addColorStop(0, '#1B825B');
      feltGrad.addColorStop(0.65, '#136B4B');
      feltGrad.addColorStop(1, '#0C4F37');
      ctx.fillStyle = feltGrad;
      ctx.fillRect(FELT_X0, FELT_Y0, FELT_X1 - FELT_X0, FELT_Y1 - FELT_Y0);

      // Head String Line & Foot Spot
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(228, FELT_Y0);
      ctx.lineTo(228, FELT_Y1);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(626, TABLE_H / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Rail Diamond Sights
      ctx.fillStyle = '#E5C07B';
      for (let i = 1; i <= 7; i++) {
        if (i === 4) continue;
        const sx = FELT_X0 + ((FELT_X1 - FELT_X0) * i) / 8;
        ctx.beginPath();
        ctx.arc(sx, RAIL_PAD * 0.45, 2.8, 0, Math.PI * 2);
        ctx.arc(sx, TABLE_H - RAIL_PAD * 0.45, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 1; i <= 3; i++) {
        const sy = FELT_Y0 + ((FELT_Y1 - FELT_Y0) * i) / 4;
        ctx.beginPath();
        ctx.arc(RAIL_PAD * 0.45, sy, 2.8, 0, Math.PI * 2);
        ctx.arc(TABLE_W - RAIL_PAD * 0.45, sy, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6 Pockets
      for (const p of POCKETS) {
        ctx.fillStyle = '#090D0B';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#52341E';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      const balls = ballsRef.current;
      const cue = balls[0];

      // Aim Ray & Ghost Contact Indicator (when idle on human turn)
      const humanCanAim =
        !shotTrackingRef.current.active &&
        !winnerRef.current &&
        (modeRef.current === 'two-player' || turnRef.current === 1);

      if (humanCanAim && !cue.potted) {
        const dx = Math.cos(aimAngleRef.current);
        const dy = Math.sin(aimAngleRef.current);

        // Raycast closest ball or rail hit for ghost contact preview
        let bestT = 950;
        let hitBall: PoolBall | null = null;

        for (const b of balls) {
          if (b.id === 0 || b.potted) continue;
          const ox = b.x - cue.x;
          const oy = b.y - cue.y;
          const proj = ox * dx + oy * dy;
          if (proj <= 0) continue;
          const perpSq = ox * ox + oy * oy - proj * proj;
          const rSum = BALL_R * 2;
          if (perpSq <= rSum * rSum) {
            const tHit = proj - Math.sqrt(Math.max(0, rSum * rSum - perpSq));
            if (tHit > 0 && tHit < bestT) {
              bestT = tHit;
              hitBall = b;
            }
          }
        }

        // Clamp against felt rails if no ball hit first
        if (dx > 0.001) bestT = Math.min(bestT, (FELT_X1 - BALL_R - cue.x) / dx);
        if (dx < -0.001) bestT = Math.min(bestT, (FELT_X0 + BALL_R - cue.x) / dx);
        if (dy > 0.001) bestT = Math.min(bestT, (FELT_Y1 - BALL_R - cue.y) / dy);
        if (dy < -0.001) bestT = Math.min(bestT, (FELT_Y0 + BALL_R - cue.y) / dy);

        const gx = cue.x + dx * bestT;
        const gy = cue.y + dy * bestT;

        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(gx, gy);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(gx, gy, BALL_R, 0, Math.PI * 2);
        ctx.stroke();

        // Object ball post-impact direction line
        if (hitBall) {
          const ndx = hitBall.x - gx;
          const ndy = hitBall.y - gy;
          const nLen = Math.hypot(ndx, ndy) || 1;
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(hitBall.x, hitBall.y);
          ctx.lineTo(hitBall.x + (ndx / nLen) * 58, hitBall.y + (ndy / nLen) * 58);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw Balls with Drop Shadow, Stripe Band, Number Circle, & Specular Sheen
      for (const b of balls) {
        if (b.potted) continue;

        // Soft ambient shadow offset under overhead lamp
        ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
        ctx.beginPath();
        ctx.ellipse(b.x + 2.5, b.y + 3.2, BALL_R, BALL_R * 0.92, 0, 0, Math.PI * 2);
        ctx.fill();

        const baseColor = BALL_COLORS[b.id] ?? '#FFFFFF';
        const isStripe = b.id >= 9;

        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.clip();

        if (isStripe) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(b.x - BALL_R, b.y - BALL_R, BALL_R * 2, BALL_R * 2);
          ctx.fillStyle = baseColor;
          ctx.fillRect(b.x - BALL_R, b.y - BALL_R * 0.56, BALL_R * 2, BALL_R * 1.12);
        } else {
          ctx.fillStyle = baseColor;
          ctx.fillRect(b.x - BALL_R, b.y - BALL_R, BALL_R * 2, BALL_R * 2);
        }

        // Number disc on non-cue balls
        if (b.id !== 0) {
          ctx.fillStyle = '#F8FAFC';
          ctx.beginPath();
          ctx.arc(b.x, b.y, BALL_R * 0.44, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 8.5px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(b.id), b.x, b.y + 0.5);
        }

        // Glossy specular highlight
        const spec = ctx.createRadialGradient(
          b.x - BALL_R * 0.35,
          b.y - BALL_R * 0.38,
          1,
          b.x,
          b.y,
          BALL_R
        );
        spec.addColorStop(0, 'rgba(255,255,255,0.62)');
        spec.addColorStop(0.35, 'rgba(255,255,255,0.08)');
        spec.addColorStop(1, 'rgba(0,0,0,0.28)');
        ctx.fillStyle = spec;
        ctx.fillRect(b.x - BALL_R, b.y - BALL_R, BALL_R * 2, BALL_R * 2);
        ctx.restore();
      }

      // Draw Active Cue Stick behind Cue Ball
      if (!shotTrackingRef.current.active && !winnerRef.current && !cue.potted) {
        const cueStyle = cueStyleRef.current;
        const pullback = 18 + (cuePullUiRef.current > 0 ? cuePullUiRef.current : powerRef.current * 24);
        const angle = aimAngleRef.current;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const tipX = cue.x - cosA * pullback;
        const tipY = cue.y - sinA * pullback;
        const midX = tipX - cosA * 105;
        const midY = tipY - sinA * 105;
        const buttX = tipX - cosA * 225;
        const buttY = tipY - sinA * 225;

        ctx.save();
        ctx.lineCap = 'round';
        // Shaft
        ctx.strokeStyle = cueStyle.shaftColor;
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(midX, midY);
        ctx.stroke();

        // Butt
        ctx.strokeStyle = cueStyle.buttColor;
        ctx.lineWidth = 7.2;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(buttX, buttY);
        ctx.stroke();

        // Inlay Accent Band
        ctx.strokeStyle = cueStyle.inlayColor;
        ctx.lineWidth = 7.4;
        ctx.beginPath();
        ctx.moveTo(midX - cosA * 12, midY - sinA * 12);
        ctx.lineTo(midX - cosA * 26, midY - sinA * 26);
        ctx.stroke();

        // Ferrule & Tip
        ctx.strokeStyle = cueStyle.ferruleColor;
        ctx.lineWidth = 4.6;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - cosA * 6, tipY - sinA * 6);
        ctx.stroke();
        ctx.restore();
      }
    };

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.032, Math.max(0.002, (now - lastTime) / 1000));
      lastTime = now;

      if (shotTrackingRef.current.active) {
        const subSteps = 3;
        for (let s = 0; s < subSteps; s++) {
          stepPhysics(dt / subSteps);
        }
        const anyMoving = ballsRef.current.some(
          (b) => !b.potted && (Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01)
        );
        if (!anyMoving) {
          finishTurnRules();
        }
      }

      drawTable();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onStatsChange]);

  // Pointer Interaction on Table Canvas (Aim OR Place Cue Ball if Ball-in-Hand)
  const canvasToTable = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: TABLE_W / 2, y: TABLE_H / 2 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * TABLE_W,
      y: ((clientY - rect.top) / rect.height) * TABLE_H,
    };
  }, []);

  const canHumanAct =
    !isShooting && !winner && (mode === 'two-player' || turn === 1);

  const handleTablePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canHumanAct) return;
    e.preventDefault();
    const pos = canvasToTable(e.clientX, e.clientY);

    if (ballInHand) {
      const clampedX = Math.max(FELT_X0 + BALL_R + 2, Math.min(FELT_X1 - BALL_R - 2, pos.x));
      const clampedY = Math.max(FELT_Y0 + BALL_R + 2, Math.min(FELT_Y1 - BALL_R - 2, pos.y));
      const overlaps = ballsRef.current.some(
        (b) => b.id !== 0 && !b.potted && Math.hypot(b.x - clampedX, b.y - clampedY) < BALL_R * 2.15
      );
      if (!overlaps) {
        const cue = ballsRef.current[0];
        cue.x = clampedX;
        cue.y = clampedY;
        cue.potted = false;
        cue.vx = 0;
        cue.vy = 0;
        setBallInHand(false);
        setStatusBanner('Cue ball placed · Drag to aim, then Strike');
      }
      return;
    }

    dragAimRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const cue = ballsRef.current[0];
    aimAngleRef.current = Math.atan2(pos.y - cue.y, pos.x - cue.x);
  };

  const handleTablePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragAimRef.current || !canHumanAct) return;
    const pos = canvasToTable(e.clientX, e.clientY);
    const cue = ballsRef.current[0];
    aimAngleRef.current = Math.atan2(pos.y - cue.y, pos.x - cue.x);
  };

  const handleTablePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragAimRef.current) return;
    dragAimRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Interactive Pull-Back Cue Strip (Natural on Touch & Mouse!)
  const handlePullDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canHumanAct || ballInHand) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    powerSliderDragRef.current = {
      active: true,
      startX: e.clientX,
      currentPower: 0.25,
    };
    cuePullUiRef.current = 12;
    setSliderPullPct(25);
  };

  const handlePullMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!powerSliderDragRef.current.active) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0.15, Math.min(1, (e.clientX - rect.left) / rect.width));
    powerSliderDragRef.current.currentPower = ratio;
    powerRef.current = ratio;
    cuePullUiRef.current = ratio * 34;
    setPowerPct(Math.round(ratio * 100));
    setSliderPullPct(Math.round(ratio * 100));
  };

  const handlePullUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!powerSliderDragRef.current.active) return;
    const finalPower = powerSliderDragRef.current.currentPower;
    powerSliderDragRef.current.active = false;
    cuePullUiRef.current = 0;
    setSliderPullPct(0);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    strikeCueBall(aimAngleRef.current, finalPower);
  };

  const handleSelectCue = (cueId: string) => {
    const unlocked = isItemUnlocked(arcadeState, 'pool-cue', cueId);
    if (!unlocked) {
      const def = ARCADE_UNLOCKABLES.find(
        (u) => u.category === 'pool-cue' && u.targetId === cueId
      );
      if (def) {
        const res = unlockArcadeItem(def.id);
        setArcadeState(res.state);
        if (!res.ok) {
          setUnlockNote(res.error ?? 'Earn XP from Daily Challenges or matches.');
          return;
        }
        setUnlockNote(`Unlocked ${def.name}!`);
        onStatsChange?.();
      }
    } else {
      setUnlockNote(null);
    }
    setCueStyleId(cueId);
    setArcadeState(selectPoolCue(cueId));
  };

  const pottedSolids = useMemo(() => pottedIds.filter((id) => id >= 1 && id <= 7), [pottedIds]);
  const pottedStripes = useMemo(() => pottedIds.filter((id) => id >= 9), [pottedIds]);

  const activeTurnLabel =
    mode === 'vs-ai' ? (turn === 1 ? 'Your Turn' : 'Pool Bot') : `Player ${turn}`;

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
              {onBackToHub && (
                <>
                  <button
                    type="button"
                    onClick={onBackToHub}
                    className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>All Games</span>
                  </button>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>8-Ball Billiards</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {arcadeState.poolStats.wins} Wins · {arcadeState.poolStats.ballsPotted} Potted
              </span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100">
              SquareEight 8-Ball Pool
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 p-1">
              <button
                type="button"
                onClick={() => resetRack('vs-ai')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  mode === 'vs-ai'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>vs Pool Bot</span>
              </button>
              <button
                type="button"
                onClick={() => resetRack('two-player')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  mode === 'two-player'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>2 Players</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => resetRack(mode)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-Rack</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors whitespace-nowrap"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Exit Full</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Fullscreen</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Main Table + Side Console */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* Table Column (Fullscreen Target) */}
        <div
          ref={poolFullscreenRef}
          className={
            isFullscreen
              ? 'fixed inset-0 z-50 flex flex-col justify-between gap-2.5 overflow-y-auto bg-stone-100 dark:bg-stone-950 p-3 sm:p-5'
              : 'space-y-3'
          }
        >
          {isFullscreen && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2">
              <span className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                SquareEight 8-Ball Pool
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => resetRack(mode)}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-Rack</span>
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-2.5 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 whitespace-nowrap"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Exit Fullscreen</span>
                </button>
              </div>
            </div>
          )}

          {/* Player Turn & Ball Groups Strip */}
          <div className={`grid grid-cols-2 gap-2.5 ${isFullscreen ? 'mx-auto w-full max-w-[1100px]' : ''}`}>
            <div
              className={`rounded-lg border px-3 py-2 flex items-center justify-between text-xs ${
                turn === 1 && !winner
                  ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                  : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
              }`}
            >
              <div>
                <div className="font-semibold text-stone-900 dark:text-stone-100">
                  {mode === 'vs-ai' ? 'You (P1)' : 'Player 1'}
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400">
                  {groups[1] ? (groups[1] === 'solid' ? 'Solids (1–7)' : 'Stripes (9–15)') : 'Open Table'}
                </div>
              </div>
              <div className="font-mono text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {groups[1]
                  ? `${(groups[1] === 'solid' ? pottedSolids : pottedStripes).length}/7`
                  : '—'}
              </div>
            </div>

            <div
              className={`rounded-lg border px-3 py-2 flex items-center justify-between text-xs ${
                turn === 2 && !winner
                  ? 'border-amber-600 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/30'
                  : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
              }`}
            >
              <div>
                <div className="font-semibold text-stone-900 dark:text-stone-100">
                  {mode === 'vs-ai' ? 'Pool Bot (P2)' : 'Player 2'}
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400">
                  {groups[2] ? (groups[2] === 'solid' ? 'Solids (1–7)' : 'Stripes (9–15)') : 'Open Table'}
                </div>
              </div>
              <div className="font-mono text-xs font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {groups[2]
                  ? `${(groups[2] === 'solid' ? pottedSolids : pottedStripes).length}/7`
                  : '—'}
              </div>
            </div>
          </div>

          {/* 2:1 High-DPI Billiards Canvas */}
          <div
            className={`relative overflow-hidden rounded-2xl border border-stone-300 dark:border-stone-800 bg-stone-950 shadow-sm ${
              isFullscreen ? 'mx-auto w-full max-w-[min(100%,calc((100dvh-250px)*2))]' : 'w-full'
            }`}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handleTablePointerDown}
              onPointerMove={handleTablePointerMove}
              onPointerUp={handleTablePointerUp}
              onPointerCancel={handleTablePointerUp}
              className="block w-full aspect-[2/1] touch-none select-none cursor-crosshair"
            />

            {winner && (
              <div className="absolute inset-0 flex items-center justify-center bg-stone-950/75 p-4">
                <div className="w-full max-w-sm rounded-xl border border-emerald-500/50 bg-stone-900 p-5 text-center text-white space-y-3 animate-chess-modal">
                  <Trophy className="w-8 h-8 mx-auto text-amber-400" />
                  <h2 className="font-display text-xl font-bold">
                    {mode === 'vs-ai'
                      ? winner.player === 1
                        ? 'You Win!'
                        : 'Pool Bot Wins'
                      : `Player ${winner.player} Wins!`}
                  </h2>
                  <p className="text-xs text-stone-300">{winner.reason}</p>
                  <button
                    type="button"
                    onClick={() => resetRack(mode)}
                    className="w-full rounded-lg bg-emerald-600 py-2.5 px-4 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                  >
                    Play Another Rack
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Touch & Desktop Shot Control Deck */}
          <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-stone-700 dark:text-stone-300 truncate">
                {statusBanner}
              </span>
              <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                {activeTurnLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
              {/* Touch-Friendly Drag & Release Cue Power Strip */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
                  <span>Drag & Release Cue Strip to Strike</span>
                  <span className="font-mono font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                    Power {sliderPullPct > 0 ? sliderPullPct : powerPct}%
                  </span>
                </div>
                <div
                  onPointerDown={handlePullDown}
                  onPointerMove={handlePullMove}
                  onPointerUp={handlePullUp}
                  onPointerCancel={handlePullUp}
                  className={`relative h-11 w-full rounded-xl border touch-none select-none overflow-hidden cursor-ew-resize flex items-center px-3 ${
                    canHumanAct && !ballInHand
                      ? 'border-emerald-600/40 bg-stone-100 dark:bg-stone-800'
                      : 'border-stone-200 dark:border-stone-800 bg-stone-100/60 dark:bg-stone-800/40 opacity-50 pointer-events-none'
                  }`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-emerald-600/30 transition-[width] duration-75"
                    style={{ width: `${sliderPullPct > 0 ? sliderPullPct : powerPct}%` }}
                  />
                  <span className="relative z-10 text-xs font-semibold text-stone-800 dark:text-stone-200">
                    {ballInHand
                      ? 'Tap Table Felt First to Place Cue Ball'
                      : sliderPullPct > 0
                        ? `Release to Strike (${sliderPullPct}%)`
                        : 'Slide Across & Release to Shoot'}
                  </span>
                </div>
              </div>

              {/* Fine Aim + Direct Strike Button */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!canHumanAct || ballInHand}
                  onClick={() => {
                    aimAngleRef.current -= 0.02;
                  }}
                  title="Fine aim left"
                  className="h-11 px-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40"
                >
                  ↺
                </button>
                <button
                  type="button"
                  disabled={!canHumanAct || ballInHand}
                  onClick={() => {
                    aimAngleRef.current += 0.02;
                  }}
                  title="Fine aim right"
                  className="h-11 px-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40"
                >
                  ↻
                </button>
                <button
                  type="button"
                  disabled={!canHumanAct || ballInHand}
                  onClick={() => strikeCueBall(aimAngleRef.current, powerRef.current)}
                  className="h-11 px-5 rounded-lg bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  Strike ({powerPct}%)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Rack Tracker, Cue Locker & Rules */}
        <aside className="space-y-4">
          {/* Potted Balls Display */}
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CircleDot className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                  Potted Rack
                </h2>
              </div>
              <span className="font-mono text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                {pottedIds.length}/15
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">
                  Solids (1–7)
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                  {[1, 2, 3, 4, 5, 6, 7].map((id) => {
                    const gone = pottedIds.includes(id);
                    return (
                      <span
                        key={id}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[10px] font-bold transition-opacity ${
                          gone ? 'opacity-100 text-white' : 'opacity-25 text-white'
                        }`}
                        style={{ backgroundColor: BALL_COLORS[id] }}
                      >
                        {id}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">
                  Stripes (9–15) & 8-Ball
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                  {[9, 10, 11, 12, 13, 14, 15, 8].map((id) => {
                    const gone = pottedIds.includes(id);
                    return (
                      <span
                        key={id}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 font-mono text-[10px] font-bold transition-opacity ${
                          gone ? 'opacity-100' : 'opacity-25'
                        } ${
                          id === 8
                            ? 'bg-stone-950 text-white border-stone-600'
                            : 'bg-white text-stone-900'
                        }`}
                        style={{ borderColor: id === 8 ? undefined : BALL_COLORS[id] }}
                      >
                        {id}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Cue Stick Locker (with XP Unlockables) */}
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
                  Cue Locker
                </h2>
              </div>
              <span className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                {arcadeState.xp} XP
              </span>
            </div>

            {unlockNote && (
              <div className="rounded-lg border border-amber-300/70 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                {unlockNote}
              </div>
            )}

            <div className="space-y-1.5">
              {POOL_CUE_STYLES.map((cue) => {
                const active = cue.id === cueStyleId;
                const unlocked = isItemUnlocked(arcadeState, 'pool-cue', cue.id);
                return (
                  <button
                    key={cue.id}
                    type="button"
                    onClick={() => handleSelectCue(cue.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-stone-900 dark:text-stone-100'
                        : 'border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-2.5 w-8 rounded-full border border-black/15 shrink-0"
                        style={{
                          background: `linear-gradient(90deg, ${cue.buttColor} 48%, ${cue.inlayColor} 48%, ${cue.inlayColor} 58%, ${cue.shaftColor} 58%)`,
                        }}
                      />
                      <span className="truncate">{cue.name}</span>
                    </div>
                    {!unlocked && cue.unlockCostXp > 0 && (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-600 dark:text-amber-400 shrink-0">
                        <Lock className="w-3 h-3" />
                        {cue.unlockCostXp} XP
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Quick Rules Card */}
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-2 text-xs text-stone-600 dark:text-stone-400">
            <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
              <Target className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>8-Ball Rules</span>
            </div>
            <p className="leading-relaxed">
              First legal pot claims Solids or Stripes. Clear all 7 balls of your group, then
              sink the 8-ball cleanly to win. Scratches grant the opponent Ball-in-Hand.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
};
