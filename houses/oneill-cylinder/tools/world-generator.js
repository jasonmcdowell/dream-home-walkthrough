import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP_Y = new THREE.Vector3(0, 1, 0);
const GRASS_COLOR = new THREE.Color(0x52774e);
const HIGH_GRASS_COLOR = new THREE.Color(0x72855a);
const SOIL_COLOR = new THREE.Color(0x84734c);
const ROCK_COLOR = new THREE.Color(0x746f61);
const FARMLAND_COLOR = new THREE.Color(0x82915a);
const FOREST_COLOR = new THREE.Color(0x456b48);
const GRASSLAND_COLOR = new THREE.Color(0x66834f);
const DRYLAND_COLOR = new THREE.Color(0x938551);
const WETLAND_COLOR = new THREE.Color(0x55796b);
const ALPINE_COLOR = new THREE.Color(0x85877d);
const DISTANT_SKY_COLOR = new THREE.Color(0x9db9bb);
const BIOME_COLORS = {
  forest: FOREST_COLOR,
  grassland: GRASSLAND_COLOR,
  dryland: DRYLAND_COLOR,
  wetland: WETLAND_COLOR,
  highlands: ALPINE_COLOR,
};
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
    this.baseHeight = config.landscape.baseHeightMeters;
    this.riverPhase = hash01(this.seed, 17, 91, 4) * TAU;
    this.riverPaths = this.#createRiverPaths();
    this.riverWidth = Math.max(8, ...this.riverPaths.map(path => path.width));
    this.riverBank = Math.max(1, ...this.riverPaths.map(path => path.bank));
    this.riverDepth = Math.max(1, ...this.riverPaths.map(path => path.depth));
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

  #biomeAt(s, z, height) {
    const landscape = this.config.landscape;
    const scale = Math.max(768, Number(landscape.biomeScaleMeters) || 3072);
    const warp = Math.max(0, Number(landscape.biomeWarpMeters) || 660);
    const warpS = this.#noise(s, z, scale * 0.62, 60) * warp
      + this.#noise(s, z, scale * 0.28, 61) * warp * 0.28;
    const warpZ = this.#noise(s, z, scale * 0.62, 62) * warp
      + this.#noise(s, z, scale * 0.28, 63) * warp * 0.28;
    const warpedS = s + warpS;
    const warpedZ = z + warpZ;
    const regionalShape = this.#noise(warpedS, warpedZ, scale, 64) * 0.58
      + this.#noise(warpedS, warpedZ, scale * 0.48, 65) * 0.28
      + this.#noise(warpedS, warpedZ, scale * 0.24, 66) * 0.14;
    const moisture = this.#noise(warpedS + scale * 0.17, warpedZ - scale * 0.11, scale * 0.72, 67) * 0.68
      + this.#noise(warpedS - scale * 0.09, warpedZ + scale * 0.2, scale * 0.34, 68) * 0.32;

    if (height > this.baseHeight + 31 + regionalShape * 7) return 'highlands';
    if (moisture > 0.43 && regionalShape < 0.55) return 'wetland';
    if (moisture < -0.38) return 'dryland';
    return regionalShape > 0.12 ? 'forest' : 'grassland';
  }

  biomeAt(s, z) {
    return this.#biomeAt(s, z, this.baseTerrainHeight(s, z));
  }

  #createRiverPaths() {
    const landscape = this.config.landscape;
    const network = landscape.riverNetwork ?? {};
    const boundedCount = value => THREE.MathUtils.clamp(Math.round(Number(value) || 0), 0, 4);
    const longitudinalCount = boundedCount(network.longitudinalCount ?? 2);
    const circumferentialCount = boundedCount(network.circumferentialCount ?? 2);
    const paths = [];
    const baseWidth = Math.max(8, Number(landscape.riverWidthMeters) || 28);
    const baseBank = Math.max(4, Number(landscape.riverBankMeters) || 44);
    const bedDepth = Math.max(4, Number(landscape.riverBedDepthMeters) || 14);
    const longWidth = Math.max(8, Number(network.longitudinalWidthMeters) || baseWidth);
    const ringWidth = Math.max(8, Number(network.circumferentialWidthMeters) || Math.min(baseWidth, 22));
    const longBank = Math.max(4, Number(network.longitudinalBankMeters) || baseBank);
    const ringBank = Math.max(4, Number(network.circumferentialBankMeters) || Math.min(baseBank, 36));

    for (let index = 0; index < longitudinalCount; index++) {
      const spacing = 1 / longitudinalCount;
      const offset = (index + 0.5) * spacing
        + (hash01(this.seed, index, 2200, 0) - 0.5) * spacing * 0.08;
      paths.push({
        index,
        orientation: 'longitudinal',
        baseFraction: positiveModulo(offset, 1),
        phase: hash01(this.seed, index, 2201, 0) * TAU,
        width: longWidth * (0.86 + hash01(this.seed, index, 2202, 0) * 0.28),
        bank: longBank,
        depth: bedDepth,
        meanderFraction: Math.max(0.005, Number(network.longitudinalMeanderFraction) || 0.055),
      });
    }

    for (let index = 0; index < circumferentialCount; index++) {
      const spacing = 1 / (circumferentialCount + 1);
      const offset = (index + 1) * spacing
        + (hash01(this.seed, index, 2210, 0) - 0.5) * spacing * 0.12;
      paths.push({
        index: longitudinalCount + index,
        orientation: 'circumferential',
        baseFraction: THREE.MathUtils.clamp(offset, 0.08, 0.92),
        phase: hash01(this.seed, index, 2211, 0) * TAU,
        width: ringWidth * (0.86 + hash01(this.seed, index, 2212, 0) * 0.28),
        bank: ringBank,
        depth: bedDepth * 0.9,
        meanderMeters: Math.max(20, Number(network.circumferentialMeanderMeters) || 105),
      });
    }
    return paths;
  }

  #longitudinalRiverCenter(path, z) {
    const fraction = path.baseFraction;
    const phase = path.phase;
    const coarse = this.#noise(0, z, 2048, 2220 + path.index * 4);
    const middle = this.#noise(0, z, 896, 2221 + path.index * 4);
    const fine = this.#noise(0, z, 384, 2222 + path.index * 4);
    const wave = Math.sin(z * 0.00044 + phase) * 0.38
      + Math.sin(z * 0.00104 + phase * 1.71) * 0.2;
    const drift = wave + coarse * 0.28 + middle * 0.12 + fine * 0.045;
    return this.wrapS(fraction * this.circumference + drift * path.meanderFraction * this.circumference);
  }

  #circumferentialRiverCenter(path, s) {
    const angle = this.wrapS(s) / this.circumference * TAU;
    const coarse = this.#noise(s, 0, 2048, 2240 + path.index * 3);
    const middle = this.#noise(s, 0, 896, 2241 + path.index * 3);
    const wave = Math.sin(angle * 2 + path.phase) * 0.42
      + Math.sin(angle * 5 + path.phase * 1.57) * 0.19;
    const drift = wave + coarse * 0.28 + middle * 0.11;
    return -this.axialHalfLength + path.baseFraction * this.config.surface.axialLengthMeters
      + drift * path.meanderMeters;
  }

  #riverDistanceToPath(path, s, z) {
    const sampleStep = 12;
    if (path.orientation === 'longitudinal') {
      const center = this.#longitudinalRiverCenter(path, z);
      const before = this.#longitudinalRiverCenter(path, z - sampleStep);
      const after = this.#longitudinalRiverCenter(path, z + sampleStep);
      const slope = this.shortestDeltaS(after, before) / (sampleStep * 2);
      return Math.abs(this.shortestDeltaS(s, center)) / Math.sqrt(1 + slope * slope);
    }
    const center = this.#circumferentialRiverCenter(path, s);
    const before = this.#circumferentialRiverCenter(path, s - sampleStep);
    const after = this.#circumferentialRiverCenter(path, s + sampleStep);
    const slope = (after - before) / (sampleStep * 2);
    return Math.abs(z - center) / Math.sqrt(1 + slope * slope);
  }

  #riverMetrics(s, z) {
    let distance = Infinity;
    let carveDepth = 0;
    for (const path of this.riverPaths) {
      const pathDistance = this.#riverDistanceToPath(path, s, z);
      distance = Math.min(distance, pathDistance);
      const bankInfluence = 1 - smooth(THREE.MathUtils.clamp(
        (pathDistance - path.width / 2) / Math.max(1, path.bank),
        0,
        1,
      ));
      carveDepth = Math.max(carveDepth, bankInfluence * path.depth);
    }
    return { distance, carveDepth };
  }

  riverCenter(z) {
    const path = this.riverPaths.find(candidate => candidate.orientation === 'longitudinal');
    return path ? this.#longitudinalRiverCenter(path, z) : this.circumference / 2;
  }

  riverDistance(s, z) {
    return this.#riverMetrics(s, z).distance;
  }

  riverSurfaceHeight(z) {
    const path = this.riverPaths.find(candidate => candidate.orientation === 'longitudinal');
    const s = path ? this.#longitudinalRiverCenter(path, z) : this.circumference / 2;
    return this.baseTerrainHeight(s, z) - (path?.depth ?? 14) * 0.76;
  }

  terrainHeight(s, z, riverMetrics = null) {
    const rivers = riverMetrics ?? this.#riverMetrics(s, z);
    let height = this.baseTerrainHeight(s, z) - rivers.carveDepth;
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
    if (roll < 0.035) type = 'largeCity';
    else if (roll < 0.115) type = 'smallCity';
    else if (roll < 0.245) type = 'village';
    else if (roll < 0.5) type = 'farmland';
    const centerS = (wrappedColumn + 0.5) * this.zoneSizeS;
    const centerZ = -this.axialHalfLength + (boundedRow + 0.5) * this.zoneSizeZ;
    const biome = this.#biomeAt(centerS, centerZ, this.baseTerrainHeight(centerS, centerZ));
    const lakeRoll = hash01(this.seed, wrappedColumn, boundedRow, 1101);
    const lakeChance = type === 'farmland'
      ? (Number(this.config.landscape.lakeChanceInFarmZones) || 0.025)
      : type === 'wilderness'
        ? biome === 'wetland'
          ? (Number(this.config.landscape.lakeChanceInWetlands) || 0.14)
          : (Number(this.config.landscape.lakeChanceInWildZones) || 0.055)
        : 0;
    const zone = {
      column: wrappedColumn,
      row: boundedRow,
      type,
      biome,
      hasLake: lakeRoll < lakeChance,
      centerS,
      centerZ,
    };
    if (zone.hasLake) {
      const ownerColumn = Math.floor(zone.centerS / this.circumferentialChunkSize);
      const ownerRow = Math.floor((zone.centerZ + this.axialHalfLength) / this.chunkSize);
      const localS = this.circumferentialChunkSize / 2
        + (hash01(this.seed, wrappedColumn, boundedRow, 1102) - 0.5) * 12;
      const localZ = this.chunkSize / 2
        + (hash01(this.seed, wrappedColumn, boundedRow, 1103) - 0.5) * 12;
      const lakeS = ownerColumn * this.circumferentialChunkSize + localS;
      const lakeZ = this.chunkStartZ(ownerRow) + localZ;
      const radiusS = Math.min(
        34 + hash01(this.seed, wrappedColumn, boundedRow, 1104) * 18,
        localS - 8,
        this.circumferentialChunkSize - localS - 8,
      );
      const radiusZ = Math.min(
        25 + hash01(this.seed, wrappedColumn, boundedRow, 1105) * 10,
        localZ - 8,
        this.chunkSize - localZ - 8,
      );
      zone.lake = radiusS >= 11 && radiusZ >= 11
        ? {
          s: lakeS,
          z: lakeZ,
          ownerColumn,
          ownerRow,
          radiusS,
          radiusZ,
          yaw: hash01(this.seed, wrappedColumn, boundedRow, 1106) * Math.PI,
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

  #terrainColor(s, z, height, riverMetrics = null) {
    const rivers = riverMetrics ?? this.#riverMetrics(s, z);
    const channel = Math.max(0, rivers.carveDepth / Math.max(1, this.riverDepth));
    if (channel > 0.12) {
      return this.colorScratch.copy(SOIL_COLOR).lerp(GRASS_COLOR, smooth(1 - channel) * 0.62 + 0.12);
    }
    const heightMix = THREE.MathUtils.clamp((height - this.baseHeight + 4) / 24, 0, 1);
    const zone = this.#zoneAt(s, z);
    const biome = this.#biomeAt(s, z, height + rivers.carveDepth);
    const baseColor = zone.type === 'farmland' ? FARMLAND_COLOR : (BIOME_COLORS[biome] || GRASS_COLOR);
    const highColor = biome === 'highlands' ? ROCK_COLOR : HIGH_GRASS_COLOR;
    const highBlend = zone.type === 'farmland' ? 0.55 : biome === 'dryland' ? 0.34 : 0.86;
    const color = this.colorScratch.copy(baseColor).lerp(highColor, heightMix * highBlend);
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
        const riverMetrics = this.#riverMetrics(s, z);
        const height = this.terrainHeight(s, z, riverMetrics);
        const theta = this.wrapS(s) / this.radius;
        const radialDistance = this.radius - height;
        positions[vertex * 3] = radialDistance * Math.cos(theta);
        positions[vertex * 3 + 1] = radialDistance * Math.sin(theta);
        positions[vertex * 3 + 2] = z;
        this.#terrainColor(s, z, height, riverMetrics).toArray(colors, vertex * 3);
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
    const positions = [];
    const indices = [];

    for (const path of this.riverPaths) {
      const baseVertex = positions.length / 3;
      let intersects = false;
      if (path.orientation === 'longitudinal') {
        const middleS = (s0 + s1) / 2;
        const halfWidth = path.width / 2;
        for (let i = 0; i <= rows; i++) {
          const z = z0 + sizeZ * i / rows;
          const canonicalCenter = this.#longitudinalRiverCenter(path, z);
          const center = canonicalCenter + Math.round((middleS - canonicalCenter) / this.circumference) * this.circumference;
          const left = THREE.MathUtils.clamp(center - halfWidth, s0, s1);
          const right = THREE.MathUtils.clamp(center + halfWidth, s0, s1);
          if (right - left > 0.05) intersects = true;
          const height = this.baseTerrainHeight(center, z) - path.depth * 0.76 + 0.12;
          this.pointAtHeight(left, z, height).position.toArray(positions, positions.length);
          positions.length += 3;
          this.pointAtHeight(right, z, height).position.toArray(positions, positions.length);
          positions.length += 3;
        }
      } else {
        const halfWidth = path.width / 2;
        for (let i = 0; i <= rows; i++) {
          const s = s0 + sizeS * i / rows;
          const center = this.#circumferentialRiverCenter(path, s);
          const lower = THREE.MathUtils.clamp(center - halfWidth, z0, z0 + sizeZ);
          const upper = THREE.MathUtils.clamp(center + halfWidth, z0, z0 + sizeZ);
          if (upper - lower > 0.05) intersects = true;
          const height = this.baseTerrainHeight(s, center) - path.depth * 0.76 + 0.12;
          this.pointAtHeight(s, lower, height).position.toArray(positions, positions.length);
          positions.length += 3;
          this.pointAtHeight(s, upper, height).position.toArray(positions, positions.length);
          positions.length += 3;
        }
      }
      if (!intersects) {
        positions.length = baseVertex * 3;
        continue;
      }
      for (let i = 0; i < rows; i++) {
        const a = baseVertex + i * 2;
        const b = a + 2;
        const c = a + 1;
        const d = b + 1;
        if (path.orientation === 'longitudinal') {
          indices.push(a, b, c, b, d, c);
        } else {
          // A circumferential ribbon's tangent points along s, so reverse the
          // strip winding to keep its surface normal facing the cylinder interior.
          indices.push(a, c, b, b, c, d);
        }
      }
    }

    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
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
    const biomeTreeMultiplier = {
      forest: 1.5,
      grassland: 0.62,
      dryland: 0.16,
      wetland: 0.9,
      highlands: 0.38,
    }[zone.biome] ?? 1;
    const treeMultiplier = {
      wilderness: 1.45,
      farmland: 0.28,
      village: 0.62,
      smallCity: 0.2,
      largeCity: 0.1,
    }[zone.type] ?? 1;
    const treeCount = Math.round(baseTreeCount * treeMultiplier * biomeTreeMultiplier);
    const roundTreeChance = {
      forest: 0.44,
      grassland: 0.34,
      dryland: 0.9,
      wetland: 0.86,
      highlands: 0.2,
    }[zone.biome] ?? 0.3;
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
      const kind = hash01(this.seed, column, row, 500 + i) < roundTreeChance ? 'round' : 'pine';
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
      const targetRange = {
        village: [2, 4],
        smallCity: [5, 8],
        largeCity: [9, 14],
      }[zone.type];
      const range = targetRange[1] - targetRange[0] + 1;
      const targetCount = targetRange[0] + Math.floor(hash01(this.seed, column, row, 1300) * range);

      const targetRoadSpacing = { village: 150, smallCity: 104, largeCity: 68 }[zone.type];
      const sRoadCount = Math.max(2, Math.round(this.circumference / targetRoadSpacing));
      const roadSpacingS = this.circumference / sRoadCount;
      const roadSpacingZ = targetRoadSpacing;
      const streetWidth = zone.type === 'village' ? 3.2 : zone.type === 'smallCity' ? 5 : 6.2;
      const firstRoadS = Math.ceil((s0 - 1e-4) / roadSpacingS) * roadSpacingS;
      for (let globalS = firstRoadS; globalS < s0 + sizeS - 1e-4; globalS += roadSpacingS) {
        const localS = globalS - s0;
        roads.push({
          startS: localS,
          startZ: 0,
          endS: localS,
          endZ: sizeZ,
          width: streetWidth,
          kind: 'local',
        });
      }
      const firstRoadZ = -this.axialHalfLength
        + Math.ceil((z0 + this.axialHalfLength - 1e-4) / roadSpacingZ) * roadSpacingZ;
      for (let globalZ = firstRoadZ; globalZ < z0 + sizeZ - 1e-4; globalZ += roadSpacingZ) {
        const localZ = globalZ - z0;
        roads.push({
          startS: 0,
          startZ: localZ,
          endS: sizeS,
          endZ: localZ,
          width: streetWidth,
          kind: 'local',
        });
      }

      let placed = 0;
      for (let attempt = 0; attempt < targetCount * 14 && placed < targetCount; attempt++) {
        const sample = placed * 13 + attempt;
        const localS = 15 + hash01(this.seed, column, row, 1310 + sample * 2) * (sizeS - 30);
        const localZ = 13 + hash01(this.seed, column, row, 1311 + sample * 2) * (sizeZ - 26);
        const s = s0 + localS;
        const z = z0 + localZ;
        if (this.riverDistance(s, z) < this.riverWidth / 2 + this.riverBank + 16) continue;
        const dimensions = zone.type === 'village'
          ? { width: 9 + hash01(this.seed, column, row, 1400 + sample) * 8, depth: 9 + hash01(this.seed, column, row, 1401 + sample) * 8, height: 4 + hash01(this.seed, column, row, 1402 + sample) * 9 }
          : zone.type === 'smallCity'
            ? { width: 11 + hash01(this.seed, column, row, 1400 + sample) * 9, depth: 11 + hash01(this.seed, column, row, 1401 + sample) * 11, height: 8 + hash01(this.seed, column, row, 1402 + sample) * 26 }
            : { width: 13 + hash01(this.seed, column, row, 1400 + sample) * 13, depth: 13 + hash01(this.seed, column, row, 1401 + sample) * 13, height: 12 + hash01(this.seed, column, row, 1402 + sample) * 38 };
        const nearestStreetS = Math.abs(this.shortestDeltaS(s, Math.round(s / roadSpacingS) * roadSpacingS));
        const axialOffset = z + this.axialHalfLength;
        const nearestStreetZ = Math.abs(axialOffset - Math.round(axialOffset / roadSpacingZ) * roadSpacingZ);
        if (nearestStreetS < dimensions.width / 2 + streetWidth / 2 + 2
          || nearestStreetZ < dimensions.depth / 2 + streetWidth / 2 + 2) continue;
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

      if (zone.type === 'largeCity' && hash01(this.seed, column, row, 1450) < 0.12) {
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
            height: 88 + hash01(this.seed, column, row, 1455) * 122,
            yaw: hash01(this.seed, column, row, 1456) < 0.5 ? 0 : Math.PI / 2,
          });
        }
      }
    } else if (zone.type === 'farmland' && !ownsLake && hash01(this.seed, column, row, 1500) < 0.12) {
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
    } else if (zone.type === 'wilderness' && hash01(this.seed, column, row, 1550) < 0.009) {
      const localS = sizeS * (0.25 + hash01(this.seed, column, row, 1551) * 0.5);
      const localZ = sizeZ * (0.22 + hash01(this.seed, column, row, 1552) * 0.56);
      const s = s0 + localS;
      const z = z0 + localZ;
      if (this.riverDistance(s, z) > this.riverWidth / 2 + this.riverBank + 14) {
        buildings.push({
          s,
          z,
          kind: 'farm',
          width: 10 + hash01(this.seed, column, row, 1553) * 8,
          depth: 12 + hash01(this.seed, column, row, 1554) * 9,
          height: 4 + hash01(this.seed, column, row, 1555) * 4,
          yaw: hash01(this.seed, column, row, 1556) < 0.5 ? 0 : Math.PI / 2,
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

  buildOppositeSideGeometry(centerS, centerZ, visualDistance = this.config.streaming.visualDistanceMeters) {
    const sizeS = this.circumferentialChunkSize;
    const sizeZ = this.chunkSize;
    const range = Math.max(0, Number(visualDistance) || 0);
    const loadedRadius = range + Math.hypot(sizeS, sizeZ) / 2;
    const seamMargin = sizeS / 2 + 8;
    const insetS = Math.min(
      this.circumference / 2 - 12,
      loadedRadius + seamMargin,
    );
    const spanS = Math.max(24, this.circumference - insetS * 2);
    const startS = centerS + insetS;
    const axialLength = this.config.surface.axialLengthMeters;
    const spanZ = Math.min(
      axialLength,
      Math.max(3072, range * 2 + sizeZ * 2),
    );
    const spacing = 16;
    const segmentsS = Math.max(8, Math.ceil(spanS / spacing));
    const segmentsZ = Math.max(8, Math.ceil(spanZ / spacing));
    const side = segmentsS + 1;
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
        const riverMetrics = this.#riverMetrics(s, z);
        const height = this.terrainHeight(s, z, riverMetrics);
        const theta = this.wrapS(s) / this.radius;
        const radialDistance = this.radius - height;
        positions[vertex * 3] = radialDistance * Math.cos(theta);
        positions[vertex * 3 + 1] = radialDistance * Math.sin(theta);
        positions[vertex * 3 + 2] = z;
        this.#terrainColor(s, z, height, riverMetrics)
          .lerp(DISTANT_SKY_COLOR, 0.54)
          .toArray(colors, vertex * 3);
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
