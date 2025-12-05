import { useEffect, useMemo, useState } from "react";
import { ASSET_PATHS } from "../../game/config/AssetPaths";
import type { InventoryItem } from "../../game/config/GameConstants";

interface InventoryBarProps {
  inventory: Map<string, InventoryItem>;
  selectedItemId: string | null;
  onItemSelect: (itemId: string | null) => void;
}

const InventoryBar = ({
  inventory,
  selectedItemId,
  onItemSelect,
}: InventoryBarProps) => {
  const [hoveredItem, setHoveredItem] = useState<InventoryItem | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  // Get items with quantity > 0 (memoized)
  const itemsWithQuantity = useMemo(() => {
    const items: InventoryItem[] = [];
    inventory.forEach((item) => {
      if (item.quantity > 0) {
        items.push(item);
      }
    });
    return items;
  }, [inventory]);

  // Handle Ctrl key press/release and keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Ctrl/Cmd is pressed
      if (e.ctrlKey || e.metaKey) {
        setIsCtrlPressed(true);

        // Handle Ctrl + digit (1-9)
        if (e.key >= "1" && e.key <= "9") {
          const digit = parseInt(e.key, 10);
          const index = digit - 1; // Convert to 0-based index
          if (index < itemsWithQuantity.length) {
            const item = itemsWithQuantity[index];
            onItemSelect(item.id === selectedItemId ? null : item.id);
          }
        }
      } else if (e.key === "Control" || e.key === "Meta") {
        setIsCtrlPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        setIsCtrlPressed(false);
      }
      // Also check if Ctrl/Cmd is no longer pressed
      if (!e.ctrlKey && !e.metaKey) {
        setIsCtrlPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [itemsWithQuantity, selectedItemId, onItemSelect]);

  const handleItemClick = (itemId: string) => {
    onItemSelect(itemId === selectedItemId ? null : itemId);
  };

  const handleItemHover = (
    item: InventoryItem,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    setHoveredItem(item);
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition({ x: rect.x + rect.width / 2, y: rect.y });
  };

  const handleItemLeave = () => {
    setHoveredItem(null);
  };

  const getItemImagePath = (itemId: string): string => {
    const path = ASSET_PATHS.items[itemId as keyof typeof ASSET_PATHS.items];
    return path || "";
  };

  if (itemsWithQuantity.length === 0) {
    return null;
  }

  return (
    <>
      {/* Inventory Bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex gap-2">
        {itemsWithQuantity.map((item, index) => {
          const isSelected = selectedItemId === item.id;
          const imagePath = getItemImagePath(item.id);

          return (
            <div
              key={item.id}
              className="relative"
              onClick={() => handleItemClick(item.id)}
              onMouseEnter={(e) => handleItemHover(item, e)}
              onMouseLeave={handleItemLeave}
              role="button"
              tabIndex={0}
              aria-label={`${item.name}, quantity: ${item.quantity}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleItemClick(item.id);
                }
              }}
            >
              {/* Item Slot */}
              <div
                className={`bg-black bg-opacity-50 rounded flex items-center justify-center relative cursor-pointer transition-all ${
                  isSelected
                    ? "border-4 border-white"
                    : "border-2 border-white border-opacity-30"
                }`}
                style={{
                  width: "64px",
                  height: "64px",
                }}
              >
                {/* Item Image */}
                {imagePath && (
                  <img
                    src={imagePath}
                    alt={item.name}
                    className="w-4/5 h-4/5 object-contain"
                  />
                )}

                {/* Quantity */}
                <span className="absolute bottom-1 right-1 text-white text-xs font-mono font-bold drop-shadow-lg">
                  x{item.quantity}
                </span>

                {/* Number Badge (when Ctrl is pressed) */}
                {isCtrlPressed && (
                  <div className="absolute top-0 left-0 bg-white bg-opacity-90 text-black text-sm font-bold w-5 h-5 rounded-br flex items-center justify-center">
                    {index + 1}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {hoveredItem && (
        <div
          className="fixed bg-zinc-900 bg-opacity-95 border-2 border-white border-opacity-50 rounded p-2 z-50 pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y - 50}px`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="text-white text-sm font-mono">{hoveredItem.name}</p>
        </div>
      )}
    </>
  );
};

export default InventoryBar;
