// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=menu|combat|site|win with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS, GEAR } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const fx = createFx(scene);
const hud = createHud();
const player = createPlayer(world.colliders, world.vanSpawn);
const body = player.state;
body.kind = 'player';
body.speed = 0;
const rig = createWeaponRig(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

let score = { van: 0, sen: 0 };
let started = false;
let frozen = false;
let staging = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let channel = null; // { kind: 'plant'|'defuse', site, progress }
let throwCooldown = 0;
const grenades = [];
const buyItems = [];

function shootables() {
  return world.shootables.concat(bots.hitMeshes);
}

function applyDamage(victim, amount, isHead, attacker) {
  if (victim.kind === 'player') {
    if (!body.alive || staging) return;
    let remaining = amount;
    if (body.armor > 0) {
      const absorbed = Math.min(body.armor, remaining * 0.5);
      body.armor -= absorbed;
      remaining -= absorbed;
    }
    body.health -= remaining;
    hud.damageFlash();
    hud.setHealth(body.health, body.armor);
    audio.hurt();
    channel = null;
    if (body.health <= 0) {
      body.health = 0;
      body.alive = false;
      input.releaseLock();
      hud.setObjective('You are down — Vanguard fights on.');
    }
    return;
  }
  const died = bots.damage(victim, amount);
  if (died) {
    const killerName = attacker.kind === 'player' ? 'You' : attacker.name;
    hud.killfeed(killerName, attacker.team, victim.name, victim.team, isHead);
    if (attacker.kind === 'player') {
      rounds.awardKill();
      audio.kill();
    }
  }
}

function tracerTo(from, to) {
  fx.tracer(from.clone(), to.clone());
}

const bots = createBots(scene, world, {
  damage: applyDamage,
  tracer: (from, to) => {
    if (staging) return;
    fx.tracer(from.clone(), to.clone());
    if (body.alive && from.distanceTo(body.position) < 26) audio.shot('rifle');
  },
  sound: () => {},
}, random);

const rounds = createRounds({
  bots, world, player, hud, audio,
  hooks: {
    equipWeapon(id) {
      rig.equip(id);
      hud.setWeapon(WEAPONS[id].name);
      hud.setAmmo(rig.state.mag, rig.state.reserve);
    },
    refillAmmo() { rig.refill(); hud.setAmmo(rig.state.mag, rig.state.reserve); },
    onBuyPhase(round) {
      hud.hideOverlay();
      hud.setObjective('Buy phase — press B to spend your money before the round starts.');
      refreshBuyItems();
    },
    onLivePhase() { hud.hideBuy(); hud.setObjective('Plant the charge at Site A or Site B — or eliminate Sentinel.'); },
    onRoundEnd(winner, reason, scoreNow) {
      score = scoreNow;
      input.releaseLock();
      hud.setScore(scoreNow.van, scoreNow.sen);
      hud.showOverlay('roundEnd', {
        title: winner === 'van' ? 'Round to Vanguard' : 'Round to Sentinel',
        copy: reason + '. Vanguard ' + scoreNow.van + ' — ' + scoreNow.sen + ' Sentinel.',
      });
    },
    onMatchEnd(winner, scoreNow) {
      input.releaseLock();
      hud.showOverlay('matchEnd', {
        title: winner === 'van' ? 'Vanguard takes the match' : 'Sentinel takes the match',
        copy: 'Final: Vanguard ' + scoreNow.van + ' — ' + scoreNow.sen + ' Sentinel. The foundry is yours to play again.',
      });
    },
    onPlant(site) { hud.setObjective('Charge planted at Site ' + site + ' — defend it until it blows.'); },
    onDetonate(site) { fx.explosion(new THREE.Vector3(world.sites[site].x, 1, world.sites[site].z)); audio.explosion(); },
    onDefuse(site) { hud.setObjective('Charge defused at Site ' + site + '.'); },
  },
});

function refreshBuyItems() {
  buyItems.length = 0;
  const inv = rounds.state.inventory;
  const money = rounds.state.money;
  for (const def of Object.values(WEAPONS)) {
    buyItems.push({
      id: def.id, name: def.name, price: def.price, owned: inv.owned.has(def.id),
      affordable: money >= def.price,
      desc: def.damage + ' dmg · ' + (def.headMult) + 'x head · ' + def.mag + ' rounds',
    });
  }
  buyItems.push({ id: 'armor', name: GEAR.armor.name, price: GEAR.armor.price, owned: inv.armor > 0, affordable: money >= GEAR.armor.price, desc: 'Absorbs half of incoming damage' });
  buyItems.push({ id: 'frag', name: GEAR.frag.name, price: GEAR.frag.price, owned: false, affordable: money >= GEAR.frag.price, desc: 'Throw with G — area damage' });
  buyItems.push({ id: 'flash', name: GEAR.flash.name, price: GEAR.flash.price, owned: false, affordable: money >= GEAR.flash.price, desc: 'Throw with F — blinds what faces it' });
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function muzzlePosition() {
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.y -= 0.12;
  muzzle.x += Math.cos(body.yaw) * 0.2;
  return muzzle;
}

function shoot(spread) {
  if (!rig.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables(), false)[0];
  const from = muzzlePosition().clone();
  if (hit) {
    tracerTo(from, hit.point);
    const target = hit.object.userData.bot;
    if (target && target.alive) {
      const isHead = hit.object.userData.part === 'head';
      const def = rig.state.def;
      applyDamage(target, def.damage * (isHead ? def.headMult : 1), isHead, { kind: 'player', team: 'van' });
      hud.hitMarker(!target.alive);
      audio.hit();
    } else {
      fx.burst(hit.point, 6, 1.6, 2);
    }
  } else {
    tmpVec.copy(camera.position).addScaledVector(direction, 60);
    tracerTo(from, tmpVec);
  }
  rig.pullTrigger();
  audio.shot(rig.state.def.kind);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(rig.state.mag, rig.state.reserve);
  return true;
}

function throwGrenade(kind) {
  const inv = rounds.state.inventory;
  if (kind === 'frag' && inv.frag <= 0) return;
  if (kind === 'flash' && inv.flash <= 0) return;
  if (throwCooldown > 0) return;
  throwCooldown = 0.8;
  if (kind === 'frag') inv.frag -= 1; else inv.flash -= 1;
  hud.setGear(inv.frag, inv.flash);
  camera.getWorldDirection(direction);
  const velocity = direction.clone().multiplyScalar(14);
  velocity.y += 4.5;
  grenades.push({
    kind,
    position: camera.position.clone(),
    velocity,
    timer: kind === 'frag' ? 1.6 : 1.1,
  });
}

function detonateGrenade(g) {
  if (g.kind === 'frag') {
    fx.explosion(g.position);
    audio.explosion();
    const victims = bots.list.concat(body.alive ? [body] : []);
    for (const victim of victims) {
      const distance = victim.position.distanceTo(g.position);
      if (distance < 7) {
        const amount = 95 * (1 - distance / 7);
        applyDamage(victim, amount, false, { kind: 'player', team: 'van' });
      }
    }
  } else {
    audio.flashbang();
    camera.getWorldDirection(direction);
    for (const bot of bots.list) {
      if (!bot.alive) continue;
      const distance = bot.position.distanceTo(g.position);
      if (distance > 24) continue;
      tmpVec.copy(g.position).sub(bot.position).normalize();
      const facing = Math.sin(bot.yaw) * -tmpVec.x + Math.cos(bot.yaw) * -tmpVec.z;
      if (facing > -0.2) bot.flashUntil = elapsed + 2.5;
    }
    const distance = camera.position.distanceTo(g.position);
    if (distance < 26) {
      tmpVec.copy(g.position).sub(camera.position).normalize();
      const facing = direction.dot(tmpVec);
      if (facing > 0.1) hud.flashBang(Math.min(1, facing * (1 - distance / 30) + 0.35));
    }
  }
}

function stepGrenades(dt) {
  throwCooldown = Math.max(0, throwCooldown - dt);
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.timer -= dt;
    g.velocity.y -= 16 * dt;
    g.position.addScaledVector(g.velocity, dt);
    if (g.position.y < 0.06) {
      g.position.y = 0.06;
      g.velocity.y *= -0.45;
      g.velocity.x *= 0.7;
      g.velocity.z *= 0.7;
    }
    if (g.timer <= 0) {
      detonateGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function stepPlant(dt) {
  const phase = rounds.state.phase;
  if (phase !== 'live' || !body.alive) { channel = null; return; }
  const keys = input.state.keys;
  const moving = keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD');
  if (!keys.has('KeyE') || moving) { channel = null; return; }
  if (!rounds.state.plant) {
    const site = rounds.playerAtSite();
    if (!site) { channel = null; return; }
    if (!channel || channel.kind !== 'plant' || channel.site !== site) channel = { kind: 'plant', site, progress: 0 };
    channel.progress += dt;
    hud.setProgress('Planting charge at Site ' + site, channel.progress / rounds.plantSeconds);
    if (channel.progress >= rounds.plantSeconds) {
      channel = null;
      rounds.plantCharge(site);
    }
  } else {
    const site = rounds.state.plant.site;
    const sitePos = world.sites[site];
    if (Math.hypot(body.position.x - sitePos.x, body.position.z - sitePos.z) > 2.6) { channel = null; return; }
    if (!channel || channel.kind !== 'defuse') channel = { kind: 'defuse', site, progress: 0 };
    channel.progress += dt;
    hud.setProgress('Defusing charge at Site ' + site, channel.progress / rounds.defuseSeconds);
    if (channel.progress >= rounds.defuseSeconds) {
      channel = null;
      rounds.completeDefuse();
    }
  }
}

function switchWeapon(slot) {
  const owned = [...rounds.state.inventory.owned];
  const id = owned[slot];
  if (!id || rig.state.def.id === id) return;
  rig.equip(id);
  hud.setWeapon(WEAPONS[id].name);
  hud.setAmmo(rig.state.mag, rig.state.reserve);
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  if (phase === 'live' || phase === 'buy') {
    player.step(dt, input.state.keys);
  }
  body.speed = player.groundSpeed();
  rig.step(dt);
  if (phase === 'live') {
    bots.step(dt, elapsed, body, camera);
    stepGrenades(dt);
    stepPlant(dt);
  }
  fx.step(dt);
  rounds.step(dt, elapsed);
  hud.setHealth(body.health, body.armor);
  hud.setPips((body.alive ? 1 : 0) + bots.aliveCount('van'), bots.aliveCount('sen'));
  hud.setCrosshairSpread(rig.spread(body.speed) * 900);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (body.alive && (rounds.state.phase === 'live' || rounds.state.phase === 'buy')) player.look(look.x, look.y);
    if (input.consume('KeyR')) rig.reload();
    if (input.consume('Digit1')) switchWeapon(0);
    if (input.consume('Digit2')) switchWeapon(1);
    if (input.consume('Digit3')) switchWeapon(2);
    if (input.consume('Digit4')) switchWeapon(3);
    if (input.consume('KeyG')) throwGrenade('frag');
    if (input.consume('KeyF')) throwGrenade('flash');
    if (input.consume('KeyB') && rounds.state.phase === 'buy') {
      if (hud.buyVisible()) {
        hud.hideBuy();
        input.requestLock();
      } else {
        refreshBuyItems();
        hud.showBuy(buyItems, (id) => {
          if (rounds.buy(id)) {
            refreshBuyItems();
            hud.showBuy(buyItems, (next) => { if (rounds.buy(next)) { refreshBuyItems(); hud.showBuy(buyItems, () => {}); } });
          }
        });
        input.releaseLock();
      }
    }
    if (input.state.firing && body.alive && rounds.state.phase === 'live' && rig.ready()) {
      shoot(rig.spread(body.speed));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  const phase = rounds.state.phase;
  if (phase === 'menu') {
    rounds.startMatch();
    hud.hideOverlay();
    input.requestLock();
  } else if (phase === 'matchEnd') {
    rounds.startMatch();
    hud.hideOverlay();
    input.requestLock();
  } else {
    hud.hideOverlay();
    input.requestLock();
  }
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (rounds.state.phase === 'live' && body.alive && !hud.buyVisible()) {
    hud.showOverlay('paused', { round: rounds.state.round });
  }
}

function runShot(name) {
  staging = true;
  hud.hideOverlay();
  hud.hideBuy();
  rounds.startMatch();
  rounds.state.phase = 'live';
  rounds.state.timer = 80;
  const sen = bots.list.filter((b) => b.team === 'sen');
  const van = bots.list.filter((b) => b.team === 'van');
  if (name === 'menu') {
    rounds.state.phase = 'buy';
    rounds.state.timer = 12;
    body.position.set(0, 0, 13.5);
    body.yaw = 0;
    body.pitch = 0.02;
    settle(10);
    hud.setTimer(12, true);
    hud.setObjective('Buy phase — press B to spend your money before the round starts.');
    hud.showOverlay('start', 0);
  } else if (name === 'combat') {
    body.position.set(0, 0, 7);
    // West lane: clear line of sight past the mid silo.
    sen[0].position.set(-8, 0, -4);
    sen[0].yaw = Math.PI * 0.75;
    sen[0].state = 'hold';
    sen[0].holdUntil = 9999;
    sen[1].position.set(-12, 0, -8);
    sen[1].yaw = Math.PI * 0.5;
    sen[1].state = 'hold';
    sen[1].holdUntil = 9999;
    van[0].position.set(-3, 0, 5);
    van[0].yaw = 0.2;
    van[0].state = 'hold';
    van[0].holdUntil = 9999;
    rig.equip('ar77');
    hud.setWeapon('AR-77 Rifle');
    hud.setObjective('Plant the charge at Site A or Site B — or eliminate Sentinel.');
    settle(10);
    aimAt(new THREE.Vector3(-8, 1.35, -4));
    shoot(0);
    settle(4);
    shoot(0);
    settle(4);
    aimAt(new THREE.Vector3(-8, 1.35, -4));
    shoot(0);
    settle(4);
    aimAt(new THREE.Vector3(-8, 1.35, -4));
    shoot(0);
    settle(6);
  } else if (name === 'site') {
    rounds.plantCharge('A');
    rig.equip('ar77');
    hud.setWeapon('AR-77 Rifle');
    body.position.set(-10.5, 0, -4.5);
    sen[0].position.set(-13, 0, -10.5);
    sen[0].yaw = Math.PI * 0.75;
    sen[0].state = 'hold';
    sen[0].holdUntil = 9999;
    sen[1].position.set(-17.5, 0, -5);
    sen[1].yaw = Math.PI * 0.25;
    sen[1].state = 'hold';
    sen[1].holdUntil = 9999;
    settle(10);
    aimAt(new THREE.Vector3(-15, 1.2, -8));
    hud.setObjective('Charge planted at Site A — defend it until it blows.');
  } else if (name === 'win') {
    rounds.state.score = { van: 2, sen: 1 };
    rounds.state.phase = 'menu';
    rounds.state.timer = 0;
    hud.setScore(2, 1);
    hud.setTimer(0, false);
    hud.setObjective('');
    body.position.set(0, 0, 10);
    body.yaw = 0;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.5, -8));
    hud.showOverlay('roundEnd', {
      title: 'Round to Vanguard',
      copy: 'Sentinel wiped out. Vanguard 2 — 1 Sentinel.',
    });
  }
  body.health = 100;
  hud.setScore(rounds.state.score.van, rounds.state.score.sen);
  hud.setAmmo(rig.state.mag, rig.state.reserve);
  hud.setHealth(body.health, body.armor);
  hud.setMoney(rounds.state.money);
  hud.setPips((body.alive ? 1 : 0) + bots.aliveCount('van'), bots.aliveCount('sen'));
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setHealth(100, 0);
hud.setAmmo(rig.state.mag, rig.state.reserve);
hud.setMoney(800);
hud.setScore(0, 0);
hud.setPips(4, 4);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
