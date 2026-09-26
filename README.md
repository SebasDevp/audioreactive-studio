# AudioReactive Studio v0.14.1 · Stable Living Engine

AudioReactive Studio is a desktop/web audiovisual performance instrument by SebasDevp.

## Highlights in v0.14
- 24 modular generative worlds.
- Rebuilt **Tree of Life · Living Tendrils** with a strong trunk, roots and long frequency-driven branches that retract when musical energy falls and extend far beyond the viewport during sustained highs.
- Re-timed **Matrix Rain** so very low speed values genuinely suspend the falling code.
- New internal spectral metrics: **flux** and **centroid** for more musical mutation and direction.
- New spatial memory stage with **trails**, **memory warp** and **echo zoom**.
- Expanded audio waveform modes: Line, Double Line, Radial, Flower, Lasso and Spiro.
- Five new scenes:
  - Aurora Veil
  - Feedback Cathedral
  - Mycelium Network
  - Luminous Vortex
  - Spectral Spirograph
- Adaptive render resolution remains enabled in HD mode for stable FPS.
- Modular shader compilation keeps one bad preset from taking down the entire engine.

## Run desktop
```powershell
npm run dev
```

## Run web
```powershell
npm run dev:web
```

## Build web
```powershell
npm run build:web
```

Cloudflare Pages:
- Build command: `npm run build:web`
- Output directory: `dist`

## Suggested first test
1. Connect system audio.
2. Tree of Life · Living Tendrils:
   - Memory: 0.25
   - Memory Warp: 0.20
   - Echo Zoom: 0.18
   - Randomness: 0.55
3. Move temporal speed from 0.04 to 0.88 in Matrix Rain.
4. Try Aurora Veil / Feedback Cathedral / Mycelium Network / Luminous Vortex / Spectral Spirograph.
5. Turn on Flower or Spiro waveform and raise its gain gradually.

## Performance
`Performance` quality disables the expensive memory-warp and afterimage passes. `HD / Adaptativa` is the recommended live-performance mode.
