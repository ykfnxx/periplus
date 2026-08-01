import type { TargetCommandEnvelope } from "./commands"
import type { TargetContentBundle } from "./content"
import type {
  TargetJourneyEvent,
  TargetJourneyEventLink,
  TargetJourneyGraphSnapshot,
  TargetResolvedJourneyProjection,
} from "./journey"
import type { TargetWorkspaceDocument } from "./workspace"

const NOW = "2026-08-01T00:00:00.000Z"
const LATER = "2026-08-02T00:00:00.000Z"
const OWNER_ID = "user-contract-owner"

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
  parentSectionEventId: string,
  title: string,
  localDate: string
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
  command: TargetCommandEnvelope["command"]
): TargetCommandEnvelope {
  return {
    aggregateId,
    expectedRevision,
    idempotencyKey,
    actor: { kind: "USER", userId: OWNER_ID },
    command,
  }
}

const nestedScopeGraph = (() => {
  const journeyId = "fixture-01-nested-scope"
  const cityA = cityEvent("city-a", journeyId, "杭州")
  const rootTransit = transitEvent(
    "root-transit",
    journeyId,
    "city-a",
    "city-b"
  )
  const cityB = cityEvent("city-b", journeyId, "上海")
  const visitA = visitEvent("visit-a", journeyId, "西湖", "city-a")
  const localTransit = transitEvent(
    "local-transit",
    journeyId,
    "visit-a",
    "visit-b",
    "city-a"
  )
  const visitB = visitEvent("visit-b", journeyId, "灵隐寺", "city-a")
  return graph(
    journeyId,
    [cityA, rootTransit, cityB, visitA, localTransit, visitB],
    [
      link("root-1", journeyId, "city-a", "root-transit", 1024),
      link("root-2", journeyId, "root-transit", "city-b", 2048),
      link("city-a-1", journeyId, "visit-a", "local-transit", 1024),
      link("city-a-2", journeyId, "local-transit", "visit-b", 2048),
    ]
  )
})()

const nestedDayGraph = (() => {
  const journeyId = "fixture-02-city-day"
  const city = cityEvent("city", journeyId, "杭州")
  const day = dayEvent("day", journeyId, "city", "第一天", "2026-08-01")
  const morning = visitEvent("morning", journeyId, "西湖", "day")
  const afternoon = visitEvent("afternoon", journeyId, "良渚", "day")
  return graph(
    journeyId,
    [city, day, morning, afternoon],
    [link("day-sequence", journeyId, "morning", "afternoon", 1024)]
  )
})()

