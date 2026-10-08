// input.js
// Keeps track of what the player is pressing (keyboard, mouse, and touch).
// The rest of the game never looks at raw key codes - it just asks things like
// "which way should the hero move?" or "was the attack button pressed this frame?"

// Keys that move the hero
const MOVE_KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

// Keys that trigger actions
const ACTION_KEYS = {
  KeyJ: 'attack',
  KeyK: 'dash', Space: 'dash',
  KeyL: 'spin',
  Enter: 'start', KeyR: 'start',
};

export class Input {
  constructor(canvas) {
    this.held = new Set();        // movement directions currently held down
    this.justPressed = new Set(); // actions pressed THIS frame (cleared every frame)
    this.attackKeyHeld = false;   // J held
    this.mouseHeld = false;       // left mouse held
    this.touchAttackHeld = false; // SLASH touch button held (set by touch.js)
    this.joystick = { x: 0, y: 0 }; // virtual joystick (set by touch.js), -1..1

    window.addEventListener('keydown', (e) => {
      const dir = MOVE_KEYS[e.code];
      const action = ACTION_KEYS[e.code];
      if (dir) this.held.add(dir);
      if (action) {
        if (!e.repeat) this.justPressed.add(action); // ignore auto-repeat
        if (action === 'attack') this.attackKeyHeld = true;
      }
      // Stop arrow keys / space from scrolling the page
      if (dir || action) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      const dir = MOVE_KEYS[e.code];
      if (dir) this.held.delete(dir);
      if (e.code === 'KeyJ') this.attackKeyHeld = false;
    });

    // Left mouse button = slash
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.justPressed.add('attack');
        this.mouseHeld = true;
      }
    });
    window.addEventListener('mouseup', () => { this.mouseHeld = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // If the window loses focus, let go of everything (prevents "stuck" keys)
    window.addEventListener('blur', () => {
      this.held.clear();
      this.attackKeyHeld = this.mouseHeld = this.touchAttackHeld = false;
    });
  }

  // Used by touch buttons to "press" an action
  press(action) { this.justPressed.add(action); }

  // Was this action pressed during the current frame?
  wasPressed(action) { return this.justPressed.has(action); }

  // Is any attack button being held down? (holding = keep slashing)
  get attackHeld() { return this.attackKeyHeld || this.mouseHeld || this.touchAttackHeld; }

  // Movement as a 2D "screen" direction: x = right, y = up (towards the top of the screen).
  // Length is at most 1. player.js turns this into a direction on the 3D floor.
  getMove() {
    let x = 0, y = 0;
    if (this.held.has('right')) x += 1;
    if (this.held.has('left')) x -= 1;
    if (this.held.has('up')) y += 1;
    if (this.held.has('down')) y -= 1;
    x += this.joystick.x;
    y += this.joystick.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  // Called once at the end of every frame
  endFrame() { this.justPressed.clear(); }
}
