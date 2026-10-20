import * as THREE from 'three';
import { Ocean } from './Ocean';

const CAMERA_FOV = 42;
const CAMERA_OFFSET = new THREE.Vector3(10, 16.5, 22);
const LOOK_AHEAD = new THREE.Vector3(0, 0.9, -2.4);
const FOG_COLOR = 0x93c7d4;
const SUN_OFFSET = new THREE.Vector3(26, 34, 14);

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
  private readonly maxPixelRatio: number;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly desiredCameraPosition = new THREE.Vector3();
  private readonly desiredLookTarget = new THREE.Vector3();
  private elapsedTime = 0;
  private basePixelRatio = 1;
  private qualityScale = 1;
  private qualitySampleTime = 0;
  private qualitySampleFrames = 0;
  private qualityChangeCooldown = 0;
  private disposed = false;

  constructor(options: SceneManagerOptions) {
    this.container = options.container ?? null;
    this.maxPixelRatio = options.maxPixelRatio ?? detectMaxPixelRatio();
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0044);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1200);
    this.camera.position.copy(CAMERA_OFFSET);
    this.cameraTarget.copy(LOOK_AHEAD);
    this.camera.lookAt(this.cameraTarget);

    const rendererOptions: THREE.WebGLRendererParameters = {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    };
    if (options.canvas) {
      rendererOptions.canvas = options.canvas;
    }

    this.renderer = new THREE.WebGLRenderer(rendererOptions);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    // three r186 removed PCFSoftShadowMap; the renderer silently fell back to
    // PCFShadowMap, so request it directly and keep the console clean.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    if (this.container && !options.canvas) {
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      this.renderer.domElement.className = 'scene-canvas';
      this.container.appendChild(this.renderer.domElement);
    }

    const hemisphereLight = new THREE.HemisphereLight(0xe1f6ff, 0x19465a, 1.45);
    this.scene.add(hemisphereLight);

    this.sun = new THREE.DirectionalLight(0xffefd0, 2.7);
    this.sun.position.copy(SUN_OFFSET);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
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

  update(frameDelta: number, focusPosition: THREE.Vector3): void {
    const delta = Math.min(Math.max(frameDelta, 0), 0.1);
    this.elapsedTime += delta;
    this.ocean.update(this.elapsedTime);
    this.adaptQuality(delta);

    const viewScale = this.getViewScale();
    const smoothing = 1 - Math.exp(-4.8 * delta);

    this.desiredCameraPosition
      .copy(focusPosition)
      .addScaledVector(CAMERA_OFFSET, viewScale);
    this.desiredLookTarget
      .copy(focusPosition)
      .addScaledVector(LOOK_AHEAD, Math.min(viewScale, 1.2));

    this.camera.position.lerp(this.desiredCameraPosition, smoothing);
    this.cameraTarget.lerp(this.desiredLookTarget, smoothing);
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

    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < 0.8 ? 48 : CAMERA_FOV;
    this.camera.updateProjectionMatrix();
  }

  private applyPixelRatio(): void {
    const pixelRatio = Math.max(
      1,
      this.basePixelRatio * this.qualityScale,
    );
    this.renderer.setPixelRatio(pixelRatio);
  }

  /**
   * Degrades render resolution gradually when sustained frame times are slow.
   * It never increases quality during a run, avoiding oscillating DPR changes.
   */
  private adaptQuality(delta: number): void {
    this.qualityChangeCooldown = Math.max(
      0,
      this.qualityChangeCooldown - delta,
    );
    this.qualitySampleTime += delta;
    this.qualitySampleFrames += 1;

    if (this.qualitySampleFrames < 120) {
      return;
    }

    const averageFrameTime =
      this.qualitySampleTime / this.qualitySampleFrames;
    this.qualitySampleTime = 0;
    this.qualitySampleFrames = 0;

    if (
      averageFrameTime > 0.024 &&
      this.qualityScale > 0.66 &&
      this.qualityChangeCooldown === 0
    ) {
      this.qualityScale = Math.max(0.66, this.qualityScale - 0.18);
      this.qualityChangeCooldown = 4;
      this.applyPixelRatio();
    }
  }

  private getViewScale(): number {
    if (this.camera.aspect >= 1) {
      return 1;
    }

    return THREE.MathUtils.clamp(0.94 / this.camera.aspect, 1, 1.55);
  }
}
