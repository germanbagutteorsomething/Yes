/**
 * Security Rules Verification Suite — SquareEight Online Chess
 * Covers the 12 "Dirty Dozen" adversarial payloads defined in security_spec.md.
 */

export const DIRTY_DOZEN_CASES = [
  {
    name: '1. Unauthenticated create',
    auth: null,
    op: 'create',
    path: '/chessGames/ROOM01',
    expectDenied: true,
  },
  {
    name: '2. Unverified email write',
    auth: { uid: 'userA', token: { email_verified: false } },
    op: 'create',
    path: '/chessGames/ROOM02',
    expectDenied: true,
  },
  {
    name: '3. Identity spoofing on create',
    auth: { uid: 'userA', token: { email_verified: true } },
    op: 'create',
    path: '/chessGames/ROOM03',
    payloadOverride: { hostUid: 'userB' },
    expectDenied: true,
  },
  {
    name: '4. Shadow field injection',
    auth: { uid: 'userA', token: { email_verified: true } },
    op: 'create',
    path: '/chessGames/ROOM04',
    payloadOverride: { isAdmin: true },
    expectDenied: true,
  },
  {
    name: '5. Client timestamp forgery',
    auth: { uid: 'userA', token: { email_verified: true } },
    op: 'create',
    path: '/chessGames/ROOM05',
    payloadOverride: { createdAt: '2020-01-01T00:00:00Z' },
    expectDenied: true,
  },
  {
    name: '6. Document ID poisoning',
    auth: { uid: 'userA', token: { email_verified: true } },
    op: 'create',
    path: '/chessGames/invalid$id_exceeding_max_length_32_characters',
    expectDenied: true,
  },
  {
    name: '7. Host self-join attempt',
    auth: { uid: 'userA', token: { email_verified: true } },
    op: 'update',
    path: '/chessGames/OPEN01',
    payloadOverride: { guestUid: 'userA', status: 'active' },
    expectDenied: true,
  },
  {
    name: '8. Out-of-turn move submission',
    auth: { uid: 'userB', token: { email_verified: true } },
    op: 'update',
    path: '/chessGames/ACTIVE01',
    payloadOverride: { ply: 1, turn: 'b' },
    expectDenied: true,
  },
  {
    name: '9. Ply skip / double move',
    auth: { uid: 'userA', token: { email_verified: true } },
    op: 'update',
    path: '/chessGames/ACTIVE01',
    payloadOverride: { ply: 2 },
    expectDenied: true,
  },
  {
    name: '10. Terminal state tampering after finish',
    auth: { uid: 'userA', token: { email_verified: true } },
    op: 'update',
    path: '/chessGames/DONE01',
    payloadOverride: { winner: 'w' },
    expectDenied: true,
  },
  {
    name: '11. Non-participant draw or resign',
    auth: { uid: 'userC', token: { email_verified: true } },
    op: 'update',
    path: '/chessGames/ACTIVE01',
    payloadOverride: { status: 'finished', winner: 'w', endReason: 'resignation' },
    expectDenied: true,
  },
  {
    name: '12. Blanket query scraping private link challenges',
    auth: { uid: 'userC', token: { email_verified: true } },
    op: 'list',
    path: '/chessGames',
    expectDenied: true,
  },
];
