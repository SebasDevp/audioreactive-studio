import { AudioEngine } from './audio-engine.js';
import { platform } from './platform-bridge.js';

const $ = (id) => document.getElementById(id);

let preview = null;
let visualEngineInitError = null;
let previewInitPromise = null;

function showVisualInitError(error) {
  visualEngineInitError = error;
  console.error('AudioReactive visual engine init error:', error);
  const host = $('preview');
  if (!host) return;
  let overlay = host.querySelector('.visual-error-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'visual-error-overlay';
    host.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.textContent = 'Visual engine error · abrí DevTools > Console para ver el detalle';
  overlay.title = String(error?.stack || error?.message || error || 'Unknown error');
}

async function initializePreview(options = {}) {
  if (visualEngineInitError) return null;
  const allowBlockingFallback = Boolean(options.allowBlockingFallback);

  if (!preview) {
    try {
      setPreviewIdle('LOADING VISUAL ENGINE CODE…', true);
      const { VisualEngine } = await import('./visual-engine.js');
      preview = new VisualEngine($('preview'), {
        isOutput: false,
        quality: state.quality || 'high',
        onPerformance: ({ fps, adaptiveScale }) => {
          const badge = $('fpsBadge');
          if (badge) {
            badge.textContent = `${Math.round(fps)} FPS · ${Math.round(adaptiveScale*100)}%`;
            badge.classList.toggle('fps-warn', fps < 48);
          }
        }
      });
      preview.setState(state);
    } catch (error) {
      showVisualInitError(error);
      return null;
    }
  }

  if (preview.prepared) return preview;
  if (previewInitPromise) return previewInitPromise;

  previewInitPromise = (async () => {
    try {
      const result = await preview.prepare({
        allowBlockingFallback,
        onStatus: (message) => setPreviewIdle(message, true)
      });

      if (result?.requiresActivation) {
        const activate = $('activateVisualEngine');
        if (activate) activate.hidden = false;
        setPreviewIdle('GPU LEGACY MODE · ENGINE PAUSED', true);
        return preview;
      }

      preview.setState(state);
      const activate = $('activateVisualEngine');
      if (activate) activate.hidden = true;
      setPreviewIdle(audioConnected ? 'AUDIO CONNECTED · WAITING FOR SIGNAL' : 'READY · CONNECT AUDIO TO AWAKEN THE VISUAL ENGINE', true);
      return preview;
    } catch (error) {
      showVisualInitError(error);
      return null;
    } finally {
      previewInitPromise = null;
    }
  })();

  return previewInitPromise;
}

const savedLogo = localStorage.getItem('ars_logo_data') || '';
const OVERLAY_SETTINGS_KEY = 'ars_overlay_settings_v011';
const PANEL_LAYOUT_KEY = 'ars_panel_layout_v011';
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
  bloom: 0.82,
  randomness: 0.48,
  flow: 0.58,
  audioZoom: 0.62,
  adaptiveQuality: true,
  colorA: '#6c4cff',
  colorB: '#00d9ff',
  colorMix: 0.50,
  quality: 'high',
  transitionMode: 'ecosystem',
  transitionSpeed: 0,
  transitionZoom: 0.55,
  transitionSync: true,
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
let appReady = false;

function setPreviewIdle(message = 'READY · CONNECT AUDIO TO AWAKEN THE VISUAL ENGINE', visible = true) {
  const idle = $('previewIdle');
  if (!idle) return;
  idle.querySelector('strong').textContent = message;
  idle.classList.toggle('is-hidden', !visible);
}

function broadcast(force = false) {
  const now = performance.now();
  if (!force && now - lastBroadcast < 24) return;
  lastBroadcast = now;
  preview?.setState(state);
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

function updateModuleSummaries() {
  const summaries = {
    audio: audioConnected ? 'LIVE' : 'READY',
    visual: $('preset')?.selectedOptions?.[0]?.textContent?.replace(' · Vegvísir','') || 'SCENE',
    transitions: `${String(state.transitionMode || 'ecosystem').toUpperCase()} ${Number(state.transitionSpeed) > 0 ? '+' : ''}${Number(state.transitionSpeed) || 0}`,
    overlay: state.logoEnabled && state.logoDataUrl ? `ON · ${state.logoCopies || 1}X` : 'OFF',
    output: platform.isWeb ? 'WEB WINDOW' : 'WINDOW / DISPLAY'
  };
  Object.entries(summaries).forEach(([key,value]) => {
    const el = document.querySelector(`.control-section[data-module="${key}"] .module-summary`);
    if (el) el.textContent = value;
  });
}

function setStatus(title, detail, mode = 'idle') {
  $('statusText').textContent = title;
  $('statusDetail').textContent = detail;
  $('audioStatus').className = `status-dot ${mode}`;
  updateModuleSummaries();
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
  updateModuleSummaries();
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
      setPreviewIdle(event.muted ? 'INPUT MUTED · CHECK YOUR AUDIO SOURCE' : 'AUDIO CONNECTED · WAITING FOR SIGNAL', false);
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
      setPreviewIdle('SOURCE ENDED · CONNECT AUDIO TO CONTINUE', true);
    }
  }
);

