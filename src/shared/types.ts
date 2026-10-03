import type { CodexModel } from './codex-models';
import type { DocumentWrite, NotebookDocument, NotebookDocumentInfo } from './notebook-documents';
import type { FileAttachment } from './attachments';
import type { TravelPhoto } from './photos';
import type { ItineraryEdit } from './journey-editing';
import type { LinkTarget } from './deep-link';
import type { Notebook, Quote } from './notebook';
import type { ItineraryLocation } from './itinerary-map';
export interface JevExperiments {
  browser: boolean;
  webSearch: boolean;
  localSearch: boolean;
}
export interface Settings {
  jevExperiments?: JevExperiments;
  runtime?: 'pi' | 'codex';
  codexModel?: string;
  codexEffort?: string;
  imageInput?: boolean;
  baseURL: string;
  model: string;
  apiKey: string;
  jevApiKey?: string;
  tavilyApiKey?: string;
}
export type ConversationSettings = Partial<
  Pick<
    Settings,
    'runtime' | 'codexModel' | 'codexEffort' | 'model' | 'imageInput' | 'jevExperiments'
  >
>;
export interface PublicSettings {
  jevExperiments?: JevExperiments;
  runtime?: 'pi' | 'codex';
  codexModel?: string;
  codexEffort?: string;
  imageInput?: boolean;
  baseURL: string;
  model: string;
  hasKey: boolean;
  hasJevKey?: boolean;
  hasTavilyKey?: boolean;
}
export interface ToolActivity {
  id: string;
  name: string;
  input: string;
  output: string;
  status: 'active' | 'complete' | 'error' | 'interrupted';
  startedAt: number;
  finishedAt?: number;
}
export interface Message {
  origin?: 'agent' | 'voice-user' | 'voice-assistant' | 'call-summary';
  voiceCallId?: string;
  settings?: ConversationSettings;
  error?: string;
  parts?: ({ type: 'text'; text: string } | { type: 'tool'; toolId: string })[];
  feedback?: 'positive' | 'negative';
  attachments?: FileAttachment[];
  quote?: Quote;
  activities?: ToolActivity[];
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
export interface ItinerarySource {
  title?: string;
  url?: string;
  excerpt: string;
}
export interface Day {
  date?: string;
  title: string;
  subtitle: string;
  stay?: {
    name: string;
    status: 'planned' | 'booked' | 'pending';
    sourceUrl?: string;
  };
  issues?: string[];
  activities: {
    id?: string;
    photoIds?: string[];
    recommendation?: { reason: string; preferences: string[] };
    time: string;
    timeLabel?: string;
    timeZone?: string;
    notes?: string[];
    warnings?: string[];
    title: string;
    detail: string;
    url?: string;
    location?: ItineraryLocation;
    origin?: 'source' | 'suggestion' | 'user';
    kind?: 'transport' | 'activity' | 'meal' | 'stay';
    optionGroup?: string;
    optional?: boolean;
    source?: ItinerarySource;
    sources?: ItinerarySource[];
  }[];
}
export interface Plan {
  title: string;
  subtitle: string;
  budget: string;
  days: Day[];
  source?: ItinerarySource;
  packing?: string[];
}
export interface KnowledgeEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  status: 'confirmed' | 'reference' | 'pending';
  sources: string[];
}
export interface Journey {
  completed?: boolean;
  photos?: TravelPhoto[];
  id: string;
  title: string;
  plan: Plan | null;
  html: string;
  entries: KnowledgeEntry[];
  revision: number;
  updatedAt: number;
}
export interface Trip {
  settings?: ConversationSettings;
  queuedMessages?: Message[];
  branches?: Message[][];
  contextKey?: string;
  journeyId: string;
  customTitle?: boolean;
  id: string;
  title: string;
  messages: Message[];
  plan: Plan | null;
  updatedAt: number;
}
export interface BrowserState {
  url: string;
  title: string;
  loading: boolean;
  canBack: boolean;
  canForward: boolean;
  error?: { url: string; code: number; description: string };
}
export interface Event {
  type:
    | 'map-view'
    | 'itinerary-video'
    | 'voice'
    | 'link'
    | 'browser'
    | 'browser-history'
    | 'trip'
    | 'status'
    | 'approval'
    | 'settings'
    | 'delta'
    | 'workspace'
    | 'journey'
    | 'documents'
    | 'prepare';
  mapView?: import('./map-view').MapViewCommand;
  voice?: import('./voice').VoiceEvent;
  link?: string;
  workspace?: 'browser' | 'plan' | 'notebook';
  journeyId?: string;
  browser?: BrowserState;
  visits?: import('./browser-history').BrowserVisit[];
  trip?: Trip;
  journey?: Journey;
  text?: string;
  running?: boolean;
  canSteer?: boolean;
  paused?: boolean;
  approval?: { id: string; label: string } | null;
}
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}
export interface API {
  generateItineraryVideo(
    journeyId: string,
    dayIndex: number,
  ): Promise<import('./itinerary-video').ItineraryVideo>;
  exportItineraryVideo(journeyId: string, videoId: string): Promise<boolean>;
  mapViewResult(
    requestId: string,
    tripId: string,
    status: import('./map-view').MapViewStatus,
  ): Promise<void>;
  startVoice(tripId: string, sdp: string): Promise<void>;
  stopVoice(tripId: string): Promise<void>;
  codexModels(): Promise<CodexModel[]>;
  listDocumentFolders(journeyId: string): Promise<string[]>;
  createDocumentFolder(
    journeyId: string,
    name: string,
  ): Promise<{ name: string; created: boolean }>;
  moveDocument(
    journeyId: string,
    input: import('./notebook-documents').DocumentMove,
  ): Promise<{ from: string; to: string }>;
  listDocuments(journeyId: string): Promise<NotebookDocumentInfo[]>;
  readDocument(journeyId: string, name: string): Promise<NotebookDocument>;
  writeDocument(journeyId: string, input: DocumentWrite): Promise<NotebookDocument>;
  copyLink(target: LinkTarget): Promise<void>;
  openLink(url: string): Promise<{ target: LinkTarget; trip: Trip }>;
  editItinerary(journeyId: string, revision: number, edit: ItineraryEdit): Promise<Journey>;
  notebookImage(journeyId: string, source: string): Promise<string | null>;
  photo(journeyId: string, photoId: string): Promise<string | null>;
  init(): Promise<{
    link?: string;
    activeTripId: string;
    running: boolean;
    canSteer: boolean;
    paused: boolean;
    status: string;
    approval: { id: string; label: string } | null;
    trips: Trip[];
    journeys: Journey[];
    settings: PublicSettings;
    browser: BrowserState;
  }>;
  create(journeyId?: string): Promise<Trip>;
  createJourney(title: string): Promise<Trip>;
  renameTrip(id: string, title: string): Promise<Trip>;
  setJourneyCompleted(id: string, completed: boolean): Promise<Journey>;
  renameJourney(id: string, title: string): Promise<Journey>;
  moveTrip(id: string, journeyId: string): Promise<Trip>;
  journal(options?: { journeyId: string; legacy?: boolean }): Promise<string>;
  demo(): Promise<Trip>;
  select(id: string): Promise<Trip>;
  remove(id: string): Promise<void>;
  removeJourney(id: string): Promise<void>;
  conversationSettings(
    tripId: string,
    patch: Partial<ConversationSettings>,
  ): Promise<PublicSettings>;
  cancelQueuedMessage(id: string): Promise<void>;
  resumeQueue(): Promise<void>;
  sendQueuedMessage(id: string): Promise<void>;
  beginQueuedMessageEdit(id: string): Promise<void>;
  endQueuedMessageEdit(id: string): Promise<void>;
  editQueuedMessage(
    id: string,
    content: string,
    quote?: Quote | null,
    attachmentIds?: string[],
  ): Promise<void>;
  regenerate(parentId: string): Promise<void>;
  selectBranch(headId: string): Promise<void>;
  feedback(messageId: string, value: 'positive' | 'negative'): Promise<void>;
  uploadAttachment(
    tripId: string,
    id: string,
    name: string,
    bytes: Uint8Array,
  ): Promise<FileAttachment>;
  removeAttachment(tripId: string, id: string): Promise<void>;
  send(text: string, quote?: Quote, attachmentIds?: string[]): Promise<void>;
  notebook(journeyId: string): Promise<Notebook>;
  updateNotebook(
    journeyId: string,
    patch: Partial<Pick<Notebook, 'markdown' | 'canvas' | 'todos'>>,
  ): Promise<Notebook>;
  addBookmark(journeyId: string, quote: Quote): Promise<Notebook>;
  removeBookmark(journeyId: string, id: string): Promise<Notebook>;
  settings(value: {
    jevExperiments?: JevExperiments;
    runtime?: 'pi' | 'codex';
    codexModel?: string;
    codexEffort?: string;
    imageInput?: boolean;
    baseURL: string;
    model: string;
    apiKey?: string;
    jevApiKey?: string;
    tavilyApiKey?: string;
  }): Promise<PublicSettings>;
  browse(url: string): Promise<void>;
  openBrowserExternal(): Promise<void>;
  browserHistory(journeyId: string): Promise<import('./browser-history').BrowserVisit[]>;
  clearBrowserHistory(journeyId: string): Promise<void>;
  history(action: 'back' | 'forward' | 'reload'): Promise<void>;
  bounds(bounds: Bounds): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  approve(id: string, allow: boolean): Promise<void>;
  export(): Promise<string | null>;
  calendarConnect(journeyId: string): Promise<import('./calendar').CalendarConnection>;
  openCalendarPrivacySettings(): Promise<void>;
  openAppleCalendar(): Promise<void>;
  calendarPreview(
    journeyId: string,
    options: import('./calendar').CalendarOptions,
  ): Promise<import('./calendar').CalendarPreview>;
  calendarSync(
    input: import('./calendar').CalendarSyncInput,
  ): Promise<import('./calendar').CalendarSyncResult>;
  onEvent(listener: (event: Event) => void): () => void;
}
declare global {
  interface Window {
    vitrip: API;
  }
}
