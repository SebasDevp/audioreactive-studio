# AudioReactive Studio v0.7

Versión de corrección y pulido general del motor visual.

## Corrección principal: preview negro
La v0.6 tenía un error en el shader de las nuevas escenas Matrix/Merkaba: parte del código visual había quedado en el shader equivocado y `triOutline` no estaba definido en el fragment shader. Eso podía hacer fallar la compilación completa del material y dejar el preview negro aunque el audio siguiera entrando.

En v0.7:
- shader corregido
- Matrix y Merkaba dentro del fragment shader correcto
- `triOutline` agregado correctamente
- diagnóstico visible si en el futuro un shader vuelve a fallar

## Vegvísir
- usa la imagen exacta incluida en `src/assets/vegvisir.png`
- gira de forma continua y suave
- bajos: respiración / escala
- medios: velocidad de giro
- agudos: aura / eco / excitación de color
- beat: expansión y presencia
- silencios: la presencia cae de forma natural
- segunda copia fantasma muy sutil para dar profundidad sin reemplazar el símbolo original

## Logo
- giro corregido: al activar el checkbox comienza desde su posición actual, sin salto
- cambio de color reforzado
- duplicación y separación reparadas
- corregido el tamaño duplicado que antes se aplicaba dos veces
- modos ring / line / mirror / stack más estables

## Visuales
- transiciones de velocidad suavizadas
- cambios internos de patrón disparados por beats
- bajo = expansión / escala
- medios = torsión / rotación / mutación
- agudos = partículas / detalle / color
- volumen = presencia general
- mayor respeto por silencios
- tone mapping más suave para evitar blancos quemados
- bloom más controlado

## Color
Se mantiene la barra **Fusión de color** para recorrer y fusionar Color A y Color B. Ahora también participa de forma más estable en Matrix, Merkaba y los cambios generativos.

## Nuevos presets de la rama v0.6/v0.7
- Matrix Lattice
- Merkaba Prism

## Presets actuales
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
15. Matrix Lattice
16. Merkaba Prism

## Atajos
- `1` a `0` → presets 1 al 10
- `Q W E R T Y` → presets 11 al 16

## Cómo actualizar
1. Cerrá AudioReactive Studio.
2. En la terminal hacé `Ctrl + C`.
3. Descomprimí `audioreactive-studio-v0.7.zip`.
4. Abrí la carpeta `audioreactive-studio-v0.7`.
5. Copiá todo su contenido sobre tu carpeta actual `audioreactive-studio`.
6. Elegí **Reemplazar archivos en el destino**.
7. No borres `node_modules`.
8. Ejecutá:

```bash
npm run dev
```
