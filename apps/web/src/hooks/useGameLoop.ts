import { useEffect, useRef, useState } from "react";

interface GameLoopState {
  deltaTime: number;
  fps: number;
  elapsedTime: number;
}

export function useGameLoop(
  callback: (deltaTime: number) => void,
  running = true,
) {
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();
  const [state, setState] = useState<GameLoopState>({
    deltaTime: 0,
    fps: 0,
    elapsedTime: 0,
  });

  useEffect(() => {
    if (!running) return;

    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined) {
        // Calculate delta time in seconds
        const deltaTime = (time - previousTimeRef.current) / 1000;
        const fps = deltaTime > 0 ? 1 / deltaTime : 0;

        setState((prev) => ({
          deltaTime,
          fps,
          elapsedTime: prev.elapsedTime + deltaTime,
        }));

        callback(deltaTime);
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [callback, running]);

  return state;
}
