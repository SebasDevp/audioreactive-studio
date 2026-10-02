# Checklist de prueba local · Arcane Living Tree 2.0

Usar el ZIP completo; instalar dependencias si es primera instalación: `npm install`; iniciar `npm run dev`.

1. Elegir preset 18 (Tree of Life · Arcane Living Tree). Debe verse un árbol con tronco, raíces y copa filamentosa SIN música.
2. Zoom: cambiar 1.00 → 0.35 → 2.50: la cámara debe alejarse/acercarse de forma suave y mostrar detalle real de las ramificaciones; volver a 1.00. Probar OUTPUT vertical y horizontal.
3. Bloom 0.00: ramas legibles sin halo. Luego 0.82 y 1.40: halo progresivo; sin blancos permanentemente quemados. Volver a 0.82.
4. Partículas/densidad 0.20 vs 3.00 con música con agudos: debería variar la tasa de emisión desde la copa, no el tamaño global del árbol.
5. Música con kick/sub: expanden la estructura; ante golpe detectado debe viajar una señal luminosa a lo largo del árbol.
6. Música melódica/medios: la copa se mece y sus ramas se deforman coherentemente. Hi-hats/transitorios: microdestellos y emisión temporal.
7. Silencio: debe quedar la anatomía, con movimiento respiratorio leve y sin saturación.
8. Cambiar desde/hacia preset 18 repetidas veces. Verificar que no haya pantalla negra, errores WebGL ni modificación de los otros 23 presets.
9. Comprobar CONTROL y OUTPUT, captura de mic/loopback/ventana y fullscreen como en v0.16.1.
10. En consola DevTools, informar cualquier error con captura de pantalla junto con los valores de Zoom, Bloom, Densidad e Intensidad utilizados.

Nota: `npm run dev` abre el proyecto Vite + Electron. Si se desea solo el navegador: `npm run dev:web`.
