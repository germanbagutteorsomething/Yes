import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  TIME_CONTROLS,
  type CrazyhouseSetupMode,
  type GameEndReason,
  type GameResult,
  type GameVariant,
  type MoveRecord,
  type PlayerColor,
  type SideChoice,
  type TimeControlId,
} from '../types/chess';
import { generateVariantStartFen } from '../utils/variants';

export type OnlineGameStatus = 'open' | 'active' | 'finished' | 'aborted';
export type OnlineVisibility = 'public' | 'link';

export interface OnlineChessGame {
  id: string;
  status: OnlineGameStatus;
  visibility: OnlineVisibility;
  hostUid: string;
  hostName: string;
  guestUid: string;
  guestName: string;
  hostColor: PlayerColor;
  whiteUid: string;
  blackUid: string;
  variant: GameVariant;
  crazyhouseSetup: CrazyhouseSetupMode;
  timeControlId: TimeControlId;
  baseMs: number;
  incrementMs: number;
  perMove: boolean;
  startFen: string;
  fen: string;
  turn: PlayerColor;
  ply: number;
  lastMoveSan: string;
  lastMoveLan: string;
  lastMoveFrom: string;
  lastMoveTo: string;
  lastMoveColor: '' | PlayerColor;
  lastMoveIsCheck: boolean;
  lastMoveIsCheckmate: boolean;
  lastMoveIsCapture: boolean;
  lastMoveIsCastle: boolean;
  lastMoveIsPromotion: boolean;
  moves: string[];
  whiteClockMs: number;
  blackClockMs: number;
  drawOfferBy: '' | PlayerColor;
  winner: '' | PlayerColor | 'draw';
  endReason: '' | GameEndReason | 'aborted';
  endHeadline: string;
  endDetail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

export function sanitizeRoomCode(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32).toUpperCase();
}

export function sanitizeNickname(raw: string, fallback = 'Player'): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 32);
  return cleaned.length >= 1 ? cleaned : fallback.slice(0, 32) || 'Player';
}

export function buildChallengeInviteUrl(gameId: string): string {
  if (typeof window === 'undefined') return `?room=${gameId}`;
  const url = new URL(window.location.href);
  url.search = `?room=${encodeURIComponent(gameId)}`;
  return url.toString();
}

export function encodeMoveRecordToken(m: MoveRecord): string {
  const flags = [
    m.isCheck ? '1' : '0',
    m.isCheckmate ? '1' : '0',
    m.isCapture ? '1' : '0',
    m.isCastle ? '1' : '0',
    m.isPromotion ? '1' : '0',
  ].join('');
  return `${m.ply}|${m.san}|${m.lan}|${m.from}|${m.to}|${m.fen}|${m.color}|${flags}`;
}

export function decodeMoveRecordToken(token: string): MoveRecord {
  const parts = token.split('|');
  const flags = parts[7] || '00000';
  return {
    ply: Number(parts[0]) || 1,
    san: parts[1] || '',
    lan: parts[2] || '',
    from: parts[3] || '',
    to: parts[4] || '',
    fen: parts[5] || '',
    color: (parts[6] === 'b' ? 'b' : 'w') as PlayerColor,
    isCheck: flags[0] === '1',
    isCheckmate: flags[1] === '1',
    isCapture: flags[2] === '1',
    isCastle: flags[3] === '1',
    isPromotion: flags[4] === '1',
  };
}

