import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { fn } from "storybook/test"
import { silkRoadJourney } from "@/lib/mock-journeys"
import { LocationEventCard, type LocationJourneyEvent } from "./RouteTimeline"

function locationEvent(id: string) {
  const event = silkRoadJourney.events.find(
    (candidate): candidate is LocationJourneyEvent =>
      candidate.id === id &&
      (candidate.type === "VISIT" ||
        candidate.type === "MEAL" ||
        candidate.type === "ACTIVITY" ||
        candidate.type === "STAY")
  )
  if (!event) throw new Error(`location event fixture ${id} is missing`)
  return event
}

const visitWithoutImage = locationEvent("visit-xian-city-wall")
if (visitWithoutImage.type !== "VISIT") {
  throw new Error("visit fixture has the wrong event type")
}
const visitWithImage: typeof visitWithoutImage = {
  ...visitWithoutImage,
  detail: {
    ...visitWithoutImage.detail,
    providerCoverImage: {
      provider: "amap",
      url: "https://store.is.autonavi.com/showpic/eca1263c402a58830000002802690972?type=pic",
      fetchedAt: "2026-08-08T12:37:19.145Z",
    },
  },
}

const stayWithoutImage = locationEvent("stay-xian-bell-tower")
if (stayWithoutImage.type !== "STAY") {
  throw new Error("stay fixture has the wrong event type")
}
const stayWithImage: typeof stayWithoutImage = {
  ...stayWithoutImage,
  detail: {
    ...stayWithoutImage.detail,
    hotelOffer: {
      provider: "rollinggo",
      providerHotelId: "storybook-xian-bell-tower",
      coverImageUrl:
        "https://store.is.autonavi.com/showpic/f02a0462ca6ef9249431224c67f63551",
      fetchedAt: "2026-08-08T12:37:19.145Z",
    },
  },
}

const imageAvailabilityCases: Array<{
  label: string
  event: LocationJourneyEvent
}> = [
  { label: "VISIT · 有事件图片", event: visitWithImage },
  { label: "VISIT · 无事件图片", event: visitWithoutImage },
  { label: "STAY · 有事件图片", event: stayWithImage },
  { label: "STAY · 无事件图片", event: stayWithoutImage },
]

const meta = {
  title: "Workbench/EventCards/LocationEventCard",
  component: LocationEventCard,
  decorators: [
    (Story) => (
      <div className="w-fit min-w-[380px] rounded-2xl bg-cream p-4">
        <Story />
      </div>
    ),
  ],
  args: { selected: false, onSelect: fn() },
} satisfies Meta<typeof LocationEventCard>

export default meta
type Story = StoryObj<typeof meta>

export const VisitWithImage: Story = {
  args: {
    event: visitWithImage,
  },
}

export const VisitWithoutImage: Story = {
  args: { event: visitWithoutImage },
}

export const Meal: Story = {
  args: { event: locationEvent("meal-xian-yongxingfang") },
}

export const Activity: Story = {
  args: { event: locationEvent("activity-xian-tang-night") },
}

export const StayWithImage: Story = {
  args: {
    event: stayWithImage,
  },
}

export const StayWithoutImage: Story = {
  args: { event: stayWithoutImage },
}

export const ImageAvailability: Story = {
  args: { event: visitWithImage },
  render: () => (
    <div className="grid w-[780px] grid-cols-2 gap-4">
      {imageAvailabilityCases.map(({ label, event }) => (
        <div key={label} className="min-w-0">
          <p className="mb-2 text-xs font-black text-walnut">{label}</p>
          <LocationEventCard event={event} onSelect={() => undefined} />
        </div>
      ))}
    </div>
  ),
}
