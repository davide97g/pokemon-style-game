import { useEffect, useRef, useState } from "react";
import { GAME_SCALE, STATUE_PROXIMITY_DISTANCE } from "../config/game";
import { CollisionSystem } from "../engine/CollisionSystem";
import { SpriteRenderer } from "../engine/SpriteRenderer";
import { TilemapRenderer } from "../engine/TilemapRenderer";
import { usePlayer } from "../entities/usePlayer";
import { useGameLoop } from "../hooks/useGameLoop";
import { useKeyboard } from "../hooks/useKeyboard";
import { ChatUI } from "./ChatUI";
import { GameDialog } from "./GameDialog";
import { GameMenu } from "./GameMenu";
import MobileControls from "./MobileControls";
import { WeatherWidget } from "./WeatherWidget";

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Game systems
  const tilemapRenderer = useRef(new TilemapRenderer());
  const spriteRenderer = useRef(new SpriteRenderer());
  const collisionSystem = useRef<CollisionSystem | null>(null);

  // Player state
  const { player, updatePlayer, setPosition } = usePlayer();

  // Camera state
  const camera = useRef({ x: 0, y: 0 });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    text: "",
    speaker: undefined as string | undefined,
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNearStatue, setIsNearStatue] = useState(false);
  const statuePosition = useRef<{ x: number; y: number } | null>(null);

  // Input
  const keyboardKeys = useKeyboard();
  const [mobileKeys, setMobileKeys] = useState({
    up: false,
    down: false,
    left: false,
    right: false,
    space: false,
    enter: false,
    escape: false,
  });

  // Merge inputs
  const keys = {
    ...keyboardKeys, // Include all keyboard keys first
    up: keyboardKeys.up || mobileKeys.up,
    down: keyboardKeys.down || mobileKeys.down,
    left: keyboardKeys.left || mobileKeys.left,
    right: keyboardKeys.right || mobileKeys.right,
    space: keyboardKeys.space || mobileKeys.space,
    enter: keyboardKeys.enter || mobileKeys.enter,
    escape: keyboardKeys.escape || mobileKeys.escape,
  };

  // Track if assets are already loaded to prevent duplicate loads
  const assetsLoadedRef = useRef(false);

  // Load assets
  useEffect(() => {
    // Prevent multiple loads
    if (assetsLoadedRef.current) return;

    const loadAssets = async () => {
      // Set flag immediately to prevent concurrent loads
      assetsLoadedRef.current = true;

      try {
        setLoading(true);
        setError(null);

        // Load tilemap
        try {
          await tilemapRenderer.current.loadMap("/tilemaps/tuxemon-town.json");
        } catch (err) {
          assetsLoadedRef.current = false; // Reset on error
          throw new Error(
            `Failed to load tilemap: ${
              err instanceof Error ? err.message : "Unknown error"
            }`,
          );
        }

        try {
          await tilemapRenderer.current.loadTilesets("/tilesets");
        } catch (err) {
          assetsLoadedRef.current = false; // Reset on error
          throw new Error(
            `Failed to load tilesets: ${
              err instanceof Error ? err.message : "Unknown error"
            }`,
          );
        }

        // Load sprites
        try {
          await spriteRenderer.current.loadAtlas(
            "/atlas/atlas.json",
            "/atlas/atlas.png",
          );
        } catch (err) {
          assetsLoadedRef.current = false; // Reset on error
          throw new Error(
            `Failed to load sprite atlas: ${
              err instanceof Error ? err.message : "Unknown error"
            }`,
          );
        }

        // Create player animations
        spriteRenderer.current.createAnimation(
          "walk-left",
          "misa-left-walk",
          0,
          3,
          10,
          true,
        );
        spriteRenderer.current.createAnimation(
          "walk-right",
          "misa-right-walk",
          0,
          3,
          10,
          true,
        );
        spriteRenderer.current.createAnimation(
          "walk-down",
          "misa-front-walk",
          0,
          3,
          10,
          true,
        );
        spriteRenderer.current.createAnimation(
          "walk-up",
          "misa-back-walk",
          0,
          3,
          10,
          true,
        );

        // Initialize collision system
        collisionSystem.current = new CollisionSystem(tilemapRenderer.current);

        // Find spawn point
        const spawnPoint = tilemapRenderer.current.findObject(
          "Objects",
          "Spawn Point",
        );
        if (spawnPoint) {
          setPosition(spawnPoint.x, spawnPoint.y);
        }

        // Find statue by property (type = "intelligent")
        const statue = tilemapRenderer.current.findObjectByProperty(
          "Objects",
          "type",
          "intelligent",
        );
        if (statue) {
          statuePosition.current = statue;
        }

        setLoading(false);
      } catch (err) {
        console.error("Failed to load assets:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to load game assets. Check console for details.";
        setError(errorMessage);
        setLoading(false);
      }
    };

    loadAssets();
  }, [setPosition]); // setPosition is stable from useState, won't cause re-renders

  // Resize canvas
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return;
      // Set internal resolution (game world size)
      const gameWidth = Math.floor(window.innerWidth / GAME_SCALE);
      const gameHeight = Math.floor(window.innerHeight / GAME_SCALE);
      canvasRef.current.width = gameWidth;
      canvasRef.current.height = gameHeight;
      // CSS will scale it up to fill screen
      canvasRef.current.style.width = "100vw";
      canvasRef.current.style.height = "100vh";
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle menu toggle
  useEffect(() => {
    if (keys.enter && !isMenuOpen && !isChatOpen) {
      setIsMenuOpen(true);
    }
  }, [keys.enter, isMenuOpen, isChatOpen]);

  // Handle chat toggle with "C" key
  const lastCKeyState = useRef(false);
  useEffect(() => {
    const cKeyPressed = keys.c === true;
    // Only trigger on key press (transition from false to true)
    if (
      cKeyPressed &&
      !lastCKeyState.current &&
      isNearStatue &&
      !isChatOpen &&
      !isMenuOpen
    ) {
      setIsChatOpen(true);
    }
    lastCKeyState.current = cKeyPressed;
  }, [keys.c, isNearStatue, isChatOpen, isMenuOpen]);

  // Check proximity to statue
  useEffect(() => {
    if (!statuePosition.current) return;

    const dx = player.x - statuePosition.current.x;
    const dy = player.y - statuePosition.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    setIsNearStatue(distance < STATUE_PROXIMITY_DISTANCE);
  }, [player.x, player.y]);

  // Track chat/menu state in refs to avoid restarting game loop
  const isChatOpenRef = useRef(isChatOpen);
  const isMenuOpenRef = useRef(isMenuOpen);
  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);
  useEffect(() => {
    isMenuOpenRef.current = isMenuOpen;
  }, [isMenuOpen]);

  // Game loop
  useGameLoop((deltaTime) => {
    if (loading || !canvasRef.current || !collisionSystem.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Update player (only if chat and menu are closed)
    if (!isChatOpenRef.current && !isMenuOpenRef.current) {
      updatePlayer(deltaTime, keys, collisionSystem.current);
    }

    // Update camera
    updateCamera();

    // Render
    render(ctx);
  }, !loading);

  const updateCamera = () => {
    if (!canvasRef.current) return;

    const mapSize = tilemapRenderer.current.getMapSize();
    const viewportWidth = canvasRef.current.width;
    const viewportHeight = canvasRef.current.height;

    // Center camera on player
    let camX = player.x - viewportWidth / 2;
    let camY = player.y - viewportHeight / 2;

    // Clamp to map bounds
    camX = Math.max(0, Math.min(camX, mapSize.width - viewportWidth));
    camY = Math.max(0, Math.min(camY, mapSize.height - viewportHeight));

    camera.current = { x: camX, y: camY };
  };

  const render = (ctx: CanvasRenderingContext2D) => {
    const { width, height } = ctx.canvas;
    const { x: cameraX, y: cameraY } = camera.current;

    // Clear canvas
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    // Enable pixel-perfect rendering
    ctx.imageSmoothingEnabled = false;

    // Render layers in correct order
    const layers = ["Below Player", "World", "Above Player"];

    for (let i = 0; i < layers.length; i++) {
      const layerName = layers[i];

      // Render layer
      tilemapRenderer.current.render(
        ctx,
        layerName,
        cameraX,
        cameraY,
        width,
        height,
      );

      // Render player between "World" and "Above Player"
      if (layerName === "World") {
        const screenX = player.x - cameraX;
        const screenY = player.y - cameraY;

        if (player.isMoving) {
          const animName = `walk-${player.direction}`;
          const frameName = spriteRenderer.current.getAnimationFrame(
            animName,
            player.animationTime,
          );
          if (frameName) {
            spriteRenderer.current.renderFrame(
              ctx,
              frameName,
              screenX,
              screenY,
            );
          }
        } else {
          // Idle frame
          const idleFrames: Record<string, string> = {
            left: "misa-left",
            right: "misa-right",
            up: "misa-back",
            down: "misa-front",
          };
          const frameName = idleFrames[player.direction];
          spriteRenderer.current.renderFrame(ctx, frameName, screenX, screenY);
        }
      }
    }
  };

  // Mobile control handlers
  const handleMobileDirection = (dir: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  }) => {
    setMobileKeys((prev) => ({ ...prev, ...dir }));
  };

  const handleMobileAction = (action: string, pressed: boolean) => {
    setMobileKeys((prev) => ({ ...prev, [action]: pressed }));
  };

  if (error) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Error Loading Game</h1>
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Loading...</h1>
          <p className="text-gray-400">Loading game assets</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: "pixelated",
          display: "block",
          width: "100vw",
          height: "100vh",
          position: "fixed",
          top: 0,
          left: 0,
        }}
      />
      <div className="fixed inset-0 pointer-events-none">
        <WeatherWidget />
        <GameDialog
          isOpen={dialogState.isOpen}
          text={dialogState.text}
          speaker={dialogState.speaker}
          onClose={() => setDialogState((prev) => ({ ...prev, isOpen: false }))}
        />
        <GameMenu
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          onSelect={(text, speaker) => {
            setDialogState({
              isOpen: true,
              text,
              speaker,
            });
          }}
        />
        <ChatUI isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        {isNearStatue && !isChatOpen && (
          <div className="absolute bottom-20 right-4 pointer-events-auto animate-bounce">
            <div className="bg-gray-800/90 border-2 border-gray-600 rounded-lg p-3 text-center">
              <div className="text-white font-mono text-sm mb-1">Press C</div>
              <div className="text-gray-400 font-mono text-xs">to chat</div>
            </div>
          </div>
        )}
        <MobileControls
          onDirectionChange={handleMobileDirection}
          onActionA={() => {
            handleMobileAction("space", true);
            setTimeout(() => handleMobileAction("space", false), 100);
          }}
          onActionB={() => {
            handleMobileAction("escape", true);
            setTimeout(() => handleMobileAction("escape", false), 100);
          }}
          onStart={() => {
            handleMobileAction("enter", true);
            setTimeout(() => handleMobileAction("enter", false), 100);
          }}
        />
      </div>
    </>
  );
}