async function loadAudioDevices(requestPermission = false) {
  const devices = await audio.listInputs(requestPermission);
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
    option.textContent = device.label || `Entrada de audio ${select.options.length + 1}`;
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

async function openOutputOnDisplay() {
  try {
    await platform.showOutput($('displaySelect')?.value);
    // Small delay guarantees the output renderer has mounted before the full state snapshot.
    setTimeout(() => broadcast(true), 120);
  } catch (error) {
    alert(error.message);
  }
}

async function openDetachedOutput() {
  try {
    await platform.detachOutput();
    setTimeout(() => broadcast(true), 120);
  } catch (error) {
    alert(error.message);
  }
}

function updateTransitionUi() {
  const speed = Number(state.transitionSpeed) || 0;
  $('transitionSpeedValue').textContent = speed > 0 ? `+${speed}` : String(speed);
  const labels = {
    morph: 'MORPH', dissolve: 'DISSOLVE', radial: 'RADIAL', prism: 'PRISM', ecosystem: 'ECOSYSTEM'
  };
  $('transitionStatusText').textContent = `READY · ${labels[state.transitionMode] || 'ECOSYSTEM'} · ${speed > 0 ? '+' : ''}${speed}`;
  updateModuleSummaries();
}

$('audioInput').addEventListener('change', () => {
  setStatus('Entrada lista', $('audioInput').selectedOptions[0]?.textContent || 'Dispositivo listo', 'idle');
});

$('captureSource').addEventListener('change', (event) => {
  const source = captureSources.find((item) => item.id === event.target.value);
  renderCapturePreview(source);
});

$('refreshAudio').addEventListener('click', () => loadAudioDevices(true).catch(console.error));
$('refreshCapture').addEventListener('click', () => loadCaptureSources().catch(console.error));

$('startInput').addEventListener('click', async () => {
  try {
    const label = $('audioInput').selectedOptions[0]?.textContent || 'Entrada de audio';
    setStatus('Conectando entrada…', label, 'loading');
    await audio.startDevice($('audioInput').value || undefined);
    setStatus('Entrada conectada', label, 'active');
    loadAudioDevices(false).catch(() => {});
  } catch (error) {
    audioConnected = false;
    setStatus('No se pudo abrir la entrada', error.message, 'warning');
    alert(error.message);
  }
});

$('captureWindow').addEventListener('click', async () => {
  if (!captureSources.length) {
    try { await loadCaptureSources(); } catch (error) { console.warn('Capture source discovery failed:', error); }
  }
  const source = captureSources.find((item) => item.id === $('captureSource').value) || captureSources[0];
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
  setPreviewIdle('READY · CONNECT AUDIO TO AWAKEN THE VISUAL ENGINE', true);
  broadcast(true);
});

$('inputGain').addEventListener('input', (event) => {
  const value = Number(event.target.value);
  $('inputGainValue').textContent = `${value.toFixed(2)}×`;
  audio.setInputGain(value);
});

$('openOutput').addEventListener('click', openOutputOnDisplay);
$('detachOutput').addEventListener('click', openDetachedOutput);
$('detachOutputPanel')?.addEventListener('click', openDetachedOutput);
$('closeOutput').addEventListener('click', () => platform.closeOutput());

$('transitionSync').addEventListener('change', (event) => {
  state.transitionSync = event.target.checked;
  updateTransitionUi();
  broadcast(true);
});

$('adaptiveQuality')?.addEventListener('change', (event) => {
  state.adaptiveQuality = event.target.checked;
  broadcast(true);
});

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
  ['randomness', 'randomness', true],
  ['flow', 'flow', true],
  ['audioZoom', 'audioZoom', true],
  ['colorMix', 'colorMix', true],
  ['transitionSpeed', 'transitionSpeed', true],
  ['transitionZoom', 'transitionZoom', true],
  ['transitionMode', 'transitionMode', false],
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
    if (id === 'transitionSpeed' || id === 'transitionMode') updateTransitionUi();
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
  if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const presetMap = {
    '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
    '6': 5, '7': 6, '8': 7, '9': 8, '0': 9,
    q: 10, w: 11, e: 12, r: 13, t: 14, y: 15, u: 16, i: 17, o: 18,
    Q: 10, W: 11, E: 12, R: 13, T: 14, Y: 15, U: 16, I: 17, O: 18
  };
  if (presetMap[event.key] != null) {
    $('preset').value = String(presetMap[event.key]);
    state.preset = presetMap[event.key];
    $('transitionStatusText').textContent = `TRANSITION · ${$('preset').selectedOptions[0]?.textContent || 'SCENE'}`;
    broadcast(true);
  }
});

