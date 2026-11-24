import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type {
  MatchAnalysisResult,
  MoveAnalysis,
  MoveClassification,
  MoveRecord,
  PositionEval,
  PromotionPiece,
  SideAccuracySummary,
  StockfishLevelConfig,
} from '../types/chess';

export interface EngineBestMove {
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

export interface CandidateMove {
  uci: string;
  cp: number;
  mate: number | null;
}

declare global {
  interface Window {
    __EMBEDDED_STOCKFISH_ASM__?: string;
  }
}

const PIECE_VAL: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

function scoreToCpEquivalent(evalObj: PositionEval): number {
  if (evalObj.mate !== null) {
    const sign = evalObj.mate > 0 ? 1 : -1;
    return sign * (10000 - Math.min(Math.abs(evalObj.mate), 99) * 10);
  }
  return evalObj.cp;
}

function secondBestToCpEquivalent(evalObj: PositionEval): number | null {
  if (evalObj.secondBestMate !== undefined && evalObj.secondBestMate !== null) {
    const sign = evalObj.secondBestMate > 0 ? 1 : -1;
    return sign * (10000 - Math.min(Math.abs(evalObj.secondBestMate), 99) * 10);
  }
  if (evalObj.secondBestCp !== undefined && evalObj.secondBestCp !== null) {
    return evalObj.secondBestCp;
  }
  return null;
}

function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return '';
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promo = uci.slice(4, 5) as PromotionPiece | '';
    const move = chess.move({
      from,
      to,
      promotion:
        promo === 'q' || promo === 'r' || promo === 'b' || promo === 'n' ? promo : undefined,
    });
    return move.san;
  } catch {
    return uci;
  }
}

/**
 * Checks if playing `playedLan` from `fenBefore` offers a genuine tactical sacrifice
 * (either the moved piece can be captured for net material loss on its destination square,
 * or a valuable friendly piece is intentionally left hanging for tactical compensation).
 */
