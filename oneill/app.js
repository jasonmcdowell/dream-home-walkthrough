import * as THREE from 'three';
import { createBuildingArchetypeGeometries } from '../houses/oneill-cylinder/tools/asset-kit.js';
import { createExteriorStructures } from '../houses/oneill-cylinder/tools/exterior-kit.js';
import { CylinderWorld, makeSurfaceQuaternion, seedFromString } from '../houses/oneill-cylinder/tools/world-generator.js';
import {
  loadTorusHomeAssets,
  placeTorusHome,
  TORUS_HOME_PAD_BLEND_RADIUS_M,
  TORUS_HOME_PAD_RADIUS_M,
  TORUS_HOME_SITE_CLEARANCE_M,
  torusHomeSpawnLocal,
} from './torus-home.js?v=doors-f4fc00c';

const canvas = document.querySelector('#world');
const loading = document.querySelector('#loading');
const loadingStatus = document.querySelector('#loading-status');
const progress = document.querySelector('#progress');
const isTouch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
const PLAYER_EYE_HEIGHT_M = 1.7272;
const PLAYER_BODY_HEIGHT_M = 1.8288;
const PLAYER_COLLISION_RADIUS_M = 0.32;
const playerEyeHeight = PLAYER_EYE_HEIGHT_M;
const combinedHomeMode = new URLSearchParams(window.location.search).get('house') === 'torus';
const environmentModeUrl = new URL(window.location.href);
if (combinedHomeMode) environmentModeUrl.searchParams.delete('house');
else environmentModeUrl.searchParams.set('house', 'torus');
const environmentModeLink = document.querySelector('#environment-mode-link');
environmentModeLink.href = `${environmentModeUrl.pathname}${environmentModeUrl.search}${environmentModeUrl.hash}`;
environmentModeLink.textContent = combinedHomeMode
  ? 'Open O’Neill Cylinder only'
  : 'Open with Torus Home';
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isTouch,
  powerPreference: isTouch ? 'low-power' : 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1 : 1.4));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaec7c8);
const camera = new THREE.PerspectiveCamera(
  combinedHomeMode ? 55 : 64,
  innerWidth / innerHeight,
  combinedHomeMode ? 0.04 : 0.1,
  5000,
);
const hemisphere = new THREE.HemisphereLight(0xe5f1ec, 0x6e765b, isTouch ? 2.05 : 1.85);
scene.add(hemisphere);
const sunlight = new THREE.DirectionalLight(0xffedcf, 2.2);
sunlight.position.set(-12, 26, -20);
sunlight.target.position.set(0, 0, 0);
scene.add(sunlight, sunlight.target);

const terrainMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.98,
  metalness: 0,
});
const riverMaterial = new THREE.MeshStandardMaterial({
  color: 0x6ba9ae,
  roughness: 0.16,
  metalness: 0.02,
  side: THREE.DoubleSide,
});
const seaMaterial = new THREE.MeshStandardMaterial({
  color: 0x3e8690,
  roughness: 0.13,
  metalness: 0.04,
  side: THREE.DoubleSide,
});
const waterfallMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xa9dfe2,
  roughness: 0.18,
  metalness: 0,
  transparent: true,
  opacity: 0.74,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const barkMaterial = new THREE.MeshStandardMaterial({ color: 0x665039, roughness: 1 });
const pineMaterial = new THREE.MeshStandardMaterial({ color: 0x355d43, roughness: 1 });
const roundTreeMaterial = new THREE.MeshStandardMaterial({ color: 0x64804e, roughness: 1 });
const buildingMaterials = {
  houseOneStory: new THREE.MeshStandardMaterial({ color: 0xcab798, roughness: 0.94, side: THREE.DoubleSide }),
  houseOneStoryOpenDoor: new THREE.MeshStandardMaterial({ color: 0xcab798, roughness: 0.94, side: THREE.DoubleSide }),
  houseTwoStory: new THREE.MeshStandardMaterial({ color: 0xb7a58a, roughness: 0.91, side: THREE.DoubleSide }),
  houseTwoStoryOpenDoor: new THREE.MeshStandardMaterial({ color: 0xb7a58a, roughness: 0.91, side: THREE.DoubleSide }),
  village: new THREE.MeshStandardMaterial({ color: 0xc0a882, roughness: 0.96 }),
  smallCity: new THREE.MeshStandardMaterial({ color: 0x9d9b8f, roughness: 0.9 }),
  largeCity: new THREE.MeshStandardMaterial({ color: 0x898f90, roughness: 0.86 }),
  skyscraper: new THREE.MeshStandardMaterial({ color: 0x728d91, metalness: 0.22, roughness: 0.4 }),
  megaPyramid: new THREE.MeshStandardMaterial({ color: 0x978570, roughness: 0.92, side: THREE.DoubleSide }),
  wizardTower: new THREE.MeshStandardMaterial({ color: 0x777a86, metalness: 0.12, roughness: 0.72, side: THREE.DoubleSide }),
  farm: new THREE.MeshStandardMaterial({ color: 0xa77d4f, roughness: 0.97 }),
};
const buildingGeometries = createBuildingArchetypeGeometries(THREE);
const lakeMaterial = new THREE.MeshStandardMaterial({
  color: 0x4d9aa2,
  roughness: 0.19,
  metalness: 0.08,
  side: THREE.DoubleSide,
});
const localRoadMaterial = new THREE.MeshStandardMaterial({ color: 0x756c59, roughness: 1, side: THREE.DoubleSide });
const arterialRoadMaterial = new THREE.MeshStandardMaterial({ color: 0x5e625d, roughness: 0.98, side: THREE.DoubleSide });
const roadShoulderMaterial = new THREE.MeshStandardMaterial({ color: 0x8b8068, roughness: 1, side: THREE.DoubleSide });
const fieldFurrowMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x677a3e, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0x978352, roughness: 1 }),
];
const backdropMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  side: THREE.DoubleSide,
  fog: true,
  depthWrite: false,
  toneMapped: false,
});
const interiorBackground = new THREE.Color(0xaec7c8);
const exteriorBackground = new THREE.Color(0x03080d);
const airlockFrameMaterial = new THREE.MeshStandardMaterial({
  color: 0x65716f,
  metalness: 0.76,
  roughness: 0.48,
  side: THREE.DoubleSide,
});
const airlockAccentMaterial = new THREE.MeshStandardMaterial({
  color: 0xb36331,
  emissive: 0x37170b,
  metalness: 0.54,
  roughness: 0.62,
});
const tramRailMaterial = new THREE.MeshStandardMaterial({
  color: 0x56615f,
  metalness: 0.82,
  roughness: 0.38,
});
const tramBodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x394b49,
  metalness: 0.72,
  roughness: 0.43,
});
const tramGlassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x7da5a2,
  metalness: 0.24,
  roughness: 0.16,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const tramLightMaterial = new THREE.MeshStandardMaterial({
  color: 0xe4b86a,
  emissive: 0xb36a20,
  emissiveIntensity: 1.2,
});
const trunkGeometry = new THREE.CylinderGeometry(0.17, 0.27, 3.8, 5);
const pineCrownGeometry = new THREE.ConeGeometry(2.25, 5.4, 6);
const roundCrownGeometry = new THREE.DodecahedronGeometry(2.25, 0);
const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const persistentWorldGeometries = new Set([
  trunkGeometry,
  pineCrownGeometry,
  roundCrownGeometry,
  unitBoxGeometry,
  ...Object.values(buildingGeometries),
]);
const persistentWorldMaterials = new Set([
  airlockFrameMaterial,
  airlockAccentMaterial,
  tramRailMaterial,
  tramBodyMaterial,
  tramGlassMaterial,
  tramLightMaterial,
  ...Object.values(buildingMaterials),
]);
let world;
let ready = false;
let torusHomeReady = !combinedHomeMode;
let torusHomeAssets = null;
let torusHomeLoading = { house: 'waiting', collision: 'waiting' };
let startupErrorMessage = '';
let lastFrame = performance.now();
let lastStatsTime = 0;
let currentTileKey = '';
let pendingChunkKeys = [];
let pendingSceneryKeys = [];
let landmarkMeshes = [];
let backdrop;
let exteriorStars;
let tramRoot;
let worldStructureRoot = new THREE.Group();
worldStructureRoot.name = 'seeded cylinder structures';
scene.add(worldStructureRoot);
let tramPositionZ = 0;
let tramDestinationZ = 0;
let tramRiding = false;
let tramAtStation = true;
let playerOutside = false;
let interactQueued = false;
const outsidePosition = new THREE.Vector3();
const chunks = new Map();
const placementCache = new Map();
const chunkRoots = new THREE.Group();
chunkRoots.name = 'streamed terrain and scenery';
scene.add(chunkRoots);

const player = {
  s: 0, z: 0, yaw: 0, pitch: 0, elevation: 0,
  verticalVelocity: 0, flying: false, axisSide: false, fallTargetSide: -1, lastFlightDirection: -1,
};
const keys = new Set();
const touchIntent = { forward: 0, strafe: 0, jumpHeld: false, jumpPressed: false, descendHeld: false };
let touchMovePointer = null;
let touchLookPointer = null;
let touchJumpPointer = null;
let touchDescendPointer = null;
let lastTouchX = 0;
let lastTouchY = 0;
let dragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let runToggled = false;
let runKeyHeld = false;
let pointerLocked = false;
let jumpQueued = false;
const lastJumpTap = { keyboard: -Infinity, touch: -Infinity, gamepad: -Infinity };
let lastForwardTap = -Infinity;
let lastGamepadForwardTap = -Infinity;
let gamepadForwardHeld = false;
let previousGamepadButtons = [];
let activeGamepadIdentity = '';
const compassNeedle = document.querySelector('#compass-needle');
const headingCompass = document.querySelector('#heading-compass');
const headingReading = document.querySelector('#heading-reading');
const headingDetail = document.querySelector('#heading-detail');
const regionLabel = document.querySelector('#region');
const movementSpeedMode = document.querySelector('#movement-speed-mode');
const movementSpeedValue = document.querySelector('#movement-speed-value');

const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const surfaceOrigin = new THREE.Vector3();
const viewDirection = new THREE.Vector3();
const flatForward = new THREE.Vector3();
const instanceMatrix = new THREE.Matrix4();
const instanceScale = new THREE.Vector3();

const GAMEPAD_DEADZONE = 0.16;
const GAMEPAD_LOOK_SPEED = 2.6;
const DOUBLE_TAP_MS = 280;
const WALK_SPEED_MPS = 4.6;
const AIRLOCK_CLEAR_RADIUS = 20;
const AIRLOCK_TUNNEL_HALF_LENGTH = 46;
const AIRLOCK_STATION_OFFSET = 20;
const EXTERIOR_MAX_DISTANCE = 1000;
const TRAM_SPEED_MPS = 220;
const GAMEPAD_ACCELERATION_FRACTION = 0.14;
const GAMEPAD_BRAKE_MULTIPLIER = 1.5;
let runningSpeedMps = 10;
let flyingSpeedMps = 1000;
let movementSpeedMps = WALK_SPEED_MPS;
let controllerRampSpeedMps = WALK_SPEED_MPS;
let controllerSpeedRampActive = false;
let controllerSpeedMode = 'walk';
let controlsPanelOpen = false;

function getSeed(config) {
  const requested = new URLSearchParams(location.search).get('seed');
  if (requested === null || requested.trim() === '') return config.defaultSeed >>> 0;
  const numeric = Number(requested);
  return Number.isFinite(numeric) ? numeric >>> 0 : seedFromString(requested);
}

function makeBackdrop() {
  if (backdrop) {
    scene.remove(backdrop);
    backdrop.geometry.dispose();
  }
  const geometry = world.buildOppositeSideGeometry();
  backdrop = new THREE.Mesh(geometry, backdropMaterial);
  backdrop.name = 'fogged far-surface fallback behind streamed terrain';
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);
}

function addRod(parent, start, end, radius, material) {
  const direction = end.clone().sub(start);
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 8),
    material,
  );
  rod.position.copy(start).add(end).multiplyScalar(0.5);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(rod);
  return rod;
}