$('preset').addEventListener('change', () => {
  $('transitionStatusText').textContent = `TRANSITION · ${$('preset').selectedOptions[0]?.textContent || 'SCENE'}`;
});

navigator.mediaDevices?.addEventListener?.('devicechange', () => loadAudioDevices(false).catch(console.error));


function setupControlModules() {
  const panel = document.querySelector('.controls-panel');
  if (!panel) return;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY) || '{}') || {}; } catch (_) {}
  const order = Array.isArray(saved.order) ? saved.order : [];
  const collapsed = saved.collapsed || {};

  const modules = [...panel.querySelectorAll('.control-section[data-module]')];
  const map = new Map(modules.map((el) => [el.dataset.module, el]));
  order.forEach((key) => { if (map.has(key)) panel.appendChild(map.get(key)); });
  modules.forEach((el) => { if (!order.includes(el.dataset.module)) panel.appendChild(el); });

  const persist = () => {
    const current = [...panel.querySelectorAll('.control-section[data-module]')];
    const payload = {
      order: current.map((el) => el.dataset.module),
      collapsed: Object.fromEntries(current.map((el) => [el.dataset.module, el.classList.contains('is-collapsed')]))
    };
    try { localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(payload)); } catch (_) {}
  };

  [...panel.querySelectorAll('.control-section[data-module]')].forEach((section) => {
    const heading = section.querySelector(':scope > .section-heading');
    if (!heading) return;
    const body = document.createElement('div');
    body.className = 'module-body';
    [...section.children].filter((child) => child !== heading).forEach((child) => body.appendChild(child));
    section.appendChild(body);

    const titleWrap = heading.firstElementChild;
    if (titleWrap && !titleWrap.querySelector('.module-summary')) {
      const summary = document.createElement('span');
      summary.className = 'module-summary';
      titleWrap.appendChild(summary);
    }

    const actions = document.createElement('div');
    actions.className = 'module-actions';
    [...heading.children].slice(1).forEach((child) => actions.appendChild(child));

    const drag = document.createElement('button');
    drag.type = 'button';
    drag.className = 'module-drag';
    drag.textContent = '⋮⋮';
    drag.title = 'Arrastrar panel';
    drag.draggable = true;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'module-toggle';
    toggle.textContent = '⌄';
    toggle.title = 'Plegar / desplegar';

    actions.appendChild(drag);
    actions.appendChild(toggle);
    heading.appendChild(actions);

    // New installs start compact. Saved state wins afterwards.
    const shouldCollapse = collapsed[section.dataset.module] ?? true;
    section.classList.toggle('is-collapsed', shouldCollapse);
    toggle.textContent = shouldCollapse ? '›' : '⌄';

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      section.classList.toggle('is-collapsed');
      toggle.textContent = section.classList.contains('is-collapsed') ? '›' : '⌄';
      persist();
    });
    heading.addEventListener('click', (event) => {
      if (event.target.closest('button, select, input, label')) return;
      section.classList.toggle('is-collapsed');
      toggle.textContent = section.classList.contains('is-collapsed') ? '›' : '⌄';
      persist();
    });

    drag.addEventListener('dragstart', (event) => {
      section.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', section.dataset.module);
    });
    drag.addEventListener('dragend', () => {
      section.classList.remove('is-dragging');
      panel.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      persist();
    });
    section.addEventListener('dragover', (event) => {
      event.preventDefault();
      const dragging = panel.querySelector('.is-dragging');
      if (!dragging || dragging === section) return;
      section.classList.add('drag-over');
      const rect = section.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height/2;
      panel.insertBefore(dragging, before ? section : section.nextSibling);
    });
    section.addEventListener('dragleave', () => section.classList.remove('drag-over'));
  });
}

function finishBoot() {
  const splash = $('bootSplash');
  document.body.classList.add('app-ready');
  appReady = true;
  if (!splash) return;
  requestAnimationFrame(() => splash.classList.add('is-ready'));
  setTimeout(() => splash.remove(), 260);
}

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
  const openOutputButton = document.getElementById('openOutput');
  const detachPanelButton = document.getElementById('detachOutputPanel');
  if (openOutputButton) openOutputButton.textContent = 'ABRIR OUTPUT';
  if (detachPanelButton) detachPanelButton.style.display = 'none';

  const note = document.getElementById('webModeNote');
  if (note) note.hidden = false;

  setStatus('Modo web listo', 'Para YouTube: elegí una pestaña de Chrome y activá “Compartir audio”.', 'active');
}

