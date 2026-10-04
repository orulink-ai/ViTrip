import { conversationSettingsSchema, jevExperimentsSchema } from '../shared/schemas';
import {
  browserHistorySchema,
  browserVisitSchema,
  type BrowserVisit,
} from '../shared/browser-history';
import { attachmentSchema } from '../shared/attachments';
import { photoSchema } from '../shared/photos';
import { editItinerary, type ItineraryEdit } from '../shared/journey-editing';
import {
  notebookSchema,
  notebookPatchSchema,
  quoteSchema,
  type Notebook,
} from '../shared/notebook';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { prepareToolSchema, mergePreparation } from '../shared/prepare';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { planSchema, journeySchema, journalSchema, nameSchema } from '../shared/schemas';
import type { Settings, Trip, Journey } from '../shared/types';
const messageSchema = z.object({
  origin: z.enum(['agent', 'voice-user', 'voice-assistant', 'call-summary']).optional(),
  voiceCallId: z.string().optional(),
  settings: conversationSettingsSchema.optional(),
  error: z.string().optional(),
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  parts: z
    .array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('text'), text: z.string() }),
        z.object({ type: z.literal('tool'), toolId: z.string() }),
      ]),
    )
    .optional(),
  feedback: z.enum(['positive', 'negative']).optional(),
  quote: quoteSchema.optional(),
  attachments: z.array(attachmentSchema).max(8).optional(),
  activities: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        input: z.string(),
        output: z.string(),
        status: z.enum(['active', 'complete', 'error', 'interrupted']),
        startedAt: z.number(),
        finishedAt: z.number().optional(),
      }),
    )
    .optional(),
});
const tripSchema = z.object({
  settings: conversationSettingsSchema.optional(),
  id: z.string(),
  journeyId: z.string().default(''),
  customTitle: z.boolean().optional(),
  title: z.string(),
  messages: z.array(messageSchema),
  queuedMessages: z.array(messageSchema).optional(),
  branches: z.array(z.array(messageSchema)).optional(),
  contextKey: z.string().uuid().optional(),
  plan: planSchema.nullable(),
  updatedAt: z.number(),
});
interface Cipher {
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}
export class Storage {
  trips: Trip[] = [];
  journeys: Journey[] = [];
  settings: Settings = {
    baseURL: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    model: 'deepseek-v4.1-flash',
    apiKey: '',
  };
  private db: DatabaseSync;
  private notebooks: Record<string, Notebook> = {};
  private visits: Record<string, BrowserVisit[]> = {};
  constructor(
    dir: string,
    private cipher: Cipher,
  ) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(dir, 'vitrip.sqlite'));
    this.db.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (name TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    const notebooks = this.read('notebooks-v1');
    const visits = this.read('browser-history-v1');
    if (visits) this.visits = browserHistorySchema.parse(JSON.parse(visits));
    if (notebooks)
      this.notebooks = z.record(z.string(), notebookSchema).parse(JSON.parse(notebooks));
    const workspace = this.read('workspace-v2');
    if (workspace) {
      const data = z
        .object({ trips: z.array(tripSchema), journeys: z.array(journeySchema) })
        .parse(JSON.parse(workspace));
      this.trips = data.trips;
      this.journeys = data.journeys;
    } else {
      const legacy = this.read('trips');
      if (legacy) this.trips = z.array(tripSchema).parse(JSON.parse(legacy));
      for (const trip of this.trips) {
        const journey = this.newJourney(trip.title);
        journey.plan = trip.plan;
        trip.journeyId = journey.id;
      }
      this.save();
    }
    for (const trip of this.trips)
      for (const message of trip.messages)
        for (const step of message.activities ?? []) {
          if (step.status === 'active') {
            step.status = 'interrupted';
            step.finishedAt = Date.now();
          }
        }
    const config = this.read('settings');
    if (config) {
      const value = z
        .object({
          permissionMode: z.enum(['ask', 'full-access']).optional(),
          runtime: z.enum(['pi', 'codex']).optional(),
          codexModel: z.string().optional(),
          codexEffort: z.string().optional(),
          baseURL: z.string(),
          model: z.string(),
          imageInput: z.boolean().optional(),
          encryptedKey: z.string(),
          jevExperiments: jevExperimentsSchema.optional(),
          encryptedJevKey: z.string().optional(),
          encryptedTavilyKey: z.string().optional(),
        })
        .parse(JSON.parse(config));
      this.settings = {
        jevExperiments: value.jevExperiments,
        permissionMode: value.permissionMode,
        runtime: value.runtime,
        codexModel: value.codexModel,
        codexEffort: value.codexEffort,
        imageInput: value.imageInput,
        tavilyApiKey: value.encryptedTavilyKey
          ? cipher.decrypt(Buffer.from(value.encryptedTavilyKey, 'base64'))
          : '',
        jevApiKey: value.encryptedJevKey
          ? cipher.decrypt(Buffer.from(value.encryptedJevKey, 'base64'))
          : '',
        baseURL: value.baseURL,
        model: value.model,
        apiKey: value.encryptedKey ? cipher.decrypt(Buffer.from(value.encryptedKey, 'base64')) : '',
      };
    }
    for (const trip of this.trips) {
      trip.settings ??= this.conversationDefaults();
      // Older conversations must not inherit a later increase in shared permissions.
      trip.settings.permissionMode ??= 'ask';
    }
    this.save();
  }
  private conversationDefaults() {
    return {
      ...conversationSettingsSchema.parse(this.settings),
      permissionMode: this.settings.permissionMode ?? ('ask' as const),
      runtime: this.settings.runtime ?? ('pi' as const),
      codexModel: this.settings.codexModel ?? '',
      codexEffort: this.settings.codexEffort ?? '',
      jevExperiments: structuredClone(
        this.settings.jevExperiments ?? { browser: false, webSearch: false, localSearch: false },
      ),
    };
  }
  settingsFor(trip: Trip): Settings {
    return structuredClone({
      ...this.settings,
      ...trip.settings,
      imageInput: trip.settings ? trip.settings.imageInput : this.settings.imageInput,
    });
  }
  configureConversation(trip: Trip, patch: unknown) {
    trip.settings = {
      ...this.conversationDefaults(),
      ...trip.settings,
      ...conversationSettingsSchema.parse(patch),
    };
    this.save();
    return this.settingsFor(trip);
  }
  private read(name: string) {
    const row = this.db.prepare('SELECT value FROM state WHERE name=?').get(name);
    return row ? String(row.value) : null;
  }
  private write(name: string, value: object) {
    this.db
      .prepare('INSERT OR REPLACE INTO state(name,value) VALUES (?,?)')
      .run(name, JSON.stringify(value));
  }
  save() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.write('workspace-v2', { trips: this.trips, journeys: this.journeys });
      this.db.prepare('DELETE FROM state WHERE name=?').run('trips');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  notebook(journeyId: string): Notebook {
    if (!this.journeys.some((j) => j.id === journeyId)) throw new Error('旅行文件夹不存在');
    return this.notebooks[journeyId] ?? notebookSchema.parse({});
  }
  browserHistory(journeyId: string): BrowserVisit[] {
    if (!this.journeys.some((j) => j.id === journeyId)) throw new Error('旅行文件夹不存在');
    return this.visits[journeyId] ?? [];
  }
  recordBrowserVisit(journeyId: string, raw: BrowserVisit): BrowserVisit[] {
    const previous = this.browserHistory(journeyId);
    const visit = browserVisitSchema.parse(raw);
    const entries = [visit, ...previous.filter((item) => item.url !== visit.url)].slice(0, 100);
    const visits = { ...this.visits, [journeyId]: entries };
    this.write('browser-history-v1', visits);
    this.visits = visits;
    return entries;
  }
  clearBrowserHistory(journeyId: string): void {
    this.browserHistory(journeyId);
    const visits = { ...this.visits };
    delete visits[journeyId];
    this.write('browser-history-v1', visits);
    this.visits = visits;
  }
  private saveNotebook(journeyId: string, notebook: Notebook) {
    this.notebooks[journeyId] = notebook;
    this.write('notebooks-v1', this.notebooks);
    return notebook;
  }
  prepare(journeyId: string) {
    const items = this.notebook(journeyId).todos;
    return { revision: createHash('sha256').update(JSON.stringify(items)).digest('hex'), items };
  }
  updatePrepare(journeyId: string, raw: unknown) {
    const input = prepareToolSchema.parse(raw);
    if (input.action !== 'update') throw new Error('需要 update 操作');
    const current = this.prepare(journeyId);
    if (input.revision !== current.revision) throw new Error('准备待办已改变，请重新读取后合并');
    this.updateNotebook(journeyId, { todos: mergePreparation(current.items, input.items) });
    return this.prepare(journeyId);
  }
  updateNotebook(journeyId: string, patch: unknown) {
    const current = this.notebook(journeyId);
    return this.saveNotebook(journeyId, { ...current, ...notebookPatchSchema.parse(patch) });
  }
  addBookmark(journeyId: string, value: unknown) {
    const current = this.notebook(journeyId);
    const quote = quoteSchema.parse(value);
    const trip = this.trips.find((t) => t.id === quote.tripId && t.journeyId === journeyId);
    if (!trip?.messages.some((m) => m.id === quote.messageId && m.role === 'assistant'))
      throw new Error('来源回复不存在或不属于当前旅行');
    if (
      current.bookmarks.some(
        (b) =>
          b.tripId === quote.tripId && b.messageId === quote.messageId && b.text === quote.text,
      )
    )
      return current;
    if (current.bookmarks.length >= 1000) throw new Error('标记最多保存1000条');
    return this.saveNotebook(journeyId, {
      ...current,
      bookmarks: [
        ...current.bookmarks,
        { ...quote, id: randomUUID(), tripTitle: trip.title, createdAt: Date.now() },
      ],
    });
  }
  removeBookmark(journeyId: string, id: string) {
    const current = this.notebook(journeyId);
    return this.saveNotebook(journeyId, {
      ...current,
      bookmarks: current.bookmarks.filter((b) => b.id !== id),
    });
  }
  configure(settings: Settings) {
    const encryptedKey = settings.apiKey
      ? this.cipher.encrypt(settings.apiKey).toString('base64')
      : '';
    this.write('settings', {
      jevExperiments: settings.jevExperiments,
      permissionMode: settings.permissionMode,
      runtime: settings.runtime,
      codexModel: settings.codexModel,
      codexEffort: settings.codexEffort,
      imageInput: settings.imageInput,
      baseURL: settings.baseURL,
      model: settings.model,
      encryptedKey,
      encryptedTavilyKey: settings.tavilyApiKey
        ? this.cipher.encrypt(settings.tavilyApiKey).toString('base64')
        : '',
      encryptedJevKey: settings.jevApiKey
        ? this.cipher.encrypt(settings.jevApiKey).toString('base64')
        : '',
    });
    this.settings = settings;
  }
  private newJourney(title: string) {
    const journey: Journey = {
      id: randomUUID(),
      title: nameSchema.parse(title),
      plan: null,
      html: '',
      entries: [],
      revision: 0,
      updatedAt: Date.now(),
    };
    this.journeys.unshift(journey);
    return journey;
  }
  journeyFor(trip: Trip) {
    const journey = this.journeys.find((j) => j.id === trip.journeyId);
    if (!journey) throw new Error('旅行文件夹不存在');
    return journey;
  }
  removeJourney(id: string): string[] {
    if (!this.journeys.some((journey) => journey.id === id)) throw new Error('旅行文件夹不存在');
    const removed = this.trips.filter((trip) => trip.journeyId === id).map((trip) => trip.id);
    const journeys = this.journeys.filter((journey) => journey.id !== id);
    const trips = this.trips.filter((trip) => trip.journeyId !== id);
    const notebooks = { ...this.notebooks };
    delete notebooks[id];
    const visits = { ...this.visits };
    delete visits[id];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.write('workspace-v2', { trips, journeys });
      this.write('notebooks-v1', notebooks);
      this.write('browser-history-v1', visits);
      this.db.prepare('DELETE FROM state WHERE name=?').run('trips');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.trips = trips;
    this.journeys = journeys;
    this.notebooks = notebooks;
    this.visits = visits;
    return removed;
  }
  createJourney(title: string) {
    return this.create(this.newJourney(title).id);
  }
  renameTrip(id: string, title: string) {
    const trip = this.trips.find((t) => t.id === id);
    if (!trip) throw new Error('会话不存在');
    trip.title = nameSchema.parse(title);
    trip.customTitle = true;
    this.save();
    return trip;
  }
  setJourneyCompleted(id: string, completed: boolean) {
    const journey = this.journeys.find((j) => j.id === id);
    if (!journey) throw new Error('旅行文件夹不存在');
    journey.completed = z.boolean().parse(completed);
    this.save();
    return journey;
  }
  renameJourney(id: string, title: string) {
    const journey = this.journeys.find((j) => j.id === id);
    if (!journey) throw new Error('旅行文件夹不存在');
    journey.title = nameSchema.parse(title);
    journey.updatedAt = Date.now();
    this.save();
    return journey;
  }
  moveTrip(id: string, journeyId: string) {
    const trip = this.trips.find((t) => t.id === id);
    const journey = this.journeys.find((j) => j.id === journeyId);
    if (!trip || !journey) throw new Error('会话或旅行文件夹不存在');
    trip.journeyId = journeyId;
    trip.plan = journey.plan;
    this.save();
    return trip;
  }
  updatePlan(journeyId: string, plan: Trip['plan']) {
    const journey = this.journeys.find((j) => j.id === journeyId);
    if (!journey) throw new Error('旅行文件夹不存在');
    const known = new Set((journey.photos ?? []).map((p) => p.id));
    const old = journey.plan?.days.flatMap((d) => d.activities) ?? [];
    const used = new Set<string>();
    for (const activity of plan?.days.flatMap((d) => d.activities) ?? []) {
      for (const id of activity.photoIds ?? []) {
        if (!known.has(id)) throw new Error('照片不属于本旅行');
        const photo = journey.photos!.find((p) => p.id === id)!;
        if (
          ![activity.title, activity.location?.name].some(
            (name) => name?.toLocaleLowerCase() === photo.subject.toLocaleLowerCase(),
          )
        )
          throw new Error('照片目标与活动名称不一致，请核对分店及地点');
      }
      if (!activity.id) {
        const previous = old.find(
          (a) =>
            a.id &&
            !used.has(a.id) &&
            a.title === activity.title &&
            a.location?.name === activity.location?.name,
        );
        if (previous?.id) activity.id = previous.id;
      }
      if (activity.id) {
        if (used.has(activity.id)) throw new Error('活动 ID 重复');
        used.add(activity.id);
      }
    }
    journey.plan = plan;
    journey.revision++;
    journey.updatedAt = Date.now();
    for (const trip of this.trips) if (trip.journeyId === journeyId) trip.plan = plan;
    this.save();
    return journey;
  }
  editPlan(journeyId: string, revision: number, edit: ItineraryEdit) {
    const journey = this.journeys.find((j) => j.id === journeyId);
    if (!journey?.plan) throw new Error('行程不存在');
    if (journey.revision !== revision) throw new Error('行程已更新，请重新操作');
    return this.updatePlan(journeyId, editItinerary(journey.plan, edit));
  }
  savePhoto(journeyId: string, value: unknown, activityId?: string) {
    const photo = photoSchema.parse(value);
    const journey = this.journeys.find((j) => j.id === journeyId);
    if (!journey) throw new Error('旅行不存在');
    const photos = journey.photos ?? [];
    if (photos.length >= 100 && !photos.some((p) => p.id === photo.id))
      throw new Error('照片数量已达到上限');
    if (activityId) {
      let activity: NonNullable<Journey['plan']>['days'][number]['activities'][number] | undefined;
      journey.plan?.days.forEach((d, di) =>
        d.activities.forEach((a, ai) => {
          if ((a.id ?? `vitrip-stop-${di}-${ai}`) === activityId) activity = a;
        }),
      );
      if (!activity) throw new Error('活动不存在');
      const target = activity;
      if (
        ![target.title, target.location?.name].some(
          (name) => name?.toLocaleLowerCase() === photo.subject.toLocaleLowerCase(),
        )
      )
        throw new Error('照片目标与活动名称不一致，请核对分店及地点');
      target.photoIds = [...new Set([...(target.photoIds ?? []), photo.id])].slice(0, 8);
    }
    journey.photos = [...photos.filter((p) => p.id !== photo.id), photo];
    journey.revision++;
    journey.updatedAt = Date.now();
    for (const trip of this.trips) if (trip.journeyId === journeyId) trip.plan = journey.plan;
    this.save();
    return journey;
  }
  updateJournal(journeyId: string, value: unknown) {
    const update = journalSchema.parse(value);
    const journey = this.journeys.find((j) => j.id === journeyId);
    if (!journey) throw new Error('旅行文件夹不存在');
    const entries = new Map(journey.entries.map((e) => [e.id, e]));
    for (const entry of update.entries) entries.set(entry.id, entry);
    if (entries.size > 200) throw new Error('已整理事项超过200条，请合并重复事项后更新');
    const next = { ...journey, entries: [...entries.values()], html: update.html ?? journey.html };
    if (JSON.stringify(next).length > 200000) throw new Error('旅行手册过长，请精简后更新');
    Object.assign(journey, next, { revision: journey.revision + 1, updatedAt: Date.now() });
    this.save();
    return journey;
  }
  contextFor(trip: Trip) {
    return JSON.stringify({
      journey: this.journeyFor(trip),
      relatedConversations: this.trips
        .filter((t) => t.journeyId === trip.journeyId && t.id !== trip.id)
        .slice(0, 8)
        .map((t) => ({
          title: t.title,
          messages: t.messages
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 2500) })),
        })),
    });
  }
  create(journeyId?: string) {
    const journey = journeyId
      ? this.journeys.find((j) => j.id === journeyId)
      : this.newJourney('新的旅行');
    if (!journey) throw new Error('旅行文件夹不存在');
    const trip: Trip = {
      id: randomUUID(),
      journeyId: journey.id,
      title: '新的会话',
      settings: this.conversationDefaults(),
      messages: [],
      plan: journey.plan,
      updatedAt: Date.now(),
    };
    this.trips.unshift(trip);
    this.save();
    return trip;
  }
  close() {
    this.db.close();
  }
}
