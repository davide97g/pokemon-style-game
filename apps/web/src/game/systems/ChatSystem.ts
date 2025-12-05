import Phaser from "phaser";
import { STATUE_GREETING } from "../config/ChatConfig";
import {
  CHAT_MAX_MESSAGES,
  CHAT_WIDTH,
  STATUE_PROXIMITY_DISTANCE,
} from "../config/GameConstants";
import { gameEventBus } from "../utils/GameEventBus";

interface ChatMessage {
  container: Phaser.GameObjects.Container;
  sender: string;
  text: string;
}

export class ChatSystem {
  private scene: Phaser.Scene;
  private oldStatuePosition: { x: number; y: number } | null = null;
  private isNearStatue = false;
  private chatIconContainer: Phaser.GameObjects.Container | null = null;
  private chatDialogueContainer: Phaser.GameObjects.Container | null = null;
  private chatMessages: ChatMessage[] = [];
  private chatInputText = "";
  private chatInputField: Phaser.GameObjects.Text | null = null;
  private isChatOpen = false;
  private chatMessageContainer: Phaser.GameObjects.Container | null = null;
  private playerPosition?: { x: number; y: number };
  private canOpenChatCheck?: () => boolean;
  private isLoadingResponse = false;
  private loadingIndicator: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public setStatuePosition(position: { x: number; y: number }): void {
    this.oldStatuePosition = position;
  }

  public initChat(): void {
    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    this.chatIconContainer = this.scene.add.container(
      width - 100,
      height - 100,
    );
    this.chatIconContainer.setScrollFactor(0);
    this.chatIconContainer.setDepth(60);
    this.chatIconContainer.setVisible(false);

    const bg = this.scene.add.rectangle(0, 0, 80, 80, 0x333333, 0.9);
    bg.setStrokeStyle(2, 0x666666);
    this.chatIconContainer.add(bg);

    const chatIcon = this.scene.add.graphics();
    chatIcon.lineStyle(3, 0xffffff, 1);
    chatIcon.strokeRect(-20, -20, 40, 30);
    chatIcon.beginPath();
    chatIcon.moveTo(20, 10);
    chatIcon.lineTo(30, 20);
    chatIcon.lineTo(20, 20);
    chatIcon.closePath();
    chatIcon.strokePath();
    chatIcon.lineStyle(2, 0xffffff, 1);
    chatIcon.moveTo(-15, -5);
    chatIcon.lineTo(15, -5);
    chatIcon.moveTo(-15, 0);
    chatIcon.lineTo(10, 0);
    chatIcon.moveTo(-15, 5);
    chatIcon.lineTo(12, 5);
    chatIcon.strokePath();
    this.chatIconContainer.add(chatIcon);

    const pressCText = this.scene.add.text(0, 35, "Press C", {
      font: "12px monospace",
      color: "#ffffff",
      align: "center",
    });
    pressCText.setOrigin(0.5);
    this.chatIconContainer.add(pressCText);

    const chatHeight = height - 200;
    const chatX = width - CHAT_WIDTH - 20;
    const chatY = height - chatHeight - 20;

    this.chatDialogueContainer = this.scene.add.container(chatX, chatY);
    this.chatDialogueContainer.setScrollFactor(0);
    this.chatDialogueContainer.setDepth(60);
    this.chatDialogueContainer.setVisible(false);

    this.createChatUI(chatHeight);
    this.setupChatKeyboardControls();
    this.addChatMessage("statue", STATUE_GREETING);
    this.chatInputText = "";
  }

