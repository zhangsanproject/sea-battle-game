import { Vector2 } from 'three';
import { GAME_CONFIG } from '../game/config';
import type { InputSource } from '../platform/PlatformAdapter';
import { KeyboardInput } from './KeyboardInput';
import { VirtualJoystick } from './VirtualJoystick';

export class InputManager implements InputSource {
  private readonly keyboard = new KeyboardInput();
  private readonly joystick: VirtualJoystick;
  private readonly joystickValue = new Vector2();
  private readonly keyboardValue = new Vector2();
  private readonly deadzone = GAME_CONFIG.input.joystickDeadzone;
  private enabled = true;

  constructor(uiRoot: HTMLElement) {
    this.joystick = new VirtualJoystick(uiRoot);
    window.addEventListener('blur', this.handleFocusLost);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  getMoveVector(out: Vector2): Vector2 {
    if (!this.enabled) {
      return out.set(0, 0);
    }

    this.joystick.getValue(this.joystickValue);
    this.keyboard.getAxes(this.keyboardValue);

    const joystickMagnitude = this.joystickValue.length();

    if (joystickMagnitude > this.deadzone) {
      const scaledMagnitude = Math.min(
        (joystickMagnitude - this.deadzone) / (1 - this.deadzone),
        1,
      );
      out
        .copy(this.joystickValue)
        .multiplyScalar(scaledMagnitude / joystickMagnitude);
      return out;
    }

    if (this.keyboardValue.lengthSq() > 0) {
      return out.copy(this.keyboardValue);
    }

    return out.set(0, 0);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.joystick.setEnabled(enabled);

    if (!enabled) {
      this.keyboard.reset();
    }
  }

  reset(): void {
    this.keyboard.reset();
    this.joystick.reset();
  }

  dispose(): void {
    window.removeEventListener('blur', this.handleFocusLost);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
    );
    this.reset();
    this.keyboard.dispose();
    this.joystick.dispose();
  }

  private readonly handleFocusLost = (): void => {
    this.reset();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.reset();
    }
  };
}
