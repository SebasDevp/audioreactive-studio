import { AudioEngine } from './audio-engine.js';
import { VisualEngine } from './visual-engine.js';
import { platform } from './platform-bridge.js';

const $ = (id) => document.getElementById(id);
const preview = new VisualEngine($('preview'), { isOutput: false, quality: 'high' });

const savedLogo = localStorage.getItem('ars_logo_data') || '';
const OVERLAY_SETTINGS_KEY = 'ars_overlay_settings_v09';
let savedOverlaySettings = {};
try { savedOverlaySettings = JSON.parse(localStorage.getItem(OVERLAY_SETTINGS_KEY) || '{}') || {}; } catch (_) {}

const state = {
  sub: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  level: 0,
  beat: 0,
  preset: 10,
  intensity: 1.06,
  contrast: 1.08,
  speed: 0.88,
  zoom: 1,
  density: 1.28,
  bloom: 0.88,
  colorA: '#6c4cff',
  colorB: '#00d9ff',
  colorMix: 0.50,
  quality: 'high',
  logoEnabled: Boolean(savedLogo),
  logoSize: 0.28,
  logoOpacity: 0.85,
  logoCopies: 1,
  logoSpread: 0.18,
  logoPosX: 0,
  logoPosY: 0,
  logoRotation: 0.35,
  logoMode: 'single',
  logoFxBlink: false,
  logoFxPulse: false,
  logoFxSpin: false,
  logoFxColor: false,
  logoColorMode: 'original',
  logoBlendMode: 'normal',
  logoGlow: 0.22,
  logoDataUrl: savedLogo
};

Object.assign(state, savedOverlaySettings);
state.logoDataUrl = savedLogo;
state.logoEnabled = savedLogo ? (savedOverlaySettings.logoEnabled ?? true) : false;

let lastBroadcast = 0;
let captureSources = [];
let audioConnected = false;

function broadcast(force = false) {
  const now = performance.now();
  if (!force && now - lastBroadcast < 24) return;
  lastBroadcast = now;
  preview.setState(state);
  const ipcState = { ...state };
  if (!force) delete ipcState.logoDataUrl;
  platform.sendVisualState(ipcState);
}

function meterValue(value, boost = 1.45) {
  return Math.min(1, Math.max(0, value * boost));
}

function updateMeters(metrics) {
  const values = {
    level: meterValue(metrics.level, 1.15),
    bass: meterValue(metrics.bass, 1.35),
    mid: meterValue(metrics.mid, 1.5),
    treble: meterValue(metrics.treble, 1.65)
  };

  for (const name of ['level', 'bass', 'mid', 'treble']) {
    $(`${name}Meter`).style.width = `${values[name] * 100}%`;
    $(`${name}Text`).textContent = metrics[name].toFixed(2);
  }

  $('beatBadge').classList.toggle('active', metrics.beat > 0.72);
  if (audioConnected) {
    if (metrics.level > 0.03) $('reactionLabel').textContent = metrics.beat > 0.72 ? 'WORLD GROWING · BEAT DETECTED' : 'SIGNAL ACTIVE · GENERATING';
    else $('reactionLabel').textContent = 'CONNECTED · LOW SIGNAL';
  }
}

function setStatus(title, detail, mode = 'idle') {
  $('statusText').textContent = title;
  $('statusDetail').textContent = detail;
  $('audioStatus').className = `status-dot ${mode}`;
}

const OVERLAY_SETTING_KEYS = [
  'logoEnabled','logoSize','logoOpacity','logoCopies','logoSpread','logoPosX','logoPosY','logoRotation','logoMode',
  'logoFxBlink','logoFxPulse','logoFxSpin','logoFxColor','logoColorMode','logoBlendMode','logoGlow'
];

function persistOverlaySettings() {
  try {
    const saved = {};
    OVERLAY_SETTING_KEYS.forEach((key) => { saved[key] = state[key]; });
    localStorage.setItem(OVERLAY_SETTINGS_KEY, JSON.stringify(saved));
  } catch (_) {}
}

