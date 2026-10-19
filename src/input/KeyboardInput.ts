import { Vector2 } from 'three';

const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const ARROW_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

function isTextInputTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  );
}

export class KeyboardInput {
  private readonly pressedKeys = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  getAxes(out: Vector2): Vector2 {
    const right =
      this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight');
    const left =
      this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft');
    const forward =
      this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp');
    const backward =
      this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown');

    out.set(Number(right) - Number(left), Number(forward) - Number(backward));

    const magnitude = out.length();
    if (magnitude > 1) {
      out.multiplyScalar(1 / magnitude);
    }

    return out;
  }

  reset(): void {
    this.pressedKeys.clear();
  }

  dispose(): void {
    this.reset();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      !GAME_KEYS.has(event.code) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isTextInputTarget(event.target)
    ) {
      return;
    }

    if (ARROW_KEYS.has(event.code)) {
      event.preventDefault();
    }

    this.pressedKeys.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!GAME_KEYS.has(event.code)) {
      return;
    }

    if (ARROW_KEYS.has(event.code)) {
      event.preventDefault();
    }

    this.pressedKeys.delete(event.code);
  };
}
