# Validación v0.19.0

## Modelo y build

- `npm test`: 13 pruebas aprobadas.
- Sincronización de decisiones con beats reales del estado de análisis; ausencia de cambios de escena inventados durante silencio.
- Exploración de las 24 visuales en una sesión sintética prolongada, sin repeticiones consecutivas.
- Límites de exposición, Bloom, densidad, feedback, cámara y giros; entrada segura desde valores manuales extremos.
- Independencia de AUTO visual / AUTO logo y restauración de todos los valores manuales.
- Cambio de longitud geométrica por crecimiento e intensidad; extensión contenida, cámara en distintos formatos y partículas independientes.
- Raíces bifurcadas con travel negativo; coexistencia de ondas graves anteriores y nuevas.
- Envolventes comparadas a 30 / 60 / 120 FPS y límite de giro manual de una vuelta por minuto.
- Build de producción Vite con las dependencias reales y metadatos v0.19.0.

## Navegador y render

Chromium headless con WebGL mediante SwiftShader. Las 24 visuales se compilaron y renderizaron sin errores de shader ni JavaScript.

Prueba de integración con el director y el renderer reales: inicio de cue al beat, idempotencia de mensajes repetidos, pausa de la transición antes del último beat en silencio, progreso intermedio y finalización al recibir el pulso de cierre. Restauración de escena, exposición y orientación; logo estático durante AUTO visual y restauración del giro previo después de AUTO logo.

Se compararon capturas del árbol con crecimiento 0 y 1 bajo las mismas bandas sintéticas. La extensión pasó aproximadamente de 0.0004 a 0.1713; el cambio visible corresponde a coordenadas de ramas, no solo a brillo o zoom. Se renderizaron las raíces con una onda grave activa.

La interfaz se probó con transmisión de estados, bloqueo de controles dirigidos, recuperación de valores y carga de logo para habilitar su propio AUTO. El código de acceso a estado usado por esa prueba pertenece al servidor privado de QA y no está incluido en el proyecto entregado.

El build estático se abrió como CONTROL y OUTPUT; se verificaron el árbol, Matrix, Vegvísir y los dos controles AUTO del build compilado, con recuperación del modo manual.

## Alcance

Las bandas y beats de estas pruebas son sintéticos. SwiftShader valida compilación y comportamiento visible; no mide rendimiento de la GPU del equipo de uso. No se probó captura de micrófono físico, loopback de Windows ni una sesión Electron en Windows. Las rutas existentes se conservan.

## Recorrido con música

1. Conectar audio y comprobar los medidores.
2. Activar AUTO visual: las primeras variaciones aparecen al beat y los cambios de escena esperan las frases de 16 / 24 / 32 pulsos detectados.
3. Con un logo Original de una copia y sus efectos manuales apagados, comprobar que AUTO visual lo mantiene estático.
4. Probar AUTO logo solo y después ambos AUTO juntos.
5. Desactivar cada uno y comprobar los controles y la orientación manual previa.
6. En Tree of Life, comparar el control de crecimiento y distintas intensidades; escuchar graves para las ondas ascendentes y agudos para ramas / partículas.
7. Detener el audio: las decisiones esperan nuevos pulsos y el árbol se relaja suavemente.
8. Elegir la calidad que mantenga fluidez en el equipo de uso.

