# TOC // C2

**You are the commander in the TOC.** A real-time command-and-control game where you run
the fight from the operations center — reading a Blue Force Tracker map, cueing sensors,
and pushing fires — instead of driving a single unit around.

The map is your *picture*. The truth is what your drones can see.

---

## The idea

You don't control soldiers directly — you command. The 2D map shows MIL-STD-2525 symbology
over procedural terrain, with recon-driven fog of war: enemy positions are only what your
units, sensors, and installations can actually detect. To get **ground truth** you deploy
UAS and watch their 3D EO/IR sensor feeds, lock targets, and clear fires. Meanwhile your
units run battle drills, your logistics chain keeps the supply flowing, and a tactical enemy
AI maneuvers against you — all narrated over a synthesized radio net.

## Features

- **Blue Force Tracker map** — MIL-STD-2525 symbols, 1 km grid, procedural terrain with real
  hydrology (drainage-derived rivers, depression lakes), roads, and towns. Day/night mode.
- **Recon-driven fog of war** — contacts, spot reports, last-known positions; you see what you
  can sense.
- **Maneuver units** modeled down to **individual vics/troops** (sub-elements), so precision
  fires hit specific platforms. Mounted/dismounted posture, battle drills (push / halt / break
  contact), weapons control, dig-in, and cover.
- **Deployable UAS with live 3D sensor feeds** (draggable, resizable, up to 4 at once): Shadow,
  Sentinel, armed Viper, hand-launched Raven, Switchblade loitering munition, and a tethered
  aerostat — each with its own camera modes (WHOT / BHOT / EO / NVG), lock/follow, and orbit
  controls.
- **AC-130 Spectre gunship** — a called-in fire-support platform with its own thermal gun-cam
  feed and a three-gun suite (25 mm / 40 mm / 105 mm). Ballistic rounds with real dispersion and
  time-of-flight, burst fire, per-weapon fire modes (fire-at-will / designated / hold), and a
  left-hand pylon-turn orbit that only engages inboard of its killbox.
- **Fires & logistics** — mortars/artillery, drone strikes, HQ/FOB supply stock, resupply
  convoys, engineer-built forward bases.
- **Installations** — observation posts, command post, forward operating bases, airfields.
- **Tactical enemy AI** — task-organized battlegroups that muster, screen with recon, advance as
  a paced group, and withdraw when attrited, using the *same* order code as the player.
- **Synthesized radio net** — a JBC-P-style NET log plus procedurally generated radio chatter:
  squelch/click/static and a per-unit "mumble" voice (each callsign gets a stable pitch/timbre),
  with contact traffic sounding more urgent than routine. Feed audio (gun reports, impacts,
  platform engine ambients) is gated to whatever feed you're watching. Everything is generated
  with the Web Audio API — no external sound assets. Global mute in the top bar.

See **[ROADMAP.md](ROADMAP.md)** for what's planned (game modes, attack helicopters, air
defense / SEAD, weather, radio channels, multi-window/multi-monitor, and much more).

## Tech

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/) (no StrictMode)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [Three.js](https://threejs.org/)
  for the drone sensor feeds
- [zustand](https://github.com/pmndrs/zustand) for UI state; the simulation is a single mutable
  module singleton stepped by a fixed loop
- [simplex-noise](https://github.com/jwagner/simplex-noise.js) for terrain
- Procedural audio via the Web Audio API

## Getting started

```bash
npm install
npm run dev      # dev server on http://localhost:5187
npm run build    # production build
npm run preview  # preview the build
```

## Controls

**Map**
- **Left-click** — select a unit, or issue an order to the current selection
- **Left-drag** — marquee select (empty) or spread the selection along a formation line
- **Right-click** — deselect / context menu
- **Right-drag** — pan · **WASD** — pan · **scroll** — zoom
- **Shift-click** — queue a waypoint · **Del** — remove the last waypoint
- **Q / E** — MOVE / ATTACK command mode

**Drone feeds**
- Drag the title bar to move a feed; drag the corner to resize; up to **4** feeds
- Slew the sensor by dragging in the viewport; scroll to zoom; double-click to recenter
- **LOCK** freezes the camera on the current aim point
- Click a vic to designate it as a target (**CTRL+click** for multiple); **FIRE** engages

## Dev tools

The top bar exposes dev controls (fog toggle, supply). In the browser console the whole sim is
reachable via `window.__game` — e.g. `__game.reveal()`, `__game.fog(false)`, `__game.deployDrone`,
`__game.advance(seconds)` for deterministic headless stepping, and `__game.S` for the live state.

> **Status:** early work in progress — expect rough edges, and see the roadmap for direction.

## License

[MIT](LICENSE)
