// enemy.js
// Apocalypse's grunts: they teleport in, chase Wolverine, wind up a punch and swing.
// Also contains the EnemyManager, which runs the waves.
import * as THREE from 'three';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1); // shared by every enemy body part
const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

// Enemy types. Brutes show up from wave 3: bigger, slower, tougher, and they
// don't flinch from light hits (only the combo finisher / spin staggers them).
const TYPES = {
  grunt: { hp: 30, speed: 3.4, damage: 8, scale: 1.0, windup: 0.45, reach: 1.5, armored: false, color: 0x6b2fa0 },
  brute: { hp: 95, speed: 2.5, damage: 16, scale: 1.45, windup: 0.75, reach: 2.0, armored: true, color: 0x45206e },
};

export class Enemy {
  constructor(scene, typeName, position, wave, world) {
    const type = TYPES[typeName];
    this.scene = scene;
    this.world = world;
    this.type = type;
    this.typeName = typeName;
    this.maxHp = type.hp * (1 + (wave - 1) * 0.12);    // tougher every wave
    this.hp = this.maxHp;
    this.speed = type.speed * (1 + Math.min(wave - 1, 8) * 0.04) * (0.9 + Math.random() * 0.2);
    this.damage = type.damage + (wave - 1) * 0.6;
    this.radius = 0.5 * type.scale;
    this.position = position.clone();
    this.knockback = new THREE.Vector3();
    this.facing = 0;
    this.state = 'spawn'; // 'spawn' | 'chase' | 'windup' | 'recover' | 'dead'
    this.stateTime = 0;
    this.attackCooldown = 0.6 + Math.random() * 0.6;
    this.flashTimer = 0;
    this.stun = 0;
    this.walkPhase = Math.random() * 10;
    this.dead = false;
    this.remove = false; // EnemyManager deletes us when this becomes true

    this.buildModel();
  }

  // Can the player hit this enemy right now?
  get canBeHit() { return !this.dead && this.state !== 'spawn'; }

  buildModel() {
    // Each enemy gets its own copy of the materials so it can flash white on its own
    this.mats = {
      purple: new THREE.MeshLambertMaterial({ color: this.type.color }),
      grey: new THREE.MeshLambertMaterial({ color: 0x8a8a98 }),
      dark: new THREE.MeshLambertMaterial({ color: 0x2b2135 }),
    };
    const { purple, grey, dark } = this.mats;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const part = (parent, mat, w, h, d, x, y, z, shadow = true) => {
      const m = new THREE.Mesh(UNIT_BOX, mat);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      parent.add(m);
      return m;
    };

    // legs (pivot at hip)
    this.legL = new THREE.Group(); this.legL.position.set(0.2, 0.8, 0); this.body.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(-0.2, 0.8, 0); this.body.add(this.legR);
    part(this.legL, dark, 0.3, 0.8, 0.32, 0, -0.4, 0);
    part(this.legR, dark, 0.3, 0.8, 0.32, 0, -0.4, 0);

    part(this.body, purple, 0.8, 0.75, 0.48, 0, 1.2, 0);         // torso
    part(this.body, grey, 0.5, 0.4, 0.08, 0, 1.25, 0.25, false);  // chest plate
    part(this.body, grey, 1.05, 0.2, 0.55, 0, 1.6, 0);           // shoulder armour
    part(this.body, grey, 0.4, 0.4, 0.4, 0, 1.95, 0);            // helmet
    part(this.body, EYE_MAT, 0.28, 0.07, 0.03, 0, 1.97, 0.21, false); // glowing red visor
    part(this.body, dark, 0.12, 0.25, 0.12, 0, 2.25, -0.05);     // helmet crest

    // arms (pivot at shoulder)
    this.armL = new THREE.Group(); this.armL.position.set(0.55, 1.55, 0); this.body.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(-0.55, 1.55, 0); this.body.add(this.armR);
    for (const a of [this.armL, this.armR]) {
      part(a, purple, 0.24, 0.6, 0.26, 0, -0.32, 0);
      part(a, grey, 0.3, 0.28, 0.3, 0, -0.72, 0); // big fist
    }

    this.root.scale.setScalar(this.type.scale);
    this.root.position.copy(this.position);
    this.root.position.y = -2.5; // start underground, rise up during 'spawn'
    this.scene.add(this.root);
  }

