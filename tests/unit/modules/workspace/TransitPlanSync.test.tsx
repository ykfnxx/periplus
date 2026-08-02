import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { transitPlanFingerprint } from "@/lib/journeys/planning"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import TransitPlanSync from "@/modules/workspace/ui/TransitPlanSync"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"

function workspaceDocument(revision = 7) {
  const document = workspaceDocumentForStory(
    createSilkRoadJourney({ id: "journey", ownerId: "owner" })
  )
  document.session.id = "workspace"
  document.session.headWorkspaceRevision = revision
  return document
}

function firstTransitFingerprint() {
  return transitPlanFingerprint({
    transitEventId: "transit-xian-lanzhou",
    origin: {
      name: "西安",
      lat: 34.3416,
      lng: 108.9398,
      coordinateSystem: "GCJ02",
    },
    destination: {
      name: "兰州",
      lat: 36.0611,
      lng: 103.8343,
      coordinateSystem: "GCJ02",
    },
    mode: "DRIVE",
    transportMode: "CAR",
    preference: "RECOMMENDED",
    alternatives: 3,
  })
}

function keepFirstTransit(document: ReturnType<typeof workspaceDocument>) {
  document.session.headGraph.events = document.session.headGraph.events.filter(
    (event) =>
      event.id === "section-xian" ||
      event.id === "transit-xian-lanzhou" ||
      event.id === "section-lanzhou"
  )
  document.session.headGraph.links = document.session.headGraph.links.filter(
    (link) =>
      link.fromEventId === "section-xian" ||
      link.toEventId === "section-lanzhou"
  )
  return document
}

function addReadyTransitPlans(
  document: ReturnType<typeof workspaceDocument>,
  eventId: string
) {
  const event = document.session.headGraph.events.find(
    (candidate) => candidate.id === eventId
  )
  if (event?.type !== "TRANSIT") {
    throw new Error(`Transit fixture ${eventId} is missing`)
  }
  const runId = `run-${eventId}`
  const currentPlanId = `plan-current-${eventId}`
  const nextPlanId = `plan-next-${eventId}`
  event.detail.activePlanningRunId = runId
  event.detail.selectedPlanId = currentPlanId
  event.detail.routeState = "READY"
  document.session.headGraph.transitPlanningRuns.push({
    id: runId,
    transitEventId: event.id,
    requestFingerprint: `fingerprint-${eventId}`,
    provider: "mock",
    status: "READY",
    calculatedAt: "2026-08-01T00:00:00.000Z",
    plans: [
      {
        id: currentPlanId,
        planningRunId: runId,
        transitEventId: event.id,
        provider: "mock",
        rank: 0,
        label: "当前",
        strategy: "recommended",
        distanceMeters: 1_000,
        durationSeconds: 600,
        trafficBasis: "TYPICAL",
        calculatedAt: "2026-08-01T00:00:00.000Z",
        segments: [],
      },
      {
        id: nextPlanId,
        planningRunId: runId,
        transitEventId: event.id,
        provider: "mock",
        rank: 1,
        label: "备选",
        strategy: "fastest",
        distanceMeters: 900,
        durationSeconds: 500,
        trafficBasis: "TYPICAL",
        calculatedAt: "2026-08-01T00:00:00.000Z",
        segments: [],
      },
    ],
  })
  return { event, currentPlanId, nextPlanId }
}

