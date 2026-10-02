import { contextBridge, ipcRenderer } from 'electron';
import type { API, Event } from '../shared/types';
const api: API = {
  startVoice: (tripId, sdp) => ipcRenderer.invoke('vitrip:startVoice', tripId, sdp),
  stopVoice: (tripId) => ipcRenderer.invoke('vitrip:stopVoice', tripId),
  codexModels: () => ipcRenderer.invoke('vitrip:codexModels'),
  listDocumentFolders: (id) => ipcRenderer.invoke('vitrip:listDocumentFolders', id),
  createDocumentFolder: (id, name) => ipcRenderer.invoke('vitrip:createDocumentFolder', id, name),
  moveDocument: (id, input) => ipcRenderer.invoke('vitrip:moveDocument', id, input),
  listDocuments: (id) => ipcRenderer.invoke('vitrip:listDocuments', id),
  readDocument: (id, name) => ipcRenderer.invoke('vitrip:readDocument', id, name),
  writeDocument: (id, input) => ipcRenderer.invoke('vitrip:writeDocument', id, input),
  editItinerary: (id, revision, edit) =>
    ipcRenderer.invoke('vitrip:editItinerary', id, revision, edit),
  notebookImage: (id, source) => ipcRenderer.invoke('vitrip:notebookImage', id, source),
  photo: (id, photoId) => ipcRenderer.invoke('vitrip:photo', id, photoId),
  copyLink: (target) => ipcRenderer.invoke('vitrip:copyLink', target),
  openLink: (url) => ipcRenderer.invoke('vitrip:openLink', url),
  init: () => ipcRenderer.invoke('vitrip:init'),
  create: (id) => ipcRenderer.invoke('vitrip:create', id),
  createJourney: (title) => ipcRenderer.invoke('vitrip:createJourney', title),
  renameTrip: (id, title) => ipcRenderer.invoke('vitrip:renameTrip', id, title),
  setJourneyCompleted: (id, completed) =>
    ipcRenderer.invoke('vitrip:setJourneyCompleted', id, completed),
  renameJourney: (id, title) => ipcRenderer.invoke('vitrip:renameJourney', id, title),
  moveTrip: (id, journeyId) => ipcRenderer.invoke('vitrip:moveTrip', id, journeyId),
  journal: (options) => ipcRenderer.invoke('vitrip:journal', options),
  demo: () => ipcRenderer.invoke('vitrip:demo'),
  select: (id) => ipcRenderer.invoke('vitrip:select', id),
  removeJourney: (id) => ipcRenderer.invoke('vitrip:removeJourney', id),
  remove: (id) => ipcRenderer.invoke('vitrip:remove', id),
  conversationSettings: (tripId, patch) =>
    ipcRenderer.invoke('vitrip:conversationSettings', tripId, patch),
  cancelQueuedMessage: (id) => ipcRenderer.invoke('vitrip:cancelQueuedMessage', id),
  beginQueuedMessageEdit: (id) => ipcRenderer.invoke('vitrip:beginQueuedMessageEdit', id),
  endQueuedMessageEdit: (id) => ipcRenderer.invoke('vitrip:endQueuedMessageEdit', id),
  editQueuedMessage: (id, content, quote, attachmentIds) =>
    ipcRenderer.invoke('vitrip:editQueuedMessage', id, content, quote, attachmentIds),
  resumeQueue: () => ipcRenderer.invoke('vitrip:resumeQueue'),
  sendQueuedMessage: (id) => ipcRenderer.invoke('vitrip:sendQueuedMessage', id),
  regenerate: (parentId) => ipcRenderer.invoke('vitrip:regenerate', parentId),
  selectBranch: (headId) => ipcRenderer.invoke('vitrip:selectBranch', headId),
  feedback: (id, value) => ipcRenderer.invoke('vitrip:feedback', id, value),
  uploadAttachment: (tripId, id, name, bytes) =>
    ipcRenderer.invoke('vitrip:uploadAttachment', tripId, id, name, bytes),
  removeAttachment: (tripId, id) => ipcRenderer.invoke('vitrip:removeAttachment', tripId, id),
  send: (text, quote, attachmentIds) =>
    ipcRenderer.invoke('vitrip:send', text, quote, attachmentIds),
  notebook: (id) => ipcRenderer.invoke('vitrip:notebook', id),
  updateNotebook: (id, patch) => ipcRenderer.invoke('vitrip:updateNotebook', id, patch),
  addBookmark: (id, quote) => ipcRenderer.invoke('vitrip:addBookmark', id, quote),
  removeBookmark: (id, mark) => ipcRenderer.invoke('vitrip:removeBookmark', id, mark),
  settings: (value) => ipcRenderer.invoke('vitrip:settings', value),
  browse: (url) => ipcRenderer.invoke('vitrip:browse', url),
  openBrowserExternal: () => ipcRenderer.invoke('vitrip:openBrowserExternal'),
  browserHistory: (journeyId) => ipcRenderer.invoke('vitrip:browserHistory', journeyId),
  clearBrowserHistory: (journeyId) => ipcRenderer.invoke('vitrip:clearBrowserHistory', journeyId),
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
