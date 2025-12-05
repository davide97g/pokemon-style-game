import { useCallback, useEffect, useState } from "react";
import { MENU_ENTRIES } from "../../game/config/GameConstants";
import { MENU_DIALOG_TEXTS } from "../../game/config/MenuConfig";
import { gameEventBus } from "../../game/utils/GameEventBus";

type MenuState = "main" | "options" | "volume";

interface MenuUIProps {
  isOpen: boolean;
  onClose: () => void;
}

const MenuUI = ({ isOpen, onClose }: MenuUIProps) => {
  const [menuState, setMenuState] = useState<MenuState>("main");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [volume, setVolume] = useState(0.5);

  const handleMenuSelect = useCallback(
    (entry: string) => {
      if (entry === "Options") {
        setMenuState("options");
        setSelectedIndex(0);
        return;
      }

      if (entry === "Volume") {
        setMenuState("volume");
        return;
      }

      // For other entries, close menu and show dialog
      onClose();
      const speaker = entry === "Red" ? undefined : entry;
      const dialogText = MENU_DIALOG_TEXTS[entry] || `${entry} selected.`;
      gameEventBus.emit("menu:select", { text: dialogText, speaker });
      gameEventBus.emit("dialog:show", { text: dialogText, speaker });
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) {
      setMenuState("main");
      setSelectedIndex(0);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape" || e.key === " ") {
        if (menuState === "volume") {
          setMenuState("options");
        } else if (menuState === "options") {
          setMenuState("main");
          setSelectedIndex(0);
        } else {
          onClose();
        }
        return;
      }

      if (menuState === "volume") {
        if (e.key === "ArrowLeft") {
          setVolume((prev) => Math.max(0, prev - 0.1));
        } else if (e.key === "ArrowRight") {
          setVolume((prev) => Math.min(1, prev + 0.1));
        }
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const maxIndex = menuState === "options" ? 1 : MENU_ENTRIES.length - 1;
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const maxIndex = menuState === "options" ? 1 : MENU_ENTRIES.length - 1;
        setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (menuState === "main") {
          const selectedEntry = MENU_ENTRIES[selectedIndex];
          handleMenuSelect(selectedEntry.id);
        } else if (menuState === "options") {
          const optionsEntries = ["Volume", "Back"];
          const selectedEntry = optionsEntries[selectedIndex];
          if (selectedEntry === "Back") {
            setMenuState("main");
            setSelectedIndex(0);
          } else {
            handleMenuSelect(selectedEntry);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, menuState, selectedIndex, onClose, handleMenuSelect]);

  useEffect(() => {
    if (menuState === "volume") {
      gameEventBus.emit("menu:volume-change", { volume });
    }
  }, [volume, menuState]);

  const getMenuEntries = () => {
    if (menuState === "options") {
      return ["Volume", "Back"];
    }
    return MENU_ENTRIES.map((e) => e.label);
  };

  if (!isOpen) {
    return null;
  }

  const entries = getMenuEntries();

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black bg-opacity-30 z-40 border-0 p-0 cursor-pointer"
        onClick={onClose}
        aria-label="Close menu"
      />

      {/* Menu Panel */}
      <div className="fixed top-4 right-4 w-48 bg-gray-300 bg-opacity-85 border-2 border-gray-500 rounded z-50">
        {menuState === "volume" ? (
          <div className="p-4">
            <h3 className="text-white text-base font-mono mb-4">Volume</h3>
            <div className="mb-4">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full"
              />
              <p className="text-white text-sm font-mono mt-2">
                {Math.round(volume * 100)}%
              </p>
            </div>
            <p className="text-white text-xs font-mono">
              Press SPACE to go back
            </p>
          </div>
        ) : (
          <div className="p-3">
            {entries.map((entry, index) => (
              <button
                type="button"
                key={`menu-${menuState}-${entry}`}
                className={`p-1 mb-1 cursor-pointer ${
                  index === selectedIndex
                    ? "bg-gray-600 text-white"
                    : "text-white"
                }`}
                onClick={() => {
                  setSelectedIndex(index);
                  if (menuState === "main") {
                    handleMenuSelect(MENU_ENTRIES[index].id);
                  } else {
                    handleMenuSelect(entry);
                  }
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {index === selectedIndex ? `► ${entry}` : entry}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default MenuUI;
