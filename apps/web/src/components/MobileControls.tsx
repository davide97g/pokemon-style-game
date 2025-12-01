import { useEffect, useRef, useState } from 'react';

interface MobileControlsProps {
  onDirectionChange: (direction: { up: boolean; down: boolean; left: boolean; right: boolean }) => void;
  onActionA: () => void;
  onActionB: () => void;
  onStart: () => void;
}

const checkMobile = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || window.innerWidth <= 768;
};

const MobileControls = ({ onDirectionChange, onActionA, onActionB, onStart }: MobileControlsProps) => {
  const [isMobile, setIsMobile] = useState(checkMobile());
  const directionStateRef = useRef({ up: false, down: false, left: false, right: false });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(checkMobile());
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleDirectionStart = (direction: 'up' | 'down' | 'left' | 'right') => {
    directionStateRef.current[direction] = true;
    onDirectionChange({ ...directionStateRef.current });
  };

  const handleDirectionEnd = (direction: 'up' | 'down' | 'left' | 'right') => {
    directionStateRef.current[direction] = false;
    onDirectionChange({ ...directionStateRef.current });
  };

  const handleTouchStart = (direction: 'up' | 'down' | 'left' | 'right', e: React.TouchEvent) => {
    e.preventDefault();
    handleDirectionStart(direction);
  };

  const handleTouchEnd = (direction: 'up' | 'down' | 'left' | 'right', e: React.TouchEvent) => {
    e.preventDefault();
    handleDirectionEnd(direction);
  };

  const handleMouseDown = (direction: 'up' | 'down' | 'left' | 'right') => {
    handleDirectionStart(direction);
  };

  const handleMouseUp = (direction: 'up' | 'down' | 'left' | 'right') => {
    handleDirectionEnd(direction);
  };

  const handleActionA = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    onActionA();
  };

  const handleActionB = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    onActionB();
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    onStart();
  };

  if (!isMobile) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]" style={{ zIndex: 9999 }}>
      {/* Semi-transparent overlay background for controls area */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-32 bg-black opacity-50 pointer-events-none"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      />
      
      {/* Controls Container - Bottom Center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-3">
        {/* D-Pad Controls */}
        <div className="relative w-24 h-24">
          {/* Up Button */}
          <button
            className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 bg-gray-900 border-2 border-gray-400 rounded-lg flex items-center justify-center text-white text-lg font-bold active:bg-gray-600 select-none touch-none shadow-lg"
            style={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', borderColor: 'rgba(156, 163, 175, 0.8)' }}
            onTouchStart={(e) => handleTouchStart('up', e)}
            onTouchEnd={(e) => handleTouchEnd('up', e)}
            onMouseDown={() => handleMouseDown('up')}
            onMouseUp={() => handleMouseUp('up')}
            onMouseLeave={() => handleMouseUp('up')}
            aria-label="Move Up"
          >
            ↑
          </button>

          {/* Down Button */}
          <button
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-10 bg-gray-900 border-2 border-gray-400 rounded-lg flex items-center justify-center text-white text-lg font-bold active:bg-gray-600 select-none touch-none shadow-lg"
            style={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', borderColor: 'rgba(156, 163, 175, 0.8)' }}
            onTouchStart={(e) => handleTouchStart('down', e)}
            onTouchEnd={(e) => handleTouchEnd('down', e)}
            onMouseDown={() => handleMouseDown('down')}
            onMouseUp={() => handleMouseUp('down')}
            onMouseLeave={() => handleMouseUp('down')}
            aria-label="Move Down"
          >
            ↓
          </button>

          {/* Left Button */}
          <button
            className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-gray-900 border-2 border-gray-400 rounded-lg flex items-center justify-center text-white text-lg font-bold active:bg-gray-600 select-none touch-none shadow-lg"
            style={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', borderColor: 'rgba(156, 163, 175, 0.8)' }}
            onTouchStart={(e) => handleTouchStart('left', e)}
            onTouchEnd={(e) => handleTouchEnd('left', e)}
            onMouseDown={() => handleMouseDown('left')}
            onMouseUp={() => handleMouseUp('left')}
            onMouseLeave={() => handleMouseUp('left')}
            aria-label="Move Left"
          >
            ←
          </button>

          {/* Right Button */}
          <button
            className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-gray-900 border-2 border-gray-400 rounded-lg flex items-center justify-center text-white text-lg font-bold active:bg-gray-600 select-none touch-none shadow-lg"
            style={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', borderColor: 'rgba(156, 163, 175, 0.8)' }}
            onTouchStart={(e) => handleTouchStart('right', e)}
            onTouchEnd={(e) => handleTouchEnd('right', e)}
            onMouseDown={() => handleMouseDown('right')}
            onMouseUp={() => handleMouseUp('right')}
            onMouseLeave={() => handleMouseUp('right')}
            aria-label="Move Right"
          >
            →
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* A Button - Main Action */}
          <button
            className="w-14 h-14 bg-green-600 border-2 border-green-300 rounded-full flex items-center justify-center text-white text-lg font-bold active:bg-green-500 select-none touch-none shadow-lg"
            style={{ backgroundColor: 'rgba(22, 163, 74, 0.95)', borderColor: 'rgba(134, 239, 172, 0.8)' }}
            onTouchStart={handleActionA}
            onTouchEnd={(e) => e.preventDefault()}
            onClick={handleActionA}
            aria-label="Action A - Interact"
          >
            A
          </button>

          {/* B Button - Cancel */}
          <button
            className="w-14 h-14 bg-red-600 border-2 border-red-300 rounded-full flex items-center justify-center text-white text-lg font-bold active:bg-red-500 select-none touch-none shadow-lg"
            style={{ backgroundColor: 'rgba(220, 38, 38, 0.95)', borderColor: 'rgba(252, 165, 165, 0.8)' }}
            onTouchStart={handleActionB}
            onTouchEnd={(e) => e.preventDefault()}
            onClick={handleActionB}
            aria-label="Action B - Cancel"
          >
            B
          </button>

          {/* Start Button */}
          <button
            className="w-16 h-10 bg-blue-600 border-2 border-blue-300 rounded-lg flex items-center justify-center text-white text-xs font-bold active:bg-blue-500 select-none touch-none shadow-lg"
            style={{ backgroundColor: 'rgba(37, 99, 235, 0.95)', borderColor: 'rgba(147, 197, 253, 0.8)' }}
            onTouchStart={handleStart}
            onTouchEnd={(e) => e.preventDefault()}
            onClick={handleStart}
            aria-label="Start - Menu"
          >
            START
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileControls;

