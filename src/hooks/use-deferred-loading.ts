import { useState, useRef, useEffect } from "react";

/**
 * Anti-flicker loading hook.
 *
 * Shows skeleton immediately when loading starts. Once shown, keeps it
 * visible for at least `minDisplayMs` (default 500ms) to prevent a brief
 * flash when data arrives quickly.
 *
 * Note: React Query cache hits return `isLoading: false` synchronously,
 * so cached data never triggers the skeleton at all.
 */
export function useDeferredLoading(
  isLoading: boolean,
  minDisplayMs = 500
): boolean {
  const [showSkeleton, setShowSkeleton] = useState(isLoading);
  const shownAtRef = useRef<number | null>(isLoading ? Date.now() : null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      if (!shownAtRef.current) {
        shownAtRef.current = Date.now();
      }
      setShowSkeleton(true);
    } else if (shownAtRef.current !== null) {
      // Data arrived — ensure minimum display time
      const elapsed = Date.now() - shownAtRef.current;
      const remaining = minDisplayMs - elapsed;

      if (remaining > 0) {
        timerRef.current = setTimeout(() => {
          setShowSkeleton(false);
          shownAtRef.current = null;
        }, remaining);
      } else {
        setShowSkeleton(false);
        shownAtRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoading, minDisplayMs]);

  return showSkeleton;
}
