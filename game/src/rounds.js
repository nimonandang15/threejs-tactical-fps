// Rounds: buy phase, live phase, plant and defuse, money, and the match. One round is won
// by eliminating the other team, by the charge detonating, or by defusing it; a timer that
// runs out with no plant goes to the defenders. First to 5 rounds takes the match.
import { WEAPONS, GEAR } from './weapons.js';

const BUY_SECONDS = 12;
const ROUND_SECONDS = 100;
const FUSE_SECONDS = 35;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 4;
const WIN_ROUNDS = 5;
const WIN_BONUS = 325;
const LOSS_BONUS = 150;
const KILL_BONUS = 300;
const PLANT_BONUS = 300;

export function createRounds(ctx) {
  const { bots, world, player, hud, audio, hooks } = ctx;
  const state = {
    phase: 'menu',
    round: 1,
    score: { van: 0, sen: 0 },
    timer: BUY_SECONDS,
    money: 800,
    plant: null,
    matchWinner: null,
    inventory: { primary: 'p9', owned: new Set(['p9']), frag: 0, flash: 0, armor: 0 },
  };

  function aliveBots(team) { return bots.list.filter((b) => b.team === team && b.alive); }

  function assignOpeners() {
    const van = aliveBots('van');
    const routes = ['pushA', 'pushB', 'pushMid'];
    van.forEach((bot, i) => bots.assignRoute(bot, routes[i % routes.length]));
    const sen = aliveBots('sen');
    const holds = ['holdA', 'holdB', 'holdMid', 'holdMid'];
    sen.forEach((bot, i) => bots.assignRoute(bot, holds[i % holds.length]));
  }

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.plant = null;
    for (const bot of bots.list) {
      const spawn = bot.team === 'van' ? world.vanSpawn : world.senSpawn;
      const yaw = bot.team === 'van' ? 0 : Math.PI;
      bots.revive(bot, spawn, yaw);
    }
    player.reset(world.vanSpawn, 0);
    hooks.equipWeapon(state.inventory.primary);
    hooks.refillAmmo();
    player.state.armor = state.inventory.armor;
    assignOpeners();
    hud.setRound(state.round);
    hud.setScore(state.score.van, state.score.sen);
    hud.setMoney(state.money);
    hud.setObjective('Buy phase — press B to spend your $' + state.money + ' before the round starts.');
    hooks.onBuyPhase(state.round);
  }

  function startMatch() {
    state.round = 1;
    state.score = { van: 0, sen: 0 };
    state.money = 800;
    state.matchWinner = null;
    state.inventory = { primary: 'p9', owned: new Set(['p9']), frag: 0, flash: 0, armor: 0 };
    startRound();
  }

  function endRound(winner, reason) {
    state.phase = 'roundEnd';
    state.timer = 4;
    state.score[winner] += 1;
    const playerWon = winner === 'van';
    state.money += playerWon ? WIN_BONUS : LOSS_BONUS;
    hud.setScore(state.score.van, state.score.sen);
    hud.setMoney(state.money);
    hud.setObjective('');
    if (playerWon) audio.roundWin(); else audio.roundLose();
    hooks.onRoundEnd(winner, reason, state.score);
    if (state.score[winner] >= WIN_ROUNDS) {
      state.matchWinner = winner;
    }
  }

  function checkElimination() {
    if (state.plant) return;
    if (aliveBots('van').length === 0 && !player.state.alive) endRound('sen', 'Vanguard wiped out');
    else if (aliveBots('sen').length === 0) endRound('van', 'Sentinel wiped out');
  }

  function plantCharge(siteId) {
    state.plant = { site: siteId, fuseLeft: FUSE_SECONDS };
    state.money += PLANT_BONUS;
    hud.setMoney(state.money);
    hud.setObjective('Charge planted at Site ' + siteId + ' — defend it until it blows.');
    audio.plantBeep();
    hooks.onPlant(siteId);
    for (const bot of aliveBots('sen')) bots.orderRotate(bot, siteId);
  }

  function detonate() {
    const site = state.plant.site;
    hooks.onDetonate(site);
    endRound('van', 'Charge detonated at Site ' + site);
  }

  function defused() {
    hooks.onDefuse(state.plant.site);
    endRound('sen', 'Charge defused at Site ' + state.plant.site);
  }

  // The player plants by holding E inside a site; a bot carrier plants by standing there.
  function playerAtSite() {
    for (const site of Object.values(world.sites)) {
      if (Math.hypot(player.state.position.x - site.x, player.state.position.z - site.z) < 2.6) return site.id;
    }
    return null;
  }

  function step(dt, now) {
    if (state.phase === 'menu' || state.phase === 'matchEnd') return;
    if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.matchWinner) {
          state.phase = 'matchEnd';
          hooks.onMatchEnd(state.matchWinner, state.score);
        } else {
          state.round += 1;
          startRound();
        }
      }
      return;
    }
    if (state.phase === 'buy') {
      state.timer -= dt;
      hud.setTimer(Math.max(0, state.timer), true);
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        hud.setTimer(state.timer, false);
        hud.setObjective('Plant the charge at Site A or Site B — or eliminate Sentinel.');
        audio.roundStart();
        hooks.onLivePhase();
      }
      return;
    }

    // Live phase.
    state.timer -= dt;
    hud.setTimer(Math.max(0, state.timer), false);
    if (state.plant) {
      state.plant.fuseLeft -= dt;
      hud.setObjective('Charge live at Site ' + state.plant.site + ' — ' + Math.ceil(state.plant.fuseLeft) + 's to detonation.');
      if (state.plant.fuseLeft <= 0) {
        detonate();
        return;
      }
    } else if (state.timer <= 0) {
      endRound('sen', 'Time expired — Sentinel holds the foundry');
      return;
    }

    // If the player is down, the nearest alive Vanguard bot picks up the charge and
    // pushes the nearer site, so the round can still be won by planting.
    if (!player.state.alive && !state.plant && !bots.carrier()) {
      const alive = aliveBots('van');
      if (alive.length) {
        const carrier = alive.sort((a, b) => a.position.distanceTo(player.state.position) - b.position.distanceTo(player.state.position))[0];
        carrier.carrying = true;
        const siteA = world.sites.A;
        const siteB = world.sites.B;
        const distA = Math.hypot(carrier.position.x - siteA.x, carrier.position.z - siteA.z);
        const distB = Math.hypot(carrier.position.x - siteB.x, carrier.position.z - siteB.z);
        bots.assignRoute(carrier, distA <= distB ? 'pushA' : 'pushB');
      }
    }

    // Bot carrier plants when it reaches its site.
    const carrier = bots.carrier();
    if (carrier && !state.plant) {
      const target = carrier.route.length ? carrier.route[carrier.route.length - 1] : null;
      if (target) {
        const siteId = Math.abs(target.x - world.sites.A.x) < 1 ? 'A' : Math.abs(target.x - world.sites.B.x) < 1 ? 'B' : null;
        if (siteId && Math.hypot(carrier.position.x - target.x, carrier.position.z - target.z) < 1.2) {
          carrier.channel = 'plant';
          carrier.channelProgress += dt;
          if (carrier.channelProgress >= PLANT_SECONDS) {
            carrier.channel = null;
            carrier.channelProgress = 0;
            plantCharge(siteId);
          }
        } else {
          carrier.channel = null;
          carrier.channelProgress = 0;
        }
      }
    }

    // A Sentinel at a planted site defuses.
    if (state.plant) {
      const site = world.sites[state.plant.site];
      for (const bot of aliveBots('sen')) {
        const distance = Math.hypot(bot.position.x - site.x, bot.position.z - site.z);
        if (distance < 2.2) {
          bot.channel = 'defuse';
          bot.channelProgress += dt;
          if (bot.channelProgress >= DEFUSE_SECONDS) {
            bot.channel = null;
            bot.channelProgress = 0;
            defused();
            return;
          }
        } else if (bot.channel === 'defuse') {
          bot.channel = null;
          bot.channelProgress = 0;
        }
      }
    }

    checkElimination();
  }

  function buy(id) {
    if (state.phase !== 'buy') return false;
    if (WEAPONS[id]) {
      if (state.inventory.owned.has(id)) return false;
      if (state.money < WEAPONS[id].price) { audio.denied(); return false; }
      state.money -= WEAPONS[id].price;
      state.inventory.owned.add(id);
      state.inventory.primary = id;
      hooks.equipWeapon(id);
      audio.buy();
    } else if (GEAR[id]) {
      if (id === 'armor') {
        if (state.inventory.armor > 0 || state.money < GEAR.armor.price) { audio.denied(); return false; }
        state.money -= GEAR.armor.price;
        state.inventory.armor = 100;
        player.state.armor = 100;
      } else if (id === 'frag') {
        if (state.money < GEAR.frag.price) { audio.denied(); return false; }
        state.money -= GEAR.frag.price;
        state.inventory.frag += 1;
      } else if (id === 'flash') {
        if (state.money < GEAR.flash.price) { audio.denied(); return false; }
        state.money -= GEAR.flash.price;
        state.inventory.flash += 1;
      }
      audio.buy();
    } else {
      return false;
    }
    hud.setMoney(state.money);
    hud.setGear(state.inventory.frag, state.inventory.flash);
    hud.setArmor(player.state.armor);
    return true;
  }

  return {
    state,
    startMatch,
    startRound,
    step,
    buy,
    plantCharge,
    completeDefuse() { if (state.plant) defused(); },
    playerAtSite,
    awardKill() {
      state.money += KILL_BONUS;
      hud.setMoney(state.money);
    },
    plantSeconds: PLANT_SECONDS,
    defuseSeconds: DEFUSE_SECONDS,
  };
}