  private createChatUI(chatHeight: number): void {
    if (!this.chatDialogueContainer) return;

    // Main chat background
    const chatBg = this.scene.add.rectangle(
      CHAT_WIDTH / 2,
      chatHeight / 2,
      CHAT_WIDTH,
      chatHeight,
      0x2a2a2a,
      0.95,
    );
    chatBg.setStrokeStyle(3, 0x555555);
    this.chatDialogueContainer.add(chatBg);

    // Header background
    const headerBg = this.scene.add.rectangle(
      CHAT_WIDTH / 2,
      25,
      CHAT_WIDTH,
      50,
      0x3a3a3a,
      1,
    );
    headerBg.setStrokeStyle(2, 0x555555);
    this.chatDialogueContainer.add(headerBg);

    const statueIcon = this.scene.add.text(20, 25, "🗿", {
      font: "20px monospace",
      color: "#ffffff",
    });
    statueIcon.setOrigin(0, 0.5);
    this.chatDialogueContainer.add(statueIcon);

    const headerText = this.scene.add.text(50, 25, "Statue Chat", {
      font: "bold 16px monospace",
      color: "#ffffff",
    });
    headerText.setOrigin(0, 0.5);
    this.chatDialogueContainer.add(headerText);

    const closeButton = this.scene.add.text(CHAT_WIDTH - 30, 25, "×", {
      font: "bold 24px monospace",
      color: "#ffffff",
    });
    closeButton.setOrigin(0.5);
    closeButton.setInteractive({ useHandCursor: true });
    closeButton.on("pointerdown", () => {
      this.closeChat();
    });
    this.chatDialogueContainer.add(closeButton);

    // Message area
    const messageAreaTop = 50;
    const messageAreaBottom = chatHeight - 70;
    const messageAreaHeight = messageAreaBottom - messageAreaTop;
    const messageAreaCenterY = (messageAreaTop + messageAreaBottom) / 2;

    const messageAreaBg = this.scene.add.rectangle(
      CHAT_WIDTH / 2,
      messageAreaCenterY,
      CHAT_WIDTH,
      messageAreaHeight,
      0x000000,
      1,
    );
    this.chatDialogueContainer.add(messageAreaBg);

    const messageAreaStartY = messageAreaTop + 10;
    this.chatMessageContainer = this.scene.add.container(
      CHAT_WIDTH / 2,
      messageAreaStartY,
    );
    this.chatDialogueContainer.add(this.chatMessageContainer);

    // Input field
    const inputAreaY = chatHeight - 50;
    const inputPadding = 20;
    const inputWidth = CHAT_WIDTH - inputPadding * 2;

    const inputBg = this.scene.add.rectangle(
      CHAT_WIDTH / 2,
      inputAreaY,
      inputWidth,
      40,
      0x2a2a2a,
      1,
    );
    inputBg.setStrokeStyle(2, 0x555555);
    this.chatDialogueContainer.add(inputBg);

    this.chatInputField = this.scene.add.text(
      inputPadding + 10,
      inputAreaY,
      "",
      {
        font: "14px monospace",
        color: "#ffffff",
      },
    );
    this.chatInputField.setOrigin(0, 0.5);
    this.chatInputField.setInteractive({ useHandCursor: true });
    this.chatInputField.on("pointerdown", () => {
      this.isChatOpen = true;
    });
    this.chatDialogueContainer.add(this.chatInputField);

    const placeholderText = this.scene.add.text(
      inputPadding + 10,
      inputAreaY,
      "Type your message...",
      {
        font: "14px monospace",
        color: "#666666",
      },
    );
    placeholderText.setOrigin(0, 0.5);
    placeholderText.setName("placeholder");
    this.chatDialogueContainer.add(placeholderText);

    const sendButton = this.scene.add.text(
      CHAT_WIDTH - inputPadding - 50,
      inputAreaY,
      "Send",
      {
        font: "bold 14px monospace",
        color: "#4a9eff",
      },
    );
    sendButton.setOrigin(0.5);
    sendButton.setInteractive({ useHandCursor: true });
    sendButton.on("pointerdown", () => {
      this.sendChatMessage();
    });
    this.chatDialogueContainer.add(sendButton);
  }

  private setupChatKeyboardControls(): void {
    const cKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.C,
    );
    cKey?.on("down", () => {
      const canOpen = this.canOpenChatCheck ? this.canOpenChatCheck() : true;
      if (this.isNearStatue && !this.isChatOpen && canOpen) {
        this.openChat();
      }
    });

