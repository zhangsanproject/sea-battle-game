import * as THREE from 'three';
import { Ocean } from './Ocean';

const CAMERA_FOV = 42;
const CAMERA_OFFSET = new THREE.Vector3(10, 16.5, 22);
const LOOK_AHEAD = new THREE.Vector3(0, 0.9, -2.4);
const FOG_COLOR = 0x93c7d4;
const SUN_OFFSET = new THREE.Vector3(26, 34, 14);

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly container: HTMLElement;
  private readonly ocean: Ocean;
  private readonly sun: THREE.DirectionalLight;
  private readonly resizeObserver: ResizeObserver;
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

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0044);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1200);
    this.camera.position.copy(CAMERA_OFFSET);
    this.cameraTarget.copy(LOOK_AHEAD);
    this.camera.lookAt(this.cameraTarget);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.className = 'scene-canvas';
    this.container.appendChild(this.renderer.domElement);

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

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.container);
    this.resize();
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

    this.resizeObserver.disconnect();
    this.ocean.dispose();
    this.scene.remove(this.ocean.mesh);
    this.scene.remove(this.sun);
    this.scene.remove(this.sun.target);
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width === 0 || height === 0) {
      return;
    }

    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const maxPixelRatio = coarsePointer ? 1.5 : 2;
    this.basePixelRatio = Math.min(
      window.devicePixelRatio || 1,
      maxPixelRatio,
    );

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
