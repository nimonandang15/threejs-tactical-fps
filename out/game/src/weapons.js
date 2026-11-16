// Weapons: five guns and two throwables. Each gun owns its numbers — damage, headshot
// multiplier, fire gap, spread still vs moving, magazine, price — and its view model.
// main.js owns the ray, the damage and the money. Spread grows with movement speed and
// with each shot in a burst, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', kind: 'pistol', price: 0, damage: 34, headMult: 2.0,
    mag: 12, reserve: 48, gap: 0.16, reload: 1.4, spreadStill: 0.003, spreadMove: 0.02, auto: false,
  },
  vk9: {
    id: 'vk9', name: 'VK-9 SMG', kind: 'smg', price: 1200, damage: 24, headMult: 2.0,
    mag: 28, reserve: 112, gap: 0.075, reload: 1.7, spreadStill: 0.006, spreadMove: 0.034, auto: true,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 Rifle', kind: 'rifle', price: 2700, damage: 33, headMult: 2.2,
    mag: 30, reserve: 90, gap: 0.1, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, auto: true,
  },
  lr90: {
    id: 'lr90', name: 'LR-90 Marksman', kind: 'marksman', price: 4750, damage: 88, headMult: 2.5,
    mag: 5, reserve: 15, gap: 0.95, reload: 2.6, spreadStill: 0.0008, spreadMove: 0.05, auto: false,
  },
};

export const GEAR = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300 },
  flash: { id: 'flash', name: 'Flashbang', price: 200 },
  armor: { id: 'armor', name: 'Kevlar Vest', price: 650 },
};

const MOVE_REFERENCE = 5.4;
const MUZZLE_TIME = 0.06;

export function createWeaponRig(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.65, metalness: 0.25 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const amber = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), steel);
  barrel.position.set(0, 0.025, -0.39);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), dark);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), amber);
  sight.position.set(0, 0.075, -0.1);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.27, -0.23, -0.55);
  model.scale.setScalar(0.62);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.27, -0.21, -1.0);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.27, -0.21, -0.7);
  camera.add(flashLight);

  let def = WEAPONS.p9;
  const state = {
    def, mag: def.mag, reserve: def.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, burst: 0,
  };

  function equip(id) {
    def = WEAPONS[id];
    state.def = def;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.burst = 0;
    const scale = def.kind === 'marksman' ? 0.8 : def.kind === 'pistol' ? 0.55 : 0.62;
    model.scale.setScalar(scale);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.burst = Math.max(0, state.burst - dt * 2.2);
    model.position.z = -0.55 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    pullTrigger() {
      state.cooldown = def.gap;
      state.flash = MUZZLE_TIME;
      state.kick = def.kind === 'marksman' ? 0.09 : 0.055;
      state.burst = Math.min(1, state.burst + (def.kind === 'marksman' ? 0.5 : 0.16));
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const moving = Math.min(1, speed / MOVE_REFERENCE);
      return def.spreadStill + moving * def.spreadMove + state.burst * 0.012;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.burst = 0;
    },
  };
}
