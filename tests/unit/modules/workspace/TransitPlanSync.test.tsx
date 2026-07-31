import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { transitPlanFingerprint } from "@/lib/journeys/planning"
import TransitPlanSync from "@/modules/workspace/ui/TransitPlanSync"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { DraftJourney } from "@/types/journey"

function draftJourney(): DraftJourney {
  return {
    id: "journey",
    title: "Browser planning",
    status: "DRAFT",
    events: [
      {
        id: "from",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "A",
        detail: { plannedLat: 30, plannedLng: 120 },
      },
      {
        id: "transit",
        type: "TRANSIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "前往 B",
        detail: {
          plannedFromEventId: "from",
          plannedToEventId: "to",
          transportMode: "CAR",
          requestMode: "DRIVE",
        },
      },
      {
        id: "to",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "B",
        detail: { plannedLat: 31, plannedLng: 121 },
      },
    ],
    links: [
      { id: "link-1", fromEventId: "from", toEventId: "transit", kind: "MAIN" },
      { id: "link-2", fromEventId: "transit", toEventId: "to", kind: "MAIN" },
    ],
  }
}

describe("browser transit commands", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("plans through the authoritative draft command with revision and idempotency", () => {
    const sender = vi.fn()
    const journey = draftJourney()
    act(() => {
      useWorkspaceStore.getState().applyDraftSnapshot(journey, 7)
      useWorkspaceStore.getState().setAgentSender(sender)
    })
    render(<TransitPlanSync />)

    act(() => vi.advanceTimersByTime(750))

    const transit = journey.events[1]
    expect(transit?.type).toBe("TRANSIT")
    if (transit?.type !== "TRANSIT") return
    const fingerprint = transitPlanFingerprint({
      transitEventId: "transit",
      origin: { name: "A", lat: 30, lng: 120 },
      destination: { name: "B", lat: 31, lng: 121 },
      mode: "DRIVE",
      transportMode: "CAR",
      preference: "RECOMMENDED",
      alternatives: 3,
    })
    expect(sender).toHaveBeenCalledWith("draft.command", {
      commandId: `browser-plan:journey:transit:${fingerprint}:7`,
      tool: "journey.plan_transit",
      input: {
        eventId: "transit",
        expectedRevision: 7,
        idempotencyKey: `browser-plan:journey:transit:${fingerprint}:7`,
      },
    })
  })

  it("retries correlated command failures with bounded backoff", () => {
    const sender = vi.fn()
    act(() => {
      useWorkspaceStore.getState().applyDraftSnapshot(draftJourney(), 7)
      useWorkspaceStore.getState().setAgentSender(sender)
    })
    render(<TransitPlanSync />)

    act(() => vi.advanceTimersByTime(750))
    expect(sender).toHaveBeenCalledTimes(1)
    const commandId = sender.mock.calls[0]![1].commandId as string

    act(() =>
      useWorkspaceStore.getState().setFailedTransitPlanCommandId(commandId)
    )
    act(() => vi.advanceTimersByTime(1_499))
    expect(sender).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(1))
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

  it("selects a plan through the same authoritative draft command", () => {
    const sender = vi.fn()
    const journey = draftJourney()
    const transit = journey.events[1]
    expect(transit?.type).toBe("TRANSIT")
    if (transit?.type !== "TRANSIT") return
    transit.detail.plans = [
      {
        id: "transit-plan-1",
        provider: "mock",
        rank: 0,
        label: "推荐",
        strategy: "recommended",
        distanceMeters: 1_000,
        durationSeconds: 600,
        trafficBasis: "TYPICAL",
        calculatedAt: "2026-08-01T00:00:00.000Z",
        requestFingerprint: "fingerprint",
        segments: [],
      },
    ]
    act(() => {
      useWorkspaceStore.getState().applyDraftSnapshot(journey, 8)
      useWorkspaceStore.getState().setAgentSender(sender)
      useWorkspaceStore
        .getState()
        .selectTransitPlan("transit", "transit-plan-1")
    })

    expect(sender).toHaveBeenCalledWith("draft.command", {
      tool: "journey.select_transit_plan",
      input: {
        eventId: "transit",
        planId: "transit-plan-1",
        expectedRevision: 8,
        idempotencyKey: "browser-select:journey:transit:transit-plan-1:8",
      },
    })
  })
})
