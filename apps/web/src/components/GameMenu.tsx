import { useEffect, useState } from "react";
import { MENU_DIALOG_TEXTS, MENU_ENTRIES } from "../config/game";
import { useKeyboard } from "../hooks/useKeyboard";
import { Card } from "./ui/card";
import { Slider } from "./ui/slider";

interface GameMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (text: string, speaker?: string) => void;
}

type MenuState = "main" | "options" | "volume";

export function GameMenu({ isOpen, onClose, onSelect }: GameMenuProps) {
  const [menuState, setMenuState] = useState<MenuState>("main");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const keys = useKeyboard();
  const [lastKeyTime, setLastKeyTime] = useState(0);

  // Reset state when menu opens
  useEffect(() => {
    if (isOpen) {
      setMenuState("main");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const now = Date.now();
    if (now - lastKeyTime < 150) return; // Debounce

    if (keys.up) {
      setSelectedIndex((prev) => {
        const max = menuState === "options" ? 1 : MENU_ENTRIES.length - 1;
        return prev > 0 ? prev - 1 : max;
      });
      setLastKeyTime(now);
    } else if (keys.down) {
      setSelectedIndex((prev) => {
        const max = menuState === "options" ? 1 : MENU_ENTRIES.length - 1;
        return prev < max ? prev + 1 : 0;
      });
      setLastKeyTime(now);
    } else if (keys.left && menuState === "volume") {
      setVolume((prev) => Math.max(0, prev - 0.1));
      setLastKeyTime(now);
    } else if (keys.right && menuState === "volume") {
      setVolume((prev) => Math.min(1, prev + 0.1));
      setLastKeyTime(now);
    } else if (keys.enter) {
      handleSelect();
      setLastKeyTime(now);
    } else if (keys.space || keys.escape) {
      handleBack();
      setLastKeyTime(now);
    }
  }, [keys, isOpen, menuState, lastKeyTime]);

  const handleSelect = () => {
    if (menuState === "main") {
      const entry = MENU_ENTRIES[selectedIndex];
      if (entry === "Options") {
        setMenuState("options");
        setSelectedIndex(0);
      } else {
        const text = MENU_DIALOG_TEXTS[entry];
        onSelect(text, entry === "Red" ? undefined : entry);
        onClose();
      }
    } else if (menuState === "options") {
      if (selectedIndex === 0) {
        // Volume
        setMenuState("volume");
      } else {
        // Back
        setMenuState("main");
        setSelectedIndex(0);
      }
    }
  };

  const handleBack = () => {
    if (menuState === "volume") {
      setMenuState("options");
    } else if (menuState === "options") {
      setMenuState("main");
      setSelectedIndex(0);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-4 right-4 z-50 pointer-events-auto">
      <Card className="w-48 bg-gray-100/90 border-2 border-gray-500 shadow-lg p-2">
        {menuState === "volume" ? (
          <div className="space-y-4 p-2">
            <h3 className="font-bold text-gray-800">Volume</h3>
            <Slider
              value={[volume * 100]}
              max={100}
              step={10}
              onValueChange={(vals) => setVolume(vals[0] / 100)}
              className="w-full"
            />
            <div className="text-center text-sm text-gray-600">
              {Math.round(volume * 100)}%
            </div>
            <div className="text-xs text-gray-500 text-center">
              Press SPACE to back
            </div>
          </div>
        ) : (
          <ul className="space-y-1">
            {(menuState === "options" ? ["Volume", "Back"] : MENU_ENTRIES).map(
              (entry, index) => (
                <li
                  key={entry}
                  className={`px-2 py-1 rounded cursor-pointer text-sm font-mono ${
                    index === selectedIndex
                      ? "bg-gray-700 text-white"
                      : "text-gray-800 hover:bg-gray-200"
                  }`}
                  onClick={() => {
                    setSelectedIndex(index);
                    if (index === selectedIndex) handleSelect();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {index === selectedIndex ? "► " : "  "}
                  {entry}
                </li>
              ),
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}
