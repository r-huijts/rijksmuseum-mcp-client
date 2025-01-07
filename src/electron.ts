// This is a bridge file to handle electron imports in the renderer process
const electron = window.require('electron');
export const { ipcRenderer } = electron; 