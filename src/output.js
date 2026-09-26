import { VisualEngine } from './visual-engine.js';
import { platform } from './platform-bridge.js';

const output = document.getElementById('output');
const loading = document.getElementById('outputLoading');
const engine = new VisualEngine(output, { isOutput: true, quality: 'high' });

const savedLogo = localStorage.getItem('ars_logo_data') || '';
if (savedLogo) engine.setState({ logoDataUrl: savedLogo });

platform.onVisualState((state) => {
  const next = { ...state };
  if (!next.logoDataUrl && savedLogo) next.logoDataUrl = savedLogo;
  engine.setState(next);
});

const prepareEngine = async () => {
  try {
    const result = await engine.prepare({
      allowBlockingFallback: true,
      onStatus: (message) => {
        if (loading) loading.textContent = message;
      }
    });
    if (result?.ready && loading) {
      loading.textContent = 'VISUAL ENGINE READY';
      requestAnimationFrame(() => loading.classList.add('is-ready'));
      setTimeout(() => loading.remove(), 420);
    }
  } catch (error) {
    console.error('Output visual engine init error:', error);
    if (loading) loading.textContent = 'VISUAL ENGINE ERROR · CHECK CONSOLE';
  }
};

// The output lives in its own renderer/window, so its GPU preparation never blocks CONTROL.
requestAnimationFrame(() => prepareEngine());

const fullscreenButton = document.getElementById('outputFullscreen');
if (fullscreenButton) {
  fullscreenButton.hidden = false;
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (platform.isElectron) {
        const active = await platform.toggleOutputFullscreen();
        fullscreenButton.textContent = active ? 'Salir de fullscreen' : 'Entrar en fullscreen';
        document.body.classList.toggle('is-fullscreen', Boolean(active));
        return;
      }

      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      console.error('Output fullscreen error:', error);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (platform.isElectron) return;
    fullscreenButton.textContent = document.fullscreenElement ? 'Salir de fullscreen' : 'Entrar en fullscreen';
    document.body.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement));
  });
}
