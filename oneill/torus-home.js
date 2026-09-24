import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PLAYER_COLLISION_RADIUS_M = 0.32;
const COLLISION_CELL_SIZE_M = 1.5;
const HOUSE_SYSTEM_DEFAULTS = { ring_awning: true, door_canopies: false };
const HOUSE_FOOT = 0.3048;

export const TORUS_HOME_SITE_CLEARANCE_M = 25;
export const TORUS_HOME_PAD_RADIUS_M = 21;
export const TORUS_HOME_PAD_BLEND_RADIUS_M = 36;

function reportProgress(onProgress, label, event) {
  if (!onProgress) return;
  const percent = event.total > 0
    ? Math.min(100, Math.round(event.loaded / event.total * 100))
    : null;
  onProgress(label, percent, event.loaded, event.total);
}

function prepareHouseMaterials(root) {
  root.traverse(object => {
    if (!object.isMesh) return;
    const group = object.userData.group;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.side = group === '15' ? THREE.FrontSide : THREE.DoubleSide;
      if ((material.name || '').toLowerCase().includes('glass')) {
        material.transmission = 0;
        material.transparent = true;
        material.opacity = 0.17;
        material.depthWrite = false;
        material.roughness = 0.18;
      }
      material.envMapIntensity = 0.35;
    }
    if (group === '15') object.visible = false;
    const option = object.userData.system_option;
    if (option) object.visible = Boolean(HOUSE_SYSTEM_DEFAULTS[option]);
    object.castShadow = false;
    object.receiveShadow = false;
  });
}

function localWallSegments(root) {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const segments = [];

  root.traverse(object => {
    if (!object.isMesh || !object.geometry) return;
    const map = object.name.toLowerCase();
    if (map.includes('roof') || map.includes('awning') || map.includes('canopy')) return;
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    const index = object.geometry.index;
    const vertexCount = index ? index.count : position.count;
    const triangleCount = Math.floor(vertexCount / 3);
    matrix.multiplyMatrices(rootInverse, object.matrixWorld);

    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const offset = triangle * 3;
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(matrix);
      b.fromBufferAttribute(position, ib).applyMatrix4(matrix);
      c.fromBufferAttribute(position, ic).applyMatrix4(matrix);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac);
      if (normal.lengthSq() < 1e-10) continue;
      normal.normalize();
      // Floor, roof and other horizontal surfaces do not block walking in the
      // ground plane. Vertical wall triangles project to short 2D segments.
      if (Math.abs(normal.y) > 0.42) continue;

      const candidates = [
        [a.x, a.z, b.x, b.z],
        [b.x, b.z, c.x, c.z],
        [c.x, c.z, a.x, a.z],
      ];
      let longest = candidates[0];
      let longestLengthSquared = 0;
      for (const candidate of candidates) {
        const dx = candidate[2] - candidate[0];
        const dz = candidate[3] - candidate[1];
        const lengthSquared = dx * dx + dz * dz;
        if (lengthSquared > longestLengthSquared) {
          longestLengthSquared = lengthSquared;
          longest = candidate;
        }
      }
      if (longestLengthSquared < 0.06 * 0.06) continue;
      segments.push(longest);
    }
  });
  return segments;
}

function distanceToSegmentSquared(px, pz, segment) {
  const [x1, z1, x2, z2] = segment;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 1e-9
    ? THREE.MathUtils.clamp(((px - x1) * dx + (pz - z1) * dz) / lengthSquared, 0, 1)
    : 0;
  const nearX = x1 + t * dx;
  const nearZ = z1 + t * dz;
  return (px - nearX) ** 2 + (pz - nearZ) ** 2;
}

function createWallIndex(segments) {
  const cells = new Map();
  const radius = PLAYER_COLLISION_RADIUS_M + 0.08;
  const cellKey = (x, z) => `${x}:${z}`;

  for (const segment of segments) {
    const minX = Math.floor((Math.min(segment[0], segment[2]) - radius) / COLLISION_CELL_SIZE_M);
    const maxX = Math.floor((Math.max(segment[0], segment[2]) + radius) / COLLISION_CELL_SIZE_M);
    const minZ = Math.floor((Math.min(segment[1], segment[3]) - radius) / COLLISION_CELL_SIZE_M);
    const maxZ = Math.floor((Math.max(segment[1], segment[3]) + radius) / COLLISION_CELL_SIZE_M);
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = cellKey(x, z);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(segment);
      }
    }
  }

  return {
    segmentCount: segments.length,
    blocks(x, z, playerRadius = PLAYER_COLLISION_RADIUS_M) {
      const cellX = Math.floor(x / COLLISION_CELL_SIZE_M);
      const cellZ = Math.floor(z / COLLISION_CELL_SIZE_M);
      const radiusSquared = playerRadius * playerRadius;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nearby = cells.get(cellKey(cellX + dx, cellZ + dz));
          if (!nearby) continue;
          for (const segment of nearby) {
            if (distanceToSegmentSquared(x, z, segment) < radiusSquared) return true;
          }
        }
      }
      return false;
    },
  };
}

function disposeCollisionScene(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export async function loadTorusHomeAssets({
  visualUrl,
  collisionUrl,
  onProgress,
  onVisualLoaded,
}) {
  const loader = new GLTFLoader();
  const visualPromise = loader.loadAsync(
    visualUrl,
    event => reportProgress(onProgress, 'house', event),
  ).then(gltf => {
    prepareHouseMaterials(gltf.scene);
    onVisualLoaded?.(gltf.scene);
    return gltf.scene;
  });
  const collisionPromise = loader.loadAsync(
    collisionUrl,
    event => reportProgress(onProgress, 'collision', event),
  ).then(gltf => {
    const collisionSegments = localWallSegments(gltf.scene);
    disposeCollisionScene(gltf.scene);
    return createWallIndex(collisionSegments);
  });
  const [visual, collision] = await Promise.all([visualPromise, collisionPromise]);
  return {
    visual,
    collision,
  };
}

export function torusHomeSpawnLocal() {
  // Match the Torus walkthrough's living-room spawn: 34 ft from the garden
  // center at 345°, facing toward the inner garden door.
  const angle = THREE.MathUtils.degToRad(345);
  const spawnRadius = 34 * HOUSE_FOOT;
  const targetRadius = 26 * HOUSE_FOOT;
  const x = spawnRadius * Math.cos(angle);
  const z = -spawnRadius * Math.sin(angle);
  const targetX = targetRadius * Math.cos(angle);
  const targetZ = -targetRadius * Math.sin(angle);
  return {
    x,
    z,
    yaw: Math.atan2(targetX - x, targetZ - z),
  };
}

export function placeTorusHome(scene, assets, world, site) {
  let root = scene.getObjectByName('torus-home-on-cylinder');
  if (!root) {
    root = new THREE.Group();
    root.name = 'torus-home-on-cylinder';
    root.add(assets.visual);
    // Match the Torus walkthrough's lightweight warm interior bounce lighting.
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const light = new THREE.PointLight(0xffefd8, 30, 14, 2);
      light.position.set(9 * Math.cos(angle), 3, 9 * Math.sin(angle));
      root.add(light);
    }
    scene.add(root);
  }
  const pose = world.pointAtHeight(site.s, site.z, site.height + 0.04);
  root.position.copy(pose.position);
  root.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(pose.tangent, pose.up, pose.axis),
  ));
  root.visible = true;
  return root;
}
