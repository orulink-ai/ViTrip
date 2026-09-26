import { contextBridge, ipcRenderer } from 'electron';
import type { API, Event } from '../shared/types';
const api: API = {
  init: () => ipcRenderer.invoke('vitrip:init'),
  create: (id) => ipcRenderer.invoke('vitrip:create', id),
  createJourney: (title) => ipcRenderer.invoke('vitrip:createJourney', title),
  renameTrip: (id, title) => ipcRenderer.invoke('vitrip:renameTrip', id, title),
  renameJourney: (id, title) => ipcRenderer.invoke('vitrip:renameJourney', id, title),
  moveTrip: (id, journeyId) => ipcRenderer.invoke('vitrip:moveTrip', id, journeyId),
  journal: (options) => ipcRenderer.invoke('vitrip:journal', options),
  demo: () => ipcRenderer.invoke('vitrip:demo'),
  select: (id) => ipcRenderer.invoke('vitrip:select', id),
  remove: (id) => ipcRenderer.invoke('vitrip:remove', id),
  send: (text, quote) => ipcRenderer.invoke('vitrip:send', text, quote),
  notebook: (id) => ipcRenderer.invoke('vitrip:notebook', id),
  updateNotebook: (id, patch) => ipcRenderer.invoke('vitrip:updateNotebook', id, patch),
  addBookmark: (id, quote) => ipcRenderer.invoke('vitrip:addBookmark', id, quote),
  removeBookmark: (id, mark) => ipcRenderer.invoke('vitrip:removeBookmark', id, mark),
  settings: (value) => ipcRenderer.invoke('vitrip:settings', value),
  browse: (url) => ipcRenderer.invoke('vitrip:browse', url),
  history: (action) => ipcRenderer.invoke('vitrip:history', action),
  bounds: (value) => ipcRenderer.invoke('vitrip:bounds', value),
  pause: () => ipcRenderer.invoke('vitrip:pause'),
  resume: () => ipcRenderer.invoke('vitrip:resume'),
  stop: () => ipcRenderer.invoke('vitrip:stop'),
  approve: (id, allow) => ipcRenderer.invoke('vitrip:approve', id, allow),
  export: () => ipcRenderer.invoke('vitrip:export'),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, event: Event) => listener(event);
    ipcRenderer.on('vitrip:event', handler);
    return () => {
      ipcRenderer.removeListener('vitrip:event', handler);
    };
  },
};
contextBridge.exposeInMainWorld('vitrip', api);
