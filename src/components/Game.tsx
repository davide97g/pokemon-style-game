import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../game/GameConfig';

const Game = () => {
  const gameRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!gameRef.current || phaserGameRef.current) return;

    const config = createGameConfig('game-container');
    phaserGameRef.current = new Phaser.Game(config);

    const handleResize = () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.scale.resize(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      id="game-container"
      ref={gameRef}
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
      }}
    />
  );
};

export default Game;

