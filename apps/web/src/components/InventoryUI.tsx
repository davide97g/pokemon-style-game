import { useRef, useState } from "react";
import { Card } from "./ui/card";

interface InventoryItem {
  id: string;
  name: string;
  color: string;
  quantity: number;
}

interface InventoryUIProps {
  isOpen: boolean;
  onClose: () => void;
  items: Map<string, InventoryItem>;
}

const INVENTORY_SLOT_CONFIG = {
  columns: 8,
  rows: 4,
  slotSize: 56,
  slotPadding: 8,
};

const HOTBAR_SLOTS = 8;

export const InventoryUI = ({ isOpen, onClose, items }: InventoryUIProps) => {
  const [hoveredItem, setHoveredItem] = useState<{
    item: InventoryItem;
    x: number;
    y: number;
  } | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Get all items with quantity > 0
  const itemsWithQuantity: InventoryItem[] = [];
  items.forEach((item) => {
    if (item.quantity > 0) {
      itemsWithQuantity.push({ ...item });
    }
  });

  const handleSlotHover = (
    item: InventoryItem,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!containerRef.current) return;
    const slotRect = event.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    setHoveredItem({
      item,
      x: slotRect.left - containerRect.left + slotRect.width / 2,
      y: slotRect.top - containerRect.top,
    });
  };

  const handleImageError = (itemId: string) => {
    setImageErrors((prev) => new Set(prev).add(itemId));
  };

  const handleSlotLeave = () => {
    setHoveredItem(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "i" || e.key === "I") {
      onClose();
    }
  };

  const renderSlot = (
    item: InventoryItem | undefined,
    index: number,
    isHotbar: boolean = false,
  ) => {
    const slotSize = isHotbar ? 56 : INVENTORY_SLOT_CONFIG.slotSize;
    // const slotPadding = isHotbar ? 10 : INVENTORY_SLOT_CONFIG.slotPadding;

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: container is interactive
      <div
        key={index}
        className="relative"
        style={{ width: slotSize, height: slotSize }}
        onMouseEnter={item ? (e) => handleSlotHover(item, e) : undefined}
        onMouseLeave={item ? handleSlotLeave : undefined}
        onKeyDown={handleKeyDown}
      >
        <div
          className={`border-2 ${
            isHotbar
              ? "bg-slate-900/95 border-white/30"
              : "bg-zinc-800/90 border-white/25"
          } flex items-center justify-center relative`}
          style={{ width: slotSize, height: slotSize }}
        >
          {item && (
            <>
              {/* Item icon - try to load image, fallback to colored rectangle */}
              <div
                className="flex items-center justify-center"
                style={{ width: slotSize * 0.7, height: slotSize * 0.7 }}
              >
                {imageErrors.has(item.id) ? (
                  <div
                    className="w-full h-full border-2 border-white/30"
                    style={{ backgroundColor: item.color }}
                  />
                ) : (
                  <img
                    src={`/assets/items/${item.id}.png`}
                    alt={item.name}
                    className="w-full h-full object-contain"
                    onError={() => handleImageError(item.id)}
                  />
                )}
              </div>
              {/* Quantity text */}
              {item.quantity > 1 && (
                <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs font-mono px-1 py-0.5 border-t border-l border-white/30">
                  {item.quantity}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const { columns, rows, slotSize, slotPadding } = INVENTORY_SLOT_CONFIG;
  const gridWidth = columns * slotSize + (columns - 1) * slotPadding;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: container is interactive
    <div
      className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
      onKeyDown={handleKeyDown}
    >
      <Card
        ref={containerRef}
        className="bg-black/55 border-[3px] border-white/40 pointer-events-auto shadow-2xl p-6 relative"
      >
        {/* Header */}
        <div className="bg-zinc-800/95 border-2 border-white/50 mb-4 p-4 flex items-center justify-between">
          <h2 className="font-mono text-2xl text-white font-bold stroke-black">
            INVENTORY
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-gray-300 text-2xl font-bold leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close inventory"
          >
            ×
          </button>
        </div>

        {/* Main inventory grid */}
        <div
          className="grid gap-2 mb-4"
          style={{
            gridTemplateColumns: `repeat(${columns}, ${slotSize}px)`,
            width: gridWidth,
          }}
        >
          {Array.from({ length: columns * rows }, (_, index) => {
            const item = itemsWithQuantity[index];
            return renderSlot(item, index, false);
          })}
        </div>

        {/* Hotbar */}
        <div className="border-t-2 border-white/30 pt-4">
          <div
            className="grid gap-2.5 justify-center"
            style={{
              gridTemplateColumns: `repeat(${HOTBAR_SLOTS}, 56px)`,
            }}
          >
            {Array.from({ length: HOTBAR_SLOTS }, (_, index) => {
              const item = itemsWithQuantity[index];
              return renderSlot(item, index, true);
            })}
          </div>
        </div>

        {/* Tooltip */}
        {hoveredItem && (
          <div
            className="absolute bg-zinc-800/95 border-2 border-white/50 p-2 pointer-events-none z-50"
            style={{
              left: `${hoveredItem.x}px`,
              top: `${hoveredItem.y - 50}px`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="text-white text-sm font-mono whitespace-nowrap">
              {hoveredItem.item.name} x{hoveredItem.item.quantity}
            </p>
          </div>
        )}

        {/* Instructions */}
        <p className="text-xs text-gray-400 mt-4 text-center font-mono">
          Press I or Esc to close
        </p>
      </Card>
    </div>
  );
};
