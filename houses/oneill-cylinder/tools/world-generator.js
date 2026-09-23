import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP_Y = new THREE.Vector3(0, 1, 0);
const GRASS_COLOR = new THREE.Color(0x52774e);
const HIGH_GRASS_COLOR = new THREE.Color(0x72855a);
const SOIL_COLOR = new THREE.Color(0x84734c);
const ROCK_COLOR = new THREE.Color(0x746f61);
const FARMLAND_COLOR = new THREE.Color(0x82915a);
const DISTANT_SKY_COLOR = new THREE.Color(0x9db9bb);
const NOISE_OCTAVES = [
  { scale: 1536, amplitude: 42 },
  { scale: 768, amplitude: 27 },
  { scale: 384, amplitude: 17 },
  { scale: 192, amplitude: 9 },
  { scale: 96, amplitude: 4.5 },
  { scale: 48, amplitude: 2 },
];

const ZONE_FALLBACK_SIZE = 768;

const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus;

export function seedFromString(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i++) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hash01(seed, x, y, channel = 0) {
  let h = seed ^ Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(y | 0, 0x27d4eb2d) ^ Math.imul(channel | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const smooth = value => value * value * (3 - 2 * value);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clipSegmentToRect(x0, y0, x1, y1, minX, minY, maxX, maxY) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let lower = 0;
  let upper = 1;
  const tests = [
    [-dx, x0 - minX],
    [dx, maxX - x0],
    [-dy, y0 - minY],
    [dy, maxY - y0],
  ];
  for (const [p, q] of tests) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) lower = Math.max(lower, t);
    else upper = Math.min(upper, t);
    if (lower > upper) return null;
  }
  return [
    { x: x0 + dx * lower, y: y0 + dy * lower },
    { x: x0 + dx * upper, y: y0 + dy * upper },
  ];
}

export class CylinderWorld {
  constructor(config, seed = config.defaultSeed) {
    this.config = config;
    this.seed = Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : seedFromString(seed);
    this.chunkSize = config.surface.chunkSizeMeters;
    this.circumferenceChunks = config.surface.circumferentialChunks;
    const requestedDiameter = Number(config.surface.diameterMeters);
    this.circumference = Number.isFinite(requestedDiameter) && requestedDiameter > 0
      ? Math.PI * requestedDiameter
      : this.chunkSize * this.circumferenceChunks;
    this.radius = this.circumference / TAU;
    this.circumferentialChunkSize = this.circumference / this.circumferenceChunks;
    this.axialHalfLength = config.surface.axialLengthMeters / 2;
    this.terrainSegments = config.streaming.terrainSegments;
    this.riverWidth = config.landscape.riverWidthMeters;
    this.riverBank = config.landscape.riverBankMeters;
    this.baseHeight = config.landscape.baseHeightMeters;
    this.riverPhase = hash01(this.seed, 17, 91, 4) * TAU;
    this.zoneSize = Math.max(192, Number(config.landscape.zoneCellSizeMeters) || ZONE_FALLBACK_SIZE);
    this.zoneColumns = Math.max(1, Math.round(this.circumference / this.zoneSize));
    this.zoneRows = Math.max(1, Math.ceil(config.surface.axialLengthMeters / this.zoneSize));
    this.zoneSizeS = this.circumference / this.zoneColumns;
    this.zoneSizeZ = config.surface.axialLengthMeters / this.zoneRows;
    this.zoneCache = new Map();
    this.settlementsCache = null;
    this.roadCache = null;
    this.colorScratch = new THREE.Color();
  }

  wrapS(s) {
    return positiveModulo(s, this.circumference);
  }

  shortestDeltaS(a, b) {
    let delta = this.wrapS(a) - this.wrapS(b);
    if (delta > this.circumference / 2) delta -= this.circumference;
    if (delta < -this.circumference / 2) delta += this.circumference;
    return delta;
  }

