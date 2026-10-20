import { operationId } from "../data/operation-id"
import type {
  RecordingJourney,
  RecordingEvent,
} from "@/modules/data-model/contracts/recording"
import type { RecordingApi } from "../data/client"
import { RecordingApiError } from "../data/client"
import lake from "./story-assets/lake.jpg"
import walk from "./story-assets/walk.jpg"
import tea from "./story-assets/tea.jpg"

const now = "2026-10-19T12:00:00Z"
const eventBase: RecordingEvent = {
  id: "lake",
  title: "西湖边的傍晚",
  body: "沿着湖边慢慢走，风有点凉。坐在长椅上等天色变暗，今天不赶路。",
  category: "VISIT",
  date: "2026-10-18",
  time: "17:20",
  timeZone: "Asia/Shanghai",
  location: {
    name: "西湖 · 杭州",
    address: null,
    coordinates: { lat: 30.243, lng: 120.149, coordinateSystem: "GCJ02" },
  },
  photos: [
    {
      assetId: "lake-photo",
      url: lake.src,
      caption: "风慢慢停下来，湖面变成了温柔的金色。",
      isCover: true,
    },
    { assetId: "walk-photo", url: walk.src, caption: "", isCover: false },
    { assetId: "tea-photo", url: tea.src, caption: "", isCover: false },
  ],
  createdAt: now,
  updatedAt: now,
}
export const storyJourney: RecordingJourney = {
  id: "hangzhou",
  revision: 1,
  title: "杭州慢游",
  description: "湖边散步，巷子里喝茶，留一点时间给自己。",
  status: "ACTIVE",
  visibility: "PRIVATE",
  createdAt: now,
  updatedAt: now,
  events: [
    eventBase,
    {
      ...eventBase,
      id: "walk",
      title: "沿湖步行",
      body: "沿着湖边走进小巷。",
      category: "TRANSIT",
      time: "18:10",
      location: null,
      photos: [],
    },
    {
      ...eventBase,
      id: "tea",
      title: "等雨停的一杯茶",
      body: "在小巷里坐了一会儿，把今天的照片整理好。",
      category: null,
      time: null,
      location: null,
      photos: [{ assetId: "tea-2", url: tea.src, caption: "", isCover: false }],
    },
    {
      ...eventBase,
      id: "morning",
      title: "清晨的小巷",
      date: "2026-10-19",
      time: "08:30",
      body: "在街角吃过早饭，再慢慢往前走。",
      photos: [],
      location: null,
    },
    {
      ...eventBase,
      id: "undated",
      title: "回程随手记",
      body: "还想再来一次。",
      date: null,
      time: null,
      photos: [],
      location: null,
    },
  ],
}

// 仅用于 Storybook 交互演示，产品页面始终使用真实 HTTP client。
export function createStoryRecordingApi(
  empty = false,
  uploadDelay = 0,
  initialJourney = storyJourney
): RecordingApi {
  let journey = structuredClone({
    ...initialJourney,
    events: empty ? [] : initialJourney.events,
  })
  const responses = new Map<
    string,
    { journey: RecordingJourney; eventId?: string; replayed: boolean }
  >()
  const assets = new Map<string, string>()
  return {
    get: async () => structuredClone(journey),
    list: async () => [],
    create: async () => ({
      journey: structuredClone(journey),
      replayed: false,
    }),
    upload: async (file, uploadId) => {
      if (uploadDelay)
        await new Promise((resolve) => setTimeout(resolve, uploadDelay))
      if (!assets.has(uploadId)) assets.set(uploadId, URL.createObjectURL(file))
      return {
        id: uploadId,
        url: assets.get(uploadId)!,
        ownerId: "demo",
        ownerName: "作者",
        lat: 0,
        lng: 0,
        caption: "",
        createdAt: now,
        updatedAt: now,
        canDelete: true,
      }
    },
    command: async (_id, mutation) => {
      const replay = responses.get(mutation.idempotencyKey)
      if (replay) return { ...structuredClone(replay), replayed: true }
      if (mutation.expectedRevision !== journey.revision)
        throw new RecordingApiError("记录已更新", 409, "REVISION_CONFLICT")
      const command = mutation.command
      let eventId: string | undefined
      if (command.name === "journey.update")
        Object.assign(journey, command.patch)
      else if (command.name === "event.add") {
        eventId = operationId()
        const entry: RecordingEvent = {
          id: eventId,
          title: "",
          body: "",
          category: null,
          date: null,
          time: null,
          timeZone: null,
          location: null,
          photos: [],
          createdAt: now,
          updatedAt: now,
          ...command.content,
        }
        journey.events.splice(
          command.afterEventId === null
            ? 0
            : journey.events.findIndex(
                (event) => event.id === command.afterEventId
              ) + 1,
          0,
          entry
        )
      } else if (command.name === "event.update")
        Object.assign(
          journey.events.find((event) => event.id === command.eventId)!,
          command.patch
        )
      else if (command.name === "event.remove")
        journey.events = journey.events.filter(
          (event) => event.id !== command.eventId
        )
      else if (command.name === "event.move") {
        const event = journey.events.find(
          (event) => event.id === command.eventId
        )!
        journey.events = journey.events.filter((entry) => entry.id !== event.id)
        journey.events.splice(
          command.afterEventId === null
            ? 0
            : journey.events.findIndex(
                (entry) => entry.id === command.afterEventId
              ) + 1,
          0,
          event
        )
      } else if (command.name === "photos.set") {
        const event = journey.events.find(
          (event) => event.id === command.eventId
        )!
        const existing = journey.events.flatMap((event) => event.photos)
        event.photos = command.photos.map((photo) => ({
          ...photo,
          url:
            existing.find((item) => item.assetId === photo.assetId)?.url ||
            assets.get(photo.assetId)!,
          isCover: photo.assetId === command.coverAssetId,
        }))
      } else if (command.name === "photo.move") {
        const from = journey.events.find(
          (event) => event.id === command.fromEventId
        )!
        const to = journey.events.find(
          (event) => event.id === command.toEventId
        )!
        const photo = from.photos.find(
          (photo) => photo.assetId === command.assetId
        )!
        from.photos = from.photos.filter(
          (photo) => photo.assetId !== command.assetId
        )
        to.photos.splice(
          command.afterAssetId === null
            ? 0
            : to.photos.findIndex(
                (photo) => photo.assetId === command.afterAssetId
              ) + 1,
          0,
          { ...photo, isCover: false }
        )
      }
      journey = {
        ...journey,
        revision: journey.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      const result = {
        journey: structuredClone(journey),
        eventId,
        replayed: false,
      }
      responses.set(mutation.idempotencyKey, result)
      return structuredClone(result)
    },
  }
}
