import { useState } from "react";
import type { InventoryItem } from "../../game/config/GameConstants";
import { INVENTORY_SLOT_CONFIG } from "../../game/config/GameConstants";

interface InventoryUIProps {
  isOpen: boolean;
  inventory: Map<string, InventoryItem>;
  onClose: () => void;
}

const InventoryUI = ({ isOpen, inventory, onClose }: InventoryUIProps) => {
  const [hoveredItem, setHoveredItem] = useState<InventoryItem | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  if (!isOpen) {
    return null;
  }

  const itemsWithQuantity: InventoryItem[] = [];
  inventory.forEach((item) => {
    if (item.quantity > 0) {
      itemsWithQuantity.push({ ...item });
    }
  });

  const { columns, rows, slotSize, slotPadding } = INVENTORY_SLOT_CONFIG;
  const panelWidth = window.innerWidth * 0.6;
  const panelHeight = window.innerHeight * 0.55;
  const gridWidth = columns * slotSize + (columns - 1) * slotPadding;
  const gridHeight = rows * slotSize + (rows - 1) * slotPadding;

  const handleSlotHover = (
    item: InventoryItem,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    setHoveredItem(item);
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition({ x: rect.x + rect.width / 2, y: rect.y });
  };

  const handleSlotLeave = () => {
    setHoveredItem(null);
  };

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black bg-opacity-50 z-40 border-0 p-0 cursor-pointer"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          }
        }}
        aria-label="Close inventory"
      />

      {/* Inventory Panel */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          className="bg-black bg-opacity-55 border-3 border-white border-opacity-40 rounded-lg p-8 pointer-events-auto relative"
          style={{
            width: `${panelWidth}px`,
            height: `${panelHeight}px`,
            maxWidth: "90vw",
            maxHeight: "90vh",
          }}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 h-16 bg-zinc-900 bg-opacity-95 border-b-2 border-white border-opacity-50 rounded-t-lg flex items-center justify-center">
            <h2 className="text-white text-2xl font-mono font-bold tracking-wider">
              INVENTORY
            </h2>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-white text-2xl font-bold hover:text-gray-300 transition-colors z-10"
            aria-label="Close inventory"
          >
            ×
          </button>

          {/* Main inventory grid */}
          <div
            className="mt-20 flex flex-wrap gap-2 justify-center"
            style={{
              width: `${gridWidth}px`,
              height: `${gridHeight}px`,
              margin: "0 auto",
            }}
          >
            {Array.from({ length: columns * rows }).map((_, index) => {
              const item = itemsWithQuantity[index];
              const slotKey = `slot-${index}`;
              return (
                <div
                  key={slotKey}
                  className="bg-zinc-900 bg-opacity-90 border-2 border-white border-opacity-25 rounded flex items-center justify-center relative"
                  style={{
                    width: `${slotSize}px`,
                    height: `${slotSize}px`,
                  }}
                  {...(item
                    ? {
                        onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) =>
                          handleSlotHover(item, e),
                        onMouseLeave: handleSlotLeave,
                        role: "img",
                        "aria-label": `${item.name}, quantity: ${item.quantity}`,
                      }
                    : { role: "presentation" })}
                >
                  {item && (
                    <>
                      {/* Item icon placeholder - would use actual image */}
                      <div
                        className="w-4/5 h-4/5 rounded border-2 border-white border-opacity-30"
                        style={{
                          backgroundColor: `#${item.color
                            .toString(16)
                            .padStart(6, "0")}`,
                        }}
                      />
                      {item.quantity > 1 && (
                        <span className="absolute bottom-1 right-1 text-white text-sm font-mono font-bold drop-shadow-lg">
                          {item.quantity}
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hotbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2.5">
            {itemsWithQuantity.slice(0, 8).map((item) => (
              <div
                key={`hotbar-${item.id}`}
                className="bg-slate-900 bg-opacity-95 border-2 border-white border-opacity-30 rounded flex items-center justify-center relative"
                style={{
                  width: "56px",
                  height: "56px",
                }}
                onMouseEnter={(e) => handleSlotHover(item, e)}
                onMouseLeave={handleSlotLeave}
                role="img"
                aria-label={`${item.name}, quantity: ${item.quantity}`}
              >
                <div
                  className="w-4/5 h-4/5 rounded border-2 border-white border-opacity-30"
                  style={{
                    backgroundColor: `#${item.color
                      .toString(16)
                      .padStart(6, "0")}`,
                  }}
                />
                {item.quantity > 1 && (
                  <span className="absolute bottom-1 right-1 text-white text-xs font-mono font-bold drop-shadow-lg">
                    {item.quantity}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredItem && (
        <div
          className="fixed bg-zinc-900 bg-opacity-95 border-2 border-white border-opacity-50 rounded p-2 z-60 pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y - 50}px`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="text-white text-sm font-mono">
            {hoveredItem.name} x{hoveredItem.quantity}
          </p>
        </div>
      )}

      {/* Inventory Recap (left side) */}
      <div className="fixed left-4 bottom-4 z-30 flex flex-col gap-1">
        {itemsWithQuantity.map((item) => (
          <div
            key={item.id}
            className="bg-black bg-opacity-50 border-2 border-white border-opacity-30 rounded-lg p-2 flex items-center gap-2 min-w-[200px]"
          >
            <div
              className="w-8 h-8 rounded border-2 border-white border-opacity-30 shrink-0"
              style={{
                backgroundColor: `#${item.color.toString(16).padStart(6, "0")}`,
              }}
            />
            <span className="text-white text-base font-mono">
              x{item.quantity} {item.name}
            </span>
          </div>
        ))}
      </div>
    </>
  );
};

export default InventoryUI;
