# AudioReactive Studio v0.19.0 · Musical Autopilot

Instrumento audiovisual audio-reactivo de SebasDevp. Esta versión continúa v0.18.0 y conserva las rutas de audio, las 24 visuales y las ventanas CONTROL / OUTPUT.

## Novedades

- **AUTO · RANDOMIZACIÓN MUSICAL**, al comienzo de Visual Engine. Un único director musical coordina CONTROL y OUTPUT: combina visuales, paletas, intensidades, giro, cámara, densidad, waveform y memoria sin sobrescribir tus ajustes manuales.
- Cambios de visual cada 16, 24 o 32 beats detectados, con transiciones suaves de 2 o 4 beats. Prepara el shader siguiente con anticipación y distribuye las 24 visuales sin repeticiones consecutivas.
- Movimiento y color evolucionan suavemente entre pulsos. Intensidad, Bloom, memoria y giros tienen límites propios para contener el brillo y mantener la imagen legible.
- **AUTO · LOGO AL BEAT**, independiente. Después de cargar un logo, puede variar composición, copias, tamaño, posición, color y pequeños giros al beat. AUTO visual mantiene el logo con sus ajustes manuales.
- Al apagar cada AUTO se recuperan sus controles manuales y la orientación de giro previa. Podés usar cualquiera de los dos por separado o ambos juntos.
- Árbol: 56 trayectos de raíces curvas y bifurcadas, con uniones continuas y puntas afinadas.
- La energía viaja desde las raíces hacia la copa con beats y transitorios graves. Varias ondas coexisten: un nuevo golpe no reinicia el recorrido anterior.
- **Crecimiento del árbol** cambia realmente la longitud de las ramas. La intensidad y los agudos añaden expansión musical contenida; la forma se relaja cuando cae la señal. Las partículas siguen naciendo desde las ramas deformadas.

## Ejecutar

Node.js 22.12 o superior. Dentro de esta carpeta:

```sh
npm install
npm run dev:web
```

Para Electron: `npm run dev`.

Para compilar la web: `npm run build:web`. La carpeta `dist` incluida puede servirse como sitio estático. Los módulos y la captura de audio requieren un servidor, localhost o HTTPS.

Pruebas del modelo: `npm test`.

## Empezar a escuchar

1. Conectá el audio y comprobá que se muevan los medidores.
2. Activá **AUTO · RANDOMIZACIÓN MUSICAL** al principio de Visual Engine.
3. Dejá sonar el tema: los primeros beats construyen la variación y los cambios de visual llegan al completar frases de 16, 24 o 32 beats detectados.
4. Para dejar el logo estático, mantené **AUTO logo**, **Titilar**, **Pulso**, **Giro** y **Color FX** apagados, con una copia y color Original.
5. Si querés automatizar también el logo, cargalo y activá su propio AUTO.
6. Apagá cualquiera de los dos para recuperar sus ajustes manuales.

Los controles que dirige cada AUTO se bloquean mientras está activo y muestran tus valores manuales guardados. El estado del módulo indica la visual que está sonando y el tempo estimado.

En silencio no se inventan beats ni cambios de escena: las decisiones generativas esperan señal y una transición musical en curso espera los pulsos que le faltan. Las animaciones continuas de cada visual conservan su comportamiento; Matrix sigue descendiendo.

## Árbol en modo manual

Seleccioná **Tree of Life · Arcane Living Tree**. **Crecimiento del árbol** regula su extensión real; la música e intensidad modulan esa base suavemente. Empezá cerca de 0.55. Los graves envían ondas desde las raíces, los agudos abren las ramas y desprenden partículas.

Se mantienen el giro independiente de hasta una vuelta por minuto, las perspectivas, Matrix con velocidad continua y el fondo mejorado de Vegvísir.

Ver `CHANGELOG_v0.19.0.md` y `VALIDACION_v0.19.0.md`.
