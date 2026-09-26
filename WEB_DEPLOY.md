# AudioReactive Studio v0.14.1 · Web deploy

Cloudflare Pages settings:
- Branch: `main`
- Build command: `npm run build:web`
- Build output directory: `dist`

After replacing the project files:

```powershell
npm run build:web
git add .
git commit -m "AudioReactive Studio v0.14 Living Systems"
git push origin main
```

Cloudflare will deploy automatically from `main`.
