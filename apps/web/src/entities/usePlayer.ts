import { useState } from "react";
import type { CollisionSystem } from "../engine/CollisionSystem";
import type { KeyboardState } from "../hooks/useKeyboard";

const PLAYER_SPEED = 175; // pixels per second

export interface PlayerState {
  x: number;
  y: number;
  direction: string;
  isMoving: boolean;
  animationTime: number;
}

export function usePlayer(initialX = 0, initialY = 0) {
  const [player, setPlayer] = useState<PlayerState>({
    x: initialX,
    y: initialY,
    direction: "down",
    isMoving: false,
    animationTime: 0,
  });

  const updatePlayer = (
    deltaTime: number,
    keys: KeyboardState,
    collisionSystem: CollisionSystem | null,
  ) => {
    let velocityX = 0;
    let velocityY = 0;
    let newDirection = player.direction;
    let isMoving = false;

    // Calculate velocity from input
    if (keys.left) {
      velocityX = -PLAYER_SPEED * deltaTime;
      newDirection = "left";
      isMoving = true;
    } else if (keys.right) {
      velocityX = PLAYER_SPEED * deltaTime;
      newDirection = "right";
      isMoving = true;
    }

    if (keys.up) {
      velocityY = -PLAYER_SPEED * deltaTime;
      newDirection = "up";
      isMoving = true;
    } else if (keys.down) {
      velocityY = PLAYER_SPEED * deltaTime;
      newDirection = "down";
      isMoving = true;
    }

    // Normalize diagonal movement
    if (velocityX !== 0 && velocityY !== 0) {
      const length = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
      velocityX = (velocityX / length) * PLAYER_SPEED * deltaTime;
      velocityY = (velocityY / length) * PLAYER_SPEED * deltaTime;
    }

    // Collision detection and resolution
    if (collisionSystem && (velocityX !== 0 || velocityY !== 0)) {
      const playerAABB = {
        x: player.x,
        y: player.y + 24, // Offset for sprite
        width: 30,
        height: 16,
      };

      const resolved = collisionSystem.resolveCollision(
        playerAABB,
        velocityX,
        velocityY,
        "World",
      );

      const newX = resolved.x;
      const newY = resolved.y - 24; // Remove offset

      // Update animation time
      const animationTime = isMoving ? player.animationTime + deltaTime : 0;

      setPlayer({
        x: newX,
        y: newY,
        direction: newDirection,
        isMoving,
        animationTime,
      });
    } else {
      setPlayer((prev) => ({
        ...prev,
        direction: newDirection,
        isMoving,
        animationTime: 0,
      }));
    }
  };

  const setPosition = (x: number, y: number) => {
    setPlayer((prev) => ({ ...prev, x, y }));
  };

  return {
    player,
    updatePlayer,
    setPosition,
  };
}
