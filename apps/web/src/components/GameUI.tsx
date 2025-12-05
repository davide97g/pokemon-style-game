import { useEffect, useState } from "react";
import packageJson from "../../package.json";
import { type InventoryItem, ITEM_TYPES } from "../game/config/GameConstants";
import { gameEventBus } from "../game/utils/GameEventBus";
import MobileControls from "./MobileControls";
import ChatUI from "./ui/ChatUI";
import DialogUI from "./ui/DialogUI";
import InventoryBar from "./ui/InventoryBar";
import InventoryUI from "./ui/InventoryUI";
import MenuUI from "./ui/MenuUI";
import NotificationUI from "./ui/NotificationUI";
import WeatherUI from "./ui/WeatherUI";

interface GameUIProps {
  worldId: string | null;
}

const GameUI = ({ worldId }: GameUIProps) => {
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventory, setInventory] = useState<Map<string, InventoryItem>>(
    new Map(),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogText, setDialogText] = useState("");
  const [dialogSpeaker, setDialogSpeaker] = useState<string | undefined>();
  const [chatOpen, setChatOpen] = useState(false);
  const [nearStatue, setNearStatue] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; itemId: string; quantity: number }>
  >([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Initialize inventory from ITEM_TYPES
  useEffect(() => {
    const initialInventory = new Map<string, InventoryItem>();
    ITEM_TYPES.forEach((item) => {
      initialInventory.set(item.id, { ...item, quantity: 0 });
    });
    setInventory(initialInventory);
  }, []);

  // Set up event listeners
  useEffect(() => {
    const handleInventoryToggle = () => {
      setInventoryOpen((prev) => !prev);
    };

    const handleInventoryOpen = () => {
      setInventoryOpen(true);
    };

    const handleInventoryClose = () => {
      setInventoryOpen(false);
    };

    const handleInventoryUpdate = (payload?: unknown) => {
      if (payload && typeof payload === "object" && "inventory" in payload) {
        const inv = payload.inventory as Map<string, InventoryItem>;
        setInventory(new Map(inv));
      }
    };

    const handleItemAdded = (payload?: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        "itemId" in payload &&
        "quantity" in payload
      ) {
        const { itemId, quantity } = payload as {
          itemId: string;
          quantity: number;
        };
        setInventory((prev) => {
          const newInv = new Map(prev);
          const item = newInv.get(itemId);
          if (item) {
            newInv.set(itemId, { ...item, quantity: item.quantity + quantity });
          }
          return newInv;
        });
      }
    };

    const handleItemRemoved = (payload?: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        "itemId" in payload &&
        "quantity" in payload
      ) {
        const { itemId, quantity } = payload as {
          itemId: string;
          quantity: number;
        };
        setInventory((prev) => {
          const newInv = new Map(prev);
          const item = newInv.get(itemId);
          if (item && item.quantity >= quantity) {
            newInv.set(itemId, { ...item, quantity: item.quantity - quantity });
          }
          return newInv;
        });
      }
    };

    const handleMenuToggle = () => {
      setMenuOpen((prev) => !prev);
    };

    const handleMenuOpen = () => {
      setMenuOpen(true);
    };

    const handleMenuClose = () => {
      setMenuOpen(false);
    };

    const handleDialogShow = (payload?: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        "text" in payload &&
        typeof payload.text === "string"
      ) {
        setDialogText(payload.text);
        setDialogSpeaker(
          "speaker" in payload && typeof payload.speaker === "string"
            ? payload.speaker
            : undefined,
        );
        setDialogVisible(true);
      }
    };

    const handleDialogHide = () => {
      setDialogVisible(false);
    };

    const handleChatOpen = () => {
      setChatOpen(true);
    };

    const handleChatClose = () => {
      setChatOpen(false);
    };

    const handleNearStatue = () => {
      setNearStatue(true);
    };

    const handleNotNearStatue = () => {
      setNearStatue(false);
    };

    const handleItemCollected = (payload?: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        "itemId" in payload &&
        "quantity" in payload
      ) {
        const { itemId, quantity } = payload as {
          itemId: string;
          quantity: number;
        };
        const notificationId = `${itemId}-${Date.now()}`;
        setNotifications((prev) => [
          ...prev,
          { id: notificationId, itemId, quantity },
        ]);

        // Auto-remove notification after 3 seconds
        setTimeout(() => {
          setNotifications((prev) =>
            prev.filter((n) => n.id !== notificationId),
          );
        }, 3000);
      }
    };

    const handleExitToWorldSelection = () => {
      // Emit custom event that App.tsx can listen to
      window.dispatchEvent(new CustomEvent("game:exit-to-world-selection"));
    };

    // Subscribe to events
    const unsubscribers = [
      gameEventBus.on("inventory:toggle", handleInventoryToggle),
      gameEventBus.on("inventory:open", handleInventoryOpen),
      gameEventBus.on("inventory:close", handleInventoryClose),
      gameEventBus.on("inventory:update", handleInventoryUpdate),
      gameEventBus.on("inventory:item-added", handleItemAdded),
      gameEventBus.on("inventory:item-removed", handleItemRemoved),
      gameEventBus.on("menu:toggle", handleMenuToggle),
      gameEventBus.on("menu:open", handleMenuOpen),
      gameEventBus.on("menu:close", handleMenuClose),
      gameEventBus.on("dialog:show", handleDialogShow),
      gameEventBus.on("dialog:hide", handleDialogHide),
      gameEventBus.on("chat:open", handleChatOpen),
      gameEventBus.on("chat:close", handleChatClose),
      gameEventBus.on("chat:near-statue", handleNearStatue),
      gameEventBus.on("chat:not-near-statue", handleNotNearStatue),
      gameEventBus.on("notification:item-collected", handleItemCollected),
      gameEventBus.on(
        "game:exit-to-world-selection",
        handleExitToWorldSelection,
      ),
    ];

    return () => {
      unsubscribers.forEach((unsub) => {
        unsub();
      });
    };
  }, []);

  // Handle mobile controls
  const handleDirectionChange = (direction: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  }) => {
    window.dispatchEvent(
      new CustomEvent("mobileDirectionChange", { detail: direction }),
    );
  };

  const handleActionA = () => {
    window.dispatchEvent(new CustomEvent("mobileActionA"));
  };

  const handleActionB = () => {
    window.dispatchEvent(new CustomEvent("mobileActionB"));
  };

  const handleStart = () => {
    window.dispatchEvent(new CustomEvent("mobileStart"));
  };

  const handleItemSelect = (itemId: string | null) => {
    setSelectedItemId(itemId);
    gameEventBus.emit("inventory:item-selected", { itemId });
  };

  if (!worldId) {
    return null;
  }

  return (
    <>
      <InventoryUI
        isOpen={inventoryOpen}
        inventory={inventory}
        onClose={() => {
          gameEventBus.emit("inventory:close");
        }}
      />
      <MenuUI
        isOpen={menuOpen}
        onClose={() => {
          gameEventBus.emit("menu:close");
        }}
      />
      <DialogUI
        isVisible={dialogVisible}
        text={dialogText}
        speaker={dialogSpeaker}
        onAdvance={() => {
          gameEventBus.emit("dialog:advance");
        }}
        onClose={() => {
          gameEventBus.emit("dialog:hide");
        }}
      />
      <ChatUI
        isOpen={chatOpen}
        nearStatue={nearStatue}
        onClose={() => {
          gameEventBus.emit("chat:close");
        }}
      />
      <InventoryBar
        inventory={inventory}
        selectedItemId={selectedItemId}
        onItemSelect={handleItemSelect}
      />
      <WeatherUI />
      <NotificationUI notifications={notifications} />
      <MobileControls
        onDirectionChange={handleDirectionChange}
        onActionA={handleActionA}
        onActionB={handleActionB}
        onStart={handleStart}
      />
      <div
        className="absolute bottom-4 right-4 text-white px-2 py-1 rounded pointer-events-none z-50"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          fontFamily: "monospace",
          fontSize: "12px",
          textShadow: "1px 1px 2px rgba(0, 0, 0, 0.8)",
          letterSpacing: "0.5px",
        }}
      >
        v{packageJson.version}
      </div>
    </>
  );
};

export default GameUI;
