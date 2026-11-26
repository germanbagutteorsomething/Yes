import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Copy,
  Globe,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Swords,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  GAME_VARIANTS,
  TIME_CONTROLS,
  type CrazyhouseSetupMode,
  type GameVariant,
  type SideChoice,
  type TimeControlId,
} from '../types/chess';
import {
  buildChallengeInviteUrl,
  sanitizeRoomCode,
  type OnlineChessGame,
  type OnlineVisibility,
} from '../engine/onlineChessService';

interface OnlineChessPanelProps {
  authReady: boolean;
  user: User | null;
  nickname: string;
  onSaveNickname: (name: string) => Promise<void>;
  onSignIn: () => Promise<void>;
  onSignInGuest: () => Promise<void>;
  onSignOut: () => Promise<void>;
  activeGame: OnlineChessGame | null;
  pendingInviteGame: OnlineChessGame | null;
  openLobbyGames: OnlineChessGame[];
  myOnlineGames: OnlineChessGame[];
  variant: GameVariant;
  crazyhouseSetup: CrazyhouseSetupMode;
  timeControlId: TimeControlId;
  sideChoice: SideChoice;
  isBusy: boolean;
  errorMsg: string | null;
  onClearError: () => void;
  onCreateChallenge: (visibility: OnlineVisibility) => Promise<void>;
  onJoinByCode: (code: string) => Promise<void>;
  onAcceptChallenge: (gameId: string) => Promise<void>;
  onCancelChallenge: (gameId: string) => Promise<void>;
  onOpenExistingGame: (game: OnlineChessGame) => void;
  onLeaveActiveRoom: () => void;
  onRequestRematch: () => Promise<void>;
  rematchRoom: OnlineChessGame | null;
  onAcceptDrawOffer: () => void;
  onDeclineDrawOffer: () => void;
}