function readyTransitGraph() {
  const journeyId = "fixture-03-transit-options"
  const start = visitEvent("start", journeyId, "起点")
  const transit = transitEvent("transit", journeyId, "start", "end")
  const end = visitEvent("end", journeyId, "终点")
  if (transit.type !== "TRANSIT") throw new Error("fixture invariant")
  transit.detail.routeState = "READY"
  transit.detail.activePlanningRunId = "run-ready"
  transit.detail.selectedPlanId = "plan-recommended"

  const plans = [
    ["plan-recommended", "推荐", "RECOMMENDED", 0],
    ["plan-fastest", "最快", "FASTEST", 1],
    ["plan-low-cost", "低价", "LOW_COST", 2],
  ] as const
  return graph(
    journeyId,
    [start, transit, end],
    [
      link("transit-before", journeyId, "start", "transit", 1024),
      link("transit-after", journeyId, "transit", "end", 2048),
    ],
    {
      transitPlanningRuns: [
        {
          id: "run-ready",
          transitEventId: "transit",
          requestFingerprint: "fixture-ready-fingerprint",
          provider: "mock",
          status: "READY",
          calculatedAt: NOW,
          plans: plans.map(([id, label, strategy, rank]) => ({
            id,
            planningRunId: "run-ready",
            transitEventId: "transit",
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
        },
      ],
    }
  )
}

const failedTransitGraph = (() => {
  const journeyId = "fixture-04-failed-transit"
  const start = visitEvent("start", journeyId, "起点")
  const transit = transitEvent("transit", journeyId, "start", "end")
  const end = visitEvent("end", journeyId, "终点")
  return graph(journeyId, [start, transit, end], [], {
    transitPlanningRuns: [
      {
        id: "run-failed",
        transitEventId: "transit",
        requestFingerprint: "fixture-failed-fingerprint",
        provider: "mock",
        status: "FAILED",
        errorCode: "PROVIDER_TIMEOUT",
        errorMessage: "provider timed out",
        calculatedAt: NOW,
        plans: [],
      },
    ],
  })
})()

const correctedBranchGraph = (() => {
  const journeyId = "fixture-05-branch-correction"
  const start = visitEvent("fork", journeyId, "西湖")
  const branchA = visitEvent("branch-a", journeyId, "灵隐寺")
  const branchB = visitEvent("branch-b", journeyId, "龙井村")
  const join = visitEvent("join", journeyId, "酒店")
  return graph(
    journeyId,
    [start, branchA, branchB, join],
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
    ],
    {
      revision: 2,
      branchSelections: [
        {
          id: "selection-a",
          journeyId,
          forkEventId: "fork",
          selectedLinkId: "fork-a",
          journeyRevision: 1,
          actor: { kind: "USER", userId: OWNER_ID },
          createdAt: NOW,
        },
        {
          id: "selection-b",
          journeyId,
          forkEventId: "fork",
          selectedLinkId: "fork-b",
          journeyRevision: 2,
          supersedesId: "selection-a",
          actor: { kind: "USER", userId: OWNER_ID },
          reason: "旅行中直接修正行程",
          createdAt: LATER,
        },
      ],
    }
  )
})()

const nestedBranchGraph = (() => {
  const journeyId = "fixture-06-nested-branch"
  const ids = ["start", "outer-a", "inner-a", "inner-b", "outer-join", "end"]
  const events = ids.map((id) => visitEvent(id, journeyId, id))
  return graph(journeyId, events, [
    link("start-outer", journeyId, "start", "outer-a", 1024),
    link("outer-inner-a", journeyId, "outer-a", "inner-a", 1024),
    link(
      "outer-inner-b",
      journeyId,
      "outer-a",
      "inner-b",
      2048,
      "ALTERNATIVE",
      "inner"
    ),
    link("inner-a-join", journeyId, "inner-a", "outer-join", 1024),
    link(
      "inner-b-join",
      journeyId,
      "inner-b",
      "outer-join",
      1024,
      "ALTERNATIVE",
      "inner"
    ),
    link("outer-end", journeyId, "outer-join", "end", 1024),
  ])
})()

const crossingBranchGraph = (() => {
  const journeyId = "fixture-06-crossing-branch-invalid"
  const ids = [
    "outer-fork",
    "inner-fork",
    "outer-alt",
    "inner-main",
    "inner-alt",
    "outer-join",
    "end",
  ]
  const events = ids.map((id) => visitEvent(id, journeyId, id))
  return graph(journeyId, events, [
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
    link("inner-main", journeyId, "inner-fork", "inner-main", 1024),
    link("inner-main-join", journeyId, "inner-main", "outer-join", 1024),
    link(
      "inner-alt-start",
      journeyId,
      "inner-fork",
      "inner-alt",
      2048,
      "ALTERNATIVE",
      "inner"
    ),
    // This branch joins after the outer branch has already converged, so the
    // two branch intervals cross instead of being nested or disjoint.
    link(
      "inner-alt-end",
      journeyId,
      "inner-alt",
      "end",
      1024,
      "ALTERNATIVE",
      "inner"
    ),
    link("outer-join-end", journeyId, "outer-join", "end", 1024),
  ])
})()

const unscheduledGraph = (() => {
  const journeyId = "fixture-07-unscheduled"
  const day = dayEvent(
    "day",
    journeyId,
    cityEvent("unused", journeyId, "unused").id,
    "第一天",
    "2026-08-01"
  )
  day.parentSectionEventId = null
  const inbox = visitEvent("inbox-event", journeyId, "待安排景点")
  inbox.placementStatus = "UNSCHEDULED"
  return graph(journeyId, [day, inbox])
})()

const replacementGraph = (() => {
  const journeyId = "fixture-08-replacement"
  const predecessor = visitEvent("predecessor", journeyId, "旧地点")
  predecessor.retiredRevision = 2
  const successor = visitEvent("successor", journeyId, "新地点")
  successor.introducedRevision = 2
  return graph(journeyId, [predecessor, successor], [], {
    revision: 2,
    replacements: [
      {
        id: "replacement",
        journeyId,
        predecessorEventId: "predecessor",
        successorEventId: "successor",
        revision: 2,
        reason: "目的地已关闭",
      },
    ],
  })
})()

const projectionGraph = (() => {
  const journeyId = "fixture-09-projections"
  const confirmed = visitEvent(
    "confirmed",
    journeyId,
    "已到访",
    null,
    "CONFIRMED"
  )
  if (confirmed.type !== "VISIT") throw new Error("fixture invariant")
  confirmed.actualStartAt = LATER
  confirmed.actualEndAt = LATER
  const fallback = visitEvent("fallback", journeyId, "尚未确认")
  const skipped = visitEvent("skipped", journeyId, "已跳过", null, "SKIPPED")
  return graph(
    journeyId,
    [confirmed, fallback, skipped],
    [
      link("projection-1", journeyId, "confirmed", "fallback", 1024),
      link("projection-2", journeyId, "fallback", "skipped", 2048),
    ]
  )
})()

const projectionExpectations: TargetResolvedJourneyProjection[] = [
  {
    journeyId: projectionGraph.id,
    revision: 1,
    scopeSectionEventId: null,
    mode: "PLANNER",
    events: [
      {
        eventId: "confirmed",
        resolvedPosition: 0,
        locationOrdinal: 1,
        title: "已到访",
        startAt: NOW,
        endAt: LATER,
        valueSource: "PLANNED",
      },
      {
        eventId: "fallback",
        resolvedPosition: 1,
        locationOrdinal: 2,
        title: "尚未确认",
        startAt: NOW,
        endAt: LATER,
        valueSource: "PLANNED",
      },
      {
        eventId: "skipped",
        resolvedPosition: 2,
        locationOrdinal: 3,
        title: "已跳过",
        startAt: NOW,
        endAt: LATER,
        valueSource: "PLANNED",
      },
    ],
  },
  {
    journeyId: projectionGraph.id,
    revision: 1,
    scopeSectionEventId: null,
    mode: "EXECUTION",
    events: [
      {
        eventId: "confirmed",
        resolvedPosition: 0,
        locationOrdinal: 1,
        title: "已到访",
        startAt: LATER,
        endAt: LATER,
        valueSource: "ACTUAL",
      },
      {
        eventId: "fallback",
        resolvedPosition: 1,
        locationOrdinal: 2,
        title: "尚未确认",
        startAt: NOW,
        endAt: LATER,
        valueSource: "PLANNED",
      },
      {
        eventId: "skipped",
        resolvedPosition: 2,
        locationOrdinal: 3,
        title: "已跳过",
        startAt: NOW,
        endAt: LATER,
        valueSource: "PLANNED",
      },
    ],
  },
  {
    journeyId: projectionGraph.id,
    revision: 1,
    scopeSectionEventId: null,
    mode: "TRAVELOGUE",
    events: [
      {
        eventId: "confirmed",
        resolvedPosition: 0,
        locationOrdinal: 1,
        title: "已到访",
        startAt: LATER,
        endAt: LATER,
        valueSource: "ACTUAL",
      },
    ],
  },
]

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
      eventId: "workspace-visit",
      assetId: "asset-private",
      role: "GALLERY",
      rank: 1024,
      visibility: "PRIVATE",
      createdAt: NOW,
    },
  ],
  observations: [
    {
      id: "observation",
      eventId: "workspace-visit",
      kind: "NOTE",
      phase: "ACTUAL",
      body: "清晨人少",
      observedAt: NOW,
      actor: { kind: "USER", userId: OWNER_ID },
      visibility: "JOURNEY",
      createdAt: NOW,
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
      eventId: "workspace-visit",
      sourceItemId: "source-item",
      role: "INSPIRATION",
      excerpt: "西湖旧称武林水。",
      page: "12",
      confidence: 0.98,
      rank: 1024,
      approvedForJourneySharing: true,
      createdAt: NOW,
    },
  ],
}