    const escKey = this.scene.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ESC,
    );
    escKey?.on("down", () => {
      if (this.isChatOpen) {
        this.closeChat();
      }
    });

    this.scene.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (!this.isChatOpen) return;

      if (event.key === "Enter") {
        this.sendChatMessage();
      } else if (event.key === "Backspace") {
        this.chatInputText = (this.chatInputText || "").slice(0, -1);
        this.updateChatInput(this.chatInputText);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        this.chatInputText = (this.chatInputText || "") + event.key;
        this.updateChatInput(this.chatInputText);
      }
    });
  }

  public checkStatueProximity(): void {
    let nearStatue = false;

    if (this.oldStatuePosition && this.playerPosition) {
      const dx = this.playerPosition.x - this.oldStatuePosition.x;
      const dy = this.playerPosition.y - this.oldStatuePosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < STATUE_PROXIMITY_DISTANCE) {
        nearStatue = true;
      }
    }

    if (this.isNearStatue !== nearStatue) {
      this.isNearStatue = nearStatue;
      this.updateChatIconVisibility();
      if (nearStatue) {
        gameEventBus.emit("chat:near-statue");
      } else {
        gameEventBus.emit("chat:not-near-statue");
      }
    }
  }

  public updatePlayerPosition(position: { x: number; y: number }): void {
    this.playerPosition = position;
  }

  private updateChatIconVisibility(): void {
    if (this.chatIconContainer) {
      const shouldShow = this.isNearStatue && !this.isChatOpen;
      this.chatIconContainer.setVisible(shouldShow);

      if (shouldShow) {
        this.scene.tweens.add({
          targets: this.chatIconContainer,
          y: this.chatIconContainer.y - 5,
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      } else {
        this.scene.tweens.killTweensOf(this.chatIconContainer);
      }
    }
  }

  public openChat(): void {
    this.isChatOpen = true;
    if (this.chatDialogueContainer) {
      this.chatDialogueContainer.setVisible(true);
    }
    if (this.chatIconContainer) {
      this.chatIconContainer.setVisible(false);
    }
    gameEventBus.emit("chat:open");

    const placeholder = this.chatDialogueContainer?.list.find(
      (child) => child.name === "placeholder",
    );
    if (placeholder && "setVisible" in placeholder) {
      (
        placeholder as Phaser.GameObjects.GameObject & {
          setVisible: (visible: boolean) => void;
        }
      ).setVisible(false);
    }
  }

  public closeChat(): void {
    this.isChatOpen = false;
    if (this.chatDialogueContainer) {
      this.chatDialogueContainer.setVisible(false);
    }
    this.updateChatIconVisibility();

    this.chatInputText = "";
    this.updateChatInput("");
    gameEventBus.emit("chat:close");
  }

  private updateChatInput(text: string): void {
    this.chatInputText = text;
    if (this.chatInputField) {
      this.chatInputField.setText(text || "");
    }

    const placeholder = this.chatDialogueContainer?.list.find(
      (child) => child.name === "placeholder",
    );
    if (placeholder && "setVisible" in placeholder) {
      (
        placeholder as Phaser.GameObjects.GameObject & {
          setVisible: (visible: boolean) => void;
        }
      ).setVisible(text.length === 0);
    }
  }

  private async sendChatMessage(): Promise<void> {
    if (!this.chatInputText || this.chatInputText.trim().length === 0) return;
    if (this.isLoadingResponse) return;

    const message = this.chatInputText.trim();
    this.addChatMessage("player", message);
    this.updateChatInput("");
    this.isLoadingResponse = true;
    this.showLoadingIndicator();

    // Simulate a response (server integration disabled)
    setTimeout(() => {
      this.hideLoadingIndicator();
      this.addChatMessage(
        "statue",
        "I'm currently offline. Chat functionality will be available when the server is connected.",
      );
      this.isLoadingResponse = false;
    }, 500);
  }

  private showLoadingIndicator(): void {
    if (!this.chatMessageContainer) return;

    const messageY = this.chatMessages.length * 60 + 20;
    this.loadingIndicator = this.scene.add.text(0, messageY, "🗿 Typing...", {
      font: "12px monospace",
      color: "#888888",
    });
    this.loadingIndicator.setOrigin(0, 0.5);
    this.chatMessageContainer.add(this.loadingIndicator);
  }

  private hideLoadingIndicator(): void {
    if (this.loadingIndicator) {
      this.loadingIndicator.destroy();
      this.loadingIndicator = null;
    }
  }

  private addChatMessage(sender: string, text: string): void {
    if (!this.chatMessageContainer) return;

    const messageY = this.chatMessages.length * 60 + 20;
    const messageContainer = this.scene.add.container(0, messageY);

    const isPlayer = sender === "player";
    const bgColor = isPlayer ? 0x4a9eff : 0x2a2a2a;
    const textColor = "#ffffff";

    const messagePadding = 20;
    const maxMessageWidth = CHAT_WIDTH - messagePadding * 2;

    const tempText = this.scene.add.text(0, 0, text, {
      font: "12px monospace",
      wordWrap: { width: maxMessageWidth - 20 },
    });
    tempText.setVisible(false);
    const textWidth = Math.min(tempText.width + 20, maxMessageWidth);
    tempText.destroy();

    const xPos = isPlayer
      ? CHAT_WIDTH / 2 - messagePadding
      : -CHAT_WIDTH / 2 + messagePadding;

    const messageBg = this.scene.add.graphics();
    messageBg.fillStyle(bgColor, 1);
    const bgX = isPlayer ? xPos - textWidth : xPos;
    const bgY = 0;
    messageBg.fillRoundedRect(bgX, bgY - 20, textWidth, 40, 8);
    messageContainer.add(messageBg);

    const messageText = this.scene.add.text(
      xPos + (isPlayer ? -10 : 10),
      0,
      text,
      {
        font: "12px monospace",
        color: textColor,
        wordWrap: { width: maxMessageWidth - 20 },
      },
    );
    messageText.setOrigin(isPlayer ? 1 : 0, 0.5);
    messageContainer.add(messageText);

    this.chatMessageContainer.add(messageContainer);
    this.chatMessages.push({ container: messageContainer, sender, text });

    if (this.chatMessages.length > CHAT_MAX_MESSAGES) {
      const toRemove = this.chatMessages.shift();
      if (toRemove) {
        toRemove.container.destroy();

        this.chatMessages.forEach((msg, index) => {
          msg.container.y = index * 60 + 20;
        });
      }
    }
  }

  public isOpen(): boolean {
    return this.isChatOpen;
  }

  public shouldBlockInput(): boolean {
    return this.isChatOpen;
  }

  public setCanOpenChatCheck(checkFn: () => boolean): void {
    this.canOpenChatCheck = checkFn;
  }

  public getChatBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    if (!this.chatDialogueContainer) return null;
    return {
      x: this.chatDialogueContainer.x,
      y: this.chatDialogueContainer.y,
      width: CHAT_WIDTH,
      height: this.scene.cameras.main.height - 200,
    };
  }

  public getCanOpenChatCheck(): (() => boolean) | undefined {
    return this.canOpenChatCheck;
  }

  public getIsNearStatue(): boolean {
    return this.isNearStatue;
  }
}
