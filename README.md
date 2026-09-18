# AudioReactive Studio v0.8 · Desktop + Web

AudioReactive Studio ahora puede ejecutarse de dos maneras desde el mismo proyecto:

- **Desktop / Electron**: mantiene la experiencia actual, selección de pantallas y workflow de escritorio.
- **Web / Browser**: abre el estudio directamente desde Chrome/Edge, captura una pestaña/ventana/pantalla mediante el selector seguro del navegador y permite abrir una ventana OUTPUT independiente.

## Ejecutar Desktop

```bash
npm run dev
```

## Ejecutar Web en desarrollo

```bash
npm run dev:web
```

Después abrir:

```text
http://localhost:5173
```

`index.html` redirige automáticamente a `control.html`.

## Capturar YouTube en Web

1. Tocá **Elegir fuente + audio**.
2. En Chrome/Edge elegí **Pestaña**.
3. Seleccioná la pestaña donde está YouTube.
4. Activá **Compartir audio**.
5. Reproducí música.

Los medidores LEVEL / BASS / MID / TREBLE deberían comenzar a reaccionar y alimentar el motor visual.

Para intentar capturar audio general del equipo, usá **Elegir pantalla / audio del sistema** y seleccioná la opción de audio que ofrezca el navegador/SO.

## OUTPUT en Web

El botón de OUTPUT abre `output.html` en una segunda ventana. CONTROL y OUTPUT se sincronizan mediante `BroadcastChannel`.

En la ventana OUTPUT aparece el botón **Entrar en fullscreen**. Llevá esa ventana al proyector/TV y activá fullscreen allí.

## Build Web

```bash
npm run build:web
```

Vite genera:

```text
dist/
```

Esa carpeta es la versión estática que puede publicar Cloudflare Pages.

## Cloudflare Pages

Configuración de build:

```text
Framework preset: Vite
Build command: npm run build:web
Build output directory: dist
```

Node recomendado: 22.

## GitHub workflow

Cuando reemplaces la versión anterior por esta:

```bash
git add .
git commit -m "AudioReactive Studio v0.8 web mode"
git push
```

Después Cloudflare Pages puede conectarse al repositorio y desplegar automáticamente cada nuevo push.

## Diferencias Web vs Desktop

### Desktop
- Electron controla la ventana OUTPUT.
- Puede enumerar pantallas/ventanas mediante APIs de Electron.
- Es la base ideal para futuras integraciones nativas (por ejemplo WASAPI por proceso).

### Web
- Por privacidad del navegador no puede enumerar silenciosamente Chrome/Rekordbox/otras apps.
- Al capturar, Chrome/Edge muestra su selector oficial y el usuario elige la pestaña, ventana o pantalla.
- Micrófono y captura requieren contexto seguro: `https://` en producción o `localhost` durante desarrollo.

## Arquitectura v0.8

```text
src/
├── audio-engine.js
├── visual-engine.js
├── platform-bridge.js   ← detecta Desktop vs Web
├── control.js
├── output.js
└── assets/

Electron ─┐
          ├── mismo motor visual/audio
Browser ──┘
```

El objetivo es que los próximos presets y mejoras se programen una sola vez y funcionen tanto en Desktop como en Web.
