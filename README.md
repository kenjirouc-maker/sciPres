# EVOQUEST presentation

A 10-slide cinematic keynote for EVOQUEST. It builds into **one self-contained HTML file**
(`dist/EVOQUEST_Presentation.html`) that runs offline: double-click it, or host it anywhere.

## Commands
```bash
npm install        # three, postprocessing (runtime) + esbuild (build only)
npm run build      # -> dist/EVOQUEST_Presentation.html
npm run dev        # -> http://localhost:8000, rebuilds on reload
```

## Structure
| Path | What it is |
|---|---|
| `src/index.html` | Slides, styles, embedded fonts (all presentation content lives here) |
| `src/deck.js` | Navigation, text reveals, Tree of Science, HUD, camera poses per slide |
| `src/world/world3d.js` | Three.js scene + postprocessing chain, quality tiers, adaptive resolution |
| `src/world/relics.js` | Procedural 3D models: atom, flask, DNA, planet, crystal, chip |
| `src/world/textures.js` | Procedural textures (pixel-art voxels, planet bands, circuits, glows) |
| `src/world/world2d.js` | Original canvas renderer, used automatically when WebGL2 is unavailable |
| `src/sfx.js` | Synthesised sound (Web Audio, no audio files) |

## Controls
`→`/`Space`/click right: next · `←`/click left: back · swipe on touch · `F` fullscreen · `M` sound · `P` FPS overlay

## URL options (for testing)
`?fps` show FPS overlay · `?quality=low|high` force a tier · `?adaptive=0` fixed resolution · `?world=2d` force the canvas fallback
