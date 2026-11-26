# Security Specification — SquareEight Online Chess

## Phase 1: Data Invariants
1. **Identity & Verification**: Every read/write requires `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Profile Isolation**: `/users/{userId}` stores only `{ uid, nickname, updatedAt }` (zero PII) and is readable/writable strictly by `request.auth.uid == userId`. No `list` queries are allowed on `/users`.
3. **Challenge Creation**: A `ChessGame` created at `/chessGames/{gameId}` must set `id == gameId`, `hostUid == request.auth.uid`, `guestUid == ''`, `status == 'open'`, `ply == 0`, `moves.size() == 0`, `createdAt == request.time`, and `updatedAt == request.time`.
4. **Join Transition**: Only a signed-in user different from `hostUid` can join an `'open'` room, atomically setting `guestUid == request.auth.uid`, filling the open `whiteUid` or `blackUid`, and advancing `status` to `'active'`.
5. **Turn-Enforced Moves**: Only the UID matching `existing().turn` (`whiteUid` or `blackUid`) can submit a move while `status == 'active'`, incrementing `ply` by exactly `1`.
6. **Terminal State Locking**: Once `status` becomes `'finished'` or `'aborted'`, no further updates are permitted.
7. **Secure List Queries**: `allow list` on `/chessGames` explicitly checks `resource.data` (`visibility == 'public' && status == 'open'`, or participant UID).

## Phase 2: "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated create**: `auth = null` attempting `create /chessGames/ROOM01` -> `PERMISSION_DENIED`.
2. **Unverified email write**: `email_verified = false` creating `/chessGames/ROOM02` -> `PERMISSION_DENIED`.
3. **Identity spoofing on create**: `auth.uid = 'userA'` writing `hostUid: 'userB'` -> `PERMISSION_DENIED`.
4. **Shadow/ghost field injection**: Including extra field `isAdmin: true` on `/chessGames/ROOM03` -> `PERMISSION_DENIED`.
5. **Client timestamp forgery**: Setting `createdAt` to an arbitrary past client timestamp instead of `request.time` -> `PERMISSION_DENIED`.
6. **ID poisoning**: Document ID longer than 32 chars or containing invalid symbols (`../bad$id`) -> `PERMISSION_DENIED`.
7. **Host self-join**: `hostUid == request.auth.uid` attempting `Join` action -> `PERMISSION_DENIED`.
8. **Out-of-turn move**: Black player submitting a move when `existing().turn == 'w'` -> `PERMISSION_DENIED`.
9. **Double-move / ply jump**: Setting `ply: existing().ply + 2` -> `PERMISSION_DENIED`.
10. **Post-finish tampering**: Attempting to alter `winner` or `fen` when `existing().status == 'finished'` -> `PERMISSION_DENIED`.
11. **Non-participant draw/resign**: Third-party `userC` attempting `Finish` or `DrawOffer` on someone else's match -> `PERMISSION_DENIED`.
12. **Blanket private link scraping**: `list /chessGames` without matching `public+open` or participant UID -> `PERMISSION_DENIED`.
