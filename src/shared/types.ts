import type { Notebook, Quote } from './notebook';
export interface Settings {
  baseURL: string;
  model: string;
  apiKey: string;
  jevApiKey?: string;
}
export interface PublicSettings {
  baseURL: string;
  model: string;
  hasKey: boolean;
  hasJevKey?: boolean;
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
  quote?: Quote;
  activities?: ToolActivity[];
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
export interface Day {
  title: string;
  subtitle: string;
  activities: { time: string; title: string; detail: string; url?: string }[];
}
export interface Plan {
  title: string;
  subtitle: string;
  budget: string;
  days: Day[];
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
  id: string;
  title: string;
  plan: Plan | null;
  html: string;
  entries: KnowledgeEntry[];
  revision: number;
  updatedAt: number;
}
export interface Trip {
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
}
export interface Event {
  type: 'browser' | 'trip' | 'status' | 'approval' | 'settings' | 'delta' | 'workspace' | 'journey';
  workspace?: 'browser' | 'plan';
  browser?: BrowserState;
  trip?: Trip;
  journey?: Journey;
  text?: string;
  running?: boolean;
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
  init(): Promise<{
    trips: Trip[];
    journeys: Journey[];
    settings: PublicSettings;
    browser: BrowserState;
  }>;
  create(journeyId?: string): Promise<Trip>;
  createJourney(title: string): Promise<Trip>;
  renameTrip(id: string, title: string): Promise<Trip>;
  renameJourney(id: string, title: string): Promise<Journey>;
  moveTrip(id: string, journeyId: string): Promise<Trip>;
  journal(): Promise<string>;
  demo(): Promise<Trip>;
  select(id: string): Promise<Trip>;
  remove(id: string): Promise<void>;
  send(text: string, quote?: Quote): Promise<void>;
  notebook(journeyId: string): Promise<Notebook>;
  updateNotebook(
    journeyId: string,
    patch: Partial<Pick<Notebook, 'markdown' | 'canvas' | 'todos'>>,
  ): Promise<Notebook>;
  addBookmark(journeyId: string, quote: Quote): Promise<Notebook>;
  removeBookmark(journeyId: string, id: string): Promise<Notebook>;
  settings(value: {
    baseURL: string;
    model: string;
    apiKey?: string;
    jevApiKey?: string;
  }): Promise<PublicSettings>;
  browse(url: string): Promise<void>;
  history(action: 'back' | 'forward' | 'reload'): Promise<void>;
  bounds(bounds: Bounds): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  approve(id: string, allow: boolean): Promise<void>;
  export(): Promise<string | null>;
  onEvent(listener: (event: Event) => void): () => void;
}
declare global {
  interface Window {
    vitrip: API;
  }
}
