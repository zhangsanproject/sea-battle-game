import { Vector2, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import { GAME_CONFIG } from '../config';
import type { PlayerShip } from '../entities/PlayerShip';
import type { CombatStats } from '../progression/types';
import { clampToArena, moveTowards, rotateTowardsAngle } from './movementMath';

const WORLD_UP = new Vector3(0, 1, 0);
const INPUT_EPSILON = 0.001;
const FACING_SPEED_THRESHOLD_SQ = 0.0064;

export class PlayerControlSystem {
  private readonly velocity = new Vector2();
  private readonly position2D = new Vector2();
  private readonly cameraForward = new Vector3();
  private readonly cameraRight = new Vector3();
  private readonly worldMoveDirection = new Vector3();

  constructor(
    private readonly player: PlayerShip,
    private readonly camera: PerspectiveCamera,
    private readonly stats: CombatStats,
  ) {}

  update(input: Readonly<Vector2>, deltaTime: number): void {
    this.camera.getWorldDirection(this.cameraForward);
    this.cameraForward.y = 0;

    if (this.cameraForward.lengthSq() < INPUT_EPSILON) {
      this.cameraForward.set(0, 0, -1);
    } else {
      this.cameraForward.normalize();
    }

    this.cameraRight
      .crossVectors(this.cameraForward, WORLD_UP)
      .normalize();

    const inputMagnitude = Math.min(input.length(), 1);
    const hasInput = inputMagnitude > INPUT_EPSILON;

    if (hasInput) {
      this.worldMoveDirection
        .copy(this.cameraRight)
        .multiplyScalar(input.x)
        .addScaledVector(this.cameraForward, input.y);

      if (this.worldMoveDirection.lengthSq() > INPUT_EPSILON) {
        this.worldMoveDirection.normalize();
      } else {
        this.worldMoveDirection.set(0, 0, 0);
      }
    } else {
      this.worldMoveDirection.set(0, 0, 0);
    }

    const targetSpeed = this.stats.moveSpeed * inputMagnitude;
    const targetVelocityX = this.worldMoveDirection.x * targetSpeed;
    const targetVelocityZ = this.worldMoveDirection.z * targetSpeed;
    const changeRate = hasInput
      ? GAME_CONFIG.player.acceleration
      : GAME_CONFIG.player.deceleration;

    moveTowards(
      this.velocity,
      targetVelocityX,
      targetVelocityZ,
      changeRate * deltaTime,
    );

    const position = this.player.root.position;
    position.x += this.velocity.x * deltaTime;
    position.z += this.velocity.y * deltaTime;

    this.position2D.set(position.x, position.z);
    clampToArena(this.position2D, this.velocity, GAME_CONFIG.arena.radius);
    position.x = this.position2D.x;
    position.z = this.position2D.y;

    if (this.velocity.lengthSq() > FACING_SPEED_THRESHOLD_SQ) {
      const targetHeading = Math.atan2(-this.velocity.x, -this.velocity.y);
      this.player.root.rotation.y = rotateTowardsAngle(
        this.player.root.rotation.y,
        targetHeading,
        GAME_CONFIG.player.turnSpeed * deltaTime,
      );
    }
  }
}