  #noise(s, z, scale, channel) {
    const cellsAround = Math.round(this.circumference / scale);
    const gridS = this.wrapS(s) / this.circumference * cellsAround;
    const gridZ = z / scale;
    const x0 = Math.floor(gridS);
    const z0 = Math.floor(gridZ);
    const tx = smooth(gridS - x0);
    const tz = smooth(gridZ - z0);
    const x1 = (x0 + 1) % cellsAround;
    const z1 = z0 + 1;
    const a = lerp(hash01(this.seed, x0, z0, channel), hash01(this.seed, x1, z0, channel), tx);
    const b = lerp(hash01(this.seed, x0, z1, channel), hash01(this.seed, x1, z1, channel), tx);
    return lerp(a, b, tz) * 2 - 1;
  }

  baseTerrainHeight(s, z) {
    const warpedS = s + this.#noise(s, z, 1024, 8) * 110;
    const warpedZ = z + this.#noise(s, z, 1024, 9) * 145;
    let height = this.baseHeight;
    NOISE_OCTAVES.forEach((octave, index) => {
      height += this.#noise(warpedS, warpedZ, octave.scale, index + 1) * octave.amplitude;
    });
    const ridgeNoise = this.#noise(warpedS, warpedZ, 620, 10);
    const ridge = 1 - Math.abs(ridgeNoise);
    height += ridge * ridge * 24;
    return height;
  }

  riverCenter(z) {
    const scale = this.circumference;
    const longMeander = this.#noise(0, z, 3072, 31) * scale * 0.08;
    const broadMeander = this.#noise(0, z, 1280, 32) * scale * 0.045;
    const fineMeander = this.#noise(0, z, 512, 33) * scale * 0.015;
    return this.wrapS(
      scale * 0.5
      + Math.sin(z * 0.00056 + this.riverPhase) * scale * 0.09
      + Math.sin(z * 0.00145 + this.riverPhase * 1.73) * scale * 0.04
      + longMeander + broadMeander + fineMeander,
    );
  }

  riverDistance(s, z) {
    return Math.abs(this.shortestDeltaS(s, this.riverCenter(z)));
  }

  riverSurfaceHeight(z) {
    return this.baseTerrainHeight(this.riverCenter(z), z) - 11;
  }

  terrainHeight(s, z) {
    const distance = this.riverDistance(s, z);
    const innerBank = this.riverWidth / 2;
    const channel = 1 - smooth(THREE.MathUtils.clamp(
      (distance - innerBank) / Math.max(1, this.riverBank),
      0,
      1,
    ));
    let height = this.baseTerrainHeight(s, z) - channel * 14;
    const zone = this.#zoneAt(s, z);
    if (zone.lake) {
      const ds = this.shortestDeltaS(s, zone.lake.s);
      const dz = z - zone.lake.z;
      const cosYaw = Math.cos(zone.lake.yaw);
      const sinYaw = Math.sin(zone.lake.yaw);
      const rotatedS = ds * cosYaw + dz * sinYaw;
      const rotatedZ = -ds * sinYaw + dz * cosYaw;
      const radius = Math.sqrt((rotatedS / zone.lake.radiusS) ** 2 + (rotatedZ / zone.lake.radiusZ) ** 2);
      const basin = 1 - smooth(THREE.MathUtils.clamp(radius, 0, 1));
      height -= basin * zone.lake.basinDepth;
    }
    return height;
  }

  #zoneByIndex(column, row) {
    const wrappedColumn = positiveModulo(column, this.zoneColumns);
    const boundedRow = THREE.MathUtils.clamp(row | 0, 0, this.zoneRows - 1);
    const key = `${wrappedColumn}:${boundedRow}`;
    if (this.zoneCache.has(key)) return this.zoneCache.get(key);
    const roll = hash01(this.seed, wrappedColumn, boundedRow, 1100);
    let type = 'wilderness';
    if (roll < 0.025) type = 'largeCity';
    else if (roll < 0.105) type = 'smallCity';
    else if (roll < 0.22) type = 'village';
    else if (roll < 0.48) type = 'farmland';
    const lakeRoll = hash01(this.seed, wrappedColumn, boundedRow, 1101);
    const lakeChance = type === 'farmland'
      ? (Number(this.config.landscape.lakeChanceInFarmZones) || 0.025)
      : type === 'wilderness'
        ? (Number(this.config.landscape.lakeChanceInWildZones) || 0.055)
        : 0;
    const zone = {
      column: wrappedColumn,
      row: boundedRow,
      type,
      hasLake: lakeRoll < lakeChance,
      centerS: (wrappedColumn + 0.5) * this.zoneSizeS,
      centerZ: -this.axialHalfLength + (boundedRow + 0.5) * this.zoneSizeZ,
    };
    if (zone.hasLake) {
      const ownerColumn = Math.floor(zone.centerS / this.circumferentialChunkSize);
      const ownerRow = Math.floor((zone.centerZ + this.axialHalfLength) / this.chunkSize);
      const localS = zone.centerS - ownerColumn * this.circumferentialChunkSize;
      const localZ = zone.centerZ - this.chunkStartZ(ownerRow);
      const radiusS = Math.min(
        27 + hash01(this.seed, wrappedColumn, boundedRow, 1102) * 9,
        localS - 7,
        this.circumferentialChunkSize - localS - 7,
      );
      const radiusZ = Math.min(
        25 + hash01(this.seed, wrappedColumn, boundedRow, 1103) * 9,
        localZ - 7,
        this.chunkSize - localZ - 7,
      );
      zone.lake = radiusS >= 11 && radiusZ >= 11
        ? {
          s: zone.centerS,
          z: zone.centerZ,
          ownerColumn,
          ownerRow,
          radiusS,
          radiusZ,
          yaw: hash01(this.seed, wrappedColumn, boundedRow, 1104) * Math.PI,
          basinDepth: Number(this.config.landscape.lakeBasinDepthMeters) || 14,
          waterLevelOffset: Number(this.config.landscape.lakeWaterLevelOffsetMeters) || 8,
        }
        : null;
      zone.hasLake = Boolean(zone.lake);
    }
    this.zoneCache.set(key, zone);
    return zone;
  }

  #zoneAt(s, z) {
    const column = Math.floor(this.wrapS(s) / this.zoneSizeS);
    const row = Math.floor((THREE.MathUtils.clamp(z, -this.axialHalfLength, this.axialHalfLength - 1e-4) + this.axialHalfLength) / this.zoneSizeZ);
    return this.#zoneByIndex(column, row);
  }

  pointAtHeight(s, z, height) {
    const theta = this.wrapS(s) / this.radius;
    const radial = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
    const up = radial.clone().negate();
    const tangent = new THREE.Vector3(-Math.sin(theta), Math.cos(theta), 0);
    const axis = new THREE.Vector3(0, 0, 1);
    const position = radial.clone().multiplyScalar(this.radius - height).setZ(z);
    return { position, up, tangent, axis };
  }

  surfacePose(s, z, eyeHeight = 0) {
    return this.pointAtHeight(s, z, this.terrainHeight(s, z) + eyeHeight);
  }

  chunkStartZ(row) {
    return -this.axialHalfLength + row * this.chunkSize;
  }

  #terrainColor(s, z, height) {
    const distance = this.riverDistance(s, z);
    const channel = Math.max(0, 1 - distance / (this.riverWidth / 2 + this.riverBank));
    if (channel > 0.12) {
      return this.colorScratch.copy(SOIL_COLOR).lerp(GRASS_COLOR, smooth(1 - channel) * 0.62 + 0.12);
    }
    const heightMix = THREE.MathUtils.clamp((height - this.baseHeight + 4) / 24, 0, 1);
    const zone = this.#zoneAt(s, z);
    const baseColor = zone.type === 'farmland' ? FARMLAND_COLOR : GRASS_COLOR;
    const color = this.colorScratch.copy(baseColor).lerp(HIGH_GRASS_COLOR, heightMix * (zone.type === 'farmland' ? 0.55 : 1));
    if (height > this.baseHeight + 12) color.lerp(ROCK_COLOR, Math.min(0.62, (height - this.baseHeight - 12) / 12));
    const variation = (this.#noise(s, z, 48, 17) + 1) * 0.045;
    const cropRows = zone.type === 'farmland' ? Math.sin((this.wrapS(s) + z * 0.16) * 0.075) * 0.035 : 0;
    return color.multiplyScalar(0.91 + variation + cropRows);
  }

  buildTerrainGeometry(column, row) {
    const sizeS = this.circumferentialChunkSize;
    const sizeZ = this.chunkSize;
    const segments = this.terrainSegments;
    const s0 = column * sizeS;
    const z0 = this.chunkStartZ(row);
    const side = segments + 1;
    const positions = new Float32Array(side * side * 3);
    const colors = new Float32Array(side * side * 3);
    const indices = new Uint32Array(segments * segments * 6);
    let vertex = 0;
    for (let iz = 0; iz <= segments; iz++) {
      const z = z0 + sizeZ * iz / segments;
      for (let is = 0; is <= segments; is++) {
        const s = s0 + sizeS * is / segments;
        const height = this.terrainHeight(s, z);
        const theta = this.wrapS(s) / this.radius;
        const radialDistance = this.radius - height;
        positions[vertex * 3] = radialDistance * Math.cos(theta);
        positions[vertex * 3 + 1] = radialDistance * Math.sin(theta);
        positions[vertex * 3 + 2] = z;
        this.#terrainColor(s, z, height).toArray(colors, vertex * 3);
        vertex++;
      }
    }
    let index = 0;
    for (let iz = 0; iz < segments; iz++) {
      for (let is = 0; is < segments; is++) {
        const a = iz * side + is;
        const b = a + side;
        const c = a + 1;
        const d = b + 1;
        indices[index++] = a;
        indices[index++] = b;
        indices[index++] = c;
        indices[index++] = b;
        indices[index++] = d;
        indices[index++] = c;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  buildRiverGeometry(column, row) {
    const sizeS = this.circumferentialChunkSize;
    const sizeZ = this.chunkSize;
    const s0 = column * sizeS;
    const s1 = s0 + sizeS;
    const z0 = this.chunkStartZ(row);
    const rows = 32;
    const positions = new Float32Array((rows + 1) * 2 * 3);
    const indices = new Uint32Array(rows * 6);
    const middleS = (s0 + s1) / 2;
    const halfWidth = this.riverWidth / 2;
    let intersectsRiver = false;
    for (let i = 0; i <= rows; i++) {
      const z = z0 + sizeZ * i / rows;
      const canonicalCenter = this.riverCenter(z);
      const center = canonicalCenter + Math.round((middleS - canonicalCenter) / this.circumference) * this.circumference;
      const left = THREE.MathUtils.clamp(center - halfWidth, s0, s1);
      const right = THREE.MathUtils.clamp(center + halfWidth, s0, s1);
      if (right - left > 0.05) intersectsRiver = true;
      const height = this.riverSurfaceHeight(z) + 0.12;
      this.pointAtHeight(left, z, height).position.toArray(positions, i * 6);
      this.pointAtHeight(right, z, height).position.toArray(positions, i * 6 + 3);
    }
    let index = 0;
    for (let i = 0; i < rows; i++) {
      const a = i * 2;
      const b = a + 2;
      const c = a + 1;
      const d = b + 1;
      indices[index++] = a;
      indices[index++] = b;
      indices[index++] = c;
      indices[index++] = b;
      indices[index++] = d;
      indices[index++] = c;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    if (!intersectsRiver) {
      geometry.dispose();
      return null;
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  generatePlacements(column, row) {
    const sizeS = this.circumferentialChunkSize;
    const sizeZ = this.chunkSize;
    const s0 = column * sizeS;
    const z0 = this.chunkStartZ(row);
    const zone = this.#zoneAt(s0 + sizeS / 2, z0 + sizeZ / 2);
    const trees = [];
    const buildings = [];
    const lakes = [];
    const roads = [];
    const farmland = [];

    const baseTreeCount = Math.max(0, Number(this.config.landscape.treeDensityPerChunk) || 24);
    const treeMultiplier = {
      wilderness: 1.45,
      farmland: 0.28,
      village: 0.62,
      smallCity: 0.2,
      largeCity: 0.1,
    }[zone.type] ?? 1;
    const treeCount = Math.round(baseTreeCount * treeMultiplier);
    for (let i = 0; i < treeCount; i++) {
      const s = s0 + 5 + hash01(this.seed, column, row, 100 + i * 2) * (sizeS - 10);
      const z = z0 + 5 + hash01(this.seed, column, row, 101 + i * 2) * (sizeZ - 10);
      if (this.riverDistance(s, z) < this.riverWidth / 2 + this.riverBank + 5) continue;
      if (zone.lake) {
        const ds = this.shortestDeltaS(s, zone.lake.s);
        const dz = z - zone.lake.z;
        if ((ds / (zone.lake.radiusS + 8)) ** 2 + (dz / (zone.lake.radiusZ + 8)) ** 2 < 1) continue;
      }
      const scale = 0.72 + hash01(this.seed, column, row, 300 + i) * 0.75;
      const kind = hash01(this.seed, column, row, 500 + i) < 0.27 ? 'round' : 'pine';
      trees.push({ s, z, scale, kind, yaw: hash01(this.seed, column, row, 700 + i) * TAU });
    }

    if (zone.lake && zone.lake.ownerColumn === column && zone.lake.ownerRow === row) {
      lakes.push({
        localS: zone.lake.s - s0,
        localZ: zone.lake.z - z0,
        radiusS: zone.lake.radiusS,
        radiusZ: zone.lake.radiusZ,
        yaw: zone.lake.yaw,
        waterLevelOffset: zone.lake.waterLevelOffset,
      });
    }

    const farmlandYaw = hash01(this.seed, zone.column, zone.row, 1200) < 0.5 ? 0 : Math.PI / 2;
    const ownsLake = zone.lake && zone.lake.ownerColumn === column && zone.lake.ownerRow === row;
    if (zone.type === 'farmland' && !ownsLake) {
      const width = Math.max(18, sizeS - 12);
      const depth = Math.max(18, sizeZ - 12);
      farmland.push({
        localS: sizeS / 2,
        localZ: sizeZ / 2,
        width,
        depth,
        yaw: farmlandYaw,
        rows: Math.max(6, Math.round(width / 8)),
        furrowSpacing: 2.4,
      });
      roads.push({
        startS: 7,
        startZ: 0,
        endS: 7,
        endZ: sizeZ,
        width: 4,
        kind: 'local',
      });
    }

    if (zone.type === 'village' || zone.type === 'smallCity' || zone.type === 'largeCity') {
      const lanesS = [sizeS * 0.32, sizeS * 0.68];
      const lanesZ = [sizeZ * 0.34, sizeZ * 0.68];
      const streetWidth = zone.type === 'village' ? 3.2 : 5.2;
      lanesS.forEach(localS => roads.push({
        startS: localS,
        startZ: 0,
        endS: localS,
        endZ: sizeZ,
        width: streetWidth,
        kind: 'local',
      }));
      lanesZ.forEach(localZ => roads.push({
        startS: 0,
        startZ: localZ,
        endS: sizeS,
        endZ: localZ,
        width: streetWidth,
        kind: 'local',
      }));

      const targetRange = {
        village: [1, 2],
        smallCity: [2, 4],
        largeCity: [4, 7],
      }[zone.type];
      const range = targetRange[1] - targetRange[0] + 1;
      const targetCount = targetRange[0] + Math.floor(hash01(this.seed, column, row, 1300) * range);
      let placed = 0;
      for (let attempt = 0; attempt < targetCount * 8 && placed < targetCount; attempt++) {
        const sample = placed * 13 + attempt;
        const localS = 15 + hash01(this.seed, column, row, 1310 + sample * 2) * (sizeS - 30);
        const localZ = 13 + hash01(this.seed, column, row, 1311 + sample * 2) * (sizeZ - 26);
        const s = s0 + localS;
        const z = z0 + localZ;
        if (this.riverDistance(s, z) < this.riverWidth / 2 + this.riverBank + 16) continue;
        if (lanesS.some(laneS => Math.abs(localS - laneS) < 9)
          || lanesZ.some(laneZ => Math.abs(localZ - laneZ) < 8)) continue;
        const dimensions = zone.type === 'village'
          ? { width: 9 + hash01(this.seed, column, row, 1400 + sample) * 8, depth: 9 + hash01(this.seed, column, row, 1401 + sample) * 8, height: 4 + hash01(this.seed, column, row, 1402 + sample) * 9 }
          : zone.type === 'smallCity'
            ? { width: 11 + hash01(this.seed, column, row, 1400 + sample) * 9, depth: 11 + hash01(this.seed, column, row, 1401 + sample) * 11, height: 8 + hash01(this.seed, column, row, 1402 + sample) * 26 }
            : { width: 13 + hash01(this.seed, column, row, 1400 + sample) * 13, depth: 13 + hash01(this.seed, column, row, 1401 + sample) * 13, height: 12 + hash01(this.seed, column, row, 1402 + sample) * 38 };
        const overlaps = buildings.some(building =>
          Math.abs(building.s - s) < (building.width + dimensions.width) * 0.52
          && Math.abs(building.z - z) < (building.depth + dimensions.depth) * 0.52);
        if (overlaps) continue;
        buildings.push({
          s,
          z,
          kind: zone.type,
          ...dimensions,
          yaw: (hash01(this.seed, column, row, 1403 + sample) < 0.5 ? 0 : Math.PI / 2)
            + (hash01(this.seed, column, row, 1404 + sample) - 0.5) * 0.12,
        });
        placed++;
      }

      if (zone.type === 'largeCity' && hash01(this.seed, column, row, 1450) < 0.036) {
        const localS = sizeS * (0.3 + hash01(this.seed, column, row, 1451) * 0.4);
        const localZ = sizeZ * (0.3 + hash01(this.seed, column, row, 1452) * 0.4);
        const s = s0 + localS;
        const z = z0 + localZ;
        if (this.riverDistance(s, z) > this.riverWidth / 2 + this.riverBank + 20) {
          buildings.push({
            s,
            z,
            kind: 'skyscraper',
            width: 19 + hash01(this.seed, column, row, 1453) * 12,
            depth: 19 + hash01(this.seed, column, row, 1454) * 12,
            height: 58 + hash01(this.seed, column, row, 1455) * 78,
            yaw: hash01(this.seed, column, row, 1456) < 0.5 ? 0 : Math.PI / 2,
          });
        }
      }
    } else if (zone.type === 'farmland' && !ownsLake && hash01(this.seed, column, row, 1500) < 0.15) {
      const localS = sizeS * (0.25 + hash01(this.seed, column, row, 1501) * 0.5);
      const localZ = sizeZ * (0.25 + hash01(this.seed, column, row, 1502) * 0.5);
      const s = s0 + localS;
      const z = z0 + localZ;
      if (this.riverDistance(s, z) > this.riverWidth / 2 + this.riverBank + 12) {
        buildings.push({
          s,
          z,
          kind: 'farm',
          width: 12 + hash01(this.seed, column, row, 1503) * 9,
          depth: 17 + hash01(this.seed, column, row, 1504) * 13,
          height: 5 + hash01(this.seed, column, row, 1505) * 5,
          yaw: farmlandYaw,
        });
      }
    }

    roads.push(...this.#intercityRoadsForChunk(column, row, s0, z0, sizeS, sizeZ));
    return { trees, buildings, lakes, roads, farmland };
  }

  #settlements() {
    if (this.settlementsCache) return this.settlementsCache;
    const settlements = [];
    for (let row = 0; row < this.zoneRows; row++) {
      for (let column = 0; column < this.zoneColumns; column++) {
        const zone = this.#zoneByIndex(column, row);
        if (zone.type !== 'village' && zone.type !== 'smallCity' && zone.type !== 'largeCity') continue;
        settlements.push({
          id: `${column}:${row}`,
          type: zone.type,
          s: this.wrapS(zone.centerS + (hash01(this.seed, column, row, 1600) - 0.5) * this.zoneSizeS * 0.28),
          z: zone.centerZ + (hash01(this.seed, column, row, 1601) - 0.5) * this.zoneSizeZ * 0.28,
        });
      }
    }
    this.settlementsCache = settlements;
    return settlements;
  }

  #intercityRoads() {
    if (this.roadCache) return this.roadCache;
    const settlements = this.#settlements();
    const edgeMap = new Map();
    settlements.forEach(source => {
      let nearest = null;
      let nearestDistance = Infinity;
      settlements.forEach(target => {
        if (source === target) return;
        const distance = Math.hypot(this.shortestDeltaS(source.s, target.s), target.z - source.z);
        if (distance < nearestDistance) {
          nearest = target;
          nearestDistance = distance;
        }
      });
      if (!nearest) return;
      const key = [source.id, nearest.id].sort().join('|');
      if (edgeMap.has(key)) return;
      const a = source.id < nearest.id ? source : nearest;
      const b = a === source ? nearest : source;
      const deltaS = this.shortestDeltaS(b.s, a.s);
      const deltaZ = b.z - a.z;
      const length = Math.hypot(deltaS, deltaZ);
      const bend = Math.min(90, length * 0.055) * (hash01(this.seed ^ seedFromString(key), this.zoneColumns, this.zoneRows, 1700) < 0.5 ? -1 : 1);
      const steps = THREE.MathUtils.clamp(Math.ceil(length / 180), 1, 96);
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const curve = Math.sin(Math.PI * t) * bend;
        points.push({
          s: a.s + deltaS * t - (deltaZ / Math.max(1, length)) * curve,
          z: a.z + deltaZ * t + (deltaS / Math.max(1, length)) * curve,
        });
      }
      edgeMap.set(key, { points, kind: 'arterial', width: 10 });
    });
    this.roadCache = [...edgeMap.values()];
    return this.roadCache;
  }

  #intercityRoadsForChunk(column, row, s0, z0, sizeS, sizeZ) {
    const roads = [];
    const middleS = s0 + sizeS / 2;
    for (const road of this.#intercityRoads()) {
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i];
        const b = road.points[i + 1];
        const shift = Math.round((middleS - (a.s + b.s) / 2) / this.circumference) * this.circumference;
        const clipped = clipSegmentToRect(
          a.s + shift,
          a.z,
          b.s + shift,
          b.z,
          s0,
          z0,
          s0 + sizeS,
          z0 + sizeZ,
        );
        if (!clipped) continue;
        const [start, end] = clipped;
        if (Math.hypot(end.x - start.x, end.y - start.y) < 0.5) continue;
        roads.push({
          startS: start.x - s0,
          startZ: start.y - z0,
          endS: end.x - s0,
          endZ: end.y - z0,
          width: road.width,
          kind: road.kind === 'local' ? 'local' : 'arterial',
        });
      }
    }
    return roads;
  }

  buildOppositeSideGeometry(centerS, centerZ) {
    const segmentsS = 96;
    const segmentsZ = 40;
    const side = segmentsS + 1;
    const spanS = this.circumference * 0.5;
    const startS = centerS + this.circumference * 0.25;
    const spanZ = Math.min(3072, this.config.surface.axialLengthMeters * 0.42);
    const startZ = THREE.MathUtils.clamp(
      centerZ - spanZ / 2,
      -this.axialHalfLength,
      this.axialHalfLength - spanZ,
    );
    const positions = new Float32Array((segmentsS + 1) * (segmentsZ + 1) * 3);
    const colors = new Float32Array(positions.length);
    const indices = new Uint32Array(segmentsS * segmentsZ * 6);
    let vertex = 0;
    for (let iz = 0; iz <= segmentsZ; iz++) {
      const z = startZ + spanZ * iz / segmentsZ;
      for (let is = 0; is <= segmentsS; is++) {
        const s = startS + spanS * is / segmentsS;
        const height = this.terrainHeight(s, z);
        const theta = this.wrapS(s) / this.radius;
        const radialDistance = this.radius - height;
        positions[vertex * 3] = radialDistance * Math.cos(theta);
        positions[vertex * 3 + 1] = radialDistance * Math.sin(theta);
        positions[vertex * 3 + 2] = z;
        this.#terrainColor(s, z, height).lerp(DISTANT_SKY_COLOR, 0.54).toArray(colors, vertex * 3);
        vertex++;
      }
    }
    let index = 0;
    for (let iz = 0; iz < segmentsZ; iz++) {
      for (let is = 0; is < segmentsS; is++) {
        const a = iz * side + is;
        const b = a + side;
        const c = a + 1;
        const d = b + 1;
        indices[index++] = a;
        indices[index++] = b;
        indices[index++] = c;
        indices[index++] = b;
        indices[index++] = d;
        indices[index++] = c;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export function makeSurfaceQuaternion(pose, yaw = 0) {
  const basis = new THREE.Matrix4().makeBasis(pose.tangent, pose.up, pose.axis);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
  if (yaw) quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP_Y, yaw));
  return quaternion;
}
