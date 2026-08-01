import type { TargetCommandEnvelope, TargetCommandResult } from "./commands"
import type { TargetContentBundle } from "./content"
import type {
  TargetJourneyEvent,
  TargetJourneyEventLink,
  TargetJourneyGraphSnapshot,
  TargetJourneyRevision,
  TargetResolvedJourneyProjection,
  TargetTransitPlanningRun,
} from "./journey"
import type {
  TargetWorkspaceDocument,
  TargetWorkspaceRevision,
} from "./workspace"

const NOW = "2026-08-01T00:00:00.000Z"
const SOON = "2026-08-01T01:00:00.000Z"
const LATER = "2026-08-02T00:00:00.000Z"
const OWNER_ID = "user-contract-owner"

function clone<T>(value: T): T {
  return structuredClone(value)
}

function eventIdentity(
  id: string,
  journeyId: string,
  parentSectionEventId: string | null = null
) {
  return {
    id,
    journeyId,
    parentSectionEventId,
    placementStatus: "SCHEDULED" as const,
    origin: "ORIGINAL" as const,
    introducedRevision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function cityEvent(
  id: string,
  journeyId: string,
  title: string,
  parentSectionEventId: string | null = null
): TargetJourneyEvent {
  return {
    ...eventIdentity(id, journeyId, parentSectionEventId),
    type: "SECTION",
    title,
    detail: { kind: "CITY", coordinateSystem: "GCJ02" },
  }
}

function dayEvent(
  id: string,
  journeyId: string,
  parentSectionEventId: string | null,
  title: string,
  localDate = "2026-08-01"
): TargetJourneyEvent {
  return {
    ...eventIdentity(id, journeyId, parentSectionEventId),
    type: "SECTION",
    title,
    detail: { kind: "DAY", localDate, timezone: "Asia/Shanghai" },
  }
}

function visitEvent(
  id: string,
  journeyId: string,
  title: string,
  parentSectionEventId: string | null = null,
  executionStatus:
    | "PLANNED"
    | "STARTED"
    | "CONFIRMED"
    | "SKIPPED"
    | "CANCELLED" = "PLANNED"
): TargetJourneyEvent {
  return {
    ...eventIdentity(id, journeyId, parentSectionEventId),
    type: "VISIT",
    executionStatus,
    title,
    plannedStartAt: NOW,
    plannedEndAt: LATER,
    detail: {
      plannedLat: 30.25,
      plannedLng: 120.15,
      coordinateSystem: "GCJ02",
      plannedDurationMinutes: 60,
    },
  }
}

function mealEvent(
  id: string,
  journeyId: string,
  title: string,
  parentSectionEventId: string | null = null
): TargetJourneyEvent {
  return {
    ...eventIdentity(id, journeyId, parentSectionEventId),
    type: "MEAL",
    executionStatus: "PLANNED",
    title,
    plannedStartAt: NOW,
    plannedEndAt: LATER,
    detail: {
      plannedLat: 30.25,
      plannedLng: 120.15,
      coordinateSystem: "GCJ02",
      plannedDurationMinutes: 60,
      cuisine: "杭帮菜",
    },
  }
}

function transitEvent(
  id: string,
  journeyId: string,
  fromEventId: string,
  toEventId: string,
  parentSectionEventId: string | null = null
): TargetJourneyEvent {
  return {
    ...eventIdentity(id, journeyId, parentSectionEventId),
    type: "TRANSIT",
    executionStatus: "PLANNED",
    title: "交通",
    detail: {
      plannedFromEventId: fromEventId,
      plannedToEventId: toEventId,
      transportMode: "CAR",
      requestMode: "DRIVE",
      preference: "RECOMMENDED",
      routeState: "EMPTY",
    },
  }
}

function link(
  id: string,
  journeyId: string,
  fromEventId: string,
  toEventId: string,
  rank: number,
  kind: "MAIN" | "ALTERNATIVE" = "MAIN",
  branchKey?: string
): TargetJourneyEventLink {
  return {
    id,
    journeyId,
    fromEventId,
    toEventId,
    kind,
    branchKey,
    rank,
    introducedRevision: 1,
  }
}

function graph(
  id: string,
  events: TargetJourneyEvent[],
  links: TargetJourneyEventLink[] = [],
  overrides: Partial<TargetJourneyGraphSnapshot> = {}
): TargetJourneyGraphSnapshot {
  return {
    id,
    ownerId: OWNER_ID,
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: id,
    events,
    links,
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
    ...overrides,
  }
}

function userCommand(
  aggregateId: string,
  expectedRevision: number,
  idempotencyKey: string,
  command: TargetCommandEnvelope["command"],
  userId = OWNER_ID
): TargetCommandEnvelope {
  return {
    aggregateId,
    expectedRevision,
    idempotencyKey,
    actor: { kind: "USER", userId },
    command,
  }
}

function journeyRevision(
  snapshot: TargetJourneyGraphSnapshot,
  operation: string,
  parentRevisionId?: string,
  workspaceRevisionId?: string
): TargetJourneyRevision {
  return {
    id: `${snapshot.id}-revision-${snapshot.revision}`,
    journeyId: snapshot.id,
    revision: snapshot.revision,
    operation,
    snapshot: clone(snapshot),
    patch: { operation },
    inversePatch: { operation: `undo:${operation}` },
    actor: { kind: "USER", userId: OWNER_ID },
    idempotencyKey: `${snapshot.id}-${operation}-${snapshot.revision}`,
    parentRevisionId,
    workspaceRevisionId,
    createdAt: snapshot.revision === 1 ? NOW : LATER,
  }
}

function readyRun(transitEventId: string): TargetTransitPlanningRun {
  const plans = [
    ["plan-recommended", "推荐", "RECOMMENDED", 0],
    ["plan-fastest", "最快", "FASTEST", 1],
    ["plan-low-cost", "低价", "LOW_COST", 2],
  ] as const
  return {
    id: "run-ready",
    transitEventId,
    requestFingerprint: "fixture-ready-fingerprint",
    provider: "mock",
    status: "READY",
    calculatedAt: NOW,
    plans: plans.map(([id, label, strategy, rank]) => ({
      id,
      planningRunId: "run-ready",
      transitEventId,
      provider: "mock",
      rank,
      label,
      strategy,
      distanceMeters: 12000,
      durationSeconds: 1800 + rank * 300,
      fareAmount: rank === 2 ? 8 : 20,
      trafficBasis: "PREDICTED",
      calculatedAt: NOW,
      segments: [
        {
          id: `${id}-segment`,
          order: 0,
          mode: "DRIVE",
          coordinateSystem: "GCJ02",
          geometryKind: "ROAD_NETWORK",
          positions: [
            [120.15, 30.25],
            [120.25, 30.35],
          ],
        },
      ],
    })),
  }
}

function readyTransitGraph(journeyId: string): TargetJourneyGraphSnapshot {
  const start = visitEvent("start", journeyId, "起点")
  const transit = transitEvent("transit", journeyId, "start", "end")
  const end = visitEvent("end", journeyId, "终点")
  if (transit.type !== "TRANSIT") throw new Error("fixture invariant")
  transit.detail.routeState = "READY"
  transit.detail.activePlanningRunId = "run-ready"
  transit.detail.selectedPlanId = "plan-recommended"
  return graph(
    journeyId,
    [start, transit, end],
    [
      link("transit-before", journeyId, "start", "transit", 1024),
      link("transit-after", journeyId, "transit", "end", 2048),
    ],
    { transitPlanningRuns: [readyRun("transit")] }
  )
}

const nestedScopeGraph = (() => {
  const journeyId = "fixture-01-nested-scope"
  return graph(
    journeyId,
    [
      cityEvent("city-a", journeyId, "杭州"),
      transitEvent("root-transit", journeyId, "city-a", "city-b"),
      cityEvent("city-b", journeyId, "上海"),
      visitEvent("visit-a", journeyId, "西湖", "city-a"),
      transitEvent("local-transit", journeyId, "visit-a", "visit-b", "city-a"),
      visitEvent("visit-b", journeyId, "灵隐寺", "city-a"),
      mealEvent("meal-a", journeyId, "午餐", "city-a"),
    ],
    [
      link("root-1", journeyId, "city-a", "root-transit", 1024),
      link("root-2", journeyId, "root-transit", "city-b", 2048),
      link("city-a-1", journeyId, "visit-a", "local-transit", 1024),
      link("city-a-2", journeyId, "local-transit", "visit-b", 2048),
      link("city-a-3", journeyId, "visit-b", "meal-a", 3072),
    ]
  )
})()

const nestedDayGraph = (() => {
  const journeyId = "fixture-02-city-day"
  return graph(
    journeyId,
    [
      cityEvent("city", journeyId, "杭州"),
      dayEvent("day", journeyId, "city", "第一天"),
      visitEvent("morning", journeyId, "西湖", "day"),
      visitEvent("afternoon", journeyId, "良渚", "day"),
    ],
    [link("day-sequence", journeyId, "morning", "afternoon", 1024)]
  )
})()

const transitChoiceBefore = readyTransitGraph("fixture-03-transit-options")
const transitChoiceAfter = clone(transitChoiceBefore)
transitChoiceAfter.revision = 2
const selectedTransit = transitChoiceAfter.events.find(
  (event) => event.id === "transit"
)
if (selectedTransit?.type !== "TRANSIT") throw new Error("fixture invariant")
selectedTransit.detail.selectedPlanId = "plan-low-cost"

const failedRunBefore = readyTransitGraph("fixture-04-failed-transit")
const failedRunAfter = clone(failedRunBefore)
failedRunAfter.revision = 2
failedRunAfter.transitPlanningRuns.push({
  id: "run-failed",
  transitEventId: "transit",
  requestFingerprint: "fixture-failed-fingerprint",
  provider: "mock",
  status: "FAILED",
  errorCode: "PROVIDER_TIMEOUT",
  errorMessage: "provider timed out",
  calculatedAt: LATER,
  plans: [],
})

function branchGraph(selection: "A" | "B"): TargetJourneyGraphSnapshot {
  const journeyId = "fixture-05-branch-correction"
  const result = graph(
    journeyId,
    [
      visitEvent("fork", journeyId, "西湖"),
      visitEvent("branch-a", journeyId, "灵隐寺"),
      visitEvent("branch-b", journeyId, "龙井村"),
      visitEvent("join", journeyId, "酒店"),
    ],
    [
      link("fork-a", journeyId, "fork", "branch-a", 1024),
      link("a-join", journeyId, "branch-a", "join", 1024),
      link(
        "fork-b",
        journeyId,
        "fork",
        "branch-b",
        2048,
        "ALTERNATIVE",
        "rain"
      ),
      link(
        "b-join",
        journeyId,
        "branch-b",
        "join",
        1024,
        "ALTERNATIVE",
        "rain"
      ),
    ]
  )
  result.branchSelections.push({
    id: "selection-a",
    journeyId,
    forkEventId: "fork",
    selectedLinkId: "fork-a",
    journeyRevision: 1,
    actor: { kind: "USER", userId: OWNER_ID },
    createdAt: NOW,
  })
  if (selection === "B") {
    result.revision = 2
    result.branchSelections.push({
      id: "selection-b",
      journeyId,
      forkEventId: "fork",
      selectedLinkId: "fork-b",
      journeyRevision: 2,
      supersedesId: "selection-a",
      actor: { kind: "USER", userId: OWNER_ID },
      reason: "旅行中直接修正行程",
      createdAt: LATER,
    })
  }
  return result
}

const branchBefore = branchGraph("A")
const branchAfter = branchGraph("B")
const branchRevision1 = journeyRevision(branchBefore, "select initial branch")
const branchRevision2 = journeyRevision(
  branchAfter,
  "correct current branch",
  branchRevision1.id
)

const nestedBranchGraph = (() => {
  const journeyId = "fixture-06-nested-branch"
  const result = graph(
    journeyId,
    [
      visitEvent("outer-fork", journeyId, "outer-fork"),
      visitEvent("inner-fork", journeyId, "inner-fork"),
      visitEvent("outer-alt", journeyId, "outer-alt"),
      visitEvent("inner-a", journeyId, "inner-a"),
      visitEvent("inner-b", journeyId, "inner-b"),
      visitEvent("inner-join", journeyId, "inner-join"),
      visitEvent("outer-join", journeyId, "outer-join"),
      visitEvent("end", journeyId, "end"),
    ],
    [
      link("outer-main", journeyId, "outer-fork", "inner-fork", 1024),
      link(
        "outer-alt-start",
        journeyId,
        "outer-fork",
        "outer-alt",
        2048,
        "ALTERNATIVE",
        "outer"
      ),
      link(
        "outer-alt-end",
        journeyId,
        "outer-alt",
        "outer-join",
        1024,
        "ALTERNATIVE",
        "outer"
      ),
      link("inner-main", journeyId, "inner-fork", "inner-a", 1024),
      link(
        "inner-alt",
        journeyId,
        "inner-fork",
        "inner-b",
        2048,
        "ALTERNATIVE",
        "inner"
      ),
      link("inner-a-join", journeyId, "inner-a", "inner-join", 1024),
      link(
        "inner-b-join",
        journeyId,
        "inner-b",
        "inner-join",
        1024,
        "ALTERNATIVE",
        "inner"
      ),
      link("inner-to-outer", journeyId, "inner-join", "outer-join", 1024),
      link("outer-to-end", journeyId, "outer-join", "end", 1024),
    ]
  )
  result.branchSelections = [
    {
      id: "outer-selection",
      journeyId,
      forkEventId: "outer-fork",
      selectedLinkId: "outer-main",
      journeyRevision: 1,
      actor: { kind: "USER", userId: OWNER_ID },
      createdAt: NOW,
    },
    {
      id: "inner-selection",
      journeyId,
      forkEventId: "inner-fork",
      selectedLinkId: "inner-main",
      journeyRevision: 1,
      actor: { kind: "USER", userId: OWNER_ID },
      createdAt: NOW,
    },
  ]
  return result
})()

const crossingBranchGraph = (() => {
  const journeyId = "fixture-06-crossing-branch-invalid"
  const ids = [
    "outer-fork",
    "inner-fork",
    "outer-alt",
    "inner-main-node",
    "inner-alt-node",
    "outer-join",
    "end",
  ]
  return graph(
    journeyId,
    ids.map((id) => visitEvent(id, journeyId, id)),
    [
      link("outer-main", journeyId, "outer-fork", "inner-fork", 1024),
      link(
        "outer-alt-start",
        journeyId,
        "outer-fork",
        "outer-alt",
        2048,
        "ALTERNATIVE",
        "outer"
      ),
      link(
        "outer-alt-join",
        journeyId,
        "outer-alt",
        "outer-join",
        1024,
        "ALTERNATIVE",
        "outer"
      ),
      link("inner-main", journeyId, "inner-fork", "inner-main-node", 1024),
      link("inner-main-join", journeyId, "inner-main-node", "outer-join", 1024),
      link(
        "inner-alt-start",
        journeyId,
        "inner-fork",
        "inner-alt-node",
        2048,
        "ALTERNATIVE",
        "inner"
      ),
      link(
        "inner-alt-end",
        journeyId,
        "inner-alt-node",
        "end",
        1024,
        "ALTERNATIVE",
        "inner"
      ),
      link("outer-join-end", journeyId, "outer-join", "end", 1024),
    ]
  )
})()

const unscheduledBefore = (() => {
  const journeyId = "fixture-07-unscheduled"
  const inbox = visitEvent("inbox-event", journeyId, "待安排景点")
  inbox.placementStatus = "UNSCHEDULED"
  return graph(journeyId, [dayEvent("day", journeyId, null, "第一天"), inbox])
})()
const unscheduledAfter = clone(unscheduledBefore)
unscheduledAfter.revision = 2
const placedEvent = unscheduledAfter.events.find(
  (event) => event.id === "inbox-event"
)
if (!placedEvent) throw new Error("fixture invariant")
placedEvent.placementStatus = "SCHEDULED"
placedEvent.parentSectionEventId = "day"

const moveBefore = (() => {
  const journeyId = "fixture-08-move"
  return graph(
    journeyId,
    [
      visitEvent("move-a", journeyId, "A"),
      visitEvent("move-b", journeyId, "B"),
      visitEvent("move-c", journeyId, "C"),
    ],
    [
      link("move-link-1", journeyId, "move-a", "move-b", 1024),
      link("move-link-2", journeyId, "move-b", "move-c", 2048),
    ]
  )
})()
const moveAfter = clone(moveBefore)
moveAfter.revision = 2
moveAfter.links[0]!.toEventId = "move-c"
moveAfter.links[1]!.fromEventId = "move-c"
moveAfter.links[1]!.toEventId = "move-b"

const replacementBefore = (() => {
  const journeyId = "fixture-08-replacement"
  const first = visitEvent("replacement-a", journeyId, "A")
  first.retiredRevision = 2
  const second = visitEvent("replacement-b", journeyId, "B")
  second.introducedRevision = 2
  return graph(journeyId, [first, second], [], {
    revision: 2,
    replacements: [
      {
        id: "replacement-a-b",
        journeyId,
        predecessorEventId: "replacement-a",
        successorEventId: "replacement-b",
        revision: 2,
        reason: "A closed",
      },
    ],
  })
})()
const replacementAfter = clone(replacementBefore)
replacementAfter.revision = 3
const replacementMiddle = replacementAfter.events.find(
  (event) => event.id === "replacement-b"
)
if (!replacementMiddle) throw new Error("fixture invariant")
replacementMiddle.retiredRevision = 3
const replacementFinal = visitEvent("replacement-c", replacementAfter.id, "C")
replacementFinal.introducedRevision = 3
replacementAfter.events.push(replacementFinal)
replacementAfter.replacements.push({
  id: "replacement-b-c",
  journeyId: replacementAfter.id,
  predecessorEventId: "replacement-b",
  successorEventId: "replacement-c",
  revision: 3,
  reason: "B closed",
})

const retireBefore = graph("fixture-08-retire", [
  visitEvent("retire-me", "fixture-08-retire", "retire me"),
])
const retireAfter = clone(retireBefore)
retireAfter.revision = 2
retireAfter.events[0]!.retiredRevision = 2

const undoAfter = clone(retireAfter)
undoAfter.revision = 3
delete undoAfter.events[0]!.retiredRevision
const retireRevision1 = journeyRevision(retireBefore, "create")
const retireRevision2 = journeyRevision(
  retireAfter,
  "retire event",
  retireRevision1.id
)
const undoRevision3 = journeyRevision(
  undoAfter,
  "undo retire event",
  retireRevision2.id
)

const projectionGraph = (() => {
  const journeyId = "fixture-09-projections"
  const start = visitEvent(
    "confirmed-start",
    journeyId,
    "已到访起点",
    null,
    "CONFIRMED"
  )
  if (start.type !== "VISIT") throw new Error("fixture invariant")
  start.actualStartAt = SOON
  start.actualEndAt = SOON
  const transit = transitEvent(
    "confirmed-transit",
    journeyId,
    "confirmed-start",
    "confirmed-end"
  )
  if (transit.type !== "TRANSIT") throw new Error("fixture invariant")
  transit.executionStatus = "CONFIRMED"
  transit.actualStartAt = SOON
  transit.actualEndAt = LATER
  transit.detail.actualFromEventId = "confirmed-start"
  transit.detail.actualToEventId = "confirmed-end"
  const end = visitEvent(
    "confirmed-end",
    journeyId,
    "已到访终点",
    null,
    "CONFIRMED"
  )
  if (end.type !== "VISIT") throw new Error("fixture invariant")
  end.actualStartAt = LATER
  end.actualEndAt = LATER
  const skipped = visitEvent("skipped", journeyId, "已跳过", null, "SKIPPED")
  const cancelled = visitEvent(
    "cancelled",
    journeyId,
    "已取消",
    null,
    "CANCELLED"
  )
  return graph(
    journeyId,
    [start, transit, end, skipped, cancelled],
    [
      link(
        "projection-1",
        journeyId,
        "confirmed-start",
        "confirmed-transit",
        1024
      ),
      link(
        "projection-2",
        journeyId,
        "confirmed-transit",
        "confirmed-end",
        2048
      ),
      link("projection-3", journeyId, "confirmed-end", "skipped", 3072),
      link("projection-4", journeyId, "skipped", "cancelled", 4096),
    ]
  )
})()

const plannerEvents = [
  {
    eventId: "confirmed-start",
    resolvedPosition: 0,
    locationOrdinal: 1,
    title: "已到访起点",
    startAt: NOW,
    endAt: LATER,
    valueSource: "PLANNED" as const,
  },
  {
    eventId: "confirmed-transit",
    resolvedPosition: 1,
    fromLocationOrdinal: 1,
    toLocationOrdinal: 2,
    title: "交通",
    valueSource: "PLANNED" as const,
  },
  {
    eventId: "confirmed-end",
    resolvedPosition: 2,
    locationOrdinal: 2,
    title: "已到访终点",
    startAt: NOW,
    endAt: LATER,
    valueSource: "PLANNED" as const,
  },
  {
    eventId: "skipped",
    resolvedPosition: 3,
    locationOrdinal: 3,
    title: "已跳过",
    startAt: NOW,
    endAt: LATER,
    valueSource: "PLANNED" as const,
  },
  {
    eventId: "cancelled",
    resolvedPosition: 4,
    locationOrdinal: 4,
    title: "已取消",
    startAt: NOW,
    endAt: LATER,
    valueSource: "PLANNED" as const,
  },
]

const projectionExpectations: TargetResolvedJourneyProjection[] = [
  {
    journeyId: projectionGraph.id,
    revision: 1,
    scopeSectionEventId: null,
    mode: "PLANNER",
    events: plannerEvents,
  },
  {
    journeyId: projectionGraph.id,
    revision: 1,
    scopeSectionEventId: null,
    mode: "EXECUTION",
    events: [
      {
        ...plannerEvents[0]!,
        startAt: SOON,
        endAt: SOON,
        valueSource: "ACTUAL",
      },
      {
        ...plannerEvents[1]!,
        startAt: SOON,
        endAt: LATER,
        valueSource: "ACTUAL",
      },
      {
        ...plannerEvents[2]!,
        startAt: LATER,
        endAt: LATER,
        valueSource: "ACTUAL",
      },
      plannerEvents[3]!,
      plannerEvents[4]!,
    ],
  },
  {
    journeyId: projectionGraph.id,
    revision: 1,
    scopeSectionEventId: null,
    mode: "TRAVELOGUE",
    events: [
      {
        ...plannerEvents[0]!,
        startAt: SOON,
        endAt: SOON,
        valueSource: "ACTUAL",
      },
      {
        ...plannerEvents[1]!,
        startAt: SOON,
        endAt: LATER,
        valueSource: "ACTUAL",
      },
      {
        ...plannerEvents[2]!,
        startAt: LATER,
        endAt: LATER,
        valueSource: "ACTUAL",
      },
    ],
  },
]

const projectionGraphShuffled = clone(projectionGraph)
projectionGraphShuffled.events.reverse()
projectionGraphShuffled.links.reverse()

const workspaceGraph = graph("fixture-10-workspace-journey", [
  visitEvent("workspace-visit", "fixture-10-workspace-journey", "西湖"),
])
const workspaceDocument: TargetWorkspaceDocument = {
  session: {
    id: "workspace-fixture",
    ownerId: OWNER_ID,
    sourceJourneyId: workspaceGraph.id,
    baseJourneyRevision: 1,
    headWorkspaceRevision: 1,
    status: "ACTIVE",
    headGraph: workspaceGraph,
    expiresAt: "2026-08-31T00:00:00.000Z",
    lastAccessAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  },
  accessState: "OWNER",
  draftState: "DIRTY",
  messages: [
    {
      id: "workspace-message",
      workspaceId: "workspace-fixture",
      role: "USER",
      content: "把西湖安排到第一天",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  suggestions: [],
  agentRuns: [],
}
const workspaceNoAccess = clone(workspaceDocument)
workspaceNoAccess.accessState = "NO_ACCESS"
const workspaceExpired = clone(workspaceDocument)
workspaceExpired.session.status = "EXPIRED"
workspaceExpired.accessState = "EXPIRED"
const workspaceStale = clone(workspaceDocument)
workspaceStale.draftState = "STALE"
const workspaceConflict = clone(workspaceDocument)
workspaceConflict.draftState = "CONFLICT"
const workspaceReauth = clone(workspaceDocument)
workspaceReauth.accessState = "REAUTH_REQUIRED"
const workspaceRefreshed = clone(workspaceDocument)
workspaceRefreshed.session.id = "workspace-refreshed"
workspaceRefreshed.messages = []
const workspaceForked = clone(workspaceDocument)
workspaceForked.session.id = "workspace-forked"
workspaceForked.session.headWorkspaceRevision = 0
workspaceForked.messages = []
const workspaceRevision: TargetWorkspaceRevision = {
  id: "workspace-revision-1",
  workspaceId: workspaceDocument.session.id,
  revision: 1,
  commandName: "journey.update_event",
  before: clone(workspaceGraph),
  after: clone(workspaceGraph),
  patch: { title: "西湖" },
  inversePatch: { title: "西湖" },
  actor: { kind: "USER", userId: OWNER_ID },
  idempotencyKey: "workspace-revision-1",
  createdAt: NOW,
}
const replayResult: TargetCommandResult = {
  aggregateId: workspaceDocument.session.id,
  commandName: "workspace.replay",
  newRevision: 1,
  changedEventIds: [],
  patch: {},
  inversePatch: {},
  projectionInvalidationScopes: [],
  replayedFromIdempotencyKey: true,
}

const contentJourneyId = "fixture-11-content-journey"
const contentEvent = visitEvent("content-event", contentJourneyId, "西湖")
const contentBundle: TargetContentBundle = {
  assets: [
    {
      id: "asset-private",
      ownerId: OWNER_ID,
      kind: "IMAGE",
      visibility: "PRIVATE",
      storageKey: "fixtures/private.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 128,
      checksum: "asset-checksum",
      createdAt: NOW,
    },
  ],
  eventAssetLinks: [
    {
      id: "event-asset-link",
      journeyId: contentJourneyId,
      eventId: contentEvent.id,
      assetId: "asset-private",
      assetChecksum: "asset-checksum",
      role: "GALLERY",
      rank: 1024,
      caption: "清晨西湖",
      visibility: "PRIVATE",
      introducedRevision: 1,
      createdAt: NOW,
    },
  ],
  observations: [
    {
      id: "observation-1",
      eventId: contentEvent.id,
      kind: "NOTE",
      phase: "ACTUAL",
      body: "人很多",
      observedAt: NOW,
      actor: { kind: "USER", userId: OWNER_ID },
      visibility: "JOURNEY",
      createdAt: NOW,
    },
    {
      id: "observation-2",
      eventId: contentEvent.id,
      kind: "NOTE",
      phase: "ACTUAL",
      body: "清晨人少",
      observedAt: SOON,
      actor: { kind: "USER", userId: OWNER_ID },
      supersedesId: "observation-1",
      visibility: "JOURNEY",
      createdAt: SOON,
    },
  ],
  sourcePacks: [
    {
      id: "source-pack",
      ownerId: OWNER_ID,
      title: "地方志",
      visibility: "PRIVATE",
      status: "READY",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  sourceDocuments: [
    {
      id: "source-document",
      sourcePackId: "source-pack",
      assetId: "asset-private",
      checksum: "document-checksum",
      title: "地方志选段",
      processingStatus: "READY",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  sourceItems: [
    {
      id: "source-item",
      sourceDocumentId: "source-document",
      kind: "PLACE",
      title: "西湖",
      sourceOrder: 0,
      page: "12",
      confidence: 0.98,
      resolutionState: "CONFIRMED",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  eventSourceLinks: [
    {
      id: "event-source-link",
      journeyId: contentJourneyId,
      eventId: contentEvent.id,
      sourceItemId: "source-item",
      sourceDocumentId: "source-document",
      sourceDocumentChecksum: "document-checksum",
      role: "INSPIRATION",
      excerpt: "西湖旧称武林水。",
      page: "12",
      confidence: 0.98,
      rank: 1024,
      approvedForJourneySharing: true,
      introducedRevision: 1,
      createdAt: NOW,
    },
  ],
}
const contentGraph = graph(contentJourneyId, [contentEvent], [], {
  eventAssetLinks: clone(contentBundle.eventAssetLinks),
  observations: clone(contentBundle.observations),
  eventSourceLinks: clone(contentBundle.eventSourceLinks),
})
contentGraph.revision = 2
const contentBeforeSupersession = clone(contentBundle)
contentBeforeSupersession.observations = [clone(contentBundle.observations[0]!)]
const contentGraphBeforeSupersession = clone(contentGraph)
contentGraphBeforeSupersession.revision = 1
contentGraphBeforeSupersession.observations = [
  clone(contentBundle.observations[0]!),
]
const contentBeforeJourneyRevision = journeyRevision(
  contentGraphBeforeSupersession,
  "add initial observation"
)
const contentJourneyRevision = journeyRevision(
  contentGraph,
  "supersede observation",
  contentBeforeJourneyRevision.id
)

const deletedSectionGraph = (() => {
  const journeyId = "fixture-12-delete-history"
  const day = dayEvent("day", journeyId, null, "第一天")
  const start = visitEvent(
    "delete-start",
    journeyId,
    "起点",
    "day",
    "CONFIRMED"
  )
  if (start.type !== "VISIT") throw new Error("fixture invariant")
  start.actualStartAt = SOON
  start.actualEndAt = SOON
  const transit = transitEvent(
    "delete-transit",
    journeyId,
    "delete-start",
    "delete-end",
    "day"
  )
  if (transit.type !== "TRANSIT") throw new Error("fixture invariant")
  transit.executionStatus = "CONFIRMED"
  transit.actualStartAt = SOON
  transit.actualEndAt = LATER
  transit.detail.actualFromEventId = "delete-start"
  transit.detail.actualToEventId = "delete-end"
  transit.detail.routeState = "READY"
  transit.detail.activePlanningRunId = "run-ready"
  transit.detail.selectedPlanId = "plan-recommended"
  const end = visitEvent("delete-end", journeyId, "终点", "day", "CONFIRMED")
  if (end.type !== "VISIT") throw new Error("fixture invariant")
  end.actualStartAt = LATER
  end.actualEndAt = LATER
  const result = graph(
    journeyId,
    [day, start, transit, end],
    [
      link("delete-link-1", journeyId, "delete-start", "delete-transit", 1024),
      link("delete-link-2", journeyId, "delete-transit", "delete-end", 2048),
    ],
    {
      revision: 2,
      deletedAt: LATER,
      transitPlanningRuns: [readyRun("delete-transit")],
    }
  )
  for (const event of result.events) {
    if (event.type === "VISIT") event.detail.coordinateSystem = "WGS84"
  }
  for (const run of result.transitPlanningRuns) {
    for (const plan of run.plans) {
      for (const segment of plan.segments) {
        segment.coordinateSystem = "WGS84"
      }
    }
  }
  return result
})()
const beforeDeleteSectionGraph = clone(deletedSectionGraph)
beforeDeleteSectionGraph.revision = 1
delete beforeDeleteSectionGraph.deletedAt
const beforeDeleteJourneyRevision = journeyRevision(
  beforeDeleteSectionGraph,
  "record actual journey"
)
const deletedJourneyRevision = journeyRevision(
  deletedSectionGraph,
  "soft delete journey",
  beforeDeleteJourneyRevision.id
)
const deletedProjection: TargetResolvedJourneyProjection = {
  journeyId: deletedSectionGraph.id,
  revision: 2,
  scopeSectionEventId: "day",
  mode: "TRAVELOGUE",
  events: [
    {
      eventId: "delete-start",
      resolvedPosition: 0,
      locationOrdinal: 1,
      title: "起点",
      startAt: SOON,
      endAt: SOON,
      valueSource: "ACTUAL",
    },
    {
      eventId: "delete-transit",
      resolvedPosition: 1,
      fromLocationOrdinal: 1,
      toLocationOrdinal: 2,
      title: "交通",
      startAt: SOON,
      endAt: LATER,
      valueSource: "ACTUAL",
    },
    {
      eventId: "delete-end",
      resolvedPosition: 2,
      locationOrdinal: 2,
      title: "终点",
      startAt: LATER,
      endAt: LATER,
      valueSource: "ACTUAL",
    },
  ],
}

export interface TargetScenarioState {
  graph?: TargetJourneyGraphSnapshot
  workspace?: TargetWorkspaceDocument
  content?: TargetContentBundle
  journeyRevisions?: readonly TargetJourneyRevision[]
  workspaceRevisions?: readonly TargetWorkspaceRevision[]
}

export interface TargetScenarioError {
  code: string
  field?: string
}

export interface TargetScenarioExpected {
  state?: TargetScenarioState
  projections?: readonly TargetResolvedJourneyProjection[]
  commandResult?: TargetCommandResult
  error?: TargetScenarioError
  sameBytesAsCaseId?: string
  evidence?: Readonly<Record<string, unknown>>
}

export interface TargetScenarioCase {
  id: string
  input: TargetScenarioState
  command?: TargetCommandEnvelope
  expected: TargetScenarioExpected
}

export interface TargetContractFixture {
  id: string
  purpose: string
  cases: readonly TargetScenarioCase[]
}

export const TARGET_CONTRACT_FIXTURES: readonly TargetContractFixture[] = [
  {
    id: "01-root-city-and-local-scope",
    purpose: "root CITY to TRANSIT to CITY plus CITY-local route",
    cases: [
      {
        id: "nested-scopes",
        input: { graph: nestedScopeGraph },
        expected: { state: { graph: nestedScopeGraph } },
      },
    ],
  },
  {
    id: "02-city-day-event-drilldown",
    purpose: "CITY to DAY to Event uses one containment and scope-link model",
    cases: [
      {
        id: "city-day-drilldown",
        input: { graph: nestedDayGraph },
        expected: { state: { graph: nestedDayGraph } },
      },
    ],
  },
  {
    id: "03-transit-plan-choice",
    purpose: "switching plans changes selection without changing topology",
    cases: [
      {
        id: "select-low-cost",
        input: { graph: transitChoiceBefore },
        command: userCommand(transitChoiceBefore.id, 1, "select-low-cost", {
          name: "journey.select_transit_plan",
          payload: { eventId: "transit", planId: "plan-low-cost" },
        }),
        expected: {
          state: { graph: transitChoiceAfter },
          evidence: {
            selectedPlanId: "plan-low-cost",
            eventIds: ["start", "transit", "end"],
            linkIds: ["transit-before", "transit-after"],
          },
        },
      },
    ],
  },
  {
    id: "04-failed-transit-run",
    purpose:
      "a failed refresh appends audit while retaining the READY active run",
    cases: [
      {
        id: "failed-refresh-retains-active-run",
        input: { graph: failedRunBefore },
        command: userCommand(failedRunBefore.id, 1, "refresh-transit", {
          name: "journey.plan_transit",
          payload: { eventId: "transit", forceRefresh: true },
        }),
        expected: {
          state: { graph: failedRunAfter },
          evidence: {
            activePlanningRunId: "run-ready",
            selectedPlanId: "plan-recommended",
            appendedRunId: "run-failed",
            appendedRunStatus: "FAILED",
          },
        },
      },
    ],
  },
  {
    id: "05-current-branch-correction",
    purpose:
      "current selection changes while the old plan remains readable by revision",
    cases: [
      {
        id: "correct-current-selection",
        input: {
          graph: branchBefore,
          journeyRevisions: [branchRevision1],
        },
        command: userCommand(branchBefore.id, 1, "select-branch-b", {
          name: "journey.select_branch",
          payload: {
            forkEventId: "fork",
            selectedLinkId: "fork-b",
            reason: "旅行中直接修正行程",
          },
        }),
        expected: {
          state: {
            graph: branchAfter,
            journeyRevisions: [branchRevision1, branchRevision2],
          },
          evidence: {
            revision1Selection: "fork-a",
            revision2Selection: "fork-b",
          },
        },
      },
    ],
  },
  {
    id: "06-strict-nested-branch",
    purpose:
      "nested branches are valid while crossing branch intervals fail resolution",
    cases: [
      {
        id: "two-level-nested-forks",
        input: { graph: nestedBranchGraph },
        expected: {
          state: { graph: nestedBranchGraph },
          evidence: { forkEventIds: ["outer-fork", "inner-fork"] },
        },
      },
      {
        id: "crossing-branch-error",
        input: { graph: crossingBranchGraph },
        expected: { error: { code: "CROSSING_BRANCH" } },
      },
    ],
  },
  {
    id: "07-unscheduled-placement",
    purpose: "UNSCHEDULED persists without links and placement is atomic",
    cases: [
      {
        id: "place-inbox-event",
        input: { graph: unscheduledBefore },
        command: userCommand(unscheduledBefore.id, 1, "place-inbox-event", {
          name: "journey.place_event",
          payload: {
            eventId: "inbox-event",
            position: { placement: "END", parentSectionEventId: "day" },
          },
        }),
        expected: { state: { graph: unscheduledAfter } },
      },
    ],
  },
  {
    id: "08-replacement-retire-undo",
    purpose:
      "move, replacement lineage, retire, and undo have exact after states",
    cases: [
      {
        id: "move-keeps-identities",
        input: { graph: moveBefore },
        command: userCommand(moveBefore.id, 1, "move-c-before-b", {
          name: "journey.move_event",
          payload: {
            eventId: "move-c",
            position: { placement: "BEFORE", anchorEventId: "move-b" },
          },
        }),
        expected: {
          state: { graph: moveAfter },
          evidence: {
            eventIds: ["move-a", "move-b", "move-c"],
            linkIds: ["move-link-1", "move-link-2"],
          },
        },
      },
      {
        id: "replacement-chain",
        input: { graph: replacementBefore },
        command: userCommand(replacementBefore.id, 2, "replace-b-with-c", {
          name: "journey.replace_event",
          payload: {
            predecessorEventId: "replacement-b",
            successor: {
              type: "VISIT",
              id: "replacement-c",
              origin: "USER_INSERTED",
              executionStatus: "PLANNED",
              title: "C",
              detail: {
                plannedLat: 30.25,
                plannedLng: 120.15,
                coordinateSystem: "GCJ02",
              },
            },
            reason: "B closed",
          },
        }),
        expected: { state: { graph: replacementAfter } },
      },
      {
        id: "retire-event",
        input: { graph: retireBefore },
        command: userCommand(retireBefore.id, 1, "retire-event", {
          name: "journey.retire_event",
          payload: { eventId: "retire-me" },
        }),
        expected: { state: { graph: retireAfter } },
      },
      {
        id: "undo-appends-revision",
        input: {
          graph: retireAfter,
          journeyRevisions: [retireRevision1, retireRevision2],
        },
        command: userCommand(retireAfter.id, 2, "undo-retire", {
          name: "journey.undo",
          payload: { steps: 1 },
        }),
        expected: {
          state: {
            graph: undoAfter,
            journeyRevisions: [retireRevision1, retireRevision2, undoRevision3],
          },
          evidence: { headRevision: 3, eventActive: true },
        },
      },
    ],
  },
  {
    id: "09-exact-projection-modes",
    purpose:
      "all projection modes pin exact order, facts, and Transit ordinals",
    cases: [
      {
        id: "canonical-input-order",
        input: { graph: projectionGraph },
        expected: { projections: projectionExpectations },
      },
      {
        id: "shuffled-input-order",
        input: { graph: projectionGraphShuffled },
        expected: {
          projections: projectionExpectations,
          sameBytesAsCaseId: "canonical-input-order",
        },
      },
    ],
  },
  {
    id: "10-workspace-lifecycle",
    purpose:
      "workspace access, conflict, recovery, fork, replay, and restart are explicit",
    cases: [
      {
        id: "owner-dirty",
        input: { graph: workspaceGraph, workspace: workspaceDocument },
        expected: {
          state: { graph: workspaceGraph, workspace: workspaceDocument },
        },
      },
      {
        id: "no-access",
        input: { workspace: workspaceNoAccess },
        expected: { error: { code: "WORKSPACE_NO_ACCESS" } },
      },
      {
        id: "expired",
        input: { workspace: workspaceExpired },
        expected: { error: { code: "WORKSPACE_EXPIRED" } },
      },
      {
        id: "stale",
        input: { workspace: workspaceStale },
        expected: { state: { workspace: workspaceStale } },
      },
      {
        id: "conflict",
        input: { workspace: workspaceConflict },
        expected: { error: { code: "REVISION_CONFLICT" } },
      },
      {
        id: "refresh-after-reauth",
        input: { workspace: workspaceReauth },
        command: userCommand(workspaceReauth.session.id, 1, "refresh", {
          name: "workspace.refresh",
          payload: { fromWorkspaceRevision: 1 },
        }),
        expected: { state: { workspace: workspaceRefreshed } },
      },
      {
        id: "fork-workspace",
        input: {
          workspace: workspaceDocument,
          workspaceRevisions: [workspaceRevision],
        },
        command: userCommand(workspaceDocument.session.id, 1, "fork", {
          name: "workspace.fork",
          payload: { fromWorkspaceRevision: 1 },
        }),
        expected: { state: { workspace: workspaceForked } },
      },
      {
        id: "idempotent-replay",
        input: {
          workspace: workspaceDocument,
          workspaceRevisions: [workspaceRevision],
        },
        command: userCommand(workspaceDocument.session.id, 1, "replay", {
          name: "workspace.replay",
          payload: { fromWorkspaceRevision: 1 },
        }),
        expected: {
          state: {
            workspace: workspaceDocument,
            workspaceRevisions: [workspaceRevision],
          },
          commandResult: replayResult,
        },
      },
      {
        id: "restart-recovery",
        input: {
          workspace: workspaceDocument,
          workspaceRevisions: [workspaceRevision],
        },
        expected: {
          state: {
            workspace: workspaceDocument,
            workspaceRevisions: [workspaceRevision],
          },
        },
      },
    ],
  },
  {
    id: "11-content-provenance",
    purpose:
      "snapshots pin display metadata and sharing failures are executable",
    cases: [
      {
        id: "supersede-observation-command",
        input: {
          graph: contentGraphBeforeSupersession,
          content: contentBeforeSupersession,
          journeyRevisions: [contentBeforeJourneyRevision],
        },
        command: userCommand(
          contentGraphBeforeSupersession.id,
          1,
          "supersede-observation",
          {
            name: "journey.add_observation",
            payload: {
              eventId: contentEvent.id,
              observation: {
                kind: "NOTE",
                phase: "ACTUAL",
                body: "清晨人少",
                observedAt: SOON,
                supersedesId: "observation-1",
                visibility: "JOURNEY",
              },
            },
          }
        ),
        expected: {
          state: {
            graph: contentGraph,
            content: contentBundle,
            journeyRevisions: [
              contentBeforeJourneyRevision,
              contentJourneyRevision,
            ],
          },
        },
      },
      {
        id: "observation-supersession-and-pinned-content",
        input: {
          graph: contentGraph,
          content: contentBundle,
          journeyRevisions: [
            contentBeforeJourneyRevision,
            contentJourneyRevision,
          ],
        },
        expected: {
          state: {
            graph: contentGraph,
            content: contentBundle,
            journeyRevisions: [
              contentBeforeJourneyRevision,
              contentJourneyRevision,
            ],
          },
          evidence: {
            currentObservationId: "observation-2",
            assetChecksum: "asset-checksum",
            sourceDocumentChecksum: "document-checksum",
          },
        },
      },
      {
        id: "asset-owner-mismatch",
        input: { graph: contentGraph, content: contentBundle },
        command: userCommand(
          contentGraph.id,
          contentGraph.revision,
          "attach-foreign-asset",
          {
            name: "journey.attach_asset",
            payload: {
              eventId: contentEvent.id,
              assetId: "asset-private",
              role: "GALLERY",
              visibility: "PRIVATE",
            },
          },
          "different-user"
        ),
        expected: { error: { code: "ASSET_OWNER_MISMATCH" } },
      },
      {
        id: "shared-source-requires-excerpt",
        input: { graph: contentGraph, content: contentBundle },
        command: userCommand(
          contentGraph.id,
          contentGraph.revision,
          "share-source",
          {
            name: "journey.link_source_item",
            payload: {
              eventId: contentEvent.id,
              sourceItemId: "source-item",
              role: "EVIDENCE",
              approvedForJourneySharing: true,
            },
          }
        ),
        expected: { error: { code: "SOURCE_EXCERPT_REQUIRED" } },
      },
    ],
  },
  {
    id: "12-coordinate-section-delete-history",
    purpose:
      "deleted Journey history preserves SECTION-derived time and WGS84 facts",
    cases: [
      {
        id: "read-soft-deleted-history",
        input: {
          graph: deletedSectionGraph,
          journeyRevisions: [
            beforeDeleteJourneyRevision,
            deletedJourneyRevision,
          ],
        },
        expected: {
          state: {
            graph: deletedSectionGraph,
            journeyRevisions: [
              beforeDeleteJourneyRevision,
              deletedJourneyRevision,
            ],
          },
          projections: [deletedProjection],
          evidence: {
            sectionEventId: "day",
            derivedStartAt: SOON,
            derivedEndAt: LATER,
            coordinateSystem: "WGS84",
            deletedAt: LATER,
          },
        },
      },
    ],
  },
]
