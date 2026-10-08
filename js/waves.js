// waves.js
// Endless mode: the waves never stop, they just keep getting harder.
//
// Scaling rules for wave n (tweak these to change the difficulty curve):
//   enemies per wave  = 4 + 2n           (no limit)
//   max on screen     = min(6 + n, 14)   (capped so phones stay smooth; harder waves get
//                                          tougher enemies instead of more of them)
//   enemy health      x (1 + 0.14 * (n-1))   - grows forever
//   enemy damage      x (1 + 0.07 * (n-1))   - grows forever
//   enemy speed       x (1 + min(0.5, 0.025 * (n-1)))  - tops out at +50% so it stays fair
//   elite chance      = min(50%, 4% per wave after wave 5)
//   new enemy types unlock: hounds (wave 2), spitters (3), bulwarks (4), splitters (6)
//   every 5th wave is a BOSS round instead
import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { Boss, BOSSES } from './boss.js';

const SCREEN_CAP = 14;        // regular enemies alive at once (not counting mites/summons)
const HARD_CAP = 24;          // absolute limit including splitter mites and boss summons

// Which enemy types can appear from which wave, and how common they are
const UNLOCKS = [
  { type: 'acolyte', wave: 1, weight: 5 },
  { type: 'hound', wave: 2, weight: 3 },
  { type: 'spitter', wave: 3, weight: 2 },
  { type: 'bulwark', wave: 4, weight: 1.3 },
  { type: 'splitter', wave: 6, weight: 1.6 },
];

export function waveStats(n) {
  return {
    hpMult: 1 + 0.14 * (n - 1),
    dmgMult: 1 + 0.07 * (n - 1),
    speedMult: 1 + Math.min(0.5, 0.025 * (n - 1)),
    eliteChance: Math.min(0.5, Math.max(0, (n - 5) * 0.04)),
  };
}

export const isBossWave = (n) => n % 5 === 0;

export class WaveManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = []; // every enemy + boss currently in the arena
    this.reset();
  }

  reset() {
    for (const e of this.list) e.dispose();
    this.list = [];
    this.wave = 0;
    this.queue = [];
    this.waveActive = false;
    this.breakTimer = 0;
    this.boss = null;
    this.bossTimer = 0;
  }

  get aliveCount() { return this.list.filter((e) => !e.dead).length; }

  startWave(n) {
    this.wave = n;
    this.stats = waveStats(n);
    this.queue = [];
    this.waveActive = true;
    this.spawnTimer = 0.8;

    if (isBossWave(n)) {
      // Boss round: just the boss (plus whatever it summons)
      const bossNumber = n / 5;
      this.bossIndex = (bossNumber - 1) % BOSSES.length;
      this.bossNumber = bossNumber;
      this.bossTimer = 1.8; // short pause so the banner can show first
      this.world.onBossWave(n, BOSSES[this.bossIndex]);
      return;
    }

    const total = 4 + 2 * n;
    const pool = UNLOCKS.filter((u) => n >= u.wave);
    const totalWeight = pool.reduce((s, u) => s + u.weight, 0);
    for (let i = 0; i < total; i++) {
      let r = Math.random() * totalWeight;
      const pick = pool.find((u) => (r -= u.weight) <= 0) || pool[0];
      this.queue.push(pick.type);
    }
    this.maxAlive = Math.min(6 + n, SCREEN_CAP);
    this.world.onWaveStart(n);
  }

  update(dt) {
    const player = this.world.player;

    if (this.waveActive) {
      if (this.bossTimer > 0) {
        this.bossTimer -= dt;
        if (this.bossTimer <= 0) this.spawnBoss();
      }
      this.spawnTimer -= dt;
      const regularAlive = this.list.filter((e) => !e.dead && !e.summoned && !e.isBoss).length;
      if (this.queue.length > 0 && this.spawnTimer <= 0 && regularAlive < this.maxAlive) {
        const pos = this.world.arena.randomSpawnPoint(player.position, 9);
        this.spawnAt(this.queue.shift(), pos, false);
        this.spawnTimer = Math.max(0.2, 0.7 - this.wave * 0.02) + Math.random() * 0.3;
      }
      if (this.queue.length === 0 && this.bossTimer <= 0 && this.aliveCount === 0) {
        this.waveActive = false;
        this.breakTimer = 3;
        this.world.onWaveCleared(this.wave);
      }
    } else if (this.wave > 0 && !player.dead) {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.startWave(this.wave + 1);
    }

    for (const e of this.list) e.update(dt, player, this.list);

    // remove anything whose death animation has finished
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].remove) {
        this.list[i].dispose();
        this.list.splice(i, 1);
      }
    }
  }

  // Spawn one regular enemy. `summoned` = created by a boss or a splitter (doesn't use the wave cap)
  spawnAt(typeName, pos, summoned = true) {
    if (this.aliveCount >= HARD_CAP) return null;
    const p = pos.clone();
    this.world.arena.resolve(p, 0.6);
    const elite = typeName !== 'mite' && Math.random() < this.stats.eliteChance;
    const e = new Enemy(this.scene, typeName, p, { ...this.stats, elite }, this.world);
    e.summoned = summoned;
    this.list.push(e);
    this.world.effects.spawnRing(p, elite ? 0xffb020 : 0xc8ff3a, 2.2, 0.7);
    return e;
  }

  spawnBoss() {
    // appear on the far side of the arena from the player
    const p = this.world.player.position;
    const pos = new THREE.Vector3(-Math.sign(p.x || 1) * 7, 0, -Math.sign(p.z || 1) * 7);
    this.boss = new Boss(this.scene, this.bossIndex, this.bossNumber, this.stats, pos, this.world);
    this.list.push(this.boss);
    this.world.effects.spawnRing(pos, 0xff5a20, 5, 1.2);
    this.world.shake(0.3);
  }

  // When the boss dies, every add it summoned crumbles too
  killAllAdds() {
    for (const e of this.list) if (!e.dead && !e.isBoss) { e.crumble = true; e.die(); }
  }
}
