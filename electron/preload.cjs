const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioAPI', {
  getDisplays: () => ipcRenderer.invoke('display:list'),
  showOutput: (displayId) => ipcRenderer.invoke('display:show-output', displayId),
  detachOutput: () => ipcRenderer.invoke('display:detach-output'),
  toggleOutputFullscreen: () => ipcRenderer.invoke('display:toggle-output-fullscreen'),
  closeOutput: () => ipcRenderer.invoke('display:close-output'),

  getCaptureSources: () => ipcRenderer.invoke('capture:list-sources'),
  selectCaptureSource: (sourceId) => ipcRenderer.invoke('capture:select-source', sourceId),
  selectPrimaryScreen: () => ipcRenderer.invoke('capture:select-primary-screen'),

  sendVisualState: (state) => ipcRenderer.send('visual:state', state),
  onVisualState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('visual:state', handler);
    return () => ipcRenderer.removeListener('visual:state', handler);
  }
});
