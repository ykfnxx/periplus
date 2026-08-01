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
    const event = document.session.headGraph.events.find(
      (candidate) => candidate.id === "transit-xian-lanzhou"
    )
    expect(event?.type).toBe("TRANSIT")
    if (event?.type !== "TRANSIT") return
    event.detail.activePlanningRunId = "run-1"
    event.detail.selectedPlanId = "plan-current"
    event.detail.routeState = "READY"
    document.session.headGraph.transitPlanningRuns.push({
      id: "run-1",
      transitEventId: event.id,
      requestFingerprint: "fingerprint",
      provider: "mock",
      status: "READY",
      calculatedAt: "2026-08-01T00:00:00.000Z",
      plans: [
        {
          id: "plan-current",
          planningRunId: "run-1",
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
          id: "plan-next",
          planningRunId: "run-1",
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
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
      useWorkspaceStore.getState().setAgentSender(sender)
      useWorkspaceStore.getState().selectTransitPlan(event.id, "plan-next")
    })

    const commandId =
      "browser-select:workspace:transit-xian-lanzhou:plan-next:8"
    expect(sender).toHaveBeenCalledWith("workspace.command", {
      commandId,
      expectedRevision: 8,
      idempotencyKey: commandId,
      command: {
        name: "journey.select_transit_plan",
        payload: {
          eventId: "transit-xian-lanzhou",
          planId: "plan-next",
        },
      },
    })
  })
})
