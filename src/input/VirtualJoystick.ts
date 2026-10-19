import { Vector2 } from 'three';

const JOYSTICK_MARKUP = `
  <div class="joystick__decor" aria-hidden="true"></div>
  <div class="joystick__knob" data-knob></div>
  <span class="joystick__label" aria-hidden="true">移动</span>
`;

export class VirtualJoystick {
  private readonly element: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly value = new Vector2();
  private activePointerId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private travelRadius = 1;
  private enabled = true;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'joystick';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', '战船移动摇杆');
    this.element.innerHTML = JOYSTICK_MARKUP;

    const knob = this.element.querySelector<HTMLDivElement>('[data-knob]');
    if (!knob) {
      throw new Error('虚拟摇杆节点创建失败');
    }
    this.knob = knob;

    container.appendChild(this.element);

    const touchCapable =
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0;
    this.element.classList.toggle('is-visible', touchCapable);

    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointermove', this.handlePointerMove);
    this.element.addEventListener('pointerup', this.handlePointerUp);
    this.element.addEventListener('pointercancel', this.handlePointerUp);
    this.element.addEventListener(
      'lostpointercapture',
      this.handleLostPointerCapture,
    );
  }

  getValue(out: Vector2): Vector2 {
    return out.copy(this.value);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.element.classList.toggle('is-disabled', !enabled);

    if (!enabled) {
      this.reset();
    }
  }

  reset(): void {
    const pointerId = this.activePointerId;
    this.activePointerId = null;

    if (
      pointerId !== null &&
      this.element.hasPointerCapture(pointerId)
    ) {
      this.element.releasePointerCapture(pointerId);
    }

    this.clearState();
  }

  dispose(): void {
    this.reset();
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerUp);
    this.element.removeEventListener(
      'lostpointercapture',
      this.handleLostPointerCapture,
    );
    this.element.remove();
  }

  private updateFromPoint(clientX: number, clientY: number): void {
    const deltaX = clientX - this.centerX;
    const deltaY = clientY - this.centerY;
    const distance = Math.hypot(deltaX, deltaY);
    const clampedDistance = Math.min(distance, this.travelRadius);
    const scale = distance > 0 ? clampedDistance / distance : 0;
    const offsetX = deltaX * scale;
    const offsetY = deltaY * scale;

    this.value.set(
      offsetX / this.travelRadius,
      -offsetY / this.travelRadius,
    );
    this.knob.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
  }

  private clearState(): void {
    this.value.set(0, 0);
    this.element.classList.remove('is-active');
    this.knob.style.transform = '';
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled || this.activePointerId !== null) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const bounds = this.element.getBoundingClientRect();
    const knobBounds = this.knob.getBoundingClientRect();

    this.centerX = bounds.left + bounds.width / 2;
    this.centerY = bounds.top + bounds.height / 2;
    this.travelRadius = Math.max(
      1,
      bounds.width / 2 - knobBounds.width / 2 - 5,
    );
    this.activePointerId = event.pointerId;
    this.element.classList.add('is-active');
    this.element.setPointerCapture(event.pointerId);
    this.updateFromPoint(event.clientX, event.clientY);
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    this.updateFromPoint(event.clientX, event.clientY);
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    const pointerId = this.activePointerId;
    this.activePointerId = null;

    if (this.element.hasPointerCapture(pointerId)) {
      this.element.releasePointerCapture(pointerId);
    }

    this.clearState();
    event.preventDefault();
  };

  private readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    this.activePointerId = null;
    this.clearState();
  };
}
