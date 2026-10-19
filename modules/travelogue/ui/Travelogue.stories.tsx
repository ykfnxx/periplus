import { operationId } from "../data/operation-id"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useEffect, useState } from "react"
import type { RecordingJourneySummary } from "@/modules/data-model/contracts/recording"
import JourneyLibrary from "./JourneyLibrary"
import RecordComposer from "./RecordComposer"
import RecordingEditor from "./RecordingEditor"
import { createRecordingStore } from "../state/recording-store"
import { createStoryRecordingApi, storyJourney } from "./recording-story-data"
import lake from "./story-assets/lake.jpg"
import walk from "./story-assets/walk.jpg"
import tea from "./story-assets/tea.jpg"

const meta = {
  title: "Travelogue/Recording",
  parameters: { layout: "fullscreen" },
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
  onBack = () => {},
}: {
  empty?: boolean
  onBack?: () => void
}) {
  const [store] = useState(() =>
    createRecordingStore("hangzhou", createStoryRecordingApi(empty))
  )
  useEffect(() => {
    void store.getState().load()
    return () => store.getState().dispose()
  }, [store])
  return <RecordingEditor store={store} onBack={onBack} />
}
export const Library: Story = { render: () => <LibraryStory /> }
export const EmptyLibrary: Story = { render: () => <LibraryStory empty /> }
export const Editor: Story = { render: () => <EditorStory /> }
export const EmptyEditor: Story = { render: () => <EditorStory empty /> }
export const AddRecord: Story = {
  render: () => (
    <div className="mx-auto max-w-3xl p-5 md:py-16">
      <RecordComposer
        onCancel={() => {}}
        onSave={async () => {
          throw new Error("模拟保存失败：输入和照片保留，可以重试。")
        }}
      />
    </div>
  ),
}
