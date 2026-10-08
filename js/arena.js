// arena.js
// Builds the level: "the Slag Yard", a scrapyard foundry at dusk. Cracked concrete,
// a hazard-striped ring in the middle, rusty fences, smokestacks, scrap heaps and barrels.
// Also handles simple collision (keeping characters out of obstacles and inside the fence).
import * as THREE from 'three';

export const ARENA_HALF = 18; // the playable area goes from -18 to +18 on X and Z

export function createArena(scene) {
  const obstacles = []; // circles {x, z, r} that characters can't walk through

  // ---------- Floor ----------
  // We draw a cracked concrete slab pattern on a little canvas and use it as the floor texture.
  const floorTex = new THREE.CanvasTexture(makeFloorCanvas());
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(8, 8);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = 4;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2 + 4, ARENA_HALF * 2 + 4),
    new THREE.MeshLambertMaterial({ map: floorTex })
  );
  floor.rotation.x = -Math.PI / 2; // planes start vertical, lay it flat
  floor.receiveShadow = true;
  scene.add(floor);

  // Hazard ring in the middle: alternating yellow/black segments
  const hazardYellow = new THREE.MeshBasicMaterial({ color: 0xd9a21b });
  const hazardBlack = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
  const SEGMENTS = 24;
  for (let i = 0; i < SEGMENTS; i++) {
    const seg = new THREE.Mesh(
      new THREE.RingGeometry(3.3, 3.8, 3, 1, (i / SEGMENTS) * Math.PI * 2, (Math.PI * 2) / SEGMENTS),
      i % 2 ? hazardYellow : hazardBlack
    );
    seg.rotation.x = -Math.PI / 2;
    seg.position.y = 0.01;
    scene.add(seg);
  }
  // a glowing teal drain grate in the very centre
  const grate = new THREE.Mesh(new THREE.CircleGeometry(1.1, 6), new THREE.MeshBasicMaterial({ color: 0x0f3b38 }));
  grate.rotation.x = -Math.PI / 2;
  grate.position.y = 0.012;
  scene.add(grate);

  // ---------- Fence walls ----------
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x6b3a22 }); // rusty corrugated metal
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2b2826 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb050 });
  const len = ARENA_HALF * 2 + 4;
  const wallSpecs = [
    [0, -(ARENA_HALF + 1.5), len, 0.5],
    [0, ARENA_HALF + 1.5, len, 0.5],
    [-(ARENA_HALF + 1.5), 0, 0.5, len],
    [ARENA_HALF + 1.5, 0, 0.5, len],
  ];
  for (const [x, z, w, d] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, d), fenceMat);
    wall.position.set(x, 0.9, z);
    wall.receiveShadow = true;
    scene.add(wall);
  }
  // fence posts with little amber work lamps
  const postGeo = new THREE.BoxGeometry(0.35, 2.4, 0.35);
  const lampGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
  for (let i = -ARENA_HALF; i <= ARENA_HALF; i += 6) {
    for (const [x, z] of [[i, -(ARENA_HALF + 1.5)], [i, ARENA_HALF + 1.5], [-(ARENA_HALF + 1.5), i], [ARENA_HALF + 1.5, i]]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 1.2, z);
      scene.add(post);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, 2.45, z);
      scene.add(lamp);
    }
  }

  // ---------- Smokestacks (round obstacles) ----------
  const stackMat = new THREE.MeshLambertMaterial({ color: 0x4a4440 });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xa8481c });
  const stackGeo = new THREE.CylinderGeometry(0.85, 1.05, 3.4, 10);
  const bandGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.3, 10);
  for (const [x, z] of [[-8, -7], [8, 8], [0, -13], [14, 1]]) {
    const p = new THREE.Mesh(stackGeo, stackMat);
    p.position.set(x, 1.7, z);
    p.castShadow = true;
    p.receiveShadow = true;
    scene.add(p);
    for (const y of [1.0, 2.6]) {
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(x, y, z);
      scene.add(band);
    }
    obstacles.push({ x, z, r: 1.05 });
  }

  // ---------- Scrap heaps: piles of tilted junk ----------
  const junkColors = [0x7a4a2a, 0x55524d, 0x8c6a3a, 0x3d4a46];
  const junkMats = junkColors.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const junkGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x, z] of [[8, -7], [-8, 8], [-14, 0]]) {
    for (let i = 0; i < 6; i++) {
      const j = new THREE.Mesh(junkGeo, junkMats[i % junkMats.length]);
      const s = 0.6 + ((i * 37) % 10) / 14;
      j.scale.set(s * 1.3, s * 0.7, s);
      j.position.set(x + Math.sin(i * 2.1) * 0.5, 0.3 + (i % 3) * 0.45, z + Math.cos(i * 1.7) * 0.5);
      j.rotation.set(i * 0.4, i * 1.1, i * 0.3);
      j.castShadow = true;
      j.receiveShadow = true;
      scene.add(j);
    }
    obstacles.push({ x, z, r: 1.25 });
  }

  // ---------- Oil barrels ----------
  const barrelMat = new THREE.MeshLambertMaterial({ color: 0xc0561e });
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10);
  for (const [x, z] of [[4, 13], [5, 13.6], [-5, 13.5], [13, -9], [-13, -10], [-12.4, -10.8]]) {
    const b = new THREE.Mesh(barrelGeo, barrelMat);
    b.position.set(x, 0.55, z);
    b.castShadow = true;
    scene.add(b);
    obstacles.push({ x, z, r: 0.6 });
  }

  return {
    obstacles,

    // Push a character (position + radius) out of obstacles and keep it inside the fence
    resolve(pos, radius) {
      for (const o of obstacles) {
        const dx = pos.x - o.x, dz = pos.z - o.z;
        const dist = Math.hypot(dx, dz);
        const minDist = o.r + radius;
        if (dist < minDist && dist > 0.0001) {
          const push = (minDist - dist) / dist;
          pos.x += dx * push;
          pos.z += dz * push;
        }
      }
      const limit = ARENA_HALF - radius;
      pos.x = Math.max(-limit, Math.min(limit, pos.x));
      pos.z = Math.max(-limit, Math.min(limit, pos.z));
    },

    // Pick a random spot near the arena edge that isn't too close to the player
    randomSpawnPoint(playerPos, minDist = 9) {
      for (let tries = 0; tries < 20; tries++) {
        const along = (Math.random() * 2 - 1) * (ARENA_HALF - 2);
        const edge = ARENA_HALF - 1.5;
        const side = Math.floor(Math.random() * 4);
        const x = side < 2 ? along : side === 2 ? -edge : edge;
        const z = side === 0 ? -edge : side === 1 ? edge : along;
        const farEnough = Math.hypot(x - playerPos.x, z - playerPos.z) > minDist;
        const blocked = obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 1);
        if (farEnough && !blocked) return new THREE.Vector3(x, 0, z);
      }
      return new THREE.Vector3(-playerPos.x || 10, 0, -playerPos.z || 10); // fallback: opposite side
    },
  };
}

// Draws one tile of the floor: dusty concrete slabs with cracks and oil stains
function makeFloorCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#5a534b';
  g.fillRect(0, 0, 128, 128);
  // speckle
  for (let i = 0; i < 500; i++) {
    const v = 75 + Math.floor(Math.random() * 28);
    g.fillStyle = `rgb(${v + 10},${v + 2},${v - 8})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  // oil stain
  g.fillStyle = 'rgba(30,25,20,0.25)';
  g.beginPath(); g.ellipse(88, 40, 18, 11, 0.4, 0, Math.PI * 2); g.fill();
  // slab joints
  g.strokeStyle = '#3e3832';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 128, 128);
  // cracks
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(10, 70); g.lineTo(30, 64); g.lineTo(42, 80); g.lineTo(60, 76);
  g.moveTo(100, 100); g.lineTo(108, 112); g.lineTo(122, 116);
  g.stroke();
  return c;
}
