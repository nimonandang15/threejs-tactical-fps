// Kestrel Foundry: a 44 x 34 m industrial yard with two bomb sites, three lanes and cover
// that rewards stopping to aim. Every box is a collider and a surface a bullet stops on.
// Coordinates: x east, z south. Vanguard spawns south (z +13), Sentinel north (z -13).
// Site A "Furnace" sits west, Site B "Crane" east, mid runs straight up the middle.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { id: 'A', name: 'Furnace', x: -15, z: -8, color: PALETTE.glowA },
  B: { id: 'B', name: 'Crane', x: 15, z: -8, color: PALETTE.glowB },
};

export const WAYPOINTS = {
  vanSpawn: { x: 0, z: 13.5 },
  vanWest: { x: -12, z: 8 },
  vanEast: { x: 12, z: 8 },
  vanMid: { x: 0, z: 8 },
  midSouth: { x: 0, z: 3 },
  midNorth: { x: 0, z: -3 },
  midWest: { x: -8, z: 0 },
  midEast: { x: 8, z: 0 },
  siteA: { x: -15, z: -8 },
  siteAIn: { x: -11, z: -6 },
  siteB: { x: 15, z: -8 },
  siteBIn: { x: 11, z: -6 },
  senSpawn: { x: 0, z: -13.5 },
  senA: { x: -12, z: -11 },
  senB: { x: 12, z: -11 },
  senMid: { x: 0, z: -10 },
  connectorW: { x: -14, z: 2 },
  connectorE: { x: 14, z: 2 },
};

// Routes a bot walks, as waypoint ids. Each bot is assigned one at round start.
export const ROUTES = {
  pushA: ['vanWest', 'connectorW', 'siteAIn', 'siteA'],
  pushB: ['vanEast', 'connectorE', 'siteBIn', 'siteB'],
  pushMid: ['vanMid', 'midSouth', 'midNorth'],
  holdA: ['senA', 'siteAIn'],
  holdB: ['senB', 'siteBIn'],
  holdMid: ['senMid', 'midNorth'],
  rotateA: ['midNorth', 'midWest', 'siteAIn', 'siteA'],
  rotateB: ['midNorth', 'midEast', 'siteBIn', 'siteB'],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'foe' || name === 'ink' ? 0.5 : 0.92,
      metalness: 0.04,
    });
  }
  const glowA = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.glowA) });
  const glowB = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.glowB) });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(radius, height, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter: 44 x 34 m, 5 m walls, open sky.
  box(44.4, 0.4, 34.4, 0, -0.2, 0, 'floor');
  box(0.4, 5, 34.4, -22.2, 2.5, 0, 'wall');
  box(0.4, 5, 34.4, 22.2, 2.5, 0, 'wall');
  box(44.4, 5, 0.4, 0, 2.5, -17.2, 'wall');
  box(44.4, 5, 0.4, 0, 2.5, 17.2, 'wall');

  // Mid silo: the central sightline blocker.
  cylinder(2.2, 5.4, 0, 2.7, 0, 'rust');

  // West lane (to A): crates and a container wall.
  box(3.2, 1.1, 1.2, -12, 0.55, 4, 'crate');
  box(1.2, 1.1, 3.4, -16, 0.55, -1, 'crate');
  box(6.0, 2.6, 2.2, -18.5, 1.3, -4.5, 'rust');
  box(2.2, 2.6, 1.2, -8.5, 1.3, -6.5, 'crate');
  box(1.6, 0.8, 1.6, -12, 0.4, -9.5, 'crate');
  // East lane (to B): mirror with a different rhythm.
  box(1.2, 1.1, 3.4, 16, 0.55, 3, 'crate');
  box(3.2, 1.1, 1.2, 12, 0.55, -2, 'crate');
  box(2.2, 2.6, 6.0, 18.5, 1.3, -5.5, 'rust');
  box(1.6, 0.8, 1.6, 12, 0.4, -9.5, 'crate');
  // Mid cover: low blocks to crouch behind on the way up.
  box(2.6, 1.1, 1.2, -4.5, 0.55, 5.5, 'crate');
  box(2.6, 1.1, 1.2, 4.5, 0.55, 5.5, 'crate');
  box(1.2, 1.1, 2.6, -5.5, 0.55, -4.5, 'crate');
  box(1.2, 1.1, 2.6, 5.5, 0.55, -4.5, 'crate');
  // Spawn cover, both ends.
  box(2.4, 1.1, 1.2, -6, 0.55, 12.5, 'crate');
  box(2.4, 1.1, 1.2, 6, 0.55, 12.5, 'crate');
  box(2.4, 1.1, 1.2, -6, 0.55, -12.5, 'crate');
  box(2.4, 1.1, 1.2, 6, 0.55, -12.5, 'crate');
  // Site A furnace block and site B crane base: tall cover inside each site.
  box(3.4, 3.2, 1.6, -18.5, 1.6, -11.5, 'rust');
  box(1.4, 1.0, 1.4, -12.5, 0.5, -11, 'crate');
  box(3.4, 3.2, 1.6, 18.5, 1.6, -11.5, 'rust');
  box(1.4, 1.0, 1.4, 12.5, 0.5, -11, 'crate');
  // Connector walls that split mid from the lanes (with gaps to slip through).
  box(0.5, 3.4, 6.0, -8, 1.7, 3, 'wall');
  box(0.5, 3.4, 6.0, 8, 1.7, 3, 'wall');

  // Site pads: glowing rings on the floor where the charge goes.
  function sitePad(site) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 2.1, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(site.x, 0.02, site.z);
    group.add(disc);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 2.2, 0.5),
      site.id === 'A' ? glowA : glowB,
    );
    post.position.set(site.x + 2.6, 1.1, site.z - 2.6);
    group.add(post);
  }
  sitePad(SITES.A);
  sitePad(SITES.B);

  // Light: late-afternoon sun over the yard, cool sky fill, warm bounce.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8fa3b8'), new THREE.Color(PALETTE.canvas), 1.15);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.7);
  key.position.set(14, 20, 10);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.foe), 0.4);
  fill.position.set(-12, 10, -14);
  scene.add(fill);

  return {
    colliders,
    shootables,
    group,
    sites: SITES,
    waypoints: WAYPOINTS,
    routes: ROUTES,
    vanSpawn: new THREE.Vector3(0, 0, 13.5),
    senSpawn: new THREE.Vector3(0, 0, -13.5),
  };
}
