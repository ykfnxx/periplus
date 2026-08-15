import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useState } from "react"
import { fn } from "storybook/test"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import { silkRoadJourney } from "@/lib/mock-journeys"
import type {
  TargetJourneyEvent,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"
import { TransitEventCard } from "./RouteTimeline"

const transitItem = getJourneyScopeProjection(
  silkRoadJourney,
  "section",
  "section-xian"
).items.find((item) => item.event.id === "transit-xian-1")

if (transitItem?.event.type !== "TRANSIT") {
  throw new Error("transit event fixture is missing")
}

const transitResolved = transitItem.resolved

const planningRunId = "storybook-transit-xian-1-run"
const planSeeds = [
  ["recommended", "推荐 · 地铁", "RECOMMENDED", 35, 8600, 4],
  ["fewer-transfers", "少换乘 · 公交", "FEWER_TRANSFERS", 42, 9100, 2],
  ["low-cost", "低价 · 公交", "LOW_COST", 46, 9400, 2],
] as const
const planningRun: TargetTransitPlanningRun = {
  id: planningRunId,
  transitEventId: transitItem.event.id,
  requestFingerprint: "storybook-transit-xian-1",
  provider: "storybook",
  status: "READY",
  calculatedAt: "2026-10-01T02:50:00.000Z",
  plans: planSeeds.map(
    (
      [id, label, strategy, durationMinutes, distanceMeters, fareAmount],
      rank
    ) => ({
      id: `storybook-${id}`,
      planningRunId,
      transitEventId: transitItem.event.id,
      provider: "storybook",
      rank,
      label,
      strategy,
      durationSeconds: durationMinutes * 60,
      distanceMeters,
      fareAmount,
      trafficBasis: "PREDICTED",
      calculatedAt: "2026-10-01T02:50:00.000Z",
      segments: [
        {
          id: `storybook-${id}-segment`,
          order: 0,
          mode: id === "recommended" ? "SUBWAY" : "BUS",
          coordinateSystem: "GCJ02",
          geometryKind: "ROAD_NETWORK",
          positions: [
            [108.9531, 34.2655],
            [108.9642, 34.2183],
          ],
        },
      ],
    })
  ),
}
const defaultPlanId = planningRun.plans[0]!.id
const transitEvent = {
  ...transitItem.event,
  detail: {
    ...transitItem.event.detail,
    transportMode: "SUBWAY",
    requestMode: "TRANSIT",
    plannedDurationMinutes: 35,
    plannedDistanceKm: 8.6,
    routeState: "READY",
    activePlanningRunId: planningRun.id,
    selectedPlanId: defaultPlanId,
  },
} satisfies Extract<TargetJourneyEvent, { type: "TRANSIT" }>

function InteractiveTransitEventCard() {
  const [selected, setSelected] = useState(true)

  return (
    <TransitEventCard
      event={transitEvent}
      selected={selected}
      onSelect={() => setSelected((current) => !current)}
      planningRuns={[planningRun]}
      resolved={transitResolved}
      fromTitle="西安城墙"
      toTitle="大雁塔"
    />
  )
}

const meta = {
  title: "Workbench/EventCards/TransitEventCard",
  component: TransitEventCard,
  decorators: [
    (Story) => (
      <div className="w-[380px] rounded-2xl bg-cream p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    event: transitEvent,
    selected: true,
    onSelect: fn(),
    planningRuns: [planningRun],
    resolved: transitResolved,
    fromTitle: "西安城墙",
    toTitle: "大雁塔",
  },
} satisfies Meta<typeof TransitEventCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <InteractiveTransitEventCard />,
}
