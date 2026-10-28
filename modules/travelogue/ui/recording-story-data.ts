import { operationId } from "../data/operation-id"
import type {
  RecordingJourney,
  RecordingEvent,
} from "@/modules/data-model/contracts/recording"
import type {
  Contributor,
  RecordingReceipt,
} from "@/modules/data-model/contracts/receipts"
import type { JourneyInvitation } from "@/modules/data-model/contracts/collaboration"
import type { RecordingApi } from "../data/client"
import { RecordingApiError } from "../data/client"
import lake from "./story-assets/lake.jpg"
import walk from "./story-assets/walk.jpg"
import tea from "./story-assets/tea.jpg"

const receiptImage = new URL("./story-assets/receipt.svg", import.meta.url).href
export const storyOwner: Contributor = {
  userId: "owner",
  name: "小林",
  image: null,
}
export const storyFriend: Contributor = {
  userId: "friend",
  name: "阿宁",
  image: null,
}
export const storyReceipt: RecordingReceipt = {
  id: "receipt-tea",
  assetId: "receipt-image",
  url: receiptImage,
  merchant: "西湖茶馆",
  date: "2026-10-28",
  total: "92.00",
  currency: "CNY",
  items: [{ name: "茶饮", quantity: "2", amount: "92.00" }],
  source: storyOwner,
  canEdit: true,
}
const now = "2026-10-19T12:00:00Z"
const eventBase: RecordingEvent = {
  id: "lake",
  source: storyOwner,
  canEdit: true,
  canRemove: true,
  receipts: [],
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
      source: storyOwner,
      canEdit: true,
      url: lake.src,
      caption: "风慢慢停下来，湖面变成了温柔的金色。",
      isCover: true,
      location: null,
    },
    {
      assetId: "walk-photo",
      source: storyFriend,
      canEdit: true,
      url: walk.src,
      caption: "",
      location: null,
      isCover: false,
    },
    {
      assetId: "tea-photo",
      source: storyOwner,
      canEdit: true,
      url: tea.src,
      caption: "",
      location: null,
      isCover: false,
    },
  ],
  createdAt: now,
  updatedAt: now,
}
export const storyJourney: RecordingJourney = {
  id: "hangzhou",
  role: "OWNER",
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
      photos: [
        {
          assetId: "tea-2",
          source: storyOwner,
          canEdit: true,
          url: tea.src,
          caption: "",
          location: null,
          isCover: false,
        },
      ],
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
  initialJourney = storyJourney,
  failures: {
    upload?: boolean
    extraction?: boolean | "always"
    save?: boolean
    conflict?: boolean
  } = {}
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
  const viewer = initialJourney.role === "MEMBER" ? storyFriend : storyOwner
  let uploadFailed = false,
    extractionFailed = false,
    saveFailed = false,
    conflictFailed = false
  let invitations: JourneyInvitation[] = []
  return {
    get: async () => structuredClone(journey),
    atlas: async () => ({ journeys: [], photos: [] }),
    list: async () => [],
    create: async () => ({
      journey: structuredClone(journey),
      replayed: false,
    }),
    members: async () => ({
      members: [
        { user: storyOwner, role: "OWNER", joinedAt: now },
        { user: storyFriend, role: "MEMBER", joinedAt: now },
      ],
    }),
    invitations: async () => ({ invitations: structuredClone(invitations) }),
    invite: async () => {
      const invitation = {
        id: operationId(),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        revokedAt: null,
      }
      invitations.push(invitation)
      return {
        invitation: structuredClone(invitation),
        url: `https://example.test/join/${invitation.id}`,
      }
    },
    revokeInvitation: async (_journeyId, id) => {
      invitations = invitations.map((item) =>
        item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item
      )
      return {}
    },
    invitation: async () => ({
      journeyId: journey.id,
      journeyTitle: journey.title,
      owner: storyOwner,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    }),
    acceptInvitation: async () => ({ journeyId: journey.id }),
    extractReceipt: async (assetId) => {
      if (
        failures.extraction &&
        (!extractionFailed || failures.extraction === "always")
      ) {
        extractionFailed = true
        throw new RecordingApiError("识别暂时失败，请重试。", 503)
      }
      const { merchant, date, total, currency, items } = storyReceipt
      return {
        assetId,
        fields: { merchant, date, total, currency, items },
        lines: [{ text: "西湖茶馆 合计 92.00", confidence: 0.97 }],
      }
    },
    upload: async (file, uploadId) => {
      if (failures.upload && !uploadFailed) {
        uploadFailed = true
        throw new RecordingApiError("图片上传失败，请重试。", 503)
      }
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
      if (
        (command.name === "event.update" ||
          command.name === "receipt.update" ||
          command.name === "receipt.add" ||
          (command.name === "event.add" && command.receipt)) &&
        failures.conflict &&
        !conflictFailed
      ) {
        conflictFailed = true
        if (command.name === "receipt.update") {
          const receipt = journey.events
            .find((event) => event.id === command.eventId)!
            .receipts!.find((item) => item.id === command.receiptId)!
          // 模拟同行者先完成核对：后端替换修订关联，原图身份不变。
          receipt.id = operationId()
          receipt.total = "95.00"
        } else if (command.name === "event.update") {
          journey.events.find((event) => event.id === command.eventId)!.body =
            "同行者先保存了这段记录。"
        }
        journey.revision += 1
        throw new RecordingApiError(
          "记录已有同行者的修改。",
          409,
          "REVISION_CONFLICT"
        )
      }
      if (
        (command.name === "receipt.add" ||
          (command.name === "event.add" && command.receipt)) &&
        failures.save &&
        !saveFailed
      ) {
        saveFailed = true
        throw new RecordingApiError("保存失败，核对内容保留，请重试。", 503)
      }
      let eventId: string | undefined
      if (command.name === "journey.update")
        Object.assign(journey, command.patch)
      else if (command.name === "event.add") {
        eventId = operationId()
        const entry: RecordingEvent = {
          id: eventId,
          source: viewer,
          canEdit: true,
          canRemove: true,
          receipts: command.receipt
            ? [
                {
                  ...command.receipt,
                  id: operationId(),
                  url: assets.get(command.receipt.assetId) || receiptImage,
                  source: viewer,
                  canEdit: true,
                },
              ]
            : [],
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
          ...existing.find((item) => item.assetId === photo.assetId),
          ...photo,
          source:
            existing.find((item) => item.assetId === photo.assetId)?.source ||
            viewer,
          canEdit:
            existing.find((item) => item.assetId === photo.assetId)?.canEdit ??
            true,
          location:
            event.photos.find((item) => item.assetId === photo.assetId)
              ?.location ?? null,
          url:
            existing.find((item) => item.assetId === photo.assetId)?.url ||
            assets.get(photo.assetId)!,
          isCover: photo.assetId === command.coverAssetId,
        }))
      } else if (command.name === "receipt.add") {
        const event = journey.events.find(
          (event) => event.id === command.eventId
        )!
        eventId = event.id
        event.receipts = [
          ...(event.receipts || []),
          {
            ...command.receipt,
            id: operationId(),
            url: assets.get(command.receipt.assetId) || receiptImage,
            source: viewer,
            canEdit: true,
          },
        ]
      } else if (command.name === "receipt.update") {
        const receipt = journey.events
          .find((event) => event.id === command.eventId)!
          .receipts!.find((receipt) => receipt.id === command.receiptId)!
        // receipt.update 会退役旧关联并创建新 ID，不能用关联 ID 保持详情身份。
        Object.assign(receipt, command.fields, { id: operationId() })
      } else if (command.name === "receipt.remove") {
        const event = journey.events.find(
          (event) => event.id === command.eventId
        )!
        event.receipts = event.receipts?.filter(
          (receipt) => receipt.id !== command.receiptId
        )
      } else if (command.name === "photo.update") {
        Object.assign(
          journey.events
            .find((entry) => entry.id === command.eventId)!
            .photos.find((photo) => photo.assetId === command.assetId)!,
          command.patch
        )
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

export const sharedJourney: RecordingJourney = {
  ...storyJourney,
  role: "MEMBER",
  events: storyJourney.events.map((event, index) => ({
    ...event,
    source: index === 1 ? storyFriend : storyOwner,
    canEdit: index === 1,
    canRemove: index === 1,
    receipts: index === 0 ? [{ ...storyReceipt, canEdit: false }] : [],
    photos: event.photos.map((photo, photoIndex) => ({
      ...photo,
      source: photoIndex === 1 ? storyFriend : storyOwner,
      canEdit: photoIndex === 1,
    })),
  })),
}
