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
  private simulationPaused = false;

  constructor(callbacks: GameLoopCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Freezes the simulation while keeping the render pass alive, so an overlay
   * (pause panel, compliance notice) can still be drawn on top of the scene.
   */
  setPaused(paused: boolean): void {
    if (this.simulationPaused === paused) {
      return;
    }

    this.simulationPaused = paused;
    this.accumulator = 0;

    if (!paused) {
      // The host may have paused for minutes; never replay that gap.
      this.lastTimestamp = performance.now();
    }
  }

  get isPaused(): boolean {
    return this.simulationPaused;
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
    if (!this.simulationPaused) {
      while (this.accumulator >= FIXED_DELTA && steps < MAX_FIXED_STEPS) {
        this.elapsedTime += FIXED_DELTA;
        this.callbacks.fixedUpdate(FIXED_DELTA, this.elapsedTime);
        this.accumulator -= FIXED_DELTA;
        steps += 1;
      }

      if (steps === MAX_FIXED_STEPS) {
        this.accumulator = 0;
      }
    } else {
      this.accumulator = 0;
    }

    this.callbacks.render(frameDelta);
    this.animationFrameId = requestAnimationFrame(this.tick);
  };
}
