import {
  notebookSchema,
  notebookPatchSchema,
  quoteSchema,
  type Notebook,
} from '../shared/notebook';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { planSchema, journeySchema, journalSchema, nameSchema } from '../shared/schemas';
import type { Settings, Trip, Journey } from '../shared/types';
const tripSchema = z.object({
  id: z.string(),
  journeyId: z.string().default(''),
  customTitle: z.boolean().optional(),
  title: z.string(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      quote: quoteSchema.optional(),
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
    }),
  ),
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
          baseURL: z.string(),
          model: z.string(),
          encryptedKey: z.string(),
          encryptedJevKey: z.string().optional(),
        })
        .parse(JSON.parse(config));
      this.settings = {
        jevApiKey: value.encryptedJevKey
          ? cipher.decrypt(Buffer.from(value.encryptedJevKey, 'base64'))
          : '',
        baseURL: value.baseURL,
        model: value.model,
        apiKey: value.encryptedKey ? cipher.decrypt(Buffer.from(value.encryptedKey, 'base64')) : '',
      };
    }
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
  private saveNotebook(journeyId: string, notebook: Notebook) {
    this.notebooks[journeyId] = notebook;
    this.write('notebooks-v1', this.notebooks);
    return notebook;
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
      baseURL: settings.baseURL,
      model: settings.model,
      encryptedKey,
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
    journey.plan = plan;
    journey.updatedAt = Date.now();
    for (const trip of this.trips) if (trip.journeyId === journeyId) trip.plan = plan;
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