function toTimestampMs(val: unknown): number {
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

function docToOnlineGame(data: Record<string, unknown>): OnlineChessGame {
  return {
    id: String(data.id ?? ''),
    status: (data.status as OnlineGameStatus) ?? 'open',
    visibility: (data.visibility as OnlineVisibility) ?? 'link',
    hostUid: String(data.hostUid ?? ''),
    hostName: String(data.hostName ?? 'Host'),
    guestUid: String(data.guestUid ?? ''),
    guestName: String(data.guestName ?? ''),
    hostColor: data.hostColor === 'b' ? 'b' : 'w',
    whiteUid: String(data.whiteUid ?? ''),
    blackUid: String(data.blackUid ?? ''),
    variant: (data.variant as GameVariant) ?? 'standard',
    crazyhouseSetup: (data.crazyhouseSetup as CrazyhouseSetupMode) ?? 'classic',
    timeControlId: (data.timeControlId as TimeControlId) ?? 'blitz-5',
    baseMs: Number(data.baseMs ?? 300000),
    incrementMs: Number(data.incrementMs ?? 0),
    perMove: Boolean(data.perMove),
    startFen: String(data.startFen ?? ''),
    fen: String(data.fen ?? ''),
    turn: data.turn === 'b' ? 'b' : 'w',
    ply: Number(data.ply ?? 0),
    lastMoveSan: String(data.lastMoveSan ?? ''),
    lastMoveLan: String(data.lastMoveLan ?? ''),
    lastMoveFrom: String(data.lastMoveFrom ?? ''),
    lastMoveTo: String(data.lastMoveTo ?? ''),
    lastMoveColor: (data.lastMoveColor === 'w' || data.lastMoveColor === 'b'
      ? data.lastMoveColor
      : '') as '' | PlayerColor,
    lastMoveIsCheck: Boolean(data.lastMoveIsCheck),
    lastMoveIsCheckmate: Boolean(data.lastMoveIsCheckmate),
    lastMoveIsCapture: Boolean(data.lastMoveIsCapture),
    lastMoveIsCastle: Boolean(data.lastMoveIsCastle),
    lastMoveIsPromotion: Boolean(data.lastMoveIsPromotion),
    moves: Array.isArray(data.moves) ? data.moves.map(String) : [],
    whiteClockMs: Number(data.whiteClockMs ?? 300000),
    blackClockMs: Number(data.blackClockMs ?? 300000),
    drawOfferBy: (data.drawOfferBy === 'w' || data.drawOfferBy === 'b'
      ? data.drawOfferBy
      : '') as '' | PlayerColor,
    winner: (data.winner as OnlineChessGame['winner']) ?? '',
    endReason: (data.endReason as OnlineChessGame['endReason']) ?? '',
    endHeadline: String(data.endHeadline ?? ''),
    endDetail: String(data.endDetail ?? ''),
    createdAtMs: toTimestampMs(data.createdAt),
    updatedAtMs: toTimestampMs(data.updatedAt),
  };
}

const LOCAL_NICK_KEY = 'squareeight_online_nickname';

export async function saveUserNickname(user: User, nickname: string): Promise<string> {
  const safeName = sanitizeNickname(nickname, user.displayName || `Guest_${user.uid.slice(0, 4)}`).slice(0, 32);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_NICK_KEY, safeName);
    } catch {
      // ignore
    }
  }
  const path = `users/${user.uid}`;
  try {
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      nickname: safeName,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // If Firestore users write fails, local nickname still saved
    console.warn('Could not persist nickname to Firestore:', err);
  }
  return safeName;
}

