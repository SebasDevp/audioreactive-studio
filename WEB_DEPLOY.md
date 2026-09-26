# Deploy Web · AudioReactive Studio v0.11.1

La versión web está optimizada para carga progresiva: la interfaz entra primero y el motor Three.js/shader se solicita después. Los assets con hash generados por Vite pueden ser cacheados por Cloudflare.

## Cloudflare Pages

- Production branch: `main`
- Build command: `npm run build:web`
- Build output directory: `dist`
- Root directory: vacío

## Publicar

```bash
git add .
git commit -m "AudioReactive Studio v0.11.1 fast boot"
git push
```

Cloudflare Pages reconstruirá el proyecto automáticamente.
