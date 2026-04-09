import { useEffect, useRef } from "react";

type PollFn = () => Promise<void> | void;

export function usePolling(queryFn: PollFn, intervalMs: number, enabled: boolean): void {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (runningRef.current) {
        return;
      }

      runningRef.current = true;
      try {
        await queryFn();
      } finally {
        runningRef.current = false;
      }
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [queryFn, intervalMs, enabled]);
}
