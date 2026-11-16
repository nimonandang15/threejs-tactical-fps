// Bots: 3 Vanguard teammates and 4 Sentinel defenders. Each bot walks a waypoint route,
// holds ground, and fights what it can see. Perception is a line-of-sight ray against the
// world's shootables; shooting is bursts with distance- and movement-based hit chance, so
// a bot that stops and aims is dangerous and a bot on the move is not. One Vanguard bot
// carries the spark charge and plants it; Sentinels rotate to a plant and defuse it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';

const BOT_RADIUS = 0.36;
const BOT_HEIGHT = 1.72;
const EYE = 1.55;
const ADVANCE_SPEED = 3.7;
const ENGAGE_SPEED = 2.1;

const TEAM_COLOR = { van: PALETTE.accent, sen: PALETTE.foe };
const TEAM_MATES = { van: ['Ash', 'Brick', 'Nova'], sen: ['Wraith', 'Hollow', 'Sable', 'Rook'] };

function makeBody(team) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM_COLOR[team]), roughness: 0.75, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.78, 0.2), dark);
  legs.position.y = 0.39;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), cloth);
  torso.position.y = 1.09;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), skin);
  head.position.y = 1.56;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.31), dark);
  visor.position.y = 1.58;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.2, 1.28, -0.3);
  const marker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_COLOR[team]), side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  );
  marker.position.y = 1.98;
  group.add(legs, torso, head, visor, gun, marker);
  group.userData.marker = marker;
  torso.userData.part = 'body';
  head.userData.part = 'head';
  return { group, torso, head, marker };
}

