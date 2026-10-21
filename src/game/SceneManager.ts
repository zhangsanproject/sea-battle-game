import * as THREE from 'three';
import { Ocean } from './Ocean';

const CAMERA_FOV = 42;
const CAMERA_OFFSET = new THREE.Vector3(10, 16.5, 22);
const LOOK_AHEAD = new THREE.Vector3(0, 0.9, -2.4);
const FOG_COLOR = 0x93c7d4;
const SUN_OFFSET = new THREE.Vector3(26, 34, 14);

/** Lowest multiplier the sampler will settle on before it stops degrading. */
const MIN_QUALITY_SCALE = 0.7;
/** Sustained frame time above this means the current ratio is too expensive. */
const DOWNGRADE_FRAME_TIME = 0.024;
/**
 * Frame time below this means there is headroom to render sharper. A locked
 * 60 Hz loop sits at 16.7 ms, so the threshold has to stay above that or the
 * ratio could never climb back once it had dropped.
 */
const UPGRADE_FRAME_TIME = 0.0175;
const DOWNGRADE_COOLDOWN = 2.5;
const UPGRADE_COOLDOWN = 3;

export interface SceneManagerOptions {
  /** Web container. The renderer canvas is appended to it. */
  container?: HTMLElement | null;
  /** Pre-created canvas, used by mini-game runtimes. */
  canvas?: HTMLCanvasElement | null;
  width?: number;
  height?: number;
  pixelRatio?: number;
  /**
   * Upper bound for the pixel ratio. Mini-game runtimes pass this explicitly
   * so the renderer never has to probe `window` for pointer type.
   */
  maxPixelRatio?: number;
  /** Defaults to true. Mini-game builds turn it off to save fill rate. */
  antialias?: boolean;
  /** Directional-light shadow map edge, defaults to 1024. */
  shadowMapSize?: number;
}

/**
 * Douyin's helium runtime exposes a `window` object, but its `matchMedia` is a
 * native host method that throws "Illegal invocation" when called outside a
 * real DOM. Probe defensively instead of trusting the feature check.
 */
export function detectMaxPixelRatio(): number {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      return window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2;
    }
  } catch {
    // Fall through to the touch default below.
  }
  return 1.5;
}

