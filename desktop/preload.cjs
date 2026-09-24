const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mojidata', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onOpenAbout: (callback) => {
    const listener = (_event, section) => {
      if (section === 'about' || section === 'credits') callback(section);
    };
    ipcRenderer.on('open-about', listener);
    return () => ipcRenderer.removeListener('open-about', listener);
  },
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('always-on-top', value),
});
