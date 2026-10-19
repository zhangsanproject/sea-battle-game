import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { PickupSystem } from '../src/game/systems/PickupSystem';

describe('PickupSystem', () => {
  it('spawns, attracts, and collects a resource orb', () => {
    const player = new PlayerShip();
    let collected = 0;
    const pickups = new PickupSystem((value) => {
      collected += value;
    });

    pickups.spawn(new Vector3(2, 0, 0), 6);
    expect(pickups.getActiveCount()).toBe(1);

    for (let frame = 0; frame < 120; frame += 1) {
      pickups.update(1 / 60, frame / 60, player);
    }

    expect(collected).toBe(6);
    expect(pickups.getActiveCount()).toBe(0);

    pickups.dispose();
    player.dispose();
  });

  it('leaves distant orbs active until the player approaches', () => {
    const player = new PlayerShip();
    let collected = 0;
    const pickups = new PickupSystem((value) => {
      collected += value;
    });

    pickups.spawn(new Vector3(20, 0, 20), 10);

    for (let frame = 0; frame < 60; frame += 1) {
      pickups.update(1 / 60, frame / 60, player);
    }

    expect(collected).toBe(0);
    expect(pickups.getActiveCount()).toBe(1);

    pickups.clear();
    expect(pickups.getActiveCount()).toBe(0);

    pickups.dispose();
    player.dispose();
  });
});
