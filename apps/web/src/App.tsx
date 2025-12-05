import { useEffect, useState } from "react";
import GameCanvas from "./components/GameCanvas";
import GameUI from "./components/GameUI";
import WorldSelection from "./components/WorldSelection";

const App = () => {
  const [showWorldSelection, setShowWorldSelection] = useState(true);
  const [worldId, setWorldId] = useState<string | null>(null);

  useEffect(() => {
    const handleExitToWorldSelection = () => {
      setShowWorldSelection(true);
      setWorldId(null);
    };

    window.addEventListener(
      "game:exit-to-world-selection",
      handleExitToWorldSelection,
    );

    return () => {
      window.removeEventListener(
        "game:exit-to-world-selection",
        handleExitToWorldSelection,
      );
    };
  }, []);

  const handleWorldSelected = (selectedWorldId: string) => {
    setWorldId(selectedWorldId);
    setShowWorldSelection(false);
  };

  const handleWorldCreated = (createdWorldId: string) => {
    setWorldId(createdWorldId);
    setShowWorldSelection(false);
  };

  return (
    <main className="w-full h-screen bg-background text-foreground overflow-hidden relative">
      {showWorldSelection ? (
        <WorldSelection
          onWorldSelected={handleWorldSelected}
          onWorldCreated={handleWorldCreated}
        />
      ) : (
        <>
          <GameCanvas worldId={worldId} />
          <GameUI worldId={worldId} />
        </>
      )}
    </main>
  );
};

export default App;
