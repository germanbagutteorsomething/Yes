import type { MoveRecord, OpeningInfo } from '../types/chess';

interface OpeningEntry {
  eco: string;
  name: string;
  line: string; // space-separated UCI/LAN moves
}

const OPENINGS: OpeningEntry[] = [
  // King's Pawn (1. e4)
  { eco: 'B00', name: "King's Pawn Opening", line: 'e2e4' },
  { eco: 'C20', name: "King's Pawn Game", line: 'e2e4 e7e5' },
  { eco: 'C21', name: 'Center Game', line: 'e2e4 e7e5 d2d4' },
  { eco: 'C23', name: "Bishop's Opening", line: 'e2e4 e7e5 f1c4' },
  { eco: 'C25', name: 'Vienna Game', line: 'e2e4 e7e5 b1c3' },
  { eco: 'C30', name: "King's Gambit", line: 'e2e4 e7e5 f2f4' },
  { eco: 'C33', name: "King's Gambit Accepted", line: 'e2e4 e7e5 f2f4 e5f4' },
  { eco: 'C40', name: "King's Knight Opening", line: 'e2e4 e7e5 g1f3' },
  { eco: 'C41', name: 'Philidor Defense', line: 'e2e4 e7e5 g1f3 d7d6' },
  { eco: 'C42', name: 'Petrov Defense', line: 'e2e4 e7e5 g1f3 g8f6' },
  { eco: 'C44', name: 'Scotch Game', line: 'e2e4 e7e5 g1f3 b8c6 d2d4' },
  { eco: 'C45', name: 'Scotch Game: Classical', line: 'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4' },
  { eco: 'C46', name: 'Three Knights Opening', line: 'e2e4 e7e5 g1f3 b8c6 b1c3' },
  { eco: 'C47', name: 'Four Knights Game', line: 'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6' },
  { eco: 'C50', name: 'Italian Game', line: 'e2e4 e7e5 g1f3 b8c6 f1c4' },
  { eco: 'C51', name: 'Evans Gambit', line: 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4' },
  { eco: 'C53', name: 'Italian Game: Giuoco Piano', line: 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3' },
  { eco: 'C55', name: 'Italian Game: Two Knights Defense', line: 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6' },
  { eco: 'C57', name: 'Fried Liver / Knight Attack', line: 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5' },
  { eco: 'C60', name: 'Ruy Lopez', line: 'e2e4 e7e5 g1f3 b8c6 f1b5' },
  { eco: 'C65', name: 'Ruy Lopez: Berlin Defense', line: 'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6' },
  { eco: 'C70', name: 'Ruy Lopez: Morphy Defense', line: 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6' },
  { eco: 'C78', name: 'Ruy Lopez: Closed', line: 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6' },

  // Sicilian Defense (1. e4 c5)
  { eco: 'B20', name: 'Sicilian Defense', line: 'e2e4 c7c5' },
  { eco: 'B21', name: 'Sicilian: Smith-Morra Gambit', line: 'e2e4 c7c5 d2d4 c5d4 c2c3' },
  { eco: 'B22', name: 'Sicilian: Alapin Variation', line: 'e2e4 c7c5 c2c3' },
  { eco: 'B23', name: 'Sicilian: Closed', line: 'e2e4 c7c5 b1c3' },
  { eco: 'B32', name: 'Sicilian: Open', line: 'e2e4 c7c5 g1f3 b8c6 d2d4' },
  { eco: 'B33', name: 'Sicilian: Sveshnikov', line: 'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5' },
  { eco: 'B40', name: 'Sicilian: Pin / Paulsen', line: 'e2e4 c7c5 g1f3 e7e6' },
  { eco: 'B50', name: 'Sicilian Defense: Open', line: 'e2e4 c7c5 g1f3 d7d6 d2d4' },
  { eco: 'B70', name: 'Sicilian: Dragon Variation', line: 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6' },
  { eco: 'B90', name: 'Sicilian: Najdorf Variation', line: 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6' },

  // Other e4 Defenses
  { eco: 'C00', name: 'French Defense', line: 'e2e4 e7e6' },
  { eco: 'C02', name: 'French: Advance Variation', line: 'e2e4 e7e6 d2d4 d7d5 e4e5' },
  { eco: 'C03', name: 'French: Tarrasch Variation', line: 'e2e4 e7e6 d2d4 d7d5 b1d2' },
  { eco: 'C11', name: 'French: Classical', line: 'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6' },
  { eco: 'C15', name: 'French: Winawer Variation', line: 'e2e4 e7e6 d2d4 d7d5 b1c3 f8b4' },
  { eco: 'B10', name: 'Caro-Kann Defense', line: 'e2e4 c7c6' },
  { eco: 'B12', name: 'Caro-Kann: Advance Variation', line: 'e2e4 c7c6 d2d4 d7d5 e4e5' },
  { eco: 'B13', name: 'Caro-Kann: Exchange Variation', line: 'e2e4 c7c6 d2d4 d7d5 e4d5 c6d5' },
  { eco: 'B18', name: 'Caro-Kann: Classical', line: 'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5' },
  { eco: 'B01', name: 'Scandinavian Defense', line: 'e2e4 d7d5' },
  { eco: 'B02', name: "Alekhine's Defense", line: 'e2e4 g8f6' },
  { eco: 'B06', name: 'Modern Defense', line: 'e2e4 g7g6' },
  { eco: 'B07', name: 'Pirc Defense', line: 'e2e4 d7d6 d2d4 g8f6' },

  // Queen's Pawn (1. d4)
  { eco: 'A40', name: "Queen's Pawn Opening", line: 'd2d4' },
  { eco: 'D00', name: "Queen's Pawn Game", line: 'd2d4 d7d5' },
  { eco: 'D02', name: 'London System', line: 'd2d4 d7d5 g1f3 g8f6 c1f4' },
  { eco: 'D02', name: 'London System', line: 'd2d4 d7d5 c1f4' },
  { eco: 'D06', name: "Queen's Gambit", line: 'd2d4 d7d5 c2c4' },
  { eco: 'D10', name: 'Slav Defense', line: 'd2d4 d7d5 c2c4 c7c6' },
  { eco: 'D20', name: "Queen's Gambit Accepted", line: 'd2d4 d7d5 c2c4 d5c4' },
  { eco: 'D30', name: "Queen's Gambit Declined", line: 'd2d4 d7d5 c2c4 e7e6' },
  { eco: 'D37', name: "QGD: Three Knights", line: 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 g1f3' },
  { eco: 'A45', name: 'Indian Defense', line: 'd2d4 g8f6' },
  { eco: 'A48', name: 'London / Torre vs Indian', line: 'd2d4 g8f6 c1f4' },
  { eco: 'A57', name: 'Benko / Benoni System', line: 'd2d4 g8f6 c2c4 c7c5' },
  { eco: 'A80', name: 'Dutch Defense', line: 'd2d4 f7f5' },
  { eco: 'E00', name: 'Catalan Opening', line: 'd2d4 g8f6 c2c4 e7e6 g2g3' },
  { eco: 'E12', name: "Queen's Indian Defense", line: 'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6' },
  { eco: 'E20', name: 'Nimzo-Indian Defense', line: 'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4' },
  { eco: 'E60', name: "King's Indian Defense", line: 'd2d4 g8f6 c2c4 g7g6' },
  { eco: 'D80', name: 'Grünfeld Defense', line: 'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5' },

  // Flank Openings
  { eco: 'A10', name: 'English Opening', line: 'c2c4' },
  { eco: 'A20', name: 'English: Reversed Sicilian', line: 'c2c4 e7e5' },
  { eco: 'A30', name: 'English: Symmetrical', line: 'c2c4 c7c5' },
  { eco: 'A04', name: 'Réti Opening', line: 'g1f3' },
  { eco: 'A06', name: 'Réti Opening', line: 'g1f3 d7d5' },
  { eco: 'A00', name: "Bird's Opening", line: 'f2f4' },
];

export function detectOpening(moves: MoveRecord[]): OpeningInfo | null {
  if (moves.length === 0) return null;
  const maxCheck = Math.min(moves.length, 14);
  const lanSeq = moves.slice(0, maxCheck).map((m) => m.lan).join(' ');

  let bestMatch: OpeningInfo | null = null;

  for (const entry of OPENINGS) {
    if (lanSeq === entry.line || lanSeq.startsWith(`${entry.line} `)) {
      const plies = entry.line.split(' ').length;
      if (!bestMatch || plies > bestMatch.matchedPlies) {
        bestMatch = {
          eco: entry.eco,
          name: entry.name,
          matchedPlies: plies,
        };
      }
    }
  }

  return bestMatch;
}
