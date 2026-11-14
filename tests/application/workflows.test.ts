import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  JourneySnapshot,
  SharePreview,
  ShareStatus,
} from "@/modules/data-model/contracts"
import {
  RecordingApiError,
  type RecordingApi,
  type DraftStorage,
} from "@/modules/travelogue/ports"
import { createRecordingStore } from "@/modules/travelogue/application/recording-session"
import { createDraftSession } from "@/modules/travelogue/application/draft-session"
import { createLocalDraft } from "@/modules/travelogue/application/draft-library"
import { createReceiptImport } from "@/modules/travelogue/application/receipt-import"
import { createSharingSession } from "@/modules/travelogue/application/sharing"
import { createLibrarySession } from "@/modules/travelogue/application/library"
import { createPhotoActions } from "@/modules/travelogue/application/photos"
import { authenticate } from "@/modules/auth/application/authenticate"
import { createInvitationActions } from "@/modules/travelogue/application/invitation"

afterEach(() => vi.restoreAllMocks())

const journey: JourneySnapshot = {
  id: "journey",
  ownerId: "owner",
  role: "OWNER",
  revision: 1,
  title: "杭州",
  description: "",
  status: "ACTIVE",
  visibility: "PRIVATE",
  events: [],
  createdAt: "2026-11-14T00:00:00Z",
  updatedAt: "2026-11-14T00:00:00Z",
}
const apiWith = (methods: Partial<RecordingApi>) =>
  ({
    weather: vi
      .fn()
      .mockResolvedValue({ journeyId: "journey", revision: 1, events: [] }),
    ...methods,
  }) as RecordingApi
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("business workflows without React or DOM", () => {
  it("runs with no browser globals", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")
  })
  it("keeps the latest journey load when an older request completes later", async () => {
    const first = deferred<JourneySnapshot>()
    const get = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ...journey, revision: 2 })
    const store = createRecordingStore(journey.id, apiWith({ get }))
    const pending = store.getState().load()
    await store.getState().load()
    first.resolve(journey)
    await pending
    expect(store.getState().journey?.revision).toBe(2)
  })
  it("does not attach an upload after the journey instance is disposed", async () => {
    const upload = deferred<{ id: string }>()
    const command = vi.fn()
    const store = createRecordingStore(
      journey.id,
      apiWith({
        get: vi.fn().mockResolvedValue(journey),
        upload: vi.fn().mockReturnValue(upload.promise),
        command,
      })
    )
    await store.getState().load()
    store.getState().addFiles("event", [new File(["image"], "test.jpg")])
    await Promise.resolve()
    store.getState().dispose()
    upload.resolve({ id: "asset" })
    await new Promise((done) => setTimeout(done, 0))
    expect(command).not.toHaveBeenCalled()
  })
  it("blocks closing a failed local draft, then saves a later complete edit in order", async () => {
    const draft = createLocalDraft("owner", journey)
    const put = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined)
    const session = createDraftSession(
      draft,
      { put } as unknown as DraftStorage,
      apiWith({})
    )
    session.update({ ...draft, content: { ...draft.content, body: "第一版" } })
    expect(await session.beforeClose()).toBe(false)
    expect(session.getState().error).toContain("disk full")
    session.update({ ...draft, content: { ...draft.content, body: "第二版" } })
    expect(await session.beforeClose()).toBe(true)
    expect(put.mock.calls.map(([value]) => value.content.body)).toEqual([
      "第一版",
      "第二版",
    ])
    expect(session.getState().status).toBe("已存本机")
  })
  it("retains an uploaded receipt after OCR failure and replays a failed save with the same key", async () => {
    const upload = vi.fn().mockResolvedValue("asset")
    const recognize = vi.fn().mockRejectedValue(new Error("OCR unavailable"))
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValue("event")
    const session = createReceiptImport({ upload, recognize, save })
    session.choose(new File(["receipt"], "receipt.jpg"))
    await session.recognize()
    expect(session.getState().review?.assetId).toBe("asset")
    await session.recognize()
    expect(upload).toHaveBeenCalledOnce()
    session.edit({
      merchant: "已核对",
      date: "",
      total: "12.00",
      currency: "CNY",
      items: [],
    })
    expect(await session.submit(null)).toBeUndefined()
    expect(await session.submit(null)).toBe("event")
    expect(save.mock.calls[0][2]).toBe(save.mock.calls[1][2])
    expect(save.mock.calls[1][0].values.merchant).toBe("已核对")
  })
  it("publishes, replays and revokes without secure-context randomUUID", async () => {
    const status: ShareStatus = {
      version: 0,
      sourceRevision: 0,
      currentRevision: 1,
      includeCosts: false,
      url: null,
      publishedAt: null,
      revokedAt: null,
      lastMutationId: null,
    }
    const preview: SharePreview = {
      revision: 1,
      includeCosts: false,
      document: {
        title: "杭州",
        description: "",
        authors: [],
        cities: [],
        events: [],
      },
      photoUrls: {},
    }
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("randomUUID unavailable on LAN HTTP")
    })
    const revokeShare = vi.fn().mockResolvedValue(status)
    const publishShare = vi
      .fn()
      .mockRejectedValue(new TypeError("response lost"))
    const shareStatus = vi.fn()
    const session = createSharingSession(
      journey.id,
      status,
      preview,
      apiWith({ publishShare, shareStatus, revokeShare })
    )
    await session.publish()
    const input = publishShare.mock.calls[0][1]
    expect(session.getState().pending?.input).toEqual(input)
    shareStatus.mockResolvedValue({
      ...status,
      version: 1,
      url: "https://example.test/share",
      lastMutationId: input.idempotencyKey,
    })
    await session.confirmPending()
    expect(publishShare).toHaveBeenCalledOnce()
    expect(session.getState().pending).toBeNull()
    expect(session.getState().notice).toContain("确认分享发布成功")
    await session.stop()
    expect(revokeShare).toHaveBeenCalledOnce()
    expect(revokeShare.mock.calls[0][1].idempotencyKey).not.toBe(
      input.idempotencyKey
    )
  })
  it("reuses a pending journey creation before correcting the latest title", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValue({ journey })
    const command = vi
      .fn()
      .mockResolvedValue({ journey: { ...journey, title: "新标题" } })
    const session = createLibrarySession(apiWith({ create, command }))
    await expect(session.create("杭州")).rejects.toThrow("response lost")
    expect(await session.create("新标题")).toBe(journey.id)
    expect(create.mock.calls[0][0]).toEqual(create.mock.calls[1][0])
    expect(command.mock.calls[0][1].command).toEqual({
      name: "journey.update",
      patch: { title: "新标题" },
    })
  })
  it("computes photo order from the queue's current snapshot", async () => {
    const photos = ["a", "b", "c"].map((assetId) => ({
      assetId,
      caption: assetId,
      isCover: assetId === "a",
      url: "",
      location: null,
      canEdit: true,
      source: { userId: "owner", name: "Owner", image: null },
    }))
    const value = {
      ...journey,
      events: [
        {
          id: "event",
          title: "",
          body: "",
          category: "VISIT" as const,
          date: "2026-11-14",
          time: null,
          timeZone: null,
          location: null,
          photos,
          receipts: [],
          canEdit: true,
          canRemove: true,
          source: { userId: "owner", name: "Owner", image: null },
          createdAt: journey.createdAt,
          updatedAt: journey.updatedAt,
        },
      ],
    }
    const command = vi.fn().mockResolvedValue({ journey: value })
    const store = createRecordingStore(
      journey.id,
      apiWith({ get: vi.fn().mockResolvedValue(value), command })
    )
    await store.getState().load()
    await createPhotoActions(store, "event").reorder(2, 0)
    expect(command.mock.calls[0][1].command).toEqual({
      name: "photos.set",
      eventId: "event",
      photos: [
        { assetId: "c", caption: "c" },
        { assetId: "a", caption: "a" },
        { assetId: "b", caption: "b" },
      ],
      coverAssetId: "c",
    })
  })
  it("preserves provider-managed login navigation and exposes invitation reauthentication", async () => {
    const login = vi
      .fn()
      .mockResolvedValue({ error: null, data: { redirect: true } })
    expect(
      await authenticate(
        { login, register: vi.fn(), signOut: vi.fn() },
        { mode: "login", email: "a@example.test", password: "secret" }
      )
    ).toEqual({ redirecting: true })
    const invitation = createInvitationActions("token", {
      invitation: vi.fn(),
      acceptInvitation: vi
        .fn()
        .mockRejectedValue(new RecordingApiError("expired", 401)),
    })
    expect(await invitation.accept()).toEqual({ kind: "login" })
  })
})