function setLogoUi() {
  const hasLogo = Boolean(state.logoDataUrl);
  $('logoToggle').textContent = state.logoEnabled ? 'Overlay: ON' : 'Overlay: OFF';
  $('logoToggle').disabled = !hasLogo;
  $('clearLogo').disabled = !hasLogo;
  $('logoHint').textContent = hasLogo
    ? state.logoEnabled
      ? 'Overlay cargado. En modo Original conserva exactamente los colores de la imagen; Monocromo y Reactivo son ideales para logos.'
      : 'El overlay está cargado pero actualmente está apagado.'
    : 'Cargá PNG/SVG/WebP/JPG. Original respeta fotografías e imágenes; los otros modos permiten estilizar logos.';
}

const audio = new AudioEngine(
  (metrics) => {
    Object.assign(state, metrics);
    updateMeters(metrics);
    broadcast();
  },
  (event) => {
    if (event.type === 'connected') {
      audioConnected = true;
      setStatus('Audio conectado', event.label, event.muted ? 'warning' : 'active');
      $('reactionLabel').textContent = event.muted ? 'INPUT MUTED' : 'LISTENING';
    }
    if (event.type === 'muted') {
      setStatus('Entrada silenciada', `${event.label} · revisá Windows`, 'warning');
      $('reactionLabel').textContent = 'INPUT MUTED';
    }
    if (event.type === 'unmuted') {
      setStatus('Entrada reactivada', event.label, 'active');
      $('reactionLabel').textContent = 'SIGNAL ACTIVE';
    }
    if (event.type === 'ended') {
      audioConnected = false;
      setStatus('Captura finalizada', `${event.label} dejó de emitir o se cerró.`, 'warning');
      $('reactionLabel').textContent = 'SOURCE ENDED';
    }
  }
);

async function loadAudioDevices() {
  const devices = await audio.listInputs();
  const select = $('audioInput');
  select.innerHTML = '';
  if (!devices.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No hay entradas detectadas';
    select.appendChild(option);
    return;
  }
  for (const device of devices) {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || 'Entrada de audio';
    select.appendChild(option);
  }
}

function renderCapturePreview(source) {
  const holder = $('captureThumb');
  holder.innerHTML = '';
  if (!source) {
    holder.innerHTML = '<div class="capture-placeholder">Seleccioná una ventana</div>';
    return;
  }
  if (source.thumbnail) {
    const img = document.createElement('img');
    img.src = source.thumbnail;
    img.alt = source.name;
    holder.appendChild(img);
  } else {
    holder.innerHTML = '<div class="capture-placeholder">Sin preview</div>';
  }
  const overlay = document.createElement('div');
  overlay.className = 'capture-overlay';
  overlay.innerHTML = `<span>${source.kind === 'screen' ? 'Pantalla' : source.kind === 'browser' ? 'Navegador' : 'Ventana'}</span>${source.name}`;
  holder.appendChild(overlay);
}

async function loadCaptureSources() {
  captureSources = await platform.getCaptureSources();
  const select = $('captureSource');
  select.innerHTML = '';
  captureSources.forEach((source) => {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = `${source.kind === 'screen' ? 'Pantalla' : source.kind === 'browser' ? 'Navegador' : 'Ventana'} · ${source.name}`;
    select.appendChild(option);
  });
  renderCapturePreview(captureSources[0]);
}

async function loadDisplays() {
  const displays = await platform.getDisplays();
  const select = $('displaySelect');
  select.innerHTML = '';
  displays.forEach((display) => {
    const option = document.createElement('option');
    option.value = String(display.id);
    option.textContent = `${display.label} · ${display.bounds.width}×${display.bounds.height}`;
    select.appendChild(option);
  });
}

$('audioInput').addEventListener('change', () => {
  setStatus('Entrada lista', $('audioInput').selectedOptions[0]?.textContent || 'Dispositivo listo', 'idle');
});

$('captureSource').addEventListener('change', (event) => {
  const source = captureSources.find((item) => item.id === event.target.value);
  renderCapturePreview(source);
});

$('refreshAudio').addEventListener('click', () => loadAudioDevices().catch(console.error));
$('refreshCapture').addEventListener('click', () => loadCaptureSources().catch(console.error));

$('startInput').addEventListener('click', async () => {
  try {
    const label = $('audioInput').selectedOptions[0]?.textContent || 'Entrada de audio';
    setStatus('Conectando entrada…', label, 'loading');
    await audio.startDevice($('audioInput').value || undefined);
    setStatus('Entrada conectada', label, 'active');
  } catch (error) {
    audioConnected = false;
    setStatus('No se pudo abrir la entrada', error.message, 'warning');
    alert(error.message);
  }
});

