import { useEffect, useState } from "react";

export interface KeyboardState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  space: boolean;
  enter: boolean;
  escape: boolean;
  [key: string]: boolean;
}

export function useKeyboard() {
  const [keys, setKeys] = useState<KeyboardState>({
    up: false,
    down: false,
    left: false,
    right: false,
    space: false,
    enter: false,
    escape: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      setKeys((prev) => {
        const updated = { ...prev };

        // Arrow keys and WASD
        if (key === "arrowup" || key === "w") updated.up = true;
        if (key === "arrowdown" || key === "s") updated.down = true;
        if (key === "arrowleft" || key === "a") updated.left = true;
        if (key === "arrowright" || key === "d") updated.right = true;

        // Action keys
        if (key === " ") updated.space = true;
        if (key === "enter") updated.enter = true;
        if (key === "escape") updated.escape = true;

        // Store additional keys with their actual key name
        updated[key] = true;

        return updated;
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      setKeys((prev) => {
        const updated = { ...prev };

        // Arrow keys and WASD
        if (key === "arrowup" || key === "w") updated.up = false;
        if (key === "arrowdown" || key === "s") updated.down = false;
        if (key === "arrowleft" || key === "a") updated.left = false;
        if (key === "arrowright" || key === "d") updated.right = false;

        // Action keys
        if (key === " ") updated.space = false;
        if (key === "enter") updated.enter = false;
        if (key === "escape") updated.escape = false;

        // Remove additional keys
        updated[key] = false;

        return updated;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return keys;
}