export function createBots(scene, world, hooks, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 70;
  const bots = [];
  const hitMeshes = [];
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const tmp3 = new THREE.Vector3();

  function spawnBot(team, name, index, weaponId) {
    const body = makeBody(team);
    scene.add(body.group);
    const bot = {
      kind: 'bot',
      name,
      team,
      weapon: WEAPONS[weaponId],
      group: body.group,
      torso: body.torso,
      head: body.head,
      marker: body.marker,
      position: body.group.position,
      yaw: 0,
      health: 100,
      armor: 0,
      alive: true,
      route: [],
      routeIndex: 0,
      state: 'hold',
      holdUntil: 0,
      target: null,
      lastSeenAt: -10,
      thinkAt: random() * 0.15,
      burstLeft: 0,
      nextShotAt: 0,
      pauseUntil: 0,
      strafeDir: 1,
      strafeUntil: 0,
      channel: null,
      channelProgress: 0,
      carrying: false,
      flashUntil: 0,
    };
    body.torso.userData.bot = bot;
    body.head.userData.bot = bot;
    hitMeshes.push(body.torso, body.head);
    bots.push(bot);
    return bot;
  }

  TEAM_MATES.van.forEach((name, i) => spawnBot('van', name, i, i === 0 ? 'ar77' : 'vk9'));
  TEAM_MATES.sen.forEach((name, i) => spawnBot('sen', name, i, i === 3 ? 'lr90' : i === 0 ? 'ar77' : 'vk9'));

  function collides(x, z) {
    const min = new THREE.Box3(new THREE.Vector3(x - BOT_RADIUS, 0.05, z - BOT_RADIUS), new THREE.Vector3(x + BOT_RADIUS, BOT_HEIGHT - 0.05, z + BOT_RADIUS));
    for (const collider of world.colliders) if (min.intersectsBox(collider)) return true;
    return false;
  }

  function moveBot(bot, dt, dx, dz) {
    const speed = bot.state === 'engage' ? ENGAGE_SPEED : ADVANCE_SPEED;
    const length = Math.hypot(dx, dz) || 1;
    const stepX = (dx / length) * speed * dt;
    const stepZ = (dz / length) * speed * dt;
    const nextX = bot.position.x + stepX;
    if (!collides(nextX, bot.position.z)) bot.position.x = nextX;
    const nextZ = bot.position.z + stepZ;
    if (!collides(bot.position.x, nextZ)) bot.position.z = nextZ;
  }

  function canSee(bot, targetPos) {
    tmp.copy(targetPos);
    tmp.y = 1.4;
    tmp2.copy(bot.position);
    tmp2.y = EYE;
    const distance = tmp2.distanceTo(tmp);
    if (distance > 60) return false;
    tmp3.copy(tmp).sub(tmp2).normalize();
    raycaster.set(tmp2, tmp3);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function nearestVisibleEnemy(bot, enemies) {
    let best = null;
    let bestDistance = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const targetPos = enemy.kind === 'player' ? enemy.position : enemy.position;
      const distance = bot.position.distanceTo(targetPos);
      if (distance >= bestDistance) continue;
      if (canSee(bot, targetPos)) {
        best = enemy;
        bestDistance = distance;
      }
    }
    return best ? { enemy: best, distance: bestDistance } : null;
  }

  function aimError(bot, enemy, distance) {
    let error = 0.012 + distance * 0.0011;
    const enemySpeed = enemy.kind === 'player' ? (enemy.speed || 0) : ADVANCE_SPEED * 0.6;
    if (enemySpeed > 2) error += 0.008;
    if (bot.state === 'engage' && bot.strafeDir) error += 0.006;
    if (bot.flashUntil > 0) error += 0.2;
    return error;
  }

  function botShoot(bot, enemy, distance, now) {
    if (now < bot.nextShotAt) return;
    bot.nextShotAt = now + bot.weapon.gap * 1.5;
    const muzzle = tmp.copy(bot.position).setY(EYE);
    tmp2.copy(enemy.kind === 'player' ? enemy.position : enemy.position);
    tmp2.y = 1.35;
    const error = aimError(bot, enemy, distance);
    tmp2.x += (random() * 2 - 1) * error * distance;
    tmp2.y += (random() * 2 - 1) * error * distance * 0.6;
    tmp2.z += (random() * 2 - 1) * error * distance;
    hooks.tracer(muzzle, tmp2, bot);
    const hitChance = Math.max(0.08, 0.62 - distance * 0.011 - (bot.state === 'engage' ? 0.05 : 0.12));
    if (random() < hitChance) {
      const isHead = random() < 0.12;
      hooks.damage(enemy, bot.weapon.damage * (isHead ? bot.weapon.headMult : 1), isHead, bot);
    }
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.pauseUntil = now + 0.5 + random() * 0.5;
  }

  function assignRoute(bot, routeName) {
    bot.route = world.routes[routeName].map((id) => world.waypoints[id]);
    bot.routeIndex = 0;
    bot.state = 'advance';
  }

  function orderRotate(bot, siteId) {
    assignRoute(bot, siteId === 'A' ? 'rotateA' : 'rotateB');
    bot.state = 'advance';
  }

  function stepBot(bot, dt, now, enemies, camera) {
    if (!bot.alive) return;
    bot.marker.quaternion.copy(camera.quaternion);
    bot.group.position.y = 0;
    if (bot.flashUntil > now) {
      // Blinded: stand still, do not shoot.
      return;
    }
    if (bot.channel) {
      // Planting or defusing: stand still, face the site, channel.
      return;
    }

    // Think on a stagger so all bots never raycast on the same frame.
    if (now >= bot.thinkAt) {
      bot.thinkAt = now + 0.15 + random() * 0.05;
      const seen = nearestVisibleEnemy(bot, enemies);
      if (seen) {
        bot.target = seen.enemy;
        bot.lastSeenAt = now;
        bot.state = 'engage';
      } else if (bot.state === 'engage' && now - bot.lastSeenAt > 1.2) {
        bot.target = null;
        bot.state = bot.routeIndex < bot.route.length ? 'advance' : 'hold';
        bot.holdUntil = now + 1.5 + random() * 2;
      }
    }

    if (bot.state === 'engage' && bot.target && bot.target.alive) {
      const targetPos = bot.target.position;
      const dx = targetPos.x - bot.position.x;
      const dz = targetPos.z - bot.position.z;
      const distance = Math.hypot(dx, dz);
      bot.yaw = Math.atan2(-dx, -dz);
      if (now >= bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = now + 0.8 + random() * 1.2;
      }
      if (distance > 6) moveBot(bot, dt, -dz * bot.strafeDir * 0.4 + dx * 0.2, dx * bot.strafeDir * 0.4 + dz * 0.2);
      if (now >= bot.pauseUntil) {
        if (bot.burstLeft <= 0) bot.burstLeft = 3 + Math.floor(random() * 3);
        botShoot(bot, bot.target, distance, now);
      }
    } else if (bot.state === 'advance' && bot.routeIndex < bot.route.length) {
      const waypoint = bot.route[bot.routeIndex];
      const dx = waypoint.x - bot.position.x;
      const dz = waypoint.z - bot.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.7) {
        bot.routeIndex += 1;
        if (bot.routeIndex >= bot.route.length) {
          bot.state = 'hold';
          bot.holdUntil = now + 2 + random() * 3;
        }
      } else {
        bot.yaw = Math.atan2(-dx, -dz);
        moveBot(bot, dt, dx, dz);
      }
    } else if (bot.state === 'hold') {
      if (now >= bot.holdUntil) {
        if (bot.carrying) {
          // The carrier holds the site and waits to plant; it does not wander off.
          bot.holdUntil = now + 2;
        } else {
          // Shift to a nearby waypoint so holders do not stand frozen all round.
          const near = Object.values(world.waypoints)
            .filter((w) => Math.hypot(w.x - bot.position.x, w.z - bot.position.z) < 9)
            .sort(() => random() - 0.5)[0];
          if (near) {
            bot.route = [near];
            bot.routeIndex = 0;
            bot.state = 'advance';
          } else {
            bot.holdUntil = now + 2;
          }
        }
      }
    }
    bot.group.rotation.y = bot.yaw;
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    let remaining = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, remaining * 0.5);
      bot.armor -= absorbed;
      remaining -= absorbed;
    }
    bot.health -= remaining;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.channel = null;
      bot.group.rotation.x = -Math.PI / 2;
      bot.group.position.y = 0.25;
      bot.marker.visible = false;
      return true;
    }
    return false;
  }

  function revive(bot, spawn, yaw) {
    bot.position.copy(spawn);
    bot.position.y = 0;
    bot.health = 100;
    bot.armor = 0;
    bot.alive = true;
    bot.yaw = yaw;
    bot.group.rotation.set(0, yaw, 0);
    bot.marker.visible = true;
    bot.route = [];
    bot.routeIndex = 0;
    bot.state = 'hold';
    bot.target = null;
    bot.channel = null;
    bot.channelProgress = 0;
    bot.carrying = false;
    bot.flashUntil = 0;
    bot.burstLeft = 0;
  }

  return {
    list: bots,
    hitMeshes,
    assignRoute,
    orderRotate,
    damage,
    revive,
    aliveCount(team) { return bots.filter((b) => b.team === team && b.alive).length; },
    carrier() { return bots.find((b) => b.carrying && b.alive) || null; },
    step(dt, now, player, camera) {
      const enemiesOfVan = bots.filter((b) => b.team === 'sen');
      const enemiesOfSen = bots.filter((b) => b.team === 'van').concat(player.alive ? [player] : []);
      for (const bot of bots) {
        stepBot(bot, dt, now, bot.team === 'van' ? enemiesOfVan : enemiesOfSen, camera);
      }
    },
  };
}
