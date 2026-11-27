import { useCallback, useEffect, useRef, useState } from 'react';

export function useFullscreen<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<T | null>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);

  const isFullscreen = nativeFullscreen || fallbackFullscreen;

  useEffect(() => {
    const onFullscreenChange = () => {
      const el = containerRef.current;
      const active = Boolean(el && document.fullscreenElement === el);
      setNativeFullscreen(active);
      if (active) {
        setFallbackFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!fallbackFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFallbackFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fallbackFullscreen]);

  const enterFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof el.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
      try {
        await el.requestFullscreen();
        setNativeFullscreen(true);
        setFallbackFullscreen(false);
        return;
      } catch {
        // Fallback when native fullscreen is blocked (e.g. iOS Safari or sandboxed iframes)
      }
    }
    setFallbackFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(async () => {
    setFallbackFullscreen(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore exit errors
      }
    }
    setNativeFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      void exitFullscreen();
    } else {
      void enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen, isFullscreen]);

  return {
    containerRef,
    isFullscreen,
    nativeFullscreen,
    fallbackFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
