/**
 * Audio System - Handles music and sound effects
 */

import Phaser from "phaser";
import {
  DEFAULT_MUSIC_VOLUME,
  SOUND_EFFECT_VOLUME,
} from "../config/GameConstants";

export class AudioSystem {
  private scene: Phaser.Scene;
  private mainThemeMusic?: Phaser.Sound.WebAudioSound;
  private isMusicPlaying = false;
  private musicVolume = DEFAULT_MUSIC_VOLUME;
  private audioContextCheckInterval?: number;
  private isMuted = false;
  private volumeIconContainer?: Phaser.GameObjects.Container;
  private volumeIconGraphics?: Phaser.GameObjects.Graphics;

  // Sound effects
  private hitSound?: Phaser.Sound.BaseSound;
  private destroySound?: Phaser.Sound.BaseSound;
  private introSound?: Phaser.Sound.BaseSound;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public init(): void {
    // Load volume from localStorage if available
    const savedVolume = localStorage.getItem("musicVolume");
    if (savedVolume !== null) {
      this.musicVolume = parseFloat(savedVolume);
    }

    // Load mute state from localStorage
    const savedMuted = localStorage.getItem("musicMuted");
    if (savedMuted === "true") {
      this.isMuted = true;
    }

    // Create music instance using Web Audio API for background playback
    // Start with volume 0 if muted, otherwise use saved volume
    const initialVolume = this.isMuted ? 0 : this.musicVolume;
    this.mainThemeMusic = this.scene.sound.add("mainTheme", {
      loop: true,
      volume: initialVolume,
    }) as Phaser.Sound.WebAudioSound;

    // Ensure Web Audio context stays active
    try {
      const soundManager = this.scene
        .sound as Phaser.Sound.WebAudioSoundManager;
      if (soundManager?.context && soundManager.context.state === "suspended") {
        soundManager.context.resume();
      }
    } catch (error) {
      console.error("Error resuming audio context:", error);
    }

    // Initialize sound effects
    this.hitSound = this.scene.sound.add("hit", {
      volume: SOUND_EFFECT_VOLUME,
    });
    this.destroySound = this.scene.sound.add("destroy", {
      volume: SOUND_EFFECT_VOLUME,
    });
    this.introSound = this.scene.sound.add("intro", {
      volume: SOUND_EFFECT_VOLUME,
    });

    // Play intro sound when game loads
    this.introSound?.play();
  }

