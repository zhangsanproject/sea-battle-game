import { PerspectiveCamera, Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { createCombatStats } from '../src/game/progression/types';
import { PlayerControlSystem } from '../src/game/systems/PlayerControlSystem';
import { GAME_CONFIG } from '../src/game/config';

describe('PlayerControlSystem', () => {
  it('moves with camera-relative input and remains inside the arena', () => {
    const player = new PlayerShip();
    const camera = new PerspectiveCamera(45, 1.6, 0.1, 1000);
    camera.position.set(10, 18, 24);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const control = new PlayerControlSystem(
      player,
      camera,
      createCombatStats(),
    );
    const input = new Vector2(0, 1);
    const delta = 1 / 60;

    for (let frame = 0; frame < 60 * 12; frame += 1) {
      control.update(input, delta);
    }

    const distanceFromOrigin = Math.hypot(
      player.root.position.x,
      player.root.position.z,
    );

    expect(distanceFromOrigin).toBeLessThanOrEqual(
      GAME_CONFIG.arena.radius + 0.001,
    );
    expect(distanceFromOrigin).toBeGreaterThan(GAME_CONFIG.arena.radius - 0.5);
    expect(player.root.position.y).toBe(0);

    player.dispose();
  });

  it('uses the mutable movement-speed stat from progression', () => {
    const camera = new PerspectiveCamera(45, 1.6, 0.1, 1000);
    camera.position.set(10, 18, 24);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const defaultPlayer = new PlayerShip();
    const upgradedPlayer = new PlayerShip();
    const upgradedStats = createCombatStats();
    upgradedStats.moveSpeed = 20;

    const defaultControl = new PlayerControlSystem(
      defaultPlayer,
      camera,
      createCombatStats(),
    );
    const upgradedControl = new PlayerControlSystem(
      upgradedPlayer,
      camera,
      upgradedStats,
    );
    const input = new Vector2(0, 1);
    const delta = 1 / 60;

    for (let frame = 0; frame < 60; frame += 1) {
      defaultControl.update(input, delta);
      upgradedControl.update(input, delta);
    }

    const defaultDistance = Math.hypot(
      defaultPlayer.root.position.x,
      defaultPlayer.root.position.z,
    );
    const upgradedDistance = Math.hypot(
      upgradedPlayer.root.position.x,
      upgradedPlayer.root.position.z,
    );

    expect(upgradedDistance).toBeGreaterThan(defaultDistance * 1.5);

    defaultPlayer.dispose();
    upgradedPlayer.dispose();
  });

  it('stops accelerating when input is released', () => {
    const player = new PlayerShip();
    const camera = new PerspectiveCamera(45, 1.6, 0.1, 1000);
    camera.position.set(10, 18, 24);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const control = new PlayerControlSystem(
      player,
      camera,
      createCombatStats(),
    );
    const delta = 1 / 60;
    const input = new Vector2(0, 0);
    const forwardInput = new Vector2(0, 1);

    for (let frame = 0; frame < 60; frame += 1) {
      control.update(forwardInput, delta);
    }

    for (let frame = 0; frame < 120; frame += 1) {
      control.update(input, delta);
    }

    const stoppedPosition = player.root.position.clone();

    for (let frame = 0; frame < 60; frame += 1) {
      control.update(input, delta);
    }

    expect(
      player.root.position.distanceTo(stoppedPosition),
    ).toBeLessThan(0.01);

    player.dispose();
  });
});
