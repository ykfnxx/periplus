import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  recordingApi,
  RecordingApiError,
} from "@/modules/travelogue/adapters/recording-http"
import { loadDraftContext } from "@/modules/travelogue/application/draft-context"
import {
  draftStorage,
  type DraftContext,
} from "@/modules/travelogue/adapters/draft-indexeddb"
import DraftEntry from "@/modules/travelogue/react/DraftEntry"
import { prepareOfflineDrafts } from "@/modules/travelogue/adapters/offline"

vi.mock("@/modules/travelogue/adapters/offline", () => ({
  prepareOfflineDrafts: vi.fn(async () => false),
}))

const a: DraftContext = {
  userId: "A",
  journeys: [{ id: "journey-A", title: "A's journey" }],
}
const b: DraftContext = {
  userId: "B",
  journeys: [{ id: "journey-B", title: "B's journey" }],
}

function setup() {
  let active = "A"
  const contexts = new Map([
    ["A", structuredClone(a)],
    ["B", structuredClone(b)],
  ])
  const storage = {
    ...draftStorage,
    context: vi.fn(
      async (userId?: string) =>
        contexts.get(userId || active) || {
          userId: userId || active,
          journeys: [],
        }
    ),
    activate: vi.fn(async (userId: string) => {
      active = userId
      return "active-user"
    }),
    remember: vi.fn(async (context: DraftContext) => {
      contexts.set(context.userId, context)
      return context.userId
    }),
  }
  const api = {
    ...recordingApi,
    account: vi.fn(async () => ({ userId: "B" })),
    list: vi
      .fn<typeof recordingApi.list>()
      .mockRejectedValue(new TypeError("Directory interrupted")),
  }
  return { api, storage }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("draft account and directory recovery", () => {
  it("keeps the authenticated account and its own cached targets when directory loading fails", async () => {
    const { api, storage } = setup()
    const result = await loadDraftContext(api, storage)
    expect(result.context).toEqual(b)
    expect(result.error).toContain("Directory interrupted")
    expect(storage.activate).toHaveBeenCalledWith("B")
    expect(await storage.context()).toEqual(b)
    expect(storage.remember).not.toHaveBeenCalled()
  })

  it("uses an empty context for a new authenticated account instead of another account's drafts", async () => {
    const { api, storage } = setup()
    api.account.mockResolvedValue({ userId: "C" })
    expect((await loadDraftContext(api, storage)).context).toEqual({
      userId: "C",
      journeys: [],
    })
    expect(await storage.context()).toEqual({ userId: "C", journeys: [] })
    expect(await storage.context("A")).toEqual(a)
  })

  it("restores prepared targets for the same account after an HTTP directory failure", async () => {
    const { api, storage } = setup()
    api.account.mockResolvedValue({ userId: "A" })
    api.list.mockRejectedValue(new RecordingApiError("Unavailable", 503))
    expect((await loadDraftContext(api, storage)).context).toEqual(a)
    expect(storage.remember).not.toHaveBeenCalled()
  })

  it("loads the last prepared account when offline before identity can be refreshed", async () => {
    const { api, storage } = setup()
    api.account.mockRejectedValue(new TypeError("Offline"))
    expect((await loadDraftContext(api, storage)).context).toEqual(a)
    expect(api.list).not.toHaveBeenCalled()
  })

  it("persists a real empty directory returned successfully", async () => {
    const { api, storage } = setup()
    api.list.mockResolvedValue([])
    expect((await loadDraftContext(api, storage)).context).toEqual({
      userId: "B",
      journeys: [],
    })
    expect(storage.remember).toHaveBeenCalledWith({ userId: "B", journeys: [] })
  })
})

describe("draft entry preparation", () => {
  beforeEach(() => {
    vi.spyOn(draftStorage, "activate").mockResolvedValue("active-user")
    vi.spyOn(draftStorage, "list").mockResolvedValue([])
    vi.spyOn(draftStorage, "remember").mockResolvedValue("user:A")
  })

  it("does not persist a loading or failed directory placeholder over prepared targets", async () => {
    const { rerender } = render(<DraftEntry userId="A" />)
    await waitFor(() => expect(prepareOfflineDrafts).toHaveBeenCalled())
    expect(draftStorage.remember).not.toHaveBeenCalled()
    rerender(<DraftEntry userId="A" journeys={a.journeys} />)
    await waitFor(() => expect(draftStorage.remember).toHaveBeenCalledWith(a))
    rerender(<DraftEntry userId="A" />)
    expect(draftStorage.activate).toHaveBeenCalledTimes(1)
    expect(draftStorage.remember).toHaveBeenCalledTimes(1)
  })

  it("allows a successful empty directory to replace an obsolete prepared list", async () => {
    render(<DraftEntry userId="A" journeys={[]} />)
    await waitFor(() =>
      expect(draftStorage.remember).toHaveBeenCalledWith({
        userId: "A",
        journeys: [],
      })
    )
  })

  it("does not reactivate an old page's account when its delayed directory arrives", async () => {
    let active = ""
    vi.mocked(draftStorage.activate).mockImplementation(async (userId) => {
      active = userId
      return "active-user"
    })
    const oldPage = render(<DraftEntry userId="A" />)
    await waitFor(() => expect(active).toBe("A"))
    render(<DraftEntry userId="B" journeys={b.journeys} />)
    await waitFor(() => expect(active).toBe("B"))
    oldPage.rerender(<DraftEntry userId="A" journeys={a.journeys} />)
    await waitFor(() => expect(draftStorage.remember).toHaveBeenCalledWith(a))
    expect(active).toBe("B")
    expect(draftStorage.activate).toHaveBeenCalledTimes(2)
  })
})
