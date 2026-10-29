import type { JourneySnapshot } from "@/modules/data-model/contracts"
import { journeyWithDetails } from "./journey-fixtures"
import {
  storyJourney,
  storyReceipt,
} from "@/modules/travelogue/ui/recording-story-data"

const first = storyJourney.events[0]
const route = journeyWithDetails.events[1].transit!.route!
export const paperCardJourney: JourneySnapshot = {
  ...storyJourney,
  events: [
    {
      ...first,
      id: "lake",
      title: "西湖边的清晨",
      body: "沿着湖边慢慢走，等天色变亮。风有点凉，热茶刚刚好。",
      time: "08:30",
      location: { ...first.location!, name: "长桥", city: "杭州" },
      receipts: [{ ...storyReceipt, total: "28.00", date: "2026-10-18" }],
    },
    {
      ...first,
      id: "bus",
      title: "去灵隐寺的公交",
      category: "TRANSIT",
      body: "坐在窗边，看梧桐慢慢退后。",
      time: "10:20",
      location: null,
      photos: [],
      receipts: [
        {
          ...storyReceipt,
          id: "bus-receipt",
          assetId: "bus-ticket",
          total: "4.00",
          merchant: "公交车票",
          date: "2026-10-18",
        },
      ],
      planning: {
        startAt: "2026-10-18T10:20:00+08:00",
        endAt: "2026-10-18T11:00:00+08:00",
      },
      transit: {
        fromEventId: "lake",
        toEventId: "temple",
        transportMode: "BUS",
        routeState: "READY",
        route: {
          ...route,
          plans: [
            {
              ...route.plans[0],
              label: "7路 · 步行接驳",
              distanceMeters: 6500,
              durationSeconds: 2400,
              segments: [
                {
                  ...route.plans[0].segments[0],
                  mode: "BUS",
                  lineName: "7路",
                  fromName: "长桥",
                  toName: "灵隐寺",
                  durationSeconds: 2400,
                  distanceMeters: 6500,
                  positions: [
                    [120.149, 30.243],
                    [120.101, 30.244],
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      ...first,
      id: "temple",
      title: "山脚下歇一会儿",
      category: null,
      body: "进山前在路边坐了一会儿。",
      time: "11:10",
      photos: [],
      receipts: [],
      location: {
        name: "灵隐寺",
        address: null,
        city: "杭州",
        coordinates: { lng: 120.101, lat: 30.244, coordinateSystem: "GCJ02" },
      },
    },
    {
      ...first,
      id: "unlocated",
      title: "路上的随记",
      category: null,
      body: "没有时间和地点，也可以先把这段经历留下。",
      date: null,
      time: null,
      timeZone: null,
      location: null,
      photos: [],
      receipts: [],
    },
  ],
}
