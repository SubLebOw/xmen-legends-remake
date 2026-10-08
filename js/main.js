// main.js
// The starting point of the game. It:
//   1. sets up Three.js (renderer, scene, camera, lights)
//   2. creates the arena, Wolverine, the enemies, the HUD and the controls
//   3. runs the game loop ~60 times a second: update everything, then draw
import * as THREE from 'three';
import { Input } from './input.js';
import { isTouchDevice, setupTouchControls } from './touch.js';
import { createArena } from './arena.js';
import { Player } from './player.js';
import { EnemyManager } from './enemy.js';
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

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1024);
scene.fog = new THREE.Fog(0x1a1024, 45, 95);

// ---------- Camera: isometric-style, looking down at about 45 degrees ----------
const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200); // low field-of-view = flatter, more 'isometric' look
const CAMERA_DIR = new THREE.Vector3(1, 1.35, 1).normalize(); // direction from Wolverine to the camera
let cameraDistance = 28;
const cameraTarget = new THREE.Vector3();
let shakeAmount = 0;

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xc8c8ff, 0x3a2840, 1.3)); // soft sky/ground light
const sun = new THREE.DirectionalLight(0xfff0dd, 2.4);         // main light that casts shadows
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
const arena = createArena(scene);

let state = 'title'; // 'title' | 'playing' | 'gameover'
let kills = 0;
let hitstopTimer = 0;
let deathTimer = 0;
let bestWave = Number(localStorage.getItem('xml2-best-wave') || 0);

// "world" is a shared object that the player and enemies use to reach each other
// and to trigger effects, without needing to know about main.js.
const world = {
  arena,
  effects,
  player: null,
  enemies: null,
  shake(amount) { shakeAmount = Math.max(shakeAmount, amount); },
  hitstop(seconds) { hitstopTimer = Math.max(hitstopTimer, seconds); }, // tiny freeze = punchy hits
  onPlayerHurt() { hud.flashDamage(); world.shake(0.2); },
  onEnemyKilled() { kills++; },
  onWaveStart(n) { hud.showBanner(`WAVE ${n}`, n === 1 ? "Apocalypse's grunts incoming!" : ''); },
  onWaveCleared(n) {
    world.player.heal(25);
    hud.showBanner(`WAVE ${n} CLEARED`, '+25 health');
  },
};
const player = new Player(scene, world);
const enemies = new EnemyManager(scene, world);
world.player = player;
world.enemies = enemies;

// ---------- Starting / ending a run ----------
function startGame() {
  kills = 0;
  deathTimer = 0;
  effects.reset();
  enemies.reset();
  player.reset();
  hud.hideOverlay();
  state = 'playing';
  enemies.startWave(1);
}

function gameOver() {
  state = 'gameover';
  const newBest = enemies.wave > bestWave;
  if (newBest) {
    bestWave = enemies.wave;
    localStorage.setItem('xml2-best-wave', String(bestWave));
  }
  hud.showGameOver(enemies.wave, kills, bestWave, newBest);
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
hud.showTitle(bestWave);

// ---------- Resizing (also handles phones rotating between portrait and landscape) ----------
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // Pull the camera back on narrow (portrait) screens so you can still see
  // about 9 metres to the left and right of Wolverine.
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
  // smoothly follow Wolverine
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
  sun.position.set(cameraTarget.x + 8, 20, cameraTarget.z + 5);
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
    if (player.dead) {
      deathTimer += dt;
      if (deathTimer > 1.6) gameOver();
    }
  } else {
    // title / game over: Enter, R or J starts a new run
    if (input.wasPressed('start') || (state === 'title' && input.wasPressed('attack'))) startGame();
    if (state === 'gameover') enemies.update(dt); // let enemies finish their animations
  }

  effects.update(dt);
  updateCamera(dt);
  hud.update(player, Math.max(1, enemies.wave), kills);
  input.endFrame();
  renderer.render(scene, camera);
}
frame();

// Handy for debugging in the browser console: try  game.player.hp = 1000
window.game = { player, enemies, world, startGame };