const nonGcjGraph = (() => {
  const result = readyTransitGraph()
  result.id = "fixture-12-non-gcj"
  result.title = result.id
  result.deletedAt = LATER
  for (const event of result.events) event.journeyId = result.id
  for (const item of result.links) item.journeyId = result.id
  for (const run of result.transitPlanningRuns) {
    for (const plan of run.plans) {
      for (const segment of plan.segments) segment.coordinateSystem = "WGS84"
    }
  }
  return result
})()

export interface TargetContractFixture {
  id: string
  purpose: string
  graph?: TargetJourneyGraphSnapshot
  invalidGraph?: TargetJourneyGraphSnapshot
  workspace?: TargetWorkspaceDocument
  content?: TargetContentBundle
  commands?: TargetCommandEnvelope[]
  expectedProjections?: TargetResolvedJourneyProjection[]
  expectedValidationError?: string
  expectedHistory?: Record<string, unknown>
}

export const TARGET_CONTRACT_FIXTURES: readonly TargetContractFixture[] = [
  {
    id: "01-root-city-and-local-scope",
    purpose: "root CITY to TRANSIT to CITY plus CITY-local route",
    graph: nestedScopeGraph,
  },
  {
    id: "02-city-day-event-drilldown",
    purpose: "CITY to DAY to Event uses one containment and scope-link model",
    graph: nestedDayGraph,
  },
  {
    id: "03-transit-plan-choice",
    purpose: "switching three plans does not change topology",
    graph: readyTransitGraph(),
    commands: [
      userCommand(readyTransitGraph().id, 1, "select-low-cost", {
        name: "journey.select_transit_plan",
        payload: { eventId: "transit", planId: "plan-low-cost" },
      }),
    ],
  },
  {
    id: "04-failed-transit-run",
    purpose:
      "FAILED run retains fingerprint and error without replacing active plan",
    graph: failedTransitGraph,
  },
  {
    id: "05-current-branch-correction",
    purpose:
      "travel deviation corrects one current selection while revisions retain the old plan",
    graph: correctedBranchGraph,
    expectedHistory: {
      revision1Selection: "fork-a",
      revision2Selection: "fork-b",
    },
  },
  {
    id: "06-strict-nested-branch",
    purpose:
      "nested branches are contained; crossing topology is rejected in P3",
    graph: nestedBranchGraph,
    invalidGraph: crossingBranchGraph,
    expectedValidationError: "CROSSING_BRANCH",
  },
  {
    id: "07-unscheduled-placement",
    purpose:
      "canonical UNSCHEDULED event persists without links and is placed atomically",
    graph: unscheduledGraph,
    commands: [
      userCommand(unscheduledGraph.id, 1, "place-inbox-event", {
        name: "journey.place_event",
        payload: {
          eventId: "inbox-event",
          position: { placement: "END", parentSectionEventId: "day" },
        },
      }),
    ],
  },
  {
    id: "08-replacement-retire-undo",
    purpose:
      "replacement creates a successor while move keeps identity and undo appends history",
    graph: replacementGraph,
    commands: [
      userCommand(replacementGraph.id, 2, "undo-replacement", {
        name: "journey.undo",
        payload: { steps: 1 },
      }),
    ],
  },
  {
    id: "09-exact-projection-modes",
    purpose:
      "Planner, Execution, and Travelogue share topology but select different facts",
    graph: projectionGraph,
    expectedProjections: projectionExpectations,
  },
  {
    id: "10-workspace-lifecycle",
    purpose:
      "owner, access, expiry, dirty, stale, conflict, fork, replay, and restart recovery",
    graph: workspaceGraph,
    workspace: workspaceDocument,
  },
  {
    id: "11-content-provenance",
    purpose:
      "Asset ownership, Observation supersession, and private Source Pack citation sharing",
    content: contentBundle,
  },
  {
    id: "12-coordinate-section-delete-history",
    purpose:
      "non-GCJ02 geometry round-trips and soft-deleted Journey keeps history",
    graph: nonGcjGraph,
  },
]
