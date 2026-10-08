// touch.js
// On-screen controls for phones and tablets:
//  - a virtual joystick on the left half of the screen (appears under your thumb)
//  - SLASH / BLINK / OVERDRIVE buttons on the right
// These just feed into the same Input object the keyboard uses.

// Is this a touch-first device (phone / tablet)?
export function isTouchDevice() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
  return coarse || (('ontouchstart' in window) && noHover);
}

export function setupTouchControls(input) {
  // If someone touches the screen on a device we didn't detect, switch touch controls on anyway
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  // Block browser gestures (pinch zoom, double-tap zoom, pull-to-refresh) during play
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS Safari pinch
  document.addEventListener('dblclick', (e) => e.preventDefault());

  setupJoystick(input);
  bindButton(document.getElementById('btn-slash'), 'attack', input);
  bindButton(document.getElementById('btn-dash'), 'dash', input);
  bindButton(document.getElementById('btn-spin'), 'spin', input);
}

function setupJoystick(input) {
  const zone = document.getElementById('joystick-zone');
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  const RADIUS = 55;     // how far (pixels) the knob can move from the centre
  const DEADZONE = 0.12; // ignore tiny wobbles of the thumb

  let activeId = null;  // which finger is using the joystick
  let centerX = 0, centerY = 0;

  function release() {
    activeId = null;
    input.joystick.x = 0;
    input.joystick.y = 0;
    base.classList.remove('active');
    base.style.left = '';  // snap back to the default position from style.css
    base.style.top = '';
    knob.style.transform = 'translate(-50%, -50%)';
  }

  function moveKnob(e) {
    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) { dx *= RADIUS / dist; dy *= RADIUS / dist; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    let x = dx / RADIUS, y = -dy / RADIUS; // screen y goes down, game "up" goes up
    if (Math.hypot(x, y) < DEADZONE) { x = 0; y = 0; }
    input.joystick.x = x;
    input.joystick.y = y;
  }

  zone.addEventListener('pointerdown', (e) => {
    if (activeId !== null) return; // already being used by another finger
    e.preventDefault();
    activeId = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    // Move the joystick so it is centred under the thumb ("floating" joystick)
    const rect = zone.getBoundingClientRect();
    centerX = e.clientX;
    centerY = e.clientY;
    base.style.left = `${centerX - rect.left}px`;
    base.style.top = `${centerY - rect.top}px`;
    base.classList.add('active');
    moveKnob(e);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === activeId) moveKnob(e); });
  zone.addEventListener('pointerup', (e) => { if (e.pointerId === activeId) release(); });
  zone.addEventListener('pointercancel', (e) => { if (e.pointerId === activeId) release(); });
  zone.addEventListener('lostpointercapture', (e) => { if (e.pointerId === activeId) release(); });
}

function bindButton(el, action, input) {
  const up = () => {
    el.classList.remove('pressed');
    if (action === 'attack') input.touchAttackHeld = false;
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('pressed');
    input.press(action);
    if (action === 'attack') input.touchAttackHeld = true; // hold SLASH to keep attacking
  });
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault()); // no long-press menu
}
