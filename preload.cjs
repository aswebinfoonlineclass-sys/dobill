const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printSilent: (htmlContent) => ipcRenderer.invoke('print-silent', htmlContent),
  isElectron: true
});
