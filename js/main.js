// main.js
// The starting point of COREBURN. It:
//   1. sets up Three.js (renderer, scene, camera, lights)
//   2. creates the arena, Sarrow, the waves, the HUD and the controls
//   3. runs the game loop ~60 times a second: update everything, then draw
import * as THREE from 'three';
import { Input } from './input.js';
import { isTouchDevice, setupTouchControls } from './touch.js';
import { createArena } from './arena.js';
import { Player } from './player.js';
import { WaveManager, isBossWave } from './waves.js';
import { Projectiles } from './projectiles.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';

const IS_TOUCH = isTouchDevice();
if (IS_TOUCH) document.body.classList.add('touch'); // shows the touch controls (see style.css)

// ---------- Renderer (draws the 3D scene onto a <canvas>) ----------
const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // cap at 2x so phones stay smooth
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = IS_TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

// ---------- Scene: dusk over the Slag Yard ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14191d);
scene.fog = new THREE.Fog(0x14191d, 45, 95);

// ---------- Camera: isometric-style, looking down at about 45 degrees ----------
const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200); // low field-of-view = flatter, more 'isometric' look
const CAMERA_DIR = new THREE.Vector3(1, 1.35, 1).normalize(); // direction from the hero to the camera
let cameraDistance = 28;
const cameraTarget = new THREE.Vector3();
let shakeAmount = 0;

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xbfd8e0, 0x4a3426, 1.2)); // cool sky, warm ground bounce
const sun = new THREE.DirectionalLight(0xffd2a0, 2.5);         // low orange sunset light with shadows
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 512 : 1024, IS_TOUCH ? 512 : 1024);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
sun.shadow.bias = -0.0015;
scene.add(sun, sun.target);

// ---------- Game objects ----------
const input = new Input(renderer.domElement);
setupTouchControls(input);
const hud = new Hud();
const effects = new Effects(scene);
const projectiles = new Projectiles(scene);
const arena = createArena(scene);

let state = 'title'; // 'title' | 'playing' | 'gameover'
let kills = 0;
let score = 0;
let hitstopTimer = 0;
let deathTimer = 0;
let gameOverTime = 0;
const best = JSON.parse(localStorage.getItem('coreburn-best') || '{"score":0,"wave":0}');

// "world" is a shared object that the player and enemies use to reach each other
// and to trigger effects, without needing to know about main.js.
const world = {
  arena,
  effects,
  projectiles,
  player: null,
  enemies: null,
  shake(amount) { shakeAmount = Math.max(shakeAmount, amount); },
  hitstop(seconds) { hitstopTimer = Math.max(hitstopTimer, seconds); }, // tiny freeze = punchy hits
  onPlayerHurt() { hud.flashDamage(); world.shake(0.2); },
  onEnemyKilled(e) {
    kills++;
    score += e.points;
    // Hive splitters burst into mites (unless they're crumbling because the boss died)
    if (e.type.splits && !e.crumble) {
      for (let i = 0; i < e.type.splits; i++) {
        const a = (i / e.type.splits) * Math.PI * 2;
        const m = enemies.spawnAt('mite', e.position.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))));
        if (m) m.stateTime = 0.4; // mites pop out quickly
      }
    }
  },
  onWaveStart(n) {
    const msgs = { 1: 'The Grindchoir is coming', 2: 'Ripper hounds: they lunge!', 3: 'Slag spitters: dodge the bolts', 4: 'Bulwarks: only heavy hits stagger them', 6: 'Hive splitters burst into mites', 7: 'Elites (amber crowns) incoming' };
    hud.showBanner(`WAVE ${n}`, msgs[n] || '');
  },
  onBossWave(n, def) { hud.showBanner(def.name, `Wave ${n} · ${def.subtitle}`); },
  onBossKilled(boss) {
    // Reward: big heal + score bonus, and its minions crumble
    score += boss.points;
    kills++;
    world.player.heal(60);
    enemies.killAllAdds();
    world.shake(0.6);
    hud.showBanner('BOSS DOWN!', `+${boss.points} pts · +60 health`);
  },
  onWaveCleared(n) {
    const bonus = 25 * n;
    score += bonus;
    if (!isBossWave(n)) {
      world.player.heal(25);
      hud.showBanner(`WAVE ${n} CLEARED`, `+${bonus} pts · +25 health`);
    }
  },
};
const player = new Player(scene, world);
const enemies = new WaveManager(scene, world);
world.player = player;
world.enemies = enemies;

