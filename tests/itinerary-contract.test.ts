import { describe, expect, it } from 'vitest';
import { planSchema } from '../src/shared/schemas';

const legacy = {
  title: '普吉岛',
  subtitle: '原攻略',
  budget: '',
  days: [
    {
      title: '10月2日',
      subtitle: '',
      activities: [{ time: '白天', title: '皇帝岛', detail: '或芭东休闲' }],
    },
  ],
};

describe('人工攻略的结构化契约', () => {
  it('完整兼容旧行程，不猜测住宿、预订或活动类型', () => {
    expect(planSchema.parse(legacy)).toEqual(legacy);
  });
  it('保留每晚住宿、互斥备选、原文依据与待确认事项', () => {
    const day = {
      ...legacy.days[0],
      stay: {
        name: 'Hotel Clover Patong',
        status: 'planned',
        sourceUrl: 'https://example.com/guide',
      },
      issues: ['是否出海待确认'],
      activities: [
        {
          time: '白天',
          title: '皇帝岛',
          detail: '',
          kind: 'activity',
          optionGroup: 'day-choice',
          optional: true,
          source: { url: 'https://example.com/guide', excerpt: '皇帝岛出海或芭东休闲' },
        },
        {
          time: '白天',
          title: '芭东休闲',
          detail: '',
          kind: 'activity',
          optionGroup: 'day-choice',
        },
      ],
    };
    const plan = {
      ...legacy,
      days: [day],
      source: { excerpt: '原画板逐日表格', url: 'https://example.com/guide' },
      packing: ['电话卡', '护照'],
    };
    expect(planSchema.parse(plan)).toEqual(plan);
  });
  it('拒绝无效状态和不安全来源，不让错误证据进入行程', () => {
    for (const stay of [
      { name: '酒店', status: 'confirmed' },
      { name: '', status: 'planned' },
      { name: '酒店', status: 'planned', sourceUrl: 'javascript:alert(1)' },
    ])
      expect(planSchema.safeParse({ ...legacy, days: [{ ...legacy.days[0], stay }] }).success).toBe(
        false,
      );
    for (const source of [
      { url: 'javascript:alert(1)', excerpt: '原文' },
      { url: 'https://user:secret@example.com', excerpt: '原文' },
      { excerpt: '' },
    ])
      expect(
        planSchema.safeParse({
          ...legacy,
          days: [{ ...legacy.days[0], activities: [{ ...legacy.days[0].activities[0], source }] }],
        }).success,
      ).toBe(false);
  });
});

it('攻略结构经过本地保存和重启后仍完整，且共享会话读取同一份计划', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Storage } = await import('../src/main/storage');
  const directory = mkdtempSync(join(tmpdir(), 'vitrip-contract-'));
  const cipher = {
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
  };
  const plan = planSchema.parse({
    ...legacy,
    source: { excerpt: '原画板行程表' },
    packing: ['电话卡'],
    days: [
      {
        ...legacy.days[0],
        stay: { name: 'Hotel Clover Patong', status: 'planned' },
        issues: ['出海待确认'],
        activities: [
          {
            ...legacy.days[0].activities[0],
            optionGroup: 'choice',
            source: { excerpt: '出海或休闲' },
          },
        ],
      },
    ],
  });
  try {
    const storage = new Storage(directory, cipher);
    const trip = storage.create();
    const sibling = storage.create(trip.journeyId);
    storage.updatePlan(trip.journeyId, plan);
    expect(sibling.plan).toEqual(plan);
    storage.close();
    const restored = new Storage(directory, cipher);
    try {
      expect(restored.journeys.find((journey) => journey.id === trip.journeyId)?.plan).toEqual(
        plan,
      );
    } finally {
      restored.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('离线手册保留每日住宿、备选、待确认、原文证据和准备清单并安全转义', async () => {
  const { journalHTML } = await import('../src/main/journal');
  const plan = planSchema.parse({
    ...legacy,
    source: { url: 'https://example.com/guide', excerpt: '原攻略表格' },
    packing: ['护照', '<img src=x onerror=alert(1)>'],
    days: [
      {
        ...legacy.days[0],
        stay: {
          name: 'Hotel Clover Patong',
          status: 'planned',
          sourceUrl: 'https://example.com/hotel',
        },
        issues: ['出海日期待确认'],
        activities: [
          {
            ...legacy.days[0].activities[0],
            kind: 'activity',
            optionGroup: 'day-choice',
            optional: true,
            source: { url: 'https://example.com/day', excerpt: '出海或休闲原文' },
          },
        ],
      },
    ],
  });
  const html = journalHTML({
    id: 'j',
    title: '攻略',
    plan,
    html: '',
    entries: [],
    revision: 1,
    updatedAt: 1,
  });
  for (const text of [
    'Hotel Clover Patong',
    '预订待确认',
    '出海日期待确认',
    '同组择一',
    '可选',
    '原攻略表格',
    '出海或休闲原文',
    '护照',
    'https://example.com/hotel',
    'https://example.com/day',
  ])
    expect(html).toContain(text);
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img');
  expect(html).toContain("script-src 'none'");
});
