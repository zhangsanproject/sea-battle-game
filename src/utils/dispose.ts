import * as THREE from 'three';

type DisposableMaterial = THREE.Material & {
  uniforms?: Record<string, { value: unknown }>;
};

export function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) &&
      !(object instanceof THREE.Line) &&
      !(object instanceof THREE.Points)
    ) {
      return;
    }

    geometries.add(object.geometry);

    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of objectMaterials) {
      materials.add(material);

      const uniforms = (material as DisposableMaterial).uniforms;
      if (!uniforms) {
        continue;
      }

      for (const uniform of Object.values(uniforms)) {
        if (uniform.value instanceof THREE.Texture) {
          textures.add(uniform.value);
        }
      }
    }
  });

  for (const geometry of geometries) {
    geometry.dispose();
  }

  for (const material of materials) {
    material.dispose();
  }

  for (const texture of textures) {
    texture.dispose();
  }
}
