const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mojidata', {
  version: '0.1.0',
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('always-on-top', value),
});
