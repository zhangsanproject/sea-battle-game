import * as THREE from 'three';

const OCEAN_SIZE = 760;
const OCEAN_SEGMENTS = 160;

const vertexShader = /* glsl */ `
  uniform float uTime;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vWaveHeight;

  float waveHeight(vec2 point) {
    float height = 0.0;
    height += sin(point.x * 0.19 + uTime * 1.05) * 0.28;
    height += sin(point.y * 0.15 - uTime * 0.76) * 0.22;
    height += sin((point.x + point.y) * 0.29 + uTime * 1.5) * 0.075;
    height += sin((point.x - point.y) * 0.42 - uTime * 1.95) * 0.04;
    return height;
  }

  void main() {
    vec3 displaced = position;
    float height = waveHeight(position.xy);
    displaced.z += height;

    const float sampleOffset = 0.65;
    float heightX =
      waveHeight(position.xy + vec2(sampleOffset, 0.0)) -
      waveHeight(position.xy - vec2(sampleOffset, 0.0));
    float heightY =
      waveHeight(position.xy + vec2(0.0, sampleOffset)) -
      waveHeight(position.xy - vec2(0.0, sampleOffset));

    vec3 localNormal = normalize(vec3(
      -heightX / (sampleOffset * 2.0),
      -heightY / (sampleOffset * 2.0),
      1.0
    ));

    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);

    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    vWaveHeight = height;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFoamColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uTime;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vWaveHeight;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 sunDirection = normalize(uSunDirection);

    float heightMix = smoothstep(-0.48, 0.58, vWaveHeight);
    vec3 waterColor = mix(uDeepColor, uShallowColor, heightMix);

    float diffuse = max(dot(normal, sunDirection), 0.0);
    waterColor += uSunColor * diffuse * 0.055;

    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
    waterColor = mix(waterColor, uSkyColor, fresnel * 0.34);

    vec3 halfDirection = normalize(sunDirection + viewDirection);
    float specular = pow(max(dot(normal, halfDirection), 0.0), 105.0);
    waterColor += uSunColor * specular * 1.15;

    vec2 ripplePoint = vWorldPosition.xz;
    float rippleA = sin(ripplePoint.x * 0.88 + uTime * 1.7) *
      cos(ripplePoint.y * 0.61 - uTime * 1.2);
    float rippleB = sin((ripplePoint.x + ripplePoint.y) * 1.28 - uTime * 2.15);
    float ripplePattern = rippleA * 0.65 + rippleB * 0.35;

    vec3 detailedNormal = normalize(normal + vec3(
      rippleA * 0.085 + rippleB * 0.035,
      0.0,
      rippleB * 0.075 - rippleA * 0.025
    ));
    float detailSpecular = pow(
      max(dot(detailedNormal, halfDirection), 0.0),
      72.0
    );
    waterColor += uSunColor * detailSpecular * 0.5;

    float glimmer = smoothstep(0.58, 0.95, ripplePattern);
    waterColor = mix(waterColor, uShallowColor, glimmer * 0.12);

    float crest = smoothstep(0.4, 0.62, vWaveHeight);
    float crestStreak = smoothstep(
      0.7,
      0.98,
      sin(
        vWorldPosition.x * 0.56 +
        vWorldPosition.z * 0.34 +
        uTime * 0.85 +
        vWaveHeight * 6.0
      )
    );
    waterColor = mix(
      waterColor,
      uFoamColor,
      crest * (0.045 + glimmer * 0.06 + crestStreak * 0.1)
    );

    float distanceToCamera = length(cameraPosition - vWorldPosition);
    float fogAmount = 1.0 - exp(
      -uFogDensity * uFogDensity * distanceToCamera * distanceToCamera
    );
    waterColor = mix(waterColor, uFogColor, clamp(fogAmount, 0.0, 1.0));

    gl_FragColor = vec4(waterColor, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Ocean {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor() {
    const geometry = new THREE.PlaneGeometry(
      OCEAN_SIZE,
      OCEAN_SIZE,
      OCEAN_SEGMENTS,
      OCEAN_SEGMENTS,
    );

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color(0x064969) },
        uShallowColor: { value: new THREE.Color(0x1785a2) },
        uSkyColor: { value: new THREE.Color(0xa9dce7) },
        uFoamColor: { value: new THREE.Color(0xe9fdff) },
        uSunColor: { value: new THREE.Color(0xfff0c4) },
        uSunDirection: { value: new THREE.Vector3(0.48, 0.78, 0.4).normalize() },
        uFogColor: { value: new THREE.Color(0x93c7d4) },
        uFogDensity: { value: 0.0044 },
      },
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Ocean';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.frustumCulled = false;
  }

  update(elapsedTime: number): void {
    this.mesh.material.uniforms.uTime!.value = elapsedTime;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
