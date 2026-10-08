// hud.js
// Updates the on-screen HTML: health bar, score/wave/kill counters, cooldowns,
// the boss health bar, banners like "WAVE 2", the red damage flash, and the
// title / game over screens.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.healthFill = $('health-fill');
    this.healthText = $('health-text');
    this.scoreEl = $('score');
    this.waveEl = $('wave');
    this.killsEl = $('kills');
    this.dashEls = [$('ab-dash'), $('btn-dash')];  // keyboard icon + touch button
    this.spinEls = [$('ab-spin'), $('btn-spin')];
    this.bossBar = $('boss-bar');
    this.bossName = $('boss-name');
    this.bossFill = $('boss-fill');
    this.banner = $('banner');
    this.bannerText = $('banner-text');
    this.bannerSub = $('banner-sub');
    this.damage = $('damage-flash');
    this.overlay = $('overlay');
    this.titlePanel = $('title-panel');
    this.gameoverPanel = $('gameover-panel');
    this.last = {}; // remember last values so we only touch the page when something changes
  }

  update(player, wave, kills, score, boss) {
    const hp = Math.ceil(player.hp);
    if (this.last.hp !== hp) {
      this.last.hp = hp;
      const frac = player.hp / player.maxHp;
      this.healthFill.style.width = `${frac * 100}%`;
      this.healthFill.classList.toggle('low', frac < 0.3);
      this.healthText.textContent = `${hp} / ${player.maxHp}`;
    }
    if (this.last.wave !== wave) { this.last.wave = wave; this.waveEl.textContent = wave; }
    if (this.last.kills !== kills) { this.last.kills = kills; this.killsEl.textContent = kills; }
    if (this.last.score !== score) { this.last.score = score; this.scoreEl.textContent = score.toLocaleString(); }
    this.setCooldown('dash', this.dashEls, player.dashCooldown, player.dashCooldownMax);
    this.setCooldown('spin', this.spinEls, player.spinCooldown, player.spinCooldownMax);

    // boss health bar
    const showBoss = !!(boss && !boss.dead && boss.state !== 'intro');
    if (this.last.showBoss !== showBoss) {
      this.last.showBoss = showBoss;
      this.bossBar.classList.toggle('hidden', !showBoss);
      if (showBoss) this.bossName.textContent = boss.name;
    }
    if (showBoss) {
      const pct = Math.max(0, Math.round((boss.hp / boss.maxHp) * 200) / 2);
      if (this.last.bossPct !== pct) { this.last.bossPct = pct; this.bossFill.style.width = `${pct}%`; }
    }
  }

  // Draws the dark "pie" over an ability while it recharges, plus seconds left
  setCooldown(key, els, remaining, max) {
    const shown = remaining > 0 ? Math.ceil(remaining * 10) : 0; // only redraw every 0.1s
    if (this.last[key] === shown) return;
    this.last[key] = shown;
    for (const el of els) {
      el.style.setProperty('--cd', remaining / max);
      el.classList.toggle('ready', remaining <= 0);
      el.querySelector('.cd-text').textContent = remaining > 0 ? (remaining >= 1 ? Math.ceil(remaining) : remaining.toFixed(1)) : '';
    }
  }

  showBanner(text, sub = '') {
    this.bannerText.textContent = text;
    this.bannerSub.textContent = sub;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth; // trick to restart the CSS animation
    this.banner.classList.add('show');
  }

  flashDamage() {
    this.damage.classList.add('on');
    clearTimeout(this.damageTimeout);
    this.damageTimeout = setTimeout(() => this.damage.classList.remove('on'), 60);
  }

  showTitle(best) {
    $('best-text').textContent = best.score > 0 ? `Best: ${best.score.toLocaleString()} pts (wave ${best.wave})` : '';
    this.overlay.classList.remove('hidden');
    this.titlePanel.classList.remove('hidden');
    this.gameoverPanel.classList.add('hidden');
  }

  showGameOver(score, wave, kills, best, newBest) {
    $('gameover-score').textContent = `${score.toLocaleString()} pts`;
    $('gameover-stats').innerHTML =
      `Reached <b>wave ${wave}</b> · <b>${kills}</b> kills<br>` +
      (newBest ? '<b style="color:#3ff6e0">NEW BEST SCORE!</b>' : `Best: ${best.score.toLocaleString()} pts (wave ${best.wave})`);
    this.overlay.classList.remove('hidden');
    this.titlePanel.classList.add('hidden');
    this.gameoverPanel.classList.remove('hidden');
    this.bossBar.classList.add('hidden');
    this.last.showBoss = false;
  }

  hideOverlay() { this.overlay.classList.add('hidden'); }
}
