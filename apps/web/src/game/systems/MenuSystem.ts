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
    const enterKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    const escapeKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ESC,
    );
    const leftKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.LEFT,
    );
    const rightKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    );

    enterKey?.on("down", () => {
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
          // Handle menu item selection
          const selectedEntry = MENU_ENTRIES[this.selectedMenuIndex];
          this.handleMenuSelect(selectedEntry.id);
        }
      } else {
        // Open menu if closed
        this.toggleMenu();
      }
    });

    escapeKey?.on("down", () => {
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
      if (this.isMenuOpen) {
        if (this.currentMenuState === "volume") {
          this.adjustVolume(-0.1);
        } else if (this.currentMenuState === "main") {
          // Column navigation for main menu
          const currentCol = this.selectedMenuIndex % 2;
          const currentRow = Math.floor(this.selectedMenuIndex / 2);
          if (currentCol === 1) {
            this.selectedMenuIndex = currentRow * 2;
            this.emitMenuUpdate();
          }
        }
      }
    });

    rightKey?.on("down", () => {
      if (this.isMenuOpen) {
        if (this.currentMenuState === "volume") {
          this.adjustVolume(0.1);
        } else if (this.currentMenuState === "main") {
          // Column navigation for main menu
          const currentCol = this.selectedMenuIndex % 2;
          const currentRow = Math.floor(this.selectedMenuIndex / 2);
          if (currentCol === 0) {
            this.selectedMenuIndex = currentRow * 2 + 1;
            this.emitMenuUpdate();
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
    if (entry === "options") {
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

    // Emit menu select event for React UI to handle
    gameEventBus.emit("menu:select", {
      entryId: entry,
    });

    // For save, codex, and exit, let React UI handle them
    // Don't close menu here - let React UI handle it
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
