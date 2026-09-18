import { VisualEngine } from './visual-engine.js';
import { platform } from './platform-bridge.js';

const output = document.getElementById('output');
const engine = new VisualEngine(output, { isOutput: true, quality: 'high' });

const savedLogo = localStorage.getItem('ars_logo_data') || '';
if (savedLogo) engine.setState({ logoDataUrl: savedLogo });

platform.onVisualState((state) => {
  const next = { ...state };
  if (!next.logoDataUrl && savedLogo) next.logoDataUrl = savedLogo;
  engine.setState(next);
});

const fullscreenButton = document.getElementById('webFullscreen');
if (fullscreenButton) {
  fullscreenButton.hidden = !platform.isWeb;
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      console.error(error);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.textContent = document.fullscreenElement ? 'Salir de fullscreen' : 'Entrar en fullscreen';
    document.body.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement));
  });
}
