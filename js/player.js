// player.js
// Wolverine! Builds his blocky 3D model, moves him around, and handles his attacks:
//   - 3-hit claw combo (J / click / SLASH)
//   - dash lunge that is invincible and hurts enemies you pass through (K / Space / DASH)
//   - berserker spin attack with a cooldown (L / BERSERK)
//   - healing factor: health slowly comes back by itself
import * as THREE from 'three';

// The camera looks at the arena from the +X/+Z corner. These are the floor directions
// that match "up the screen" and "right on the screen", so W always moves up the screen.
const SCREEN_UP = new THREE.Vector3(-1, 0, -1).normalize();
const SCREEN_RIGHT = new THREE.Vector3(1, 0, -1).normalize();

// The three hits of the claw combo. Tweak these numbers to change how it feels!
const COMBO = [
  { damage: 12, knockback: 6, range: 2.4, duration: 0.24 }, // hit 1: one arm
  { damage: 12, knockback: 6, range: 2.4, duration: 0.24 }, // hit 2: other arm
  { damage: 28, knockback: 14, range: 2.9, duration: 0.40 }, // hit 3: big double-claw finisher
];

const MOVE_SPEED = 7;
const DASH_SPEED = 24;
const DASH_TIME = 0.2;
const DASH_COOLDOWN = 0.9;
const SPIN_TIME = 1.6;
const SPIN_COOLDOWN = 8;

export class Player {
  constructor(scene, world) {
    this.world = world; // gives access to enemies, effects, the arena, etc.
    this.maxHp = 100;
    this.radius = 0.5;
    this.dashCooldownMax = DASH_COOLDOWN;
    this.spinCooldownMax = SPIN_COOLDOWN;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    this.model = buildWolverine();
    scene.add(this.model.root);

    // White arc that shows the claw swipe
    this.slashArc = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 2.5, 20, 1, -Math.PI / 2 - Math.PI * 0.45, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.slashArc.rotation.x = -Math.PI / 2;
    this.slashArc.position.y = 1.1;
    this.model.root.add(this.slashArc);

    // Red ring that spins around Wolverine during the berserker attack
    this.spinRing = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 3.2, 24, 1, 0, Math.PI * 1.5),
      new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.spinRing.rotation.x = -Math.PI / 2;
    this.spinRing.position.y = 0.9;
    this.spinRing.visible = false;
    this.model.root.add(this.spinRing);

