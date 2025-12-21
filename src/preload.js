const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readMP3Metadata: (folderPath) => ipcRenderer.invoke('read-mp3-metadata', folderPath),
  updateMP3Genres: (updates) => ipcRenderer.invoke('update-mp3-genres', updates),
  previewNamingChanges: (namingRules, filesData) => ipcRenderer.invoke('preview-naming-changes', namingRules, filesData),
  applyNamingChanges: (namingRules, filesData) => ipcRenderer.invoke('apply-naming-changes', namingRules, filesData),
  saveNamingRules: (rulesData) => ipcRenderer.invoke('save-naming-rules', rulesData),
  loadNamingRules: () => ipcRenderer.invoke('load-naming-rules')
});

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