function isTacticalSacrifice(fenBefore: string, playedLan: string): boolean {
  try {
    const before = new Chess(fenBefore);
    const moverColor = before.turn();
    const from = playedLan.slice(0, 2) as Square;
    const to = playedLan.slice(2, 4) as Square;
    const promo = playedLan.slice(4, 5) as PromotionPiece | '';

    const after = new Chess(fenBefore);
    const moveObj = after.move({
      from,
      to,
      promotion:
        promo === 'q' || promo === 'r' || promo === 'b' || promo === 'n' ? promo : undefined,
    });

    // Direct checkmate isn't a sacrifice puzzle unless it already occurred; usually just mate
    if (after.isCheckmate()) return false;

    const capturedVal = moveObj.captured ? PIECE_VAL[moveObj.captured] : 0;
    const movedVal = PIECE_VAL[moveObj.piece];
    const oppReplies = after.moves({ verbose: true });

    // Check 1: Did the moved piece land on a square where the opponent can capture it for a gain?
    const capturesOnDest = oppReplies.filter((r) => r.to === moveObj.to);
    if (capturesOnDest.length > 0 && movedVal >= 3) {
      // Find whether `moveObj.to` is defended by mover after opponent's cheapest capture
      let minOppRecaptureLoss = Infinity;
      for (const cap of capturesOnDest) {
        const sim = new Chess(after.fen());
        sim.move(cap);
        const moverRecaptures = sim
          .moves({ verbose: true })
          .filter((r) => r.to === moveObj.to);

        // Net material gained by mover if opponent captures on destination:
        // capturedVal - movedVal + (cheapest defender recapture if defended)
        const cheapestOppPiece = PIECE_VAL[cap.piece];
        const canDefend = moverRecaptures.length > 0;
        const netMoverDelta = canDefend
          ? capturedVal - movedVal + cheapestOppPiece
          : capturedVal - movedVal;

        if (netMoverDelta < minOppRecaptureLoss) {
          minOppRecaptureLoss = netMoverDelta;
        }
      }

      if (minOppRecaptureLoss <= -2) {
        return true;
      }
    }

    // Check 2: Did the mover leave another valuable non-pawn piece (>= 3) newly hanging?
    if (moveObj.piece !== 'k') {
      // Check what opponent's best capture was BEFORE this move
      let maxHangingBefore = 0;
      const beforeOppView = fenBefore.split(' ');
      if (beforeOppView.length >= 2) {
        beforeOppView[1] = moverColor === 'w' ? 'b' : 'w';
        beforeOppView[3] = '-';
        try {
          const oppBefore = new Chess(beforeOppView.join(' '));
          for (const r of oppBefore.moves({ verbose: true })) {
            if (r.captured && PIECE_VAL[r.captured] >= 3) {
              maxHangingBefore = Math.max(maxHangingBefore, PIECE_VAL[r.captured]);
            }
          }
        } catch {
          // Ignore invalid flipped turn FEN when king is in check
        }
      }

      for (const r of oppReplies) {
        if (r.to === moveObj.to || !r.captured) continue;
        const targetVal = PIECE_VAL[r.captured];
        if (targetVal < 3 || targetVal <= maxHangingBefore) continue;

        const sim = new Chess(after.fen());
        sim.move(r);
        const defended = sim.moves({ verbose: true }).some((rec) => rec.to === r.to);
        const netLoss = defended ? targetVal - PIECE_VAL[r.piece] : targetVal;
        if (netLoss - capturedVal >= 2) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

function classifyMove(
  fenBefore: string,
  playedLan: string,
  bestLan: string,
  cpLoss: number,
  evalBefore: PositionEval,
  evalAfter: PositionEval,
  moverColor: 'w' | 'b',
  isOpeningBookMove = false
): MoveClassification {
  if (isOpeningBookMove && cpLoss <= 32) {
    return 'book';
  }

  const moverSign = moverColor === 'w' ? 1 : -1;
  const beforeMover = scoreToCpEquivalent(evalBefore) * moverSign;
  const afterMover = scoreToCpEquivalent(evalAfter) * moverSign;

  const secondBestRaw = secondBestToCpEquivalent(evalBefore);
  const secondBestMover = secondBestRaw !== null ? secondBestRaw * moverSign : null;
  const secondBestGap =
    secondBestMover !== null ? Math.max(0, beforeMover - secondBestMover) : 0;

  const isTopChoice = playedLan === bestLan || cpLoss <= 12;

  // Brilliant (!!): Top move offering a genuine sacrifice in a non-trivial position
  if (
    isTopChoice &&
    beforeMover < 600 &&
    afterMover >= -25 &&
    isTacticalSacrifice(fenBefore, playedLan) &&
    (secondBestGap >= 40 || afterMover >= beforeMover - 5)
  ) {
    return 'brilliant';
  }

  // Great (!): Critical only-move or decisive tactical swing
  if (
    isTopChoice &&
    beforeMover > -500 &&
    beforeMover < 600 &&
    secondBestGap >= 115
  ) {
    return 'great';
  }

  if (playedLan === bestLan) return 'best';

  const hadMate = evalBefore.mate !== null && evalBefore.mate * moverSign > 0;
  const keptMate = evalAfter.mate !== null && evalAfter.mate * moverSign > 0;
  const walkedIntoMate =
    evalAfter.mate !== null &&
    evalAfter.mate * moverSign < 0 &&
    !(evalBefore.mate !== null && evalBefore.mate * moverSign < 0);

  if (walkedIntoMate) return 'blunder';
  if (hadMate && !keptMate && cpLoss > 120) return 'blunder';

  if (cpLoss <= 10) return 'best';
  if (cpLoss <= 25) return 'excellent';
  if (cpLoss <= 55) return 'good';
  if (cpLoss <= 120) return 'inaccuracy';
  if (cpLoss <= 260) return 'mistake';
  return 'blunder';
}

function computeSideSummary(analyses: MoveAnalysis[]): SideAccuracySummary {
  const counts = {
    book: 0,
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };

  if (analyses.length === 0) {
    return { accuracy: 100, acpl: 0, ...counts };
  }

  let totalCpl = 0;
  for (const item of analyses) {
    counts[item.classification] += 1;
    totalCpl += Math.min(item.cpLoss, 500);
  }

  const acpl = Math.round(totalCpl / analyses.length);
  const rawAcc = 103.1668 * Math.exp(-0.04354 * Math.min(acpl, 300)) - 3.1669;
  const accuracy = Math.max(0, Math.min(100, Math.round(rawAcc * 10) / 10));

  return { accuracy, acpl, ...counts };
}

class StockfishEngineService {
  private worker: Worker | null = null;
  private workerBlobUrl: string | null = null;
  private readyPromise: Promise<void> | null = null;
  private isReady = false;
  private activeRequestId = 0;
  private pendingResolve:
    | ((result: {
        bestMove: string;
        cp: number;
        mate: number | null;
        candidates: CandidateMove[];
      }) => void)
    | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private pendingId = 0;
  private lastInfoScore: { cp: number; mate: number | null } = { cp: 0, mate: null };
  private multiPvMap: Map<number, CandidateMove> = new Map();

  private createWorker(): Worker {
    const embeddedAsm =
      typeof window !== 'undefined' ? window.__EMBEDDED_STOCKFISH_ASM__ : undefined;

    if (embeddedAsm) {
      const blob = new Blob([embeddedAsm], { type: 'application/javascript' });
      this.workerBlobUrl = URL.createObjectURL(blob);
      return new Worker(this.workerBlobUrl);
    }

    const workerUrl = new URL(
      './stockfish/stockfish-19-lite-single.js',
      window.location.href
    ).toString();
    return new Worker(workerUrl);
  }

  private init(): Promise<void> {
    if (this.isReady && this.worker) {
      return Promise.resolve();
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      try {
        const worker = this.createWorker();
        this.worker = worker;

        let uciOk = false;

        const timeout = window.setTimeout(() => {
          if (!this.isReady) {
            reject(new Error('Stockfish engine timed out while initializing.'));
            this.terminate();
          }
        }, 20000);

        worker.onmessage = (event: MessageEvent<string>) => {
          const line = typeof event.data === 'string' ? event.data.trim() : '';
          if (!line) return;

          if (line === 'uciok' && !uciOk) {
            uciOk = true;
            worker.postMessage('isready');
            return;
          }

          if (line === 'readyok' && !this.isReady) {
            this.isReady = true;
            window.clearTimeout(timeout);
            resolve();
            return;
          }

          if (line.startsWith('info ') && line.includes(' score ')) {
            const mateMatch = line.match(/\bscore mate (-?\d+)/);
            const cpMatch = line.match(/\bscore cp (-?\d+)/);
            const mpvMatch = line.match(/\bmultipv (\d+)/);
            const pvMatch = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);

            const cpVal = cpMatch ? parseInt(cpMatch[1], 10) : 0;
            const mateVal = mateMatch ? parseInt(mateMatch[1], 10) : null;
            const mpvIdx = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;

            if (mpvIdx === 1) {
              this.lastInfoScore = { cp: cpVal, mate: mateVal };
            }
            if (pvMatch) {
              this.multiPvMap.set(mpvIdx, {
                uci: pvMatch[1],
                cp: cpVal,
                mate: mateVal,
              });
            }
            return;
          }

          if (line.startsWith('bestmove ')) {
            const parts = line.split(/\s+/);
            const uciMove = parts[1];
            const resolver = this.pendingResolve;
            const rejecter = this.pendingReject;
            const reqId = this.pendingId;
            const capturedScore = { ...this.lastInfoScore };
            const candidates = Array.from(this.multiPvMap.entries())
              .sort((a, b) => a[0] - b[0])
              .map((entry) => entry[1]);

            this.pendingResolve = null;
            this.pendingReject = null;

            if (reqId !== this.activeRequestId) {
              return;
            }

            if (!uciMove || uciMove === '(none)') {
              rejecter?.(new Error('Stockfish returned no legal move.'));
              return;
            }

            resolver?.({
              bestMove: uciMove,
              cp: capturedScore.cp,
              mate: capturedScore.mate,
              candidates,
            });
          }
        };

        worker.onerror = (err) => {
          window.clearTimeout(timeout);
          const error = new Error(err.message || 'Stockfish worker error');
          if (!this.isReady) {
            reject(error);
          }
          this.pendingReject?.(error);
          this.terminate();
        };

        worker.postMessage('uci');
      } catch (err) {
        this.readyPromise = null;
        reject(err instanceof Error ? err : new Error('Failed to start Stockfish worker'));
      }
    });

    return this.readyPromise;
  }

  private async runSearch(
    lanHistory: string[],
    options: {
      skillLevel: number;
      depth?: number;
      movetime: number;
      multiPv?: number;
      startFen?: string;
    },
    signal?: AbortSignal
  ): Promise<{
    bestMove: string;
    cp: number;
    mate: number | null;
    candidates: CandidateMove[];
  }> {
    this.activeRequestId += 1;
    const requestId = this.activeRequestId;

    await this.init();

    if (signal?.aborted || requestId !== this.activeRequestId) {
      throw new Error('Search cancelled');
    }

    const worker = this.worker;
    if (!worker) {
      throw new Error('Stockfish worker unavailable');
    }

    worker.postMessage('stop');
    this.lastInfoScore = { cp: 0, mate: null };
    this.multiPvMap.clear();

    const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const basePosition =
      options.startFen && options.startFen !== INITIAL_FEN
        ? `position fen ${options.startFen}`
        : 'position startpos';

    return new Promise((resolve, reject) => {
      if (signal?.aborted || requestId !== this.activeRequestId) {
        reject(new Error('Search cancelled'));
        return;
      }

      const onAbort = () => {
        if (this.pendingId === requestId) {
          this.pendingResolve = null;
          this.pendingReject = null;
          worker.postMessage('stop');
        }
        reject(new Error('Search cancelled'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      this.pendingId = requestId;
      this.pendingResolve = (res) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(res);
      };
      this.pendingReject = (err) => {
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      };

      worker.postMessage(`setoption name MultiPV value ${options.multiPv ?? 1}`);
      worker.postMessage(`setoption name Skill Level value ${options.skillLevel}`);
      if (lanHistory.length > 0) {
        worker.postMessage(`${basePosition} moves ${lanHistory.join(' ')}`);
      } else {
        worker.postMessage(basePosition);
      }

      const goCmd = options.depth
        ? `go depth ${options.depth} movetime ${options.movetime}`
        : `go movetime ${options.movetime}`;
      worker.postMessage(goCmd);
    });
  }

  public async getBestMove(
    lanHistory: string[],
    levelConfig: Pick<StockfishLevelConfig, 'skillLevel' | 'depth' | 'movetime'>,
    signal?: AbortSignal,
    startFen?: string
  ): Promise<EngineBestMove> {
    const res = await this.runSearch(
      lanHistory,
      {
        skillLevel: levelConfig.skillLevel,
        depth: levelConfig.depth,
        movetime: levelConfig.movetime,
        multiPv: 1,
        startFen,
      },
      signal
    );

    return this.parseUciMove(res.bestMove);
  }

  public async getHintMove(
    lanHistory: string[],
    startFen?: string,
    signal?: AbortSignal
  ): Promise<EngineBestMove> {
    const res = await this.runSearch(
      lanHistory,
      {
        skillLevel: 20,
        depth: 12,
        movetime: 320,
        multiPv: 1,
        startFen,
      },
      signal
    );

    return this.parseUciMove(res.bestMove);
  }

  public async getTopCandidates(
    lanHistory: string[],
    options: {
      skillLevel: number;
      depth: number;
      movetime: number;
      multiPv?: number;
      startFen?: string;
    },
    signal?: AbortSignal
  ): Promise<CandidateMove[]> {
    const res = await this.runSearch(
      lanHistory,
      {
        skillLevel: options.skillLevel,
        depth: options.depth,
        movetime: options.movetime,
        multiPv: options.multiPv ?? 3,
        startFen: options.startFen,
      },
      signal
    );
    if (res.candidates.length > 0) {
      return res.candidates;
    }
    return [{ uci: res.bestMove, cp: res.cp, mate: res.mate }];
  }

  public parseUciMove(uci: string): EngineBestMove {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promoChar = uci.slice(4, 5) as PromotionPiece | '';
    const promotion =
      promoChar === 'q' || promoChar === 'r' || promoChar === 'b' || promoChar === 'n'
        ? promoChar
        : undefined;
    return { from, to, promotion };
  }

  public async evaluatePosition(
    lanHistory: string[],
    sideToMove: 'w' | 'b',
    movetime = 120,
    signal?: AbortSignal,
    startFen?: string
  ): Promise<PositionEval> {
    const res = await this.runSearch(
      lanHistory,
      { skillLevel: 20, depth: 12, movetime, multiPv: 2, startFen },
      signal
    );

    const sign = sideToMove === 'w' ? 1 : -1;
    const second = res.candidates[1];

    return {
      cp: res.cp * sign,
      mate: res.mate !== null ? res.mate * sign : null,
      bestMove: res.bestMove,
      secondBestCp: second ? second.cp * sign : null,
      secondBestMate: second && second.mate !== null ? second.mate * sign : null,
    };
  }

  public async analyzeMatch(
    moves: MoveRecord[],
    onProgress: (completed: number, total: number) => void,
    signal?: AbortSignal,
    options?: { startFen?: string; bookPlies?: number }
  ): Promise<MatchAnalysisResult> {
    const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const startFen = options?.startFen || INITIAL_FEN;
    const bookPlies = options?.bookPlies ?? 0;
    const initialTurn: 'w' | 'b' = startFen.split(' ')[1] === 'b' ? 'b' : 'w';

    const totalPositions = moves.length + 1;
    const evals: PositionEval[] = [];

    for (let i = 0; i < totalPositions; i++) {
      if (signal?.aborted) throw new Error('Analysis cancelled');

      const lanSlice = moves.slice(0, i).map((m) => m.lan);
      const sideToMove: 'w' | 'b' =
        i === 0 ? initialTurn : moves[i - 1].color === 'w' ? 'b' : 'w';

      if (i > 0 && moves[i - 1].isCheckmate) {
        const winnerSign = moves[i - 1].color === 'w' ? 1 : -1;
        evals.push({
          cp: winnerSign * 10000,
          mate: winnerSign * 0,
          bestMove: '',
        });
      } else {
        try {
          const ev = await this.evaluatePosition(lanSlice, sideToMove, 115, signal, startFen);
          evals.push(ev);
        } catch (err) {
          if (signal?.aborted) throw err;
          evals.push({ cp: 0, mate: null, bestMove: '' });
        }
      }

      onProgress(i + 1, totalPositions);
    }

    const moveAnalyses: MoveAnalysis[] = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const fenBefore = i === 0 ? startFen : moves[i - 1].fen;
      const evalBefore = evals[i];
      const evalAfter = evals[i + 1];

      const moverSign = m.color === 'w' ? 1 : -1;
      const beforeMover = scoreToCpEquivalent(evalBefore) * moverSign;
      const afterMover = scoreToCpEquivalent(evalAfter) * moverSign;
      const cpLoss = Math.max(0, Math.round(beforeMover - afterMover));

      const isBook = startFen === INITIAL_FEN && i < bookPlies;

      const classification = classifyMove(
        fenBefore,
        m.lan,
        evalBefore.bestMove,
        cpLoss,
        evalBefore,
        evalAfter,
        m.color,
        isBook
      );

      moveAnalyses.push({
        ply: m.ply,
        san: m.san,
        color: m.color,
        to: m.to as Square,
        playedLan: m.lan,
        bestLan: evalBefore.bestMove,
        bestSan: uciToSan(fenBefore, evalBefore.bestMove),
        evalBefore,
        evalAfter,
        cpLoss,
        classification,
      });
    }

    const whiteMoves = moveAnalyses.filter((m) => m.color === 'w');
    const blackMoves = moveAnalyses.filter((m) => m.color === 'b');

    return {
      moves: moveAnalyses,
      white: computeSideSummary(whiteMoves),
      black: computeSideSummary(blackMoves),
      startEval: evals[0] ?? { cp: 15, mate: null, bestMove: 'e2e4' },
    };
  }

  public cancelPending() {
    this.activeRequestId += 1;
    this.pendingResolve = null;
    this.pendingReject = null;
    if (this.worker && this.isReady) {
      this.worker.postMessage('stop');
    }
  }

  public terminate() {
    this.activeRequestId += 1;
    this.pendingResolve = null;
    this.pendingReject = null;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workerBlobUrl) {
      URL.revokeObjectURL(this.workerBlobUrl);
      this.workerBlobUrl = null;
    }
    this.isReady = false;
    this.readyPromise = null;
  }
}

export const stockfishService = new StockfishEngineService();
