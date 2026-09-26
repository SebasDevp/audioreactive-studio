# AudioReactive Studio v0.11.3 · SebasDevp

Versión de estabilidad del motor visual. Mantiene los 19 mundos, Personality Engine, transiciones generativas, overlays, Vegvísir, OUTPUT y Auto FPS, pero cambia la arquitectura GPU para evitar previews negros y compilaciones monolíticas.

## Cambio principal: Modular GPU Engine

Antes todos los presets vivían dentro de un único fragment shader enorme. En algunas GPUs/Chromium eso podía compilar lentamente o directamente dejar el preview negro.

Ahora:

- cada preset tiene su propio shader compacto;
- en estado normal se renderiza **un solo preset + bloom**;
- durante una transición se renderizan sólo **dos presets** y un shader de mezcla;
- si un preset particular falla al compilar, activa un fallback audio-reactivo sin tumbar el resto del motor;
- no se espera una compilación gigante durante el arranque.

## Presets

1. Cosmic Particles
2. Neon Flow
3. Sacred Dust
4. Angelic Particles
5. Techno Tunnel
6. Quantum Dust
7. Fibonacci Bloom
8. Rune Pulse · Vegvísir
9. Symbol Forge
10. Seed World
11. Flower of Life Nexus
12. Artifact Shrine
13. Entity Gate
14. Dynamic Panels
15. Matrix Rain
16. Merkaba Prism
17. Liquid Resonance
18. Galactic Bloom
19. Frequency Tree

## Arranque

```bash
npm run dev
```

Web:

```bash
npm run dev:web
```

Build Cloudflare:

```bash
npm run build:web
```

## Actualización

Copiá el contenido de esta carpeta sobre el proyecto actual. Conservá `.git`, `node_modules` y tu `package-lock.json` actual.
