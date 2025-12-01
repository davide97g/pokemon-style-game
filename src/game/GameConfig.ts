import Phaser from 'phaser';
import { GameScene } from './GameScene';

export const createGameConfig = (parent: string): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent,
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
    },
  },
  scene: GameScene,
});

