export interface SoundPlayer {
  readonly isEnabled: boolean;
  toggle(): boolean;
  /**
   * Creates (or resumes) the audio context. Hosts without a DOM cannot listen
   * for the browser's pointerdown unlock, so the mini-game runtime calls this
   * from its own first touch event.
   */
  unlock(): void;
  playCannon(): void;
  playSecondary(): void;
  playTorpedo(): void;
  playMissile(): void;
  playHit(): void;
  playExplosion(): void;
  playDamage(): void;
  playLevelUp(): void;
  dispose(): void;
}
