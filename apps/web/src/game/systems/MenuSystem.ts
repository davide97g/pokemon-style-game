import Phaser from "phaser";
import { MENU_ENTRIES } from "../config/GameConstants";
import { MENU_DIALOG_TEXTS } from "../config/MenuConfig";
import type { GameScene } from "../GameScene";
import { gameEventBus } from "../utils/GameEventBus";

type MenuState = "main" | "options" | "volume";

export class MenuSystem {
  private scene: Phaser.Scene;
  private isMenuOpen = false;
  private selectedMenuIndex = 0;
  private onMenuSelect?: (text: string, speaker?: string) => void;
  private currentMenuState: MenuState = "main";
  private onVolumeChange?: (volume: number) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.setupKeyboardControls();
  }

  private setupKeyboardControls(): void {
    const spaceKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
    const enterKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    const leftKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.LEFT,
    );
    const rightKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    );

    spaceKey?.on("down", () => {
      if (this.isMenuOpen) {
        if (this.currentMenuState === "volume") {
          // Go back to options menu
          this.currentMenuState = "options";
          this.selectedMenuIndex = 0;
          this.emitMenuUpdate();
        } else if (this.currentMenuState === "options") {
          // Go back to main menu
          this.currentMenuState = "main";
          this.selectedMenuIndex = 0;
          this.emitMenuUpdate();
        } else {
          this.toggleMenu();
        }
      }
    });

    this.scene.input.keyboard?.on("keydown-UP", () => {
      if (this.isMenuOpen && this.currentMenuState !== "volume") {
        const maxIndex =
          this.currentMenuState === "options" ? 1 : MENU_ENTRIES.length - 1;
        this.selectedMenuIndex =
          this.selectedMenuIndex > 0 ? this.selectedMenuIndex - 1 : maxIndex;
        this.emitMenuUpdate();
      }
    });

    this.scene.input.keyboard?.on("keydown-DOWN", () => {
      if (this.isMenuOpen && this.currentMenuState !== "volume") {
        const maxIndex =
          this.currentMenuState === "options" ? 1 : MENU_ENTRIES.length - 1;
        this.selectedMenuIndex =
          this.selectedMenuIndex < maxIndex ? this.selectedMenuIndex + 1 : 0;
        this.emitMenuUpdate();
      }
    });

    leftKey?.on("down", () => {
      if (this.isMenuOpen && this.currentMenuState === "volume") {
        this.adjustVolume(-0.1);
      }
    });

    rightKey?.on("down", () => {
      if (this.isMenuOpen && this.currentMenuState === "volume") {
        this.adjustVolume(0.1);
      }
    });

    enterKey?.on("down", () => {
      if (this.isMenuOpen) {
        if (this.currentMenuState === "main") {
          const selectedEntry = MENU_ENTRIES[this.selectedMenuIndex];
          this.handleMenuSelect(selectedEntry.id);
        } else if (this.currentMenuState === "options") {
          const optionsEntries = ["Volume", "Back"];
          const selectedEntry = optionsEntries[this.selectedMenuIndex];
          if (selectedEntry === "Back") {
            this.currentMenuState = "main";
            this.selectedMenuIndex = 0;
            this.emitMenuUpdate();
          } else {
            this.handleMenuSelect(selectedEntry);
          }
        }
      }
    });
  }

  public toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.isMenuOpen) {
      this.currentMenuState = "main";
      this.selectedMenuIndex = 0;
      gameEventBus.emit("menu:open");
      this.emitMenuUpdate();
    } else {
      this.currentMenuState = "main";
      gameEventBus.emit("menu:close");
    }
    gameEventBus.emit("menu:toggle", { isOpen: this.isMenuOpen });
  }

  private emitMenuUpdate(): void {
    if (!this.isMenuOpen) return;

    const gameScene = this.scene as GameScene;
    const currentVolume = gameScene.getMusicVolume();

    gameEventBus.emit("menu:update", {
      menuState: this.currentMenuState,
      selectedIndex: this.selectedMenuIndex,
      volume: currentVolume,
    });
  }

  private adjustVolume(delta: number): void {
    const gameScene = this.scene as GameScene;
    const currentVolume = gameScene.getMusicVolume();
    const newVolume = Math.max(0, Math.min(1, currentVolume + delta));

    if (this.onVolumeChange) {
      this.onVolumeChange(newVolume);
    }
    gameEventBus.emit("menu:volume-change", { volume: newVolume });
    this.emitMenuUpdate();
  }

  public setOnVolumeChange(callback: (volume: number) => void): void {
    this.onVolumeChange = callback;
  }

  private handleMenuSelect(entry: string): void {
    if (entry === "Options") {
      // Switch to options submenu
      this.currentMenuState = "options";
      this.selectedMenuIndex = 0;
      this.emitMenuUpdate();
      return;
    }

    if (entry === "Volume") {
      // Switch to volume slider
      this.currentMenuState = "volume";
      this.emitMenuUpdate();
      return;
    }

    // For other entries, close menu and show dialog
    this.isMenuOpen = false;
    gameEventBus.emit("menu:close");
    gameEventBus.emit("menu:toggle", { isOpen: false });

    if (this.onMenuSelect) {
      const speaker = entry === "Red" ? undefined : entry;
      const dialogText = MENU_DIALOG_TEXTS[entry] || `${entry} selected.`;
      this.onMenuSelect(dialogText, speaker);
    }
    const speaker = entry === "Red" ? undefined : entry;
    const dialogText = MENU_DIALOG_TEXTS[entry] || `${entry} selected.`;
    gameEventBus.emit("menu:select", {
      entryId: entry,
      text: dialogText,
      speaker,
    });
    gameEventBus.emit("dialog:show", { text: dialogText, speaker });
  }

  public isOpen(): boolean {
    return this.isMenuOpen;
  }

  public setOnMenuSelect(
    callback: (text: string, speaker?: string) => void,
  ): void {
    this.onMenuSelect = callback;
  }
}
