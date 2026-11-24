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

declare global {
  interface Window {
    __EMBEDDED_STOCKFISH_ASM__?: string;
  }
}

function scoreToCpEquivalent(evalObj: PositionEval): number {
  if (evalObj.mate !== null) {
    // Assign large monotonic centipawn value for mate distances
    const sign = evalObj.mate > 0 ? 1 : -1;
    return sign * (10000 - Math.min(Math.abs(evalObj.mate), 99) * 10);
  }
  return evalObj.cp;
}

function classifyMove(
  playedLan: string,
  bestLan: string,
  cpLoss: number,
  evalBefore: PositionEval,
  evalAfter: PositionEval,
  moverColor: 'w' | 'b'
): MoveClassification {
  if (playedLan === bestLan) return 'best';

  // Detect missing a forced mate or walking into forced mate
  const moverSign = moverColor === 'w' ? 1 : -1;
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
    // Cap per-move CPL at 500 for ACPL stability (standard Lichess-style cap)
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
  private pendingResolve: ((result: { bestMove: string; cp: number; mate: number | null }) => void) | null =
    null;
  private pendingReject: ((err: Error) => void) | null = null;
  private pendingId = 0;
  private lastInfoScore: { cp: number; mate: number | null } = { cp: 0, mate: null };

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
            // Skip lowerbound/upperbound partial scores if an exact score exists, or parse cleanly
            const mateMatch = line.match(/\bscore mate (-?\d+)/);
            const cpMatch = line.match(/\bscore cp (-?\d+)/);
            if (mateMatch) {
              this.lastInfoScore = { cp: 0, mate: parseInt(mateMatch[1], 10) };
            } else if (cpMatch) {
              this.lastInfoScore = { cp: parseInt(cpMatch[1], 10), mate: null };
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
    options: { skillLevel: number; depth?: number; movetime: number },
    signal?: AbortSignal
  ): Promise<{ bestMove: string; cp: number; mate: number | null }> {
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

      worker.postMessage(`setoption name Skill Level value ${options.skillLevel}`);
      if (lanHistory.length > 0) {
        worker.postMessage(`position startpos moves ${lanHistory.join(' ')}`);
      } else {
        worker.postMessage('position startpos');
      }

      const goCmd = options.depth
        ? `go depth ${options.depth} movetime ${options.movetime}`
        : `go movetime ${options.movetime}`;
      worker.postMessage(goCmd);
    });
  }

  public async getBestMove(
    lanHistory: string[],
    levelConfig: StockfishLevelConfig,
    signal?: AbortSignal
  ): Promise<EngineBestMove> {
    const res = await this.runSearch(
      lanHistory,
      {
        skillLevel: levelConfig.skillLevel,
        depth: levelConfig.depth,
        movetime: levelConfig.movetime,
      },
      signal
    );

    const from = res.bestMove.slice(0, 2);
    const to = res.bestMove.slice(2, 4);
    const promoChar = res.bestMove.slice(4, 5) as PromotionPiece | '';
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
    signal?: AbortSignal
  ): Promise<PositionEval> {
    const res = await this.runSearch(
      lanHistory,
      { skillLevel: 20, depth: 11, movetime },
      signal
    );

    // UCI reports scores from side-to-move perspective; normalize to White's perspective
    const sign = sideToMove === 'w' ? 1 : -1;
    return {
      cp: res.cp * sign,
      mate: res.mate !== null ? res.mate * sign : null,
      bestMove: res.bestMove,
    };
  }

  public async analyzeMatch(
    moves: MoveRecord[],
    onProgress: (completed: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<MatchAnalysisResult> {
    const totalPositions = moves.length + 1;
    const evals: PositionEval[] = [];

    // Evaluate starting position + every ply position
    for (let i = 0; i < totalPositions; i++) {
      if (signal?.aborted) throw new Error('Analysis cancelled');

      const lanSlice = moves.slice(0, i).map((m) => m.lan);
      const sideToMove: 'w' | 'b' = i % 2 === 0 ? 'w' : 'b';

      // Terminal checkmate positions have no legal moves for Stockfish to search
      if (i > 0 && moves[i - 1].isCheckmate) {
        const winnerSign = moves[i - 1].color === 'w' ? 1 : -1;
        evals.push({
          cp: winnerSign * 10000,
          mate: winnerSign * 0,
          bestMove: '',
        });
      } else {
        try {
          const ev = await this.evaluatePosition(lanSlice, sideToMove, 110, signal);
          evals.push(ev);
        } catch (err) {
          if (signal?.aborted) throw err;
          // Terminal draw/stalemate where Stockfish returns bestmove (none)
          evals.push({ cp: 0, mate: null, bestMove: '' });
        }
      }

      onProgress(i + 1, totalPositions);
    }

    const moveAnalyses: MoveAnalysis[] = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const evalBefore = evals[i];
      const evalAfter = evals[i + 1];

      const moverSign = m.color === 'w' ? 1 : -1;
      const beforeMover = scoreToCpEquivalent(evalBefore) * moverSign;
      const afterMover = scoreToCpEquivalent(evalAfter) * moverSign;
      const cpLoss = Math.max(0, Math.round(beforeMover - afterMover));

      const classification = classifyMove(
        m.lan,
        evalBefore.bestMove,
        cpLoss,
        evalBefore,
        evalAfter,
        m.color
      );

      moveAnalyses.push({
        ply: m.ply,
        san: m.san,
        color: m.color,
        playedLan: m.lan,
        bestLan: evalBefore.bestMove,
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
