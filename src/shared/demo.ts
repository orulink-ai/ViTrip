import type { Plan } from './types';
export const demoPlan: Plan = {
  title: '去京都，把脚步放慢',
  subtitle: '3 天 · 城市漫步与山间绿意 · 示例行程，尚未检索或预订',
  budget: '预算待确认 · 价格未核实',
  days: [
    {
      title: 'DAY 01 · 在古都醒来',
      subtitle: '东山 / 鸭川 · 留一点时间给偶遇',
      activities: [
        {
          time: '09:00',
          title: '从清水寺走进东山',
          detail: '沿着石板路慢慢走，串联二年坂与三年坂。出发前核实开放时间与门票。',
          location: {
            name: '清水寺',
            latitude: 34.9949,
            longitude: 135.785,
            precision: 'approximate',
          },
        },
        {
          time: '13:00',
          title: '找一间小店，吃一顿好饭',
          detail: '午餐和咖啡之间留出休息时间，避免把行程排得太满。',
        },
        {
          time: '17:00',
          title: '把黄昏留给鸭川',
          detail: '沿河散步，在三条附近结束今天的漫游。',
          location: {
            name: '鸭川 · 三条附近',
            latitude: 35.009,
            longitude: 135.771,
            precision: 'approximate',
          },
        },
      ],
    },
    {
      title: 'DAY 02 · 向山里走一点',
      subtitle: '岚山 / 竹林 · 轻松的一日往返',
      activities: [
        {
          time: '08:30',
          title: '早一点抵达岚山',
          detail: '竹林、渡月桥与河畔步道按体力取舍。交通与实际拥挤情况需要进一步查询。',
          location: {
            name: '岚山竹林',
            latitude: 35.017,
            longitude: 135.671,
            precision: 'approximate',
          },
        },
        {
          time: '15:00',
          title: '在河边停留',
          detail: '给自己一段没有任务的时间，傍晚返回市区。',
          location: {
            name: '渡月桥附近',
            latitude: 35.0134,
            longitude: 135.6778,
            precision: 'approximate',
          },
        },
      ],
    },
    {
      title: 'DAY 03 · 收集最后的日常',
      subtitle: '锦市场 / 市中心 · 为返程预留余量',
      activities: [
        {
          time: '10:00',
          title: '逛逛市场与小巷',
          detail: '按照返程时间调整，预留取行李和前往车站的时间。',
          location: {
            name: '锦市场',
            latitude: 35.005,
            longitude: 135.765,
            precision: 'approximate',
          },
        },
      ],
    },
  ],
};
