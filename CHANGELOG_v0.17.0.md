# AudioReactive Studio v0.17.0 · Arcane Living Tree 2.0

Base: ZIP ORIGINAL `audioreactive-studio-v0.16.1-arcane-tree-stable(1).zip`, no se utilizó la versión auditada/limpia.

## Alcance

- Nuevo `src/arcane-living-tree.js`: generador 3D de copa asimétrica de energía filamentosa. Anatomía estable, 806 recorridos ramificados y ~29.236 secciones filamentarias con la configuración predeterminada; no reconstruye toda la copa en cada frame. Su silueta sigue visible en silencio.
- Deformación continua en GPU por bandas: respiración subgrave y graves, torsión de copa por medios, modulaciones luminosas y partículas por agudos. Onda de energía viaja desde la base hacia puntas cuando se detecta un pulso grave/beat. Puntas finas se revelan progresivamente con la energía musical.
- Zoom corregido: usa distancia de la cámara de perspectiva en lugar de modificar unas UV que el preset 18 no usaba para su textura 3D. Incluye encuadre dependiente del formato y clipping extendido.
- Bloom preset 18: se retira la atenuación excesiva y se calibra el umbral para filamentos, manteniendo el mismo control existente; Bloom=0 conserva la estructura sin halo. Otros presets conservan su configuración de Bloom.
- Partículas ancladas a extremos/bifurcaciones (no lluvia aleatoria), con BufferAttribute sobre el array dinámico real, nacimiento musical, deriva y muerte acotada; máximo 176. Control «Partículas / densidad» afecta la emisión.
- Centro tenue construido con instancias y fibras visibles a Bloom=0. La anatomía tiene prioridad sobre los efectos añadidos.
- WebGL: se habilita depth buffer para composición 3D (los shaders fullscreen siguen con depthTest=false).

## Archivos cambiados

- `src/visual-engine.js`: import/integración exclusiva en preset 18; habilitar buffer de profundidad; calibrar Bloom del árbol; retira 574 líneas del renderer anterior sustituidas por delegación; se mantienen intactos los 23 mundos shader y sus definiciones.
- `src/arcane-living-tree.js`: nuevo módulo autónomo Three.js.
- `package.json`: versión/metadatos, mismas dependencias/scripts.
- `README.md`: instrucciones de la nueva versión.
- Se añaden este changelog y `ARCANE_TREE_TEST_PLAN.md`.

## Validación realizada y límites

- `node --check`: código JavaScript sin errores sintácticos.
- Prueba funcional del modelo de escena con objetos Three.js simulados (sin WebGL): topología, datos finitos, buffers dinámicos compartidos, cámara/zoom, audio, emisión de partículas, pulso y liberación de recursos: pasó.
- No se pudo ejecutar `npm run dev` ni un render visual/GPU real aquí porque no hay dependencias instaladas y el registro npm no es accesible (ENOTCACHED/EAI_AGAIN). No se debe interpretar la simulación como una certificación de renderizado real en Chrome/Electron. El test de usuario es necesario.
