import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  JourneyMutation,
  JourneySnapshot,
} from "@/modules/data-model/contracts"
import {
  recordingApi,
  RecordingApiError,
} from "@/modules/travelogue/adapters/recording-http"
import {
  draftStorage,
  type LocalDraft,
} from "@/modules/travelogue/adapters/draft-indexeddb"
import { publishDraft } from "@/modules/travelogue/application/publish-draft"
import { eventContent } from "@/modules/travelogue/model/event-draft"
import { transitJourneyFixture } from "@/tests/fixtures/journey"

let saved: LocalDraft | undefined
let journey: JourneySnapshot
const storage = {
  ...draftStorage,
  get: vi.fn(async () => structuredClone(saved)),
  put: vi.fn(async (draft: LocalDraft) => {
    saved = structuredClone(draft)
    return draft.id
  }),
  remove: vi.fn(async () => {
    saved = undefined
    return undefined
  }),
}
const api = {
  ...recordingApi,
  account: vi.fn(async () => ({ userId: "writer" })),
  get: vi.fn(async () => structuredClone(journey)),
  command: vi.fn(async (_: string, request: JourneyMutation) => {
    if (request.command.name === "event.add") {
      journey.events.push({
        ...journey.events[0],
        id: "saved-event",
        photos: [],
      })
    }
    return {
      journey: structuredClone(journey),
      eventId: "saved-event",
      replayed: false,
    }
  }),
  upload: vi.fn(
    async (_file: File, _uploadId: string) =>
      ({ id: "asset-1" }) as Awaited<ReturnType<typeof recordingApi.upload>>
  ),
}

beforeEach(() => {
  vi.clearAllMocks()
  journey = transitJourneyFixture()
  saved = {
    id: "local-draft",
    userId: "writer",
    journey: { id: journey.id, title: journey.title },
    content: {
      ...eventContent(),
      title: "Local memory",
      body: "A saved draft",
    },
    photos: [],
    updatedAt: "2026-11-02T12:00:00Z",
  }
})

