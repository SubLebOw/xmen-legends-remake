// boss.js
// Boss rounds! Every 5th wave one of the Grindchoir's leaders shows up.
// Bosses rotate (Furnace Deacon -> Choirmother -> Rivetjaw -> Deacon again ...) and
// come back tougher each time around. Every attack is telegraphed: red strips on the
// floor for charges, filling red circles for slams, and a glow before summons/volleys.
import * as THREE from 'three';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const VISOR_MAT = new THREE.MeshBasicMaterial({ color: 0xc8ff3a });
const FURNACE_MAT = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
const HALO_MAT = new THREE.MeshBasicMaterial({ color: 0xffb020 });

// The boss line-up. `pattern` is the order they cycle through their attacks.
export const BOSSES = [
  {
    id: 'deacon', name: 'THE FURNACE DEACON', subtitle: 'Keeper of the Melt',
    hp: 650, speed: 3.0, scale: 2.0,
    pattern: ['charge', 'slam', 'summon', 'charge', 'slam'],
    summon: ['acolyte', 'acolyte', 'hound'],
  },
  {
    id: 'choirmother', name: 'CHOIRMOTHER', subtitle: 'Voice of the Grindchoir',
    hp: 600, speed: 2.6, scale: 2.0,
    pattern: ['burst', 'markslam', 'summon', 'burst', 'charge'],
    summon: ['mite', 'mite', 'mite', 'mite', 'spitter'],
  },
  {
    id: 'rivetjaw', name: 'RIVETJAW', subtitle: 'The Scrap Engine',
    hp: 850, speed: 2.8, scale: 1.9,
    pattern: ['triplecharge', 'volley', 'slam', 'summon'],
    summon: ['bulwark', 'acolyte', 'acolyte'],
  },
];

export class Boss {
  // index = which boss (0-2), bossNumber = 1 for the first boss fight, 2 for the second...
  constructor(scene, index, bossNumber, stats, position, world) {
    const def = BOSSES[index];
    this.scene = scene;
    this.world = world;
    this.def = def;
    this.name = def.name;
    this.isBoss = true;
    this.bossNumber = bossNumber;
    this.tier = Math.floor((bossNumber - 1) / BOSSES.length); // how many full loops we've done
    // Tougher every boss fight: more health, more damage, quicker attacks
    this.maxHp = def.hp * (1 + 0.45 * (bossNumber - 1));
    this.hp = this.maxHp;
    this.dmgMult = stats.dmgMult;
    this.tempo = Math.max(0.6, 1 - 0.12 * this.tier); // < 1 = shorter wind-ups
    this.speed = def.speed * (1 + 0.08 * this.tier);
    this.scale = def.scale;
    this.radius = 0.6 * def.scale;
    this.points = 500 * bossNumber;
    this.position = position.clone();
    this.knockback = new THREE.Vector3();
    this.chargeDir = new THREE.Vector3();
    this.facing = 0;
    this.state = 'intro'; // 'intro' | 'chase' | 'telegraph' | 'charging' | 'recover' | 'dead'
    this.stateTime = 0;
    this.chaseTime = 1.5;
    this.patternIndex = 0;
    this.flashTimer = 0;
    this.dead = false;
    this.remove = false;
    this.build();
  }

  get canBeHit() { return !this.dead && this.state !== 'intro'; }

