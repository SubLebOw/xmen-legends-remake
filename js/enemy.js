// enemy.js
// The Grindchoir: a machine cult of scrap-built drones with bone-white masks and
// acid-green visors. This file defines every regular enemy type, how they look,
// and how they behave. (Bosses live in boss.js, waves in waves.js.)
import * as THREE from 'three';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1); // shared by every enemy body part
const VISOR_MAT = new THREE.MeshBasicMaterial({ color: 0xc8ff3a });  // acid-green glow
const ELITE_VISOR_MAT = new THREE.MeshBasicMaterial({ color: 0xffb020 }); // elites glow amber
const SPIT_MAT = new THREE.MeshBasicMaterial({ color: 0xff8a1e });   // spitter's molten tank

// Every enemy type. Numbers here are for wave 1; waves.js multiplies them as waves climb.
//   ai: 'melee'  = walk up, raise fists, swing
//       'lunge'  = crouch, then leap at you
//       'ranged' = keep distance and spit dodgeable molten bolts
export const ENEMY_TYPES = {
  acolyte:  { hp: 30,  speed: 3.4, damage: 8,  scale: 1.0,  windup: 0.45, reach: 1.5, armored: false, points: 10, ai: 'melee',  main: 0x8a3b1e, dark: 0x3a3430 },
  hound:    { hp: 22,  speed: 5.4, damage: 9,  scale: 0.9,  windup: 0.45, reach: 5.5, armored: false, points: 15, ai: 'lunge',  main: 0xa4521f, dark: 0x2e2a27 },
  spitter:  { hp: 26,  speed: 2.8, damage: 9,  scale: 0.95, windup: 0.6,  reach: 10,  armored: false, points: 20, ai: 'ranged', main: 0x5f6b2a, dark: 0x2c2a22 },
  bulwark:  { hp: 100, speed: 2.4, damage: 16, scale: 1.45, windup: 0.75, reach: 2.0, armored: true,  points: 40, ai: 'melee',  main: 0x5a2a16, dark: 0x24201d },
  splitter: { hp: 40,  speed: 3.0, damage: 8,  scale: 1.1,  windup: 0.5,  reach: 1.6, armored: false, points: 20, ai: 'melee',  main: 0x9b6a1c, dark: 0x33291c, splits: 3 },
  mite:     { hp: 8,   speed: 5.2, damage: 4,  scale: 0.5,  windup: 0.3,  reach: 1.1, armored: false, points: 3,  ai: 'melee',  main: 0xc08a2a, dark: 0x33291c },
};

export class Enemy {
  // stats = { hpMult, dmgMult, speedMult, elite } from waves.js
  constructor(scene, typeName, position, stats, world) {
    const type = ENEMY_TYPES[typeName];
    this.scene = scene;
    this.world = world;
    this.type = type;
    this.typeName = typeName;
    this.elite = !!stats.elite;
    const eliteHp = this.elite ? 2.2 : 1, eliteDmg = this.elite ? 1.35 : 1;
    this.maxHp = type.hp * stats.hpMult * eliteHp;
    this.hp = this.maxHp;
    this.speed = type.speed * stats.speedMult * (0.9 + Math.random() * 0.2);
    this.damage = type.damage * stats.dmgMult * eliteDmg;
    this.scale = type.scale * (this.elite ? 1.3 : 1);
    this.radius = 0.5 * this.scale;
    this.points = type.points * (this.elite ? 3 : 1);
    this.position = position.clone();
    this.knockback = new THREE.Vector3();
    this.lungeDir = new THREE.Vector3();
    this.facing = 0;
    this.state = 'spawn'; // 'spawn' | 'chase' | 'windup' | 'lunge' | 'recover' | 'dead'
    this.stateTime = 0;
    this.attackCooldown = 0.6 + Math.random() * 0.8;
    this.flashTimer = 0;
    this.stun = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.walkPhase = Math.random() * 10;
    this.dead = false;
    this.remove = false; // the wave manager deletes us when this becomes true
    this.isBoss = false;

    this.buildModel();
  }