// ---------- Starting / ending a run ----------
function startGame() {
  kills = 0;
  score = 0;
  deathTimer = 0;
  effects.reset();
  projectiles.reset();
  enemies.reset();
  player.reset();
  hud.hideOverlay();
  state = 'playing';
  enemies.startWave(1);
}

function gameOver() {
  state = 'gameover';
  gameOverTime = performance.now();
  const newBest = score > best.score;
  if (newBest) {
    best.score = score;
    best.wave = enemies.wave;
    localStorage.setItem('coreburn-best', JSON.stringify(best));
  }
  hud.showGameOver(score, enemies.wave, kills, best, newBest);
}

// Instant restart: any key, click or tap on the game over screen
// (with a short delay so a button you were mashing doesn't skip it immediately)
function tryRestart() {
  if (state === 'gameover' && performance.now() - gameOverTime > 600) startGame();
}
window.addEventListener('keydown', tryRestart);
document.getElementById('overlay').addEventListener('pointerdown', tryRestart);
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', tryRestart);
hud.showTitle(best);

// ---------- Resizing (also handles phones rotating between portrait and landscape) ----------
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // Pull the camera back on narrow (portrait) screens so you can still see
  // about 9 metres to the left and right of the hero.
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  cameraDistance = THREE.MathUtils.clamp(9 / Math.tan(halfH), 28, 42);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
onResize();

// ---------- Camera follow ----------
function updateCamera(dt, snap = false) {
  // smoothly follow the hero
  const follow = snap ? 1 : 1 - Math.exp(-6 * dt);
  cameraTarget.lerp(player.position, follow);
  camera.position.copy(cameraTarget).addScaledVector(CAMERA_DIR, cameraDistance);
  // screen shake
  if (shakeAmount > 0) {
    camera.position.x += (Math.random() - 0.5) * shakeAmount;
    camera.position.y += (Math.random() - 0.5) * shakeAmount;
    camera.position.z += (Math.random() - 0.5) * shakeAmount;
    shakeAmount = Math.max(0, shakeAmount - dt * 1.5);
  }
  camera.lookAt(cameraTarget.x, cameraTarget.y + 0.8, cameraTarget.z);
  // keep the shadow-casting light centred on the action
  sun.position.set(cameraTarget.x + 10, 18, cameraTarget.z + 3);
  sun.target.position.copy(cameraTarget);
}

// ---------- The game loop ----------
const clock = new THREE.Clock();
updateCamera(0, true);

function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 1 / 20); // avoid huge jumps if the tab was in the background

  // hitstop: freeze the action for a split second on big hits
  if (hitstopTimer > 0) {
    hitstopTimer -= dt;
    dt *= 0.05;
  }

  if (state === 'playing') {
    player.update(dt, input);
    enemies.update(dt);
    projectiles.update(dt, player, arena, effects);
    if (player.dead) {
      deathTimer += dt;
      if (deathTimer > 1.6) gameOver();
    }
  } else {
    // title screen: Enter or J also starts a run
    if (state === 'title' && (input.wasPressed('start') || input.wasPressed('attack'))) startGame();
    if (state === 'gameover') { enemies.update(dt); projectiles.update(dt, player, arena, effects); } // let things settle
  }

  effects.update(dt);
  updateCamera(dt);
  hud.update(player, Math.max(1, enemies.wave), kills, score, enemies.boss);
  input.endFrame();
  renderer.render(scene, camera);
}
frame();

// Handy for testing in the browser console: try  game.player.hp = 1000  or  game.skipTo(10)
window.game = {
  player, enemies, world, startGame,
  get score() { return score; },
  skipTo(n) { enemies.reset(); projectiles.reset(); enemies.startWave(n); },
};
