# AudioReactive Studio v0.16.1 · Arcane Tree Stable

- Corrige el árbol 3D invisible de v0.16.0.
- Material visible: base blanca + colores por instancia; evita doble oscurecimiento.
- Iluminación recalibrada para Three.js r186.
- Árbol permanente basado en el principio recursivo de `Arbol.html`: tronco, raíces, tres ramas maestras y bifurcación doble.
- Las puntas pasan del esqueleto permanente al crecimiento musical persistente.
- Graves: longitud/cuerpo. Medios: curvatura/dirección. Agudos + flux: bifurcación.
- Al bajar la energía se retrae sólo el crecimiento dinámico; la anatomía del árbol permanece.
- El árbol ya no usa el gate de luminancia de los presets abstractos.
- Bloom y exposición quedan contenidos para preservar detalle.
