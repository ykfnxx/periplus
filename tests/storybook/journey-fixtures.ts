import type { JourneySnapshot } from "@/modules/data-model/contracts"
import {
  storyJourney,
  storyReceipt,
} from "@/modules/travelogue/ui/recording-story-data"

const first = storyJourney.events[0]
export const singleChainJourney: JourneySnapshot = {
  ...storyJourney,
  title: "杭州、上海，再回杭州",
  events: [
    {
      ...first,
      id: "hangzhou-breakfast",
      title: "杭州早餐",
      photos: [],
      receipts: [],
    },
    {
      ...first,
      id: "train-to-shanghai",
      title: "坐高铁去上海",
      body: "沿途看了会儿窗外。",
      category: "TRANSIT",
      location: null,
      photos: [],
      receipts: [],
    },
    {
      ...first,
      id: "shanghai-walk",
      title: "上海散步",
      body: "走过梧桐树下的小街。",
      date: "2026-10-19",
      location: {
        name: "上海",
        address: null,
        coordinates: { lat: 31.23, lng: 121.47, coordinateSystem: "GCJ02" },
      },
      photos: [],
      receipts: [],
    },
    {
      ...first,
      id: "hangzhou-return",
      title: "回到杭州",
      body: "回到湖边继续昨天没走完的路。",
      date: "2026-10-20",
    },
    {
      ...first,
      id: "undated-note",
      title: "路上的随记",
      body: "没有日期和地点，也可以留在原来的位置。",
      category: null,
      date: null,
      time: null,
      timeZone: null,
      location: null,
      photos: [],
      receipts: [],
    },
  ],
}

export const journeyWithDetails: JourneySnapshot = {
  ...singleChainJourney,
  title: "杭州与上海的旅行记录",
  events: singleChainJourney.events.map((event) =>
    event.id === "train-to-shanghai"
      ? {
          ...event,
          time: "12:00",
          planning: {
            startAt: "2026-10-18T12:00:00+08:00",
            endAt: "2026-10-18T13:00:00+08:00",
            durationMinutes: 60,
          },
          transit: {
            fromEventId: "hangzhou-breakfast",
            toEventId: "shanghai-walk",
            transportMode: "TRAIN",
            routeState: "READY",
            route: {
              requestFingerprint: "story-route",
              plans: [
                {
                  id: "selected-route",
                  provider: "storybook",
                  rank: 0,
                  label: "示例高铁路线",
                  strategy: "RECOMMENDED",
                  distanceMeters: 180000,
                  durationSeconds: 3600,
                  trafficBasis: "UNKNOWN",
                  calculatedAt: "2026-10-17T00:00:00Z",
                  requestFingerprint: "story-route",
                  segments: [
                    {
                      id: "rail-segment",
                      order: 0,
                      mode: "RAIL",
                      fromName: "杭州",
                      toName: "上海",
                      durationSeconds: 3600,
                      distanceMeters: 180000,
                      coordinateSystem: "GCJ02",
                      geometryKind: "SCHEMATIC",
                      positions: [
                        [120.149, 30.243],
                        [120.8, 30.7],
                        [121.47, 31.23],
                      ],
                    },
                  ],
                },
              ],
            },
          },
        }
      : event.id === "shanghai-walk"
        ? {
            ...event,
            category: "STAY",
            receipts: [storyReceipt],
            title: "在上海住一晚",
            date: null,
            time: null,
            timeZone: "America/Los_Angeles",
            planning: {
              startAt: "2026-10-20T01:00:00Z",
              durationMinutes: 720,
            },
            hotel: {
              provider: "rollinggo",
              providerHotelId: "story-hotel",
              address: "上海市示例地址",
              startingPrice: { amount: 480, currency: "CNY" },
              fetchedAt: "2026-10-17T00:00:00Z",
              checkInNote: "15:00 后入住",
            },
          }
        : event
  ),
}
