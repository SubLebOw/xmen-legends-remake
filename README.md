# X-Men Legends II: Rise of Apocalypse — Fan Remake (Slice 1)

A small, free, **non-commercial fan project** that rebuilds the feel of *X-Men Legends II: Rise of Apocalypse*
as a browser game. This first "slice" is just Wolverine fighting waves of Apocalypse's grunts in one arena, made
entirely from simple 3D shapes.

> **Not affiliated with, endorsed by, or connected to Marvel, Activision, or Raven Software.**
> X-Men, Wolverine and Apocalypse are trademarks of Marvel. No original game assets are used — everything here
> is built from basic boxes and cylinders in code. This project is not sold and never will be.

**Play it:** https://sublebow.github.io/xmen-legends-remake/ — works on PC and phone, nothing to install.

## Controls

| Action | Keyboard / mouse | Phone / tablet |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag on the left half of the screen (virtual joystick) |
| Claw slash (3-hit combo) | J or left-click (hold to keep slashing) | SLASH button (hold to keep slashing) |
| Dash lunge (invincible, hurts enemies you pass) | K or Space | DASH button |
| Berserker spin (8 s cooldown) | L | BERSERK button |
| Start / restart | Enter or R | START / TRY AGAIN button |

Wolverine's **healing factor** slowly refills his health, and faster if he avoids getting hit for 3 seconds.
Clearing a wave also heals 25. Grunts raise their fists and glow red before they punch: that's your cue to dash.
From wave 3, bigger **brutes** show up that only flinch from your combo finisher or berserker spin.

## Running it on your own computer

Browsers block ES modules from `file://`, so you need a tiny local web server. Pick one:

```bash
# Python (already installed on most Macs/Linux)
python3 -m http.server 8000
# or Node.js
npx serve .
```

Then open http://localhost:8000. Edit a file, save, refresh the page. That's the whole workflow, with no build step.
Three.js is downloaded from a CDN (see the import map in `index.html`), so you need an internet connection.

## File layout

```
index.html      Page layout: the HUD, touch buttons, title/game-over screens, and the Three.js import map
style.css       All the styling (HUD, buttons, joystick, cooldown pies, mobile tweaks)
js/main.js      Starting point: renderer, camera, lights, game loop, start/game over, resizing
js/player.js    Wolverine: blocky model, movement, claw combo, dash, berserker spin, healing factor
js/enemy.js     Apocalypse grunts/brutes (AI, attacks, hit flash, knockback, death) and the wave manager
js/arena.js     The arena floor, walls, pillars, crates, and simple collision
js/input.js     Keyboard + mouse input, turned into simple "move" and "action" signals
js/touch.js     Phone controls: floating virtual joystick and on-screen buttons
js/effects.js   Sparks and glowing rings (pooled so it stays fast on phones)
js/hud.js       Updates the health bar, wave/kill counters, cooldowns and banners
```

### Easy things to tweak first
- `js/player.js`: `COMBO` damage/range, `MOVE_SPEED`, `DASH_COOLDOWN`, `SPIN_COOLDOWN`
- `js/enemy.js`: `TYPES` (enemy health, speed, damage) and `startWave()` (how many enemies per wave)
- In the browser console: `game.player.hp = 1000` for god mode while testing

## Roadmap ideas
More X-Men (switch characters), special powers with an energy bar, an Apocalypse boss, a real level with
doors and breakable crates, sound effects, and co-op.
