import React, { useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <h3
                  id="ios-install-title"
                  className="text-base font-semibold text-stone-900 dark:text-stone-100"
                >
                  Install SquareEight on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-800 dark:hover:text-stone-200"
                  aria-label="Close instructions"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-stone-600 dark:text-stone-300">
                <li className="flex items-start gap-2.5">
                  <Share className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <span>
                    Tap the <strong>Share</strong> button in the Safari toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <PlusSquare className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <span>
                    Scroll down and select <strong>Add to Home Screen</strong> for full offline play.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-stone-900 dark:bg-stone-100 py-2 text-sm font-medium text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
