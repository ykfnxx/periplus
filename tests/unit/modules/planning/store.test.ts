import { describe, expect, it, vi } from "vitest"
import { createPlanningStore } from "@/modules/planning/client/store"
import {
  PlanningRequestError,
  type PlanningApi,
} from "@/modules/planning/client/api"
import { proposal, preview } from "./fixtures"

function setup(initial = proposal(), initialId: string | null = "proposal") {
  const api = {
    create: vi.fn<PlanningApi["create"]>(async () => ({
      proposalId: "proposal",
      runId: "run",
      parentVersion: 0,
    })),
    get: vi.fn<PlanningApi["get"]>(async () => initial),
    turn: vi.fn<PlanningApi["turn"]>(async () => ({ runId: "next-run" })),
    cancel: vi.fn<PlanningApi["cancel"]>(async () => ({})),
    discard: vi.fn<PlanningApi["discard"]>(async () => ({})),
    apply: vi.fn<PlanningApi["apply"]>(async () => ({
      proposalId: "proposal",
      version: 2,
      journeyId: "journey",
      appliedRevision: 13,
      replayed: false,
    })),
  }
  return { api, store: createPlanningStore("journey", initialId, api) }
}

describe("planning client authority", () => {
  it("retries an uncertain creation with its original requestId and records input once", async () => {
    const { api, store } = setup(proposal(), null)
    api.create.mockRejectedValueOnce(new TypeError("lost response"))
    expect(await store.getState().send("11月15日去杭州")).toBe(false)
    const original = api.create.mock.calls[0]
    expect(store.getState().pending?.kind).toBe("create")
    expect(await store.getState().send("another message")).toBe(false)
    expect(await store.getState().retry()).toBe(true)
    expect(api.create.mock.calls[1]).toEqual(original)
    expect(store.getState().sent).toHaveLength(1)
    expect(api.apply).not.toHaveBeenCalled()
  })

  it("binds a choice to the current question run and parent version", async () => {
    const current = proposal({
      question: {
        runId: "question-run",
        message: "哪天出发？",
        choices: [{ choiceRef: "choice-1", label: "11月15日" }],
      },
    })
    const { api, store } = setup(current)
    await store.getState().load()
    await store.getState().send("11月15日", "choice-1")
    expect(api.turn).toHaveBeenCalledWith(
      "journey",
      "proposal",
      expect.objectContaining({
        parentVersion: 2,
        replyToRunId: "question-run",
        choiceRef: "choice-1",
        message: "11月15日",
      })
    )
    expect(api.apply).not.toHaveBeenCalled()
  })

  it("keeps a confirmed apply version pinned even if a newer preview arrives before retry", async () => {
    const { api, store } = setup()
    await store.getState().load()
    api.apply.mockRejectedValueOnce(new TypeError("lost response"))
    expect(await store.getState().apply(2)).toBe(false)
    api.get.mockResolvedValue(
      proposal({ latestVersion: 3, preview: { ...preview, version: 3 } })
    )
    await store.getState().load()
    api.apply.mockRejectedValueOnce(
      new PlanningRequestError("预览已更新", 409, "PROPOSAL_VERSION_CONFLICT")
    )
    expect(await store.getState().retry()).toBe(false)
    expect(api.apply.mock.calls).toEqual([
      ["journey", "proposal", 2],
      ["journey", "proposal", 2],
    ])
    expect(store.getState().proposal?.latestVersion).toBe(3)
    expect(store.getState().pending).toBeNull()
  })

  it("requires a new preview after revision conflict and never applies the rebase automatically", async () => {
    const { api, store } = setup()
    await store.getState().load()
    api.apply.mockRejectedValueOnce(
      new PlanningRequestError("旅程已更新", 409, "REVISION_CONFLICT")
    )
    api.get.mockResolvedValue(proposal({ currentJourneyRevision: 13 }))
    await store.getState().apply(2)
    expect(store.getState().needsRebase).toBe(true)
    api.get.mockResolvedValue(
      proposal({
        latestVersion: 3,
        baseRevision: 13,
        currentJourneyRevision: 13,
        preview: { ...preview, version: 3, baseRevision: 13 },
      })
    )
    await store.getState().rebase()
    expect(api.turn).toHaveBeenCalledWith(
      "journey",
      "proposal",
      expect.objectContaining({ mode: "rebase", parentVersion: 2 })
    )
    expect(store.getState().needsRebase).toBe(false)
    expect(api.apply).toHaveBeenCalledTimes(1)
  })

  it("cancels the selected run while preserving the last published preview", async () => {
    const initial = proposal()
    initial.run!.status = "RUNNING"
    const { api, store } = setup(initial)
    await store.getState().load()
    const cancelled = proposal()
    cancelled.run!.status = "CANCELLED"
    api.get.mockResolvedValue(cancelled)
    await store.getState().cancel()
    expect(api.cancel).toHaveBeenCalledWith("journey", "proposal", "run")
    expect(store.getState().proposal?.preview).toEqual(preview)
    expect(api.apply).not.toHaveBeenCalled()
  })

  it("drops an older GET response after a newer recovery has completed", async () => {
    const { api, store } = setup()
    let resolve!: (value: ReturnType<typeof proposal>) => void
    api.get.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const first = store.getState().load()
    const current = proposal({
      latestVersion: 3,
      preview: { ...preview, version: 3 },
    })
    api.get.mockResolvedValueOnce(current)
    await store.getState().load()
    resolve(proposal())
    await first
    expect(store.getState().proposal?.latestVersion).toBe(3)
  })

  it("restores the original receipt rather than substituting the current journey revision", async () => {
    const receipt = {
      proposalId: "proposal",
      version: 2,
      journeyId: "journey",
      appliedRevision: 13,
      replayed: true,
    }
    const { store } = setup(
      proposal({ status: "APPLIED", currentJourneyRevision: 14, receipt })
    )
    await store.getState().load()
    expect(store.getState().receipt?.appliedRevision).toBe(13)
    expect(store.getState().proposal?.currentJourneyRevision).toBe(14)
  })

  it("retains a published preview when reading fails and exposes recovery state", async () => {
    const { api, store } = setup()
    await store.getState().load()
    api.get.mockRejectedValueOnce(new TypeError("offline"))
    await store.getState().load()
    expect(store.getState().readFailed).toBe(true)
    expect(store.getState().proposal?.preview).toEqual(preview)
    await store.getState().retry()
    expect(store.getState().readFailed).toBe(false)
  })
})

it("confirms a lost apply response through GET without applying a different version", async () => {
  const { api, store } = setup()
  await store.getState().load()
  api.apply.mockRejectedValueOnce(new TypeError("lost response"))
  await store.getState().apply(2)
  api.get.mockResolvedValue(
    proposal({
      status: "APPLIED",
      currentJourneyRevision: 14,
      receipt: {
        proposalId: "proposal",
        version: 2,
        journeyId: "journey",
        appliedRevision: 13,
        replayed: true,
      },
    })
  )
  await store.getState().load()
  expect(store.getState().pending).toBeNull()
  expect(store.getState().receipt?.appliedRevision).toBe(13)
  expect(api.apply).toHaveBeenCalledTimes(1)
})