export async function loadUserNickname(user: User): Promise<string> {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LOCAL_NICK_KEY);
      if (stored && stored.trim().length > 0) {
        return stored.trim().slice(0, 32);
      }
    } catch {
      // ignore
    }
  }
  const path = `users/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const nick = snap.data()?.nickname;
      if (typeof nick === 'string' && nick.trim().length > 0) {
        return nick.trim().slice(0, 32);
      }
    }
  } catch (err) {
    // Ignore network or permission error on getDoc
  }
  return sanitizeNickname(
    user.displayName || (user.isAnonymous ? `Guest_${user.uid.slice(0, 4)}` : 'Player'),
    'Player'
  ).slice(0, 32);
}

export async function createOnlineChallenge(params: {
  user: User;
  nickname: string;
  visibility: OnlineVisibility;
  sideChoice: SideChoice;
  variant: GameVariant;
  crazyhouseSetup: CrazyhouseSetupMode;
  timeControlId: TimeControlId;
  customId?: string;
}): Promise<OnlineChessGame> {
  const gameId = params.customId
    ? params.customId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)
    : generateRoomCode(6);
  const hostColor: PlayerColor =
    params.sideChoice === 'random'
      ? Math.random() < 0.5
        ? 'w'
        : 'b'
      : params.sideChoice;

  const tc =
    TIME_CONTROLS.find((t) => t.id === params.timeControlId) ?? TIME_CONTROLS[4];
  const baseMs = Math.min(3600000, Math.max(0, tc.baseSeconds * 1000));
  const incrementMs = Math.min(120000, Math.max(0, tc.incrementSeconds * 1000));
  const { fen: startFen } = generateVariantStartFen(
    params.variant,
    hostColor,
    params.crazyhouseSetup
  );
  const hostName = sanitizeNickname(params.nickname, params.user.displayName || 'Host').slice(0, 40);

  const payload = {
    id: gameId,
    status: 'open' as const,
    visibility: params.visibility,
    hostUid: params.user.uid,
    hostName,
    guestUid: '',
    guestName: '',
    hostColor,
    whiteUid: hostColor === 'w' ? params.user.uid : '',
    blackUid: hostColor === 'b' ? params.user.uid : '',
    variant: params.variant.slice(0, 32),
    crazyhouseSetup: params.crazyhouseSetup,
    timeControlId: tc.id.slice(0, 24),
    baseMs,
    incrementMs,
    perMove: Boolean(tc.perMove),
    startFen: startFen.slice(0, 120),
    fen: startFen.slice(0, 120),
    turn: 'w' as const,
    ply: 0,
    lastMoveSan: '',
    lastMoveLan: '',
    lastMoveFrom: '',
    lastMoveTo: '',
    lastMoveColor: '',
    lastMoveIsCheck: false,
    lastMoveIsCheckmate: false,
    lastMoveIsCapture: false,
    lastMoveIsCastle: false,
    lastMoveIsPromotion: false,
    moves: [] as string[],
    whiteClockMs: baseMs,
    blackClockMs: baseMs,
    drawOfferBy: '',
    winner: '',
    endReason: '',
    endHeadline: '',
    endDetail: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const path = `chessGames/${gameId}`;
  try {
    await setDoc(doc(db, 'chessGames', gameId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }

  return docToOnlineGame({
    ...payload,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function fetchOnlineGameById(rawCode: string): Promise<OnlineChessGame | null> {
  const gameId = rawCode.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  if (gameId.length < 4) return null;
  const path = `chessGames/${gameId}`;
  try {
    const snap = await getDoc(doc(db, 'chessGames', gameId));
    if (!snap.exists()) return null;
    return docToOnlineGame(snap.data() as Record<string, unknown>);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function joinOnlineChallenge(
  gameId: string,
  user: User,
  nickname: string
): Promise<OnlineChessGame> {
  const path = `chessGames/${gameId}`;
  let existingGame: OnlineChessGame | null = null;
  try {
    const snap = await getDoc(doc(db, 'chessGames', gameId));
    if (!snap.exists()) {
      throw new Error('Challenge room not found or expired.');
    }
    existingGame = docToOnlineGame(snap.data() as Record<string, unknown>);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Challenge room not found')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, path);
  }

  if (existingGame.hostUid === user.uid || existingGame.guestUid === user.uid) {
    return existingGame;
  }

  if (existingGame.status !== 'open' || existingGame.guestUid !== '') {
    throw new Error('This challenge has already been accepted by another player.');
  }

  const guestName = sanitizeNickname(nickname, user.displayName || 'Challenger').slice(0, 40);
  const whiteUid =
    existingGame.hostColor === 'w' ? existingGame.hostUid : user.uid;
  const blackUid =
    existingGame.hostColor === 'b' ? existingGame.hostUid : user.uid;

  try {
    await updateDoc(doc(db, 'chessGames', gameId), {
      guestUid: user.uid,
      guestName,
      whiteUid,
      blackUid,
      status: 'active',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }

  return {
    ...existingGame,
    guestUid: user.uid,
    guestName,
    whiteUid,
    blackUid,
    status: 'active',
  };
}

export async function cancelOnlineChallenge(gameId: string): Promise<void> {
  const path = `chessGames/${gameId}`;
  try {
    await deleteDoc(doc(db, 'chessGames', gameId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function submitOnlineMove(params: {
  game: OnlineChessGame;
  move: MoveRecord;
  nextFen: string;
  nextTurn: PlayerColor;
  whiteClockMs: number;
  blackClockMs: number;
  result: GameResult | null;
}): Promise<void> {
  const { game, move, nextFen, nextTurn, whiteClockMs, blackClockMs, result } = params;
  const nextMoves = [...game.moves, encodeMoveRecordToken(move)].slice(0, 400);
  const nextStatus: OnlineGameStatus = result ? 'finished' : 'active';
  const path = `chessGames/${game.id}`;

  try {
    await updateDoc(doc(db, 'chessGames', game.id), {
      fen: nextFen.slice(0, 120),
      turn: nextTurn,
      ply: game.ply + 1,
      moves: nextMoves,
      lastMoveSan: move.san.slice(0, 20),
      lastMoveLan: move.lan.slice(0, 20),
      lastMoveFrom: move.from.slice(0, 4),
      lastMoveTo: move.to.slice(0, 4),
      lastMoveColor: move.color,
      lastMoveIsCheck: move.isCheck,
      lastMoveIsCheckmate: move.isCheckmate,
      lastMoveIsCapture: move.isCapture,
      lastMoveIsCastle: move.isCastle,
      lastMoveIsPromotion: Boolean(move.isPromotion),
      whiteClockMs: Math.min(3600000, Math.max(0, Math.round(whiteClockMs))),
      blackClockMs: Math.min(3600000, Math.max(0, Math.round(blackClockMs))),
      drawOfferBy: '',
      status: nextStatus,
      winner: result ? result.winner : '',
      endReason: result ? result.reason : '',
      endHeadline: result ? result.headline.slice(0, 100) : '',
      endDetail: result ? result.detail.slice(0, 180) : '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function sendOnlineDrawOffer(
  gameId: string,
  color: '' | PlayerColor
): Promise<void> {
  const path = `chessGames/${gameId}`;
  try {
    await updateDoc(doc(db, 'chessGames', gameId), {
      drawOfferBy: color,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function finishOnlineGame(params: {
  gameId: string;
  winner: PlayerColor | 'draw';
  reason: 'resignation' | 'agreement' | 'timeout';
  headline: string;
  detail: string;
  whiteClockMs: number;
  blackClockMs: number;
}): Promise<void> {
  const path = `chessGames/${params.gameId}`;
  try {
    await updateDoc(doc(db, 'chessGames', params.gameId), {
      status: 'finished',
      winner: params.winner,
      endReason: params.reason,
      endHeadline: params.headline.slice(0, 100),
      endDetail: params.detail.slice(0, 180),
      drawOfferBy: '',
      whiteClockMs: Math.min(3600000, Math.max(0, Math.round(params.whiteClockMs))),
      blackClockMs: Math.min(3600000, Math.max(0, Math.round(params.blackClockMs))),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function getDeterministicRematchId(gameId: string): string {
  const cleaned = gameId.replace(/[^a-zA-Z0-9_-]/g, '');
  const base = cleaned.startsWith('rm_') ? cleaned.slice(3) : cleaned;
  return `rm_${base}`.slice(0, 32);
}

export async function requestOrJoinRematch(
  previousGame: OnlineChessGame,
  user: User,
  nickname: string
): Promise<OnlineChessGame> {
  const rematchId = getDeterministicRematchId(previousGame.id);
  const existing = await fetchOnlineGameById(rematchId);
  if (existing) {
    if (existing.status === 'open' && existing.hostUid !== user.uid) {
      return joinOnlineChallenge(rematchId, user, nickname);
    }
    return existing;
  }

  const prevColor: PlayerColor = previousGame.whiteUid === user.uid ? 'w' : 'b';
  const nextSide: PlayerColor = prevColor === 'w' ? 'b' : 'w';
  return createOnlineChallenge({
    user,
    nickname,
    visibility: 'link',
    sideChoice: nextSide,
    variant: previousGame.variant,
    crazyhouseSetup: previousGame.crazyhouseSetup,
    timeControlId: previousGame.timeControlId,
    customId: rematchId,
  });
}

export function subscribeToOnlineGame(
  gameId: string,
  onData: (game: OnlineChessGame | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `chessGames/${gameId}`;
  return onSnapshot(
    doc(db, 'chessGames', gameId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(docToOnlineGame(snap.data() as Record<string, unknown>));
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeToOpenLobby(
  onData: (games: OnlineChessGame[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'chessGames'),
    where('visibility', '==', 'public'),
    where('status', '==', 'open'),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => docToOnlineGame(d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, 'chessGames');
    }
  );
}

export function subscribeToMyOnlineGames(
  uid: string,
  onData: (games: OnlineChessGame[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let hosted: OnlineChessGame[] = [];
  let joined: OnlineChessGame[] = [];

  const emit = () => {
    const map = new Map<string, OnlineChessGame>();
    for (const g of [...hosted, ...joined]) {
      map.set(g.id, g);
    }
    const merged = Array.from(map.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    onData(merged);
  };

  const unsubHost = onSnapshot(
    query(collection(db, 'chessGames'), where('hostUid', '==', uid), limit(12)),
    (snap) => {
      hosted = snap.docs.map((d) => docToOnlineGame(d.data() as Record<string, unknown>));
      emit();
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, 'chessGames');
    }
  );

  const unsubGuest = onSnapshot(
    query(collection(db, 'chessGames'), where('guestUid', '==', uid), limit(12)),
    (snap) => {
      joined = snap.docs.map((d) => docToOnlineGame(d.data() as Record<string, unknown>));
      emit();
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, 'chessGames');
    }
  );

  return () => {
    unsubHost();
    unsubGuest();
  };
}