describe("browser transit Workspace commands", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("plans through the authoritative command with revision and idempotency", () => {
    const sender = vi.fn()
    act(() => {
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(keepFirstTransit(workspaceDocument()))
      useWorkspaceStore.getState().setAgentSender(sender)
    })
    render(<TransitPlanSync />)

    act(() => vi.advanceTimersByTime(750))

    const fingerprint = firstTransitFingerprint()
    const commandId = `browser-plan:workspace:transit-xian-lanzhou:${fingerprint}:7`
    expect(sender).toHaveBeenCalledWith("workspace.command", {
      commandId,
      expectedRevision: 7,
      idempotencyKey: commandId,
      command: {
        name: "journey.plan_transit",
        payload: {
          eventId: "transit-xian-lanzhou",
          forceRefresh: false,
        },
      },
    })
  })

  it("retries correlated wire failures with bounded backoff", () => {
    const sender = vi.fn()
    act(() => {
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(keepFirstTransit(workspaceDocument()))
      useWorkspaceStore.getState().setAgentSender(sender)
    })
    render(<TransitPlanSync />)

    act(() => vi.advanceTimersByTime(750))
    expect(sender).toHaveBeenCalledTimes(1)
    const commandId = sender.mock.calls[0]![1].commandId as string

    act(() =>
      useWorkspaceStore.getState().setFailedTransitPlanCommandId(commandId)
    )
    act(() => vi.advanceTimersByTime(1_500))
    expect(sender).toHaveBeenCalledTimes(2)

    act(() =>
      useWorkspaceStore.getState().setFailedTransitPlanCommandId(commandId)
    )
    act(() => vi.advanceTimersByTime(3_000))
    expect(sender).toHaveBeenCalledTimes(3)

    act(() =>
      useWorkspaceStore.getState().setFailedTransitPlanCommandId(commandId)
    )
    act(() => vi.advanceTimersByTime(10_000))
    expect(sender).toHaveBeenCalledTimes(3)
  })

  it("does not replan a completed fingerprint", () => {
    const sender = vi.fn()
    const document = keepFirstTransit(workspaceDocument())
    document.session.headGraph.transitPlanningRuns.push({
      id: "failed-run",
      transitEventId: "transit-xian-lanzhou",
      requestFingerprint: firstTransitFingerprint(),
      provider: "amap",
      status: "FAILED",
      errorCode: "NO_ROUTE",
      calculatedAt: "2026-08-01T00:00:00.000Z",
      plans: [],
    })
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
      useWorkspaceStore.getState().setAgentSender(sender)
    })
    render(<TransitPlanSync />)

    act(() => vi.advanceTimersByTime(750))
    expect(sender).not.toHaveBeenCalled()
  })

  it("selects a plan through the same authoritative command", () => {
    const sender = vi.fn()
    const document = workspaceDocument(8)
    const { event, nextPlanId } = addReadyTransitPlans(
      document,
      "transit-xian-lanzhou"
    )
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
      useWorkspaceStore.getState().setAgentSender(sender)
      useWorkspaceStore.getState().selectTransitPlan(event.id, nextPlanId)
    })

    const commandId =
      "browser-select:workspace:transit-xian-lanzhou:plan-next-transit-xian-lanzhou:8"
    expect(sender).toHaveBeenCalledWith("workspace.command", {
      commandId,
      expectedRevision: 8,
      idempotencyKey: commandId,
      command: {
        name: "journey.select_transit_plan",
        payload: {
          eventId: "transit-xian-lanzhou",
          planId: nextPlanId,
        },
      },
    })
    expect(useWorkspaceStore.getState().pendingTransitPlanSelection).toEqual({
      commandId,
      eventId: event.id,
      planId: nextPlanId,
      expectedRevision: 8,
    })
  })

  it("blocks rapid same- and cross-segment clicks until authoritative success", () => {
    const sender = vi.fn()
    const document = workspaceDocument(8)
    const first = addReadyTransitPlans(document, "transit-xian-lanzhou")
    const second = addReadyTransitPlans(document, "transit-lanzhou-zhangye")
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
      useWorkspaceStore.getState().setAgentSender(sender)
      useWorkspaceStore
        .getState()
        .selectTransitPlan(first.event.id, first.nextPlanId)
      useWorkspaceStore
        .getState()
        .selectTransitPlan(first.event.id, first.nextPlanId)
      useWorkspaceStore
        .getState()
        .selectTransitPlan(second.event.id, second.nextPlanId)
    })

    expect(sender).toHaveBeenCalledTimes(1)
    expect(
      useWorkspaceStore.getState().pendingTransitPlanSelection?.eventId
    ).toBe(first.event.id)

    const authoritative = structuredClone(document)
    authoritative.session.headWorkspaceRevision = 9
    const authoritativeEvent = authoritative.session.headGraph.events.find(
      (event) => event.id === first.event.id
    )
    if (authoritativeEvent?.type !== "TRANSIT") {
      throw new Error("authoritative Transit is missing")
    }
    authoritativeEvent.detail.selectedPlanId = first.nextPlanId
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(authoritative)
    })

    expect(useWorkspaceStore.getState().pendingTransitPlanSelection).toBeNull()
    expect(useWorkspaceStore.getState().transitPlanSelectionError).toBeNull()
  })

  it("keeps a correlated selection error visible across unrelated documents and clears it on retry", () => {
    const sender = vi.fn()
    const document = workspaceDocument(8)
    const { event, nextPlanId } = addReadyTransitPlans(
      document,
      "transit-xian-lanzhou"
    )
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
      useWorkspaceStore.getState().setAgentSender(sender)
      useWorkspaceStore.getState().selectTransitPlan(event.id, nextPlanId)
    })
    const pending = useWorkspaceStore.getState().pendingTransitPlanSelection
    if (!pending) throw new Error("selection command was not recorded")

    act(() => {
      useWorkspaceStore
        .getState()
        .failTransitPlanSelection(pending.commandId, "revision conflict")
    })
    expect(
      useWorkspaceStore.getState().transitPlanSelectionError
    ).toMatchObject({
      commandId: pending.commandId,
      eventId: event.id,
      planId: nextPlanId,
      message: "revision conflict",
    })

    const unrelated = structuredClone(document)
    unrelated.session.headWorkspaceRevision = 9
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(unrelated)
    })
    expect(
      useWorkspaceStore.getState().transitPlanSelectionError?.message
    ).toBe("revision conflict")

    act(() => {
      useWorkspaceStore.getState().selectTransitPlan(event.id, nextPlanId)
    })
    expect(sender).toHaveBeenCalledTimes(2)
    expect(useWorkspaceStore.getState().transitPlanSelectionError).toBeNull()
    expect(
      useWorkspaceStore.getState().pendingTransitPlanSelection?.expectedRevision
    ).toBe(9)
  })
})
