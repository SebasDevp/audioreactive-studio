# Validación v0.18.0

## Automatizada

- Comprobación sintáctica de los módulos JavaScript modificados.
- Build de producción Vite con las dependencias reales del proyecto.
- `npm test`: cinco pruebas con objetos Three.js reales, sin contexto de render para esas pruebas del modelo:
  - Extensión, relajación, anatomía inmutable y datos finitos.
  - Emisión y apagado de partículas; densidad cero; independencia del giro.
  - Cámara y targets en horizontal, vertical y formato ancho, con controles extremos.
  - Envolventes y decaimiento comparados a 30, 60 y 120 FPS.
  - Límite de una vuelta por minuto.

## Renderizado en navegador

Chromium headless con WebGL mediante SwiftShader. Las 24 plantillas se compilaron y renderizaron sin errores de shader ni JavaScript en la prueba final.

Se inspeccionaron capturas del árbol en silencio, con bandas musicales simuladas, Bloom = 0, perspectiva y vertical; Matrix en silencio a velocidad normal/mínima y con perspectiva; Vegvísir con señal. Se verificaron los controles de giro/cámara transmitidos desde la interfaz y el botón de centrado. El build compilado se abrió también como sitio estático: CONTROL y OUTPUT cargaron y recibieron estados por BroadcastChannel sin errores.

La banda alta produjo crecimiento y partículas activas. El reloj de Matrix avanzó en silencio y a velocidad mínima. Son señales sintéticas, no una medición de respuesta a una canción específica.

## Límites

El render de software valida compilación y comportamiento visible, no rendimiento de tu placa gráfica. No se probó captura de micrófono real, loopback de Windows, permisos de pantalla ni una sesión Electron en Windows. Esas rutas se conservan y deben verificarse en el equipo de uso.

## Prueba en tu equipo

1. Tema con graves y platos claros: graves transportan luz; agudos abren puntas y liberan partículas.
2. Detener audio: relajación suave, árbol visible y partículas que se extinguen.
3. Regular/desactivar giro: transición suave y velocidad máxima moderada.
4. Probar ángulo, inclinación, centrado y zoom en OUTPUT.
5. Matrix: caída en silencio y velocidad sin saltos de columnas.
6. Vegvísir: fondo, símbolo completo y perspectiva con música.
7. Elegir High/Performance según fluidez y verificar OUTPUT.
