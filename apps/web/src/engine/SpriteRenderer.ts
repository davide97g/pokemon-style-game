export interface SpriteFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface SpriteAtlas {
  frames: Record<string, SpriteFrame>;
  meta: {
    image: string;
    size: { w: number; h: number };
    scale: string;
  };
}

export interface Animation {
  frames: string[];
  frameRate: number;
  repeat: boolean;
}

export class SpriteRenderer {
  private atlas: SpriteAtlas | null = null;
  private image: HTMLImageElement | null = null;
  private animations: Map<string, Animation> = new Map();

  async loadAtlas(atlasPath: string, imagePath: string): Promise<void> {
    // Load atlas JSON
    const response = await fetch(atlasPath);
    this.atlas = await response.json();

    // Load sprite sheet image
    this.image = new Image();
    await new Promise((resolve, reject) => {
      if (!this.image) return reject();
      this.image.onload = resolve;
      this.image.onerror = reject;
      this.image.src = imagePath;
    });
  }

  createAnimation(
    name: string,
    framePrefix: string,
    start: number,
    end: number,
    frameRate = 10,
    repeat = true,
  ): void {
    const frames: string[] = [];

    for (let i = start; i <= end; i++) {
      const frameName = `${framePrefix}.${String(i).padStart(3, "0")}`;
      frames.push(frameName);
    }

    this.animations.set(name, { frames, frameRate, repeat });
  }

  renderFrame(
    ctx: CanvasRenderingContext2D,
    frameName: string,
    x: number,
    y: number,
    flipX = false,
  ): void {
    if (!this.atlas || !this.image) return;

    const frame = this.atlas.frames[frameName];
    if (!frame) {
      console.warn(`Frame not found: ${frameName}`);
      return;
    }

    const { x: srcX, y: srcY, w: srcW, h: srcH } = frame.frame;

    ctx.save();

    if (flipX) {
      ctx.translate(x + srcW, y);
      ctx.scale(-1, 1);
      ctx.drawImage(this.image, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
    } else {
      ctx.drawImage(this.image, srcX, srcY, srcW, srcH, x, y, srcW, srcH);
    }

    ctx.restore();
  }

  getAnimationFrame(animationName: string, elapsedTime: number): string | null {
    const animation = this.animations.get(animationName);
    if (!animation) return null;

    const { frames, frameRate, repeat } = animation;
    const frameDuration = 1 / frameRate;
    const totalDuration = frames.length * frameDuration;

    let time = elapsedTime;
    if (repeat) {
      time = elapsedTime % totalDuration;
    } else if (elapsedTime >= totalDuration) {
      return frames[frames.length - 1];
    }

    const frameIndex = Math.floor(time / frameDuration);
    return frames[Math.min(frameIndex, frames.length - 1)];
  }

  getFrameSize(frameName: string): { width: number; height: number } | null {
    if (!this.atlas) return null;

    const frame = this.atlas.frames[frameName];
    if (!frame) return null;

    return {
      width: frame.frame.w,
      height: frame.frame.h,
    };
  }
}