function readDevicePixelRatio(): number {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.devicePixelRatio === 'number'
    ) {
      return window.devicePixelRatio || 1;
    }
  } catch {
    // Fall through.
  }
  return 1;
}

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly container: HTMLElement | null;
  private readonly ocean: Ocean;
  private readonly sun: THREE.DirectionalLight;
  private readonly resizeObserver: ResizeObserver | null;
  /**
   * Upper bound for the device pixel ratio. Not readonly: some hosts clamp an
   * oversized drawing buffer, and the real cap is discovered after the first
   * resize.
   */
  private maxPixelRatio: number;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly desiredCameraPosition = new THREE.Vector3();
  private readonly desiredLookTarget = new THREE.Vector3();
  private elapsedTime = 0;
  private shakeStrength = 0;
  private shakeTime = 0;
  private shakeDuration = 0;
  private basePixelRatio = 1;
  private qualityScale = 1;
  private qualityLocked = false;
  private qualitySampleTime = 0;
  private qualitySampleFrames = 0;
  private qualityChangeCooldown = 0;
  private disposed = false;

  constructor(options: SceneManagerOptions) {
    this.container = options.container ?? null;
    this.maxPixelRatio = options.maxPixelRatio ?? detectMaxPixelRatio();
    this.scene.background = new THREE.Color(FOG_COLOR);
    // Lighter haze than the original 0.0044: at that density the far half of
    // the board washed out and read as a soft picture even at full resolution.
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0032);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1200);
    this.camera.position.copy(CAMERA_OFFSET);
    this.cameraTarget.copy(LOOK_AHEAD);
    this.camera.lookAt(this.cameraTarget);

    const rendererOptions: THREE.WebGLRendererParameters = {
      antialias: options.antialias ?? true,
      alpha: false,
      powerPreference: 'high-performance',
    };
    if (options.canvas) {
      rendererOptions.canvas = options.canvas;
    }

    this.renderer = new THREE.WebGLRenderer(rendererOptions);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES desaturates and lifts the blacks, which made the whole frame read as
    // a washed-out gradient. Neutral keeps the saturation and the contrast,
    // so the ocean and the hull outlines actually separate.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    // three r186 removed PCFSoftShadowMap; the renderer silently fell back to
    // PCFShadowMap, so request it directly and keep the console clean.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    if (this.container && !options.canvas) {
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      this.renderer.domElement.className = 'scene-canvas';
      this.container.appendChild(this.renderer.domElement);
    }

    // Ambient fill used to dominate the key light, which flattened every
    // hull into a single tone. Trade some fill for key so faces separate.
    const hemisphereLight = new THREE.HemisphereLight(0xe1f6ff, 0x19465a, 1.05);
    this.scene.add(hemisphereLight);

    this.sun = new THREE.DirectionalLight(0xffefd0, 3.1);
    this.sun.position.copy(SUN_OFFSET);
    this.sun.castShadow = true;
    const shadowMapSize = Math.max(
      256,
      Math.min(2048, options.shadowMapSize ?? 1024),
    );
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.camera.left = -17;
    this.sun.shadow.camera.right = 17;
    this.sun.shadow.camera.top = 17;
    this.sun.shadow.camera.bottom = -17;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ocean = new Ocean();
    this.scene.add(this.ocean.mesh);

    const ResizeObserverConstructor =
      typeof ResizeObserver !== 'undefined' ? ResizeObserver : null;
    this.resizeObserver =
      this.container && ResizeObserverConstructor
        ? new ResizeObserverConstructor(() => {
            this.resize();
          })
        : null;
    if (this.resizeObserver && this.container) {
      this.resizeObserver.observe(this.container);
    }

    if (options.width && options.height) {
      this.applyViewport(options.width, options.height, options.pixelRatio);
    } else {
      this.resize();
    }
  }

  add(...objects: THREE.Object3D[]): void {
    this.scene.add(...objects);
  }

  remove(...objects: THREE.Object3D[]): void {
    this.scene.remove(...objects);
  }

  /**
   * Kicks the camera. Consecutive calls keep whichever kick is stronger, so a
   * big explosion is not swallowed by a small one that landed just before it.
   */
  shake(strength: number, duration = 0.3): void {
    if (strength <= 0 || duration <= 0) {
      return;
    }

    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
    this.shakeTime = this.shakeDuration;
  }

  private applyShake(delta: number): void {
    if (this.shakeTime <= 0) {
      return;
    }

    this.shakeTime = Math.max(0, this.shakeTime - delta);
    const falloff = this.shakeDuration > 0 ? this.shakeTime / this.shakeDuration : 0;
    const amplitude = this.shakeStrength * falloff * falloff;

    if (amplitude <= 0) {
      this.shakeStrength = 0;
      return;
    }

    const phase = this.elapsedTime * 46;
    this.camera.position.x += Math.sin(phase * 1.7) * amplitude;
    this.camera.position.y += Math.sin(phase * 2.3 + 1.1) * amplitude * 0.65;
    this.camera.position.z += Math.sin(phase * 1.3 + 2.4) * amplitude * 0.55;
    this.cameraTarget.x += Math.sin(phase * 2.1 + 0.6) * amplitude * 0.3;
    this.cameraTarget.y += Math.sin(phase * 1.9 + 2.8) * amplitude * 0.25;
  }

  update(frameDelta: number, focusPosition: THREE.Vector3): void {
    const delta = Math.min(Math.max(frameDelta, 0), 0.1);
    this.elapsedTime += delta;
    this.ocean.update(this.elapsedTime);
    this.adaptQuality(delta);

    const viewScale = this.getViewScale();
    const smoothing = 1 - Math.exp(-4.8 * delta);

    // Only the height and the pull-back distance scale with the view. Scaling
    // the lateral offset too pushed the player ship into the left edge once
    // portrait pulled the camera back, because the horizontal field of view is
    // barely 20 degrees wide.
    this.desiredCameraPosition.set(
      focusPosition.x + CAMERA_OFFSET.x * 0.35,
      focusPosition.y + CAMERA_OFFSET.y * viewScale,
      focusPosition.z + CAMERA_OFFSET.z * viewScale,
    );
    this.desiredLookTarget
      .copy(focusPosition)
      .addScaledVector(LOOK_AHEAD, Math.min(viewScale, 1.8));

    this.camera.position.lerp(this.desiredCameraPosition, smoothing);
    this.cameraTarget.lerp(this.desiredLookTarget, smoothing);
    this.applyShake(delta);
    this.camera.lookAt(this.cameraTarget);

    this.sun.position.copy(focusPosition).add(SUN_OFFSET);
    this.sun.target.position.copy(focusPosition);
    this.sun.target.updateMatrixWorld();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.resizeObserver?.disconnect();
    this.ocean.dispose();
    this.scene.remove(this.ocean.mesh);
    this.scene.remove(this.sun);
    this.scene.remove(this.sun.target);
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();

    if (
      this.container &&
      this.renderer.domElement.parentNode === this.container
    ) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  resize(width?: number, height?: number, pixelRatio?: number): void {
    if (width !== undefined && height !== undefined) {
      this.applyViewport(width, height, pixelRatio);
      return;
    }

    if (!this.container) {
      return;
    }

    this.applyViewport(
      this.container.clientWidth,
      this.container.clientHeight,
    );
  }

  private applyViewport(
    width: number,
    height: number,
    pixelRatio?: number,
  ): void {
    if (width === 0 || height === 0) {
      return;
    }

    const devicePixelRatio = pixelRatio ?? readDevicePixelRatio();
    this.basePixelRatio = Math.min(devicePixelRatio, this.maxPixelRatio);

    this.renderer.setSize(width, height, false);
    this.applyPixelRatio();
    this.acceptHostBufferLimit(width, height);

    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < 0.8 ? 48 : CAMERA_FOV;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Some mini-game hosts silently clamp an oversized drawing buffer. If the
   * buffer comes back smaller than what we asked for, treat that as the real
   * ceiling so the ratio stays honest instead of asking again every resize.
   */
  private acceptHostBufferLimit(width: number, height: number): void {
    const canvas = this.renderer.domElement;
    if (!canvas || canvas.width <= 0 || width <= 0 || height <= 0) {
      return;
    }

    // Use the smaller of the two axes: a host that only clamps the buffer
    // length would otherwise leave us thinking the ratio survived.
    const appliedRatio = Math.min(canvas.width / width, canvas.height / height);
    if (appliedRatio + 0.01 >= this.basePixelRatio) {
      return;
    }

    this.maxPixelRatio = Math.max(1, appliedRatio);
    this.basePixelRatio = this.maxPixelRatio;
    this.applyPixelRatio();
  }

  private applyPixelRatio(): void {
    const pixelRatio = Math.max(
      1,
      this.basePixelRatio * this.qualityScale,
    );
    this.renderer.setPixelRatio(pixelRatio);
  }

  /**
   * Degrades render resolution when sustained frame times are slow and steps
   * back up once the device holds a comfortable frame time again. Both
   * directions are rate-limited by a cooldown so the ratio cannot oscillate.
   */
  private adaptQuality(delta: number): void {
    this.qualityChangeCooldown = Math.max(
      0,
      this.qualityChangeCooldown - delta,
    );
    this.qualitySampleTime += delta;
    this.qualitySampleFrames += 1;

    // A 45-frame window is under a second at 60 fps and still long enough to
    // ignore a single hitch. The old 120-frame window took four seconds to
    // react on a 30 fps device, which is a long time to sit at the wrong
    // resolution.
    if (this.qualitySampleFrames < 45) {
      return;
    }

    const averageFrameTime =
      this.qualitySampleTime / this.qualitySampleFrames;
    this.qualitySampleTime = 0;
    this.qualitySampleFrames = 0;

    if (
      averageFrameTime > DOWNGRADE_FRAME_TIME &&
      this.qualityScale > MIN_QUALITY_SCALE &&
      this.qualityChangeCooldown === 0
    ) {
      this.qualityScale = Math.max(
        MIN_QUALITY_SCALE,
        this.qualityScale - 0.18,
      );
      this.qualityChangeCooldown = DOWNGRADE_COOLDOWN;
      this.applyPixelRatio();
      return;
    }

    // Recover once the device has proven it can hold a comfortable frame time;
    // without this a single loading hitch would downgrade the whole session
    // permanently, and the picture would never get sharp again.
    if (
      averageFrameTime < UPGRADE_FRAME_TIME &&
      this.qualityScale < 1 &&
      this.qualityChangeCooldown === 0 &&
      !this.qualityLocked
    ) {
      this.qualityScale = Math.min(1, this.qualityScale + 0.08);
      this.qualityChangeCooldown = UPGRADE_COOLDOWN;
      this.applyPixelRatio();
    }
  }

  /**
   * Jumps straight to the lowest pixel ratio. Wired to `tt.onMemoryWarning`,
   * where reacting late costs more than dropping resolution early.
   */
  applyLowQuality(): void {
    if (this.disposed) {
      return;
    }

    this.qualityLocked = true;
    this.qualityScale = MIN_QUALITY_SCALE;
    this.qualityChangeCooldown = 10;
    this.applyPixelRatio();
  }

  get qualityRatio(): number {
    return this.qualityScale;
  }

  private getViewScale(): number {
    if (this.camera.aspect >= 1) {
      return 1;
    }

    // Portrait panels are narrow: at 1.55 the horizontal half-width was under
    // 10 units while the guns reach 22, so enemies died off-screen. Pulling
    // back further widens the board and shrinks the ship at the same time.
    return THREE.MathUtils.clamp(0.94 / this.camera.aspect, 1, 2.45);
  }
}
