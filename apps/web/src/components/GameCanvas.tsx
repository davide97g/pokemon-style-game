import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { createGameConfig } from "../game/GameConfig";
import type { GameScene } from "../game/GameScene";

interface GameCanvasProps {
  worldId: string | null;
  onGameReady?: (scene: GameScene) => void;
}

const GameCanvas = ({ worldId, onGameReady }: GameCanvasProps) => {
  const gameRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!gameRef.current || phaserGameRef.current || !worldId) return;

    const config = createGameConfig("game-container");
    phaserGameRef.current = new Phaser.Game(config);

    // Wait for game to be ready, then set world ID
    const checkGameReady = setInterval(() => {
      if (phaserGameRef.current && worldId) {
        const scene = phaserGameRef.current.scene.getScene(
          "GameScene",
        ) as GameScene;
        if (scene) {
          scene.setWorldId(worldId);
          if (onGameReady) {
            onGameReady(scene);
          }
          clearInterval(checkGameReady);
        }
      }
    }, 100);

    const handleResize = () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.scale.resize(
          window.innerWidth,
          window.innerHeight,
        );
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      clearInterval(checkGameReady);
      window.removeEventListener("resize", handleResize);
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
    };
  }, [worldId, onGameReady]);

  return (
    <div
      id="game-container"
      ref={gameRef}
      className="absolute inset-0 w-full h-full"
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
      }}
    />
  );
};

export default GameCanvas;
