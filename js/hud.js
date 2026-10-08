// hud.js
// Updates the on-screen HTML: health bar, wave/kill counters, cooldowns,
// banners like "WAVE 2", the red damage flash, and the title / game over screens.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.healthFill = $('health-fill');
    this.healthText = $('health-text');
    this.waveEl = $('wave');
    this.killsEl = $('kills');
    this.dashEls = [$('ab-dash'), $('btn-dash')];  // keyboard icon + touch button
    this.spinEls = [$('ab-spin'), $('btn-spin')];
    this.banner = $('banner');
    this.bannerText = $('banner-text');
    this.bannerSub = $('banner-sub');
    this.damage = $('damage-flash');
    this.overlay = $('overlay');
    this.titlePanel = $('title-panel');
    this.gameoverPanel = $('gameover-panel');
    this.last = {}; // remember last values so we only touch the page when something changes
  }

  update(player, wave, kills) {
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
    this.setCooldown('dash', this.dashEls, player.dashCooldown, player.dashCooldownMax);
    this.setCooldown('spin', this.spinEls, player.spinCooldown, player.spinCooldownMax);
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

  showTitle(bestWave) {
    $('best-text').textContent = bestWave > 0 ? `Best: wave ${bestWave}` : '';
    this.overlay.classList.remove('hidden');
    this.titlePanel.classList.remove('hidden');
    this.gameoverPanel.classList.add('hidden');
  }

  showGameOver(wave, kills, bestWave, newBest) {
    $('gameover-stats').innerHTML =
      `You reached <b>wave ${wave}</b> with <b>${kills}</b> kills.<br>` +
      (newBest ? 'New best!' : `Best: wave ${bestWave}`);
    this.overlay.classList.remove('hidden');
    this.titlePanel.classList.add('hidden');
    this.gameoverPanel.classList.remove('hidden');
  }

  hideOverlay() { this.overlay.classList.add('hidden'); }
}