$('captureWindow').addEventListener('click', async () => {
  const source = captureSources.find((item) => item.id === $('captureSource').value);
  if (!source) return;
  try {
    setStatus('Autorizando captura…', `Seleccionaste ${source.name}. Confirmá el selector de Windows si aparece.`, 'loading');
    await audio.startSelectedWindowCapture(source.id);
    audioConnected = true;
    setStatus('Ventana conectada', `${source.name} · audio del sistema`, 'active');
  } catch (error) {
    audioConnected = false;
    setStatus('No se pudo capturar la ventana', error.message, 'warning');
    alert(error.message);
  }
});

$('captureSystem').addEventListener('click', async () => {
  try {
    setStatus('Capturando sistema…', 'Preparando loopback de Windows.', 'loading');
    await audio.startSystemCapture();
    setStatus('Audio del sistema activo', 'Todo lo que suene en Windows puede reaccionar.', 'active');
  } catch (error) {
    audioConnected = false;
    setStatus('No se pudo capturar el sistema', error.message, 'warning');
    alert(error.message);
  }
});

$('stopAudio').addEventListener('click', () => {
  audio.stop();
  audioConnected = false;
  Object.assign(state, { sub: 0, bass: 0, mid: 0, treble: 0, level: 0, beat: 0, subPulse: 0, bassPulse: 0, midPulse: 0, treblePulse: 0, levelPulse: 0 });
  updateMeters(state);
  setStatus('Audio desconectado', 'Elegí una entrada, ventana o el audio del sistema.', 'idle');
  $('reactionLabel').textContent = 'WAITING FOR SIGNAL';
  broadcast(true);
});

$('inputGain').addEventListener('input', (event) => {
  const value = Number(event.target.value);
  $('inputGainValue').textContent = `${value.toFixed(2)}×`;
  audio.setInputGain(value);
});

$('openOutput').addEventListener('click', async () => {
  try {
    await platform.showOutput($('displaySelect').value);
    broadcast(true);
  } catch (error) {
    alert(error.message);
  }
});
$('closeOutput').addEventListener('click', () => platform.closeOutput());

['logoFxBlink','logoFxPulse','logoFxSpin','logoFxColor'].forEach((id) => {
  $(id).addEventListener('change', (event) => {
    state[id] = event.target.checked;
    persistOverlaySettings();
    broadcast(true);
  });
});

const bindings = [
  ['preset', 'preset', true],
  ['intensity', 'intensity', true],
  ['contrast', 'contrast', true],
  ['speed', 'speed', true],
  ['zoom', 'zoom', true],
  ['density', 'density', true],
  ['bloom', 'bloom', true],
  ['colorMix', 'colorMix', true],
  ['logoSize', 'logoSize', true],
  ['logoOpacity', 'logoOpacity', true],
  ['logoCopies', 'logoCopies', true],
  ['logoSpread', 'logoSpread', true],
  ['logoPosX', 'logoPosX', true],
  ['logoPosY', 'logoPosY', true],
  ['logoRotation', 'logoRotation', true],
  ['logoGlow', 'logoGlow', true],
  ['logoColorMode', 'logoColorMode', false],
  ['logoBlendMode', 'logoBlendMode', false],
  ['colorA', 'colorA', false],
  ['colorB', 'colorB', false],
  ['quality', 'quality', false],
  ['logoMode', 'logoMode', false]
];

bindings.forEach(([id, key, numeric]) => {
  $(id).addEventListener('input', (event) => {
    state[key] = numeric ? Number(event.target.value) : event.target.value;
    if ($(`${id}Value`)) {
      const decimals = ['logoCopies', 'preset'].includes(id) ? 0 : 2;
      $(`${id}Value`).textContent = Number(event.target.value).toFixed(decimals);
    }
    if (id === 'quality') $('qualityBadge').textContent = event.target.value === 'ultra' ? 'ULTRA' : event.target.value === 'performance' ? 'PERF' : 'HD';
    if (id.startsWith('logo')) persistOverlaySettings();
    broadcast(true);
  });
});

$('logoFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.logoDataUrl = String(reader.result || '');
    state.logoEnabled = true;
    try { localStorage.setItem('ars_logo_data', state.logoDataUrl); } catch (_) {}
    persistOverlaySettings();
    setLogoUi();
    broadcast(true);
  };
  reader.readAsDataURL(file);
});

