// arena.js
// Builds the level: a metal floor, low walls around the edge, and some pillars/crates
// to fight around. Also handles simple collision (keeping characters out of pillars
// and inside the walls).
import * as THREE from 'three';

export const ARENA_HALF = 18; // the playable area goes from -18 to +18 on X and Z

export function createArena(scene) {
  const obstacles = []; // circles {x, z, r} that characters can't walk through

  // ---------- Floor ----------
  // We draw a metal plate pattern on a little canvas and use it as the floor texture.
  const floorTex = new THREE.CanvasTexture(makeFloorCanvas());
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(10, 10);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = 4;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2 + 4, ARENA_HALF * 2 + 4),
    new THREE.MeshLambertMaterial({ map: floorTex })
  );
  floor.rotation.x = -Math.PI / 2; // planes start vertical, lay it flat
  floor.receiveShadow = true;
  scene.add(floor);

  // Big red ring in the middle (a nod to Apocalypse's colours)
  const emblem = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 3.8, 48),
    new THREE.MeshBasicMaterial({ color: 0x8a1020 })
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.y = 0.01;
  scene.add(emblem);

  // ---------- Walls ----------
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2c2338 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xa040ff });
  const len = ARENA_HALF * 2 + 4;
  const wallSpecs = [
    [0, -(ARENA_HALF + 1.5), len, 1],
    [0, ARENA_HALF + 1.5, len, 1],
    [-(ARENA_HALF + 1.5), 0, 1, len],
    [ARENA_HALF + 1.5, 0, 1, len],
  ];
  for (const [x, z, w, d] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), wallMat);
    wall.position.set(x, 0.7, z);
    wall.receiveShadow = true;
    scene.add(wall);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.08, d + 0.02), glowMat);
    strip.position.set(x, 1.42, z);
    scene.add(strip);
  }

  // ---------- Pillars ----------
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x77738a });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0x5a2a8a, emissive: 0x2a0a40 });
  const pillarGeo = new THREE.CylinderGeometry(1, 1.15, 3.2, 12);
  const bandGeo = new THREE.CylinderGeometry(1.08, 1.08, 0.35, 12);
  const pillarSpots = [[-8, -7], [8, -7], [-8, 8], [8, 8], [0, -13], [-14, 0], [14, 1]];
  for (const [x, z] of pillarSpots) {
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(x, 1.6, z);
    p.castShadow = true;
    p.receiveShadow = true;
    scene.add(p);
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(x, 1.2, z);
    scene.add(band);
    obstacles.push({ x, z, r: 1.1 });
  }

  // ---------- Crates ----------
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x6b5a3a });
  const crateGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  for (const [x, z, rot] of [[4, 13, 0.3], [-5, 13.5, -0.2], [13, -9, 0.6], [-13, -10, 0.1]]) {
    const c = new THREE.Mesh(crateGeo, crateMat);
    c.position.set(x, 0.8, z);
    c.rotation.y = rot;
    c.castShadow = true;
    c.receiveShadow = true;
    scene.add(c);
    obstacles.push({ x, z, r: 1.05 });
  }

  return {
    obstacles,

    // Push a character (position + radius) out of obstacles and keep it inside the walls
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
        const x = side === 0 ? along : side === 1 ? along : side === 2 ? -edge : edge;
        const z = side === 0 ? -edge : side === 1 ? edge : along;
        const farEnough = Math.hypot(x - playerPos.x, z - playerPos.z) > minDist;
        const blocked = obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 1);
        if (farEnough && !blocked) return new THREE.Vector3(x, 0, z);
      }
      return new THREE.Vector3(-playerPos.x || 10, 0, -playerPos.z || 10); // fallback: opposite side
    },
  };
}

// Draws one tile of the floor pattern
function makeFloorCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3d3549';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#463e54';
  g.fillRect(4, 4, 56, 56);
  g.fillRect(68, 68, 56, 56);
  g.strokeStyle = '#231d2c';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 128, 128);
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  g.fillStyle = '#5a5268'; // rivets
  for (const [x, y] of [[10, 10], [54, 10], [10, 54], [54, 54], [74, 74], [118, 74], [74, 118], [118, 118]]) {
    g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
  }
  return c;
}