  // Can the player hit this enemy right now?
  get canBeHit() { return !this.dead && this.state !== 'spawn'; }

  buildModel() {
    // Each enemy gets its own materials so it can flash white on its own
    this.mats = {
      main: new THREE.MeshLambertMaterial({ color: this.type.main }),
      dark: new THREE.MeshLambertMaterial({ color: this.type.dark }),
      mask: new THREE.MeshLambertMaterial({ color: 0xd8cfb8 }), // bone-white mask
    };
    const visor = this.elite ? ELITE_VISOR_MAT : VISOR_MAT;
    const { main, dark, mask } = this.mats;
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
    const limb = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); this.body.add(g); return g; };

    if (this.typeName === 'hound') {
      // Four-legged scrap hound with a long snout
      part(this.body, main, 0.6, 0.45, 1.2, 0, 0.75, 0);
      part(this.body, dark, 0.5, 0.15, 0.9, 0, 1.02, -0.05);           // spine plates
      part(this.body, mask, 0.4, 0.35, 0.5, 0, 0.9, 0.75);             // masked head
      part(this.body, visor, 0.32, 0.06, 0.03, 0, 0.95, 1.01, false);
      part(this.body, dark, 0.06, 0.06, 0.5, 0, 1.05, -0.8).rotation.x = -0.6; // tail antenna
      this.legs = [];
      for (const [x, z] of [[0.22, 0.4], [-0.22, 0.4], [0.22, -0.4], [-0.22, -0.4]]) {
        const g = limb(x, 0.6, z);
        part(g, dark, 0.14, 0.6, 0.14, 0, -0.3, 0);
        this.legs.push(g);
      }
    } else if (this.typeName === 'mite') {
      // Tiny skittering drone
      part(this.body, main, 0.8, 0.5, 0.8, 0, 0.6, 0);
      part(this.body, mask, 0.5, 0.3, 0.1, 0, 0.65, 0.42, false);
      part(this.body, visor, 0.4, 0.08, 0.03, 0, 0.67, 0.48, false);
      this.legs = [];
      for (const [x, z] of [[0.45, 0.3], [-0.45, 0.3], [0.45, -0.3], [-0.45, -0.3]]) {
        const g = limb(x, 0.5, z);
        part(g, dark, 0.12, 0.5, 0.12, 0, -0.25, 0);
        this.legs.push(g);
      }
    } else {
      // Humanoid cultists: acolyte, spitter, bulwark, splitter
      this.legL = limb(0.2, 0.8, 0);
      this.legR = limb(-0.2, 0.8, 0);
      part(this.legL, dark, 0.3, 0.8, 0.32, 0, -0.4, 0);
      part(this.legR, dark, 0.3, 0.8, 0.32, 0, -0.4, 0);
      part(this.body, main, 0.78, 0.75, 0.48, 0, 1.2, 0);           // rusty torso
      part(this.body, dark, 0.84, 0.12, 0.52, 0, 1.0, 0);            // waist band
      part(this.body, mask, 0.42, 0.44, 0.4, 0, 1.92, 0);            // bone mask head
      part(this.body, visor, 0.3, 0.07, 0.03, 0, 1.95, 0.21, false); // glowing visor
      part(this.body, dark, 0.5, 0.06, 0.5, 0, 2.17, 0);             // hood rim
      part(this.body, main, 0.06, 0.3, 0.06, 0.14, 2.32, 0);         // antenna "choir pipes"
      part(this.body, main, 0.06, 0.4, 0.06, -0.12, 2.37, -0.04);
      this.armL = limb(0.52, 1.52, 0);
      this.armR = limb(-0.52, 1.52, 0);
      for (const a of [this.armL, this.armR]) {
        part(a, dark, 0.22, 0.6, 0.24, 0, -0.32, 0);
        part(a, main, 0.3, 0.28, 0.3, 0, -0.72, 0); // scrap fist
      }
      if (this.typeName === 'bulwark') {
        part(this.body, dark, 1.2, 0.3, 0.62, 0, 1.6, 0);          // huge shoulder plate
        part(this.armL, dark, 0.12, 0.9, 0.7, 0.18, -0.55, 0.05);   // scrap shield
      } else if (this.typeName === 'spitter') {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 8), SPIT_MAT);
        tank.position.set(0, 1.45, -0.38);
        tank.rotation.x = 0.3;
        this.body.add(tank);
        part(this.body, dark, 0.12, 0.12, 0.3, 0, 1.75, 0.3);       // nozzle by the mouth
      } else if (this.typeName === 'splitter') {
        for (const [x, y] of [[0.25, 1.45], [-0.25, 1.45], [0, 1.15]]) {
          part(this.body, main, 0.3, 0.3, 0.3, x, y, -0.36);        // pods that become mites
        }
      }
    }

    if (this.elite) {
      // spiky amber crown so elites are easy to spot
      const crownY = this.typeName === 'hound' ? 1.15 : this.typeName === 'mite' ? 0.9 : 2.25;
      const crownZ = this.typeName === 'hound' ? 0.7 : 0;
      for (const x of [-0.18, 0, 0.18]) part(this.body, ELITE_VISOR_MAT, 0.08, 0.25, 0.08, x, crownY, crownZ, false);
    }

    this.root.scale.setScalar(this.scale);
    this.root.position.set(this.position.x, -2.5, this.position.z); // start underground
    this.scene.add(this.root);
  }

  // Called by the player's attacks
  hit(damage, knockX, knockZ, heavy) {
    if (!this.canBeHit) return;
    this.hp -= damage;
    this.flashTimer = 0.1;
    const resist = this.type.armored ? 0.4 : (this.elite ? 0.7 : 1);
    this.knockback.x += knockX * resist;
    this.knockback.z += knockZ * resist;
    // Light hits interrupt most enemies; armoured ones only flinch from heavy hits
    if (!this.type.armored || heavy) {
      this.stun = 0.3;
      if (this.state === 'windup') { this.state = 'chase'; this.stateTime = 0; }
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
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

    // turn to face the player (slower while winding up, so you can dodge round them)
    if (!player.dead && this.stun <= 0 && this.state !== 'lunge') {
      const target = Math.atan2(toPlayer.x, toPlayer.z);
      const diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += diff * Math.min(1, dt * (this.state === 'windup' ? 3 : 10));
    }

    let moving = false;
    const ai = this.type.ai;
    switch (this.state) {
      case 'chase':
        if (player.dead || this.stun > 0) break;
        if (ai === 'ranged') {
          // keep a comfortable distance and circle around
          if (dist > 8) this.position.addScaledVector(toPlayer, this.speed * dt);
          else if (dist < 5) this.position.addScaledVector(toPlayer, -this.speed * dt);
          else this.position.add(new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(this.strafe * this.speed * 0.5 * dt));
          moving = true;
          if (this.attackCooldown <= 0 && dist < this.type.reach) { this.state = 'windup'; this.stateTime = 0; }
        } else if (dist > this.type.reach * 0.85 || (ai === 'lunge' && this.attackCooldown > 0)) {
          if (!(ai === 'lunge' && dist < 1.4)) {
            this.position.addScaledVector(toPlayer, this.speed * dt);
            moving = true;
          }
        } else if (this.attackCooldown <= 0) {
          this.state = 'windup';
          this.stateTime = 0;
        }
        break;

      case 'windup':
        if (this.stateTime >= this.type.windup) this.attack(player, dist, toPlayer);
        break;

      case 'lunge':
        // hound leaping through the air
        this.position.addScaledVector(this.lungeDir, 15 * dt);
        if (!this.lungeHit && this.position.distanceTo(player.position) < this.radius + player.radius + 0.35) {
          this.lungeHit = true;
          player.takeDamage(this.damage);
        }
        if (this.stateTime > 0.32) { this.state = 'recover'; this.stateTime = 0; }
        break;

      case 'recover':
        if (this.stateTime > (ai === 'lunge' ? 0.7 : 0.45)) { this.state = 'chase'; this.stateTime = 0; }
        break;
    }

    // Don't stand inside other enemies: gently push apart
    for (const o of others) {
      if (o === this || o.dead || o.state === 'spawn' || o.isBoss) continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.radius;
      if (d < min && d > 0.0001) {
        const push = ((min - d) / d) * 0.5;
        this.position.x += dx * push;
        this.position.z += dz * push;
      }
    }
    // ...and don't stand inside the player either
    const pd = this.position.distanceTo(player.position);
    if (!player.dead && pd < this.radius + player.radius && this.state !== 'lunge') {
      this.position.addScaledVector(toPlayer, -(this.radius + player.radius - pd));
    }
    this.world.arena.resolve(this.position, this.radius);

    this.animate(dt, moving);
  }

  // The moment the wind-up finishes
  attack(player, dist, toPlayer) {
    const ai = this.type.ai;
    if (ai === 'lunge') {
      this.state = 'lunge';
      this.lungeDir.copy(toPlayer);
      this.lungeHit = false;
      this.attackCooldown = 1.8 + Math.random() * 0.8;
    } else if (ai === 'ranged') {
      // spit a slow molten bolt: blink through it or step aside
      const from = this.position.clone().setY(1.6 * this.scale);
      this.world.projectiles.fire(from, toPlayer, 8.5, this.damage, 0xff8a1e, this.elite ? 1.4 : 1);
      this.state = 'recover';
      this.attackCooldown = 2.0 + Math.random() * 0.8;
    } else {
      // melee swing: hits if the player is still close and in front of us
      const forward = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
      if (dist < this.type.reach * (this.elite ? 1.2 : 1) + 0.6 && forward.dot(toPlayer) > 0.3) {
        if (player.takeDamage(this.damage)) {
          this.world.effects.spawnSparks(player.position.clone().setY(1.2), 0xff3030, 6);
        }
      }
      this.state = 'recover';
      this.attackCooldown = 1.0 + Math.random() * 0.6;
    }
    this.stateTime = 0;
  }

  animate(dt, moving) {
    this.walkPhase += dt * (moving ? 11 : 0);
    const s = Math.sin(this.walkPhase) * (moving ? 0.6 : 0);
    this.body.rotation.x = 0;
    this.body.position.y = 0;

    if (this.legs) {
      // hounds and mites: four legs
      this.legs.forEach((l, i) => { l.rotation.x = (i % 2 === 0 ? s : -s) * 1.2; });
      if (this.state === 'windup') { this.body.position.y = -0.2; this.body.rotation.x = -0.25; } // crouch
      if (this.state === 'lunge') { this.body.position.y = 0.4; this.body.rotation.x = 0.3; }     // airborne
    } else {
      this.legL.rotation.x = s;
      this.legR.rotation.x = -s;
      if (this.state === 'windup') {
        // raise fists overhead (or rear back to spit) - your warning to dodge!
        const t = Math.min(1, this.stateTime / this.type.windup);
        this.armL.rotation.x = this.armR.rotation.x = -t * (this.type.ai === 'ranged' ? 1.2 : 2.8);
        this.body.rotation.x = -t * 0.25;
      } else if (this.state === 'recover') {
        this.armL.rotation.x = this.armR.rotation.x = -0.9;
        this.body.rotation.x = 0.25;
      } else {
        this.armL.rotation.x = -s * 0.8;
        this.armR.rotation.x = s * 0.8;
      }
    }
    if (this.stun > 0) this.body.rotation.x = -0.3; // reel back when hit

    // white flash when hit, red glow while winding up an attack
    let emissive = this.elite ? 0x2a1500 : 0x000000;
    if (this.flashTimer > 0) emissive = 0xffffff;
    else if (this.state === 'windup') emissive = 0x661100;
    this.setEmissive(emissive);

    this.root.position.set(this.position.x, 0, this.position.z);
    this.root.rotation.y = this.facing;
  }

  animateDeath() {
    // topple over, then sink into the floor
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
