import Phaser from "phaser";
import { MENU_ENTRIES } from "../config/GameConstants";
import { MENU_DIALOG_TEXTS } from "../config/MenuConfig";
import { GameScene } from "../GameScene";

type MenuState = "main" | "options" | "volume";

export class MenuSystem {
  private scene: Phaser.Scene;
  private isMenuOpen = false;
  private selectedMenuIndex = 0;
  private menuContainer: Phaser.GameObjects.Container | null = null;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private onMenuSelect?: (text: string, speaker?: string) => void;
  private currentMenuState: MenuState = "main";
  private volumeSliderContainer: Phaser.GameObjects.Container | null = null;
  private volumeSliderBar: Phaser.GameObjects.Rectangle | null = null;
  private volumeSliderHandle: Phaser.GameObjects.Rectangle | null = null;
  private volumeSliderValue: Phaser.GameObjects.Text | null = null;
  private onVolumeChange?: (volume: number) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.initMenu();
  }

  private initMenu(): void {
    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;
    const menuWidth = 192;
    const menuX = width - menuWidth - 16;
    const menuY = 16;

    this.menuContainer = this.scene.add.container(menuX, menuY);
    this.menuContainer.setScrollFactor(0);
    this.menuContainer.setDepth(50);
    this.menuContainer.setVisible(false);

    const bg = this.scene.add.rectangle(
      menuWidth / 2,
      0,
      menuWidth,
      height - 32,
      0xcccccc,
      0.85
    );
    bg.setStrokeStyle(2, 0x808080);
    this.menuContainer.add(bg);

    this.menuTexts = [];
    const entryHeight = 24;
    const padding = 12;
    const startY = padding;

    MENU_ENTRIES.forEach((entry, index) => {
      const y = startY + index * entryHeight;
      const entryText = this.scene.add.text(padding, y, entry, {
        font: "16px monospace",
        color: "#ffffff",
        align: "left",
      });
      entryText.setOrigin(0, 0);
      entryText.setPadding(4, 4, 4, 4);
      this.menuContainer!.add(entryText);
      this.menuTexts.push(entryText);
    });

    this.setupKeyboardControls();
  }

  private setupKeyboardControls(): void {
    const spaceKey = this.scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    const enterKey = this.scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
    );
    const leftKey = this.scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.LEFT
    );
    const rightKey = this.scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.RIGHT
    );

    spaceKey.on("down", () => {
      if (this.isMenuOpen) {
        if (this.currentMenuState === "volume") {
          // Go back to options menu
          this.currentMenuState = "options";
          this.showOptionsMenu();
        } else if (this.currentMenuState === "options") {
          // Go back to main menu
          this.currentMenuState = "main";
          this.updateMenuSelection();
        } else {
          this.toggleMenu();
        }
      }
    });

    this.scene.input.keyboard!.on("keydown-UP", () => {
      if (this.isMenuOpen && this.currentMenuState !== "volume") {
        const maxIndex =
          this.currentMenuState === "options" ? 1 : MENU_ENTRIES.length - 1;
        this.selectedMenuIndex =
          this.selectedMenuIndex > 0
            ? this.selectedMenuIndex - 1
            : maxIndex;
        this.updateMenuSelection();
      }
    });

    this.scene.input.keyboard!.on("keydown-DOWN", () => {
      if (this.isMenuOpen && this.currentMenuState !== "volume") {
        const maxIndex =
          this.currentMenuState === "options" ? 1 : MENU_ENTRIES.length - 1;
        this.selectedMenuIndex =
          this.selectedMenuIndex < maxIndex ? this.selectedMenuIndex + 1 : 0;
        this.updateMenuSelection();
      }
    });

    leftKey.on("down", () => {
      if (this.isMenuOpen && this.currentMenuState === "volume") {
        this.adjustVolume(-0.1);
      }
    });

    rightKey.on("down", () => {
      if (this.isMenuOpen && this.currentMenuState === "volume") {
        this.adjustVolume(0.1);
      }
    });

    enterKey.on("down", () => {
      if (this.isMenuOpen) {
        if (this.currentMenuState === "main") {
          const selectedEntry = MENU_ENTRIES[this.selectedMenuIndex];
          this.handleMenuSelect(selectedEntry);
        } else if (this.currentMenuState === "options") {
          const optionsEntries = ["Volume", "Back"];
          const selectedEntry = optionsEntries[this.selectedMenuIndex];
          if (selectedEntry === "Back") {
            this.currentMenuState = "main";
            this.updateMenuSelection();
          } else {
            this.handleMenuSelect(selectedEntry);
          }
        }
      }
    });
  }

  public toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.menuContainer) {
      this.menuContainer.setVisible(this.isMenuOpen);
    }

    if (this.isMenuOpen) {
      this.currentMenuState = "main";
      this.selectedMenuIndex = 0;
      this.updateMenuSelection();
      this.hideVolumeSlider();
    } else {
      this.hideVolumeSlider();
      this.currentMenuState = "main";
    }
  }

  private updateMenuSelection(): void {
    const entries =
      this.currentMenuState === "options" ? ["Volume", "Back"] : MENU_ENTRIES;

    this.menuTexts.forEach((text, index) => {
      if (index >= entries.length) {
        text.setVisible(false);
        return;
      }
      text.setVisible(true);
      const entryName = entries[index];
      if (index === this.selectedMenuIndex) {
        text.setFill("#ffffff");
        text.setBackgroundColor("#666666");
        if (!text.text.startsWith("►")) {
          text.setText("► " + entryName);
        }
      } else {
        text.setFill("#ffffff");
        text.setBackgroundColor("");
        if (text.text.startsWith("►")) {
          text.setText(entryName);
        }
      }
    });
  }

  private showOptionsMenu(): void {
    this.selectedMenuIndex = 0;
    const optionsEntries = ["Volume", "Back"];
    this.menuTexts.forEach((text, index) => {
      if (index < optionsEntries.length) {
        text.setVisible(true);
        const entryName = optionsEntries[index];
        if (index === this.selectedMenuIndex) {
          text.setFill("#ffffff");
          text.setBackgroundColor("#666666");
          text.setText("► " + entryName);
        } else {
          text.setFill("#ffffff");
          text.setBackgroundColor("");
          text.setText(entryName);
        }
      } else {
        text.setVisible(false);
      }
    });
  }

  private showVolumeSlider(): void {
    // Hide menu texts
    this.menuTexts.forEach((text) => text.setVisible(false));

    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;
    const menuWidth = 192;
    const menuX = width - menuWidth - 16;
    const menuY = 16;

    if (!this.volumeSliderContainer) {
      this.volumeSliderContainer = this.scene.add.container(menuX, menuY);
      this.volumeSliderContainer.setScrollFactor(0);
      this.volumeSliderContainer.setDepth(51);
      this.volumeSliderContainer.setVisible(false);

      const bg = this.scene.add.rectangle(
        menuWidth / 2,
        0,
        menuWidth,
        height - 32,
        0xcccccc,
        0.85
      );
      bg.setStrokeStyle(2, 0x808080);
      this.volumeSliderContainer.add(bg);

      // Volume label
      const volumeLabel = this.scene.add.text(12, 20, "Volume", {
        font: "16px monospace",
        color: "#ffffff",
        align: "left",
      });
      volumeLabel.setOrigin(0, 0);
      this.volumeSliderContainer.add(volumeLabel);

      // Slider bar
      const sliderWidth = menuWidth - 48;
      const sliderX = 24;
      const sliderY = 60;
      const sliderHeight = 8;

      this.volumeSliderBar = this.scene.add.rectangle(
        sliderX + sliderWidth / 2,
        sliderY,
        sliderWidth,
        sliderHeight,
        0x333333
      );
      this.volumeSliderBar.setStrokeStyle(1, 0x666666);
      this.volumeSliderBar.setInteractive({ useHandCursor: true });
      this.volumeSliderBar.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        this.updateSliderFromPointer(pointer.x);
      });
      this.volumeSliderContainer.add(this.volumeSliderBar);

      // Slider handle
      const handleSize = 16;
      this.volumeSliderHandle = this.scene.add.rectangle(
        sliderX,
        sliderY,
        handleSize,
        handleSize,
        0xffffff
      );
      this.volumeSliderHandle.setStrokeStyle(2, 0x666666);
      this.volumeSliderHandle.setInteractive({ useHandCursor: true });
      this.volumeSliderContainer.add(this.volumeSliderHandle);

      // Volume value text
      this.volumeSliderValue = this.scene.add.text(
        sliderX,
        sliderY + 20,
        "50%",
        {
          font: "14px monospace",
          color: "#ffffff",
          align: "left",
        }
      );
      this.volumeSliderValue.setOrigin(0, 0);
      this.volumeSliderContainer.add(this.volumeSliderValue);

      // Back instruction
      const backText = this.scene.add.text(
        12,
        height - 60,
        "Press SPACE to go back",
        {
          font: "12px monospace",
          color: "#ffffff",
          align: "left",
        }
      );
      backText.setOrigin(0, 0);
      this.volumeSliderContainer.add(backText);

      // Make handle draggable
      this.scene.input.setDraggable(this.volumeSliderHandle);
      this.volumeSliderHandle.on("drag", (pointer: Phaser.Input.Pointer) => {
        this.updateSliderFromPointer(pointer.x);
      });
    }

    // Update slider position based on current volume
    if (this.onVolumeChange) {
      const gameScene = this.scene as GameScene;
      const currentVolume = gameScene.getMusicVolume();
      this.updateSliderPosition(currentVolume);
    }

    this.volumeSliderContainer.setVisible(true);
  }

  private hideVolumeSlider(): void {
    if (this.volumeSliderContainer) {
      this.volumeSliderContainer.setVisible(false);
    }
  }

  private updateSliderPosition(volume: number): void {
    if (!this.volumeSliderBar || !this.volumeSliderHandle || !this.volumeSliderValue) {
      return;
    }

    const sliderWidth = this.volumeSliderBar.width - 16;
    const sliderX = this.volumeSliderBar.x - this.volumeSliderBar.width / 2 + 8;
    const sliderY = this.volumeSliderBar.y;

    const handleX = sliderX + volume * sliderWidth;
    this.volumeSliderHandle.x = handleX;

    const volumePercent = Math.round(volume * 100);
    this.volumeSliderValue.setText(`${volumePercent}%`);
  }

  private updateSliderFromPointer(pointerX: number): void {
    if (!this.volumeSliderBar || !this.volumeSliderHandle || !this.volumeSliderContainer) {
      return;
    }

    // Convert screen coordinates to container-local coordinates
    const containerX = this.volumeSliderContainer.x;
    const sliderWidth = this.volumeSliderBar.width - 16;
    const sliderStartX = containerX + this.volumeSliderBar.x - this.volumeSliderBar.width / 2 + 8;

    let volume = (pointerX - sliderStartX) / sliderWidth;
    volume = Math.max(0, Math.min(1, volume));

    this.updateSliderPosition(volume);

    if (this.onVolumeChange) {
      this.onVolumeChange(volume);
    }
  }

  private adjustVolume(delta: number): void {
    const gameScene = this.scene as GameScene;
    const currentVolume = gameScene.getMusicVolume();
    const newVolume = Math.max(0, Math.min(1, currentVolume + delta));
    this.updateSliderPosition(newVolume);

    if (this.onVolumeChange) {
      this.onVolumeChange(newVolume);
    }
  }

  public setOnVolumeChange(callback: (volume: number) => void): void {
    this.onVolumeChange = callback;
  }

  private handleMenuSelect(entry: string): void {
    if (entry === "Options") {
      // Switch to options submenu
      this.currentMenuState = "options";
      this.showOptionsMenu();
      return;
    }

    if (entry === "Volume") {
      // Switch to volume slider
      this.currentMenuState = "volume";
      this.showVolumeSlider();
      return;
    }

    // For other entries, close menu and show dialog
    this.isMenuOpen = false;
    if (this.menuContainer) {
      this.menuContainer.setVisible(false);
    }
    this.hideVolumeSlider();

    if (this.onMenuSelect) {
      const speaker = entry === "Red" ? undefined : entry;
      const dialogText = MENU_DIALOG_TEXTS[entry] || `${entry} selected.`;
      this.onMenuSelect(dialogText, speaker);
    }
  }

  public isOpen(): boolean {
    return this.isMenuOpen;
  }

  public setOnMenuSelect(callback: (text: string, speaker?: string) => void): void {
    this.onMenuSelect = callback;
  }
}

