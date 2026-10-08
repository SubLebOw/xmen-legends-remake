// projectiles.js
// Slow glowing bolts fired by spitters and bosses. They're slow on purpose so you can
// sidestep them, or blink straight through them (blinking makes you untouchable).
import * as THREE from 'three';

const MAX_PROJECTILES = 48;

export class Projectiles {
  constructor(scene) {
    this.list = [];
    this.materials = new Map();
    const geo = new THREE.SphereGeometry(0.3, 8, 6);
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mesh = new THREE.Mesh(geo, this.material(0xff8a1e));
      mesh.visible = false;
      scene.add(mesh);
      this.list.push({ mesh, vel: new THREE.Vector3(), life: 0, damage: 0, size: 1 });
    }
  }

  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.materials.get(color);
  }

  // Fire a bolt from `from` in direction `dir` (on the floor plane)
  fire(from, dir, speed, damage, color = 0xff8a1e, size = 1) {
    const p = this.list.find((x) => x.life <= 0);
    if (!p) return; // pool is full, skip this shot
    p.mesh.material = this.material(color);
    p.mesh.position.copy(from);
    p.mesh.scale.setScalar(size);
    p.mesh.visible = true;
    p.vel.set(dir.x, 0, dir.z).normalize().multiplyScalar(speed);
    p.life = 4;
    p.damage = damage;
    p.size = size;
  }

  update(dt, player, arena, effects) {
    for (const p of this.list) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;
      let done = p.life <= 0 || Math.abs(pos.x) > 19 || Math.abs(pos.z) > 19;
      // hit a pillar or crate?
      for (const o of arena.obstacles) {
        if (Math.hypot(pos.x - o.x, pos.z - o.z) < o.r) { done = true; break; }
      }
      // hit the player? (takeDamage returns false while blinking, so the bolt flies on)
      if (!done && !player.dead && Math.hypot(pos.x - player.position.x, pos.z - player.position.z) < 0.3 * p.size + player.radius) {
        if (player.takeDamage(p.damage)) done = true;
      }
      if (done) {
        p.life = 0;
        p.mesh.visible = false;
        effects.spawnSparks(pos, 0xffb060, 4, 4);
      }
    }
  }

  reset() {
    for (const p of this.list) { p.life = 0; p.mesh.visible = false; }
  }
}