// Boot sequence v0.11: UI first, renderer second. Nothing may block interaction.
const bootStartedAt = performance.now();
const BOOT_MIN_MS = 620;
const BOOT_FAILSAFE_MS = 1500;

const releaseBootWhenReady = () => {
  const elapsed = performance.now() - bootStartedAt;
  setTimeout(finishBoot, Math.max(0, BOOT_MIN_MS - elapsed));
};

// Absolute failsafe: the splash can never trap the interface.
setTimeout(finishBoot, BOOT_FAILSAFE_MS);

try {
  setupPlatformUi();
  setupControlModules();
  updateTransitionUi();
} catch (error) {
  console.error('AudioReactive UI initialization error:', error);
}

[
  'preset','intensity','contrast','speed','zoom','density','bloom','randomness','flow','audioZoom','colorMix','transitionSpeed','transitionZoom','logoSize','logoOpacity','logoCopies','logoSpread','logoPosX','logoPosY','logoRotation','logoGlow'
].forEach((id) => { if ($(id)) $(id).value = String(state[id]); });
if ($('quality')) $('quality').value = state.quality;
if ($('transitionMode')) $('transitionMode').value = state.transitionMode;
if ($('transitionSync')) $('transitionSync').checked = Boolean(state.transitionSync);
if ($('adaptiveQuality')) $('adaptiveQuality').checked = Boolean(state.adaptiveQuality);
if ($('logoMode')) $('logoMode').value = state.logoMode;
if ($('logoColorMode')) $('logoColorMode').value = state.logoColorMode;
if ($('logoBlendMode')) $('logoBlendMode').value = state.logoBlendMode;
['logoFxBlink','logoFxPulse','logoFxSpin','logoFxColor'].forEach((id)=>{ if ($(id)) $(id).checked = Boolean(state[id]); });
if ($('inputGainValue') && $('inputGain')) $('inputGainValue').textContent = `${Number($('inputGain').value).toFixed(2)}×`;
['intensity','contrast','speed','zoom','density','bloom','randomness','flow','audioZoom','colorMix','transitionSpeed','transitionZoom','logoSize','logoOpacity','logoCopies','logoSpread','logoPosX','logoPosY','logoRotation','logoGlow'].forEach((id)=>{
  if ($(`${id}Value`)) {
    const decimals = ['logoCopies','transitionSpeed'].includes(id) ? 0 : 2;
    $(`${id}Value`).textContent = Number(state[id]).toFixed(decimals);
  }
});
setLogoUi();
updateTransitionUi();
updateModuleSummaries();
setPreviewIdle('UI READY · PREPARING GPU IN BACKGROUND…', true);

// Release the branded intro quickly. The heavy visual engine is intentionally NOT on the critical path.
releaseBootWhenReady();

// Cheap startup work only: no microphone prompt and no expensive window thumbnails.
loadAudioDevices(false).catch((error) => console.warn('Audio input enumeration warning:', error));
loadDisplays().catch((error) => console.warn('Display enumeration warning:', error));

// Load Three.js + the large shader after the interface is already visible and usable.
const startPreviewWhenIdle = async () => {
  const engine = await initializePreview({ allowBlockingFallback: false });
  if (!engine) setPreviewIdle('VISUAL ENGINE ERROR · OPEN DEVTOOLS CONSOLE', true);
};

const queuePreview = () => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => startPreviewWhenIdle(), { timeout: 500 });
  } else {
    window.setTimeout(startPreviewWhenIdle, 120);
  }
};
window.setTimeout(queuePreview, 780);

// Capture thumbnails are intentionally lazy-loaded only when the user opens/refreshes capture.
if ($('captureSource') && !$('captureSource').options.length) {
  const option = document.createElement('option');
  option.value = '';
  option.textContent = 'Fuentes se cargan al usar captura';
  $('captureSource').appendChild(option);
}

$('activateVisualEngine')?.addEventListener('click', async () => {
  const button = $('activateVisualEngine');
  if (button) {
    button.disabled = true;
    button.textContent = 'ACTIVATING…';
  }
  const engine = await initializePreview({ allowBlockingFallback: true });
  if (engine?.prepared) {
    if (button) button.hidden = true;
    setPreviewIdle(audioConnected ? 'AUDIO CONNECTED · WAITING FOR SIGNAL' : 'READY · CONNECT AUDIO TO AWAKEN THE VISUAL ENGINE', true);
  } else if (button) {
    button.disabled = false;
    button.textContent = 'ACTIVATE VISUAL ENGINE';
  }
});

// Initial state can safely broadcast before/after the renderer exists.
broadcast(true);

