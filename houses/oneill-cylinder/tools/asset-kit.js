/**
 * Build reusable, low-poly building silhouettes for procedural city and farm
 * placements. Each returned BufferGeometry is centered and normalized to
 * unit bounds on all three axes; callers should use instance scale for size.
 */
export function createBuildingArchetypeGeometries(THREE) {
  function makeBuilder() {
    const positionArrays = [];

    function add(geometry, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
      const mesh = new THREE.Mesh(geometry);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.set(rx, ry, rz);
      mesh.updateMatrix();
      geometry.applyMatrix4(mesh.matrix);

      const flatGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
      positionArrays.push(flatGeometry.attributes.position.array.slice());
      flatGeometry.dispose();
      if (flatGeometry !== geometry) geometry.dispose();
    }

    function box(x, y, z, sx, sy, sz) {
      add(new THREE.BoxGeometry(1, 1, 1), x, y, z, sx, sy, sz);
    }

    function pitchedRoof(x, eaveY, z, width, depth, rise) {
      const roof = new THREE.ConeGeometry(0.72, 1, 4, 1);
      add(roof, x, eaveY + rise / 2, z, width / 1.44, rise, depth / 1.44, 0, Math.PI / 4, 0);
    }

    function home(x, z, width, depth, wallHeight) {
      box(x, wallHeight / 2, z, width, wallHeight, depth);
      pitchedRoof(x, wallHeight, z, width * 1.12, depth * 1.12, Math.min(width, depth) * 0.56);
      // A plain front porch roof gives houses a readable street-facing edge.
      box(x, wallHeight * 0.74, z + depth * 0.59, width * 0.44, 0.055, depth * 0.3);
      box(x, wallHeight * 0.34, z + depth * 0.53, width * 0.14, wallHeight * 0.64, 0.045);
    }

    function midrise(x, z, width, depth, height, setback = 0) {
      box(x, height / 2, z, width, height, depth);
      if (setback > 0) {
        box(x, height + setback / 2, z, width * 0.74, setback, depth * 0.76);
        box(x, height + setback + 0.035, z, width * 0.18, 0.07, depth * 0.18);
      }
    }

    return { add, box, home, midrise, pitchedRoof, finish: normalizeAndMerge };

    function normalizeAndMerge() {
      const vertexCount = positionArrays.reduce((sum, positions) => sum + positions.length / 3, 0);
      const mergedPositions = new Float32Array(vertexCount * 3);
      let offset = 0;
      for (const positions of positionArrays) {
        mergedPositions.set(positions, offset);
        offset += positions.length;
      }

      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
      merged.computeBoundingBox();
      const bounds = merged.boundingBox;
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const safeSize = new THREE.Vector3(
        Math.max(size.x, 1e-5),
        Math.max(size.y, 1e-5),
        Math.max(size.z, 1e-5),
      );
      merged.translate(-center.x, -center.y, -center.z);
      merged.scale(1 / safeSize.x, 1 / safeSize.y, 1 / safeSize.z);
      merged.computeVertexNormals();
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      return merged;
    }
  }

  function makeVillage() {
    const builder = makeBuilder();
    builder.home(0.04, -0.02, 0.46, 0.48, 0.5);
    builder.home(-0.54, -0.35, 0.32, 0.34, 0.41);
    builder.home(0.47, 0.43, 0.31, 0.33, 0.38);
    return builder.finish();
  }

  function makeSmallCity() {
    const builder = makeBuilder();
    const blocks = [
      [-0.48, -0.46, 0.36, 0.34, 0.62, 0.12],
      [0.00, -0.48, 0.42, 0.36, 0.88, 0.12],
      [0.48, -0.44, 0.34, 0.34, 0.55, 0.08],
      [-0.47, 0.02, 0.34, 0.35, 0.75, 0.08],
      [0.00, 0.02, 0.42, 0.36, 1.00, 0.15],
      [0.48, 0.03, 0.34, 0.33, 0.66, 0.08],
      [-0.26, 0.47, 0.37, 0.32, 0.58, 0.08],
      [0.28, 0.47, 0.39, 0.32, 0.78, 0.1],
    ];
    for (const [x, z, width, depth, height, setback] of blocks) {
      builder.midrise(x, z, width, depth, height, setback);
    }
    // A shared low podium visually binds the compact center without filling its streets.
    builder.box(0, 0.075, 0, 1.12, 0.15, 1.0);
    return builder.finish();
  }

  function makeLargeCity() {
    const builder = makeBuilder();
    const blocks = [
      [-0.66, -0.60, 0.25, 0.27, 0.47, 0], [-0.34, -0.62, 0.3, 0.27, 0.63, 0.07],
      [0.00, -0.62, 0.34, 0.28, 0.78, 0.09], [0.37, -0.62, 0.3, 0.27, 0.56, 0],
      [0.68, -0.56, 0.24, 0.32, 0.67, 0.07], [-0.68, -0.24, 0.27, 0.3, 0.72, 0.08],
      [-0.34, -0.26, 0.31, 0.3, 0.92, 0.1], [0.02, -0.25, 0.36, 0.31, 0.68, 0],
      [0.39, -0.25, 0.3, 0.31, 0.84, 0.08], [0.68, -0.18, 0.24, 0.3, 0.52, 0],
      [-0.68, 0.13, 0.25, 0.31, 0.58, 0], [-0.34, 0.13, 0.32, 0.31, 0.79, 0.08],
      [0.03, 0.14, 0.38, 0.31, 1.0, 0.12], [0.4, 0.14, 0.3, 0.3, 0.67, 0.07],
      [0.69, 0.18, 0.23, 0.29, 0.77, 0.08], [-0.57, 0.52, 0.31, 0.28, 0.64, 0.06],
      [-0.2, 0.53, 0.34, 0.28, 0.86, 0.08], [0.19, 0.53, 0.33, 0.27, 0.7, 0],
      [0.56, 0.53, 0.3, 0.28, 0.55, 0],
    ];
    for (const [x, z, width, depth, height, setback] of blocks) {
      builder.midrise(x, z, width, depth, height, setback);
    }
    // Broad civic and transit podiums create a denser center with open street gaps.
    builder.box(0, 0.055, -0.05, 1.86, 0.11, 1.22);
    builder.box(-0.84, 0.05, 0.45, 0.34, 0.1, 0.48);
    return builder.finish();
  }

  function makeSkyscrapers() {
    const builder = makeBuilder();
    const towers = [
      { x: -0.43, z: -0.3, width: 0.22, depth: 0.22, height: 2.0, crown: 0.14 },
      { x: 0.12, z: -0.22, width: 0.26, depth: 0.24, height: 2.48, crown: 0.2 },
      { x: 0.49, z: 0.34, width: 0.18, depth: 0.2, height: 1.68, crown: 0.12 },
      { x: -0.38, z: 0.42, width: 0.19, depth: 0.2, height: 1.44, crown: 0.1 },
    ];
    for (const tower of towers) {
      builder.midrise(tower.x, tower.z, tower.width, tower.depth, tower.height, tower.crown);
      // Narrow roof lanterns make these read as towers rather than ordinary blocks.
      builder.box(tower.x, tower.height + tower.crown + 0.14, tower.z, tower.width * 0.22, 0.28, tower.depth * 0.22);
    }
    return builder.finish();
  }

  function makeFarm() {
    const builder = makeBuilder();
    // Long barn with a clear ridge roof, loft vent, and low attached machinery shed.
    boxBarn(builder, -0.08, -0.2, 0.82, 0.48, 0.66);
    builder.home(-0.66, 0.45, 0.3, 0.34, 0.34);
    builder.midrise(0.63, -0.38, 0.28, 0.25, 0.38, 0.04);

    // A pair of low-poly silos with domed caps beside the barn.
    for (const x of [0.43, 0.7]) {
      builder.add(new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false), x, 0.49, 0.33, 0.25, 0.98, 0.25);
      builder.add(new THREE.ConeGeometry(0.54, 0.28, 10, 1), x, 1.12, 0.33, 0.25, 0.28, 0.25);
    }
    // A small water tower gives the farm skyline one more recognizable marker.
    builder.add(new THREE.CylinderGeometry(0.37, 0.45, 1, 8, 1, false), -0.65, 0.73, -0.38, 0.13, 0.42, 0.13);
    builder.add(new THREE.CylinderGeometry(0.56, 0.56, 1, 8, 1, false), -0.65, 1.0, -0.38, 0.22, 0.18, 0.22);
    return builder.finish();
  }

  function boxBarn(builder, x, z, width, depth, wallHeight) {
    builder.box(x, wallHeight / 2, z, width, wallHeight, depth);
    builder.pitchedRoof(x, wallHeight, z, width * 1.08, depth * 1.12, width * 0.38);
    builder.box(x, wallHeight * 0.78, z + depth * 0.52, width * 0.34, wallHeight * 0.42, 0.035);
    // Low loading bay and front-facing barn doors.
    builder.box(x, wallHeight * 0.38, z + depth * 0.54, width * 0.43, wallHeight * 0.62, 0.05);
    builder.box(x, wallHeight + 0.015, z, width * 0.16, 0.03, depth * 0.68);
  }

  return {
    village: makeVillage(),
    smallCity: makeSmallCity(),
    largeCity: makeLargeCity(),
    skyscraper: makeSkyscrapers(),
    farm: makeFarm(),
  };
}
