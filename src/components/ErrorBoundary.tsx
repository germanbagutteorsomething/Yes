import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { firebaseConfig } from '../firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isQuotaError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', isQuotaError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error?.message || 'Unexpected application error';
    const isQuotaError =
      raw.includes('Quota exceeded') ||
      raw.includes('Free daily read units per project');
    return {
      hasError: true,
      message: raw,
      isQuotaError,
    };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const upgradeUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 dark:bg-stone-950 p-4 text-stone-900 dark:text-stone-100">
        <div className="w-full max-w-md rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 shadow-lg space-y-4">
          <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-lg font-bold">
              {this.state.isQuotaError
                ? 'Firebase Daily Free Quota Reached'
                : 'Something went wrong'}
            </h1>
          </div>

          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            {this.state.isQuotaError
              ? 'The free Spark daily Firestore quota was reached. It resets automatically tomorrow, or you can inspect your database limits in the Firebase Console.'
              : 'An error occurred while syncing online match data. Local Chess (Stockfish & 2-Player), Cork7 Ski, and 8-Ball Pool continue working offline.'}
          </p>

          {this.state.isQuotaError && (
            <a
              href={upgradeUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-xs font-semibold text-emerald-700 dark:text-emerald-400 underline break-all"
            >
              Open Firebase Console Database
            </a>
          )}

          <div className="rounded-lg bg-stone-100 dark:bg-stone-800 p-2.5 font-mono text-[11px] text-stone-600 dark:text-stone-400 break-words max-h-32 overflow-y-auto">
            {this.state.message}
          </div>

          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, message: '', isQuotaError: false });
              window.location.href = window.location.pathname;
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 px-4 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reload SquareEight</span>
          </button>
        </div>
      </div>
    );
  }
}
