import type { SoundPlayer } from './SoundPlayer';
import type { KeyValueStorage } from '../platform/PlatformAdapter';

const MASTER_VOLUME = 0.32;
const SOUND_PREFERENCE_KEY = 'sea-battle:sound-enabled';

export type AudioContextFactory = () => AudioContext | null;

/**
 * Small procedural sound layer. No external audio files are loaded.
 * The AudioContext is created lazily and resumed on user interaction.
 * A host without WebAudio (for example a mini-game runtime) can return null
 * from the factory, which turns the manager into a silent implementation.
 */
export class SoundManager implements SoundPlayer {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private disposed = false;
  private readonly storage: KeyValueStorage | null;
  private readonly contextFactory: AudioContextFactory | null;

  constructor(
    storage?: KeyValueStorage,
    contextFactory?: AudioContextFactory,
  ) {
    this.storage = storage ?? null;
    this.contextFactory = contextFactory ?? null;

    if (this.storage?.getItem(SOUND_PREFERENCE_KEY) === 'off') {
      this.enabled = false;
    }

    if (typeof window === 'undefined') {
      return;
    }

    if (typeof window.addEventListener === 'function') {
      try {
        window.addEventListener('pointerdown', this.handleUserInteraction);
        window.addEventListener('keydown', this.handleUserInteraction);
      } catch {
        // Host runtimes (Douyin helium) expose a window shim whose native
        // methods throw "Illegal invocation"; audio unlock is optional.
      }
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;

    if (this.enabled) {
      const context = this.ensureContext();
      if (context && context.state === 'suspended') {
        void context.resume().catch(() => {});
      }
    }

    if (this.masterGain) {
      this.masterGain.gain.value = this.enabled ? MASTER_VOLUME : 0;
    }

    if (!this.enabled) {
      const context = this.context;
      if (context && context.state === 'running') {
        void context.suspend().catch(() => {});
      }
    }

    this.storage?.setItem(
      SOUND_PREFERENCE_KEY,
      this.enabled ? 'on' : 'off',
    );

    return this.enabled;
  }

  playCannon(): void {
    const context = this.ensurePlayableContext();
    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(155, now);
    oscillator.frequency.exponentialRampToValueAtTime(52, now + 0.13);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  }

  playSecondary(): void {
    const context = this.ensurePlayableContext();
    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(240, now);
    oscillator.frequency.exponentialRampToValueAtTime(120, now + 0.05);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.08);
  }

  playTorpedo(): void {
    const context = this.ensurePlayableContext();
    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(90, now);
    oscillator.frequency.exponentialRampToValueAtTime(35, now + 0.3);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.36);
  }

  playMissile(): void {
    const context = this.ensurePlayableContext();
    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(320, now);
    oscillator.frequency.exponentialRampToValueAtTime(860, now + 0.18);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.26);
  }

  playHit(): void {
    const context = this.ensurePlayableContext();
    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(330, now);
    oscillator.frequency.exponentialRampToValueAtTime(180, now + 0.06);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.09);
  }

  playExplosion(): void {
    const context = this.ensurePlayableContext();
    if (!context || !this.masterGain || !this.noiseBuffer) {
      return;
    }

    const now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.4);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.stop(now + 0.48);
  }

  playDamage(): void {
    const context = this.ensurePlayableContext();
    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(120, now);
    oscillator.frequency.exponentialRampToValueAtTime(48, now + 0.22);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.28);
  }

  playLevelUp(): void {
    const context = this.ensurePlayableContext();
    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;
    const notes = [440, 554, 659];

    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + index * 0.09;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.34);

      oscillator.connect(gain);
      gain.connect(this.masterGain as GainNode);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.36);
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      try {
        window.removeEventListener(
          'pointerdown',
          this.handleUserInteraction,
        );
        window.removeEventListener('keydown', this.handleUserInteraction);
      } catch {
        // See the note in the constructor.
      }
    }

    const context = this.context;
    this.context = null;
    this.masterGain = null;
    this.noiseBuffer = null;

    if (context) {
      void context.close().catch(() => {});
    }
  }

  private readonly handleUserInteraction = (): void => {
    if (!this.enabled) {
      return;
    }

    const context = this.ensureContext();
    if (context && context.state === 'suspended') {
      void context.resume().catch(() => {});
    }
  };

  private ensurePlayableContext(): AudioContext | null {
    if (this.disposed || !this.enabled) {
      return null;
    }

    const context = this.ensureContext();
    if (!context) {
      return null;
    }

    if (context.state === 'suspended') {
      void context.resume().catch(() => {});
    }

    return context;
  }

  private ensureContext(): AudioContext | null {
    if (this.disposed) {
      return null;
    }

    if (!this.context) {
      const context = this.contextFactory
        ? this.contextFactory()
        : typeof window !== 'undefined' && window.AudioContext
          ? new window.AudioContext()
          : null;

      if (
        !context ||
        typeof context.createGain !== 'function' ||
        typeof context.createOscillator !== 'function'
      ) {
        return null;
      }

      try {
        this.masterGain = context.createGain();
        this.masterGain.gain.value = this.enabled ? MASTER_VOLUME : 0;
        this.masterGain.connect(context.destination);
        this.noiseBuffer = this.createNoiseBuffer(context);
        this.context = context;
      } catch {
        this.context = null;
        this.masterGain = null;
        this.noiseBuffer = null;
        return null;
      }
    }

    return this.context;
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const frameCount = Math.floor(context.sampleRate * 0.5);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }

    return buffer;
  }
}
