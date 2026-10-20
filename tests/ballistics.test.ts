import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerShip } from '../src/game/entities/PlayerShip';
import { EnemyManager } from '../src/game/systems/EnemyManager';
import {
  ProjectileSystem,
  solveBallisticVelocity,
} from '../src/game/systems/ProjectileSystem';

function createSystem() {
  const player = new PlayerShip();
  const enemies = new EnemyManager();
  const projectiles = new ProjectileSystem({
    enemies,
    player,
    onEnemyKilled: () => {},
    onPlayerHit: () => {},
  });

  return { player, enemies, projectiles };
}

function disposeAll(parts: ReturnType<typeof createSystem>): void {
  parts.projectiles.dispose();
  parts.enemies.dispose();
  parts.player.dispose();
}

function trailColors(projectiles: ProjectileSystem): Float32Array {
  const line = projectiles.root.getObjectByName('ProjectileTrails');
  if (!line) {
    throw new Error('Expected the trail batch');
  }
  const attribute = (line as THREE.LineSegments).geometry.getAttribute(
    'color',
  );
  return attribute.array as Float32Array;
}

describe('ballistic shells', () => {
  it('solves a low arc that actually passes through the target', () => {
    const origin = new THREE.Vector3(0, 1.4, 0);
    const target = new THREE.Vector3(0, 1.4, 26);
    const velocity = new THREE.Vector3();

    expect(solveBallisticVelocity(origin, target, 38, 14, velocity)).toBe(true);
    // A flat shot at a level target still needs a slight upward tilt.
    expect(velocity.y).toBeGreaterThan(0);
    expect(velocity.length()).toBeCloseTo(38, 4);

    // Integrate the same way the game does and check the flight path.
    const position = origin.clone();
    const step = velocity.clone();
    const dt = 1 / 240;

    for (let frame = 0; frame < 4000; frame += 1) {
      step.y -= 14 * dt;
      position.addScaledVector(step, dt);
      if (position.z >= target.z) {
        break;
      }
    }

    expect(position.z).toBeGreaterThanOrEqual(target.z);
    expect(Math.abs(position.y - target.y)).toBeLessThan(0.25);
  });

  it('reports targets that the shell cannot reach at that speed', () => {
    const velocity = new THREE.Vector3();

    expect(
      solveBallisticVelocity(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 200),
        10,
        14,
        velocity,
      ),
    ).toBe(false);
  });

  it('falls back to a straight line when gravity is off', () => {
    const velocity = new THREE.Vector3();

    solveBallisticVelocity(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -10),
      30,
      0,
      velocity,
    );

    expect(velocity.z).toBeCloseTo(-30, 5);
    expect(velocity.y).toBeCloseTo(0, 5);
  });

  it('makes fired shells arc instead of flying flat', () => {
    const parts = createSystem();
    const origin = new THREE.Vector3(0, 1.5, 40);
    const target = new THREE.Vector3(0, 1.5, 70);

    parts.projectiles.fire(origin, target, {
      owner: 'player',
      speed: 38,
      damage: 10,
      maxDistance: 40,
      gravity: 14,
    });

    const mesh = parts.projectiles.root.getObjectByName(
      'Projectile-0',
    ) as THREE.Mesh | undefined;
    if (!mesh) {
      throw new Error('Expected a fired projectile');
    }

    let peak = origin.y;
    for (let frame = 0; frame < 40; frame += 1) {
      parts.projectiles.update(1 / 60);
      peak = Math.max(peak, mesh.position.y);
    }

    expect(peak).toBeGreaterThan(origin.y + 0.6);
    disposeAll(parts);
  });
});

describe('tracer trails', () => {
  it('starts dark and lights up while a round is in the air', () => {
    const parts = createSystem();
    const colors = trailColors(parts.projectiles);

    expect(colors.every((value) => value === 0)).toBe(true);

    parts.projectiles.fire(
      new THREE.Vector3(0, 1.5, 40),
      new THREE.Vector3(0, 1.5, 70),
      {
        owner: 'player',
        speed: 38,
        damage: 10,
        maxDistance: 40,
        gravity: 14,
      },
    );

    for (let frame = 0; frame < 6; frame += 1) {
      parts.projectiles.update(1 / 60);
    }

    expect(colors.some((value) => value > 0.05)).toBe(true);
    disposeAll(parts);
  });

  it('goes dark again when the projectiles are cleared', () => {
    const parts = createSystem();

    parts.projectiles.fire(
      new THREE.Vector3(0, 1.5, 40),
      new THREE.Vector3(0, 1.5, 70),
      { owner: 'player', speed: 38, damage: 10, maxDistance: 40, gravity: 14 },
    );

    for (let frame = 0; frame < 4; frame += 1) {
      parts.projectiles.update(1 / 60);
    }

    parts.projectiles.clear();

    expect(trailColors(parts.projectiles).every((value) => value === 0)).toBe(
      true,
    );
    disposeAll(parts);
  });

  it('emits smoke behind missiles and foam behind torpedoes', () => {
    const player = new PlayerShip();
    const enemies = new EnemyManager();
    const puffs: string[] = [];
    const projectiles = new ProjectileSystem({
      enemies,
      player,
      onEnemyKilled: () => {},
      onPlayerHit: () => {},
      onTrailPuff: (_position, kind) => {
        puffs.push(kind);
      },
    });

    projectiles.fire(
      new THREE.Vector3(0, 2, 40),
      new THREE.Vector3(0, 2, 70),
      {
        owner: 'player',
        speed: 26,
        damage: 10,
        maxDistance: 60,
        kind: 'missile',
        homingTarget: null,
        verticalLaunchSeconds: 0.3,
      },
    );
    projectiles.fire(
      new THREE.Vector3(2, 1, 40),
      new THREE.Vector3(2, 1, 70),
      {
        owner: 'player',
        speed: 16,
        damage: 10,
        maxDistance: 60,
        kind: 'torpedo',
      },
    );

    for (let frame = 0; frame < 30; frame += 1) {
      projectiles.update(1 / 60);
    }

    expect(puffs).toContain('missile');
    expect(puffs).toContain('torpedo');
    // Shells must not spam puffs, they only get a line trail.
    expect(puffs.length).toBeLessThan(40);

    projectiles.dispose();
    enemies.dispose();
    player.dispose();
  });
});
