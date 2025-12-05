import type Phaser from "phaser";
import { DIALOG_TYPING_SPEED } from "../config/GameConstants";
import { gameEventBus } from "../utils/GameEventBus";
import { splitTextIntoLines } from "../utils/TextUtils";

export class DialogSystem {
  private scene: Phaser.Scene;
  private isDialogVisible = false;
  private dialogContainer: Phaser.GameObjects.Container | null = null;
  private dialogText: Phaser.GameObjects.Text | null = null;
  private dialogIndicator: Phaser.GameObjects.Text | null = null;
  private dialogLines: string[] = [];
  private currentDialogLineIndex = 0;
  private currentDialogCharIndex = 0;
  private dialogTypingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.initDialog();
  }

  private initDialog(): void {
    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;
    const dialogWidth = width - 64;
    const dialogHeight = 100;
    const dialogX = 32;
    const dialogY = height - dialogHeight - 32;

    this.dialogContainer = this.scene.add.container(dialogX, dialogY);
    this.dialogContainer.setScrollFactor(0);
    this.dialogContainer.setDepth(50);
    this.dialogContainer.setVisible(false);

    const bg = this.scene.add.rectangle(
      dialogWidth / 2,
      dialogHeight / 2,
      dialogWidth,
      dialogHeight,
      0xadd8e6,
      1,
    );
    bg.setStrokeStyle(4, 0x4169e1);
    this.dialogContainer.add(bg);

    this.dialogText = this.scene.add.text(16, 16, "", {
      font: "16px monospace",
      color: "#000000",
      align: "left",
      wordWrap: { width: dialogWidth - 80 },
    });
    this.dialogText.setOrigin(0, 0);
    this.dialogContainer.add(this.dialogText);

    this.dialogIndicator = this.scene.add.text(
      dialogWidth - 40,
      dialogHeight - 30,
      "->",
      {
        font: "20px monospace",
        color: "#000000",
        align: "right",
      },
    );
    this.dialogIndicator.setOrigin(0.5, 0.5);
    this.dialogIndicator.setVisible(false);
    this.dialogContainer.add(this.dialogIndicator);
  }

  public showDialog(text: string, speaker?: string): void {
    // Emit event for UI
    gameEventBus.emit("dialog:show", { text, speaker });
    if (this.dialogTypingTimer) {
      clearTimeout(this.dialogTypingTimer);
      this.dialogTypingTimer = null;
    }

    this.isDialogVisible = true;
    const fullText = speaker ? `${speaker}: ${text}` : text;

    const dialogWidth = this.scene.cameras.main.width - 64;
    const maxTextWidth = dialogWidth - 80;
    this.dialogLines = splitTextIntoLines(this.scene, fullText, maxTextWidth);

    this.currentDialogLineIndex = 0;
    this.currentDialogCharIndex = 0;
    if (this.dialogText) {
      this.dialogText.setText("");
    }
    if (this.dialogIndicator) {
      this.dialogIndicator.setVisible(false);
    }
    if (this.dialogContainer) {
      this.dialogContainer.setVisible(true);
    }

    this.typeDialogText();

    if (this.dialogIndicator) {
      this.scene.tweens.killTweensOf(this.dialogIndicator);
    }
  }

  private typeDialogText(): void {
    if (this.currentDialogLineIndex >= this.dialogLines.length) {
      if (this.dialogIndicator) {
        this.dialogIndicator.setVisible(false);
      }
      return;
    }

    const currentLine = this.dialogLines[this.currentDialogLineIndex];

    if (this.currentDialogCharIndex < currentLine.length) {
      const textToShow = currentLine.substring(
        0,
        this.currentDialogCharIndex + 1,
      );
      if (this.dialogText) {
        this.dialogText.setText(textToShow);
      }
      this.currentDialogCharIndex++;

      this.dialogTypingTimer = setTimeout(() => {
        this.typeDialogText();
      }, DIALOG_TYPING_SPEED);
    } else {
      if (this.currentDialogLineIndex < this.dialogLines.length - 1) {
        if (this.dialogIndicator) {
          this.dialogIndicator.setVisible(true);
          this.scene.tweens.killTweensOf(this.dialogIndicator);
          const dialogHeight = 100;
          const originalY = dialogHeight - 30;
          this.dialogIndicator.y = originalY;
          this.scene.tweens.add({
            targets: this.dialogIndicator,
            y: originalY - 5,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
        }
      } else {
        if (this.dialogIndicator) {
          this.dialogIndicator.setVisible(false);
        }
      }
    }
  }

  public handleAdvance(): void {
    if (
      this.currentDialogCharIndex <
      this.dialogLines[this.currentDialogLineIndex].length
    ) {
      if (this.dialogTypingTimer) {
        clearTimeout(this.dialogTypingTimer);
        this.dialogTypingTimer = null;
      }
      if (this.dialogText) {
        this.dialogText.setText(this.dialogLines[this.currentDialogLineIndex]);
      }
      this.currentDialogCharIndex =
        this.dialogLines[this.currentDialogLineIndex].length;

      if (this.currentDialogLineIndex < this.dialogLines.length - 1) {
        if (this.dialogIndicator) {
          this.dialogIndicator.setVisible(true);
          this.scene.tweens.killTweensOf(this.dialogIndicator);
          const dialogHeight = 100;
          const originalY = dialogHeight - 30;
          this.dialogIndicator.y = originalY;
          this.scene.tweens.add({
            targets: this.dialogIndicator,
            y: originalY - 5,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
        }
      } else {
        if (this.dialogIndicator) {
          this.dialogIndicator.setVisible(false);
        }
      }
      return;
    }

    if (this.currentDialogLineIndex < this.dialogLines.length - 1) {
      this.currentDialogLineIndex++;
      this.currentDialogCharIndex = 0;
      if (this.dialogText) {
        this.dialogText.setText("");
      }
      if (this.dialogIndicator) {
        this.dialogIndicator.setVisible(false);
      }
      if (this.dialogIndicator) {
        this.scene.tweens.killTweensOf(this.dialogIndicator);
      }
      this.typeDialogText();
    } else {
      this.closeDialog();
    }
  }

  private closeDialog(): void {
    if (this.dialogTypingTimer) {
      clearTimeout(this.dialogTypingTimer);
      this.dialogTypingTimer = null;
    }

    if (this.dialogIndicator) {
      this.scene.tweens.killTweensOf(this.dialogIndicator);
    }

    this.isDialogVisible = false;
    if (this.dialogContainer) {
      this.dialogContainer.setVisible(false);
    }
    this.dialogLines = [];
    this.currentDialogLineIndex = 0;
    this.currentDialogCharIndex = 0;
    if (this.dialogIndicator) {
      this.dialogIndicator.setVisible(false);
    }
    // Emit event for UI
    gameEventBus.emit("dialog:hide");
  }

  public isVisible(): boolean {
    return this.isDialogVisible;
  }
}
