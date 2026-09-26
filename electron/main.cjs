const { app, BrowserWindow, ipcMain, screen, session, desktopCapturer } = require('electron');
const path = require('node:path');

let controlWindow = null;
let outputWindow = null;
let lastVisualState = null;
let selectedCaptureSourceId = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function pageUrl(page) {
  if (isDev) return `${process.env.VITE_DEV_SERVER_URL}/${page}`;
  return `file://${path.join(__dirname, '..', 'dist', page)}`;
}

function windowPreferences() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: false
  };
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1160,
    minHeight: 760,
    backgroundColor: '#050609',
    title: 'AudioReactive Studio',
    autoHideMenuBar: true,
    webPreferences: windowPreferences()
  });

  controlWindow.setMenuBarVisibility(false);
  controlWindow.loadURL(pageUrl('control.html'));
}

function getDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: display.id === primaryId ? `Pantalla ${index + 1} · Principal` : `Pantalla ${index + 1}`,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor
  }));
}

async function getCaptureSources() {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });

  return sources
    .filter((source) => !source.name.includes('AudioReactive Studio'))
    .map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.id.startsWith('screen:') ? 'screen' : 'window',
      displayId: source.display_id || '',
      appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
      thumbnail: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null
    }));
}

async function resolveSelectedCaptureSource() {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: false
  });

  if (selectedCaptureSourceId) {
    const selected = sources.find((source) => source.id === selectedCaptureSourceId);
    if (selected) return selected;
  }

  return sources.find((source) => source.id.startsWith('screen:')) || sources[0] || null;
}

async function ensureOutputWindow() {
  if (outputWindow && !outputWindow.isDestroyed()) return outputWindow;

  outputWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    frame: true,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: windowPreferences()
  });

  outputWindow.setMenuBarVisibility(false);
  outputWindow.webContents.on('did-finish-load', () => {
    if (lastVisualState && outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.webContents.send('visual:state', lastVisualState);
    }
  });
  await outputWindow.loadURL(pageUrl('output.html'));
  outputWindow.on('closed', () => {
    outputWindow = null;
  });
  return outputWindow;
}

async function showDetachedOutput() {
  const win = await ensureOutputWindow();
  if (win.isFullScreen()) win.setFullScreen(false);

  const anchorBounds = controlWindow && !controlWindow.isDestroyed()
    ? controlWindow.getBounds()
    : screen.getPrimaryDisplay().bounds;
  const display = screen.getDisplayNearestPoint({
    x: anchorBounds.x + Math.round(anchorBounds.width / 2),
    y: anchorBounds.y + Math.round(anchorBounds.height / 2)
  });
  const work = display.workArea;
  const width = Math.min(1280, Math.max(720, Math.round(work.width * 0.78)));
  const height = Math.min(720, Math.max(405, Math.round(width * 9 / 16)));
  const x = work.x + Math.round((work.width - width) / 2);
  const y = work.y + Math.round((work.height - height) / 2);
  win.setBounds({ x, y, width, height });
  win.show();
  win.focus();
  return true;
}

async function showOutputOnDisplay(displayId) {
  const display = screen.getAllDisplays().find((item) => String(item.id) === String(displayId)) || screen.getPrimaryDisplay();
  const win = await ensureOutputWindow();
  if (win.isFullScreen()) win.setFullScreen(false);
  win.setBounds(display.bounds);
  win.setFullScreen(true);
  win.show();
  return true;
}

async function toggleOutputFullscreen() {
  const win = await ensureOutputWindow();
  win.setFullScreen(!win.isFullScreen());
  win.show();
  win.focus();
  return win.isFullScreen();
}

function configureMediaPermissions() {
  const ses = session.defaultSession;

  // This app only loads its own localhost/file UI. Explicitly allow microphone/media access there.
  const isTrustedOrigin = (origin = '') => {
    if (isDev) return origin.startsWith('http://127.0.0.1:5173') || origin.startsWith('http://localhost:5173');
    return origin.startsWith('file://');
  };

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (permission === 'media') return isTrustedOrigin(requestingOrigin);
    return false;
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission !== 'media') return callback(false);
    const origin = details?.requestingUrl || details?.securityOrigin || webContents?.getURL?.() || '';
    callback(isTrustedOrigin(origin));
  });

  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const selected = await resolveSelectedCaptureSource();
      if (!selected) return callback({});

      const streams = {};
      if (request.videoRequested) streams.video = selected;

      // Electron loopback is system-audio capture on Windows. It lets a selected Chrome/Rekordbox
      // window drive the visuals while music keeps playing locally. Per-process isolated audio needs
      // a native WASAPI process-loopback module and is planned for a later version.
      if (request.audioRequested && process.platform === 'win32') streams.audio = 'loopback';

      callback(streams);
    } catch (error) {
      console.error('Display capture failed:', error);
      callback({});
    }
  });
}

app.whenReady().then(() => {
  configureMediaPermissions();

  ipcMain.handle('display:list', () => getDisplays());
  ipcMain.handle('display:show-output', (_event, displayId) => showOutputOnDisplay(displayId));
  ipcMain.handle('display:detach-output', () => showDetachedOutput());
  ipcMain.handle('display:toggle-output-fullscreen', () => toggleOutputFullscreen());
  ipcMain.handle('display:close-output', () => {
    if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close();
    return true;
  });

  ipcMain.handle('capture:list-sources', () => getCaptureSources());
  ipcMain.handle('capture:select-source', (_event, sourceId) => {
    selectedCaptureSourceId = sourceId || null;
    return true;
  });
  ipcMain.handle('capture:select-primary-screen', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false
    });
    selectedCaptureSourceId = sources[0]?.id || null;
    return selectedCaptureSourceId;
  });

  ipcMain.on('visual:state', (_event, state) => {
    lastVisualState = { ...(lastVisualState || {}), ...state };
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.webContents.send('visual:state', state);
    }
  });

  createControlWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