describe("durable draft submission", () => {
  it("appends to the latest chain and persists the exact request before sending", async () => {
    const last = journey.events.at(-1)!.id
    api.command.mockImplementationOnce(async (_, request) => {
      expect(saved!.pending).toEqual(request)
      return { journey, eventId: "saved-event", replayed: false }
    })
    const result = await publishDraft("local-draft", "writer", api, storage)
    expect(result.eventId).toBe("saved-event")
    expect(api.command.mock.calls[0][1]).toMatchObject({
      expectedRevision: journey.revision,
      command: {
        name: "event.add",
        afterEventId: last,
        content: { title: "Local memory" },
      },
    })
    expect(saved).toBeUndefined()
  })

  it("replays a lost create response with the original key and revision after reopening", async () => {
    api.command.mockRejectedValueOnce(new TypeError("Network disconnected"))
    await expect(
      publishDraft("local-draft", "writer", api, storage)
    ).rejects.toThrow("Network disconnected")
    const original = structuredClone(saved!.pending)
    journey.revision += 3
    await publishDraft("local-draft", "writer", api, storage)
    expect(api.command.mock.calls[1][1]).toEqual(original)
    expect(api.command).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it("keeps a revision conflict for explicit confirmation against the latest journey", async () => {
    api.command.mockRejectedValueOnce(
      new RecordingApiError("Changed", 409, "REVISION_CONFLICT")
    )
    await expect(
      publishDraft("local-draft", "writer", api, storage)
    ).rejects.toThrow("再次确认")
    const original = api.command.mock.calls[0][1]
    expect(saved!.pending).toBeUndefined()
    expect(saved!.content.title).toBe("Local memory")
    journey.revision += 1
    await publishDraft("local-draft", "writer", api, storage)
    expect(api.command.mock.calls[1][1].expectedRevision).toBe(journey.revision)
    expect(api.command.mock.calls[1][1].idempotencyKey).not.toBe(
      original.idempotencyKey
    )
  })

  it("checks the account before uploading or mutating", async () => {
    api.account.mockResolvedValueOnce({ userId: "another-user" })
    await expect(
      publishDraft("local-draft", "writer", api, storage)
    ).rejects.toThrow("保存这份草稿的账号")
    expect(api.command).not.toHaveBeenCalled()
    expect(api.upload).not.toHaveBeenCalled()
    expect(saved).toBeDefined()
  })

  it("retains an unconfirmed request when access is denied", async () => {
    api.command.mockRejectedValueOnce(new TypeError("Disconnected"))
    await expect(
      publishDraft("local-draft", "writer", api, storage)
    ).rejects.toThrow()
    const pending = structuredClone(saved!.pending)
    api.command.mockRejectedValueOnce(
      new RecordingApiError("Forbidden", 403, "FORBIDDEN")
    )
    await expect(
      publishDraft("local-draft", "writer", api, storage)
    ).rejects.toThrow("Forbidden")
    expect(saved!.pending).toEqual(pending)
  })

  it("resumes photos with stable upload IDs and preserves other attachments", async () => {
    saved!.eventId = journey.events[0].id
    journey.events[0].photos = [
      {
        assetId: "other-photo",
        caption: "Keep this",
        isCover: true,
      } as JourneySnapshot["events"][number]["photos"][number],
    ]
    saved!.photos = [
      {
        id: "upload-1",
        file: new File(["one"], "one.png"),
        assetId: "asset-one",
      },
      { id: "upload-2", file: new File(["two"], "two.png") },
    ]
    api.upload.mockRejectedValueOnce(new TypeError("Offline"))
    await expect(
      publishDraft("local-draft", "writer", api, storage)
    ).rejects.toThrow("Offline")
    expect(saved!.eventId).toBe(journey.events[0].id)
    await publishDraft("local-draft", "writer", api, storage)
    expect(api.upload.mock.calls.map((call) => call[1])).toEqual([
      "upload-2",
      "upload-2",
    ])
    expect(api.command.mock.calls[0][1].command).toMatchObject({
      name: "photos.set",
      photos: [
        { assetId: "other-photo", caption: "Keep this" },
        { assetId: "asset-one", caption: "" },
        { assetId: "asset-1", caption: "" },
      ],
      coverAssetId: "other-photo",
    })
    expect(saved).toBeUndefined()
  })

  it("replays a lost attachment response before clearing local files", async () => {
    saved!.eventId = journey.events[0].id
    saved!.photos = [
      {
        id: "upload-1",
        file: new File(["one"], "one.png"),
        assetId: "asset-one",
      },
    ]
    api.command.mockRejectedValueOnce(new TypeError("Disconnected"))
    await expect(
      publishDraft("local-draft", "writer", api, storage)
    ).rejects.toThrow()
    const original = structuredClone(saved!.pending)
    expect(saved!.photos).toHaveLength(1)
    await publishDraft("local-draft", "writer", api, storage)
    expect(api.command.mock.calls[1][1]).toEqual(original)
    expect(api.upload).not.toHaveBeenCalled()
    expect(saved).toBeUndefined()
  })

  it("finishes the confirmed event after a rejected photo is replaced, retaining uploaded assets", async () => {
    saved!.eventId = journey.events[0].id
    saved!.photos = [
      {
        id: "uploaded",
        file: new File(["good"], "good.png"),
        assetId: "asset-good",
      },
      { id: "rejected", file: new File(["large"], "large.png") },
    ]
    api.upload.mockRejectedValueOnce(
      new RecordingApiError("File exceeds limit", 400, "INVALID_INPUT")
    )
    await expect(
      publishDraft("local-draft", "writer", api, storage)
    ).rejects.toThrow("File exceeds limit")
    saved!.photos = [
      saved!.photos[0],
      { id: "replacement", file: new File(["small"], "small.png") },
    ]
    await publishDraft("local-draft", "writer", api, storage)
    expect(api.upload.mock.calls.map((call) => call[1])).toEqual([
      "rejected",
      "replacement",
    ])
    expect(api.command).toHaveBeenCalledTimes(1)
    expect(api.command.mock.calls[0][1].command).toMatchObject({
      name: "photos.set",
      eventId: journey.events[0].id,
      photos: [
        { assetId: "asset-good", caption: "" },
        { assetId: "asset-1", caption: "" },
      ],
    })
  })

  it("clears an acknowledged completion without issuing another mutation", async () => {
    saved!.eventId = "saved-event"
    saved!.complete = true
    await publishDraft("local-draft", "writer", api, storage)
    expect(api.command).not.toHaveBeenCalled()
    expect(saved).toBeUndefined()
  })
})
