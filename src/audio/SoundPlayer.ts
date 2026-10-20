export interface SoundPlayer {
  readonly isEnabled: boolean;
  toggle(): boolean;
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