function addAirlock(sign) {
  const endZ = sign * world.axialHalfLength;
  const airlock = new THREE.Group();
  airlock.name = `${sign > 0 ? 'positive' : 'negative'} axial open airlock`;
  airlock.position.z = endZ;

  const tunnel = new THREE.Mesh(
    new THREE.CylinderGeometry(AIRLOCK_CLEAR_RADIUS + 5, AIRLOCK_CLEAR_RADIUS + 5,
      AIRLOCK_TUNNEL_HALF_LENGTH * 2, 32, 1, true),
    airlockFrameMaterial,
  );
  tunnel.rotation.x = Math.PI / 2;
  tunnel.name = 'open pressure tunnel';
  airlock.add(tunnel);

  const frameGeometry = new THREE.TorusGeometry(AIRLOCK_CLEAR_RADIUS + 4, 1.7, 8, 48);
  for (const offset of [-AIRLOCK_TUNNEL_HALF_LENGTH + 4, 0, AIRLOCK_TUNNEL_HALF_LENGTH - 4]) {
    const frame = new THREE.Mesh(frameGeometry, airlockFrameMaterial);
    frame.position.z = sign * offset;
    frame.name = 'open airlock frame';
    airlock.add(frame);
  }

  // The doors are visibly parked beside the opening; the axial passage stays clear.
  const parkedDoorGeometry = new THREE.BoxGeometry(7, AIRLOCK_CLEAR_RADIUS * 2 + 5, 18);
  for (const side of [-1, 1]) {
    const door = new THREE.Mesh(parkedDoorGeometry, airlockAccentMaterial);
    door.position.set(side * (AIRLOCK_CLEAR_RADIUS + 10), 0, sign * 12);
    door.name = 'open airlock door leaf';
    airlock.add(door);
    for (const level of [-1, 1]) {
      const lamp = new THREE.Mesh(unitBoxGeometry, tramLightMaterial);
      lamp.scale.set(2.4, 0.45, 0.8);
      lamp.position.set(side * (AIRLOCK_CLEAR_RADIUS + 6), level * (AIRLOCK_CLEAR_RADIUS + 3), sign * 38);
      airlock.add(lamp);
    }
  }

  const outerDockZ = sign * (AIRLOCK_TUNNEL_HALF_LENGTH + 64);
  const dockRing = new THREE.Mesh(
    new THREE.TorusGeometry(AIRLOCK_CLEAR_RADIUS + 16, 1.2, 8, 48),
    airlockFrameMaterial,
  );
  dockRing.position.z = outerDockZ;
  dockRing.name = 'external airlock docking ring';
  airlock.add(dockRing);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const start = new THREE.Vector3(
      Math.cos(angle) * (AIRLOCK_CLEAR_RADIUS + 3),
      Math.sin(angle) * (AIRLOCK_CLEAR_RADIUS + 3),
      sign * (AIRLOCK_TUNNEL_HALF_LENGTH - 2),
    );
    const end = new THREE.Vector3(
      Math.cos(angle) * (AIRLOCK_CLEAR_RADIUS + 16),
      Math.sin(angle) * (AIRLOCK_CLEAR_RADIUS + 16),
      outerDockZ,
    );
    addRod(airlock, start, end, 0.65, airlockFrameMaterial);
  }
  worldStructureRoot.add(airlock);
}

function addExteriorStars() {
  let seed = (world.seed ^ 0x7f4a7c15) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = [];
  for (const sign of [-1, 1]) {
    const centerZ = sign * (world.axialHalfLength + 650);
    for (let i = 0; i < 700; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 240 + Math.sqrt(random()) * 1200;
      positions.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        centerZ + (random() - 0.5) * 1500,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xb9d1df,
    size: 1.5,
    sizeAttenuation: false,
    fog: false,
    toneMapped: false,
  });
  exteriorStars = new THREE.Points(geometry, material);
  exteriorStars.name = 'seeded exterior stars';
  worldStructureRoot.add(exteriorStars);
}

function addCylinderEndcaps() {
  world.hullRadius = world.hullRadius || world.radius + (world.groundDepth || 500);
  worldStructureRoot.add(createExteriorStructures(THREE, world));
  for (const sign of [-1, 1]) addAirlock(sign);
  addExteriorStars();
}

function addLandmarks() {
  landmarkMeshes = [];
  for (const landmark of world.landmarks || []) {
    const geometry = buildingGeometries[landmark.kind];
    const material = buildingMaterials[landmark.kind];
    if (!geometry || !material) continue;
    const terrainHeight = world.terrainHeight(landmark.s, landmark.z);
    const pose = world.pointAtHeight(landmark.s, landmark.z, terrainHeight + landmark.height / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pose.position);
    mesh.quaternion.copy(makeSurfaceQuaternion(pose, landmark.yaw || 0));
    mesh.scale.set(landmark.width, landmark.height, landmark.depth);
    mesh.name = `seeded landmark · ${landmark.kind}`;
    mesh.userData.landmark = landmark;
    mesh.frustumCulled = false;
    mesh.visible = false;
    worldStructureRoot.add(mesh);
    landmarkMeshes.push(mesh);
  }
}

function updateLandmarkVisibility() {
  if (!world || !landmarkMeshes.length) return;
  const range = Number(world.config.streaming.sceneryDistanceMeters) || 800;
  const centerS = visibleSurfaceS();
  for (const mesh of landmarkMeshes) {
    const landmark = mesh.userData.landmark;
    const reach = range + Math.hypot(landmark.width, landmark.depth) / 2;
    const distanceS = Math.abs(world.shortestDeltaS(landmark.s, centerS));
    const distanceZ = landmark.z - player.z;
    mesh.visible = !playerOutside && distanceS * distanceS + distanceZ * distanceZ <= reach * reach;
  }
}

function addTramSystem() {
  const trackEnd = world.axialHalfLength + AIRLOCK_TUNNEL_HALF_LENGTH;
  const trackLength = trackEnd * 2;
  const railGeometry = new THREE.BoxGeometry(0.48, 0.42, trackLength);
  for (const x of [-3.8, 3.8]) {
    const rail = new THREE.Mesh(railGeometry, tramRailMaterial);
    rail.position.set(x, -3.6, 0);
    rail.name = 'center-axis tram rail';
    worldStructureRoot.add(rail);
  }

  const sleeperGeometry = new THREE.BoxGeometry(10, 0.42, 1.25);
  const sleeperCount = Math.ceil(trackLength / 48) + 1;
  const sleepers = new THREE.InstancedMesh(sleeperGeometry, tramRailMaterial, sleeperCount);
  const sleeperMatrix = new THREE.Matrix4();
  for (let i = 0; i < sleeperCount; i++) {
    const z = -trackEnd + i * 48;
    sleeperMatrix.makeTranslation(0, -3.88, z);
    sleepers.setMatrixAt(i, sleeperMatrix);
  }
  sleepers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  sleepers.instanceMatrix.needsUpdate = true;
  sleepers.computeBoundingSphere();
  sleepers.name = 'procedural tram sleepers';
  worldStructureRoot.add(sleepers);

  tramRoot = new THREE.Group();
  tramRoot.name = 'zero-g center-axis tram';
  const floor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.48, 24), tramBodyMaterial);
  floor.position.y = -1.6;
  tramRoot.add(floor);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.38, 24), tramBodyMaterial);
  roof.position.y = 2.1;
  tramRoot.add(roof);
  for (const x of [-3.75, 3.75]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 19), tramGlassMaterial);
    window.position.set(x, 0.25, 0);
    tramRoot.add(window);
    for (const z of [-11, 11]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 4, 0.34), tramBodyMaterial);
      post.position.set(x, 0.2, z);
      tramRoot.add(post);
    }
    for (const y of [-1.55, 1.95]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 23), tramBodyMaterial);
      beam.position.set(x, y, 0);
      tramRoot.add(beam);
    }
  }
  const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 0.16), tramGlassMaterial);
  frontWindow.position.set(0, 0.22, 11.5);
  tramRoot.add(frontWindow);
  const rearWindow = frontWindow.clone();
  rearWindow.position.z = -11.5;
  tramRoot.add(rearWindow);
  for (const z of [-11.3, 11.3]) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.25), tramLightMaterial);
    marker.position.set(0, 1.45, z);
    tramRoot.add(marker);
  }
  tramRoot.position.z = tramPositionZ;
  worldStructureRoot.add(tramRoot);
}

function makeTransform(pose, yaw, scale, offset = 0) {
  const position = pose.position.clone();
  if (offset) position.addScaledVector(pose.up, offset);
  const quaternion = makeSurfaceQuaternion(pose, yaw);
  instanceMatrix.compose(position, quaternion, scale);
  return instanceMatrix;
}

