// The HUD: every DOM write the game makes, in one place. main.js and rounds.js call
// these setters; no other module touches the DOM.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const health = el('health');
  const healthFill = el('health-fill');
  const armor = el('armor');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoBox = el('ammo');
  const weaponName = el('weapon-name');
  const money = el('money');
  const grenades = el('grenades');
  const timer = el('timer');
  const roundLabel = el('round-label');
  const scoreVan = el('score-van');
  const scoreSen = el('score-sen');
  const pipsVan = el('pips-van');
  const pipsSen = el('pips-sen');
  const objective = el('objective');
  const killfeed = el('killfeed');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const damageFlash = el('damage-flash');
  const flashWhite = el('flash-white');
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const playButton = el('play');
  const buyPanel = el('buy');
  const buyList = el('buy-list');
  const buyMoney = el('buy-money');

  let hitTimer = 0;

  function formatTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  function setPips(container, alive, total, team) {
    let html = '';
    for (let i = 0; i < total; i += 1) {
      html += '<i class="' + (i < alive ? 'alive ' + team : '') + '"></i>';
    }
    container.innerHTML = html;
  }

  return {
    setHealth(value, armorValue) {
      health.textContent = Math.max(0, Math.ceil(value));
      health.classList.toggle('low', value <= 30);
      healthFill.style.width = Math.max(0, Math.min(100, value)) + '%';
      healthFill.classList.toggle('low', value <= 30);
      armor.textContent = Math.ceil(armorValue);
    },
    setArmor(value) { armor.textContent = Math.ceil(value); },
    setAmmo(mag, reserve) {
      ammoMag.textContent = mag;
      ammoReserve.textContent = '/ ' + reserve;
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) { weaponName.textContent = name; },
    setMoney(value) {
      money.textContent = value;
      buyMoney.textContent = '$' + value;
    },
    setGear(frag, flash) {
      const parts = [];
      if (frag) parts.push('FRAG x' + frag + ' [G]');
      if (flash) parts.push('FLASH x' + flash + ' [F]');
      grenades.textContent = parts.join('   ');
    },
    setTimer(seconds, isBuy) {
      timer.textContent = formatTime(seconds);
      timer.classList.toggle('low', !isBuy && seconds <= 15);
    },
    setRound(n) { roundLabel.textContent = 'Round ' + n + ' · Kestrel Foundry'; },
    setScore(van, sen) {
      scoreVan.textContent = van;
      scoreSen.textContent = sen;
    },
    setPips(vanAlive, senAlive) {
      setPips(pipsVan, vanAlive, 4, 'van');
      setPips(pipsSen, senAlive, 4, 'sen');
    },
    setObjective(text) { objective.innerHTML = text; },
    setProgress(label, fraction) {
      objective.innerHTML = '<div>' + label + '</div>'
        + '<div id="progress-wrap"><div id="progress-fill" style="width:' + Math.round(fraction * 100) + '%"></div></div>'
        + '<div id="progress-label">' + Math.round(fraction * 100) + '%</div>';
    },
    killfeed(killerName, killerTeam, victimName, victimTeam, headshot) {
      const line = document.createElement('div');
      line.innerHTML = '<span class="' + killerTeam + '">' + killerName + '</span> '
        + (headshot ? '<span class="hs">◉</span> ' : '— ')
        + '<span class="' + victimTeam + '">' + victimName + '</span>';
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      window.setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 6000);
    },
    hitMarker(kill) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', kill);
      window.clearTimeout(hitTimer);
      hitTimer = window.setTimeout(() => hitmarker.classList.remove('on'), 120);
    },
    setCrosshairSpread(spreadPx) {
      const gap = 3 + spreadPx;
      const ticks = crosshair.children;
      ticks[0].style.transform = 'translateY(' + (-gap - 8) + 'px)';
      ticks[1].style.transform = 'translateY(' + gap + 'px)';
      ticks[2].style.transform = 'translateX(' + (-gap - 8) + 'px)';
      ticks[3].style.transform = 'translateX(' + gap + 'px)';
    },
    damageFlash() {
      damageFlash.style.opacity = '1';
      window.setTimeout(() => { damageFlash.style.opacity = '0'; }, 130);
    },
    flashBang(strength) {
      flashWhite.style.opacity = String(Math.min(1, strength));
      window.setTimeout(() => { flashWhite.style.opacity = '0'; }, 500);
    },
    showOverlay(kind, data) {
      overlay.hidden = false;
      if (kind === 'start') {
        overlayTitle.innerHTML = 'EMBER<span class="amber">LINE</span>';
        document.getElementById('overlay-copy').textContent = 'A round-based tactical shooter in the Kestrel Foundry. Plant the spark charge at Site A or Site B — or wipe the Sentinel squad. Your Vanguard bots push with you. Stop, aim, and make the shots count.';
        playButton.textContent = 'Click to play';
      } else if (kind === 'paused') {
        overlayTitle.textContent = 'Paused';
        document.getElementById('overlay-copy').textContent = 'Round ' + (data.round || 1) + ' — click to jump back in.';
        playButton.textContent = 'Resume';
      } else if (kind === 'roundEnd') {
        overlayTitle.textContent = data.title;
        document.getElementById('overlay-copy').textContent = data.copy;
        playButton.textContent = 'Next round';
      } else if (kind === 'matchEnd') {
        overlayTitle.textContent = data.title;
        document.getElementById('overlay-copy').textContent = data.copy;
        playButton.textContent = 'Play again';
      }
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { playButton.addEventListener('click', handler); },
    showBuy(items, onBuy) {
      buyPanel.hidden = false;
      buyList.innerHTML = '';
      items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'buy-row' + (item.owned ? ' owned' : '') + (item.affordable ? '' : ' cant');
        row.innerHTML = '<span class="key">' + (index + 1) + '</span>'
          + '<span class="name"><b>' + item.name + '</b><span>' + item.desc + '</span></span>'
          + '<span class="price">' + (item.owned ? 'OWNED' : '$' + item.price) + '</span>';
        if (!item.owned) row.addEventListener('click', () => onBuy(item.id));
        buyList.appendChild(row);
      });
    },
    hideBuy() { buyPanel.hidden = true; },
    buyVisible() { return !buyPanel.hidden; },
  };
}
