# v0.18.0 · Organic Visuals Master

Base: `audioreactive-studio-v0.17.0-arcane-living-tree-2.0.zip`. Se preservan las 24 plantillas, entradas de audio, arquitectura modular, Electron y salida web.

## Árbol

Geometría determinista conservada: 806 recorridos de ramificación, 29.236 segmentos filamentarios y 683 anclajes. La extensión se integra por la jerarquía: cada hija hereda el desplazamiento de su nacimiento. Varía entre −0.014 y +0.041 y pesa más en ramas finas; no se reconstruye la copa por frame.

Agudos, transitorios y envolvente musical regulan la extensión y el revelado de puntas. Ataque y relajación tienen tiempos diferentes. Graves transportan ondas luminosas por la estructura; medios mantienen torsión y balanceo.

Se retiran los cilindros internos estáticos para evitar núcleos sólidos desalineados. Un atributo de desplazamiento estático mantiene la deformación en GPU.

Partículas en anclajes visibles, incluyendo deformación y giro actuales. Tras nacer pasan a coordenadas del mundo. Pool fijo de 288, duración finita y silencio sin nuevos nacimientos.

Render target HalfFloat cuando el contexto lo admite, fallback UnsignedByte; MSAA 2 en High y 4 en Ultra, limitado por el dispositivo. Bloom y opacidad recalibrados. Mejor encuadre vertical y controles reales de órbita/inclinación/FOV.

## Movimiento y visuales

- Giro de 0 a 1 rpm con aceleración/frenado suaves, independiente del reloj temporal.
- Ángulo ±45°, inclinación ±35°, profundidad 0–1 y centrado.
- Matrix: reloj integrado; elimina la doble aplicación de velocidad y posiciones calculadas con tasas variables de audio. Tres planos con velocidades deterministas y parallax; caída continua y piso luminoso en silencio.
- Vegvísir: fondo de glifos variables sustituido por aurora, filamentos de bordes suavizados y ondas. Símbolo original, perspectiva y aura alineada.
- Envolventes compartidas en función del tiempo y apagado de señal obsoleta. Decaimiento de pulsos y memoria ajustado al tiempo de frame. Evolución lenta continua de la paleta.
- Corrección del identificador GLSL reservado `active` en Mycelium Network, que en Chromium forzaba el renderer de compatibilidad.

## Recursos estudiados

Se analizaron el audio, render por capas, memoria visual e instrucciones de compilación web del paquete adjunto. La implementación usa código propio en Three.js: ataque/relajación temporal, composición a distintas escalas, deformación coherente y evolución musical. No incluye ni ejecuta el motor nativo C++/OpenGL, ni copia sus presets. Una integración directa requeriría una compilación WebAssembly y un puente específico, fuera de esta versión.

Sin nuevas dependencias de ejecución. Se incluyen `package-lock.json`, build `dist` y pruebas del modelo.
