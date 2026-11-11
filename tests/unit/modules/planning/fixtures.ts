import type {
  PlanningEventSummary,
  PlanningPreview,
  PlanningProposalView,
} from "@/modules/planning/contracts"
export const plannedEvent: PlanningEventSummary = {
  id: "lunch",
  title: "湖滨午餐",
  body: "保留这段记录",
  category: "MEAL",
  date: "2026-11-15",
  time: "11:30",
  timeZone: "Asia/Shanghai",
  startAt: "2026-11-15T03:30:00.000Z",
  location: null,
  canEdit: true,
  canRemove: true,
  photoCount: 2,
  receiptCount: 1,
  hasBooking: false,
  protected: false,
}
export const preview: PlanningPreview = {
  version: 2,
  baseRevision: 12,
  events: [plannedEvent],
  delta: [],
  committableDiff: [
    {
      eventId: "lunch",
      kind: "updated",
      before: {
        ...plannedEvent,
        time: "12:00",
        startAt: "2026-11-15T04:00:00.000Z",
      },
      after: plannedEvent,
      changedFields: ["time", "startAt"],
      impacts: {
        photos: 2,
        receipts: 1,
        hotelCleared: true,
        providerBindingCleared: true,
        routeInvalidated: true,
        linkedTransitIds: ["transit"],
      },
    },
  ],
  constraints: [],
  unverified: ["出租车耗时尚未核实"],
  blockers: [],
  canApply: true,
}
export function proposal(
  overrides: Partial<PlanningProposalView> = {}
): PlanningProposalView {
  return {
    proposalId: "proposal",
    journeyId: "journey",
    status: "OPEN",
    latestVersion: 2,
    baseRevision: 12,
    currentJourneyRevision: 12,
    run: {
      runId: "run",
      parentVersion: 1,
      targetRevision: 12,
      mode: "adjust",
      status: "SUCCEEDED",
      deadline: "2026-11-15T00:00:00.000Z",
      error: null,
      progress: null,
    },
    question: null,
    preview,
    receipt: null,
    livePlaces: [],
    ...overrides,
  }
}