  public startMusic(): void {
    if (this.mainThemeMusic && !this.isMusicPlaying) {
      this.mainThemeMusic.play();
      this.isMusicPlaying = true;
    }
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume)); // Clamp between 0 and 1
    if (this.mainThemeMusic) {
      // Only set volume if not muted
      if (!this.isMuted) {
        this.mainThemeMusic.setVolume(this.musicVolume);
      }
    }
    // Save to localStorage
    localStorage.setItem("musicVolume", this.musicVolume.toString());
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public toggleMute(): void {
    this.isMuted = !this.isMuted;
    if (this.mainThemeMusic) {
      if (this.isMuted) {
        this.mainThemeMusic.setVolume(0);
      } else {
        this.mainThemeMusic.setVolume(this.musicVolume);
      }
    }
    // Save mute state to localStorage
    localStorage.setItem("musicMuted", this.isMuted.toString());
  }

  public isMutedState(): boolean {
    return this.isMuted;
  }

  public createVolumeToggleIcon(): void {
    const iconSize = 40;
    const padding = 16;
    const x = padding + iconSize / 2;
    const y = padding + iconSize / 2;

    this.volumeIconContainer = this.scene.add.container(x, y);
    this.volumeIconContainer.setScrollFactor(0);
    this.volumeIconContainer.setDepth(100);
    this.volumeIconContainer.setInteractive(
      new Phaser.Geom.Rectangle(
        -iconSize / 2,
        -iconSize / 2,
        iconSize,
        iconSize,
      ),
      Phaser.Geom.Rectangle.Contains,
    );
    this.volumeIconContainer.setInteractive({ useHandCursor: true });

    // Background
    const bg = this.scene.add.rectangle(
      0,
      0,
      iconSize,
      iconSize,
      0x333333,
      0.9,
    );
    bg.setStrokeStyle(2, 0x666666);
    this.volumeIconContainer.add(bg);

    // Volume icon graphics
    this.volumeIconGraphics = this.scene.add.graphics();
    this.volumeIconContainer.add(this.volumeIconGraphics);

    // Mute state is already loaded in init, just update the icon
    if (this.isMuted && this.mainThemeMusic) {
      this.mainThemeMusic.setVolume(0);
    }

    this.updateVolumeIcon();

    // Click handler
    this.volumeIconContainer.on("pointerdown", () => {
      this.toggleMute();
    });

    // Hover effect
    this.volumeIconContainer.on("pointerover", () => {
      bg.setFillStyle(0x444444, 0.9);
    });

    this.volumeIconContainer.on("pointerout", () => {
      bg.setFillStyle(0x333333, 0.9);
    });
  }

  private updateVolumeIcon(): void {
    if (!this.volumeIconGraphics) return;

    this.volumeIconGraphics.clear();

    const iconSize = 24;
    const centerX = 0;
    const centerY = 0;

    if (this.isMuted) {
      // Muted icon: speaker with X
      this.volumeIconGraphics.lineStyle(3, 0xffffff, 1);

      // Speaker base
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX - iconSize / 3,
        centerY - iconSize / 4,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 2,
        centerY - iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 2,
        centerY + iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 3,
        centerY + iconSize / 4,
      );
      this.volumeIconGraphics.closePath();
      this.volumeIconGraphics.strokePath();

      // Speaker cone
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX - iconSize / 3,
        centerY - iconSize / 4,
      );
      this.volumeIconGraphics.lineTo(centerX, centerY - iconSize / 3);
      this.volumeIconGraphics.lineTo(centerX, centerY + iconSize / 3);
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 3,
        centerY + iconSize / 4,
      );
      this.volumeIconGraphics.closePath();
      this.volumeIconGraphics.strokePath();

      // X mark
      this.volumeIconGraphics.lineStyle(3, 0xff6666, 1);
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX + iconSize / 6,
        centerY - iconSize / 6,
      );
      this.volumeIconGraphics.lineTo(
        centerX + iconSize / 2,
        centerY - iconSize / 2,
      );
      this.volumeIconGraphics.moveTo(
        centerX + iconSize / 6,
        centerY + iconSize / 6,
      );
      this.volumeIconGraphics.lineTo(
        centerX + iconSize / 2,
        centerY + iconSize / 2,
      );
      this.volumeIconGraphics.moveTo(
        centerX + iconSize / 2,
        centerY - iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX + iconSize / 6,
        centerY + iconSize / 6,
      );
      this.volumeIconGraphics.moveTo(
        centerX + iconSize / 2,
        centerY + iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX + iconSize / 6,
        centerY - iconSize / 6,
      );
      this.volumeIconGraphics.strokePath();
    } else {
      // Unmuted icon: speaker with sound waves
      this.volumeIconGraphics.lineStyle(3, 0xffffff, 1);

      // Speaker base
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX - iconSize / 3,
        centerY - iconSize / 4,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 2,
        centerY - iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 2,
        centerY + iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 3,
        centerY + iconSize / 4,
      );
      this.volumeIconGraphics.closePath();
      this.volumeIconGraphics.strokePath();

      // Speaker cone
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX - iconSize / 3,
        centerY - iconSize / 4,
      );
      this.volumeIconGraphics.lineTo(centerX, centerY - iconSize / 3);
      this.volumeIconGraphics.lineTo(centerX, centerY + iconSize / 3);
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 3,
        centerY + iconSize / 4,
      );
      this.volumeIconGraphics.closePath();
      this.volumeIconGraphics.strokePath();

      // Sound waves
      this.volumeIconGraphics.lineStyle(2, 0xffffff, 1);
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.arc(
        centerX,
        centerY,
        iconSize / 4,
        -Math.PI / 4,
        Math.PI / 4,
        false,
      );
      this.volumeIconGraphics.strokePath();
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.arc(
        centerX,
        centerY,
        iconSize / 2.5,
        -Math.PI / 3,
        Math.PI / 3,
        false,
      );
      this.volumeIconGraphics.strokePath();
    }
  }

  public setupBackgroundAudio(): void {
    // Keep Web Audio context active (like YouTube does)
    const keepAudioContextActive = () => {
      try {
        const soundManager = this.scene
          .sound as Phaser.Sound.WebAudioSoundManager;
        if (
          soundManager?.context &&
          soundManager.context.state === "suspended"
        ) {
          soundManager.context.resume();
        }
      } catch (error) {
        console.error("Error keeping audio context active:", error);
      }
    };

    // Handle visibility changes
    document.addEventListener("visibilitychange", () => {
      keepAudioContextActive();
      if (!document.hidden && this.mainThemeMusic && !this.isMusicPlaying) {
        this.startMusic();
      }
    });

    // Handle window focus/blur events (for switching between windows)
    window.addEventListener("blur", () => {
      // Keep audio context active even when window loses focus
      keepAudioContextActive();
      if (this.mainThemeMusic && this.isMusicPlaying) {
        // Ensure music continues playing
        if (this.mainThemeMusic.isPaused) {
          this.mainThemeMusic.resume();
        }
      }
    });

    window.addEventListener("focus", () => {
      keepAudioContextActive();
      if (this.mainThemeMusic && !this.isMusicPlaying) {
        this.startMusic();
      }
    });

    // Prevent audio from being paused by browser
    if (this.mainThemeMusic) {
      this.scene.sound.on("pauseall", () => {
        keepAudioContextActive();
        if (this.mainThemeMusic && this.isMusicPlaying) {
          this.mainThemeMusic.resume();
        }
      });
    }

    // Periodically check and resume audio context (like YouTube does)
    this.audioContextCheckInterval = window.setInterval(() => {
      keepAudioContextActive();
      if (
        this.mainThemeMusic &&
        this.isMusicPlaying &&
        this.mainThemeMusic.isPaused
      ) {
        this.mainThemeMusic.resume();
      }
    }, 1000); // Check every second
  }

  public playHitSound(): void {
    this.hitSound?.play();
  }

  public playDestroySound(): void {
    this.destroySound?.play();
  }

  public shutdown(): void {
    // Stop music
    if (this.mainThemeMusic?.isPlaying) {
      this.mainThemeMusic.stop();
    }

    // Clean up audio context check interval
    if (this.audioContextCheckInterval !== undefined) {
      clearInterval(this.audioContextCheckInterval);
    }
  }

  public getMusicVolumeForSave(): number {
    return this.musicVolume;
  }

  public getMutedStateForSave(): boolean {
    return this.isMuted;
  }

  public loadMusicSettings(volume?: number, muted?: boolean): void {
    if (volume !== undefined) {
      this.musicVolume = volume;
      this.setMusicVolume(volume);
    }
    if (muted !== undefined) {
      this.isMuted = muted;
      if (this.mainThemeMusic) {
        if (this.isMuted) {
          this.mainThemeMusic.setVolume(0);
        } else {
          this.mainThemeMusic.setVolume(this.musicVolume);
        }
      }
      this.updateVolumeIcon();
    }
  }
}