$('logoToggle').addEventListener('click', () => {
  if (!state.logoDataUrl) return;
  state.logoEnabled = !state.logoEnabled;
  persistOverlaySettings();
  setLogoUi();
  broadcast(true);
});

$('clearLogo').addEventListener('click', () => {
  state.logoDataUrl = '';
  state.logoEnabled = false;
  $('logoFile').value = '';
  localStorage.removeItem('ars_logo_data');
  persistOverlaySettings();
  setLogoUi();
  broadcast(true);
});

window.addEventListener('keydown', (event) => {
  const presetMap = {
    '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
    '6': 5, '7': 6, '8': 7, '9': 8, '0': 9,
    q: 10, w: 11, e: 12, r: 13, t: 14, y: 15,
    Q: 10, W: 11, E: 12, R: 13, T: 14, Y: 15
  };
  if (presetMap[event.key] != null) {
    $('preset').value = String(presetMap[event.key]);
    state.preset = presetMap[event.key];
    broadcast(true);
  }
});

navigator.mediaDevices?.addEventListener?.('devicechange', () => loadAudioDevices().catch(console.error));

function setupPlatformUi() {
  const modeBadge = document.getElementById('platformBadge');
  if (modeBadge) modeBadge.textContent = platform.isWeb ? 'WEB' : 'DESKTOP';

  if (!platform.isWeb) return;

  const appSourceTitle = document.querySelector('#captureWindow')?.closest('.source-card')?.querySelector('.source-title-row strong');
  const appSourceSmall = document.querySelector('#captureWindow')?.closest('.source-card')?.querySelector('.source-title-row small');
  const captureLabel = document.querySelector('label[for="captureSource"]');
  const captureButton = document.getElementById('captureWindow');
  const systemButton = document.getElementById('captureSystem');
  const refreshCapture = document.getElementById('refreshCapture');
  const captureSelect = document.getElementById('captureSource');
  const displaySelect = document.getElementById('displaySelect');
  const outputLabel = displaySelect?.previousElementSibling;

  if (appSourceTitle) appSourceTitle.textContent = 'Pestaña / ventana / pantalla';
  if (appSourceSmall) appSourceSmall.textContent = 'Chrome/Edge abre su selector seguro de captura';
  if (captureLabel) captureLabel.textContent = 'Fuente web';
  if (captureButton) captureButton.textContent = 'Elegir fuente + audio';
  if (systemButton) {
    systemButton.innerHTML = '<span>◉</span> Elegir pantalla / audio del sistema';
    systemButton.title = 'En Chrome/Edge elegí Pantalla completa y activá Compartir audio del sistema cuando esté disponible.';
  }
  if (refreshCapture) refreshCapture.style.display = 'none';
  if (captureSelect) captureSelect.disabled = true;
  if (outputLabel) outputLabel.textContent = 'Salida web';

  const note = document.getElementById('webModeNote');
  if (note) note.hidden = false;

  setStatus('Modo web listo', 'Para YouTube: elegí una pestaña de Chrome y activá “Compartir audio”.', 'active');
}

setupPlatformUi();

Promise.all([loadAudioDevices(), loadCaptureSources(), loadDisplays()]).catch(console.error);
[
  'preset','intensity','contrast','speed','zoom','density','bloom','colorMix','logoSize','logoOpacity','logoCopies','logoSpread','logoPosX','logoPosY','logoRotation','logoGlow'
].forEach((id) => { $(id).value = String(state[id]); });
$('quality').value = state.quality;
$('logoMode').value = state.logoMode;
$('logoColorMode').value = state.logoColorMode;
$('logoBlendMode').value = state.logoBlendMode;
['logoFxBlink','logoFxPulse','logoFxSpin','logoFxColor'].forEach((id)=>{ $(id).checked = Boolean(state[id]); });
$('inputGainValue').textContent = `${Number($('inputGain').value).toFixed(2)}×`;
['intensity','contrast','speed','zoom','density','bloom','colorMix','logoSize','logoOpacity','logoCopies','logoSpread','logoPosX','logoPosY','logoRotation','logoGlow'].forEach((id)=>{
  if ($(`${id}Value`)) {
    const decimals = id === 'logoCopies' ? 0 : 2;
    $(`${id}Value`).textContent = Number(state[id]).toFixed(decimals);
  }
});
setLogoUi();
broadcast(true);
