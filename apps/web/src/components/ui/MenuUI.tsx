import { useCallback, useEffect, useState } from "react";
import { MENU_ENTRIES } from "../../game/config/GameConstants";
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
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Listen to menu updates for volume
  useEffect(() => {
    const handleMenuUpdate = (payload?: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        "volume" in payload &&
        typeof payload.volume === "number"
      ) {
        setVolume(payload.volume);
      }
    };

    const unsubscribe = gameEventBus.on("menu:update", handleMenuUpdate);
    return () => {
      unsubscribe();
    };
  }, []);

  // Listen to menu select events
  useEffect(() => {
    const handleMenuSelect = (payload?: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        "entryId" in payload &&
        typeof payload.entryId === "string"
      ) {
        const entryId = payload.entryId;

        if (entryId === "codex") {
          // TODO: Implement codex in the future
          gameEventBus.emit("dialog:show", {
            text: "Codex feature coming soon!",
          });
          onClose();
        } else if (entryId === "save") {
          // Trigger save
          gameEventBus.emit("game:save");
          gameEventBus.emit("dialog:show", {
            text: "Game saved successfully!",
          });
          onClose();
        } else if (entryId === "exit") {
          // Show exit confirmation
          setShowExitConfirm(true);
        } else if (entryId === "options") {
          setMenuState("options");
          setSelectedIndex(0);
        }
      }
    };

    const unsubscribe = gameEventBus.on("menu:select", handleMenuSelect);
    return () => {
      unsubscribe();
    };
  }, [onClose]);

  const handleMenuSelect = useCallback((entryId: string) => {
    if (entryId === "options") {
      setMenuState("options");
      setSelectedIndex(0);
      return;
    }

    if (entryId === "Volume") {
      setMenuState("volume");
      return;
    }

    // Emit menu select event
    gameEventBus.emit("menu:select", { entryId });
  }, []);

  const handleExitConfirm = useCallback(
    (shouldSave: boolean) => {
      setShowExitConfirm(false);
      onClose();

      if (shouldSave) {
        // Trigger save before exit
        gameEventBus.emit("game:save");
      }

      // Navigate to world selection
      gameEventBus.emit("game:exit-to-world-selection");
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) {
      setMenuState("main");
      setSelectedIndex(0);
      setShowExitConfirm(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Handle exit confirmation dialog
      if (showExitConfirm) {
        if (e.key === "Enter") {
          handleExitConfirm(true);
        } else if (e.key === "Escape") {
          setShowExitConfirm(false);
        }
        return;
      }

      if (e.key === "Escape") {
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
          gameEventBus.emit("menu:volume-change", {
            volume: Math.max(0, volume - 0.1),
          });
        } else if (e.key === "ArrowRight") {
          setVolume((prev) => Math.min(1, prev + 0.1));
          gameEventBus.emit("menu:volume-change", {
            volume: Math.min(1, volume + 0.1),
          });
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
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // For column navigation in main menu
        if (menuState === "main") {
          e.preventDefault();
          const currentCol = selectedIndex % 2;
          const currentRow = Math.floor(selectedIndex / 2);
          if (e.key === "ArrowLeft" && currentCol === 1) {
            setSelectedIndex(currentRow * 2);
          } else if (e.key === "ArrowRight" && currentCol === 0) {
            setSelectedIndex(currentRow * 2 + 1);
          }
        }
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
  }, [
    isOpen,
    menuState,
    selectedIndex,
    onClose,
    handleMenuSelect,
    showExitConfirm,
    handleExitConfirm,
    volume,
  ]);

  useEffect(() => {
    if (menuState === "volume") {
      gameEventBus.emit("menu:volume-change", { volume });
    }
  }, [volume, menuState]);

  const getMenuEntries = () => {
    if (menuState === "options") {
      return ["Volume", "Back"];
    }
    return MENU_ENTRIES;
  };

  if (!isOpen) {
    return null;
  }

  // Exit confirmation dialog
  if (showExitConfirm) {
    return (
      <>
        <button
          type="button"
          className="fixed inset-0 bg-black bg-opacity-50 z-40 border-0 p-0 cursor-pointer"
          onClick={() => setShowExitConfirm(false)}
          aria-label="Cancel exit"
        />
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-gray-800 border-2 border-gray-500 rounded p-6 max-w-md w-full mx-4">
            <h3 className="text-white text-lg font-mono mb-4">Exit Game</h3>
            <p className="text-white text-sm font-mono mb-6">
              Do you want to save your progress before exiting?
            </p>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => handleExitConfirm(true)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-mono py-2 px-4 rounded"
              >
                Save & Exit
              </button>
              <button
                type="button"
                onClick={() => handleExitConfirm(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-mono py-2 px-4 rounded"
              >
                Exit Without Saving
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-mono py-2 px-4 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </>
    );
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
      <div className="fixed top-4 right-4 w-64 bg-gray-300 bg-opacity-85 border-2 border-gray-500 rounded z-50">
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
                onChange={(e) => {
                  const newVolume = parseFloat(e.target.value);
                  setVolume(newVolume);
                  gameEventBus.emit("menu:volume-change", {
                    volume: newVolume,
                  });
                }}
                className="w-full"
              />
              <p className="text-white text-sm font-mono mt-2">
                {Math.round(volume * 100)}%
              </p>
            </div>
            <p className="text-white text-xs font-mono">Press ESC to go back</p>
          </div>
        ) : (
          <div className="p-3">
            {menuState === "main" ? (
              // Display in 2 columns
              <div className="grid grid-cols-2 gap-2">
                {entries.map((entry, index) => (
                  <button
                    type="button"
                    key={`menu-${menuState}-${entry.id}`}
                    className={`p-2 cursor-pointer text-left rounded ${
                      index === selectedIndex
                        ? "bg-gray-600 text-white"
                        : "text-white hover:bg-gray-500"
                    }`}
                    onClick={() => {
                      setSelectedIndex(index);
                      handleMenuSelect(entry.id);
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {index === selectedIndex ? `► ${entry.label}` : entry.label}
                  </button>
                ))}
              </div>
            ) : (
              // Options menu - single column
              <div className="space-y-1">
                {entries.map((entry, index) => {
                  const entryLabel =
                    typeof entry === "string" ? entry : entry.label;
                  return (
                    <button
                      type="button"
                      key={`menu-${menuState}-${entryLabel}`}
                      className={`p-2 w-full cursor-pointer text-left rounded ${
                        index === selectedIndex
                          ? "bg-gray-600 text-white"
                          : "text-white hover:bg-gray-500"
                      }`}
                      onClick={() => {
                        setSelectedIndex(index);
                        if (entryLabel === "Back") {
                          setMenuState("main");
                          setSelectedIndex(0);
                        } else {
                          handleMenuSelect(entryLabel);
                        }
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      {index === selectedIndex ? `► ${entryLabel}` : entryLabel}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default MenuUI;
