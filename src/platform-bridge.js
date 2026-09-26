const CHANNEL_NAME = 'audioreactive-studio-v014';
const STATE_KEY = 'ars_web_visual_state_v014';
const isElectron = Boolean(window.studioAPI);

let webOutputWindow = null;
let channel = null;
let lastPersistedState = '';

if (!isElectron && 'BroadcastChannel' in window) {
  channel = new BroadcastChannel(CHANNEL_NAME);
}

function webDisplayDescriptor() {
  return [{
    id: 'browser-output',
    label: 'Ventana del navegador · OUTPUT',
    bounds: {
      width: window.screen?.width || window.innerWidth,
      height: window.screen?.height || window.innerHeight
    },
    workArea: {
      width: window.screen?.availWidth || window.innerWidth,
      height: window.screen?.availHeight || window.innerHeight
    },
    scaleFactor: window.devicePixelRatio || 1
  }];
}

function webCaptureDescriptor() {
  return [{
    id: 'browser-picker',
    name: 'Elegir desde el selector del navegador',
    kind: 'browser',
    displayId: '',
    appIcon: null,
    thumbnail: null
  }];
}

function rememberState(state) {
  try {
    const compact = { ...state };
    // Persist only controls. Audio analysis is high-frequency and belongs on
    // BroadcastChannel/IPC, not localStorage; avoiding those writes materially
    // reduces main-thread work in the web build.
    [
      'logoDataUrl','waveform',
      'sub','bass','mid','treble','level','beat','flux','centroid',
      'subPulse','bassPulse','midPulse','treblePulse','levelPulse',
      'subAtt','bassAtt','midAtt','trebleAtt','levelAtt'
    ].forEach((key) => delete compact[key]);
    const serialized = JSON.stringify(compact);
    if (serialized === lastPersistedState) return;
    lastPersistedState = serialized;
    localStorage.setItem(STATE_KEY, serialized);
  } catch (_) {}
}

function openWebOutputWindow() {
  const outputUrl = new URL('./output.html?mode=web', window.location.href).href;
  if (webOutputWindow && !webOutputWindow.closed) {
    webOutputWindow.focus();
    return true;
  }
  webOutputWindow = window.open(
    outputUrl,
    'AudioReactiveStudioOutput',
    'popup=yes,width=1280,height=720,resizable=yes,scrollbars=no'
  );
  if (!webOutputWindow) {
    throw new Error('El navegador bloqueó la ventana OUTPUT. Permití ventanas emergentes para este sitio y volvé a intentar.');
  }
  return true;
}

export const platform = {
  isElectron,
  isWeb: !isElectron,
  mode: isElectron ? 'desktop' : 'web',

  async getDisplays() {
    if (isElectron) return window.studioAPI.getDisplays();
    return webDisplayDescriptor();
  },

  async showOutput(displayId) {
    if (isElectron) return window.studioAPI.showOutput(displayId);
    return openWebOutputWindow();
  },

  async detachOutput() {
    if (isElectron) return window.studioAPI.detachOutput();
    return openWebOutputWindow();
  },

  async toggleOutputFullscreen() {
    if (isElectron) return window.studioAPI.toggleOutputFullscreen();
    return false;
  },

  async closeOutput() {
    if (isElectron) return window.studioAPI.closeOutput();
    if (webOutputWindow && !webOutputWindow.closed) webOutputWindow.close();
    webOutputWindow = null;
    return true;
  },

  async getCaptureSources() {
    if (isElectron) return window.studioAPI.getCaptureSources();
    return webCaptureDescriptor();
  },

  async selectCaptureSource(sourceId) {
    if (isElectron) return window.studioAPI.selectCaptureSource(sourceId);
    return true;
  },

  async selectPrimaryScreen() {
    if (isElectron) return window.studioAPI.selectPrimaryScreen();
    return true;
  },

  sendVisualState(state) {
    if (isElectron) {
      window.studioAPI.sendVisualState(state);
      return;
    }
    rememberState(state);
    channel?.postMessage({ type: 'visual:state', state });
  },

  onVisualState(callback) {
    if (isElectron) return window.studioAPI.onVisualState(callback);

    try {
      const saved = localStorage.getItem(STATE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        queueMicrotask(() => callback(state));
      }
    } catch (_) {}

    if (!channel) return () => {};
    const handler = (event) => {
      if (event?.data?.type === 'visual:state') callback(event.data.state);
    };
    channel.addEventListener('message', handler);
    return () => channel.removeEventListener('message', handler);
  }
};
