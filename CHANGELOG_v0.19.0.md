# v0.19.0 · Musical Autopilot

- Director musical compartido para CONTROL y OUTPUT, sin decisiones aleatorias independientes por ventana.
- AUTO visual al comienzo de Visual Engine; combinación gradual de cámara, perspectiva, paletas, giro moderado, intensidad, Bloom, densidad, crecimiento, flujo, waveform y memoria.
- Transiciones por conteo de beats: comienzan en límites de frases de 16 / 24 / 32 beats y completan en 2 / 4 pulsos. El silencio no fuerza cambios por timeout.
- Selección distribuida de las 24 visuales y preparación anticipada del shader siguiente.
- Límites de exposición y compresión de luces altas en AUTO. Menor frecuencia de checkpoints web durante la automatización.
- AUTO logo separado: composición, copias, posición, tamaño, color y rotaciones pequeñas al beat; sin parpadeo automático agresivo.
- Restauración de controles y orientación de giro al desactivar cada modo. Los ajustes manuales no se sobrescriben.
- Árbol 3.1: 56 trayectos de raíces curvas bifurcadas, taper y uniones heredadas.
- Ocho ondas de energía coexistentes desde las raíces hacia el tronco y las ramas, impulsadas por beats y transitorios graves.
- Control de crecimiento geométrico real, sensible a la intensidad y a la energía de agudos; desplazamiento contenido y relajación suave.
- Se conserva la emisión de partículas desde puntos deformados del árbol.
- Se incluyen código, build web, lockfile y pruebas del modelo.