    this.reset();
  }

  // Put Wolverine back to full health in the middle of the arena
  reset() {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.facing = Math.PI / 4; // angle he faces (radians). PI/4 = towards the camera
    this.hp = this.maxHp;
    this.state = 'normal';     // 'normal' | 'attack' | 'dash' | 'spin' | 'dead'
    this.stateTime = 0;
    this.comboStep = 0;
    this.comboGrace = 0;       // short window after a hit where the next press continues the combo
    this.attackBuffer = 0;     // remembers an attack press for a moment so combos feel responsive
    this.dashCooldown = 0;
    this.spinCooldown = 0;
    this.hurtTimer = 0;
    this.timeSinceHit = 99;
    this.walkPhase = 0;
    this.dead = false;
    this.model.body.rotation.set(0, 0, 0);
    this.model.body.position.set(0, 0, 0);
    this.spinRing.visible = false;
    this.slashArc.material.opacity = 0;
    this.setFlash(0x000000);
    this.syncModel();
  }

  get facingDir() { return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  update(dt, input) {
    if (this.dead) { this.animateDeath(dt); return; }

    // ----- Timers -----
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.spinCooldown = Math.max(0, this.spinCooldown - dt);
    this.comboGrace -= dt;
    this.attackBuffer -= dt;
    this.hurtTimer -= dt;
    this.timeSinceHit += dt;

    // ----- Healing factor: slow regen, faster if you avoid getting hit for 3 seconds -----
    const regen = this.timeSinceHit > 3 ? 5 : 1.5;
    this.hp = Math.min(this.maxHp, this.hp + regen * dt);

    // ----- Turn joystick/keys into a direction on the floor -----
    const move = input.getMove();
    const dir = new THREE.Vector3()
      .addScaledVector(SCREEN_RIGHT, move.x)
      .addScaledVector(SCREEN_UP, move.y);
    const moving = dir.lengthSq() > 0.0001;

    if (input.wasPressed('attack')) this.attackBuffer = 0.3;
    if (input.attackHeld) this.attackBuffer = Math.max(this.attackBuffer, 0.05);

    // Dash and spin can interrupt normal movement or attacks
    if (input.wasPressed('dash') && this.dashCooldown <= 0 && (this.state === 'normal' || this.state === 'attack')) {
      this.startDash(moving ? dir.clone().normalize() : this.facingDir);
    }
    if (input.wasPressed('spin') && this.spinCooldown <= 0 && this.state !== 'dash' && this.state !== 'spin') {
      this.startSpin();
    }

    this.stateTime += dt;
    this.velocity.set(0, 0, 0);

    switch (this.state) {
      case 'normal':
        if (moving) {
          this.velocity.copy(dir).multiplyScalar(MOVE_SPEED);
          this.turnTowards(Math.atan2(dir.x, dir.z), dt, 20);
        }
        if (this.attackBuffer > 0) {
          this.startAttack(this.comboGrace > 0 && this.comboStep < 3 ? this.comboStep + 1 : 1, moving ? dir : null);
        }
        break;

      case 'attack': {
        const hit = COMBO[this.comboStep - 1];
        const t = this.stateTime / hit.duration;
        // small step forward at the start of each swing, and slow steering
        if (t < 0.4) this.velocity.copy(this.facingDir).multiplyScalar(this.comboStep === 3 ? 6 : 4);
        if (moving) this.velocity.addScaledVector(dir, MOVE_SPEED * 0.25);
        if (!this.hasHit && t >= 0.45) { this.hasHit = true; this.doSlashHit(hit); }
        if (this.attackBuffer > 0 && this.comboStep < 3 && t >= 0.6) {
          this.startAttack(this.comboStep + 1, moving ? dir : null);
        } else if (t >= 1) {
          this.state = 'normal';
          this.comboGrace = 0.35;
          if (this.comboStep >= 3) this.comboStep = 0; // after the finisher, start over at hit 1
        }
        break;
      }

      case 'dash':
        this.velocity.copy(this.dashDir).multiplyScalar(DASH_SPEED);
        this.dashHits();
        if (this.stateTime >= DASH_TIME) this.state = 'normal';
        break;

      case 'spin':
        if (moving) this.velocity.copy(dir).multiplyScalar(MOVE_SPEED * 0.75);
        this.spinTick -= dt;
        if (this.spinTick <= 0) { this.spinTick = 0.15; this.spinHits(); }
        if (this.stateTime >= SPIN_TIME) {
          this.state = 'normal';
          this.spinRing.visible = false;
          this.model.body.rotation.y = 0;
        }
        break;
    }

    // ----- Move and collide -----
    this.position.addScaledVector(this.velocity, dt);
    this.world.arena.resolve(this.position, this.radius);

    this.animate(dt);
    this.syncModel();
  }

  // Smoothly rotate to face an angle
  turnTowards(target, dt, speed) {
    let diff = target - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way round
    this.facing += diff * Math.min(1, speed * dt);
  }

  // ---------- Attacks ----------

  startAttack(step, moveDir) {
    this.state = 'attack';
    this.comboStep = step;
    this.stateTime = 0;
    this.hasHit = false;
    this.attackBuffer = 0;
    // Aim assist: face the movement direction, but snap onto a nearby enemy if there is one
    if (moveDir) this.facing = Math.atan2(moveDir.x, moveDir.z);
    const target = this.findNearestEnemy(moveDir ? 3.5 : 4.5);
    if (target) {
      const angle = Math.atan2(target.position.x - this.position.x, target.position.z - this.position.z);
      const off = Math.abs(Math.atan2(Math.sin(angle - this.facing), Math.cos(angle - this.facing)));
      if (!moveDir || off < Math.PI / 3) this.facing = angle;
    }
  }

  doSlashHit(hit) {
    const forward = this.facingDir;
    let hitSomething = false;
    for (const e of this.world.enemies.list) {
      if (!e.canBeHit) continue;
      const to = new THREE.Vector3().subVectors(e.position, this.position);
      to.y = 0;
      const dist = to.length();
      if (dist > hit.range + e.radius) continue;
      to.normalize();
      // only hit enemies in front of us (about 140 degree arc), or really close ones
      if (forward.dot(to) < 0.35 && dist > 1) continue;
      e.hit(hit.damage, to.x * hit.knockback, to.z * hit.knockback, this.comboStep === 3);
      this.world.effects.spawnSparks(e.position.clone().setY(1.1), 0xfff2a0, this.comboStep === 3 ? 12 : 6);
      hitSomething = true;
    }
    if (hitSomething) {
      this.world.shake(this.comboStep === 3 ? 0.35 : 0.15);
      this.world.hitstop(this.comboStep === 3 ? 0.08 : 0.03);
    }
  }

  startDash(direction) {
    this.state = 'dash';
    this.stateTime = 0;
    this.dashDir = direction.clone();
    this.facing = Math.atan2(direction.x, direction.z);
    this.dashCooldown = DASH_COOLDOWN;
    this.dashHitSet = new Set();
    this.world.effects.spawnRing(this.position, 0x6fa8ff, 1.5, 0.3);
  }

  dashHits() {
    for (const e of this.world.enemies.list) {
      if (!e.canBeHit || this.dashHitSet.has(e)) continue;
      if (e.position.distanceTo(this.position) < 1.3 + e.radius) {
        this.dashHitSet.add(e);
        // knock enemies off to the side of the dash path
        const side = new THREE.Vector3(-this.dashDir.z, 0, this.dashDir.x);
        if (side.dot(new THREE.Vector3().subVectors(e.position, this.position)) < 0) side.negate();
        e.hit(10, side.x * 7, side.z * 7, false);
        this.world.effects.spawnSparks(e.position.clone().setY(1.1), 0x9fd0ff, 6);
        this.world.shake(0.12);
      }
    }
  }

  startSpin() {
    this.state = 'spin';
    this.stateTime = 0;
    this.spinTick = 0;
    this.spinCooldown = SPIN_COOLDOWN;
    this.spinRing.visible = true;
    this.world.effects.spawnRing(this.position, 0xff4020, 4, 0.5);
    this.world.shake(0.25);
  }

  spinHits() {
    for (const e of this.world.enemies.list) {
      if (!e.canBeHit) continue;
      const to = new THREE.Vector3().subVectors(e.position, this.position);
      to.y = 0;
      const dist = to.length();
      if (dist < 3.2 + e.radius) {
        to.normalize();
        e.hit(8, to.x * 7, to.z * 7, true);
        this.world.effects.spawnSparks(e.position.clone().setY(1.1), 0xff8040, 4);
      }
    }
  }

  findNearestEnemy(maxDist) {
    let best = null, bestDist = maxDist;
    for (const e of this.world.enemies.list) {
      if (!e.canBeHit) continue;
      const d = e.position.distanceTo(this.position);
      if (d < bestDist) { best = e; bestDist = d; }
    }
    return best;
  }

  // ---------- Getting hurt ----------

  takeDamage(amount) {
    if (this.dead || this.state === 'dash') return false; // dashing = invincible
    if (this.state === 'spin') amount *= 0.5;             // berserker rage = tougher
    this.hp -= amount;
    this.hurtTimer = 0.15;
    this.timeSinceHit = 0;
    this.world.onPlayerHurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.state = 'dead';
      this.stateTime = 0;
      this.spinRing.visible = false;
      this.slashArc.material.opacity = 0;
    }
    return true;
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  // ---------- Animation ----------

  animate(dt) {
    const m = this.model;
    const speedRatio = Math.min(1, this.velocity.length() / MOVE_SPEED);
    this.walkPhase += dt * 13 * speedRatio;
    const swing = Math.sin(this.walkPhase);

    // legs + body bob
    m.legL.rotation.x = swing * 0.7 * speedRatio;
    m.legR.rotation.x = -swing * 0.7 * speedRatio;
    m.body.position.y = Math.abs(swing) * 0.08 * speedRatio;
    m.body.rotation.x = 0;

    // default "ready" arm pose: claws out in front
    m.armL.rotation.set(-0.6 - swing * 0.4 * speedRatio, 0, 0.15);
    m.armR.rotation.set(-0.6 + swing * 0.4 * speedRatio, 0, -0.15);
    this.slashArc.material.opacity = Math.max(0, this.slashArc.material.opacity - dt * 6);

    if (this.state === 'attack') {
      const hit = COMBO[this.comboStep - 1];
      const t = Math.min(1, this.stateTime / hit.duration);
      const e = 1 - Math.pow(1 - t, 3); // ease out
      if (this.comboStep === 1) {
        // left arm sweeps from the outside across the body
        m.armL.rotation.set(-1.5, 0, THREE.MathUtils.lerp(1.3, -0.9, e));
      } else if (this.comboStep === 2) {
        m.armR.rotation.set(-1.5, 0, THREE.MathUtils.lerp(-1.3, 0.9, e));
      } else {
        // both arms come down from overhead
        const x = THREE.MathUtils.lerp(-2.9, -0.8, e);
        m.armL.rotation.set(x, 0, 0.2);
        m.armR.rotation.set(x, 0, -0.2);
        m.body.rotation.x = e * 0.25;
      }
      if (t > 0.3 && t < 0.6) {
        this.slashArc.material.opacity = this.comboStep === 3 ? 0.95 : 0.7;
        this.slashArc.material.color.setHex(this.comboStep === 3 ? 0xffe070 : 0xffffff);
        this.slashArc.scale.set(this.comboStep === 2 ? -1 : 1, 1, 1).multiplyScalar(this.comboStep === 3 ? 1.2 : 1);
      }
    } else if (this.state === 'dash') {
      m.body.rotation.x = 0.5; // lean forward
      m.armL.rotation.set(0.9, 0, 0.2);
      m.armR.rotation.set(0.9, 0, -0.2);
    } else if (this.state === 'spin') {
      m.body.rotation.y += dt * 24; // whirlwind!
      m.armL.rotation.set(-0.2, 0, 1.5);
      m.armR.rotation.set(-0.2, 0, -1.5);
      this.spinRing.rotation.z -= dt * 18;
    }

    // flash red when hurt
    this.setFlash(this.hurtTimer > 0 ? 0x990000 : (this.state === 'spin' ? 0x401000 : 0x000000));
  }

  animateDeath(dt) {
    this.stateTime += dt;
    const t = Math.min(1, this.stateTime / 0.6);
    this.model.body.rotation.x = -t * Math.PI / 2 * 0.95; // fall on his back
    this.model.body.rotation.y = 0;
    this.model.body.position.y = t * 0.25;
    this.setFlash(0x000000);
  }

  setFlash(hex) {
    if (this.currentFlash === hex) return;
    this.currentFlash = hex;
    for (const mat of this.model.flashMats) mat.emissive.setHex(hex);
  }

  syncModel() {
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.facing;
  }
}

