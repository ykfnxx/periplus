import type { Route } from '@/types/route';

export const silkRoadRoute: Route = {
  id: 'preset-silk-road',
  name: '丝绸之路',
  description: '从长安出发，经河西走廊至西域的经典路线',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  points: [
    { id: 'p1', name: '西安', lat: 34.3416, lng: 108.9398, order: 0, stayHours: 72, notes: '起点，兵马俑、大雁塔' },
    { id: 'p2', name: '兰州', lat: 36.0611, lng: 103.8343, order: 1, stayHours: 48, notes: '黄河风情线、牛肉面' },
    { id: 'p3', name: '张掖', lat: 38.9259, lng: 100.4498, order: 2, stayHours: 48, notes: '七彩丹霞、大佛寺' },
    { id: 'p4', name: '嘉峪关', lat: 39.7728, lng: 98.2892, order: 3, stayHours: 24, notes: '天下第一雄关' },
    { id: 'p5', name: '敦煌', lat: 40.1421, lng: 94.6615, order: 4, stayHours: 72, notes: '莫高窟、鸣沙山月牙泉' },
    { id: 'p6', name: '吐鲁番', lat: 42.9513, lng: 89.1897, order: 5, stayHours: 48, notes: '火焰山、葡萄沟' },
    { id: 'p7', name: '乌鲁木齐', lat: 43.8256, lng: 87.6168, order: 6, stayHours: 48, notes: '终点，新疆首府' },
  ],
};
