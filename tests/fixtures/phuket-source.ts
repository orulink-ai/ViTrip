import type { Plan } from '../../src/shared/types';

/** Sanitized snapshot: saved legacy plan intentionally retains omissions and duplicate stays. */
export const phuketSavedPlan: Plan = {
  title: '普吉岛之行（据你的飞书文档整理·含地图点位与时间线）',
  subtitle:
    '来源：你的飞书知识库文档《十一泰国🇹🇭普吉岛》画板行程表。地图点位取自 OpenStreetMap（WGS84，每个点保留来源链接）；店名/酒店未被 OSM 收录处按“大致区域”标注。泰国段 9/28–10/3，之后 10/4 休息、10/5 去香港住一晚。住宿、打枪与看秀、皇帝岛是否出海仍需确认，人数与预算待定。',
  budget:
    '文档未给出总预算，待补充（交通/船票参考：机场大巴100泰铢、皮皮岛包船2600泰铢≈521元、斯米兰621元/人但国庆不开放）',
  days: [
    {
      title: '9月28日 · 抵达普吉岛',
      subtitle: '深圳宝安凌晨出发 → 曼谷转机 → 普吉岛，先休息不赶行程',
      activities: [
        {
          time: '凌晨 03:30',
          title: '深圳宝安机场出发',
          detail: '文档记录的出发时间：9月28号凌晨3点半宝安机场出发。',
          location: {
            name: '深圳宝安国际机场',
            latitude: 22.64037,
            longitude: 113.8031,
            precision: 'place',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '凌晨 05:15',
          title: '曼谷转机（机场待确认）',
          detail:
            '凌晨5:15到曼谷T1航站楼转机。注：文档只写了“T1”，未指明机场——素万那普（BKK）和廊曼（DMK）都有 T1，待你确认后再补地图点位。',
        },
        {
          time: '上午 10:10',
          title: '抵达普吉岛国际机场',
          detail:
            '落地后前往住宿。交通参考：机场到海滩可坐机场大巴（100泰铢）；打车可用Grab，Bolt 比 Grab 便宜约20%；突突车报价虚高需提前砍价。',
          location: {
            name: '普吉国际机场',
            latitude: 8.11013,
            longitude: 98.30582,
            precision: 'place',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '下午',
          title: '入住卡塔一带，附近轻松逛逛',
          detail:
            '文档安排：抵达后先休息，下午在附近轻松逛逛。卡塔/卡伦一带沙质细腻、氛围安静，适合缓一缓。具体酒店名称待确认，地图上先标卡塔海滩区域。',
          location: {
            name: '卡塔海滩（当日住宿区域）',
            latitude: 7.81936,
            longitude: 98.29805,
            precision: 'approximate',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '傍晚',
          title: '可选：卡塔/卡伦海滩散步或悬崖咖啡厅看日落',
          detail:
            '文档候选：the commune（每人180铢入场费可抵饮料）、Laem Sai Cup Cafe（最低消费100铢）、A Blanket & A Pillow；也可去卡塔诺伊海滩或卡伦海滩。图上是 Laem Sai 岬角一带（酒店具体位置待确认）。',
          location: {
            name: 'Laem Sai 岬角（悬崖咖啡厅一带）',
            latitude: 7.82541,
            longitude: 98.29071,
            precision: 'approximate',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '晚上',
          title: '入住卡塔度假酒店',
          detail: '文档记录：28号住卡塔度假酒店（是否已预订待确认）。',
          location: {
            name: '卡塔海滩一带',
            latitude: 7.81936,
            longitude: 98.29805,
            precision: 'approximate',
            sourceUrl: 'https://example.com/source',
          },
        },
      ],
    },
    {
      title: '9月29日 · 前往皮皮岛',
      subtitle: '坐船过去，入住后放慢节奏',
      activities: [
        {
          time: '上午',
          title: '买船票、坐船去大皮皮岛',
          detail: '文档记录船票用 Agoda 买。坐船从普吉出发前往大皮皮岛（通塞一带码头）。',
          location: {
            name: '大皮皮岛（通塞一带）',
            latitude: 7.75224,
            longitude: 98.77664,
            precision: 'approximate',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '下午',
          title: '入住 SAII 塞伊皮皮岛度假酒店，岛上慢慢逛',
          detail:
            'SAII 塞伊皮皮岛度假酒店（OSM: SAii Phi Phi Island Village Resort），有私人沙滩，可在酒店好好休息。',
          location: {
            name: 'SAii Phi Phi Island Village Resort',
            latitude: 7.76126,
            longitude: 98.77251,
            precision: 'place',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '晚上',
          title: '住皮皮岛 SAII 塞伊皮皮岛度假酒店',
          detail: '文档记录：29号住 SAII（预约状态待确认）。',
          location: {
            name: 'SAii Phi Phi Island Village Resort',
            latitude: 7.76126,
            longitude: 98.77251,
            precision: 'place',
            sourceUrl: 'https://example.com/source',
          },
        },
      ],
    },
    {
      title: '9月30日 · 皮皮岛出海一日',
      subtitle: '浮潜 + 通塞夜生活',
      activities: [
        {
          time: '全天',
          title: '皮皮岛包船出海、浮潜',
          detail:
            '文档记录：可在岛边包船夫，2600泰铢≈521元人民币，随便到哪里、随走随停；浮潜为主。地图标注为皮皮岛周边海域（包船路线当天定）。',
          location: {
            name: '皮皮岛周边海域（包船出海）',
            latitude: 7.75224,
            longitude: 98.77664,
            precision: 'approximate',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '傍晚',
          title: '返回度假村休息',
          detail: '仍住 SAII 塞伊皮皮岛度假酒店。',
          location: {
            name: 'SAii Phi Phi Island Village Resort',
            latitude: 7.76126,
            longitude: 98.77251,
            precision: 'place',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '晚上',
          title: '通塞逛街看表演 + The Mango Garden 芒果糯米饭',
          detail:
            '文档记录：晚上可以在皮皮岛通塞逛逛，有各种表演；推荐 The Mango Garden 吃芒果糯米饭，吃完去沙滩酒吧，氛围很好（这两家店 OSM 未收录，地图先标通塞一带）。',
          location: {
            name: '皮皮岛通塞一带',
            latitude: 7.75224,
            longitude: 98.77664,
            precision: 'approximate',
            sourceUrl: 'https://example.com/source',
          },
        },
      ],
    },
    {
      title: '10月1日 · 返回普吉岛，打枪 + 天皇秀',
      subtitle: '文档标注：这天偏紧',
      activities: [
        {
          time: '上午',
          title: '从皮皮岛坐船返回普吉岛',
          detail: '从皮皮岛回普吉岛，下船后还要码头接送、放行李、吃饭。',
          location: {
            name: '大皮皮岛码头（通塞一带）',
            latitude: 7.75224,
            longitude: 98.77664,
            precision: 'approximate',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '下午',
          title: '打枪（可留调整空间）',
          detail:
            '文档原话：1号可能有点紧。回普吉岛不是下船就到酒店，还要留出码头接送、放行李和吃饭的时间。如果下午打枪、晚上看秀都固定预约，这天就比较依赖船班准点。建议以晚上的秀为主要安排，打枪保留调整空间。具体射击场未定，暂不标地图点。',
        },
        {
          time: '晚上',
          title: '看“天皇秀”＋逛芭东 Bangla 步行街',
          detail: '文档记录：晚上看天皇秀；可顺带逛芭东 Bangla 步行街（酒吧狂欢圣地）。',
          location: {
            name: 'Bangla Road（芭东步行街）',
            latitude: 7.8936,
            longitude: 98.29656,
            precision: 'place',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '晚上',
          title: '住芭东 Hotel Clover Patong',
          detail:
            '文档记录：1号住芭东的 Hotel Clover Patong（是否已预订待确认；该酒店 OSM 未收录，地图先标芭东海滩区域）。',
          location: {
            name: '芭东海滩一带（住宿区域）',
            latitude: 7.89663,
            longitude: 98.29543,
            precision: 'approximate',
            sourceUrl: 'https://example.com/source',
          },
        },
      ],
    },
    {
      title: '10月2日 · 可选出海或芭东休闲',
      subtitle: '保留为可选项，看天气和体力',
      activities: [
        {
          time: '全天',
          title: '可选：大小皇帝岛一日游（可深潜）',
          detail:
            '文档记录：看天气、体力和兴致，决定是否去大小皇帝岛一日游；也可在皇帝岛潜水。地图标皇帝岛（Koh Racha Yai）。',
          location: {
            name: '皇帝岛（Koh Racha Yai）',
            latitude: 7.60245,
            longitude: 98.36542,
            precision: 'place',
            sourceUrl: 'https://example.com/source',
          },
        },
        {
          time: '备选',
          title: '备选：芭东海滩水上项目 / 酒店休息',
          detail: '若不重新出海：芭东海滩开发最成熟、水上项目多；也可躺酒店。',
          location: {
            name: '芭东海滩',
            latitude: 7.89663,
            longitude: 98.29543,
            precision: 'place',
            sourceUrl: 'https://example.com/source',
          },
        },
      ],
    },
    {
      title: '10月3日 · 大象半日游 → 返程',
      subtitle: '结束后去机场回家',
      activities: [
        {
          time: '上午',
          title: '自由安排 / 收拾行李',
          detail: '文档未细化，可结合航班时间调整；若在普吉镇方向，可顺便逛老街（仅供参考）。',
        },
        {
          time: '下午',
          title: '大象半日游',
          detail:
            '文档记录：3号下午大象半日游（同组候选还有动物园半日游、丛林飞跃）。具体营地未定，暂无地图点位。',
        },
        {
          time: '傍晚',
          title: '前往机场，搭机回家',
          detail:
            '文档记录：大象半日游结束后去机场。“飞机上／回家，取决于航班时间”。回程机场若为普吉国际机场，点位见地图。',
          location: {
            name: '普吉国际机场',
            latitude: 8.11013,
            longitude: 98.30582,
            precision: 'place',
            sourceUrl: 'https://example.com/source',
          },
        },
      ],
    },
  ],
};

/** Six original table rows; source URLs are synthetic, not live private documents. */
export const phuketSourceDays = [
  {
    date: '9月28日',
    summary: '抵达普吉岛，先休息，下午在附近轻松逛逛',
    overnight: '普吉岛\n卡塔度假酒店',
    excerpt: '抵达普吉岛，先休息，下午在附近轻松逛逛\n晚上住哪里：普吉岛\n卡塔度假酒店',
    sourceUrl: 'https://example.com/guide#day-1',
  },
  {
    date: '9月29日',
    summary: '坐船去皮皮岛，入住后下午在岛上慢慢逛，不赶行程',
    overnight: '皮皮岛 - SAII塞伊皮皮岛度假酒店',
    excerpt:
      '坐船去皮皮岛，入住后下午在岛上慢慢逛，不赶行程\n晚上住哪里：皮皮岛 - SAII塞伊皮皮岛度假酒店',
    sourceUrl: 'https://example.com/guide#day-2',
  },
  {
    date: '9月30日',
    summary: '在皮皮岛安排一天出海',
    overnight: '皮皮岛 - SAII塞伊皮皮岛度假酒店',
    excerpt: '在皮皮岛安排一天出海\n晚上住哪里：皮皮岛 - SAII塞伊皮皮岛度假酒店',
    sourceUrl: 'https://example.com/guide#day-3',
  },
  {
    date: '10月1日',
    summary: '坐船返回普吉岛，下午打枪，晚上看你说的“天皇秀”',
    overnight: '普吉岛\n芭东的Hotel Clover Patong',
    excerpt:
      '坐船返回普吉岛，下午打枪，晚上看你说的“天皇秀”\n1号可能有点紧。 回普吉岛不是下船就到酒店，还要留出码头接送、放行李和吃饭的时间。如果下午打枪、晚上看秀都固定预约，这天就比较依赖船班准点。可以先把晚上的秀作为主要安排，打枪保留调整空间。\n晚上住哪里：普吉岛\n芭东的Hotel Clover Patong',
    sourceUrl: 'https://example.com/guide#day-4',
  },
  {
    date: '10月2日',
    summary: '看天气、体力和兴致，决定是否去大小皇帝岛一日游',
    overnight: '普吉岛\n芭东的Hotel Clover Patong',
    excerpt:
      '看天气、体力和兴致，决定是否去大小皇帝岛一日游\n2号大小皇帝岛适合继续保留为可选。 30号已经有一次完整出海，再去大小皇帝岛不是不行，关键看你们是特别喜欢海岛浮潜，还是更想多体验不同项目。你现在“看情况”的想法挺合适。\n晚上住哪里：普吉岛\n芭东的Hotel Clover Patong',
    sourceUrl: 'https://example.com/guide#day-5',
  },
  {
    date: '10月3日',
    summary: '下午大象半日游，结束后去机场，搭机回家',
    overnight: '飞机上／回家，取决于航班时间',
    excerpt: '下午大象半日游，结束后去机场，搭机回家\n晚上住哪里：飞机上／回家，取决于航班时间',
    sourceUrl: 'https://example.com/guide#day-6',
  },
];

/** Labels extracted from the original preparation table, without stale price claims. */
export const phuketPacking = [
  '泳衣',
  '沙滩毛巾',
  '浮潜面镜和呼吸管、潜水袜',
  '防水手机袋',
  '驱蚊液',
  '拖鞋、轻便夏装、薄外套',
  '常用药品（感冒药、创口贴、肠胃药）',
  '防晒霜',
  '电话卡',
];

/** Reviewed presentation fixture. This is test data, not a migration of the user's database. */
export function createPhuketPlan(): Plan {
  const plan = structuredClone(phuketSavedPlan);
  plan.title = '普吉岛之旅';
  plan.subtitle = '9月28日—10月3日 · 6天 · 据原攻略整理';
  plan.source = {
    url: 'https://example.com/guide',
    excerpt: '原画板逐日表：日期、当天安排、晚上住哪里。住宿为计划，未提供预订确认。',
  };
  plan.packing = [...phuketPacking];
  const stays = [
    '卡塔度假酒店',
    'SAII 塞伊皮皮岛度假酒店',
    'SAII 塞伊皮皮岛度假酒店',
    'Hotel Clover Patong',
    'Hotel Clover Patong',
    '飞机上／回家，取决于航班时间',
  ];
  plan.days.forEach((day, index) => {
    const row = phuketSourceDays[index];
    day.stay = {
      name: stays[index],
      status: index === 5 ? 'pending' : 'planned',
      sourceUrl: row.sourceUrl,
    };
    day.activities.forEach((activity) => {
      activity.kind = /入住|^住|返回度假村/.test(activity.title)
        ? 'stay'
        : /机场|转机|坐船/.test(activity.title)
          ? 'transport'
          : 'activity';
    });
  });
  plan.days[0].issues = ['曼谷转机机场与航站楼待核对；时间沿用原攻略，时区未注明'];
  plan.days[0].activities[0].source = {
    url: 'https://example.com/guide#departure',
    excerpt: '9月28号凌晨3点半宝安机场',
  };
  plan.days[0].activities[1].source = {
    url: 'https://example.com/guide#connection',
    excerpt: '9月28号，凌晨5:15到曼谷T1航站楼',
  };
  plan.days[0].activities[1].detail = '原攻略写有曼谷 T1，机场名称及转机航站楼关系待核对。';
  plan.days[0].activities[4].optional = true;
  plan.days[1].activities[1].source = {
    url: phuketSourceDays[1].sourceUrl,
    excerpt: phuketSourceDays[1].excerpt,
  };
  plan.days[3].issues = ['原攻略提示当日偏紧，船班、接送和演出预约时间待确认'];
  plan.days[3].activities[1].optional = true;
  // A street coordinate cannot also locate an unconfirmed performance venue.
  delete plan.days[3].activities[2].location;
  plan.days[3].activities[2].detail += ' 演出场地待确认；步行街坐标不能代表演出地点。';
  plan.days[4].issues = ['大小皇帝岛出海尚未决定；请按天气、体力选择一个方案'];
  plan.days[4].activities.forEach((activity) => {
    activity.optionGroup = '10-02-daytime';
    activity.optional = true;
  });
  plan.days[4].activities[0].source = {
    url: phuketSourceDays[4].sourceUrl,
    excerpt: phuketSourceDays[4].excerpt,
  };
  plan.days[4].activities[1].origin = 'suggestion';
  plan.days[4].activities[1].detail = 'AI 补充的休闲备选，原逐日表未指定此方案；尚未选定。';
  plan.days[5].issues = ['回程航班时间与大象营地待确认'];
  return plan;
}

export const phuketPlan = createPhuketPlan();
