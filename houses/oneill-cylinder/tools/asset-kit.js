/**
 * Low-poly building silhouettes for seeded O'Neill surface placements.
 *
 * Every returned BufferGeometry has a centered, unit-sized X/Y/Z bounding box;
 * placement width, height, and depth should be applied as instance scale. The
 * two house shells retain real wall/floor thickness, interior partitions, and
 * a front (+Z) doorway. Their roof is kept over the rear portion so the room is
 * easy to see. `*OpenDoor` variants add a leaf swung outward from the aperture.
 */
export function createBuildingArchetypeGeometries(THREE) {
  function createBuilder() {
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

    function box(x, y, z, width, height, depth, rotationZ = 0) {
      add(new THREE.BoxGeometry(1, 1, 1), x, y, z, width, height, depth, 0, 0, rotationZ);
    }

    function cylinder(x, y, z, radiusBottom, radiusTop, height, sides = 8) {
      add(new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, sides, 1), x, y, z, 1, height, 1);
    }

    function finish() {
      const vertexCount = positionArrays.reduce((sum, positions) => sum + positions.length / 3, 0);
      const positions = new Float32Array(vertexCount * 3);
      let offset = 0;
      for (const part of positionArrays) {
        positions.set(part, offset);
        offset += part.length;
      }

      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      merged.computeBoundingBox();
      const center = merged.boundingBox.getCenter(new THREE.Vector3());
      const size = merged.boundingBox.getSize(new THREE.Vector3());
      merged.translate(-center.x, -center.y, -center.z);
      merged.scale(
        1 / Math.max(size.x, 1e-5),
        1 / Math.max(size.y, 1e-5),
        1 / Math.max(size.z, 1e-5),
      );
      merged.computeVertexNormals();
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      return merged;
    }

    return { add, box, cylinder, finish };
  }

  function addPitchedRoof(builder, wallTop, rearZ, roofDepth, width = 1, rise = 0.17, centerX = 0) {
    const slopeLength = Math.hypot(width / 2, rise);
    const angle = Math.atan2(rise, width / 2);
    const centerZ = rearZ + roofDepth / 2;
    builder.box(centerX - width / 4, wallTop + rise / 2, centerZ, slopeLength, 0.035, roofDepth, angle);
    builder.box(centerX + width / 4, wallTop + rise / 2, centerZ, slopeLength, 0.035, roofDepth, -angle);
  }

  function addHouseShell(floors, withOpenDoor) {
    const builder = createBuilder();
    const rearZ = -0.5;
    const frontZ = 0.2;
    const wallThickness = 0.04;
    const outsideWidth = 1;
    const frontDoorWidth = 0.29;

    if (floors === 1) {
      const floorY = 0.045;
      const floorThickness = 0.07;
      const wallBottom = floorY + floorThickness / 2;
      const wallTop = 0.82;
      const wallHeight = wallTop - (floorY + floorThickness);
      const doorHeight = 0.6;

      // The solid slab and three enclosing walls form a walk-in shell.
      builder.box(0, floorY, (rearZ + frontZ) / 2, outsideWidth, floorThickness, frontZ - rearZ);
      builder.box(-outsideWidth / 2 + wallThickness / 2, wallBottom + wallHeight / 2, (rearZ + frontZ) / 2,
        wallThickness, wallHeight, frontZ - rearZ);
      builder.box(outsideWidth / 2 - wallThickness / 2, wallBottom + wallHeight / 2, (rearZ + frontZ) / 2,
        wallThickness, wallHeight, frontZ - rearZ);
      builder.box(0, wallBottom + wallHeight / 2, rearZ + wallThickness / 2,
        outsideWidth - 2 * wallThickness, wallHeight, wallThickness);

      // Front facade sections leave a true, centered door aperture.
      const sideWidth = (outsideWidth - frontDoorWidth) / 2;
      const frontY = wallBottom + wallHeight / 2;
      builder.box(-frontDoorWidth / 2 - sideWidth / 2, frontY, frontZ,
        sideWidth, wallHeight, wallThickness);
      builder.box(frontDoorWidth / 2 + sideWidth / 2, frontY, frontZ,
        sideWidth, wallHeight, wallThickness);
      builder.box(0, wallBottom + doorHeight + (wallTop - (wallBottom + doorHeight)) / 2, frontZ,
        frontDoorWidth, wallTop - (wallBottom + doorHeight), wallThickness);

      // An L-shaped partition divides a small rear room without blocking entry.
      builder.box(-0.12, wallBottom + 0.27, -0.2, wallThickness * 0.78, 0.54, 0.45);
      builder.box(0.06, wallBottom + 0.27, -0.39, 0.36, 0.54, wallThickness * 0.78);
      builder.box(0, floorY - floorThickness * 0.28, 0.31, 0.6, 0.035, 0.17); // entry stoop
      addPitchedRoof(builder, wallTop, rearZ, 0.49, outsideWidth + 0.04, 0.17);

      if (withOpenDoor) addOpenDoorLeaf(builder, frontDoorWidth, doorHeight, floorY + floorThickness, frontZ, wallThickness);
    } else {
      const floorThickness = 0.065;
      const groundY = 0.035;
      const firstFloorTop = 0.49;
      const secondFloorBottom = firstFloorTop + floorThickness;
      const roofEave = 0.91;
      const lowerWallHeight = firstFloorTop - (groundY + floorThickness);
      const upperWallHeight = roofEave - secondFloorBottom;
      const facadeZ = frontZ;

      builder.box(0, groundY, (rearZ + frontZ) / 2, outsideWidth, floorThickness, frontZ - rearZ);
      builder.box(0, firstFloorTop + floorThickness / 2, (rearZ + frontZ) / 2,
        outsideWidth, floorThickness, frontZ - rearZ);

      // Thick side and rear walls are split at the visible upper-storey floor.
      for (const [centerY, height] of [
        [groundY + floorThickness + lowerWallHeight / 2, lowerWallHeight],
        [secondFloorBottom + upperWallHeight / 2, upperWallHeight],
      ]) {
        builder.box(-outsideWidth / 2 + wallThickness / 2, centerY, (rearZ + frontZ) / 2,
          wallThickness, height, frontZ - rearZ);
        builder.box(outsideWidth / 2 - wallThickness / 2, centerY, (rearZ + frontZ) / 2,
          wallThickness, height, frontZ - rearZ);
        builder.box(0, centerY, rearZ + wallThickness / 2,
          outsideWidth - 2 * wallThickness, height, wallThickness);
      }

      // Ground-floor wall panels and lintel leave a walk-through front door.
      const groundBottom = groundY + floorThickness;
      const doorHeight = 0.31;
      const groundWallTop = firstFloorTop;
      const groundWallHeight = groundWallTop - groundBottom;
      const sideWidth = (outsideWidth - frontDoorWidth) / 2;
      builder.box(-frontDoorWidth / 2 - sideWidth / 2, groundBottom + groundWallHeight / 2, facadeZ,
        sideWidth, groundWallHeight, wallThickness);
      builder.box(frontDoorWidth / 2 + sideWidth / 2, groundBottom + groundWallHeight / 2, facadeZ,
        sideWidth, groundWallHeight, wallThickness);
      builder.box(0, groundBottom + doorHeight + (groundWallTop - groundBottom - doorHeight) / 2, facadeZ,
        frontDoorWidth, groundWallTop - groundBottom - doorHeight, wallThickness);

      // A broad upper opening acts like an exposed balcony, revealing the room.
      const upperOpeningWidth = 0.5;
      const upperOpeningBottom = secondFloorBottom + 0.075;
      const upperOpeningTop = roofEave - 0.065;
      const upperSideWidth = (outsideWidth - upperOpeningWidth) / 2;
      const upperFrontY = secondFloorBottom + upperWallHeight / 2;
      builder.box(-upperOpeningWidth / 2 - upperSideWidth / 2, upperFrontY, facadeZ,
        upperSideWidth, upperWallHeight, wallThickness);
      builder.box(upperOpeningWidth / 2 + upperSideWidth / 2, upperFrontY, facadeZ,
        upperSideWidth, upperWallHeight, wallThickness);
      builder.box(0, secondFloorBottom + (upperOpeningBottom - secondFloorBottom) / 2, facadeZ,
        upperOpeningWidth, upperOpeningBottom - secondFloorBottom, wallThickness);
      builder.box(0, upperOpeningTop + (roofEave - upperOpeningTop) / 2, facadeZ,
        upperOpeningWidth, roofEave - upperOpeningTop, wallThickness);

      // Two modest partitions give each floor a readable interior plan.
      builder.box(-0.12, groundBottom + lowerWallHeight * 0.47, -0.18, wallThickness * 0.78,
        lowerWallHeight * 0.88, 0.43);
      builder.box(0.08, groundBottom + lowerWallHeight * 0.47, -0.39, 0.4,
        lowerWallHeight * 0.88, wallThickness * 0.78);
      builder.box(0.15, secondFloorBottom + upperWallHeight * 0.47, -0.17, wallThickness * 0.78,
        upperWallHeight * 0.86, 0.42);
      builder.box(-0.08, secondFloorBottom + upperWallHeight * 0.47, -0.38, 0.4,
        upperWallHeight * 0.86, wallThickness * 0.78);

      // Simple interior stair treads connect the two visible levels.
      for (let step = 0; step < 6; step++) {
        builder.box(-0.31, groundBottom + 0.045 + step * 0.063, 0.11 - step * 0.075,
          0.2, 0.045, 0.13);
      }
      builder.box(0, groundY - floorThickness * 0.28, 0.31, 0.6, 0.035, 0.17);
      addPitchedRoof(builder, roofEave, rearZ, 0.49, outsideWidth + 0.04, 0.1);

      if (withOpenDoor) addOpenDoorLeaf(builder, frontDoorWidth, doorHeight, groundBottom, facadeZ, wallThickness);
    }

    return builder.finish();
  }

  function addOpenDoorLeaf(builder, width, height, floorY, facadeZ, wallThickness) {
    // Geometry is offset from its mesh origin so the origin acts as the hinge.
    const leaf = new THREE.BoxGeometry(width, height, 0.026);
    leaf.translate(width / 2, height / 2, 0);
    builder.add(leaf, -width / 2, floorY, facadeZ + wallThickness / 2, 1, 1, 1, 0, -Math.PI * 0.43, 0);
  }

  function makeVillageHouse() {
    return addHouseShell(2, false);
  }

  function makeSmallCity() {
    const builder = createBuilder();
    const blocks = [
      [-0.34, -0.32, 0.3, 0.28, 0.58], [0.04, -0.34, 0.31, 0.28, 0.77],
      [0.36, -0.28, 0.25, 0.29, 0.55], [-0.36, 0.02, 0.27, 0.29, 0.72],
      [0, 0.02, 0.35, 0.3, 0.96], [0.35, 0.06, 0.28, 0.3, 0.7],
      [-0.22, 0.37, 0.32, 0.25, 0.64], [0.19, 0.37, 0.33, 0.25, 0.79],
    ];
    for (const [x, z, width, depth, height] of blocks) {
      builder.box(x, height / 2, z, width, height, depth);
      builder.box(x, height + 0.025, z, width * 0.7, 0.05, depth * 0.7);
    }
    builder.box(0, 0.07, 0, 1.05, 0.14, 0.98);
    return builder.finish();
  }

  function makeLargeCity() {
    const builder = createBuilder();
    const blocks = [
      [-0.64, -0.58, 0.23, 0.25, 0.44], [-0.34, -0.58, 0.25, 0.25, 0.6],
      [-0.04, -0.58, 0.29, 0.25, 0.76], [0.29, -0.58, 0.28, 0.25, 0.54], [0.61, -0.56, 0.23, 0.28, 0.68],
      [-0.63, -0.27, 0.24, 0.27, 0.68], [-0.32, -0.27, 0.28, 0.27, 0.82],
      [0, -0.27, 0.3, 0.27, 0.95], [0.32, -0.27, 0.27, 0.27, 0.78], [0.63, -0.25, 0.24, 0.28, 0.57],
      [-0.63, 0.06, 0.24, 0.28, 0.54], [-0.32, 0.06, 0.28, 0.28, 0.76],
      [0, 0.06, 0.3, 0.28, 1.0], [0.32, 0.06, 0.27, 0.28, 0.89], [0.63, 0.06, 0.24, 0.28, 0.7],
      [-0.51, 0.39, 0.28, 0.25, 0.62], [-0.18, 0.39, 0.3, 0.25, 0.81],
      [0.17, 0.39, 0.29, 0.25, 0.69], [0.5, 0.39, 0.28, 0.25, 0.58],
    ];
    for (const [x, z, width, depth, height] of blocks) {
      builder.box(x, height / 2, z, width, height, depth);
      if (height > 0.72) builder.box(x, height + 0.035, z, width * 0.68, 0.07, depth * 0.7);
    }
    builder.box(0, 0.06, 0, 1.83, 0.12, 1.22);
    // Several taller central masses create a layered big-city skyline.
    builder.box(-0.09, 0.72, -0.03, 0.22, 1.2, 0.22);
    builder.box(0.36, 0.65, 0.11, 0.18, 1.05, 0.19);
    return builder.finish();
  }

  function makeSkyscraper() {
    const builder = createBuilder();
    builder.box(0, 0.06, 0, 0.72, 0.12, 0.72);
    builder.box(0, 0.48, 0, 0.47, 0.82, 0.47);
    builder.box(0, 0.9, 0, 0.36, 0.18, 0.36);
    builder.box(0, 1.015, 0, 0.12, 0.14, 0.12);
    return builder.finish();
  }

  function makeMegaPyramid() {
    const builder = createBuilder();
    const tiers = 7;
    const baseWidth = 1.55;
    const tierHeight = 0.15;
    for (let tier = 0; tier < tiers; tier++) {
      const width = baseWidth * (1 - tier / (tiers + 1));
      builder.box(0, tier * tierHeight + tierHeight / 2, 0, width, tierHeight, width);
    }
    const capHeight = 0.29;
    const capWidth = baseWidth * (1 - (tiers - 1) / (tiers + 1));
    builder.add(new THREE.ConeGeometry(0.72, 1, 4, 1), 0, tiers * tierHeight + capHeight / 2, 0,
      capWidth / 1.44, capHeight, capWidth / 1.44, 0, Math.PI / 4, 0);
    return builder.finish();
  }

  function makeWizardTower() {
    const builder = createBuilder();
    // Polygonal keep, buttresses, two balconies, and a steep pointed roof.
    builder.cylinder(0, 0.42, 0, 0.29, 0.24, 0.84, 10);
    builder.cylinder(0, 0.1, 0, 0.36, 0.31, 0.2, 10);
    builder.cylinder(0, 0.71, 0, 0.27, 0.3, 0.1, 10);
    builder.cylinder(0, 0.77, 0, 0.38, 0.38, 0.055, 10);
    builder.add(new THREE.ConeGeometry(0.34, 0.52, 8, 1), 0, 1.04, 0, 1, 1, 1);
    for (let side = 0; side < 8; side++) {
      const angle = side * Math.PI / 4;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      builder.box(x * 0.3, 0.36, z * 0.3, 0.1, 0.55, 0.1, -angle);
      if (side % 2 === 0) builder.box(x * 0.26, 0.56, z * 0.26, 0.08, 0.21, 0.08, -angle);
    }
    // Small outboard turret echoes the main spire without crowding the shape.
    builder.cylinder(-0.32, 0.55, -0.22, 0.09, 0.075, 0.72, 8);
    builder.add(new THREE.ConeGeometry(0.105, 0.24, 6, 1), -0.32, 1.03, -0.22);
    return builder.finish();
  }

  function makeFarm() {
    const builder = createBuilder();
    const barnWidth = 0.72;
    const barnDepth = 0.5;
    const barnHeight = 0.53;
    const wallTop = barnHeight;
    builder.box(-0.08, barnHeight / 2, -0.16, barnWidth, barnHeight, barnDepth);
    addPitchedRoof(builder, wallTop, -0.42, 0.5, barnWidth + 0.06, 0.2, -0.08);
    builder.box(-0.08, 0.22, 0.105, 0.28, 0.42, 0.035); // open-looking barn doors
    builder.box(-0.08, 0.51, -0.18, 0.16, 0.045, 0.54); // ridge vent
    builder.box(-0.64, 0.23, 0.15, 0.28, 0.46, 0.3); // farmhouse
    addPitchedRoof(builder, 0.46, 0.0, 0.3, 0.32, 0.13, -0.64);
    for (const x of [0.37, 0.66]) {
      builder.cylinder(x, 0.44, -0.23, 0.13, 0.13, 0.78, 10);
      builder.add(new THREE.ConeGeometry(0.15, 0.16, 10, 1), x, 0.91, -0.23);
    }
    return builder.finish();
  }

  const houseOneStory = addHouseShell(1, false);
  const houseOneStoryOpenDoor = addHouseShell(1, true);
  const houseTwoStory = addHouseShell(2, false);
  const houseTwoStoryOpenDoor = addHouseShell(2, true);

  return {
    houseOneStory,
    houseOneStoryOpenDoor,
    houseTwoStory,
    houseTwoStoryOpenDoor,
    megaPyramid: makeMegaPyramid(),
    wizardTower: makeWizardTower(),

    // World-generator placement types retained for direct app lookup.
    village: houseTwoStory,
    smallCity: makeSmallCity(),
    largeCity: makeLargeCity(),
    skyscraper: makeSkyscraper(),
    farm: makeFarm(),
  };
}
