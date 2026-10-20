import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerShip } from '../src/game/entities/PlayerShip';

function createMuzzleBuffer(): Vector3[] {
  return Array.from({ length: 8 }, () => new Vector3());
}

describe('PlayerShip evolution', () => {
  it('adds visible weapon geometry at configured levels without duplicates', () => {
    const player = new PlayerShip();
    const muzzles = createMuzzleBuffer();

    expect(player.evolutionStage).toBe(1);
    expect(player.getMuzzleWorldPositions(muzzles)).toBe(2);

    expect(player.applyEvolution(2)).toBe(true);
    expect(player.evolutionStage).toBe(2);
    expect(player.getMuzzleWorldPositions(muzzles)).toBe(4);

    expect(player.applyEvolution(2)).toBe(false);
    expect(player.getMuzzleWorldPositions(muzzles)).toBe(4);

    expect(player.applyEvolution(3)).toBe(true);
    expect(player.evolutionStage).toBe(3);

    expect(player.applyEvolution(4)).toBe(true);
    expect(player.evolutionStage).toBe(4);
    expect(player.getMuzzleWorldPositions(muzzles)).toBe(5);

    expect(player.applyEvolution(5)).toBe(false);
    expect(player.evolutionStage).toBe(4);

    const laterThresholds = [6, 8, 10, 13, 16, 20] as const;
    for (const [index, level] of laterThresholds.entries()) {
      expect(player.applyEvolution(level)).toBe(true);
      expect(player.evolutionStage).toBe(5 + index);
    }

    expect(player.applyEvolution(99)).toBe(false);
    expect(player.evolutionStage).toBe(10);

    player.dispose();
  });

  it('resets evolution for a new run', () => {
    const firstPlayer = new PlayerShip();
    firstPlayer.applyEvolution(20);
    expect(firstPlayer.evolutionStage).toBe(10);

    const secondPlayer = new PlayerShip();
    expect(secondPlayer.evolutionStage).toBe(1);
    expect(secondPlayer.getMuzzleWorldPositions(createMuzzleBuffer())).toBe(2);

    firstPlayer.dispose();
    secondPlayer.dispose();
  });
});
