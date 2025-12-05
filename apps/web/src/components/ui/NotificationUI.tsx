import { useEffect, useState } from "react";
import { ASSET_PATHS } from "../../game/config/AssetPaths";
import { ITEM_TYPES } from "../../game/config/GameConstants";

interface Notification {
  id: string;
  itemId: string;
  quantity: number;
}

interface NotificationUIProps {
  notifications: Notification[];
}

const NotificationUI = ({ notifications }: NotificationUIProps) => {
  const [visibleNotifications, setVisibleNotifications] = useState<
    Notification[]
  >([]);

  useEffect(() => {
    setVisibleNotifications(notifications);
  }, [notifications]);

  const getItemImagePath = (itemId: string): string => {
    const path = ASSET_PATHS.items[itemId as keyof typeof ASSET_PATHS.items];
    return path || "";
  };

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 z-30 flex flex-col gap-2">
      {visibleNotifications.map((notification) => {
        const item = ITEM_TYPES.find((i) => i.id === notification.itemId);
        if (!item) return null;

        const imagePath = getItemImagePath(item.id);

        return (
          <div
            key={notification.id}
            className="bg-black bg-opacity-50 border-2 border-white border-opacity-30 rounded-lg p-3 flex items-center gap-3 min-w-[200px] shadow-lg"
            style={{
              animation: "slideIn 0.3s ease-out",
            }}
          >
            {/* Item icon */}
            <div className="w-10 h-10 rounded border-2 border-white border-opacity-30 shrink-0 bg-black bg-opacity-50 flex items-center justify-center">
              {imagePath ? (
                <img
                  src={imagePath}
                  alt={item.name}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <div
                  className="w-full h-full rounded"
                  style={{
                    backgroundColor: `#${item.color.toString(16).padStart(6, "0")}`,
                  }}
                />
              )}
            </div>
            <div className="flex-1">
              <p className="text-white text-base font-mono font-bold">
                {item.name}
              </p>
              <p className="text-gray-300 text-sm font-mono">
                x{notification.quantity}
              </p>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default NotificationUI;