  // ---------- Taking damage ----------
  hit(damage, knockX, knockZ) {
    if (!this.canBeHit) return;
    this.hp -= damage;
    this.flashTimer = 0.08;
    this.knockback.x += knockX * 0.06; // bosses barely budge
    this.knockback.z += knockZ * 0.06;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.state = 'dead';
      this.stateTime = 0;
      this.world.onBossKilled(this);
    }
  }

  // ---------- Brain ----------
  update(dt, player) {
    this.stateTime += dt;
    this.flashTimer -= dt;
    if (this.state === 'dead') { this.animateDeath(dt); return; }

    if (this.state === 'intro') {
      // rise out of the floor, then roar (shake)
      const t = Math.min(1, this.stateTime / 1.5);
      this.root.position.set(this.position.x, -4 * (1 - t), this.position.z);
      if (t >= 1) { this.state = 'chase'; this.stateTime = 0; this.world.shake(0.4); }
      this.animate(dt);
      return;
    }

    this.position.addScaledVector(this.knockback, dt);
    this.knockback.multiplyScalar(Math.exp(-8 * dt));

    const toPlayer = new THREE.Vector3().subVectors(player.position, this.position).setY(0);
    const dist = toPlayer.length();
    if (dist > 0.001) toPlayer.divideScalar(dist);

    switch (this.state) {
      case 'chase':
        this.turnTowards(toPlayer, dt, 4);
        if (!player.dead && dist > this.radius + 1.6) this.position.addScaledVector(toPlayer, this.speed * dt);
        this.chaseTime -= dt;
        if (this.chaseTime <= 0 && !player.dead) this.beginAttack(this.def.pattern[this.patternIndex++ % this.def.pattern.length], player, toPlayer);
        break;

      case 'telegraph':
        if (this.attack !== 'charge' && this.attack !== 'triplecharge') this.turnTowards(toPlayer, dt, 2);
        if (this.stateTime >= this.telegraphTime) this.doAttack(player, toPlayer, dist);
        break;

      case 'charging': {
        const before = this.position.clone().addScaledVector(this.chargeDir, 18 * dt);
        this.position.copy(before);
        this.world.arena.resolve(this.position, this.radius);
        const hitWall = this.position.distanceTo(before) > 0.01;
        if (!this.chargeHit && !player.dead && this.position.distanceTo(player.position) < this.radius + player.radius + 0.2) {
          this.chargeHit = true;
          player.takeDamage(22 * this.dmgMult);
        }
        if (hitWall || this.stateTime > 0.95) {
          if (hitWall) { this.world.shake(0.35); this.world.effects.spawnSparks(this.position.clone().setY(1), 0xffb060, 10); }
          if (this.chargesLeft > 0) this.setupCharge(player, 0.55);
          else this.recover(hitWall ? 1.4 : 0.8); // smashing into a wall dazes it: free hits!
        }
        break;
      }

      case 'recover':
        if (this.stateTime >= this.recoverTime) {
          this.state = 'chase';
          this.stateTime = 0;
          this.chaseTime = (1.0 + Math.random()) * this.tempo;
        }
        break;
    }

    // keep the player from walking through the boss
    const pd = this.position.distanceTo(player.position);
    if (!player.dead && pd < this.radius + player.radius && pd > 0.001) {
      const push = new THREE.Vector3().subVectors(player.position, this.position).setY(0).normalize();
      player.position.addScaledVector(push, this.radius + player.radius - pd);
    }
    this.world.arena.resolve(this.position, this.radius);
    this.animate(dt);
  }

  turnTowards(dir, dt, speed) {
    const target = Math.atan2(dir.x, dir.z);
    const diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
    this.facing += diff * Math.min(1, speed * dt);
  }

  // ---------- Attacks: 1) telegraph ----------
  beginAttack(name, player, toPlayer) {
    this.attack = name;
    this.state = 'telegraph';
    this.stateTime = 0;
    const fx = this.world.effects;
    switch (name) {
      case 'charge':
        this.chargesLeft = 1;
        this.setupCharge(player, 0.9);
        break;
      case 'triplecharge':
        this.chargesLeft = 3;
        this.setupCharge(player, 0.75);
        break;
      case 'slam':
        this.slamRadius = 4.6 + this.tier * 0.4;
        this.telegraphTime = 1.1 * this.tempo;
        fx.spawnWarning(this.position, this.slamRadius, this.telegraphTime);
        break;
      case 'markslam': {
        // three circles: one on the player, two nearby
        this.telegraphTime = 1.2 * this.tempo;
        this.marks = [player.position.clone()];
        for (let i = 0; i < 2 + this.tier; i++) {
          const a = Math.random() * Math.PI * 2;
          this.marks.push(player.position.clone().add(new THREE.Vector3(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2)));
        }
        for (const m of this.marks) fx.spawnWarning(m, 2.6, this.telegraphTime);
        break;
      }
      case 'summon':
        this.telegraphTime = 0.8;
        break;
      case 'burst':
        this.burstsLeft = 2 + this.tier;
        this.telegraphTime = 0.7 * this.tempo;
        break;
      case 'volley':
        this.shotsLeft = 3 + this.tier;
        this.telegraphTime = 0.6 * this.tempo;
        break;
    }
  }

  setupCharge(player, time) {
    this.state = 'telegraph';
    this.stateTime = 0;
    this.chargeDir.subVectors(player.position, this.position).setY(0).normalize();
    this.facing = Math.atan2(this.chargeDir.x, this.chargeDir.z);
    this.telegraphTime = time * this.tempo;
    this.world.effects.spawnLine(this.position, this.chargeDir, 17, this.radius * 2, this.telegraphTime);
  }

  // ---------- Attacks: 2) the hit itself ----------
  doAttack(player, toPlayer, dist) {
    const fx = this.world.effects;
    switch (this.attack) {
      case 'charge':
      case 'triplecharge':
        this.state = 'charging';
        this.stateTime = 0;
        this.chargeHit = false;
        this.chargesLeft--;
        return;

      case 'slam':
        if (dist < this.slamRadius + player.radius) player.takeDamage(26 * this.dmgMult);
        fx.spawnRing(this.position, 0xff5a20, this.slamRadius, 0.5);
        fx.spawnSparks(this.position.clone().setY(0.3), 0xffb060, 14, 8);
        this.world.shake(0.5);
        this.recover(0.9);
        return;

      case 'markslam': {
        let hit = false;
        for (const m of this.marks) {
          if (!hit && m.distanceTo(player.position) < 2.6 + player.radius) { player.takeDamage(18 * this.dmgMult); hit = true; }
          fx.spawnRing(m, 0xffb020, 2.6, 0.4);
        }
        this.world.shake(0.3);
        this.recover(0.6);
        return;
      }

      case 'summon': {
        const extra = Math.min(3, this.tier + Math.floor((this.bossNumber - 1) / 2));
        const list = [...this.def.summon];
        for (let i = 0; i < extra; i++) list.push(this.def.summon[i % this.def.summon.length]);
        for (const type of list) {
          const a = Math.random() * Math.PI * 2;
          const pos = this.position.clone().add(new THREE.Vector3(Math.cos(a) * 3.5, 0, Math.sin(a) * 3.5));
          this.world.enemies.spawnAt(type, pos);
        }
        this.recover(0.6);
        return;
      }

      case 'burst': {
        // ring of bolts in every direction, rotated a bit each time
        const n = 12 + this.tier * 2;
        const offset = this.burstsLeft * 0.26;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + offset;
          this.world.projectiles.fire(this.position.clone().setY(1.6), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 7, 10 * this.dmgMult, 0xffb020, 1.3);
        }
        this.burstsLeft--;
        if (this.burstsLeft > 0) { this.stateTime = 0; this.telegraphTime = 0.55 * this.tempo; }
        else this.recover(0.7);
        return;
      }

      case 'volley': {
        // fan of 5 bolts aimed at the player
        for (let i = -2; i <= 2; i++) {
          const a = Math.atan2(toPlayer.z, toPlayer.x) + i * 0.22;
          this.world.projectiles.fire(this.position.clone().setY(1.4), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 9, 10 * this.dmgMult, 0xff8a1e, 1.2);
        }
        this.shotsLeft--;
        if (this.shotsLeft > 0) { this.stateTime = 0; this.telegraphTime = 0.4 * this.tempo; }
        else this.recover(0.7);
        return;
      }
    }
  }

  recover(time) {
    this.state = 'recover';
    this.stateTime = 0;
    this.recoverTime = time;
  }

  // ---------- Looks ----------
  build() {
    this.mats = {
      main: new THREE.MeshLambertMaterial({ color: 0x7a3418 }),
      dark: new THREE.MeshLambertMaterial({ color: 0x2a2623 }),
      mask: new THREE.MeshLambertMaterial({ color: 0xd8cfb8 }),
    };
    const { main, dark, mask } = this.mats;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const part = (parent, mat, w, h, d, x, y, z, shadow = true) => {
      const m = new THREE.Mesh(UNIT_BOX, mat);
      m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = shadow;
      parent.add(m); return m;
    };
    const group = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    if (this.def.id === 'deacon') {
      // hulking furnace-bellied priest with chimney shoulders and hammer fists
      for (const x of [0.3, -0.3]) part(this.body, dark, 0.38, 0.85, 0.42, x, 0.42, 0);
      part(this.body, main, 1.15, 0.95, 0.75, 0, 1.3, 0);
      part(this.body, FURNACE_MAT, 0.55, 0.38, 0.04, 0, 1.2, 0.39, false); // glowing furnace
      for (const y of [1.1, 1.2, 1.3]) part(this.body, dark, 0.6, 0.04, 0.05, 0, y, 0.41, false); // grill bars
      for (const x of [0.45, -0.45]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.6, 8), dark);
        c.position.set(x, 2.0, -0.15); c.castShadow = true; this.body.add(c);
      }
      part(this.body, mask, 0.5, 0.5, 0.5, 0, 2.0, 0.05);
      part(this.body, VISOR_MAT, 0.36, 0.08, 0.03, 0, 2.02, 0.31, false);
      this.armL = group(this.body, 0.72, 1.65, 0);
      this.armR = group(this.body, -0.72, 1.65, 0);
      for (const a of [this.armL, this.armR]) {
        part(a, dark, 0.3, 0.75, 0.3, 0, -0.38, 0);
        part(a, main, 0.5, 0.45, 0.5, 0, -0.9, 0); // hammer fist
      }
    } else if (this.def.id === 'choirmother') {
      // tall robed figure with a bell-shaped mask and a spinning amber halo
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 8), dark);
      robe.position.y = 0.9; robe.castShadow = true; this.body.add(robe);
      part(this.body, main, 0.62, 0.55, 0.42, 0, 1.85, 0);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.38, 0.55, 8), mask);
      bell.position.y = 2.38; bell.castShadow = true; this.body.add(bell);
      part(this.body, VISOR_MAT, 0.3, 0.07, 0.03, 0, 2.32, 0.31, false);
      this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 28), HALO_MAT);
      this.halo.position.set(0, 2.45, -0.3);
      this.body.add(this.halo);
      this.armL = group(this.body, 0.42, 2.0, 0);
      this.armR = group(this.body, -0.42, 2.0, 0);
      for (const a of [this.armL, this.armR]) {
        part(a, dark, 0.14, 0.9, 0.14, 0, -0.45, 0);
        part(a, mask, 0.12, 0.3, 0.2, 0, -1.0, 0.05); // long bone fingers
      }
    } else {
      // Rivetjaw: a low, wide scrap crab that's mostly jaw
      part(this.body, main, 1.6, 0.7, 1.2, 0, 0.95, 0);
      part(this.body, dark, 1.65, 0.12, 1.25, 0, 1.3, 0);
      for (const [x, z] of [[0.6, 0.45], [-0.6, 0.45], [0.6, -0.45], [-0.6, -0.45]]) {
        part(this.body, dark, 0.3, 0.7, 0.3, x, 0.35, z);
        part(this.body, dark, 0.08, 0.08, 0.08, x * 1.2, 1.15, z * 1.3, false); // rivets
      }
      part(this.body, main, 1.3, 0.3, 0.55, 0, 1.2, 0.8);           // upper jaw
      for (let i = -2; i <= 2; i++) part(this.body, mask, 0.12, 0.18, 0.1, i * 0.25, 1.0, 1.05, false); // teeth
      this.jaw = group(this.body, 0, 0.9, 0.55);
      part(this.jaw, dark, 1.2, 0.22, 0.55, 0, -0.05, 0.25);         // lower jaw (opens)
      for (let i = -2; i <= 2; i++) part(this.jaw, mask, 0.12, 0.16, 0.1, i * 0.25, 0.12, 0.48, false);
      for (const x of [0.35, -0.35]) part(this.body, VISOR_MAT, 0.22, 0.1, 0.22, x, 1.4, 0.55, false); // eyes
      for (const x of [0.4, -0.4]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8), dark);
        pipe.position.set(x, 1.6, -0.45); pipe.rotation.x = -0.4; this.body.add(pipe);
      }
    }

    this.root.scale.setScalar(this.scale);
    this.root.position.set(this.position.x, -4, this.position.z);
    this.scene.add(this.root);
  }

  animate(dt) {
    const t = performance.now() / 1000;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0;
    let glow = 0x000000;

    if (this.state === 'telegraph') {
      const k = Math.min(1, this.stateTime / this.telegraphTime);
      glow = (Math.floor(k * 10) % 2 === 0) ? 0x662200 : 0x331100; // pulsing warning glow
      if (this.attack === 'slam') this.body.rotation.x = -0.25 * k;  // rear back
      if (this.attack.includes('charge')) this.body.rotation.x = 0.2 * k; // lean in
      if (this.armL) { const a = this.attack === 'slam' || this.attack === 'markslam' ? -2.6 * k : -1.2 * k; this.armL.rotation.x = this.armR.rotation.x = a; }
      if (this.jaw) this.jaw.rotation.x = 0.5 * k;
    } else if (this.state === 'charging') {
      this.body.rotation.x = 0.3;
      this.body.position.y = Math.abs(Math.sin(t * 20)) * 0.1;
      if (this.armL) this.armL.rotation.x = this.armR.rotation.x = 0.8;
      if (this.jaw) this.jaw.rotation.x = 0.6;
    } else if (this.state === 'recover') {
      this.body.rotation.x = 0.15;
      if (this.armL) this.armL.rotation.x = this.armR.rotation.x = -0.5;
      if (this.jaw) this.jaw.rotation.x = 0.1;
    } else {
      // walking sway
      this.body.rotation.z = Math.sin(t * 5) * 0.05;
      if (this.armL) { this.armL.rotation.x = Math.sin(t * 5) * 0.4; this.armR.rotation.x = -Math.sin(t * 5) * 0.4; }
      if (this.jaw) this.jaw.rotation.x = 0.1 + Math.sin(t * 6) * 0.08;
    }
    if (this.def.id === 'choirmother') this.body.position.y += 0.15 + Math.sin(t * 2) * 0.1; // she floats
    if (this.halo) this.halo.rotation.z += dt * 3;
    if (this.flashTimer > 0) glow = 0xffffff;
    this.setEmissive(glow);

    if (this.state !== 'intro') this.root.position.set(this.position.x, 0, this.position.z);
    this.root.rotation.y = this.facing;
  }

  animateDeath(dt) {
    // shudder, spray sparks, then sink
    const t = this.stateTime;
    this.setEmissive(Math.floor(t * 12) % 2 ? 0xffffff : 0x662200);
    this.root.position.x = this.position.x + (Math.random() - 0.5) * 0.2;
    if (Math.random() < 0.3) this.world.effects.spawnSparks(this.position.clone().setY(1.5 + Math.random() * 2), 0xffb060, 3, 7);
    if (t > 1.0) this.root.position.y = -(t - 1.0) * 3;
    if (t > 2.2) this.remove = true;
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