  // Called by the player's attacks
  hit(damage, knockX, knockZ, heavy) {
    if (!this.canBeHit) return;
    this.hp -= damage;
    this.flashTimer = 0.1;
    const resist = this.type.armored ? 0.4 : 1;
    this.knockback.x += knockX * resist;
    this.knockback.z += knockZ * resist;
    // Light hits interrupt grunts; brutes only flinch from heavy hits
    if (!this.type.armored || heavy) {
      this.stun = 0.3;
      if (this.state === 'windup') { this.state = 'chase'; this.stateTime = 0; }
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.state = 'dead';
    this.stateTime = 0;
    this.world.onEnemyKilled(this);
  }

  update(dt, player, others) {
    this.stateTime += dt;
    this.flashTimer -= dt;
    this.stun -= dt;
    this.attackCooldown -= dt;

    if (this.state === 'dead') { this.animateDeath(); return; }

    if (this.state === 'spawn') {
      // rise out of the floor
      const t = Math.min(1, this.stateTime / 0.6);
      this.root.position.y = -2.5 * (1 - t);
      if (t >= 1) { this.state = 'chase'; this.stateTime = 0; }
      return;
    }

    // knockback slides us backwards and slows down
    this.position.addScaledVector(this.knockback, dt);
    this.knockback.multiplyScalar(Math.exp(-7 * dt));

    const toPlayer = new THREE.Vector3().subVectors(player.position, this.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (dist > 0.001) toPlayer.divideScalar(dist);

    // turn to face Wolverine (slower while winding up so you can dodge round them)
    if (!player.dead && this.stun <= 0) {
      const target = Math.atan2(toPlayer.x, toPlayer.z);
      let diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += diff * Math.min(1, dt * (this.state === 'windup' ? 3 : 10));
    }

    let moving = false;
    switch (this.state) {
      case 'chase':
        if (player.dead || this.stun > 0) break;
        if (dist > this.type.reach * 0.85) {
          this.position.addScaledVector(toPlayer, this.speed * dt);
          moving = true;
        } else if (this.attackCooldown <= 0) {
          this.state = 'windup';
          this.stateTime = 0;
        }
        break;

      case 'windup':
        if (this.stateTime >= this.type.windup) {
          // Swing! Hits if Wolverine is still close and in front of us
          const forward = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
          if (dist < this.type.reach + 0.6 && forward.dot(toPlayer) > 0.3) {
            if (player.takeDamage(this.damage)) {
              this.world.effects.spawnSparks(player.position.clone().setY(1.2), 0xff3030, 6);
            }
          }
          this.state = 'recover';
          this.stateTime = 0;
          this.attackCooldown = 1.0 + Math.random() * 0.6;
        }
        break;

      case 'recover':
        if (this.stateTime > 0.45) { this.state = 'chase'; this.stateTime = 0; }
        break;
    }

    // Don't stand inside other enemies: gently push apart
    for (const o of others) {
      if (o === this || o.dead || o.state === 'spawn') continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.radius;
      if (d < min && d > 0.0001) {
        const push = ((min - d) / d) * 0.5;
        this.position.x += dx * push;
        this.position.z += dz * push;
      }
    }
    // ...and don't stand inside Wolverine either
    if (!player.dead && dist < this.radius + player.radius) {
      this.position.addScaledVector(toPlayer, -(this.radius + player.radius - dist));
    }
    this.world.arena.resolve(this.position, this.radius);

    this.animate(dt, moving);
  }

  animate(dt, moving) {
    this.walkPhase += dt * (moving ? 10 : 0);
    const s = Math.sin(this.walkPhase) * (moving ? 0.6 : 0);
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.body.rotation.x = 0;

    if (this.state === 'windup') {
      // raise both fists overhead - this is your warning to dodge!
      const t = Math.min(1, this.stateTime / this.type.windup);
      this.armL.rotation.x = this.armR.rotation.x = -t * 2.8;
      this.body.rotation.x = -t * 0.2;
    } else if (this.state === 'recover') {
      this.armL.rotation.x = this.armR.rotation.x = -0.9; // fists slammed down in front
      this.body.rotation.x = 0.25;
    } else {
      this.armL.rotation.x = -s * 0.8;
      this.armR.rotation.x = s * 0.8;
    }
    if (this.stun > 0) this.body.rotation.x = -0.3; // reel back when hit

    // white flash when hit, red glow while winding up a punch
    let emissive = 0x000000;
    if (this.flashTimer > 0) emissive = 0xffffff;
    else if (this.state === 'windup') emissive = 0x550000;
    this.setEmissive(emissive);

    this.root.position.set(this.position.x, 0, this.position.z);
    this.root.rotation.y = this.facing;
  }

  animateDeath() {
    // fall backwards, then sink into the floor
    const t = this.stateTime;
    this.setEmissive(t < 0.1 ? 0xffffff : 0x000000);
    this.body.rotation.x = -Math.min(1, t / 0.35) * Math.PI / 2;
    this.root.position.y = t > 0.5 ? -(t - 0.5) * 3 : 0;
    if (t > 1.1) this.remove = true;
  }

  setEmissive(hex) {
    if (this.currentEmissive === hex) return;
    this.currentEmissive = hex;
    for (const m of Object.values(this.mats)) m.emissive.setHex(hex);
  }

  dispose() {
    this.scene.remove(this.root);
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

// ---------------------------------------------------------------------------
// EnemyManager: spawns waves, updates every enemy, removes dead ones.
// ---------------------------------------------------------------------------
export class EnemyManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.reset();
  }

  reset() {
    for (const e of this.list) e.dispose();
    this.list = [];
    this.wave = 0;
    this.queue = [];        // enemies still waiting to spawn this wave
    this.waveActive = false;
    this.breakTimer = 0;    // pause between waves
  }

  get aliveCount() { return this.list.filter((e) => !e.dead).length; }

  startWave(n) {
    this.wave = n;
    const total = 3 + n * 2;                       // wave 1 = 5 enemies, wave 2 = 7, ...
    const brutes = n >= 3 ? Math.floor((n - 1) / 2) : 0;
    this.queue = [];
    for (let i = 0; i < total - brutes; i++) this.queue.push('grunt');
    for (let i = 0; i < brutes; i++) this.queue.splice(Math.floor(this.queue.length * (0.4 + Math.random() * 0.6)), 0, 'brute');
    this.maxAlive = Math.min(5 + n, 14);           // cap how many are on screen at once (phones!)
    this.spawnTimer = 0.8;
    this.waveActive = true;
    this.world.onWaveStart(n);
  }

  update(dt) {
    const player = this.world.player;

    if (this.waveActive) {
      this.spawnTimer -= dt;
      if (this.queue.length > 0 && this.spawnTimer <= 0 && this.aliveCount < this.maxAlive) {
        this.spawn(this.queue.shift());
        this.spawnTimer = 0.45 + Math.random() * 0.4;
      }
      if (this.queue.length === 0 && this.aliveCount === 0) {
        this.waveActive = false;
        this.breakTimer = 3;
        this.world.onWaveCleared(this.wave);
      }
    } else if (this.wave > 0 && !player.dead) {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.startWave(this.wave + 1);
    }

    for (const e of this.list) e.update(dt, player, this.list);

    // remove enemies whose death animation has finished
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].remove) {
        this.list[i].dispose();
        this.list.splice(i, 1);
      }
    }
  }

  spawn(typeName) {
    const pos = this.world.arena.randomSpawnPoint(this.world.player.position, 9);
    this.list.push(new Enemy(this.scene, typeName, pos, this.wave, this.world));
    this.world.effects.spawnRing(pos, 0xa040ff, 2.2, 0.7);
  }
}