export const OnlineChessPanel: React.FC<OnlineChessPanelProps> = ({
  authReady,
  user,
  nickname,
  onSaveNickname,
  onSignIn,
  onSignInGuest,
  onSignOut,
  activeGame,
  pendingInviteGame,
  openLobbyGames,
  myOnlineGames,
  variant,
  crazyhouseSetup,
  timeControlId,
  sideChoice,
  isBusy,
  errorMsg,
  onClearError,
  onCreateChallenge,
  onJoinByCode,
  onAcceptChallenge,
  onCancelChallenge,
  onOpenExistingGame,
  onLeaveActiveRoom,
  onRequestRematch,
  rematchRoom,
  onAcceptDrawOffer,
  onDeclineDrawOffer,
}) => {
  const [visibility, setVisibility] = useState<OnlineVisibility>('link');
  const [joinCode, setJoinCode] = useState<string>('');
  const [nickInput, setNickInput] = useState<string>(nickname);
  const [nickSaved, setNickSaved] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const variantLabel =
    GAME_VARIANTS.find((v) => v.id === variant)?.shortLabel ?? variant;
  const tcLabel =
    TIME_CONTROLS.find((t) => t.id === timeControlId)?.shortLabel ?? timeControlId;

  const handleCopyInvite = async (gameId: string) => {
    const url = buildChallengeInviteUrl(gameId);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(gameId);
      window.setTimeout(() => setCopiedId((prev) => (prev === gameId ? null : prev)), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const myColor =
    activeGame && user
      ? activeGame.whiteUid === user.uid
        ? 'w'
        : activeGame.blackUid === user.uid
          ? 'b'
          : null
      : null;

  const incomingDrawOffer =
    activeGame &&
    activeGame.status === 'active' &&
    myColor &&
    activeGame.drawOfferBy !== '' &&
    activeGame.drawOfferBy !== myColor;

  if (!authReady) {
    return (
      <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-700 dark:text-emerald-400" />
        <span>Connecting to Online Arena…</span>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="rounded-xl border border-emerald-700/30 dark:border-emerald-500/35 bg-white dark:bg-stone-900 p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <Globe className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100">
              Online Chess Multiplayer
            </h3>
            <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
              {pendingInviteGame
                ? `You were invited to match ${pendingInviteGame.id}. Jump in directly as guest or sign in.`
                : 'Play online friend challenges and open lobby matches directly without logging in.'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-3 py-2 text-[11px] text-red-800 dark:text-red-200 leading-relaxed">
            {errorMsg}
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onSignInGuest()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            <span>Play as Guest (No Login Required)</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onSignIn()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 py-2 px-3 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign in with Google (Optional)</span>
          </button>
        </div>
      </section>
    );
  }

  // Invited via ?room=CODE and not currently inside that room yet
  if (pendingInviteGame && (!activeGame || activeGame.id !== pendingInviteGame.id)) {
    const inviteVariant =
      GAME_VARIANTS.find((v) => v.id === pendingInviteGame.variant)?.label ??
      pendingInviteGame.variant;
    const inviteTc =
      TIME_CONTROLS.find((t) => t.id === pendingInviteGame.timeControlId)?.label ??
      pendingInviteGame.timeControlId;
    const isOwnRoom = pendingInviteGame.hostUid === user.uid;

    return (
      <section className="rounded-xl border border-emerald-700/40 dark:border-emerald-500/40 bg-white dark:bg-stone-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
            <Swords className="w-4 h-4" />
            <span>Challenge Invite · {pendingInviteGame.id}</span>
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/50 p-3 text-xs space-y-1">
          <div className="font-semibold text-stone-900 dark:text-stone-100">
            {pendingInviteGame.hostName} challenges you!
          </div>
          <div className="text-[11px] text-stone-600 dark:text-stone-300 font-mono">
            {inviteVariant} · {inviteTc} · You play{' '}
            {pendingInviteGame.hostColor === 'w' ? 'Black' : 'White'}
          </div>
        </div>
        {errorMsg && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-3 py-2 text-[11px] text-red-800 dark:text-red-200">
            {errorMsg}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              isOwnRoom
                ? onOpenExistingGame(pendingInviteGame)
                : void onAcceptChallenge(pendingInviteGame.id)
            }
            className="rounded-lg bg-emerald-700 py-2 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {isOwnRoom ? 'Open Room' : 'Accept Challenge'}
          </button>
          <button
            type="button"
            onClick={onLeaveActiveRoom}
            className="rounded-lg border border-stone-200 dark:border-stone-700 py-2 px-3 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3.5 space-y-3">
      {/* Player identity strip */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-200/80 dark:border-stone-800/80">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <input
            type="text"
            value={nickInput}
            maxLength={32}
            onChange={(e) => {
              setNickInput(e.target.value);
              setNickSaved(false);
            }}
            aria-label="Online display name"
            className="w-full min-w-0 rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-2 py-1 text-xs font-medium text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          {nickInput.trim() !== nickname && nickInput.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                void onSaveNickname(nickInput).then(() => setNickSaved(true));
              }}
              className="rounded-md bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 shrink-0"
            >
              Save
            </button>
          )}
          {nickSaved && (
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Saved" />
          )}
        </div>
        {user.isAnonymous ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="rounded-md bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
              Guest
            </span>
            <button
              type="button"
              onClick={() => void onSignIn()}
              title="Sign in with Google (optional)"
              className="rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
            >
              Sign In
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void onSignOut()}
            title="Sign out of Google"
            aria-label="Sign out"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 dark:border-stone-700 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-2.5 py-2 text-[11px] text-red-800 dark:text-red-200">
          <span>{errorMsg}</span>
          <button type="button" onClick={onClearError} aria-label="Dismiss error">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active / Waiting Room */}
      {activeGame ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span className="font-mono text-xs font-bold text-stone-900 dark:text-stone-100">
                Room {activeGame.id}
              </span>
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                · {activeGame.status === 'open' ? 'Waiting' : activeGame.status === 'active' ? 'Live' : 'Finished'}
              </span>
            </div>
            <button
              type="button"
              onClick={onLeaveActiveRoom}
              className="text-[11px] font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 underline"
            >
              Lobby
            </button>
          </div>

          {activeGame.status === 'open' && (
            <div className="rounded-lg border border-emerald-700/30 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/25 p-3 space-y-2.5">
              <div className="text-[11px] text-stone-700 dark:text-stone-200">
                Share this link or code with a friend to start:
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider text-stone-900 dark:text-stone-100 text-center">
                  {activeGame.id}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyInvite(activeGame.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
                >
                  {copiedId === activeGame.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onCancelChallenge(activeGame.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-200 dark:border-stone-700 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="w-3 h-3" />
                <span>Cancel Challenge</span>
              </button>
            </div>
          )}

          {incomingDrawOffer && (
            <div className="rounded-lg border border-amber-400/60 bg-amber-50/80 dark:bg-amber-950/40 p-2.5 space-y-2">
              <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                Opponent offered a Draw
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onAcceptDrawOffer}
                  className="rounded-md bg-emerald-700 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Accept Draw
                </button>
                <button
                  type="button"
                  onClick={onDeclineDrawOffer}
                  className="rounded-md border border-stone-300 dark:border-stone-700 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {activeGame.status === 'finished' && (
            <div className="space-y-1.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onRequestRematch()}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 py-2 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {rematchRoom && rematchRoom.hostUid !== user.uid && rematchRoom.status === 'open'
                    ? 'Accept Opponent Rematch'
                    : rematchRoom && rematchRoom.hostUid === user.uid
                      ? `Waiting in Rematch (${rematchRoom.id})…`
                      : 'Challenge Rematch (Swap Sides)'}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Challenge Creator & Lobby */
        <div className="space-y-3">
          {/* Visibility + Create */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
              <span>Challenge Setup</span>
              <span className="font-mono font-semibold text-stone-700 dark:text-stone-200">
                {variantLabel}
                {variant === 'crazyhouse' && crazyhouseSetup !== 'classic'
                  ? ` (${crazyhouseSetup})`
                  : ''}{' '}
                · {tcLabel} · {sideChoice === 'random' ? 'Random' : sideChoice === 'w' ? 'White' : 'Black'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 p-1">
              <button
                type="button"
                onClick={() => setVisibility('link')}
                className={`inline-flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                  visibility === 'link'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                <Link2 className="w-3 h-3" />
                <span>Friend Link</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`inline-flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                  visibility === 'public'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Open Lobby</span>
              </button>
            </div>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => void onCreateChallenge(visibility)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 py-2 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              {isBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Swords className="w-3.5 h-3.5" />
              )}
              <span>
                {visibility === 'link' ? 'Create Invite Link & Code' : 'Post Open Challenge'}
              </span>
            </button>
          </div>

          {/* Join by Code */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = sanitizeRoomCode(joinCode);
              if (clean.length >= 4) {
                void onJoinByCode(clean);
              }
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter room code (e.g. K7M2P9)"
              maxLength={32}
              aria-label="Room code"
              className="flex-1 min-w-0 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-2.5 py-1.5 font-mono text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
            <button
              type="submit"
              disabled={isBusy || sanitizeRoomCode(joinCode).length < 4}
              className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-800 dark:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 transition-colors shrink-0"
            >
              Join
            </button>
          </form>

          {/* Open Lobby List */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
              Open Challenges ({openLobbyGames.length})
            </div>
            {openLobbyGames.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-200 dark:border-stone-800 px-3 py-2 text-center text-[11px] text-stone-400 dark:text-stone-500">
                No public challenges yet — post one above or invite a friend!
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1">
                {openLobbyGames.map((g) => {
                  const isMine = g.hostUid === user.uid;
                  const gVar = GAME_VARIANTS.find((v) => v.id === g.variant)?.shortLabel ?? g.variant;
                  const gTc = TIME_CONTROLS.find((t) => t.id === g.timeControlId)?.shortLabel ?? g.timeControlId;
                  return (
                    <div
                      key={g.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/50 px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                          {g.hostName}
                        </div>
                        <div className="font-mono text-[10px] text-stone-500 dark:text-stone-400 truncate">
                          {gVar} · {gTc} · {isMine ? 'Your Room' : `You play ${g.hostColor === 'w' ? 'Black' : 'White'}`}
                        </div>
                      </div>
                      {isMine ? (
                        <button
                          type="button"
                          onClick={() => onOpenExistingGame(g)}
                          className="rounded-md border border-stone-300 dark:border-stone-700 px-2.5 py-1 text-[11px] font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 shrink-0"
                        >
                          Open
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void onAcceptChallenge(g.id)}
                          className="rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 shrink-0"
                        >
                          Play
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active / Resume My Matches */}
          {myOnlineGames.filter((g) => g.status === 'active' || g.status === 'open').length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-stone-200/80 dark:border-stone-800/80">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                Your Active Rooms
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1">
                {myOnlineGames
                  .filter((g) => g.status === 'active' || g.status === 'open')
                  .slice(0, 4)
                  .map((g) => {
                    const oppName = g.hostUid === user.uid ? g.guestName || 'Waiting…' : g.hostName;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => onOpenExistingGame(g)}
                        className="w-full flex items-center justify-between gap-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 px-2.5 py-1.5 text-left text-xs hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-mono font-bold text-stone-800 dark:text-stone-100 mr-1.5">
                            {g.id}
                          </span>
                          <span className="text-[11px] text-stone-600 dark:text-stone-400">
                            vs {oppName}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                          {g.status === 'active' ? 'Resume' : 'Waiting'}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
