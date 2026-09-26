import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/main/storage';
import { planHTML } from '../src/main/export';
import { demoPlan } from '../src/shared/demo';

describe('local data and exported plans', () => {
  it('persists trips and passes secrets through the injected OS cipher', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vitrip-store-'));
    // Fake cipher only at the platform boundary; real SQLite exercises persistence.
    const cipher = {
      encrypt: (value: string) => Buffer.from(value.split('').reverse().join('')),
      decrypt: (value: Buffer) => value.toString().split('').reverse().join(''),
    };
    try {
      const first = new Storage(directory, cipher);
      const trip = first.create();
      trip.messages.push({
        id: 'activity',
        role: 'assistant',
        content: '',
        activities: [
          {
            id: 'done',
            name: 'observe',
            input: '{}',
            output: '京都',
            status: 'complete',
            startedAt: 1,
            finishedAt: 2,
          },
          { id: 'pending', name: 'click', input: '{}', output: '', status: 'active', startedAt: 3 },
        ],
      });
      trip.title = '京都';
      trip.plan = demoPlan;
      first.save();
      first.configure({
        baseURL: 'https://example.com/v1',
        model: 'test',
        apiKey: 'do-not-store-in-plain-text',
        jevApiKey: 'jev-never-plain',
      });
      first.close();
      expect(
        readFileSync(join(directory, 'vitrip.sqlite')).includes(
          Buffer.from('do-not-store-in-plain-text'),
        ),
      ).toBe(false);
      const second = new Storage(directory, cipher);
      expect(second.trips[0].title).toBe('京都');
      expect(second.trips[0].messages[0].activities?.map((step) => step.status)).toEqual([
        'complete',
        'interrupted',
      ]);
      expect(second.trips[0].messages[0].activities?.[0].output).toBe('京都');
      expect(second.trips[0].plan).toEqual(demoPlan);
      expect(second.settings.apiKey).toBe('do-not-store-in-plain-text');
      expect(second.settings.jevApiKey).toBe('jev-never-plain');
      expect(
        readFileSync(join(directory, 'vitrip.sqlite')).includes(Buffer.from('jev-never-plain')),
      ).toBe(false);
      second.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('exports standalone HTML without interpreting model-generated HTML or unsafe links', () => {
    const html = planHTML({
      ...demoPlan,
      title: '<script>alert(1)</script>',
      days: [
        {
          title: 'test',
          subtitle: '',
          activities: [
            {
              time: '',
              title: 'safe',
              detail: '<img src=x onerror=alert(1)>',
              url: 'javascript:alert(1)',
            },
          ],
        },
      ],
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("default-src 'none'");
  });
});
