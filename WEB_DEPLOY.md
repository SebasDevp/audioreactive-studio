# Publicar AudioReactive Studio en la Web

## 1. Probar primero en tu PC

Desde la carpeta del proyecto:

```powershell
npm run dev:web
```

Abrí `http://localhost:5173`.

Probá:
- preview
- micrófono
- captura de pestaña de YouTube con audio
- presets
- logo
- OPEN OUTPUT
- comunicación entre CONTROL y OUTPUT

## 2. Verificar el build

```powershell
npm run build:web
```

Debe aparecer la carpeta `dist`.

Opcionalmente podés probar exactamente ese build con:

```powershell
npm run preview:web
```

## 3. Subir v0.8 a GitHub

```powershell
git add .
git commit -m "AudioReactive Studio v0.8 web mode"
git push
```

## 4. Conectar GitHub a Cloudflare Pages

Usar:

```text
Repository: SebasDevp/audioreactive-studio
Production branch: main
Build command: npm run build:web
Build output: dist
```

Cloudflare dará una URL temporal `*.pages.dev`. Después se puede conectar un subdominio propio como `visuals.soyfranconi.com`.

## Importante

La versión web funciona mejor en Chrome o Edge. La posibilidad exacta de compartir audio de una ventana/pantalla depende del navegador y del sistema operativo. Para YouTube, la opción más fiable es compartir directamente la pestaña con **Compartir audio** activado.
