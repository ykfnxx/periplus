import type { JourneySnapshot } from "@/modules/data-model/contracts"
import { eventFixture, journeyFixture, transitJourneyFixture } from "./journey"

const transit = transitJourneyFixture().events[1]
const plan = transit.transit!.route!.plans[0]

export const eventCardJourney: JourneySnapshot = {
  ...journeyFixture(),
  events: [
    {
      ...eventFixture("lake"),
      location: {
        name: "长桥",
        city: "杭州",
        address: null,
        coordinates: null,
      },
    },
    {
      ...transit,
      id: "bus",
      date: "2026-10-18",
      time: "10:20",
      timeZone: "Asia/Shanghai",
      startAt: "2026-10-18T10:20:00+08:00",
      endAt: "2026-10-18T11:00:00+08:00",
      planning: undefined,
      transit: {
        fromName: "长桥",
        toName: "灵隐寺",
        fromEventId: "lake",
        toEventId: "temple",
        transportMode: "BUS",
        distanceMeters: 6500,
        routeState: "READY",
        route: {
          requestFingerprint: plan.requestFingerprint,
          plans: [
            {
              ...plan,
              distanceMeters: 6500,
              durationSeconds: 2400,
              segments: [
                {
                  ...plan.segments[0],
                  mode: "BUS",
                  lineName: "7路",
                  distanceMeters: 6500,
                  durationSeconds: 2400,
                },
              ],
            },
          ],
        },
      },
    },
    eventFixture("temple"),
    { ...eventFixture("unlocated"), body: "旅途中写下的随记" },
  ],
}
