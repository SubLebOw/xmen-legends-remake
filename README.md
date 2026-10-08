# COREBURN — Endless Arena Brawler

> *The Grindchoir melts down anything with a pulse to feed its machine hymn. Sarrow, a scavenger with a stolen
> reactor core burning in his chest, has decided the song ends here.*

An original 3D isometric arena brawler that runs in any browser (PC or phone) with nothing to install.
Play as **Sarrow** and carve through endless waves of the **Grindchoir**, a machine cult of scrap-built drones,
with a boss fight every 5 waves. How far can you get?

**Play it:** https://sublebow.github.io/xmen-legends-remake/

## Controls

| Action | Keyboard / mouse | Phone / tablet |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag on the left half of the screen (virtual joystick) |
| Talon slash (3-hit combo) | J or left-click (hold to keep slashing) | SLASH button (hold to keep slashing) |
| Blink dash (untouchable, hurts enemies you pass, dodges bolts) | K or Space | BLINK button |
| Overdrive spin (8 s cooldown, half damage taken) | L | OVERDRIVE button |
| Start | Enter / J / START | START button |
| Restart after game over | any key or click | tap anywhere |

**Core recharge:** Sarrow's health slowly refills by itself, faster if he avoids hits for 3 seconds.
Clearing a wave heals 25; beating a boss heals 60.

## The Grindchoir

| Enemy | Unlocks | What it does |
| --- | --- | --- |
| Acolyte | wave 1 | Basic melee drone. Raises its fists (glows red) before swinging. |
| Ripper Hound | wave 2 | Fast four-legged scrap hound. Crouches, then lunges. |
| Slag Spitter | wave 3 | Keeps its distance and spits slow molten bolts. Sidestep or blink through them. |
| Bulwark | wave 4 | Big armoured brute with a shield. Only your combo finisher or overdrive staggers it. |
| Hive Splitter | wave 6 | Bursts into 3 skittering Mites when destroyed. |
| Elites | wave 6+ | Any type can spawn as an elite: amber crown and eyes, 30% bigger, 2.2x health, 1.35x damage, 3x points. |

### Bosses (every 5th wave, rotating, tougher each time)

1. **The Furnace Deacon** (waves 5, 20, 35...): a furnace-bellied brute. Telegraphed **charges** (red strip on the floor;
   if it smashes into the fence it's dazed), **ground slams** (red circle fills up, then boom), and **summons** acolytes and hounds.
2. **Choirmother** (waves 10, 25, 40...): a floating bell-masked priestess. **Bolt bursts** in every direction, **marked slams**
   (circles drop on and around you), summons **mites and spitters**, and the occasional charge.
3. **Rivetjaw** (waves 15, 30, 45...): a giant scrap crab that's mostly jaw. **Triple charges**, aimed **bolt volleys**,
   slams, and summons **bulwarks**.

Beating a boss: **+60 health, +500 x boss number points**, and every minion it summoned crumbles.

### Endless scaling (wave n)

- Enemies per wave: `4 + 2n` (no limit). Max on screen at once: `min(6 + n, 14)`, capped so phones stay smooth.
  Later waves get harder through stats and elites instead of more bodies.
- Enemy health `x (1 + 0.14(n-1))`, damage `x (1 + 0.07(n-1))`: both grow forever.
- Enemy speed `x (1 + min(0.5, 0.025(n-1)))`: tops out at +50% so it stays dodgeable.
- Elite chance: `min(50%, 4% per wave after wave 5)`.
- Bosses: health `x (1 + 0.45 per previous boss)`; after each full loop of all 3 bosses their wind-ups get 12% faster
  (down to 60%), slams get bigger, and they fire and summon more.

Score: points per kill (acolyte 10, hound 15, spitter 20, splitter 20, bulwark 40, mite 3, elites x3), plus `25 x wave`
per cleared wave, plus the boss bonus. Your best score is saved in the browser.

## Running it on your own computer

Browsers block ES modules from `file://`, so you need a tiny local web server. Pick one:

```bash
python3 -m http.server 8000   # Python
npx serve .                   # or Node.js
```

Then open http://localhost:8000. Edit a file, save, refresh the page. That's the whole workflow, with no build step.
Three.js is loaded from a CDN (see the import map in `index.html`), so you need an internet connection.

## File layout

```
index.html         Page layout: HUD, boss bar, touch buttons, title/game-over screens, Three.js import map
style.css          All the styling (HUD, buttons, joystick, cooldown pies, mobile tweaks)
js/main.js         Starting point: renderer, camera, lights, game loop, score, start/game over, resizing
js/player.js       Sarrow: blocky model, movement, talon combo, blink, overdrive, core recharge
js/enemy.js        Grindchoir enemy types (looks + AI), elites, hit flash, knockback, death
js/boss.js         The three bosses and their telegraphed attack patterns
js/waves.js        Endless wave manager and all the difficulty scaling numbers
js/projectiles.js  Slow glowing bolts fired by spitters and bosses
js/arena.js        The Slag Yard: floor, fence, smokestacks, scrap heaps, barrels, collision
js/input.js        Keyboard + mouse input, turned into simple "move" and "action" signals
js/touch.js        Phone controls: floating virtual joystick and on-screen buttons
js/effects.js      Sparks, rings and red attack warnings (pooled so it stays fast on phones)
js/hud.js          Updates the health bar, score, cooldowns, boss bar and banners
```

### Easy things to tweak first
- `js/waves.js`: `waveStats()` and `UNLOCKS` set the whole difficulty curve
- `js/player.js`: `COMBO` damage/range, `MOVE_SPEED`, `DASH_COOLDOWN`, `SPIN_COOLDOWN`
- `js/enemy.js`: `ENEMY_TYPES`; `js/boss.js`: `BOSSES`
- Browser console: `game.player.hp = 1000` (god mode while testing), `game.skipTo(10)` (jump to a wave)

## License / credits

Original game design, characters and code. Built with [Three.js](https://threejs.org) (MIT).
