import type Phaser from "phaser";
import { gameEventBus } from "../utils/GameEventBus";

export class DialogSystem {
  private scene: Phaser.Scene;
  private isDialogVisible = false;
  private hideUnsubscribe?: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Listen for dialog hide events to sync state
    this.hideUnsubscribe = gameEventBus.on("dialog:hide", () => {
      this.isDialogVisible = false;
    });
  }

  public showDialog(text: string, speaker?: string): void {
    // Only emit event for React UI to handle
    this.isDialogVisible = true;
    gameEventBus.emit("dialog:show", { text, speaker });
  }

  public handleAdvance(): void {
    // Emit event for React UI to handle
    gameEventBus.emit("dialog:advance");
  }

  public isVisible(): boolean {
    return this.isDialogVisible;
  }

  public destroy(): void {
    if (this.hideUnsubscribe) {
      this.hideUnsubscribe();
    }
  }
}
