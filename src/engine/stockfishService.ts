import type { PromotionPiece, StockfishLevelConfig } from '../types/chess';

export interface EngineBestMove {
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

class StockfishEngineService {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private isReady = false;
  private activeRequestId = 0;
  private pendingResolve: ((move: EngineBestMove) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private pendingId = 0;

  private init(): Promise<void> {
    if (this.isReady && this.worker) {
      return Promise.resolve();
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      try {
        const workerUrl = new URL(
          './stockfish/stockfish-19-lite-single.js',
          window.location.href
        ).toString();
        const worker = new Worker(workerUrl);
        this.worker = worker;

        let uciOk = false;

        const timeout = window.setTimeout(() => {
          if (!this.isReady) {
            reject(new Error('Stockfish engine timed out while initializing.'));
            this.terminate();
          }
        }, 15000);

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

          if (line.startsWith('bestmove ')) {
            const parts = line.split(/\s+/);
            const uciMove = parts[1];
            const resolver = this.pendingResolve;
            const rejecter = this.pendingReject;
            const reqId = this.pendingId;

            this.pendingResolve = null;
            this.pendingReject = null;

            if (reqId !== this.activeRequestId) {
              return;
            }

            if (!uciMove || uciMove === '(none)') {
              rejecter?.(new Error('Stockfish returned no legal move.'));
              return;
            }

            const from = uciMove.slice(0, 2);
            const to = uciMove.slice(2, 4);
            const promoChar = uciMove.slice(4, 5) as PromotionPiece | '';
            const promotion =
              promoChar === 'q' || promoChar === 'r' || promoChar === 'b' || promoChar === 'n'
                ? promoChar
                : undefined;

            resolver?.({ from, to, promotion });
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

  public async getBestMove(
    lanHistory: string[],
    levelConfig: StockfishLevelConfig,
    signal?: AbortSignal
  ): Promise<EngineBestMove> {
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

    // Cancel any previous in-flight search
    worker.postMessage('stop');

    return new Promise<EngineBestMove>((resolve, reject) => {
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
      this.pendingResolve = (move) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(move);
      };
      this.pendingReject = (err) => {
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      };

      worker.postMessage(`setoption name Skill Level value ${levelConfig.skillLevel}`);
      if (lanHistory.length > 0) {
        worker.postMessage(`position startpos moves ${lanHistory.join(' ')}`);
      } else {
        worker.postMessage('position startpos');
      }
      worker.postMessage(
        `go depth ${levelConfig.depth} movetime ${levelConfig.movetime}`
      );
    });
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
    this.isReady = false;
    this.readyPromise = null;
  }
}

export const stockfishService = new StockfishEngineService();