function addInstances(group, geometry, material, placements, transform) {
  if (!placements.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  placements.forEach((placement, index) => mesh.setMatrixAt(index, transform(placement)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
  return mesh;
}

function addTrees(group, placements) {
  const pineTrees = placements.filter(tree => tree.kind === 'pine');
  const roundTrees = placements.filter(tree => tree.kind === 'round');
  const setTrunk = tree => {
    const pose = world.surfacePose(tree.s, tree.z);
    const scale = tree.scale;
    const size = instanceScale.set(scale, scale, scale);
    return makeTransform(pose, tree.yaw, size, 1.9 * scale);
  };
  addInstances(group, trunkGeometry, barkMaterial, placements, setTrunk);

  addInstances(group, pineCrownGeometry, pineMaterial, pineTrees, tree => {
    const pose = world.surfacePose(tree.s, tree.z);
    return makeTransform(pose, tree.yaw, instanceScale.setScalar(tree.scale), 4.15 * tree.scale);
  });
  addInstances(group, roundCrownGeometry, roundTreeMaterial, roundTrees, tree => {
    const pose = world.surfacePose(tree.s, tree.z);
    const scale = tree.scale;
    return makeTransform(pose, tree.yaw, instanceScale.set(scale, scale * 0.92, scale), 4 * scale);
  });
}

function addBuildings(group, placements) {
  const byKind = new Map();
  for (const building of placements) {
    if (!buildingGeometries[building.kind]) continue;
    if (!byKind.has(building.kind)) byKind.set(building.kind, []);
    byKind.get(building.kind).push(building);
  }
  for (const [kind, buildings] of byKind) {
    addInstances(group, buildingGeometries[kind], buildingMaterials[kind], buildings, building => {
      const pose = world.surfacePose(building.s, building.z);
      const scale = instanceScale.set(building.width, building.height, building.depth);
      return makeTransform(pose, building.yaw, scale, building.height / 2);
    });
  }
}

function addWaterBodies(group, column, row) {
  if (!world.waterBodiesForChunk) return;
  const sizeS = world.circumferentialChunkSize;
  const z0 = world.chunkStartZ(row);
  const chunkStartS = column * sizeS;
  const chunkCenterS = chunkStartS + sizeS / 2;
  const chunkEndS = chunkStartS + sizeS;
  const chunkEndZ = z0 + world.chunkSize;

  for (const body of world.waterBodiesForChunk(column, row)) {
    const radiusS = Math.max(1, body.radiusS || body.radius || 1);
    const radiusZ = Math.max(1, body.radiusZ || body.radius || 1);
    const yaw = body.yaw || 0;
    const extentS = Math.hypot(radiusS * Math.cos(yaw), radiusZ * Math.sin(yaw));
    const extentZ = Math.hypot(radiusS * Math.sin(yaw), radiusZ * Math.cos(yaw));
    const centerS = chunkCenterS - world.shortestDeltaS(chunkCenterS, body.s);
    const centerZ = body.z;
    const minS = Math.max(chunkStartS, centerS - extentS);
    const maxS = Math.min(chunkEndS, centerS + extentS);
    const minZ = Math.max(z0, centerZ - extentZ);
    const maxZ = Math.min(chunkEndZ, centerZ + extentZ);
    if (minS >= maxS || minZ >= maxZ) continue;

    const step = body.type === 'sea' ? 28 : 12;
    const columns = Math.max(1, Math.ceil((maxS - minS) / step));
    const rows = Math.max(1, Math.ceil((maxZ - minZ) / step));
    const positions = [];
    const valid = new Uint8Array((columns + 1) * (rows + 1));
    const points = new Int32Array(valid.length);
    points.fill(-1);
    const waterLevel = Number.isFinite(body.waterLevel) ? body.waterLevel : 0;

    for (let iz = 0; iz <= rows; iz++) {
      const z = minZ + (maxZ - minZ) * iz / rows;
      for (let ix = 0; ix <= columns; ix++) {
        const s = minS + (maxS - minS) * ix / columns;
        const ds = world.shortestDeltaS(s, centerS);
        const dz = z - centerZ;
        const localS = ds * Math.cos(yaw) + dz * Math.sin(yaw);
        const localZ = -ds * Math.sin(yaw) + dz * Math.cos(yaw);
        const inside = (localS * localS) / (radiusS * radiusS)
          + (localZ * localZ) / (radiusZ * radiusZ) <= 1;
        if (!inside || world.terrainHeight(s, z) > waterLevel) continue;
        const index = iz * (columns + 1) + ix;
        const point = world.pointAtHeight(s, z, waterLevel).position;
        point.toArray(positions, positions.length);
        points[index] = positions.length / 3 - 1;
        valid[index] = 1;
      }
    }

    const indices = [];
    for (let iz = 0; iz < rows; iz++) {
      for (let ix = 0; ix < columns; ix++) {
        const a = iz * (columns + 1) + ix;
        const b = a + 1;
        const c = a + columns + 1;
        const d = c + 1;
        if (!valid[a] || !valid[b] || !valid[c] || !valid[d]) continue;
        indices.push(points[a], points[c], points[b], points[b], points[c], points[d]);
      }
    }
    if (!indices.length) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, body.type === 'sea' ? seaMaterial : lakeMaterial);
    mesh.name = body.type === 'sea' ? 'terrain-conforming seeded inland sea' : 'terrain-conforming seeded lake';
    mesh.userData.streamGeometry = true;
    group.add(mesh);
  }
}

function addWaterfalls(group, column, row) {
  if (!world.waterfallsForChunk) return;
  for (const fall of world.waterfallsForChunk(column, row)) {
    const width = Math.max(2, Number(fall.width) || 2);
    const topHeight = Number(fall.topHeight);
    const bottomHeight = Number(fall.bottomHeight);
    if (!Number.isFinite(topHeight) || !Number.isFinite(bottomHeight) || topHeight <= bottomHeight) continue;
    const acrossAxis = fall.orientation === 'longitudinal' || fall.orientation === 'axial' ? 's' : 'z';
    const positions = [];
    for (const height of [topHeight, bottomHeight]) {
      for (const offset of [-width / 2, width / 2]) {
        const s = fall.s + (acrossAxis === 's' ? offset : 0);
        const z = fall.z + (acrossAxis === 'z' ? offset : 0);
        world.pointAtHeight(s, z, height).position.toArray(positions, positions.length);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, waterfallMaterial);
    mesh.name = 'procedural terrain waterfall';
    mesh.userData.streamGeometry = true;
    group.add(mesh);
  }
}

function isInsideTorusHomeClearing(s, z, extraRadius = 0) {
  const site = world?.torusHomeSite;
  if (!site) return false;
  const ds = world.shortestDeltaS(s, site.s);
  return Math.hypot(ds, z - site.z) < site.clearanceRadius + extraRadius;
}

function addRoads(group, roads, column, row) {
  if (!roads.length) return;
  const sizeS = world.circumferentialChunkSize;
  const z0 = world.chunkStartZ(row);
  const buckets = {
    local: { positions: [], indices: [], shoulders: [], shoulderIndices: [] },
    arterial: { positions: [], indices: [], shoulders: [], shoulderIndices: [] },
  };
  for (const road of roads) {
    const bucket = buckets[road.kind === 'arterial' ? 'arterial' : 'local'];
    const dx = road.endS - road.startS;
    const dz = road.endZ - road.startZ;
    const length = Math.hypot(dx, dz);
    if (length < 0.2) continue;
    const aS = column * sizeS + road.startS;
    const aZ = z0 + road.startZ;
    const segments = Math.max(1, Math.ceil(length / 6));
    const roadBase = bucket.positions.length / 3;
    const shoulderBase = bucket.shoulders.length / 3;
    const shoulderHalfWidth = road.width / 2 + 1.1;
    const stationDry = new Uint8Array(segments + 1);
    const crossSection = (t, lateral, edgeOffset = 0) => {
      const centerS = aS + dx * t;
      const centerZ = aZ + dz * t;
      const s = centerS + (-dz / length) * lateral;
      const z = centerZ + (dx / length) * lateral;
      let height = world.terrainHeight(s, z) + edgeOffset;

      if (world.riverDistance && world.riverWaterHeight) {
        const riverDistance = world.riverDistance(centerS, centerZ);
        const bridgeReach = (world.riverWidth || 20) / 2 + 12;
        if (riverDistance < bridgeReach) {
          const bridgeHeight = world.riverWaterHeight(centerS, centerZ) + 2.6;
          const bridgeBlend = 1 - THREE.MathUtils.smoothstep(riverDistance, (world.riverWidth || 20) / 2, bridgeReach);
          height += Math.max(0, bridgeHeight - height) * bridgeBlend;
        }
      }

      return world.pointAtHeight(s, z, height).position;
    };

    for (let station = 0; station <= segments; station++) {
      const t = station / segments;
      const centerS = aS + dx * t;
      const centerZ = aZ + dz * t;
      const halfStation = length / segments / 2;
      const halfS = Math.abs(dx / length) * halfStation
        + Math.abs(dz / length) * shoulderHalfWidth;
      const halfZ = Math.abs(dz / length) * halfStation
        + Math.abs(dx / length) * shoulderHalfWidth;
      stationDry[station] = world.isUnderWater?.(centerS, centerZ, halfS, halfZ)
        || isInsideTorusHomeClearing(centerS, centerZ, road.width / 2 + 1)
        ? 0
        : 1;
      for (const lateral of [-road.width / 2, 0, road.width / 2]) {
        const camber = Math.abs(lateral) < 0.001 ? 0.12 : 0.04;
        crossSection(t, lateral, camber).toArray(bucket.positions, bucket.positions.length);
      }
      for (const lateral of [-shoulderHalfWidth, -road.width / 2, road.width / 2, shoulderHalfWidth]) {
        crossSection(t, lateral, 0.015).toArray(bucket.shoulders, bucket.shoulders.length);
      }
    }

    for (let station = 0; station < segments; station++) {
      if (!stationDry[station] || !stationDry[station + 1]) continue;
      const roadA = roadBase + station * 3;
      const roadB = roadA + 3;
      bucket.indices.push(
        roadA, roadA + 1, roadB,
        roadA + 1, roadB + 1, roadB,
        roadA + 1, roadA + 2, roadB + 1,
        roadA + 2, roadB + 2, roadB + 1,
      );

      const shoulderA = shoulderBase + station * 4;
      const shoulderB = shoulderA + 4;
      bucket.shoulderIndices.push(
        shoulderA, shoulderA + 1, shoulderB,
        shoulderA + 1, shoulderB + 1, shoulderB,
        shoulderA + 2, shoulderA + 3, shoulderB + 2,
        shoulderA + 3, shoulderB + 3, shoulderB + 2,
      );
    }
  }

  for (const kind of ['local', 'arterial']) {
    const values = buckets[kind];
    if (values.shoulderIndices.length) {
      const shoulderGeometry = new THREE.BufferGeometry();
      shoulderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(values.shoulders, 3));
      shoulderGeometry.setIndex(values.shoulderIndices);
      shoulderGeometry.computeVertexNormals();
      shoulderGeometry.computeBoundingSphere();
      const shoulderMesh = new THREE.Mesh(shoulderGeometry, roadShoulderMaterial);
      shoulderMesh.name = `${kind} graded shoulders ${column}:${row}`;
      shoulderMesh.userData.streamGeometry = true;
      group.add(shoulderMesh);
    }
    if (values.indices.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(values.positions, 3));
      geometry.setIndex(values.indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, kind === 'arterial' ? arterialRoadMaterial : localRoadMaterial);
      mesh.name = `${kind} terrain-graded roads ${column}:${row}`;
      mesh.userData.streamGeometry = true;
      group.add(mesh);
    }
  }
}

function addFarmland(group, fields, column, row) {
  if (!fields.length) return;
  const sizeS = world.circumferentialChunkSize;
  const z0 = world.chunkStartZ(row);
  const placements = [[], []];
  for (const field of fields) {
    const rowCount = Math.max(1, Math.round(field.rows));
    const segmentLength = 24;
    const segmentCount = Math.ceil(field.depth / segmentLength);
    const stripeWidth = Math.max(0.8, Math.min(field.furrowSpacing * 0.58, field.width / rowCount * 0.64));
    for (let r = 0; r < rowCount; r++) {
      const offset = (r + 0.5) / rowCount * field.width - field.width / 2;
      const materialIndex = r % 2;
      for (let segment = 0; segment < segmentCount; segment++) {
        const currentLength = Math.min(segmentLength, field.depth - segment * segmentLength);
        const along = -field.depth / 2 + segment * segmentLength + currentLength / 2;
        const ds = offset * Math.cos(field.yaw) + along * Math.sin(field.yaw);
        const dz = -offset * Math.sin(field.yaw) + along * Math.cos(field.yaw);
        const s = column * sizeS + field.localS + ds;
        const z = z0 + field.localZ + dz;
        const pose = world.surfacePose(s, z);
        pose.position.addScaledVector(pose.up, 0.06);
        const localYaw = field.yaw;
        placements[materialIndex].push({
          position: pose.position,
          quaternion: makeSurfaceQuaternion(pose, localYaw),
          scale: new THREE.Vector3(stripeWidth, 0.1, currentLength),
        });
      }
    }
  }
  placements.forEach((instances, index) => {
    if (!instances.length) return;
    const mesh = new THREE.InstancedMesh(unitBoxGeometry, fieldFurrowMaterials[index], instances.length);
    instances.forEach((instance, i) => {
      instanceMatrix.compose(instance.position, instance.quaternion, instance.scale);
      mesh.setMatrixAt(i, instanceMatrix);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = 'procedural crop furrows';
    group.add(mesh);
  });
}

function buildChunk(column, row) {
  const key = `${column}:${row}`;
  if (chunks.has(key)) return;
  const group = new THREE.Group();
  group.name = `land chunk ${key}`;

  const terrainGeometry = world.buildTerrainGeometry(column, row);
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = `terrain ${key}`;
  terrain.frustumCulled = true;
  terrain.userData.streamGeometry = true;
  group.add(terrain);

  const riverGeometry = world.buildRiverGeometry(column, row);
  if (riverGeometry) {
    const river = new THREE.Mesh(riverGeometry, riverMaterial);
    river.name = `river ${key}`;
    river.userData.streamGeometry = true;
    group.add(river);
  }

  addWaterBodies(group, column, row);
  addWaterfalls(group, column, row);
  chunkRoots.add(group);
  chunks.set(key, group);
  if (wantsScenery(column, row)) pendingSceneryKeys.push(key);
}

function buildChunkScenery(column, row) {
  const key = `${column}:${row}`;
  const chunk = chunks.get(key);
  if (!chunk || chunk.userData.sceneryGroup || !wantsScenery(column, row)) return;
  const placements = getPlacements(column, row);
  const group = new THREE.Group();
  group.name = `nearby scenery ${key}`;
  addTrees(group, placements.trees);
  addBuildings(group, placements.buildings);
  addRoads(group, placements.roads, column, row);
  addFarmland(group, placements.farmland, column, row);
  chunk.userData.sceneryGroup = group;
  chunk.add(group);
}

function getPlacements(column, row) {
  const key = `${column}:${row}`;
  if (!placementCache.has(key)) {
    const placements = world.generatePlacements(column, row);
    if (world.torusHomeSite) {
      placements.trees = placements.trees.filter(tree => (
        !isInsideTorusHomeClearing(tree.s, tree.z, tree.scale * 3)
      ));
      placements.buildings = placements.buildings.filter(building => (
        !isInsideTorusHomeClearing(
          building.s,
          building.z,
          Math.hypot(building.width / 2, building.depth / 2),
        )
      ));
      placements.farmland = placements.farmland.filter(plot => {
        const s = column * world.circumferentialChunkSize + plot.localS;
        const z = world.chunkStartZ(row) + plot.localZ;
        return !isInsideTorusHomeClearing(s, z, Math.hypot(plot.width / 2, plot.depth / 2));
      });
    }
    placementCache.set(key, placements);
  }
  return placementCache.get(key);
}

function disposeChunk(key) {
  const group = chunks.get(key);
  if (!group) return;
  chunkRoots.remove(group);
  group.traverse(object => {
    if (object.isMesh && object.userData.streamGeometry) object.geometry.dispose();
  });
  chunks.delete(key);
}

function disposeChunkScenery(group) {
  const scenery = group?.userData.sceneryGroup;
  if (!scenery) return;
  group.remove(scenery);
  scenery.traverse(object => {
    if (object.isMesh && object.userData.streamGeometry) object.geometry.dispose();
  });
  group.userData.sceneryGroup = null;
}

function disposeWorldStructures() {
  if (!worldStructureRoot) return;
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  worldStructureRoot.traverse(object => {
    if (object.geometry
      && !persistentWorldGeometries.has(object.geometry)
      && !disposedGeometries.has(object.geometry)) {
      object.geometry.dispose();
      disposedGeometries.add(object.geometry);
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material
        && !persistentWorldMaterials.has(material)
        && !disposedMaterials.has(material)) {
        material.dispose();
        disposedMaterials.add(material);
      }
    }
  });
  scene.remove(worldStructureRoot);
  worldStructureRoot.clear();
  worldStructureRoot = new THREE.Group();
  worldStructureRoot.name = 'seeded cylinder structures';
  scene.add(worldStructureRoot);
  landmarkMeshes = [];
  exteriorStars = null;
  tramRoot = null;
}

function visibleSurfaceS() {
  if (playerOutside || tramRiding) return player.s;
  return world.wrapS(player.s + (player.axisSide ? world.circumference / 2 : 0));
}

function circumferentialChordDistance(s, referenceS) {
  const arcDistance = Math.abs(world.shortestDeltaS(s, referenceS));
  return 2 * world.radius * Math.sin(arcDistance / (2 * world.radius));
}

function neededChunks() {
  const { chunkSize, circumferenceChunks, axialHalfLength } = world;
  const circumferenceChunkSize = world.circumferentialChunkSize;
  const viewS = visibleSurfaceS();
  const circumferenceColumn = Math.floor(viewS / circumferenceChunkSize);
  const axialRows = Math.ceil(world.config.surface.axialLengthMeters / chunkSize);
  const axialRow = THREE.MathUtils.clamp(
    Math.floor((player.z + axialHalfLength) / chunkSize),
    0,
    axialRows - 1,
  );
  const radius = world.config.streaming.visualDistanceMeters
    + Math.hypot(circumferenceChunkSize, chunkSize) / 2;
  // Reach the opposite wall by converting the visual radius to its ring arc.
  const maximumArcReach = 2 * world.radius * Math.asin(
    THREE.MathUtils.clamp(radius / (2 * world.radius), 0, 1),
  );
  const reachS = Math.ceil(maximumArcReach / circumferenceChunkSize) + 1;
  const reachZ = Math.ceil(radius / chunkSize) + 1;
  const targets = new Map();
  for (let dx = -reachS; dx <= reachS; dx++) {
    const column = mod(circumferenceColumn + dx, circumferenceChunks);
    const centerS = column * circumferenceChunkSize + circumferenceChunkSize / 2;
    const chordDistanceS = circumferentialChordDistance(centerS, viewS);
    for (let dz = -reachZ; dz <= reachZ; dz++) {
      const row = axialRow + dz;
      if (row < 0 || row >= axialRows) continue;
      const centerZ = world.chunkStartZ(row) + chunkSize / 2;
      const distanceZ = Math.abs(centerZ - player.z);
      if (Math.hypot(chordDistanceS, distanceZ) > radius) continue;
      const key = `${column}:${row}`;
      targets.set(key, { column, row, distance: chordDistanceS * chordDistanceS + distanceZ * distanceZ });
    }
  }
  return targets;
}

function surfaceTileKey(s, z) {
  const axialRows = Math.ceil(world.config.surface.axialLengthMeters / world.chunkSize);
  const column = Math.floor(world.wrapS(s) / world.circumferentialChunkSize);
  const row = THREE.MathUtils.clamp(
    Math.floor((z + world.axialHalfLength) / world.chunkSize),
    0,
    axialRows - 1,
  );
  return `${column}:${row}`;
}

function chunkDistanceSquared(column, row) {
  const centerS = column * world.circumferentialChunkSize + world.circumferentialChunkSize / 2;
  const centerZ = world.chunkStartZ(row) + world.chunkSize / 2;
  const distanceS = circumferentialChordDistance(centerS, visibleSurfaceS());
  const distanceZ = Math.abs(centerZ - player.z);
  return distanceS * distanceS + distanceZ * distanceZ;
}

function wantsScenery(column, row) {
  if (playerOutside) return false;
  const radius = Number(world.config.streaming.sceneryDistanceMeters) || 800;
  const paddedRadius = radius + Math.hypot(world.circumferentialChunkSize, world.chunkSize) / 2;
  return chunkDistanceSquared(column, row) <= paddedRadius * paddedRadius;
}

function reconcileChunks() {
  const needed = neededChunks();
  for (const key of placementCache.keys()) {
    if (!needed.has(key)) placementCache.delete(key);
  }
  for (const key of chunks.keys()) {
    if (!needed.has(key)) disposeChunk(key);
  }
  const sceneryTargets = [];
  for (const [key, group] of chunks) {
    const [column, row] = key.split(':').map(Number);
    if (!wantsScenery(column, row)) {
      disposeChunkScenery(group);
      placementCache.delete(key);
    } else if (!group.userData.sceneryGroup) {
      sceneryTargets.push({ key, distance: chunkDistanceSquared(column, row) });
    }
  }
  pendingSceneryKeys = sceneryTargets
    .sort((a, b) => a.distance - b.distance)
    .map(target => target.key);
  pendingChunkKeys = [...needed.entries()]
    .filter(([key]) => !chunks.has(key))
    .sort((a, b) => a[1].distance - b[1].distance)
    .map(([key]) => key);
  currentTileKey = surfaceTileKey(visibleSurfaceS(), player.z);
}

function startupTerrainChunkKeys() {
  if (!world) return [];
  const sizeS = world.circumferentialChunkSize;
  const columnCount = world.circumferenceChunks;
  const rowCount = Math.ceil(world.config.surface.axialLengthMeters / world.chunkSize);
  const centerColumn = Math.floor(world.wrapS(visibleSurfaceS()) / sizeS);
  const centerRow = THREE.MathUtils.clamp(
    Math.floor((player.z + world.axialHalfLength) / world.chunkSize),
    0,
    rowCount - 1,
  );
  const keys = [];
  for (let dx = -1; dx <= 1; dx++) {
    const column = mod(centerColumn + dx, columnCount);
    for (let dz = -1; dz <= 1; dz++) {
      const row = centerRow + dz;
      if (row >= 0 && row < rowCount) keys.push(`${column}:${row}`);
    }
  }
  return keys;
}

function updateStartupReadiness() {
  if (ready || !world || worldRegenerationInProgress) return;
  if (startupErrorMessage) {
    loading.hidden = false;
    loadingStatus.textContent = startupErrorMessage;
    return;
  }
  const starterKeys = startupTerrainChunkKeys();
  const loadedStarterCount = starterKeys.filter(key => chunks.has(key)).length;
  const terrainReady = starterKeys.length > 0 && loadedStarterCount === starterKeys.length;
  const allRequiredAssetsReady = !combinedHomeMode || torusHomeReady;
  if (terrainReady && allRequiredAssetsReady) {
    ready = true;
    loading.hidden = true;
    loadingStatus.textContent = 'Nearby terrain is ready. The rest of the habitat continues streaming.';
    return;
  }

  loading.hidden = false;
  const terrainStatus = `nearby terrain ${loadedStarterCount}/${starterKeys.length} chunks`;
  if (combinedHomeMode && !torusHomeReady) {
    const houseStatus = `${torusHomeLoading.house} · collision ${torusHomeLoading.collision}`;
    loadingStatus.textContent = `Loading Torus Home (${houseStatus}) while preparing ${terrainStatus}…`;
  } else {
    loadingStatus.textContent = `Preparing your starting area · ${terrainStatus}…`;
  }
  progress.style.width = `${starterKeys.length ? (loadedStarterCount / starterKeys.length) * 100 : 0}%`;
}

function processChunkQueue() {
  const limit = isTouch ? 1 : world.config.streaming.chunksBuiltPerFrame;
  for (let i = 0; i < limit && pendingChunkKeys.length; i++) {
    const key = pendingChunkKeys.shift();
    const [column, row] = key.split(':').map(Number);
    buildChunk(column, row);
  }
  const sceneryLimit = !ready
    ? 0
    : isTouch
      ? 1
      : world.config.streaming.sceneryBuiltPerFrame || 2;
  for (let i = 0; i < sceneryLimit && pendingSceneryKeys.length; i++) {
    const key = pendingSceneryKeys.shift();
    const [column, row] = key.split(':').map(Number);
    buildChunkScenery(column, row);
  }
  const loaded = chunks.size;
  const total = loaded + pendingChunkKeys.length + pendingSceneryKeys.length;
  if (ready) {
    progress.style.width = total ? `${(loaded / total) * 100}%` : '100%';
    loadingStatus.textContent = pendingChunkKeys.length || pendingSceneryKeys.length
      ? `Streaming the remaining landscape · ${loaded} chunks loaded · ${pendingChunkKeys.length} terrain / ${pendingSceneryKeys.length} scenery queued`
      : 'The seeded landscape is ready.';
  }
  updateStartupReadiness();
}

function updateBackdrop() {
  if (backdrop) backdrop.visible = !playerOutside;
}

function syncCamera() {
  const exteriorView = playerOutside;
  const tramView = tramRiding;
  const pose = !exteriorView && !tramView
    ? world.surfacePose(player.s, player.z, playerEyeHeight + player.elevation)
    : null;
  if (exteriorView) {
    camera.position.copy(outsidePosition);
    camera.up.set(0, 1, 0);
    flatForward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  } else if (tramView) {
    camera.position.set(0, 0, player.z);
    camera.up.set(0, 1, 0);
    flatForward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  } else {
    camera.position.copy(pose.position);
    camera.up.copy(pose.up);
    flatForward.copy(pose.axis).multiplyScalar(Math.cos(player.yaw))
      .addScaledVector(pose.tangent, Math.sin(player.yaw));
  }
  const cameraUp = exteriorView || tramView ? camera.up : pose.up;
  viewDirection.copy(flatForward).multiplyScalar(Math.cos(player.pitch))
    .addScaledVector(cameraUp, Math.sin(player.pitch));
  camera.lookAt(surfaceOrigin.copy(camera.position).add(viewDirection));

  const background = exteriorView ? exteriorBackground : interiorBackground;
  scene.background.copy(background);
  if (scene.fog) scene.fog.color.copy(background);
}

function connectedGamepad() {
  if (!navigator.getGamepads) return null;
  try {
    const pads = Array.from(navigator.getGamepads() || []).filter(pad => pad?.connected);
    return pads.find(pad => `${pad.index}:${pad.id || ''}` === activeGamepadIdentity) || pads[0] || null;
  } catch {
    return null;
  }
}

function syncControllerStatus(gamepad) {
  const identity = gamepad ? `${gamepad.index}:${gamepad.id || ''}` : '';
  if (identity === activeGamepadIdentity) return;
  activeGamepadIdentity = identity;
  previousGamepadButtons = [];
  gamepadForwardHeld = false;

  const status = document.querySelector('#controller-status');
  if (status) {
    status.hidden = !gamepad;
    status.textContent = gamepad
      ? `${(gamepad.id || 'Controller').replace(/\s+/g, ' ').trim()} · left stick move · right stick look · LT throttle · RT brake · Y tram · R1 / Options controls · L3 hold-run · L1 toggle-run`
      : '';
  }
  const touchControls = document.querySelector('#touch-controls');
  if (touchControls) touchControls.hidden = !isTouch || Boolean(gamepad);
  if (gamepad) clearTouchInput();
}

function remapStick(value) {
  const magnitude = Math.abs(value);
  if (magnitude <= GAMEPAD_DEADZONE) return 0;
  return Math.sign(value) * (magnitude - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE);
}

function pollGamepad() {
  const gamepad = connectedGamepad();
  syncControllerStatus(gamepad);
  if (!gamepad) {
    previousGamepadButtons = [];
    gamepadForwardHeld = false;
    return {
      connected: false,
      forward: 0, strafe: 0, lookX: 0, lookY: 0,
      jumpHeld: false, jumpPressed: false, descendHeld: false,
      runHeld: false, runTogglePressed: false, hudPressed: false, forwardPressed: false,
      interactPressed: false, accelerate: 0, decelerate: 0,
    };
  }

  const axes = gamepad.axes || [];
  const leftX = remapStick(Number(axes[0] || 0));
  const leftY = remapStick(Number(axes[1] || 0));
  const rightX = remapStick(Number(axes[2] || 0));
  const rightY = remapStick(Number(axes[3] || 0));
  const pressed = index => {
    const button = gamepad.buttons?.[index];
    return Boolean(button?.pressed || Number(button?.value || 0) > 0.5);
  };
  const triggerValue = index => {
    const button = gamepad.buttons?.[index];
    return THREE.MathUtils.clamp(Math.max(
      Number(button?.value || 0),
      button?.pressed ? 1 : 0,
    ), 0, 1);
  };
  const previous = previousGamepadButtons;
  const jumpHeld = pressed(0); // Standard A / Cross.
  const descendHeld = pressed(1); // Standard B / Circle.
  const currentButtons = Array.from(
    { length: Math.max(16, gamepad.buttons?.length || 0) },
    (_, index) => pressed(index),
  );
  previousGamepadButtons = currentButtons;

  const forward = -leftY;
  const forwardPressed = forward > 0.75 && !gamepadForwardHeld;
  gamepadForwardHeld = forward > 0.25;
  return {
    connected: true,
    forward,
    strafe: leftX,
    lookX: rightX,
    lookY: rightY,
    jumpHeld,
    jumpPressed: jumpHeld && !previous[0],
    descendHeld,
    runHeld: pressed(10), // Left stick click.
    runTogglePressed: pressed(4) && !previous[4], // Left shoulder.
    hudPressed: (pressed(5) && !previous[5]) || (pressed(9) && !previous[9]), // Right shoulder or Options.
    interactPressed: pressed(3) && !previous[3], // Standard Y / Triangle.
    accelerate: triggerValue(6), // Standard left trigger (LT / L2) is the throttle.
    decelerate: triggerValue(7), // Standard right trigger (RT / R2) is the brake.
    forwardPressed,
  };
}

window.addEventListener('gamepadconnected', event => syncControllerStatus(event.gamepad));
window.addEventListener('gamepaddisconnected', () => syncControllerStatus(connectedGamepad()));

function setFlying(enabled) {
  const nextFlying = Boolean(enabled);
  if (!player.flying && nextFlying) player.lastFlightDirection = -1;
  if (player.flying && !nextFlying) {
    const centerDistance = nearWallDistance(player.s, player.z);
    const offsetFromAxis = player.elevation - centerDistance;
    player.fallTargetSide = Math.abs(offsetFromAxis) > 1
      ? Math.sign(offsetFromAxis)
      : player.lastFlightDirection || -1;
    player.axisSide = player.fallTargetSide > 0;
  }
  player.flying = nextFlying;
  player.verticalVelocity = 0;
  jumpQueued = false;
  updateTouchActions();
  updateMovementHint();
}

function handleJumpTap(source, now = performance.now()) {
  if (now - lastJumpTap[source] <= DOUBLE_TAP_MS) {
    setFlying(!player.flying);
    lastJumpTap[source] = -Infinity;
    return;
  }
  lastJumpTap[source] = now;
  if (!player.flying && player.elevation <= 0.02) jumpQueued = true;
}

function updateTouchActions() {
  const jump = document.querySelector('#jump-button');
  const descend = document.querySelector('#descend-button');
  const help = document.querySelector('#touch-help');
  if (jump) {
    jump.textContent = player.flying ? 'UP' : 'JUMP';
    jump.setAttribute('aria-label', player.flying
      ? 'Ascend while flying; double-tap to stop flying'
      : 'Jump; double-tap to toggle flight');
  }
  if (descend) descend.hidden = !player.flying;
  if (help) {
    help.textContent = playerOutside
      ? 'Hold UP / DOWN to drift vertically · E to board at tram station'
      : player.flying
        ? 'Hold UP to cross the axis · hold DOWN to return; orientation changes on landing'
        : 'Drag right to look · double-tap JUMP to fly';
  }
}

function updateRunButton() {
  const button = document.querySelector('#run-button');
  if (!button) return;
  button.textContent = runToggled ? 'RUN' : 'WALK';
  button.classList.toggle('active', runToggled);
}

function toggleRunMode() {
  runToggled = !runToggled;
  controllerSpeedRampActive = false;
}

function updateMovementHint() {
  const hint = document.querySelector('#hint');
  if (!hint) return;
  const look = pointerLocked ? 'Mouse locked · Esc releases' : 'Mouse / drag or right stick look';
  if (playerOutside) {
    hint.textContent = `Exterior zero-G · roam up to 1,000 m from the hull · WASD / left stick drift · Space / A-Cross up · Ctrl / B-Circle down · ${look} · H / R1 / Options controls`;
  } else if (tramRiding) {
    hint.textContent = `Axis tram · look around · E / Y / Triangle to exit at the station · ${look}`;
  } else if (player.flying) {
    hint.textContent = `Flying · Space / A-Cross cross the axis · Ctrl / B-Circle reverse · orientation changes on landing · E / Y / Triangle tram · ${look} · H / R1 / Options controls`;
  } else {
    hint.textContent = `WASD / left stick move · ${look} · Shift / L3 run; double-tap W / L1 to toggle · Space / A-Cross jump; double-tap to fly · E / Y / Triangle tram · H / R1 / Options controls`;
  }
}

function distanceToAxis(s = player.s, z = player.z, elevation = player.elevation) {
  return Math.abs(nearWallDistance(s, z) - elevation);
}

function nearWallDistance(s, z) {
  return Math.max(1, world.radius - world.terrainHeight(s, z) - playerEyeHeight);
}

function updateAxisSide() {
  const offsetFromAxis = player.elevation - nearWallDistance(player.s, player.z);
  if (offsetFromAxis > 1) player.axisSide = true;
  else if (offsetFromAxis < -1) player.axisSide = false;
}

function farWallDistance(s, z) {
  const oppositeS = world.wrapS(s + world.circumference / 2);
  return Math.max(1, world.radius - world.terrainHeight(oppositeS, z) - playerEyeHeight);
}

function farWallElevation(s = player.s, z = player.z) {
  return nearWallDistance(s, z) + farWallDistance(s, z);
}

function distanceFromHull(position) {
  const radialGap = Math.max(0, Math.hypot(position.x, position.y) - world.hullRadius);
  const axialGap = Math.max(0, Math.abs(position.z) - world.axialHalfLength);
  return Math.hypot(radialGap, axialGap);
}

function tramDestinationSign() {
  if (tramPositionZ > world.axialHalfLength * 0.6) return -1;
  if (tramPositionZ < -world.axialHalfLength * 0.6) return 1;
  return Math.cos(player.yaw) >= 0 ? 1 : -1;
}

function updateTramPrompt() {
  const prompt = document.querySelector('#tram-prompt');
  const message = document.querySelector('#tram-message');
  const action = document.querySelector('#tram-interact');
  if (!prompt || !message || !action) return;
  prompt.hidden = true;
  action.hidden = false;
  action.disabled = false;
  if (controlsPanelOpen) return;

  if (tramRiding) {
    prompt.hidden = false;
    if (tramAtStation) {
      message.textContent = 'ZERO-G TRAM · stopped at the open end-cap airlock';
      action.textContent = 'E / Y · Exit tram';
      action.disabled = false;
    } else {
      const side = Math.sign(tramDestinationZ) > 0 ? '+Z' : '−Z';
      message.textContent = `ZERO-G TRAM · en route to the ${side} end-cap airlock`;
      action.textContent = 'In transit';
      action.disabled = true;
    }
    return;
  }

  if (playerOutside) return;
  const axisDistance = distanceToAxis();
  if (tramAtStation && axisDistance < AIRLOCK_CLEAR_RADIUS
    && Math.abs(player.z - tramPositionZ) < 18) {
    const side = tramDestinationSign() > 0 ? '+Z' : '−Z';
    prompt.hidden = false;
    message.textContent = `ZERO-G TRAM · board for the ${side} end-cap airlock`;
    action.textContent = 'E / Y · Board tram';
    action.disabled = false;
    return;
  }

  const distancePastCap = Math.abs(player.z) - world.axialHalfLength;
  if (axisDistance < AIRLOCK_CLEAR_RADIUS && distancePastCap > -AIRLOCK_TUNNEL_HALF_LENGTH - 2
    && distancePastCap < AIRLOCK_TUNNEL_HALF_LENGTH + 2) {
    prompt.hidden = false;
    message.textContent = 'OPEN AIRLOCK · follow the center passage to reach the exterior';
    action.hidden = true;
  }
}

function disembarkTram() {
  tramRiding = false;
  tramAtStation = true;
  player.s = world.circumference * 0.75;
  player.z = tramPositionZ;
  player.elevation = world.radius - world.terrainHeight(player.s, player.z) - playerEyeHeight;
  player.flying = true;
  player.verticalVelocity = 0;
  player.fallTargetSide = -1;
  player.lastFlightDirection = -1;
  player.axisSide = false;
  updateTouchActions();
  updateMovementHint();
}

function handleTramInteraction() {
  if (tramRiding) {
    if (tramAtStation) disembarkTram();
    return;
  }
  if (playerOutside || !tramAtStation || distanceToAxis() >= AIRLOCK_CLEAR_RADIUS
    || Math.abs(player.z - tramPositionZ) >= 18) return;

  const sign = tramDestinationSign();
  tramDestinationZ = sign * (world.axialHalfLength + AIRLOCK_STATION_OFFSET);
  tramRiding = true;
  tramAtStation = false;
  player.s = world.circumference * 0.75;
  player.z = tramPositionZ;
  player.elevation = world.radius - world.terrainHeight(player.s, player.z) - playerEyeHeight;
  player.flying = false;
  player.verticalVelocity = 0;
  player.fallTargetSide = -1;
  player.axisSide = false;
  updateTouchActions();
  updateMovementHint();
}

function advanceTram(dt) {
  if (!tramRiding || tramAtStation) return;
  const delta = tramDestinationZ - tramPositionZ;
  const distance = TRAM_SPEED_MPS * dt;
  if (Math.abs(delta) <= distance) {
    tramPositionZ = tramDestinationZ;
    tramAtStation = true;
    player.yaw = Math.sign(tramDestinationZ) > 0 ? 0 : Math.PI;
  } else {
    tramPositionZ += Math.sign(delta) * distance;
  }
  tramRoot.position.z = tramPositionZ;
  player.z = tramPositionZ;
  const tile = surfaceTileKey(visibleSurfaceS(), player.z);
  if (tile !== currentTileKey) reconcileChunks();
  updateBackdrop();
}

const controlsPanel = document.querySelector('#controls-panel');
const controlsBackdrop = document.querySelector('#controls-backdrop');
const controlsToggle = document.querySelector('#controls-toggle');
const controlsClose = document.querySelector('#controls-close');
const runningSpeedSlider = document.querySelector('#running-speed');
const runningSpeedValue = document.querySelector('#running-speed-value');
const flyingSpeedSlider = document.querySelector('#flying-speed');
const flyingSpeedValue = document.querySelector('#flying-speed-value');
const terrainRangeSlider = document.querySelector('#terrain-range');
const terrainRangeValue = document.querySelector('#terrain-range-value');
const sceneryRangeSlider = document.querySelector('#scenery-range');
const sceneryRangeValue = document.querySelector('#scenery-range-value');
const worldSettingInputs = Array.from(document.querySelectorAll('[data-world-setting]'));
const worldSettingsStatus = document.querySelector('#world-settings-status');
const regenerateWorldButton = document.querySelector('#regenerate-world');
const VIEW_RANGE_FOG_NEAR_RATIO = 0.57;
const VIEW_RANGE_FOG_FAR_RATIO = 1.1;
let viewRangeRefreshTimer = 0;
let worldRegenerationInProgress = false;

function settingAtPath(config, path) {
  return path.split('.').reduce((value, part) => value?.[part], config);
}

function setSettingAtPath(config, path, value) {
  const parts = path.split('.');
  const leaf = parts.pop();
  const parent = parts.reduce((object, part) => object[part], config);
  parent[leaf] = value;
}

function formatWorldSetting(input, value) {
  const amount = Number(value);
  switch (input.dataset.format) {
    case 'kilometers':
      return `${(amount / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
    case 'meters':
      return `${Math.round(amount).toLocaleString()} m`;
    case 'percent':
      return `${Math.round(amount * 100)}%`;
    case 'segments':
      return `${Math.round(amount)} segments`;
    case 'rivers':
      return `${Math.round(amount)} ${amount === 1 ? 'river' : 'rivers'}`;
    default:
      return String(amount);
  }
}

function updateWorldSettingOutput(input) {
  const output = input.closest('.world-setting')?.querySelector('output');
  if (!output) return;
  output.value = formatWorldSetting(input, input.value);
  output.textContent = output.value;
}

function syncWorldSettingsControls() {
  if (!world) return;
  for (const input of worldSettingInputs) {
    input.value = String(settingAtPath(world.config, input.dataset.worldSetting));
    updateWorldSettingOutput(input);
  }
  updateWorldSettingsDirty();
}

function updateWorldSettingsDirty() {
  if (!worldSettingsStatus || !regenerateWorldButton) return;
  const dirty = Boolean(world) && worldSettingInputs.some(input => {
    const activeValue = Number(settingAtPath(world.config, input.dataset.worldSetting));
    return Math.abs(Number(input.value) - activeValue) > 1e-5;
  });
  regenerateWorldButton.disabled = !dirty || worldRegenerationInProgress;
  worldSettingsStatus.textContent = worldRegenerationInProgress
    ? 'Generating the new seeded world… nearby terrain is being rebuilt.'
    : dirty
      ? 'Settings changed. Regenerate to apply them to the current seed.'
      : 'Settings match the current world.';
}

function findDrySpawn(nextWorld) {
  const isDry = (s, z) => !nextWorld.isUnderWater(s, z, 4, 4)
    && !nextWorld.footprintCrossesRiver(s, z, 4, 4);
  const axialReach = Math.min(nextWorld.axialHalfLength * 0.68, 3600);
  for (let index = 0; index < 72; index++) {
    const angle = index * 2.399963229728653;
    const s = nextWorld.wrapS(nextWorld.circumference * 0.5
      + Math.cos(angle) * nextWorld.circumference * 0.39);
    const z = Math.sin(angle) * axialReach;
    if (isDry(s, z)) return { s, z };
  }

  // The quick spiral normally finds land immediately. Search the complete
  // seeded surface as a fallback so rare water layouts never use a wet spawn.
  const rows = Math.ceil(nextWorld.config.surface.axialLengthMeters / nextWorld.chunkSize);
  const middleRow = Math.floor(rows / 2);
  for (let offset = 0; offset < rows; offset++) {
    const rowIndices = offset === 0
      ? [middleRow]
      : [middleRow - offset, middleRow + offset];
    for (const row of rowIndices) {
      if (row < 0 || row >= rows) continue;
      const z = nextWorld.chunkStartZ(row) + nextWorld.chunkSize / 2;
      for (let column = 0; column < nextWorld.circumferenceChunks; column++) {
        const s = (column + 0.5) * nextWorld.circumferentialChunkSize;
        if (isDry(s, z)) return { s, z };
      }
    }
  }
  throw new Error('This seed has no dry spawn area. Reduce water coverage and regenerate.');
}

function findTorusHomeSite(nextWorld) {
  const reachZ = Math.min(nextWorld.axialHalfLength * 0.72, 4300);
  const phase = (Math.abs(nextWorld.seed) % 100000) / 100000 * Math.PI * 2;
  const isSuitable = (s, z) => (
    !nextWorld.isUnderWater(s, z, TORUS_HOME_SITE_CLEARANCE_M, TORUS_HOME_SITE_CLEARANCE_M)
    && !nextWorld.footprintCrossesRiver(
      s,
      z,
      TORUS_HOME_SITE_CLEARANCE_M,
      TORUS_HOME_SITE_CLEARANCE_M,
    )
    && !(nextWorld.landmarks || []).some(landmark => (
      Math.hypot(
        nextWorld.shortestDeltaS(s, landmark.s),
        z - landmark.z,
      ) < TORUS_HOME_SITE_CLEARANCE_M + Math.hypot(landmark.width / 2, landmark.depth / 2)
    ))
  );

  for (let index = 0; index < 384; index++) {
    const angle = index * 2.399963229728653 + phase;
    const spread = 0.12 + 0.78 * Math.sqrt((index + 1) / 384);
    const s = nextWorld.wrapS(
      nextWorld.circumference * 0.5
      + Math.cos(angle) * nextWorld.circumference * 0.43 * spread,
    );
    const z = Math.sin(angle) * reachZ * spread;
    if (!isSuitable(s, z)) continue;
    const height = nextWorld.terrainHeight(s, z);
    const site = {
      s,
      z,
      height,
      padRadius: TORUS_HOME_PAD_RADIUS_M,
      blendRadius: TORUS_HOME_PAD_BLEND_RADIUS_M,
      clearanceRadius: TORUS_HOME_SITE_CLEARANCE_M,
    };
    nextWorld.torusHomeSite = site;
    return site;
  }

  const rows = Math.ceil(nextWorld.config.surface.axialLengthMeters / nextWorld.chunkSize);
  for (let row = 0; row < rows; row++) {
    const z = nextWorld.chunkStartZ(row) + nextWorld.chunkSize / 2;
    for (let column = 0; column < nextWorld.circumferenceChunks; column++) {
      const s = (column + 0.5) * nextWorld.circumferentialChunkSize;
      if (!isSuitable(s, z)) continue;
      const height = nextWorld.terrainHeight(s, z);
      const site = {
        s,
        z,
        height,
        padRadius: TORUS_HOME_PAD_RADIUS_M,
        blendRadius: TORUS_HOME_PAD_BLEND_RADIUS_M,
        clearanceRadius: TORUS_HOME_SITE_CLEARANCE_M,
      };
      nextWorld.torusHomeSite = site;
      return site;
    }
  }
  throw new Error('This seed has no dry 50 m clearing for the Torus Home. Reduce water coverage and regenerate.');
}

function setTorusHomeSpawn(nextWorld, site) {
  const localSpawn = torusHomeSpawnLocal();
  player.s = nextWorld.wrapS(site.s + localSpawn.x);
  player.z = site.z + localSpawn.z;
  player.yaw = localSpawn.yaw;
  player.pitch = 0;
  player.elevation = 0;
  player.verticalVelocity = 0;
  player.flying = false;
  player.axisSide = false;
  player.fallTargetSide = -1;
  player.lastFlightDirection = -1;
}

async function regenerateWorld() {
  if (!world || worldRegenerationInProgress || regenerateWorldButton.disabled) return;
  worldRegenerationInProgress = true;
  startupErrorMessage = '';
  ready = false;
  loadingStatus.textContent = 'Preparing a new seeded landscape…';
  progress.style.width = '0%';
  loading.hidden = false;
  regenerateWorldButton.disabled = true;
  updateWorldSettingsDirty();
  await new Promise(resolve => requestAnimationFrame(() => resolve()));
  const nextConfig = JSON.parse(JSON.stringify(world.config));
  for (const input of worldSettingInputs) {
    setSettingAtPath(nextConfig, input.dataset.worldSetting, Number(input.value));
  }
  const diameterMeters = Number(nextConfig.surface.diameterMeters);
  nextConfig.surface.circumferentialChunks = THREE.MathUtils.clamp(
    Math.round(Math.PI * diameterMeters / 98),
    32,
    320,
  );
  const terrainRangeMeters = Number(terrainRangeSlider.value);
  nextConfig.streaming.visualDistanceMeters = terrainRangeMeters;
  nextConfig.streaming.sceneryDistanceMeters = Math.min(
    Number(sceneryRangeSlider.value),
    terrainRangeMeters,
  );
  nextConfig.streaming.fogNearMeters = Math.round(terrainRangeMeters * VIEW_RANGE_FOG_NEAR_RATIO);
  nextConfig.streaming.fogFarMeters = Math.round(terrainRangeMeters * VIEW_RANGE_FOG_FAR_RATIO);

  try {
    const nextWorld = new CylinderWorld(nextConfig, world.seed);
    world = nextWorld;
    world.hullRadius = world.radius + world.groundDepth;
    for (const key of [...chunks.keys()]) disposeChunk(key);
    placementCache.clear();
    pendingChunkKeys = [];
    pendingSceneryKeys = [];
    currentTileKey = '';
    clearTimeout(viewRangeRefreshTimer);
    viewRangeRefreshTimer = 0;
    if (backdrop) {
      scene.remove(backdrop);
      backdrop.geometry.dispose();
      backdrop = null;
    }
    disposeWorldStructures();

    const spawn = combinedHomeMode ? findTorusHomeSite(world) : findDrySpawn(world);
    if (combinedHomeMode) {
      setTorusHomeSpawn(world, spawn);
      if (torusHomeAssets) placeTorusHome(scene, torusHomeAssets, world, spawn);
    } else {
      player.s = spawn.s;
      player.z = spawn.z;
      player.yaw = 0;
      player.pitch = 0;
      player.elevation = 0;
      player.verticalVelocity = 0;
      player.flying = false;
      player.axisSide = false;
      player.fallTargetSide = -1;
      player.lastFlightDirection = -1;
    }
    playerOutside = false;
    outsidePosition.set(0, 0, 0);
    tramPositionZ = 0;
    tramDestinationZ = 0;
    tramRiding = false;
    tramAtStation = true;
    runToggled = false;
    movementSpeedMps = WALK_SPEED_MPS;
    controllerRampSpeedMps = WALK_SPEED_MPS;
    controllerSpeedRampActive = false;
    clearTransientInput();
    updateRunButton();

    scene.fog = new THREE.Fog(
      interiorBackground,
      nextConfig.streaming.fogNearMeters,
      nextConfig.streaming.fogFarMeters,
    );
    camera.far = Math.max(world.hullRadius * 2 + 420, terrainRangeMeters * 1.2);
    camera.updateProjectionMatrix();
    document.querySelector('#seed').textContent = `Seed ${world.seed}`;
    document.querySelector('#diameter').textContent = `${Math.round(world.radius * 2).toLocaleString()} m habitat diameter`;
    addCylinderEndcaps();
    addLandmarks();
    addTramSystem();
    makeBackdrop();
    syncCamera();
    updateBackdrop();
    updateTouchActions();
    updateMovementHint();
    updateTramPrompt();
    loadingStatus.textContent = 'Generating nearby terrain and scenery…';
    ready = false;
    reconcileChunks();
    worldRegenerationInProgress = false;
    syncWorldSettingsControls();
  } catch (error) {
    worldRegenerationInProgress = false;
    ready = chunks.size > 0;
    loading.hidden = ready;
    updateWorldSettingsDirty();
    console.error('[O\'Neill Cylinder] Could not regenerate:', error);
    worldSettingsStatus.textContent = error.message || 'The world could not be regenerated.';
  }
}

for (const input of worldSettingInputs) {
  input.addEventListener('input', () => {
    updateWorldSettingOutput(input);
    updateWorldSettingsDirty();
  });
}
regenerateWorldButton?.addEventListener('click', regenerateWorld);

function updateSpeedLimitOutput(slider, output) {
  const speed = Number(slider.value);
  const formattedSpeed = speed >= 100
    ? Math.round(speed).toLocaleString()
    : speed.toFixed(1);
  output.value = `${formattedSpeed} m/s`;
  output.textContent = output.value;
}

function updateRunningSpeed() {
  runningSpeedMps = Number(runningSpeedSlider.value);
  updateSpeedLimitOutput(runningSpeedSlider, runningSpeedValue);
  const running = controllerSpeedMode === 'run' || runToggled || runKeyHeld;
  if (!playerOutside && !player.flying && running) {
    controllerSpeedMode = 'run';
    controllerSpeedRampActive = false;
    controllerRampSpeedMps = runningSpeedMps;
    movementSpeedMps = runningSpeedMps;
  }
}

function updateFlyingSpeed() {
  flyingSpeedMps = Number(flyingSpeedSlider.value);
  updateSpeedLimitOutput(flyingSpeedSlider, flyingSpeedValue);
  if (playerOutside || player.flying) {
    controllerSpeedMode = 'flight';
    controllerSpeedRampActive = false;
    controllerRampSpeedMps = flyingSpeedMps;
    movementSpeedMps = flyingSpeedMps;
  }
}

function resolveMovementSpeed(gamepad, dt) {
  const flightMode = playerOutside || player.flying;
  const speedLimit = flightMode ? flyingSpeedMps : runningSpeedMps;
  const running = !flightMode && (runToggled || runKeyHeld || gamepad.runHeld);
  const mode = flightMode ? 'flight' : running ? 'run' : 'walk';
  const baseSpeed = flightMode ? flyingSpeedMps : running ? runningSpeedMps : WALK_SPEED_MPS;
  if (mode !== controllerSpeedMode) {
    controllerSpeedMode = mode;
    controllerSpeedRampActive = false;
    controllerRampSpeedMps = baseSpeed;
  }
  const accelerating = gamepad.accelerate > 0.015;
  const braking = gamepad.decelerate > 0.015;

  if (!gamepad.connected) {
    controllerSpeedRampActive = false;
    controllerRampSpeedMps = baseSpeed;
    movementSpeedMps = baseSpeed;
    return movementSpeedMps;
  }

  if (gamepad.runTogglePressed || (gamepad.runHeld && !accelerating && !braking)) {
    controllerSpeedRampActive = false;
    controllerRampSpeedMps = baseSpeed;
  }

  if (accelerating || braking) {
    if (!controllerSpeedRampActive) {
      controllerRampSpeedMps = baseSpeed;
      controllerSpeedRampActive = true;
    }
    const acceleration = Math.max(4, speedLimit * GAMEPAD_ACCELERATION_FRACTION);
    controllerRampSpeedMps += (
      gamepad.accelerate * acceleration
      - gamepad.decelerate * acceleration * GAMEPAD_BRAKE_MULTIPLIER
    ) * dt;
    controllerRampSpeedMps = THREE.MathUtils.clamp(controllerRampSpeedMps, 0, speedLimit);
  }

  movementSpeedMps = controllerSpeedRampActive ? controllerRampSpeedMps : baseSpeed;
  return movementSpeedMps;
}

function updateStreamingHud() {
  if (!world) return;
  const terrainRangeMeters = Number(world.config.streaming.visualDistanceMeters);
  const sceneryRangeMeters = Number(world.config.streaming.sceneryDistanceMeters);
  const chunksLabel = document.querySelector('#chunks');
  if (chunksLabel) {
    chunksLabel.textContent = `${chunks.size} terrain chunks · ${terrainRangeMeters.toLocaleString()} m terrain · ${sceneryRangeMeters.toLocaleString()} m scenery`;
  }
}

function updateTerrainRange() {
  const terrainRangeMeters = Number(terrainRangeSlider.value);
  terrainRangeValue.value = `${terrainRangeMeters.toLocaleString()} m`;
  terrainRangeValue.textContent = terrainRangeValue.value;
  if (!world) return;

  world.config.streaming.visualDistanceMeters = terrainRangeMeters;
  if (scene.fog) {
    scene.fog.near = Math.round(terrainRangeMeters * VIEW_RANGE_FOG_NEAR_RATIO);
    scene.fog.far = Math.round(terrainRangeMeters * VIEW_RANGE_FOG_FAR_RATIO);
  }
  camera.far = Math.max(world.hullRadius * 2 + 420, terrainRangeMeters * 1.2);
  camera.updateProjectionMatrix();
  const sceneryStep = Number(sceneryRangeSlider.step) || 50;
  const sceneryMaximum = Math.max(
    Number(sceneryRangeSlider.min) || 200,
    Math.floor(terrainRangeMeters / sceneryStep) * sceneryStep,
  );
  sceneryRangeSlider.max = String(sceneryMaximum);
  document.querySelector('#scenery-range-max').textContent = `${sceneryMaximum.toLocaleString()} m`;
  if (Number(sceneryRangeSlider.value) > sceneryMaximum) {
    sceneryRangeSlider.value = String(sceneryMaximum);
    updateSceneryRange();
  }
  updateStreamingHud();
}

function updateSceneryRange() {
  const sceneryRangeMeters = Number(sceneryRangeSlider.value);
  sceneryRangeValue.value = `${sceneryRangeMeters.toLocaleString()} m`;
  sceneryRangeValue.textContent = sceneryRangeValue.value;
  if (!world) return;
  world.config.streaming.sceneryDistanceMeters = sceneryRangeMeters;
  updateStreamingHud();
}

function scheduleViewRangeRefresh(immediate = false) {
  clearTimeout(viewRangeRefreshTimer);
  viewRangeRefreshTimer = 0;
  if (immediate) {
    if (world) {
      reconcileChunks();
    }
    return;
  }
  viewRangeRefreshTimer = window.setTimeout(() => {
    viewRangeRefreshTimer = 0;
    if (world) {
      reconcileChunks();
    }
  }, 180);
}

function setControlsPanelOpen(open) {
  controlsPanelOpen = Boolean(open);
  controlsPanel.hidden = !controlsPanelOpen;
  controlsBackdrop.hidden = !controlsPanelOpen;
  controlsToggle.setAttribute('aria-expanded', String(controlsPanelOpen));
  if (controlsPanelOpen) {
    clearTransientInput();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    controlsClose.focus();
  } else {
    controlsToggle.focus();
  }
}

function toggleControlsPanel() {
  setControlsPanelOpen(!controlsPanelOpen);
}

controlsToggle.addEventListener('click', toggleControlsPanel);
controlsClose.addEventListener('click', () => setControlsPanelOpen(false));
controlsBackdrop.addEventListener('click', () => setControlsPanelOpen(false));
document.querySelector('#tram-interact').addEventListener('click', () => { interactQueued = true; });
runningSpeedSlider.addEventListener('input', updateRunningSpeed);
flyingSpeedSlider.addEventListener('input', updateFlyingSpeed);
updateRunningSpeed();
updateFlyingSpeed();
terrainRangeSlider.addEventListener('input', () => {
  updateTerrainRange();
  scheduleViewRangeRefresh();
});
terrainRangeSlider.addEventListener('change', () => {
  updateTerrainRange();
  scheduleViewRangeRefresh(true);
});
sceneryRangeSlider.addEventListener('input', () => {
  updateSceneryRange();
  scheduleViewRangeRefresh();
});
sceneryRangeSlider.addEventListener('change', () => {
  updateSceneryRange();
  scheduleViewRangeRefresh(true);
});
updateTerrainRange();
updateSceneryRange();

function advanceVerticalMotion(gamepad, dt, movementSpeed) {
  if (jumpQueued) {
    if (!player.flying && player.elevation <= 0.02) player.verticalVelocity = 5.2;
    jumpQueued = false;
  }

  if (player.flying) {
    const ascend = keys.has('Space') || gamepad.jumpHeld || touchIntent.jumpHeld;
    const descend = keys.has('ControlLeft') || keys.has('ControlRight')
      || gamepad.descendHeld || touchIntent.descendHeld;
    const direction = Number(ascend) - Number(descend);
    if (direction) player.lastFlightDirection = Math.sign(direction);
    player.verticalVelocity = direction * movementSpeed;
    player.elevation = THREE.MathUtils.clamp(
      player.elevation + player.verticalVelocity * dt,
      0,
      farWallElevation(),
    );
    updateAxisSide();
    return;
  }

  const nearDistance = nearWallDistance(player.s, player.z);
  const farElevation = farWallElevation();
  const side = player.fallTargetSide || -1;
  const distanceFromAxis = Math.abs(player.elevation - nearDistance);
  const wallDistance = player.axisSide ? farWallDistance(player.s, player.z) : nearDistance;
  const gravity = THREE.MathUtils.lerp(
    3,
    9.8,
    THREE.MathUtils.clamp(distanceFromAxis / wallDistance, 0, 1),
  );
  player.verticalVelocity += side * gravity * dt;
  player.elevation += player.verticalVelocity * dt;
  if (side < 0 && player.elevation <= 0) {
    player.elevation = 0;
    player.verticalVelocity = 0;
    player.axisSide = false;
    player.fallTargetSide = -1;
  } else if (side > 0 && player.elevation >= farElevation) {
    player.s = world.wrapS(player.s + world.circumference / 2);
    player.yaw = -player.yaw;
    player.pitch = -player.pitch;
    player.elevation = 0;
    player.verticalVelocity = 0;
    player.axisSide = false;
    player.fallTargetSide = -1;
  } else {
    updateAxisSide();
  }
}

function readIntent(gamepad) {
  const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
    - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
    + touchIntent.forward + gamepad.forward;
  const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
    - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
    + touchIntent.strafe + gamepad.strafe;
  const length = Math.hypot(forward, strafe);
  return length > 1 ? { forward: forward / length, strafe: strafe / length } : { forward, strafe };
}

function step(dt) {
  const gamepad = pollGamepad();
  if (gamepad.hudPressed) toggleControlsPanel();
  if (controlsPanelOpen) {
    updateRunButton();
    return;
  }
  const interact = interactQueued || gamepad.interactPressed;
  interactQueued = false;
  const now = performance.now();
  if (!playerOutside && !tramRiding && gamepad.jumpPressed) handleJumpTap('gamepad', now);
  if (!playerOutside && !tramRiding && touchIntent.jumpPressed) handleJumpTap('touch', now);
  touchIntent.jumpPressed = false;
  if (gamepad.runTogglePressed) toggleRunMode();
  if (gamepad.forwardPressed) {
    if (now - lastGamepadForwardTap <= DOUBLE_TAP_MS) {
      toggleRunMode();
      lastGamepadForwardTap = -Infinity;
    } else {
      lastGamepadForwardTap = now;
    }
  }
  const movementSpeed = resolveMovementSpeed(gamepad, dt);
  player.yaw -= gamepad.lookX * GAMEPAD_LOOK_SPEED * dt;
  player.pitch = THREE.MathUtils.clamp(
    player.pitch - gamepad.lookY * GAMEPAD_LOOK_SPEED * dt,
    -1.43,
    1.43,
  );
  if (interact) handleTramInteraction();

  if (tramRiding) {
    advanceTram(dt);
    updateRunButton();
    updateTramPrompt();
    syncCamera();
    return;
  }

  if (playerOutside) {
    advanceExteriorMovement(gamepad, dt, movementSpeed);
  } else {
    advanceVerticalMotion(gamepad, dt, movementSpeed);
    advanceInteriorMovement(gamepad, dt, movementSpeed);
    updateAxisSide();
  }
  updateRunButton();
  if (!playerOutside) {
    const tile = surfaceTileKey(visibleSurfaceS(), player.z);
    if (tile !== currentTileKey) reconcileChunks();
    updateBackdrop();
  }
  syncCamera();
  updateTramPrompt();
}

function advanceInteriorMovement(gamepad, dt, movementSpeed) {
  const intent = readIntent(gamepad);
  if (!intent.forward && !intent.strafe) return;
  const speed = movementSpeed;
  const surfaceSide = player.axisSide ? -1 : 1;
  const ds = (intent.forward * Math.sin(player.yaw) - intent.strafe * Math.cos(player.yaw))
    * surfaceSide * speed * dt;
  const dz = (intent.forward * Math.cos(player.yaw) + intent.strafe * Math.sin(player.yaw)) * speed * dt;
  const movementSteps = Math.max(1, Math.ceil(Math.hypot(ds, dz) / 1));
  const stepS = ds / movementSteps;
  const stepZ = dz / movementSteps;
  for (let i = 0; i < movementSteps; i++) {
    const farClearance = player.axisSide
      ? farWallElevation(player.s, player.z) - player.elevation
      : null;
    const nextS = world.wrapS(player.s + stepS);
    const nearPortal = distanceToAxis(nextS, player.z, player.elevation) < AIRLOCK_CLEAR_RADIUS;
    const axialLimit = nearPortal
      ? world.axialHalfLength + AIRLOCK_TUNNEL_HALF_LENGTH + 4
      : world.axialHalfLength - 2;
    const nextZ = THREE.MathUtils.clamp(player.z + stepZ, -axialLimit, axialLimit);
    const portalClear = distanceToAxis(nextS, nextZ, player.elevation) < AIRLOCK_CLEAR_RADIUS;
    if (player.elevation > 1.2 || !isBlocked(nextS, nextZ)) {
      player.s = nextS;
      player.z = nextZ;
    } else {
      let slid = false;
      if (!isBlocked(nextS, player.z)) {
        player.s = nextS;
        slid = true;
      }
      if (!isBlocked(player.s, nextZ)) {
        player.z = nextZ;
        slid = true;
      }
      if (!slid) break;
    }

    if (farClearance !== null) {
      player.elevation = THREE.MathUtils.clamp(
        farWallElevation(player.s, player.z) - farClearance,
        0,
        farWallElevation(player.s, player.z),
      );
    }

    if (portalClear && Math.abs(player.z) >= world.axialHalfLength + AIRLOCK_TUNNEL_HALF_LENGTH) {
      enterExterior(Math.sign(player.z));
      break;
    }
  }
}

function entersCylinderHull(position) {
  return Math.abs(position.z) < world.axialHalfLength
    && Math.hypot(position.x, position.y) < world.hullRadius + 8;
}

function enterExterior(sign) {
  playerOutside = true;
  player.s = world.circumference * 0.75;
  player.flying = true;
  player.verticalVelocity = 0;
  player.fallTargetSide = -1;
  player.lastFlightDirection = -1;
  player.axisSide = false;
  outsidePosition.set(0, 0, sign * (world.axialHalfLength + AIRLOCK_TUNNEL_HALF_LENGTH));
  player.z = outsidePosition.z;
  player.elevation = world.radius - world.terrainHeight(player.s, player.z) - playerEyeHeight;
  updateTouchActions();
  updateMovementHint();
}

function enterInterior(position) {
  playerOutside = false;
  player.s = world.circumference * 0.75;
  player.z = position.z;
  player.elevation = world.radius - world.terrainHeight(player.s, player.z) - playerEyeHeight;
  player.flying = true;
  player.verticalVelocity = 0;
  player.fallTargetSide = -1;
  player.lastFlightDirection = -1;
  player.axisSide = false;
  updateTouchActions();
  updateMovementHint();
}

function advanceExteriorMovement(gamepad, dt, movementSpeed) {
  const intent = readIntent(gamepad);
  const ascend = keys.has('Space') || gamepad.jumpHeld || touchIntent.jumpHeld;
  const descend = keys.has('ControlLeft') || keys.has('ControlRight')
    || gamepad.descendHeld || touchIntent.descendHeld;
  const vertical = Number(ascend) - Number(descend);
  if (!intent.forward && !intent.strafe && !vertical) return;

  let moveX = (intent.forward * Math.sin(player.yaw) + intent.strafe * Math.cos(player.yaw)) * movementSpeed;
  let moveY = vertical * movementSpeed;
  let moveZ = (intent.forward * Math.cos(player.yaw) - intent.strafe * Math.sin(player.yaw)) * movementSpeed;
  const magnitude = Math.hypot(moveX, moveY, moveZ);
  if (magnitude > movementSpeed) {
    moveX *= movementSpeed / magnitude;
    moveY *= movementSpeed / magnitude;
    moveZ *= movementSpeed / magnitude;
  }
  const distance = Math.hypot(moveX, moveY, moveZ) * dt;
  const movementSteps = Math.max(1, Math.ceil(distance / 1));
  const delta = new THREE.Vector3(moveX, moveY, moveZ).multiplyScalar(dt / movementSteps);
  const candidate = new THREE.Vector3();
  for (let i = 0; i < movementSteps; i++) {
    candidate.copy(outsidePosition).add(delta);
    if (entersCylinderHull(candidate)) break;
    if (distanceFromHull(candidate) > EXTERIOR_MAX_DISTANCE) break;
    outsidePosition.copy(candidate);
    const enteringPort = delta.z * outsidePosition.z < 0
      && Math.abs(outsidePosition.z) < world.axialHalfLength + AIRLOCK_TUNNEL_HALF_LENGTH;
    const nearPort = enteringPort
      && Math.hypot(outsidePosition.x, outsidePosition.y) < AIRLOCK_CLEAR_RADIUS;
    if (nearPort) {
      enterInterior(outsidePosition);
      break;
    }
  }
}

function pointSegmentDistanceSquared(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 1e-8
    ? THREE.MathUtils.clamp(((px - x1) * dx + (pz - z1) * dz) / lengthSquared, 0, 1)
    : 0;
  const nearX = x1 + t * dx;
  const nearZ = z1 + t * dz;
  return (px - nearX) ** 2 + (pz - nearZ) ** 2;
}

function collidesWithBuilding(s, z, building, playerRadius = PLAYER_COLLISION_RADIUS_M) {
  const ds = world.shortestDeltaS(s, building.s);
  const dz = z - building.z;
  const yaw = building.yaw || 0;
  const localS = ds * Math.cos(yaw) - dz * Math.sin(yaw);
  const localZ = ds * Math.sin(yaw) + dz * Math.cos(yaw);
  const wallRadius = playerRadius + Math.min(0.2, building.width * 0.02);

  if (/^house|^village$/.test(building.kind)) {
    const halfWidth = building.width * 0.48;
    const rearZ = -building.depth * 0.5;
    const frontZ = building.depth * 0.28;
    const doorHalfWidth = building.width * 0.279 / 2;
    const isTwoStory = building.kind.includes('TwoStory') || building.kind === 'village';
    const doorHeight = building.height * (isTwoStory ? 0.306 : 0.6);
    const doorwayFits = doorHeight >= PLAYER_BODY_HEIGHT_M
      && doorHalfWidth * 2 >= playerRadius * 2;
    const nearWall = (x1, z1, x2, z2) => (
      pointSegmentDistanceSquared(localS, localZ, x1, z1, x2, z2) < wallRadius * wallRadius
    );

    if (nearWall(-halfWidth, rearZ, -halfWidth, frontZ)
      || nearWall(halfWidth, rearZ, halfWidth, frontZ)
      || nearWall(-halfWidth, rearZ, halfWidth, rearZ)) return true;
    if (!doorwayFits) return nearWall(-halfWidth, frontZ, halfWidth, frontZ);
    return nearWall(-halfWidth, frontZ, -doorHalfWidth, frontZ)
      || nearWall(doorHalfWidth, frontZ, halfWidth, frontZ);
  }

  const localHalfWidth = building.width / 2 + playerRadius;
  const localHalfDepth = building.depth / 2 + playerRadius;
  return Math.abs(localS) < localHalfWidth && Math.abs(localZ) < localHalfDepth;
}

function isBlocked(s, z) {
  const torusHomeSite = world.torusHomeSite;
  if (torusHomeAssets?.collision && torusHomeSite && !player.axisSide) {
    const localX = world.shortestDeltaS(s, torusHomeSite.s);
    const localZ = z - torusHomeSite.z;
    if (torusHomeAssets.collision.blocks(localX, localZ, PLAYER_COLLISION_RADIUS_M)) return true;
  }

  const chunkSizeS = world.circumferentialChunkSize;
  const chunkSizeZ = world.chunkSize;
  const columnCount = world.circumferenceChunks;
  const column = Math.floor(world.wrapS(s) / chunkSizeS);
  const axialRows = Math.ceil(world.config.surface.axialLengthMeters / chunkSizeZ);
  const row = Math.floor((z + world.axialHalfLength) / chunkSizeZ);
  for (let dx = -1; dx <= 1; dx++) {
    const nearbyColumn = mod(column + dx, columnCount);
    for (let dz = -1; dz <= 1; dz++) {
      const nearbyRow = row + dz;
      if (nearbyRow < 0 || nearbyRow >= axialRows) continue;
      const { trees, buildings } = getPlacements(nearbyColumn, nearbyRow);
      for (const tree of trees) {
        const ds = world.shortestDeltaS(s, tree.s);
        const dzFromTree = z - tree.z;
        if (ds * ds + dzFromTree * dzFromTree < 0.72 * 0.72) return true;
      }
      for (const building of buildings) {
        if (collidesWithBuilding(s, z, building)) return true;
      }
    }
  }
  for (const landmark of world.landmarks || []) {
    if (collidesWithBuilding(s, z, landmark)) return true;
  }
  return false;
}

function updateHud(now) {
  if (now - lastStatsTime < 180) return;
  lastStatsTime = now;
  updateCompass();
  const shownSpeed = tramRiding ? TRAM_SPEED_MPS : movementSpeedMps;
  const speedPrecision = shownSpeed < 100 ? 1 : 0;
  movementSpeedMode.textContent = tramRiding
    ? 'TRAM'
    : playerOutside
      ? 'ZERO-G'
      : player.flying
        ? 'FLIGHT'
        : shownSpeed > WALK_SPEED_MPS + 0.05
          ? 'RUN / BOOST'
          : 'WALKING';
  movementSpeedValue.textContent = `${shownSpeed.toLocaleString(undefined, {
    minimumFractionDigits: speedPrecision,
    maximumFractionDigits: speedPrecision,
  })} m/s`;
  updateStreamingHud();
  if (playerOutside) {
    regionLabel.textContent = 'Region · Exterior';
  } else if (tramRiding) {
    regionLabel.textContent = 'Region · Axis tram';
  } else {
    const biome = world.biomeAt(visibleSurfaceS(), player.z);
    const biomeNames = {
      forest: 'Temperate forest',
      grassland: 'Grassland',
      dryland: 'Dry scrub',
      wetland: 'Wetland',
      highlands: 'Highlands',
    };
    const localHomeDistance = world.torusHomeSite && !player.axisSide
      ? Math.hypot(
        world.shortestDeltaS(visibleSurfaceS(), world.torusHomeSite.s),
        player.z - world.torusHomeSite.z,
      )
      : Infinity;
    regionLabel.textContent = combinedHomeMode && localHomeDistance < 22
      ? `Torus Home · ${biomeNames[biome] || biome}`
      : `Biome · ${biomeNames[biome] || biome}`;
  }
  document.querySelector('#location').textContent = playerOutside
    ? `Exterior · ${Math.round(distanceFromHull(outsidePosition))} m from hull · X ${Math.round(outsidePosition.x)}, Y ${Math.round(outsidePosition.y)}, Z ${Math.round(outsidePosition.z)} m`
    : tramRiding
      ? `Tram · Axis ${Math.round(player.z)} m · ${TRAM_SPEED_MPS} m/s`
      : `Arc ${Math.round(visibleSurfaceS())} m · Axis ${Math.round(player.z)} m · Height ${Math.round(player.elevation)} m`;
}

function updateCompass() {
  headingCompass.hidden = playerOutside;
  if (playerOutside) return;

  const axialComponent = Math.cos(player.yaw);
  const spinwardComponent = Math.sin(player.yaw) * (player.axisSide ? -1 : 1);
  const bearing = mod(Math.atan2(spinwardComponent, axialComponent) * 180 / Math.PI, 360);
  const roundedBearing = Math.round(bearing) % 360;
  const sector = compassSector(bearing);
  const axialSign = axialComponent >= 0 ? '+Z' : '−Z';
  const tangentialDirection = spinwardComponent >= 0 ? 'spinward' : 'anti-spinward';
  compassNeedle.style.setProperty('--heading', `${bearing}deg`);
  headingReading.textContent = `${sector} · ${String(roundedBearing).padStart(3, '0')}°`;
  headingDetail.textContent = `Axial ${axialSign} ${Math.round(Math.abs(axialComponent) * 100)}% · ${tangentialDirection} ${Math.round(Math.abs(spinwardComponent) * 100)}%`;
}

function compassSector(bearing) {
  const sectors = [
    '+Z endcap',
    '+Z / spinward',
    'Spinward',
    '−Z / spinward',
    '−Z endcap',
    '−Z / anti-spinward',
    'Anti-spinward',
    '+Z / anti-spinward',
  ];
  return sectors[Math.round(bearing / 45) % sectors.length];
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (!worldRegenerationInProgress && (!ready || pendingChunkKeys.length || pendingSceneryKeys.length)) {
    processChunkQueue();
  }
  if (ready) step(dt);
  updateLandmarkVisibility();
  updateHud(now);
  renderer.render(scene, camera);
}

function applyLook(dx, dy, sensitivity = 0.0023) {
  player.yaw -= dx * sensitivity;
  player.pitch = THREE.MathUtils.clamp(player.pitch - dy * sensitivity, -1.43, 1.43);
  syncCamera();
}

document.addEventListener('keydown', event => {
  if (event.code === 'Escape') {
    if (controlsPanelOpen) setControlsPanelOpen(false);
    else if (document.pointerLockElement === canvas) document.exitPointerLock();
    return;
  }
  if (event.code === 'KeyF' && !event.repeat) {
    if (document.fullscreenElement) document.exitFullscreen();
    else {
      const request = document.documentElement.requestFullscreen?.();
      request?.catch?.(() => {});
    }
    return;
  }
  if (event.code === 'KeyH' && !event.repeat) {
    toggleControlsPanel();
    return;
  }
  if (controlsPanelOpen) return;
  if (!ready) return;
  if (event.code === 'KeyE' && !event.repeat) {
    event.preventDefault();
    interactQueued = true;
    return;
  }

  const handledKeys = [
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  ];
  if (handledKeys.includes(event.code)) event.preventDefault();
  if (event.code === 'KeyW' || event.code === 'ArrowUp') {
    if (!event.repeat) {
      const now = performance.now();
      if (now - lastForwardTap <= DOUBLE_TAP_MS) {
        toggleRunMode();
        lastForwardTap = -Infinity;
      } else {
        lastForwardTap = now;
      }
    }
  }
  if (event.code === 'Space' && !event.repeat && !playerOutside && !tramRiding) handleJumpTap('keyboard');
  keys.add(event.code);
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') runKeyHeld = true;
});

document.addEventListener('keyup', event => {
  keys.delete(event.code);
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') runKeyHeld = false;
});

function clearTouchInput() {
  touchIntent.forward = 0;
  touchIntent.strafe = 0;
  touchIntent.jumpHeld = false;
  touchIntent.jumpPressed = false;
  touchIntent.descendHeld = false;
  touchMovePointer = null;
  touchLookPointer = null;
  touchJumpPointer = null;
  touchDescendPointer = null;
  if (moveNub) moveNub.style.transform = 'translate(-50%, -50%)';
}

function clearTransientInput() {
  keys.clear();
  runKeyHeld = false;
  dragging = false;
  jumpQueued = false;
  interactQueued = false;
  lastForwardTap = -Infinity;
  lastJumpTap.keyboard = -Infinity;
  lastJumpTap.touch = -Infinity;
  clearTouchInput();
}

window.addEventListener('blur', clearTransientInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTransientInput();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  updateMovementHint();
});

canvas.addEventListener('click', () => {
  if (!isTouch && ready && !pointerLocked) {
    const request = canvas.requestPointerLock?.();
    request?.catch?.(() => {});
  }
});

canvas.addEventListener('mousedown', event => {
  if (isTouch || pointerLocked) return;
  dragging = true;
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
});

document.addEventListener('mousemove', event => {
  if (pointerLocked) {
    applyLook(event.movementX, event.movementY);
  } else if (dragging && !isTouch) {
    applyLook(event.clientX - lastMouseX, event.clientY - lastMouseY);
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  }
});
document.addEventListener('mouseup', () => { dragging = false; });

const movePad = document.querySelector('#move-pad');
const moveNub = document.querySelector('#move-nub');

function updateTouchMove(event) {
  if (event.pointerId !== touchMovePointer) return;
  const bounds = movePad.getBoundingClientRect();
  const radius = bounds.width * 0.31;
  let dx = event.clientX - (bounds.left + bounds.width / 2);
  let dy = event.clientY - (bounds.top + bounds.height / 2);
  const distance = Math.hypot(dx, dy);
  if (distance > radius) {
    dx *= radius / distance;
    dy *= radius / distance;
  }
  const remap = value => Math.abs(value) < 0.12 ? 0 : Math.sign(value) * (Math.abs(value) - 0.12) / 0.88;
  touchIntent.strafe = remap(dx / radius);
  touchIntent.forward = remap(-dy / radius);
  moveNub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

movePad.addEventListener('pointerdown', event => {
  if (!isTouch) return;
  event.preventDefault();
  touchMovePointer = event.pointerId;
  movePad.setPointerCapture(event.pointerId);
  updateTouchMove(event);
});
movePad.addEventListener('pointermove', updateTouchMove);

canvas.addEventListener('pointerdown', event => {
  if (!isTouch || event.clientX < innerWidth * 0.4) return;
  event.preventDefault();
  touchLookPointer = event.pointerId;
  lastTouchX = event.clientX;
  lastTouchY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== touchLookPointer) return;
  applyLook(event.clientX - lastTouchX, event.clientY - lastTouchY, 0.0031);
  lastTouchX = event.clientX;
  lastTouchY = event.clientY;
});

function releasePointer(event) {
  if (event.pointerId === touchMovePointer) {
    touchMovePointer = null;
    touchIntent.forward = 0;
    touchIntent.strafe = 0;
    moveNub.style.transform = 'translate(-50%, -50%)';
  }
  if (event.pointerId === touchLookPointer) touchLookPointer = null;
  if (event.pointerId === touchJumpPointer) {
    touchJumpPointer = null;
    touchIntent.jumpHeld = false;
  }
  if (event.pointerId === touchDescendPointer) {
    touchDescendPointer = null;
    touchIntent.descendHeld = false;
  }
}
document.addEventListener('pointerup', releasePointer);
document.addEventListener('pointercancel', releasePointer);

const jumpButton = document.querySelector('#jump-button');
const descendButton = document.querySelector('#descend-button');

jumpButton.addEventListener('pointerdown', event => {
  if (!isTouch || activeGamepadIdentity) return;
  event.preventDefault();
  touchJumpPointer = event.pointerId;
  jumpButton.setPointerCapture(event.pointerId);
  touchIntent.jumpHeld = true;
  touchIntent.jumpPressed = true;
});

descendButton.addEventListener('pointerdown', event => {
  if (!isTouch || activeGamepadIdentity || !player.flying) return;
  event.preventDefault();
  touchDescendPointer = event.pointerId;
  descendButton.setPointerCapture(event.pointerId);
  touchIntent.descendHeld = true;
});

document.querySelector('#run-button').addEventListener('click', () => {
  toggleRunMode();
  updateRunButton();
});

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

async function start() {
  try {
    let houseAssetsPromise = Promise.resolve({ assets: null });
    if (combinedHomeMode) {
      document.title = "Torus Home inside Green Reach · O'Neill Cylinder";
      document.querySelector('#world-hud .eyebrow').textContent = 'DREAM HOME · INSIDE GREEN REACH';
      document.querySelector('#world-hud h1').textContent = 'Torus Home';
      torusHomeLoading = { house: 'starting', collision: 'starting' };
      houseAssetsPromise = loadTorusHomeAssets({
        visualUrl: '../assets/dream-home.glb',
        collisionUrl: '../assets/torus-home-collision.glb',
        onVisualLoaded: visual => {
          torusHomeAssets = { visual, collision: null };
          if (world?.torusHomeSite) {
            placeTorusHome(scene, torusHomeAssets, world, world.torusHomeSite);
          }
        },
        onProgress: (asset, percent, loaded) => {
          const amount = percent === null
            ? `${(loaded / 1024 / 1024).toFixed(1)} MiB`
            : `${percent}%`;
          torusHomeLoading[asset] = amount;
          updateStartupReadiness();
        },
      }).then(assets => ({ assets }), error => ({ error }));
    }

    const response = await fetch('../houses/oneill-cylinder/data/world-config.json');
    if (!response.ok) throw new Error(`World settings could not be loaded (${response.status}).`);
    const config = await response.json();
    const seed = getSeed(config);
    world = new CylinderWorld(config, seed);
    world.hullRadius = world.hullRadius || world.radius + (world.groundDepth || 500);
    const spawn = combinedHomeMode ? findTorusHomeSite(world) : findDrySpawn(world);
    if (combinedHomeMode) {
      setTorusHomeSpawn(world, spawn);
    } else {
      player.s = spawn.s;
      player.z = spawn.z;
      player.elevation = 0;
      player.verticalVelocity = 0;
      player.flying = false;
      player.axisSide = false;
      player.fallTargetSide = -1;
    }
    document.querySelector('#seed').textContent = `Seed ${seed}`;
    document.querySelector('#diameter').textContent = `${Math.round(world.radius * 2).toLocaleString()} m habitat diameter`;
    syncWorldSettingsControls();
    scene.fog = new THREE.Fog(interiorBackground, config.streaming.fogNearMeters, config.streaming.fogFarMeters);
    terrainRangeSlider.value = String(config.streaming.visualDistanceMeters || 1600);
    sceneryRangeSlider.value = String(config.streaming.sceneryDistanceMeters || 800);
    updateTerrainRange();
    updateSceneryRange();
    document.querySelector('#touch-controls').hidden = !isTouch;
    syncControllerStatus(connectedGamepad());
    updateTouchActions();
    updateRunButton();
    updateMovementHint();
    addCylinderEndcaps();
    addLandmarks();
    addTramSystem();
    makeBackdrop();
    if (combinedHomeMode) torusHomeReady = false;
    syncCamera();
    reconcileChunks();
    requestAnimationFrame(frame);

    if (combinedHomeMode) {
      const result = await houseAssetsPromise;
      if (result.error) throw result.error;
      torusHomeAssets = result.assets;
      placeTorusHome(scene, torusHomeAssets, world, world.torusHomeSite);
      torusHomeLoading = { house: 'ready', collision: 'ready' };
      torusHomeReady = true;
      updateStartupReadiness();
    }
  } catch (error) {
    console.error('[O\'Neill Cylinder] Could not start:', error);
    startupErrorMessage = error.message || 'The environment could not be loaded.';
    loadingStatus.textContent = startupErrorMessage;
    document.querySelector('.loading-card h2').textContent = 'Could not build the landscape';
  }
}

start();