// ---------- Building the blocky Wolverine model ----------
// Everything is made of boxes. The model faces +Z (forward) when rotation is 0.
function buildWolverine() {
  const mats = {
    yellow: new THREE.MeshLambertMaterial({ color: 0xffc81a }),
    blue: new THREE.MeshLambertMaterial({ color: 0x1f4fd6 }),
    black: new THREE.MeshLambertMaterial({ color: 0x141414 }),
    red: new THREE.MeshLambertMaterial({ color: 0xc4161c }),
    skin: new THREE.MeshLambertMaterial({ color: 0xe0a878 }),
    claw: new THREE.MeshLambertMaterial({ color: 0xe8eef5, emissive: 0x445566 }),
    eye: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1); // one shared box, scaled into each body part

  const root = new THREE.Group(); // moves + turns with the player
  const body = new THREE.Group(); // used for leaning / spinning animations
  root.add(body);

  function box(parent, mat, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Legs (the group's origin is the hip joint, so rotating it swings the leg)
  function leg(x) {
    const g = new THREE.Group();
    g.position.set(x, 0.85, 0);
    body.add(g);
    box(g, mats.yellow, 0.3, 0.55, 0.32, 0, -0.28, 0); // thigh/shin
    box(g, mats.blue, 0.34, 0.36, 0.4, 0, -0.67, 0.03); // boot
    return g;
  }
  const legL = leg(0.2);
  const legR = leg(-0.2);

  // Hips, belt and torso
  box(body, mats.blue, 0.66, 0.24, 0.38, 0, 0.94, 0);   // trunks
  box(body, mats.red, 0.68, 0.08, 0.4, 0, 1.08, 0);     // belt
  box(body, mats.yellow, 0.64, 0.5, 0.36, 0, 1.36, 0);  // yellow chest
  box(body, mats.blue, 0.76, 0.24, 0.4, 0, 1.62, 0);    // blue shoulders / upper chest
  box(body, mats.black, 0.05, 0.36, 0.3, 0.33, 1.32, 0);  // black tiger stripes on the sides
  box(body, mats.black, 0.05, 0.36, 0.3, -0.33, 1.32, 0);

  // Head with the famous pointy mask
  const head = new THREE.Group();
  head.position.set(0, 1.95, 0);
  body.add(head);
  box(head, mats.yellow, 0.42, 0.42, 0.42, 0, 0, 0);
  box(head, mats.black, 0.44, 0.13, 0.05, 0, 0.05, 0.21);   // black around the eyes
  box(head, mats.eye, 0.09, 0.05, 0.02, 0.1, 0.05, 0.24);   // white eyes
  box(head, mats.eye, 0.09, 0.05, 0.02, -0.1, 0.05, 0.24);
  box(head, mats.skin, 0.3, 0.15, 0.05, 0, -0.12, 0.21);    // chin / jaw
  const finL = box(head, mats.black, 0.09, 0.4, 0.16, 0.2, 0.3, 0); // mask "ears"
  finL.rotation.z = -0.45;
  const finR = box(head, mats.black, 0.09, 0.4, 0.16, -0.2, 0.3, 0);
  finR.rotation.z = 0.45;

  // Arms with three claws each (group origin = shoulder)
  function arm(x) {
    const g = new THREE.Group();
    g.position.set(x, 1.62, 0);
    body.add(g);
    box(g, mats.blue, 0.3, 0.22, 0.32, 0, 0.02, 0);       // shoulder pad
    box(g, mats.yellow, 0.22, 0.5, 0.24, 0, -0.3, 0);     // arm
    box(g, mats.blue, 0.27, 0.26, 0.28, 0, -0.66, 0);     // glove
    for (const cx of [-0.08, 0, 0.08]) {
      box(g, mats.claw, 0.035, 0.62, 0.035, cx, -1.08, 0.04); // adamantium claws!
    }
    return g;
  }
  const armL = arm(0.47);
  const armR = arm(-0.47);

  const flashMats = [mats.yellow, mats.blue, mats.black, mats.red, mats.skin];
  return { root, body, head, legL, legR, armL, armR, flashMats };
}
