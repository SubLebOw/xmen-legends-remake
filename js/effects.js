// effects.js
// Little visual effects: sparks when talons hit, glowing rings when enemies arrive,
// and red warning shapes on the floor that show where a boss attack is about to land.
// We reuse ("pool") a fixed number of meshes instead of creating new ones every hit,
// which keeps the game smooth on phones.
import * as THREE from 'three';

const SPARK_COUNT = 70;
const RING_COUNT = 8;
const WARNING_COUNT = 8;

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
      const mat = new THREE.MeshBasicMaterial({ color: 0xc8ff3a, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: 1, maxScale: 1 });
    }
    // Boss attack warnings: a red circle that fills up, or a long red strip for charges
    const discGeo = new THREE.CircleGeometry(1, 32);
    const edgeGeo = new THREE.RingGeometry(0.94, 1, 40);
    const stripGeo = new THREE.PlaneGeometry(1, 1);
    this.warnings = [];
    for (let i = 0; i < WARNING_COUNT; i++) {
      const group = new THREE.Group();
      const fillMat = new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0.35, depthWrite: false });
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0xff5a20, transparent: true, opacity: 0.9, depthWrite: false });
      const fill = new THREE.Mesh(discGeo, fillMat);
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      const strip = new THREE.Mesh(stripGeo, fillMat);
      for (const m of [fill, edge, strip]) { m.rotation.x = -Math.PI / 2; group.add(m); }
      group.visible = false;
      scene.add(group);
      this.warnings.push({ group, fill, edge, strip, life: 0, maxLife: 1, kind: 'circle', radius: 1 });
    }
  }

  // Red circle on the floor at `pos`. The inside fills up until the attack lands.
  spawnWarning(pos, radius, duration) {
    const w = this.warnings.find((x) => x.life <= 0);
    if (!w) return;
    w.kind = 'circle';
    w.radius = radius;
    w.life = w.maxLife = duration;
    w.group.position.set(pos.x, 0.04, pos.z);
    w.group.rotation.y = 0;
    w.edge.visible = true; w.fill.visible = true; w.strip.visible = false;
    w.edge.scale.setScalar(radius);
    w.fill.scale.setScalar(0.01);
    w.group.visible = true;
  }

  // Long red strip from `pos` in direction `dir` (used to telegraph charges)
  spawnLine(pos, dir, length, width, duration) {
    const w = this.warnings.find((x) => x.life <= 0);
    if (!w) return;
    w.kind = 'line';
    w.life = w.maxLife = duration;
    w.group.position.set(pos.x, 0.04, pos.z);
    w.group.rotation.y = Math.atan2(dir.x, dir.z);
    w.edge.visible = false; w.fill.visible = false; w.strip.visible = true;
    w.strip.scale.set(width, length, 1);
    w.strip.position.set(0, 0, length / 2);
    w.group.visible = true;
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
  spawnRing(pos, color = 0xc8ff3a, maxScale = 2, duration = 0.6) {
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
    for (const w of this.warnings) {
      if (w.life <= 0) continue;
      w.life -= dt;
      const t = 1 - w.life / w.maxLife;
      if (w.kind === 'circle') w.fill.scale.setScalar(Math.max(0.01, t * w.radius));
      w.fill.material.opacity = 0.2 + 0.3 * t + (t > 0.8 ? 0.2 * Math.sin(t * 60) : 0); // flicker just before impact
      if (w.life <= 0) w.group.visible = false;
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
    for (const w of this.warnings) { w.life = 0; w.group.visible = false; }
  }
}
