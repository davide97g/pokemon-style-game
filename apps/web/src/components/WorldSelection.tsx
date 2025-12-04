import { useCallback, useEffect, useState } from "react";
import {
  createWorld,
  deleteWorld,
  formatPlayTime,
  getAllWorlds,
  setCurrentWorld,
  startSession,
  type WorldMetadata,
} from "../game/services/SaveService";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface WorldSelectionProps {
  onWorldSelected: (worldId: string) => void;
  onWorldCreated: (worldId: string) => void;
}

const WorldSelection = ({
  onWorldSelected,
  onWorldCreated,
}: WorldSelectionProps) => {
  const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const loadWorlds = useCallback(() => {
    const allWorlds = getAllWorlds();
    setWorlds(allWorlds);
    setShowCreateForm(allWorlds.length === 0);
  }, []);

  useEffect(() => {
    loadWorlds();
  }, [loadWorlds]);

  const handleCreateWorld = async () => {
    if (!newWorldName.trim()) {
      alert("Please enter a world name");
      return;
    }

    setIsCreating(true);
    try {
      const worldId = createWorld(newWorldName.trim());
      onWorldCreated(worldId);
    } catch (error) {
      console.error("Error creating world:", error);
      alert("Failed to create world. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectWorld = (worldId: string) => {
    setCurrentWorld(worldId);
    startSession(worldId);
    onWorldSelected(worldId);
  };

  const handleDeleteWorld = (
    worldId: string,
    worldName: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (
      confirm(
        `Are you sure you want to delete "${worldName}"? This cannot be undone.`,
      )
    ) {
      deleteWorld(worldId);
      loadWorlds();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isCreating) {
      handleCreateWorld();
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark bg-gray-900 border-2 border-white border-opacity-30">
        <DialogHeader>
          <DialogTitle className="text-4xl font-bold text-white text-center font-mono">
            Mini World
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-center text-sm">
            Select a world or create a new one
          </DialogDescription>
        </DialogHeader>

        {showCreateForm ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="world-name"
                className="text-white font-mono text-sm"
              >
                World Name
              </Label>
              <Input
                id="world-name"
                type="text"
                value={newWorldName}
                onChange={(e) => setNewWorldName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter world name..."
                className="bg-gray-800 border-gray-600 text-white font-mono focus:border-white focus:border-opacity-50"
                disabled={isCreating}
              />
            </div>
            <div className="flex gap-4">
              <Button
                type="button"
                onClick={handleCreateWorld}
                disabled={isCreating || !newWorldName.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-mono"
              >
                {isCreating ? "Creating..." : "Create World"}
              </Button>
              {worlds.length > 0 && (
                <Button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isCreating}
                  variant="secondary"
                  className="bg-gray-700 hover:bg-gray-600 text-white font-mono"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
              {worlds.length === 0 ? (
                <p className="text-gray-400 text-center py-8 font-mono">
                  No worlds found. Create your first world!
                </p>
              ) : (
                worlds.map((world) => (
                  <Card
                    key={world.worldId}
                    className="bg-gray-800 border-gray-700 hover:bg-gray-750 hover:border-white hover:border-opacity-30 transition-all"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <Button
                          variant="ghost"
                          onClick={() => handleSelectWorld(world.worldId)}
                          className="flex-1 text-left bg-transparent"
                          aria-label={`Select world ${world.worldName}`}
                        >
                          <CardHeader className="p-0 pb-2">
                            <CardTitle className="text-white font-mono text-lg">
                              {world.worldName}
                            </CardTitle>
                          </CardHeader>
                          <CardDescription className="text-gray-400 text-xs font-mono space-y-1">
                            <p>
                              Playtime: {formatPlayTime(world.totalPlayTime)}
                            </p>
                            <p>
                              Last played:{" "}
                              {new Date(
                                world.lastPlayedAt,
                              ).toLocaleDateString()}{" "}
                              {new Date(
                                world.lastPlayedAt,
                              ).toLocaleTimeString()}
                            </p>
                          </CardDescription>
                        </Button>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={(e) =>
                              handleDeleteWorld(
                                world.worldId,
                                world.worldName,
                                e,
                              )
                            }
                            variant="destructive"
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-mono"
                            aria-label={`Delete world ${world.worldName}`}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <Button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-mono"
            >
              Create New World
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WorldSelection;
