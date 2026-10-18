const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('glimmer', {
  platform: process.platform,
  readSave: (slot) => ipcRenderer.sendSync('save:read', slot === 'bak' ? 'bak' : 'main'),
  // synchronous so a save issued while the window closes always lands on disk
  writeSave: (s) => ipcRenderer.sendSync('save:write', s),
  achievement: (id) => ipcRenderer.send('steam:achievement', id),
  richPresence: (s) => ipcRenderer.send('steam:presence', s),
  setFullscreen: (on) => ipcRenderer.send('app:fullscreen', on),
  quit: () => ipcRenderer.send('app:quit'),
});
