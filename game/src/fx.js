// Battle effects, all pooled and reused: nothing is allocated per frame in the hot loops.
// Tracers are stretched boxes, sparks are a single Points cloud, explosions are a flash
// sphere plus a point light that fades out.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 240;

export function createFx(scene) {
  const tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55 });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.95, depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkNext = 0;

  const boomMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffb347'), transparent: true, opacity: 0, depthWrite: false,
  });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color('#ff9a2e'), 0, 16);
  scene.add(boomLight);
  let boomLife = 0;

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  function tracer(from, to) {
    const slot = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % MAX_TRACERS;
    tmp.copy(to).sub(from);
    const length = tmp.length();
    if (length < 0.1) return;
    slot.mesh.position.copy(from).addScaledVector(tmp, 0.5);
    slot.mesh.lookAt(to);
    slot.mesh.scale.set(1, 1, length);
    slot.mesh.visible = true;
    slot.life = 0.09;
  }

  function burst(point, count, spread, up) {
    for (let i = 0; i < count; i += 1) {
      const slot = sparkNext;
      sparkNext = (sparkNext + 1) % MAX_SPARKS;
      sparkPos[slot * 3] = point.x;
      sparkPos[slot * 3 + 1] = point.y;
      sparkPos[slot * 3 + 2] = point.z;
      sparkVel[slot * 3] = (Math.random() * 2 - 1) * spread;
      sparkVel[slot * 3 + 1] = Math.random() * up;
      sparkVel[slot * 3 + 2] = (Math.random() * 2 - 1) * spread;
      sparkLife[slot] = 0.35 + Math.random() * 0.3;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function explosion(point) {
    boom.position.copy(point);
    boom.scale.setScalar(0.5);
    boom.visible = true;
    boomLife = 0.55;
    boomLight.position.copy(point).add(tmp2.set(0, 1, 0));
    boomLight.intensity = 60;
    burst(point, 60, 4.5, 5);
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    let anyAlive = false;
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      if (sparkLife[i] <= 0) continue;
      anyAlive = true;
      sparkLife[i] -= dt;
      sparkVel[i * 3 + 1] -= 9 * dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      if (sparkPos[i * 3 + 1] < 0.02) {
        sparkPos[i * 3 + 1] = 0.02;
        sparkVel[i * 3 + 1] *= -0.4;
      }
    }
    if (anyAlive) sparkGeo.attributes.position.needsUpdate = true;
    if (boomLife > 0) {
      boomLife -= dt;
      const t = Math.max(0, boomLife / 0.55);
      boom.scale.setScalar(0.5 + (1 - t) * 4.5);
      boomMat.opacity = t * 0.85;
      boomLight.intensity = t * 60;
      if (boomLife <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
  }

  return { tracer, burst, explosion, step };
}
