const TAU = Math.PI * 2;

/**
 * Build the visible outer pressure hull and end-cap truss for the O'Neill
 * cylinder. `world.radius` is the habitable radius; `world.hullRadius` is the
 * outer shell radius (defaults to radius + 1,000 m). The cylinder axis is Z.
 *
 * The returned Group owns its geometry and materials. If it is removed during
 * a world reset, dispose the resources listed in `group.userData.resources`.
 * Interior airlock tunnels are intentionally not part of this kit.
 */
export function createExteriorStructures(THREE, world) {
  const hullRadius = Number(world.hullRadius) > 0
    ? Number(world.hullRadius)
    : Number(world.radius) + 1000;
  const halfLength = Math.max(100, Number(world.axialHalfLength) || 100);
  const fullLength = halfLength * 2;
  const angularSegments = THREE.MathUtils.clamp(Math.round((TAU * hullRadius) / 66), 96, 512);
  const ribCount = THREE.MathUtils.clamp(Math.round((TAU * hullRadius) / 400), 16, 96);
  const group = new THREE.Group();
  group.name = 'O’Neill outer pressure hull and end-cap structure';
  group.userData.hullRadius = hullRadius;
  group.userData.axialHalfLength = halfLength;

  const geometries = [];
  const materials = [];
  const ownGeometry = geometry => {
    geometries.push(geometry);
    return geometry;
  };
  const ownMaterial = material => {
    materials.push(material);
    return material;
  };
  const material = (color, metalness, roughness, extra = {}) => ownMaterial(
    new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      side: THREE.DoubleSide,
      ...extra,
    }),
  );

  const shellMaterial = material(0x40545f, 0.7, 0.54);
  const plateMaterial = material(0x536771, 0.76, 0.46);
  const darkFrameMaterial = material(0x253740, 0.82, 0.4);
  const brightBandMaterial = material(0x87979a, 0.78, 0.34);
  const supportMaterial = material(0x65777b, 0.83, 0.38);
  const collarMaterial = material(0x9aa8a5, 0.76, 0.32);
  const amberMaterial = material(0xe19a43, 0.48, 0.33, {
    emissive: 0x7e330b,
    emissiveIntensity: 0.85,
  });
  const coolMarkerMaterial = material(0x83c8d5, 0.42, 0.28, {
    emissive: 0x174f66,
    emissiveIntensity: 1.15,
  });

  const hullGroup = new THREE.Group();
  hullGroup.name = 'outer pressure shell';
  group.add(hullGroup);
  const shellGeometry = ownGeometry(new THREE.CylinderGeometry(
    hullRadius,
    hullRadius,
    fullLength,
    angularSegments,
    1,
    true,
  ));
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  shell.rotation.x = Math.PI / 2;
  shell.name = 'continuous outer pressure shell';
  hullGroup.add(shell);

  const frames = new THREE.Group();
  frames.name = 'external structural frames';
  hullGroup.add(frames);

  // Circumferential rings are deliberately separated by hundreds of meters;
  // the double-width band and fine raised line make them legible at scale.
  const bandSpacing = 620;
  const bandCount = Math.max(2, Math.floor((fullLength - 380) / bandSpacing));
  const bandGeometry = ownGeometry(new THREE.TorusGeometry(hullRadius + 7, 11, 8, angularSegments));
  const bandInstances = new THREE.InstancedMesh(bandGeometry, brightBandMaterial, bandCount);
  bandInstances.name = 'widely spaced circumferential pressure bands';
  bandInstances.castShadow = false;
  bandInstances.receiveShadow = false;
  const bandFineGeometry = ownGeometry(new THREE.TorusGeometry(hullRadius + 18, 2.5, 6, angularSegments));
  const bandFineInstances = new THREE.InstancedMesh(bandFineGeometry, darkFrameMaterial, bandCount);
  bandFineInstances.name = 'raised band seam lines';
  const bandDummy = new THREE.Object3D();
  for (let index = 0; index < bandCount; index++) {
    const z = -halfLength + 190 + index * (fullLength - 380) / Math.max(1, bandCount - 1);
    bandDummy.position.set(0, 0, z);
    bandDummy.rotation.set(0, 0, 0);
    bandDummy.scale.set(1, 1, 1);
    bandDummy.updateMatrix();
    bandInstances.setMatrixAt(index, bandDummy.matrix);
    bandFineInstances.setMatrixAt(index, bandDummy.matrix);
  }
  bandInstances.instanceMatrix.needsUpdate = true;
  bandFineInstances.instanceMatrix.needsUpdate = true;
  frames.add(bandInstances, bandFineInstances);

  // Axial rails keep roughly the same physical spacing as the hull grows.
  const ribGeometry = ownGeometry(new THREE.BoxGeometry(15, 19, fullLength));
  const ribs = new THREE.InstancedMesh(ribGeometry, darkFrameMaterial, ribCount);
  ribs.name = 'long axial hull ribs';
  const basis = new THREE.Matrix4();
  const radial = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, 1);
  const basisPosition = new THREE.Vector3();
  const basisQuaternion = new THREE.Quaternion();
  for (let index = 0; index < ribCount; index++) {
    const angle = index / ribCount * TAU;
    radial.set(Math.cos(angle), Math.sin(angle), 0);
    tangent.set(-Math.sin(angle), Math.cos(angle), 0);
    basis.makeBasis(radial, tangent, axis);
    basisPosition.copy(radial).multiplyScalar(hullRadius + 7).setZ(0);
    basisQuaternion.setFromRotationMatrix(basis);
    bandDummy.position.copy(basisPosition);
    bandDummy.quaternion.copy(basisQuaternion);
    bandDummy.scale.set(1, 1, 1);
    bandDummy.updateMatrix();
    ribs.setMatrixAt(index, bandDummy.matrix);
  }
  ribs.instanceMatrix.needsUpdate = true;
  frames.add(ribs);

  const endcaps = new THREE.Group();
  endcaps.name = 'layered annular end caps';
  group.add(endcaps);

  const outerRim = new THREE.InstancedMesh(
    ownGeometry(new THREE.TorusGeometry(hullRadius - 24, 25, 10, angularSegments)),
    brightBandMaterial,
    2,
  );
  outerRim.name = 'reinforced end-cap perimeter rings';
  const outerRimDummy = new THREE.Object3D();
  for (let index = 0; index < 2; index++) {
    const sign = index === 0 ? -1 : 1;
    outerRimDummy.position.set(0, 0, sign * (halfLength + 48));
    outerRimDummy.updateMatrix();
    outerRim.setMatrixAt(index, outerRimDummy.matrix);
  }
  outerRim.instanceMatrix.needsUpdate = true;
  endcaps.add(outerRim);

  const capLayerSpecs = [
    { inner: hullRadius * 0.72, outer: hullRadius - 58, mat: plateMaterial, offset: 20 },
    { inner: hullRadius * 0.36, outer: hullRadius * 0.68, mat: darkFrameMaterial, offset: 24 },
    { inner: 136, outer: hullRadius * 0.31, mat: plateMaterial, offset: 28 },
    { inner: 106, outer: 128, mat: supportMaterial, offset: 32 },
  ];
  for (const [layerIndex, layer] of capLayerSpecs.entries()) {
    const diskGeometry = ownGeometry(new THREE.RingGeometry(layer.inner, layer.outer, angularSegments));
    const disks = new THREE.InstancedMesh(diskGeometry, layer.mat, 2);
    disks.name = `annular end-cap layer ${layerIndex + 1}`;
    for (let index = 0; index < 2; index++) {
      const sign = index === 0 ? -1 : 1;
      bandDummy.position.set(0, 0, sign * (halfLength + layer.offset));
      bandDummy.rotation.set(0, 0, 0);
      bandDummy.scale.set(1, 1, 1);
      bandDummy.updateMatrix();
      disks.setMatrixAt(index, bandDummy.matrix);
    }
    disks.instanceMatrix.needsUpdate = true;
    endcaps.add(disks);
  }

  // Radial end-cap beams stop short of the open center so the already-built
  // airlock tunnel and its docking port remain unobstructed.
  const spokeStart = 142;
  const spokeEnd = hullRadius - 75;
  const spokeLength = Math.max(100, spokeEnd - spokeStart);
  const spokeCountPerEnd = 24;
  const spokeGeometry = ownGeometry(new THREE.BoxGeometry(spokeLength, 15, 24));
  const spokes = new THREE.InstancedMesh(spokeGeometry, supportMaterial, spokeCountPerEnd * 2);
  spokes.name = 'radial end-cap truss spokes';
  for (let endIndex = 0; endIndex < 2; endIndex++) {
    const sign = endIndex === 0 ? -1 : 1;
    for (let index = 0; index < spokeCountPerEnd; index++) {
      const angle = index / spokeCountPerEnd * TAU;
      const instance = endIndex * spokeCountPerEnd + index;
      bandDummy.position.set(
        Math.cos(angle) * (spokeStart + spokeLength / 2),
        Math.sin(angle) * (spokeStart + spokeLength / 2),
        sign * (halfLength + 56),
      );
      bandDummy.rotation.set(0, 0, angle);
      bandDummy.scale.set(1, 1, 1);
      bandDummy.updateMatrix();
      spokes.setMatrixAt(instance, bandDummy.matrix);
    }
  }
  spokes.instanceMatrix.needsUpdate = true;
  endcaps.add(spokes);

  const capBraceGeometry = ownGeometry(new THREE.TorusGeometry(hullRadius * 0.7, 8, 6, angularSegments));
  const capBraces = new THREE.InstancedMesh(capBraceGeometry, darkFrameMaterial, 2);
  capBraces.name = 'mid-radius end-cap truss braces';
  for (let index = 0; index < 2; index++) {
    const sign = index === 0 ? -1 : 1;
    bandDummy.position.set(0, 0, sign * (halfLength + 36));
    bandDummy.updateMatrix();
    capBraces.setMatrixAt(index, bandDummy.matrix);
  }
  capBraces.instanceMatrix.needsUpdate = true;
  endcaps.add(capBraces);

  const collar = new THREE.Group();
  collar.name = 'central axial airlock collars';
  endcaps.add(collar);
  const collarRadii = [52, 78];
  // Each radius gets one ring on each cap. Separate shared geometries keep the
  // collars open while avoiding a solid plug over the axial airlock.
  const collarRings = [];
  for (const radius of collarRadii) {
    const geometry = ownGeometry(new THREE.TorusGeometry(radius, radius === 52 ? 8 : 4, 8, 96));
    const instances = new THREE.InstancedMesh(geometry, collarMaterial, 2);
    instances.name = `open docking collar ${radius}m ring`;
    for (let index = 0; index < 2; index++) {
      const sign = index === 0 ? -1 : 1;
      bandDummy.position.set(0, 0, sign * (halfLength + 13 + (radius === 52 ? 0 : 5)));
      bandDummy.updateMatrix();
      instances.setMatrixAt(index, bandDummy.matrix);
    }
    instances.instanceMatrix.needsUpdate = true;
    collarRings.push(instances);
  }
  collar.add(...collarRings);

  const collarRailCount = 8;
  const collarRailGeometry = ownGeometry(new THREE.BoxGeometry(22, 7, 84));
  const collarRails = new THREE.InstancedMesh(collarRailGeometry, darkFrameMaterial, collarRailCount * 2);
  collarRails.name = 'airlock collar radial lugs';
  for (let endIndex = 0; endIndex < 2; endIndex++) {
    const sign = endIndex === 0 ? -1 : 1;
    for (let index = 0; index < collarRailCount; index++) {
      const angle = index / collarRailCount * TAU;
      const instance = endIndex * collarRailCount + index;
      bandDummy.position.set(Math.cos(angle) * 89, Math.sin(angle) * 89, sign * (halfLength + 12));
      bandDummy.rotation.set(0, 0, angle);
      bandDummy.updateMatrix();
      collarRails.setMatrixAt(instance, bandDummy.matrix);
    }
  }
  collarRails.instanceMatrix.needsUpdate = true;
  collar.add(collarRails);

  // Infrequent markers identify the external service frame without turning the
  // habitat into a ring of tiny lights that would be costly at a distance.
  const markerStations = 20;
  const markerCountPerColor = markerStations * 2;
  const markerGeometry = ownGeometry(new THREE.BoxGeometry(10, 24, 12));
  const amberMarkers = new THREE.InstancedMesh(markerGeometry, amberMaterial, markerCountPerColor);
  const coolMarkers = new THREE.InstancedMesh(markerGeometry, coolMarkerMaterial, markerCountPerColor);
  amberMarkers.name = 'sparse amber hull navigation markers';
  coolMarkers.name = 'sparse cyan hull navigation markers';
  for (let station = 0; station < markerStations; station++) {
    const z = -halfLength + (station + 0.5) * fullLength / markerStations;
    for (let side = 0; side < 2; side++) {
      const amberAngle = side === 0 ? 0 : Math.PI;
      const coolAngle = side === 0 ? Math.PI / 2 : Math.PI * 1.5;
      for (const [mesh, angle, markerIndex] of [
        [amberMarkers, amberAngle, station * 2 + side],
        [coolMarkers, coolAngle, station * 2 + side],
      ]) {
        radial.set(Math.cos(angle), Math.sin(angle), 0);
        tangent.set(-Math.sin(angle), Math.cos(angle), 0);
        basis.makeBasis(radial, tangent, axis);
        basisQuaternion.setFromRotationMatrix(basis);
        bandDummy.position.copy(radial).multiplyScalar(hullRadius + 20).setZ(z);
        bandDummy.quaternion.copy(basisQuaternion);
        bandDummy.scale.set(1, 1, 1);
        bandDummy.updateMatrix();
        mesh.setMatrixAt(markerIndex, bandDummy.matrix);
      }
    }
  }
  amberMarkers.instanceMatrix.needsUpdate = true;
  coolMarkers.instanceMatrix.needsUpdate = true;
  frames.add(amberMarkers, coolMarkers);

  group.userData.resources = { geometries, materials };
  return group;
}
