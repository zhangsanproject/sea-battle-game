const FIXED_DELTA = 1 / 60;
const MAX_FRAME_DELTA = 0.1;
const MAX_FIXED_STEPS = 5;

interface GameLoopCallbacks {
  fixedUpdate: (delta: number, elapsedTime: number) => void;
  render: (frameDelta: number) => void;
}

/**
 * Runs simulation at a fixed 60 Hz while rendering at the display refresh rate.
 * The accumulator is capped so a stalled tab cannot trigger a catch-up spiral.
 */
export class GameLoop {
  private readonly callbacks: GameLoopCallbacks;
  private animationFrameId: number | null = null;
  private lastTimestamp = 0;
  private accumulator = 0;
  private elapsedTime = 0;
  private running = false;

  constructor(callbacks: GameLoopCallbacks) {
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTimestamp = performance.now();
    this.accumulator = 0;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    this.accumulator = 0;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  dispose(): void {
    this.stop();
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) {
      return;
    }

    const rawDelta = (timestamp - this.lastTimestamp) / 1000;
    const frameDelta = Number.isFinite(rawDelta)
      ? Math.min(Math.max(rawDelta, 0), MAX_FRAME_DELTA)
      : 0;

    this.lastTimestamp = timestamp;
    this.accumulator += frameDelta;

    let steps = 0;
    while (this.accumulator >= FIXED_DELTA && steps < MAX_FIXED_STEPS) {
      this.elapsedTime += FIXED_DELTA;
      this.callbacks.fixedUpdate(FIXED_DELTA, this.elapsedTime);
      this.accumulator -= FIXED_DELTA;
      steps += 1;
    }

    if (steps === MAX_FIXED_STEPS) {
      this.accumulator = 0;
    }

    this.callbacks.render(frameDelta);
    this.animationFrameId = requestAnimationFrame(this.tick);
  };
}
