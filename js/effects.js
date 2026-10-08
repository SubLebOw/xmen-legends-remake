// effects.js
// Little visual effects: sparks when claws hit, and glowing rings when enemies teleport in.
// We reuse ("pool") a fixed number of meshes instead of creating new ones every hit,
// which keeps the game smooth on phones.
import * as THREE from 'three';

const SPARK_COUNT = 70;
const RING_COUNT = 8;

export class Effects {
  constructor(scene) {
    this.sparks = [];
    this.rings = [];
    this.materials = new Map(); // one material per colour, shared by sparks

    const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    for (let i = 0; i < SPARK_COUNT; i++) {
      const mesh = new THREE.Mesh(sparkGeo, this.material(0xffffff));
      mesh.visible = false;
      scene.add(mesh);
      this.sparks.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }

    const ringGeo = new THREE.RingGeometry(0.7, 1, 32);
    for (let i = 0; i < RING_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xa040ff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: 1, maxScale: 1 });
    }
  }

  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.materials.get(color);
  }

  // Burst of little cubes flying out from a point
  spawnSparks(pos, color = 0xfff2a0, count = 8, speed = 6) {
    let made = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.mesh.material = this.material(color);
      s.mesh.position.copy(pos);
      s.mesh.visible = true;
      s.vel.set((Math.random() - 0.5) * 2, Math.random() * 1.2 + 0.3, (Math.random() - 0.5) * 2)
        .normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      s.life = s.maxLife = 0.3 + Math.random() * 0.25;
      if (++made >= count) break;
    }
  }

  // Expanding flat ring on the floor
  spawnRing(pos, color = 0xa040ff, maxScale = 2, duration = 0.6) {
    const r = this.rings.find((x) => x.life <= 0);
    if (!r) return;
    r.mesh.material.color.setHex(color);
    r.mesh.position.set(pos.x, 0.05, pos.z);
    r.mesh.visible = true;
    r.life = r.maxLife = duration;
    r.maxScale = maxScale;
  }

  update(dt) {
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 18 * dt; // gravity
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.scale.setScalar(Math.max(0.01, s.life / s.maxLife));
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - r.life / r.maxLife; // 0 -> 1
      r.mesh.scale.setScalar(0.3 + t * r.maxScale);
      r.mesh.material.opacity = 1 - t;
      if (r.life <= 0) r.mesh.visible = false;
    }
  }

  reset() {
    for (const s of this.sparks) { s.life = 0; s.mesh.visible = false; }
    for (const r of this.rings) { r.life = 0; r.mesh.visible = false; }
  }
}
