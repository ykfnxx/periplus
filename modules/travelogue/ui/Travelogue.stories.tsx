import { operationId } from "../data/operation-id"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useEffect, useState } from "react"
import type {
  RecordingJourney,
  RecordingJourneySummary,
} from "@/modules/data-model/contracts/recording"
import LandingGate from "@/modules/auth/ui/LandingGate"
import JourneyLibrary from "./JourneyLibrary"
import RecordingEditor from "./RecordingEditor"
import { createRecordingStore } from "../state/recording-store"
import {
  createStoryRecordingApi,
  storyJourney,
  storyReceipt,
  sharedJourney,
} from "./recording-story-data"
import lake from "./story-assets/lake.jpg"
import walk from "./story-assets/walk.jpg"
import tea from "./story-assets/tea.jpg"

const meta = {
  title: "Travelogue/Recording",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
const base: RecordingJourneySummary = {
  ...storyJourney,
  coverUrl: lake.src,
  eventCount: 4,
  photoCount: 4,
  startDate: "2026-10-18",
  endDate: "2026-10-20",
}
const library = [
  base,
  {
    ...base,
    id: "weekend",
    title: "湖边的周末",
    description: "沿着湖岸走，等一场日落。",
    coverUrl: walk.src,
    startDate: "2026-09-21",
    endDate: "2026-09-22",
  },
  {
    ...base,
    id: "tea",
    title: "旧城散步",
    description: "小路和街角的一杯茶。",
    coverUrl: tea.src,
    startDate: "2026-08-12",
    endDate: "2026-08-14",
  },
]

function LibraryStory({ empty = false }: { empty?: boolean }) {
  const [items, setItems] = useState(empty ? [] : library)
  const [opened, setOpened] = useState<string | null>(null)
  return opened ? (
    <EditorStory onBack={() => setOpened(null)} />
  ) : (
    <JourneyLibrary
      journeys={items}
      photos={
        empty
          ? []
          : storyJourney.events.flatMap((event) =>
              event.photos.map((photo) => ({
                ...photo,
                location: photo.location ?? event.location,
                journeyId: storyJourney.id,
                journeyTitle: storyJourney.title,
                eventId: event.id,
                eventTitle: event.title || "一段经历",
              }))
            )
      }
      loading={false}
      error={null}
      onRetry={() => {}}
      onOpen={setOpened}
      onCreate={async (title) => {
        const id = operationId()
        setItems([
          {
            ...base,
            id,
            title,
            description: "",
            coverUrl: null,
            startDate: null,
            endDate: null,
            eventCount: 0,
            photoCount: 0,
          },
          ...items,
        ])
        setOpened(id)
      }}
      onRename={async (id, title) =>
        setItems(
          items.map((item) => (item.id === id ? { ...item, title } : item))
        )
      }
    />
  )
}
function EditorStory({
  empty = false,
  slowUpload = false,
  canEdit = true,
  longContent = false,
  onBack = () => {},
  initialJourney = storyJourney,
  failures,
}: {
  empty?: boolean
  slowUpload?: boolean
  canEdit?: boolean
  longContent?: boolean
  onBack?: () => void
  initialJourney?: RecordingJourney
  failures?: {
    upload?: boolean
    extraction?: boolean | "always"
    save?: boolean
    conflict?: boolean
  }
}) {
  const [store] = useState(() =>
    createRecordingStore(
      "hangzhou",
      createStoryRecordingApi(
        empty,
        slowUpload ? 2500 : 0,
        longContent
          ? {
              ...storyJourney,
              events: storyJourney.events.slice(0, 3).map((event, index) =>
                index
                  ? event
                  : {
                      ...event,
                      body: Array.from(
                        { length: 20 },
                        (_, i) =>
                          `${i + 1}. 沿湖走进小巷，记下路上的光与风。照片和文字都留在这段经历里。`
                      ).join("\n\n"),
                      photos: Array.from({ length: 8 }, (_, i) => ({
                        ...event.photos[i % event.photos.length],
                        assetId: `many-${i}`,
                      })),
                    }
              ),
            }
          : !canEdit
            ? {
                ...initialJourney,
                role: undefined,
                events: initialJourney.events.map((event) => ({
                  ...event,
                  canEdit: false,
                  canRemove: false,
                  photos: event.photos.map((photo) => ({
                    ...photo,
                    canEdit: false,
                  })),
                  receipts: event.receipts?.map((receipt) => ({
                    ...receipt,
                    canEdit: false,
                  })),
                })),
              }
            : initialJourney,
        failures
      )
    )
  )
  useEffect(() => {
    void store.getState().load()
    return () => store.getState().dispose()
  }, [store])
  return (
    <RecordingEditor
      store={store}
      onBack={onBack}
      journeys={library}
      onOpenJourney={() => {}}
    />
  )
}
export const Library: Story = { render: () => <LibraryStory /> }
export const EmptyLibrary: Story = { render: () => <LibraryStory empty /> }
export const Editor: Story = { render: () => <EditorStory /> }
export const EmptyEditor: Story = { render: () => <EditorStory empty /> }
export const SlowUpload: Story = { render: () => <EditorStory slowUpload /> }

export const Entry: Story = { render: () => <LandingGate /> }

export const ReadOnly: Story = { render: () => <EditorStory canEdit={false} /> }

export const LongContent: Story = { render: () => <EditorStory longContent /> }

const photoMapJourney: RecordingJourney = {
  ...storyJourney,
  events: [
    {
      ...storyJourney.events[0],
      location: {
        name: "断桥",
        address: null,
        coordinates: { lat: 30.264, lng: 120.151, coordinateSystem: "GCJ02" },
      },
      photos: [
        {
          ...storyJourney.events[0].photos[0],
          caption:
            "太阳落下时，湖面像铺了一层金色。沿着湖岸慢慢走，等风吹过柳梢，拍下了这个傍晚。远处的船缓缓经过，岸边有人停下来听歌，我们也没有急着回去。",
        },
        ...Array.from({ length: 3 }, (_, index) => ({
          ...storyJourney.events[0].photos[0],
          assetId: `sunset-${index}`,
          isCover: false,
        })),
        ...Array.from({ length: 8 }, (_, index) => ({
          ...storyJourney.events[0].photos[2],
          assetId: `tea-map-${index}`,
          location: {
            name: "湖滨茶舍",
            address: null,
            coordinates: {
              lat: 30.243,
              lng: 120.149,
              coordinateSystem: "GCJ02" as const,
            },
          },
        })),
        {
          ...storyJourney.events[0].photos[1],
          location: {
            name: "柳浪闻莺",
            address: null,
            coordinates: {
              lat: 30.236,
              lng: 120.154,
              coordinateSystem: "GCJ02",
            },
          },
        },
        {
          ...storyJourney.events[0].photos[2],
          assetId: "nearby-tea",
          location: {
            name: "湖边小路",
            address: null,
            coordinates: {
              lat: 30.243,
              lng: 120.1502,
              coordinateSystem: "GCJ02",
            },
          },
        },
        {
          ...storyJourney.events[0].photos[0],
          assetId: "north-lake",
          isCover: false,
          location: {
            name: "北山街",
            address: null,
            coordinates: {
              lat: 30.267,
              lng: 120.137,
              coordinateSystem: "GCJ02",
            },
          },
        },
      ],
    },
    ...storyJourney.events.slice(1),
  ],
}
export const MapPhotos: Story = {
  render: () => <EditorStory initialJourney={photoMapJourney} />,
}

export const Receipts: Story = {
  render: () => (
    <EditorStory
      initialJourney={{
        ...storyJourney,
        events: [
          { ...storyJourney.events[0], receipts: [storyReceipt] },
          ...storyJourney.events.slice(1),
        ],
      }}
    />
  ),
}
export const ReceiptFailures: Story = {
  render: () => (
    <EditorStory failures={{ upload: true, extraction: true, save: true }} />
  ),
}
export const SharedJournal: Story = {
  render: () => <EditorStory initialJourney={sharedJourney} />,
}

export const ReceiptConflict: Story = {
  render: () => <EditorStory failures={{ conflict: true }} />,
}

export const ReceiptOcrUnavailable: Story = {
  render: () => <EditorStory failures={{ extraction: "always" }} />,
}

export const EventConflict: Story = {
  render: () => <EditorStory failures={{ conflict: true }} />,
}

export const ReceiptEditConflict: Story = {
  render: () => (
    <EditorStory
      failures={{ conflict: true }}
      initialJourney={{
        ...storyJourney,
        events: [
          { ...storyJourney.events[0], receipts: [storyReceipt] },
          ...storyJourney.events.slice(1),
        ],
      }}
    />
  ),
}
