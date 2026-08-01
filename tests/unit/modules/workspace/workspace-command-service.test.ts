import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"
import {
  transitPlanFingerprint,
  type TransitPlanRequest,
} from "@/lib/journeys/planning"
import type {
  TargetCommandEnvelope,
  TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { TARGET_CONTRACT_FIXTURES } from "@/modules/data-model/contracts"
import {
  createAsset,
  createSourceDocument,
  createSourceItem,
  createSourcePack,
  deleteAsset,
} from "@/modules/data/content/content-repository"
import { prisma } from "@/modules/data/db/prisma"
import {
  commitJourneyDomainGraph,
  commitJourneyGraph,
  createJourney,
  getJourney,
  getJourneyRevision,
} from "@/modules/data/journeys/journey-repository"
import { TransitPlanningService } from "@/modules/data/transit/transit-planning-service"
import {
  appendWorkspaceRevision,
  createWorkspace,
  finishWorkspaceAgentRun,
  startWorkspaceAgentRun,
  WorkspaceIdempotencyConflictError,
  WorkspaceInputError,
  WorkspaceRevisionConflictError,
} from "@/modules/data/workspaces/workspace-repository"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"

const ownerId = `workspace-command-owner-${randomUUID()}`
const otherOwnerId = `workspace-command-other-${randomUUID()}`
const context = { userId: ownerId, role: "user" as const }
const otherContext = { userId: otherOwnerId, role: "user" as const }
const now = "2026-08-01T00:00:00.000Z"

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ownerId,
        name: "Workspace command owner",
        email: `${ownerId}@periplus.local`,
        emailVerified: true,
      },
      {
        id: otherOwnerId,
        name: "Workspace command other",
        email: `${otherOwnerId}@periplus.local`,
        emailVerified: true,
      },
    ],
  })
})

function graph(id: string): TargetJourneyGraphSnapshot {
  const event = (eventId: string, title: string) => ({
    id: eventId,
    journeyId: id,
    parentSectionEventId: null,
    placementStatus: "SCHEDULED" as const,
    origin: "ORIGINAL" as const,
    title,
    introducedRevision: 1,
    createdAt: now,
    updatedAt: now,
    type: "VISIT" as const,
    executionStatus: "PLANNED" as const,
    detail: {
      plannedLat: 30.25,
      plannedLng: 120.15,
      coordinateSystem: "GCJ02" as const,
    },
  })
  return {
    id,
    ownerId,
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "Workspace",
    events: [
      event(`${id}-fork`, "Fork"),
      event(`${id}-a`, "A"),
      event(`${id}-b`, "B"),
      event(`${id}-join`, "Join"),
    ],
    links: [
      {
        id: `${id}-fork-a`,
        journeyId: id,
        fromEventId: `${id}-fork`,
        toEventId: `${id}-a`,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: `${id}-a-join`,
        journeyId: id,
        fromEventId: `${id}-a`,
        toEventId: `${id}-join`,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: `${id}-fork-b`,
        journeyId: id,
        fromEventId: `${id}-fork`,
        toEventId: `${id}-b`,
        kind: "ALTERNATIVE",
        branchKey: "rain",
        rank: 2048,
        introducedRevision: 1,
      },
      {
        id: `${id}-b-join`,
        journeyId: id,
        fromEventId: `${id}-b`,
        toEventId: `${id}-join`,
        kind: "ALTERNATIVE",
        branchKey: "rain",
        rank: 1024,
        introducedRevision: 1,
      },
    ],
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}

function command(
  workspaceId: string,
  expectedRevision: number,
  idempotencyKey: string,
  body: TargetCommandEnvelope["command"],
  actor: TargetCommandEnvelope["actor"] = {
    kind: "USER",
    userId: ownerId,
  }
): TargetCommandEnvelope {
  return {
    aggregateId: workspaceId,
    expectedRevision,
    idempotencyKey,
    actor,
    command: body,
  }
}

function nestedSectionGraph() {
  const fixture = TARGET_CONTRACT_FIXTURES.find(
    (candidate) => candidate.id === "02-city-day-event-drilldown"
  )!.cases.find((candidate) => candidate.id === "city-day-drilldown")!
  const input = structuredClone(fixture.input.graph!)
  input.ownerId = ownerId
  return input
}

function readyTransitFixtureGraph() {
  const fixture = TARGET_CONTRACT_FIXTURES.find(
    (candidate) => candidate.id === "03-transit-plan-choice"
  )!.cases.find((candidate) => candidate.id === "select-low-cost")!
  const input = structuredClone(fixture.input.graph!)
  input.ownerId = ownerId
  return input
}

function transitGraph(id: string): TargetJourneyGraphSnapshot {
  const result = graph(id)
  result.events = [
    result.events[1]!,
    {
      id: `${id}-transit`,
      journeyId: id,
      parentSectionEventId: null,
      placementStatus: "SCHEDULED",
      origin: "ORIGINAL",
      title: "交通",
      introducedRevision: 1,
      createdAt: now,
      updatedAt: now,
      type: "TRANSIT",
      executionStatus: "PLANNED",
      detail: {
        plannedFromEventId: `${id}-a`,
        plannedToEventId: `${id}-b`,
        transportMode: "CAR",
        requestMode: "DRIVE",
        preference: "RECOMMENDED",
        routeState: "EMPTY",
      },
    },
    result.events[2]!,
  ]
  result.links = [
    {
      id: `${id}-to-transit`,
      journeyId: id,
      fromEventId: `${id}-a`,
      toEventId: `${id}-transit`,
      kind: "MAIN",
      rank: 1024,
      introducedRevision: 1,
    },
    {
      id: `${id}-from-transit`,
      journeyId: id,
      fromEventId: `${id}-transit`,
      toEventId: `${id}-b`,
      kind: "MAIN",
      rank: 2048,
      introducedRevision: 1,
    },
  ]
  return result
}

function transitSectionGraph(id: string): TargetJourneyGraphSnapshot {
  const result = transitGraph(id)
  const sectionId = `${id}-section`
  for (const event of result.events) event.parentSectionEventId = sectionId
  result.events.unshift({
    id: sectionId,
    journeyId: id,
    parentSectionEventId: null,
    placementStatus: "SCHEDULED",
    origin: "ORIGINAL",
    title: "Transit day",
    introducedRevision: 1,
    createdAt: now,
    updatedAt: now,
    type: "SECTION",
    detail: {
      kind: "DAY",
      localDate: "2026-08-01",
      timezone: "Asia/Shanghai",
    },
  })
  return result
}

function sectionGraph(
  id: string,
  topology: "LINEAR" | "BRANCH"
): TargetJourneyGraphSnapshot {
  const result = graph(id)
  const sectionId = `${id}-section`
  const section = {
    id: sectionId,
    journeyId: id,
    parentSectionEventId: null,
    placementStatus: "SCHEDULED" as const,
    origin: "ORIGINAL" as const,
    title: "Day 1",
    introducedRevision: 1,
    createdAt: now,
    updatedAt: now,
    type: "SECTION" as const,
    detail: {
      kind: "DAY" as const,
      localDate: "2026-08-01",
      timezone: "Asia/Shanghai",
    },
  }
  for (const event of result.events) {
    event.parentSectionEventId = sectionId
  }
  if (topology === "LINEAR") {
    result.events = [section, result.events[1]!, result.events[2]!]
    result.links = [
      {
        id: `${id}-linear`,
        journeyId: id,
        fromEventId: `${id}-a`,
        toEventId: `${id}-b`,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
    ]
    return result
  }
  result.events.unshift(section)
  result.branchSelections.push({
    id: `${id}-selection-a`,
    journeyId: id,
    forkEventId: `${id}-fork`,
    selectedLinkId: `${id}-fork-a`,
    journeyRevision: 1,
    actor: { kind: "USER", userId: ownerId },
    createdAt: now,
  })
  return result
}

describe.sequential("P3 persistent Workspace command bus", () => {
  it("persists one revision, replays idempotently, and recovers after restart", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`workspace-restart-${randomUUID()}`),
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    const request = command(workspace.id, 0, "update-a", {
      name: "journey.update_event",
      payload: {
        eventId: `${workspace.headGraph.id}-a`,
        patch: { type: "VISIT", title: "A updated" },
      },
    })

    const first = await service.execute(context, request, {
      now: new Date("2026-08-01T00:01:00.000Z"),
    })
    const replay = await service.execute(context, request, {
      now: new Date("2026-08-01T00:02:00.000Z"),
    })
    expect(first).toMatchObject({
      newRevision: 1,
      replayedFromIdempotencyKey: false,
    })
    expect(replay).toMatchObject({
      newRevision: 1,
      replayedFromIdempotencyKey: true,
    })
    expect(
      await prisma.workspaceRevision.count({
        where: { workspaceId: workspace.id },
      })
    ).toBe(1)

    const restartedService = new WorkspaceCommandService()
    const recovered = await restartedService.getDocument(context, workspace.id)
    expect(
      recovered?.session.headGraph.events.find(
        (event) => event.id === `${workspace.headGraph.id}-a`
      )?.title
    ).toBe("A updated")

    await expect(
      service.execute(
        context,
        command(workspace.id, 1, "update-a", {
          name: "journey.update_event",
          payload: {
            eventId: `${workspace.headGraph.id}-a`,
            patch: { type: "VISIT", title: "different payload" },
          },
        })
      )
    ).rejects.toBeInstanceOf(WorkspaceIdempotencyConflictError)
  })

  it("rejects stale concurrent writers without a silent overwrite", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`workspace-concurrency-${randomUUID()}`),
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    const results = await Promise.allSettled([
      service.execute(
        context,
        command(workspace.id, 0, "concurrent-a", {
          name: "journey.update_event",
          payload: {
            eventId: `${workspace.headGraph.id}-a`,
            patch: { type: "VISIT", title: "writer A" },
          },
        })
      ),
      service.execute(
        context,
        command(workspace.id, 0, "concurrent-b", {
          name: "journey.update_event",
          payload: {
            eventId: `${workspace.headGraph.id}-b`,
            patch: { type: "VISIT", title: "writer B" },
          },
        })
      ),
    ])

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    const rejected = results.find((result) => result.status === "rejected")
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(WorkspaceRevisionConflictError),
    })
    expect(
      await prisma.workspaceRevision.count({
        where: { workspaceId: workspace.id },
      })
    ).toBe(1)
  })

  it("serializes simultaneous idempotency keys before side effects", async () => {
    const duplicateWorkspace = await createWorkspace(context, {
      graph: graph(`workspace-duplicate-key-${randomUUID()}`),
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    const duplicate = command(
      duplicateWorkspace.id,
      0,
      "simultaneous-same-key",
      {
        name: "journey.update_event",
        payload: {
          eventId: `${duplicateWorkspace.headGraph.id}-a`,
          patch: { type: "VISIT", title: "one result" },
        },
      }
    )
    const duplicateResults = await Promise.all([
      service.execute(context, duplicate),
      service.execute(context, duplicate),
    ])
    expect(duplicateResults.map((result) => result.newRevision)).toEqual([1, 1])
    expect(
      duplicateResults.map((result) => result.replayedFromIdempotencyKey)
    ).toEqual([false, true])
    expect(
      await prisma.workspaceRevision.count({
        where: { workspaceId: duplicateWorkspace.id },
      })
    ).toBe(1)

    const conflictWorkspace = await createWorkspace(context, {
      graph: graph(`workspace-conflicting-key-${randomUUID()}`),
      now: new Date(now),
    })
    const conflicting = await Promise.allSettled([
      service.execute(
        context,
        command(conflictWorkspace.id, 0, "simultaneous-conflict", {
          name: "journey.update_event",
          payload: {
            eventId: `${conflictWorkspace.headGraph.id}-a`,
            patch: { type: "VISIT", title: "payload A" },
          },
        })
      ),
      service.execute(
        context,
        command(conflictWorkspace.id, 0, "simultaneous-conflict", {
          name: "journey.update_event",
          payload: {
            eventId: `${conflictWorkspace.headGraph.id}-a`,
            patch: { type: "VISIT", title: "payload B" },
          },
        })
      ),
    ])
    expect(
      conflicting.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    expect(
      conflicting.find((result) => result.status === "rejected")
    ).toMatchObject({
      status: "rejected",
      reason: expect.any(WorkspaceIdempotencyConflictError),
    })
  })

  it("recursively retires every internal Link in linear and selected-branch SECTIONs", async () => {
    const service = new WorkspaceCommandService()
    for (const topology of ["LINEAR", "BRANCH"] as const) {
      const workspace = await createWorkspace(context, {
        graph: sectionGraph(
          `workspace-retire-${topology.toLowerCase()}-${randomUUID()}`,
          topology
        ),
        now: new Date(now),
      })
      await expect(
        service.execute(
          context,
          command(workspace.id, 0, `retire-${topology.toLowerCase()}`, {
            name: "journey.retire_event",
            payload: {
              eventId: `${workspace.headGraph.id}-section`,
              sectionChildren: "RECURSIVE_RETIRE",
            },
          })
        )
      ).resolves.toMatchObject({ newRevision: 1 })

      const recovered = await service.getDocument(context, workspace.id)
      expect(
        recovered?.session.headGraph.events.every(
          (event) => event.retiredRevision === 2
        )
      ).toBe(true)
      expect(
        recovered?.session.headGraph.links.every(
          (link) => link.retiredRevision === 2
        )
      ).toBe(true)
      if (topology === "BRANCH") {
        expect(recovered?.session.headGraph.branchSelections).toEqual(
          workspace.headGraph.branchSelections
        )
      }
    }
  })

  it("recursively retires a SECTION containing Transit without invalidating history", async () => {
    const input = transitSectionGraph(
      `workspace-retire-transit-section-${randomUUID()}`
    )
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })
    await new WorkspaceCommandService().execute(
      context,
      command(workspace.id, 0, "retire-transit-section", {
        name: "journey.retire_event",
        payload: {
          eventId: `${input.id}-section`,
          sectionChildren: "RECURSIVE_RETIRE",
        },
      })
    )
    const retired = await new WorkspaceCommandService().getDocument(
      context,
      workspace.id
    )
    expect(
      retired?.session.headGraph.events
        .filter((event) =>
          [
            `${input.id}-section`,
            `${input.id}-a`,
            `${input.id}-transit`,
            `${input.id}-b`,
          ].includes(event.id)
        )
        .every((event) => event.retiredRevision === 2)
    ).toBe(true)
    expect(
      retired?.session.headGraph.links.every(
        (link) => link.retiredRevision === 2
      )
    ).toBe(true)
  })

  it("rejects retiring an endpoint still referenced by an active external Transit", async () => {
    const workspace = await createWorkspace(context, {
      graph: transitGraph(`workspace-retire-transit-${randomUUID()}`),
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()

    await expect(
      service.execute(
        context,
        command(workspace.id, 0, "retire-transit-endpoint", {
          name: "journey.retire_event",
          payload: { eventId: `${workspace.headGraph.id}-a` },
        })
      )
    ).rejects.toThrow(
      `active Transit ${workspace.headGraph.id}-transit references endpoint ${workspace.headGraph.id}-a`
    )
    expect(
      await prisma.workspaceRevision.count({
        where: { workspaceId: workspace.id },
      })
    ).toBe(0)
  })

  it("atomically rewires Transit, SECTION-child, and fork-selection replacement dependencies", async () => {
    const service = new WorkspaceCommandService()

    const transitInput = transitGraph(
      `workspace-replace-transit-${randomUUID()}`
    )
    const transit = transitInput.events.find(
      (event) => event.id === `${transitInput.id}-transit`
    )!
    if (transit.type !== "TRANSIT") throw new Error("fixture invariant")
    transit.detail.actualFromEventId = `${transitInput.id}-a`
    transitInput.events.push({
      ...structuredClone(transit),
      id: `${transitInput.id}-retired-transit`,
      title: "Historical transit",
      retiredRevision: 1,
    })
    const transitWorkspace = await createWorkspace(context, {
      graph: transitInput,
      now: new Date(now),
    })
    await service.execute(
      context,
      command(transitWorkspace.id, 0, "replace-transit-endpoint", {
        name: "journey.replace_event",
        payload: {
          predecessorEventId: `${transitInput.id}-a`,
          successor: {
            id: `${transitInput.id}-a2`,
            type: "VISIT",
            title: "A2",
            detail: {
              plannedLat: 30.26,
              plannedLng: 120.16,
              coordinateSystem: "GCJ02",
            },
          },
          reason: "replace endpoint",
        },
      })
    )
    const replacedTransit = await service.getDocument(
      context,
      transitWorkspace.id
    )
    const transitAfter = replacedTransit?.session.headGraph.events.find(
      (event) => event.id === `${transitInput.id}-transit`
    )
    if (transitAfter?.type !== "TRANSIT") throw new Error("fixture invariant")
    expect(transitAfter.detail).toMatchObject({
      plannedFromEventId: `${transitInput.id}-a2`,
      actualFromEventId: `${transitInput.id}-a2`,
    })
    const historicalTransit = replacedTransit?.session.headGraph.events.find(
      (event) => event.id === `${transitInput.id}-retired-transit`
    )
    if (historicalTransit?.type !== "TRANSIT") {
      throw new Error("fixture invariant")
    }
    expect(historicalTransit).toMatchObject({
      retiredRevision: 1,
      detail: {
        plannedFromEventId: `${transitInput.id}-a`,
        actualFromEventId: `${transitInput.id}-a`,
      },
    })
    expect(
      replacedTransit?.session.headGraph.links.find(
        (link) => link.id === `${transitInput.id}-to-transit`
      )
    ).toMatchObject({ fromEventId: `${transitInput.id}-a2` })

    const readyTransitWorkspace = await createWorkspace(context, {
      graph: readyTransitFixtureGraph(),
      now: new Date(now),
    })
    await service.execute(
      context,
      command(readyTransitWorkspace.id, 0, "replace-ready-endpoint", {
        name: "journey.replace_event",
        payload: {
          predecessorEventId: "start",
          successor: {
            id: "start-replacement",
            type: "VISIT",
            title: "Start replacement",
            detail: {
              plannedLat: 30.3,
              plannedLng: 120.2,
              coordinateSystem: "GCJ02",
            },
          },
          reason: "replace READY route endpoint",
        },
      })
    )
    expect(
      (
        await service.getDocument(context, readyTransitWorkspace.id)
      )?.session.headGraph.events.find((event) => event.id === "transit")
    ).toMatchObject({
      detail: {
        plannedFromEventId: "start-replacement",
        routeState: "ROUTE_STALE",
      },
    })

    const sectionInput = sectionGraph(
      `workspace-replace-section-${randomUUID()}`,
      "LINEAR"
    )
    const sectionWorkspace = await createWorkspace(context, {
      graph: sectionInput,
      now: new Date(now),
    })
    await service.execute(
      context,
      command(sectionWorkspace.id, 0, "replace-section", {
        name: "journey.replace_event",
        payload: {
          predecessorEventId: `${sectionInput.id}-section`,
          successor: {
            id: `${sectionInput.id}-section-2`,
            type: "SECTION",
            title: "Day 1 revised",
            detail: {
              kind: "DAY",
              localDate: "2026-08-01",
              timezone: "Asia/Shanghai",
            },
          },
          reason: "replace section",
        },
      })
    )
    const replacedSection = await service.getDocument(
      context,
      sectionWorkspace.id
    )
    expect(
      replacedSection?.session.headGraph.events
        .filter((event) => event.id.endsWith("-a") || event.id.endsWith("-b"))
        .map((event) => event.parentSectionEventId)
    ).toEqual([`${sectionInput.id}-section-2`, `${sectionInput.id}-section-2`])

    const forkInput = graph(`workspace-replace-fork-${randomUUID()}`)
    forkInput.branchSelections.push({
      id: `${forkInput.id}-selection-a`,
      journeyId: forkInput.id,
      forkEventId: `${forkInput.id}-fork`,
      selectedLinkId: `${forkInput.id}-fork-a`,
      journeyRevision: 1,
      actor: { kind: "USER", userId: ownerId },
      createdAt: now,
    })
    const forkWorkspace = await createWorkspace(context, {
      graph: forkInput,
      now: new Date(now),
    })
    await service.execute(
      context,
      command(forkWorkspace.id, 0, "replace-fork", {
        name: "journey.replace_event",
        payload: {
          predecessorEventId: `${forkInput.id}-fork`,
          successor: {
            id: `${forkInput.id}-fork-2`,
            type: "VISIT",
            title: "Fork 2",
            detail: {
              plannedLat: 30.27,
              plannedLng: 120.17,
              coordinateSystem: "GCJ02",
            },
          },
          reason: "replace fork",
        },
      })
    )
    const replacedFork = await service.getDocument(context, forkWorkspace.id)
    const forkGraph = replacedFork!.session.headGraph
    expect(forkGraph.branchSelections).toHaveLength(2)
    const currentForkChoice = forkGraph.branchSelections.at(-1)!
    expect(currentForkChoice).toMatchObject({
      forkEventId: `${forkInput.id}-fork-2`,
    })
    expect(currentForkChoice).not.toHaveProperty("supersedesId")
    const selectedReplacementLink = forkGraph.links.find(
      (link) => link.id === currentForkChoice.selectedLinkId
    )!
    expect(selectedReplacementLink).toMatchObject({
      fromEventId: `${forkInput.id}-fork-2`,
    })
    expect(selectedReplacementLink).not.toHaveProperty("retiredRevision")
    expect(
      forkGraph.links
        .filter((link) =>
          [`${forkInput.id}-fork-a`, `${forkInput.id}-fork-b`].includes(link.id)
        )
        .every((link) => link.retiredRevision === 2)
    ).toBe(true)
  })

  it("merges partial actual confirmation without clearing prior facts", async () => {
    const input = graph(`workspace-confirm-partial-${randomUUID()}`)
    const event = input.events.find(
      (candidate) => candidate.id === `${input.id}-a`
    )!
    if (event.type !== "VISIT") throw new Error("fixture invariant")
    event.executionStatus = "STARTED"
    event.actualStartAt = "2026-08-01T01:00:00.000Z"
    event.detail.actualLat = 30.251
    event.detail.actualLng = 120.151
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })

    await new WorkspaceCommandService().execute(
      context,
      command(workspace.id, 0, "confirm-partial", {
        name: "journey.confirm_actual",
        payload: {
          eventId: `${input.id}-a`,
          actual: {
            type: "VISIT",
            actualEndAt: "2026-08-01T02:00:00.000Z",
            detail: { actualDurationMinutes: 60 },
          },
        },
      })
    )
    const recovered = await new WorkspaceCommandService().getDocument(
      context,
      workspace.id
    )
    expect(
      recovered?.session.headGraph.events.find(
        (candidate) => candidate.id === `${input.id}-a`
      )
    ).toMatchObject({
      executionStatus: "CONFIRMED",
      actualStartAt: "2026-08-01T01:00:00.000Z",
      actualEndAt: "2026-08-01T02:00:00.000Z",
      detail: {
        actualLat: 30.251,
        actualLng: 120.151,
        actualDurationMinutes: 60,
      },
    })
  })

  it("derives add/replace provenance and gates execution state transitions", async () => {
    const input = graph(`workspace-authority-${randomUUID()}`)
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    const createVisit = (id: string, title: string) => ({
      id,
      type: "VISIT" as const,
      title,
      detail: {
        plannedLat: 30.2,
        plannedLng: 120.1,
        coordinateSystem: "GCJ02" as const,
      },
    })
    await service.execute(
      context,
      command(workspace.id, 0, "user-add-authority", {
        name: "journey.add_event",
        payload: {
          event: createVisit("user-added", "user added"),
          position: { placement: "UNSCHEDULED" },
        },
      })
    )
    const run = await startWorkspaceAgentRun(
      context,
      workspace.id,
      new Date(now),
      `runtime-${randomUUID()}`
    )
    await service.execute(
      context,
      command(
        workspace.id,
        1,
        "agent-add-authority",
        {
          name: "journey.add_event",
          payload: {
            event: createVisit("agent-added", "agent added"),
            position: { placement: "UNSCHEDULED" },
          },
        },
        { kind: "AGENT", agentRunId: run!.id }
      )
    )
    await service.execute(
      context,
      command(workspace.id, 2, "user-add-cancel", {
        name: "journey.add_event",
        payload: {
          event: createVisit("cancel-added", "cancel added"),
          position: { placement: "UNSCHEDULED" },
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 3, "start-through-authority", {
        name: "journey.confirm_actual",
        payload: {
          eventId: "user-added",
          finalize: false,
          actual: {
            type: "VISIT",
            actualStartAt: "2026-08-01T01:00:00.000Z",
            detail: { actualLat: 30.21, actualLng: 120.11 },
          },
        },
      })
    )
    expect(
      (
        await service.getDocument(context, workspace.id)
      )?.session.headGraph.events.find((event) => event.id === "user-added")
    ).toMatchObject({ executionStatus: "STARTED" })
    await service.execute(
      context,
      command(workspace.id, 4, "confirm-through-authority", {
        name: "journey.confirm_actual",
        payload: {
          eventId: "user-added",
          actual: {
            type: "VISIT",
            actualEndAt: "2026-08-01T02:00:00.000Z",
            detail: {},
          },
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 5, "skip-through-authority", {
        name: "journey.skip_event",
        payload: { eventId: "agent-added" },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 6, "cancel-through-authority", {
        name: "journey.cancel_event",
        payload: { eventId: "cancel-added" },
      })
    )
    const recovered = await service.getDocument(context, workspace.id)
    expect(
      recovered?.session.headGraph.events
        .filter((event) =>
          ["user-added", "agent-added", "cancel-added"].includes(event.id)
        )
        .map((event) => ({
          id: event.id,
          origin: event.origin,
          executionStatus:
            event.type === "SECTION" || event.type === "NOTE"
              ? undefined
              : event.executionStatus,
        }))
    ).toEqual([
      {
        id: "user-added",
        origin: "USER_INSERTED",
        executionStatus: "CONFIRMED",
      },
      {
        id: "agent-added",
        origin: "AGENT_INSERTED",
        executionStatus: "SKIPPED",
      },
      {
        id: "cancel-added",
        origin: "USER_INSERTED",
        executionStatus: "CANCELLED",
      },
    ])
    await expect(
      service.execute(
        context,
        command(workspace.id, 7, "confirm-terminal-event", {
          name: "journey.confirm_actual",
          payload: {
            eventId: "agent-added",
            actual: { type: "VISIT", detail: {} },
          },
        })
      )
    ).rejects.toThrow("Cannot confirm Event from SKIPPED")
  })

  it("allows only a linear same-domain Observation supersession chain", async () => {
    const input = graph(`workspace-observation-chain-${randomUUID()}`)
    input.observations.push({
      id: `${input.id}-observation-0`,
      eventId: `${input.id}-a`,
      kind: "NOTE",
      phase: "ACTUAL",
      body: "O",
      observedAt: now,
      actor: { kind: "USER", userId: ownerId },
      visibility: "PRIVATE",
      createdAt: now,
    })
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    await service.execute(
      context,
      command(workspace.id, 0, "observation-1", {
        name: "journey.add_observation",
        payload: {
          eventId: `${input.id}-a`,
          observation: {
            kind: "NOTE",
            phase: "ACTUAL",
            body: "O1",
            supersedesId: `${input.id}-observation-0`,
            visibility: "PRIVATE",
          },
        },
      })
    )
    const afterFirst = await service.getDocument(context, workspace.id)
    const observation1 = afterFirst!.session.headGraph.observations.at(-1)!

    await expect(
      service.execute(
        context,
        command(workspace.id, 1, "observation-branch", {
          name: "journey.add_observation",
          payload: {
            eventId: `${input.id}-a`,
            observation: {
              kind: "NOTE",
              phase: "ACTUAL",
              body: "invalid branch",
              supersedesId: `${input.id}-observation-0`,
              visibility: "PRIVATE",
            },
          },
        })
      )
    ).rejects.toThrow("is not the current leaf")

    await service.execute(
      context,
      command(workspace.id, 1, "observation-2", {
        name: "journey.add_observation",
        payload: {
          eventId: `${input.id}-a`,
          observation: {
            kind: "NOTE",
            phase: "ACTUAL",
            body: "O2",
            supersedesId: observation1.id,
            visibility: "PRIVATE",
          },
        },
      })
    )
    const recovered = await service.getDocument(context, workspace.id)
    expect(recovered?.session.headGraph.observations).toHaveLength(3)
    expect(recovered?.session.headGraph.observations.at(-1)).toMatchObject({
      supersedesId: observation1.id,
      body: "O2",
    })
    expect(
      await prisma.workspaceRevision.count({
        where: { workspaceId: workspace.id },
      })
    ).toBe(2)
  })

  it("accepts only a running same-Workspace Agent actor", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`workspace-agent-${randomUUID()}`),
      now: new Date(now),
    })
    const otherWorkspace = await createWorkspace(context, {
      graph: graph(`workspace-agent-foreign-${randomUUID()}`),
      now: new Date(now),
    })
    const run = await startWorkspaceAgentRun(
      context,
      workspace.id,
      new Date(now)
    )
    await expect(
      startWorkspaceAgentRun(context, workspace.id, new Date(now))
    ).rejects.toBeInstanceOf(WorkspaceRevisionConflictError)
    const foreignRun = await startWorkspaceAgentRun(
      context,
      otherWorkspace.id,
      new Date(now)
    )
    const service = new WorkspaceCommandService()

    await expect(
      service.execute(
        context,
        command(
          workspace.id,
          0,
          "foreign-agent",
          {
            name: "journey.update_event",
            payload: {
              eventId: `${workspace.headGraph.id}-a`,
              patch: { type: "VISIT", title: "forged" },
            },
          },
          { kind: "AGENT", agentRunId: foreignRun!.id }
        )
      )
    ).rejects.toBeInstanceOf(WorkspaceInputError)

    await expect(
      service.execute(
        context,
        command(
          workspace.id,
          0,
          "same-agent",
          {
            name: "journey.select_branch",
            payload: {
              forkEventId: `${workspace.headGraph.id}-fork`,
              selectedLinkId: `${workspace.headGraph.id}-fork-b`,
              reason: "rain",
            },
          },
          { kind: "AGENT", agentRunId: run!.id }
        )
      )
    ).resolves.toMatchObject({ newRevision: 1 })

    await finishWorkspaceAgentRun(context, workspace.id, run!.id, {
      status: "SUCCEEDED",
    })
    await expect(
      service.execute(
        context,
        command(
          workspace.id,
          1,
          "terminal-agent",
          {
            name: "journey.update_event",
            payload: {
              eventId: `${workspace.headGraph.id}-a`,
              patch: { type: "VISIT", title: "too late" },
            },
          },
          { kind: "AGENT", agentRunId: run!.id }
        )
      )
    ).rejects.toBeInstanceOf(WorkspaceInputError)
  })

  it("undo appends a revision and restores the branch without erasing history", async () => {
    const workspace = await createWorkspace(context, {
      graph: graph(`workspace-undo-${randomUUID()}`),
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    await service.execute(
      context,
      command(workspace.id, 0, "select-b", {
        name: "journey.select_branch",
        payload: {
          forkEventId: `${workspace.headGraph.id}-fork`,
          selectedLinkId: `${workspace.headGraph.id}-fork-b`,
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 1, "select-a-again", {
        name: "journey.select_branch",
        payload: {
          forkEventId: `${workspace.headGraph.id}-fork`,
          selectedLinkId: `${workspace.headGraph.id}-fork-a`,
        },
      })
    )
    const undone = await service.execute(
      context,
      command(workspace.id, 2, "undo-select", {
        name: "journey.undo",
        payload: { steps: 1 },
      })
    )

    expect(undone).toMatchObject({ newRevision: 3 })
    const recovered = await new WorkspaceCommandService().getDocument(
      context,
      workspace.id
    )
    expect(recovered?.session.headWorkspaceRevision).toBe(3)
    expect(recovered?.draftState).toBe("DIRTY")
    expect(recovered?.session.headGraph.branchSelections).toHaveLength(3)
    expect(recovered?.session.headGraph.branchSelections.at(-1)).toMatchObject({
      selectedLinkId: `${workspace.headGraph.id}-fork-b`,
      supersedesId: recovered?.session.headGraph.branchSelections[1]?.id,
    })
    expect(
      await prisma.workspaceRevision.count({
        where: { workspaceId: workspace.id },
      })
    ).toBe(3)
  })

  it("uses append-only inverses for content retirement and rejects irreversible facts", async () => {
    const input = sectionGraph(
      `workspace-undo-content-${randomUUID()}`,
      "LINEAR"
    )
    const eventId = `${input.id}-a`
    input.eventAssetLinks.push({
      id: `${eventId}-asset-link`,
      journeyId: input.id,
      eventId,
      assetId: `${eventId}-asset`,
      assetChecksum: `${eventId}-checksum`,
      role: "GALLERY",
      rank: 0,
      visibility: "PRIVATE",
      introducedRevision: 1,
      createdAt: now,
    })
    input.eventSourceLinks.push({
      id: `${eventId}-source-link`,
      journeyId: input.id,
      eventId,
      sourceItemId: `${eventId}-source-item`,
      sourceDocumentId: `${eventId}-source-document`,
      sourceDocumentChecksum: `${eventId}-source-checksum`,
      role: "EVIDENCE",
      confidence: 0.9,
      rank: 0,
      approvedForJourneySharing: false,
      introducedRevision: 1,
      createdAt: now,
    })
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    await service.execute(
      context,
      command(workspace.id, 0, "retire-before-undo", {
        name: "journey.retire_event",
        payload: { eventId },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 1, "undo-retire", {
        name: "journey.undo",
        payload: { steps: 1 },
      })
    )
    const restored = await service.getDocument(context, workspace.id)
    expect(
      restored?.session.headGraph.events.find((event) => event.id === eventId)
        ?.retiredRevision
    ).toBeUndefined()
    expect(restored?.session.headGraph.eventAssetLinks).toMatchObject([
      { id: `${eventId}-asset-link`, retiredRevision: 2 },
      { introducedRevision: 3 },
    ])
    expect(
      restored?.session.headGraph.eventAssetLinks[1]?.retiredRevision
    ).toBeUndefined()
    expect(restored?.session.headGraph.eventSourceLinks).toMatchObject([
      { id: `${eventId}-source-link`, retiredRevision: 2 },
      { introducedRevision: 3 },
    ])
    expect(
      restored?.session.headGraph.eventSourceLinks[1]?.retiredRevision
    ).toBeUndefined()

    const observationWorkspace = await createWorkspace(context, {
      graph: graph(`workspace-undo-observation-${randomUUID()}`),
      now: new Date(now),
    })
    await service.execute(
      context,
      command(observationWorkspace.id, 0, "irreversible-observation", {
        name: "journey.add_observation",
        payload: {
          eventId: `${observationWorkspace.headGraph.id}-a`,
          observation: {
            kind: "NOTE",
            phase: "ACTUAL",
            visibility: "PRIVATE",
            body: "immutable fact",
          },
        },
      })
    )
    await expect(
      service.execute(
        context,
        command(observationWorkspace.id, 1, "undo-observation", {
          name: "journey.undo",
          payload: { steps: 1 },
        })
      )
    ).rejects.toThrow("irreversible journey.add_observation")
    expect(
      (await service.getDocument(context, observationWorkspace.id))?.session
        .headWorkspaceRevision
    ).toBe(1)
  })

  it("never undoes confirmed, skipped, or cancelled execution facts", async () => {
    const input = graph(`workspace-undo-terminal-${randomUUID()}`)
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    const terminalCommands = [
      {
        eventId: `${input.id}-a`,
        idempotencyKey: "terminal-confirm",
        command: {
          name: "journey.confirm_actual" as const,
          payload: {
            eventId: `${input.id}-a`,
            actual: {
              type: "VISIT" as const,
              actualStartAt: "2026-08-01T01:00:00.000Z",
              actualEndAt: "2026-08-01T02:00:00.000Z",
              detail: { actualLat: 30.251, actualLng: 120.151 },
            },
          },
        },
      },
      {
        eventId: `${input.id}-b`,
        idempotencyKey: "terminal-skip",
        command: {
          name: "journey.skip_event" as const,
          payload: { eventId: `${input.id}-b` },
        },
      },
      {
        eventId: `${input.id}-fork`,
        idempotencyKey: "terminal-cancel",
        command: {
          name: "journey.cancel_event" as const,
          payload: { eventId: `${input.id}-fork` },
        },
      },
    ]

    for (const [index, terminal] of terminalCommands.entries()) {
      await service.execute(
        context,
        command(workspace.id, index, terminal.idempotencyKey, terminal.command)
      )
      await expect(
        service.execute(
          context,
          command(workspace.id, index + 1, `undo-${terminal.idempotencyKey}`, {
            name: "journey.undo",
            payload: { steps: 1 },
          })
        )
      ).rejects.toThrow(`irreversible ${terminal.command.name}`)
    }

    const recovered = await service.getDocument(context, workspace.id)
    expect(recovered?.session.headWorkspaceRevision).toBe(3)
    expect(
      recovered?.session.headGraph.events
        .filter((event) =>
          terminalCommands.some((terminal) => terminal.eventId === event.id)
        )
        .map((event) => [
          event.id,
          event.type === "SECTION" || event.type === "NOTE"
            ? undefined
            : event.executionStatus,
        ])
    ).toEqual([
      [`${input.id}-fork`, "CANCELLED"],
      [`${input.id}-a`, "CONFIRMED"],
      [`${input.id}-b`, "SKIPPED"],
    ])
    expect(
      recovered?.session.headGraph.events.find(
        (event) => event.id === `${input.id}-a`
      )
    ).toMatchObject({
      actualStartAt: "2026-08-01T01:00:00.000Z",
      actualEndAt: "2026-08-01T02:00:00.000Z",
    })
  })

  it("commits retire-then-undo with append-only content relinks", async () => {
    const journeyId = `workspace-undo-commit-${randomUUID()}`
    const base = await createJourney(context, {
      graph: sectionGraph(journeyId, "LINEAR"),
      operation: "create undo commit Journey",
      patch: [],
      inversePatch: [],
      idempotencyKey: `${journeyId}-create`,
    })
    const eventId = `${journeyId}-a`
    const asset = await createAsset(context, {
      kind: "IMAGE",
      storageKey: `workspace-undo-commit/${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 32,
      checksum: `workspace-undo-commit-${randomUUID()}`,
    })
    const sourceAsset = await createAsset(context, {
      kind: "FILE",
      storageKey: `workspace-undo-commit/${randomUUID()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 32,
      checksum: `workspace-undo-commit-source-${randomUUID()}`,
    })
    const pack = await createSourcePack(context, {
      title: "Undo commit source",
      visibility: "PRIVATE",
    })
    const sourceDocument = await createSourceDocument(context, {
      sourcePackId: pack.id,
      assetId: sourceAsset.id,
      title: "Undo commit document",
    })
    const sourceItem = await createSourceItem(context, {
      sourceDocumentId: sourceDocument.id,
      kind: "NOTE",
      title: "Undo commit item",
      sourceOrder: 0,
      confidence: 0.9,
    })
    const content = structuredClone(base)
    content.revision = 2
    content.eventAssetLinks.push({
      id: `${eventId}-asset-link`,
      journeyId,
      eventId,
      assetId: asset.id,
      assetChecksum: asset.checksum,
      role: "GALLERY",
      rank: 0,
      visibility: "PRIVATE",
      introducedRevision: 2,
      createdAt: now,
    })
    content.eventSourceLinks.push({
      id: `${eventId}-source-link`,
      journeyId,
      eventId,
      sourceItemId: sourceItem.id,
      sourceDocumentId: sourceDocument.id,
      sourceDocumentChecksum: sourceDocument.checksum,
      role: "EVIDENCE",
      confidence: 0.9,
      rank: 0,
      approvedForJourneySharing: false,
      introducedRevision: 2,
      createdAt: now,
    })
    const withContent = await commitJourneyDomainGraph(
      context,
      journeyId,
      {
        graph: content,
        operation: "seed undo content",
        patch: [],
        inversePatch: [],
        idempotencyKey: `${journeyId}-content`,
      },
      1,
      "CONTENT"
    )
    const workspace = await createWorkspace(context, {
      graph: withContent!,
      sourceJourneyId: journeyId,
      baseJourneyRevision: 2,
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    await service.execute(
      context,
      command(workspace.id, 0, "undo-commit-retire", {
        name: "journey.retire_event",
        payload: { eventId },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 1, "undo-commit-restore", {
        name: "journey.undo",
        payload: { steps: 1 },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 2, "undo-commit", {
        name: "workspace.commit",
        payload: { expectedJourneyRevision: 2 },
      })
    )

    const committed = await getJourney(context, journeyId)
    expect(committed).toMatchObject({ revision: 4 })
    expect(
      committed?.events.find((event) => event.id === eventId)?.retiredRevision
    ).toBeUndefined()
    expect(committed?.eventAssetLinks).toMatchObject([
      { id: `${eventId}-asset-link`, retiredRevision: 3 },
      { introducedRevision: 4 },
    ])
    expect(committed?.eventAssetLinks[1]?.retiredRevision).toBeUndefined()
    expect(committed?.eventSourceLinks).toMatchObject([
      { id: `${eventId}-source-link`, retiredRevision: 3 },
      { introducedRevision: 4 },
    ])
    expect(committed?.eventSourceLinks[1]?.retiredRevision).toBeUndefined()
  })

  it("blocks stale source writes while allowing lifecycle recovery commands", async () => {
    const journeyId = `workspace-stale-write-${randomUUID()}`
    const base = await createJourney(context, {
      graph: graph(journeyId),
      operation: "create stale-write Journey",
      patch: [],
      inversePatch: [],
      idempotencyKey: `${journeyId}-create`,
    })
    const workspace = await createWorkspace(context, {
      graph: base,
      sourceJourneyId: journeyId,
      baseJourneyRevision: 1,
      now: new Date(now),
    })
    const canonical = structuredClone(base)
    canonical.revision = 2
    canonical.title = "Canonical revision 2"
    await commitJourneyGraph(
      context,
      journeyId,
      {
        graph: canonical,
        operation: "advance canonical Journey",
        patch: [],
        inversePatch: [],
        idempotencyKey: `${journeyId}-advance`,
      },
      1
    )
    const service = new WorkspaceCommandService()
    expect((await service.getDocument(context, workspace.id))?.draftState).toBe(
      "STALE"
    )

    await expect(
      service.execute(
        context,
        command(workspace.id, 0, "stale-update", {
          name: "journey.update_event",
          payload: {
            eventId: `${journeyId}-a`,
            patch: { type: "VISIT", title: "must not persist" },
          },
        })
      )
    ).rejects.toThrow("refresh, fork, or replay")
    await expect(
      service.execute(
        context,
        command(workspace.id, 0, "stale-commit", {
          name: "workspace.commit",
          payload: { expectedJourneyRevision: 2 },
        })
      )
    ).rejects.toThrow("refresh, fork, or replay")
    await expect(
      appendWorkspaceRevision(context, workspace.id, {
        expectedRevision: 0,
        commandName: "journey.update_event",
        after: { ...base, title: "repository bypass" },
        patch: [],
        inversePatch: [],
        idempotencyKey: "stale-repository-bypass",
        now: new Date(now),
      })
    ).rejects.toThrow("refresh, fork, or replay")
    expect(
      await prisma.workspaceRevision.count({
        where: { workspaceId: workspace.id },
      })
    ).toBe(0)

    await expect(
      service.execute(
        context,
        command(workspace.id, 0, "stale-fork", {
          name: "workspace.fork",
          payload: { fromWorkspaceRevision: 0 },
        })
      )
    ).resolves.toMatchObject({ outcome: { type: "workspace.forked" } })
    await expect(
      service.execute(
        context,
        command(workspace.id, 1, "stale-refresh", {
          name: "workspace.refresh",
          payload: { fromWorkspaceRevision: 0 },
        })
      )
    ).resolves.toMatchObject({
      outcome: { type: "workspace.refreshed", baseJourneyRevision: 2 },
    })
  })

  it("invalidates projection scopes for branch-selection-only and Link-only refreshes", async () => {
    const journeyId = `workspace-refresh-topology-${randomUUID()}`
    const initial = graph(journeyId)
    initial.branchSelections.push({
      id: `${journeyId}-selection-main`,
      journeyId,
      forkEventId: `${journeyId}-fork`,
      selectedLinkId: `${journeyId}-fork-a`,
      journeyRevision: 1,
      actor: { kind: "USER", userId: ownerId },
      createdAt: now,
    })
    const base = await createJourney(context, {
      graph: initial,
      operation: "create topology refresh Journey",
      patch: [],
      inversePatch: [],
      idempotencyKey: `${journeyId}-create`,
    })
    const branchWorkspace = await createWorkspace(context, {
      graph: base,
      sourceJourneyId: journeyId,
      baseJourneyRevision: 1,
      now: new Date(now),
    })
    const branchHead = structuredClone(base)
    branchHead.revision = 2
    branchHead.branchSelections.push({
      id: `${journeyId}-selection-alternative`,
      journeyId,
      forkEventId: `${journeyId}-fork`,
      selectedLinkId: `${journeyId}-fork-b`,
      journeyRevision: 2,
      supersedesId: `${journeyId}-selection-main`,
      actor: { kind: "USER", userId: ownerId },
      createdAt: "2026-08-01T00:01:00.000Z",
    })
    const canonical2 = await commitJourneyGraph(
      context,
      journeyId,
      {
        graph: branchHead,
        operation: "select alternate branch",
        patch: [],
        inversePatch: [],
        idempotencyKey: `${journeyId}-branch`,
      },
      1
    )
    const service = new WorkspaceCommandService()
    await expect(
      service.execute(
        context,
        command(branchWorkspace.id, 0, "refresh-branch-only", {
          name: "workspace.refresh",
          payload: { fromWorkspaceRevision: 0 },
        })
      )
    ).resolves.toMatchObject({
      changedEventIds: expect.arrayContaining([`${journeyId}-fork`]),
      projectionInvalidationScopes: [null],
    })

    const linkWorkspace = await createWorkspace(context, {
      graph: canonical2!,
      sourceJourneyId: journeyId,
      baseJourneyRevision: 2,
      now: new Date(now),
    })
    const linkHead = structuredClone(canonical2!)
    linkHead.revision = 3
    linkHead.links.find((link) => link.id === `${journeyId}-fork-b`)!.rank =
      4096
    await commitJourneyGraph(
      context,
      journeyId,
      {
        graph: linkHead,
        operation: "change Link rank only",
        patch: [],
        inversePatch: [],
        idempotencyKey: `${journeyId}-link`,
      },
      2
    )
    await expect(
      service.execute(
        context,
        command(linkWorkspace.id, 0, "refresh-link-only", {
          name: "workspace.refresh",
          payload: { fromWorkspaceRevision: 0 },
        })
      )
    ).resolves.toMatchObject({
      changedEventIds: expect.arrayContaining([
        `${journeyId}-fork`,
        `${journeyId}-b`,
      ]),
      projectionInvalidationScopes: [null],
    })
  })

  it("reports cross-service idempotency replay for commands and lifecycle writes", async () => {
    const concurrent = async (
      request: TargetCommandEnvelope,
      options?: { now?: Date }
    ) => {
      const results = await Promise.all([
        new WorkspaceCommandService().execute(context, request, options),
        new WorkspaceCommandService().execute(context, request, options),
      ])
      expect(results.map((result) => result.newRevision)).toEqual([
        results[0]!.newRevision,
        results[0]!.newRevision,
      ])
      expect(
        results.map((result) => result.replayedFromIdempotencyKey).sort()
      ).toEqual([false, true])
      return results[0]!
    }

    const commandWorkspace = await createWorkspace(context, {
      graph: graph(`workspace-cross-service-command-${randomUUID()}`),
      now: new Date(now),
    })
    await concurrent(
      command(commandWorkspace.id, 0, "cross-service-command", {
        name: "journey.update_event",
        payload: {
          eventId: `${commandWorkspace.headGraph.id}-a`,
          patch: { type: "VISIT", title: "cross-service" },
        },
      })
    )

    const forkWorkspace = await createWorkspace(context, {
      graph: graph(`workspace-cross-service-fork-${randomUUID()}`),
      now: new Date(now),
    })
    await concurrent(
      command(forkWorkspace.id, 0, "cross-service-fork", {
        name: "workspace.fork",
        payload: { fromWorkspaceRevision: 0 },
      })
    )

    const scratch = await createWorkspace(context, {
      graph: transitGraph(`workspace-cross-service-commit-${randomUUID()}`),
      now: new Date(now),
    })
    await new WorkspaceCommandService().execute(
      context,
      command(scratch.id, 0, "cross-service-commit-edit", {
        name: "journey.update_event",
        payload: {
          eventId: `${scratch.headGraph.id}-a`,
          patch: { type: "VISIT", title: "commit me" },
        },
      })
    )
    await concurrent(
      command(scratch.id, 1, "cross-service-commit", {
        name: "workspace.commit",
        payload: { expectedJourneyRevision: null },
      })
    )

    const refreshJourneyId = `workspace-cross-service-refresh-${randomUUID()}`
    const refreshBase = await createJourney(context, {
      graph: graph(refreshJourneyId),
      operation: "create concurrent refresh Journey",
      patch: [],
      inversePatch: [],
      idempotencyKey: `${refreshJourneyId}-create`,
    })
    const refreshWorkspace = await createWorkspace(context, {
      graph: refreshBase,
      sourceJourneyId: refreshJourneyId,
      baseJourneyRevision: 1,
      now: new Date(now),
    })
    const refreshHead = structuredClone(refreshBase)
    refreshHead.revision = 2
    refreshHead.title = "Concurrent refresh head"
    await commitJourneyGraph(
      context,
      refreshJourneyId,
      {
        graph: refreshHead,
        operation: "advance concurrent refresh Journey",
        patch: [],
        inversePatch: [],
        idempotencyKey: `${refreshJourneyId}-advance`,
      },
      1
    )
    await concurrent(
      command(refreshWorkspace.id, 0, "cross-service-refresh", {
        name: "workspace.refresh",
        payload: { fromWorkspaceRevision: 0 },
      })
    )
  })

  it("aligns Workspace head bytes with the canonical graph after commit", async () => {
    const input = transitGraph(`workspace-canonical-commit-${randomUUID()}`)
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    await service.execute(
      context,
      command(workspace.id, 0, "canonical-commit-edit", {
        name: "journey.update_event",
        payload: {
          eventId: `${input.id}-a`,
          patch: { type: "VISIT", title: "Canonical A" },
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 1, "canonical-commit", {
        name: "workspace.commit",
        payload: { expectedJourneyRevision: null },
      })
    )

    const [document, canonical] = await Promise.all([
      service.getDocument(context, workspace.id),
      getJourney(context, input.id),
    ])
    expect(document?.draftState).toBe("CLEAN")
    expect(document?.session.headGraph).toEqual(canonical)
    expect(JSON.stringify(document?.session.headGraph)).toBe(
      JSON.stringify(canonical)
    )
  })

  it("atomically expires the Workspace and active Agent when TTL lapses during a provider call", async () => {
    const input = transitGraph(`workspace-provider-expiry-${randomUUID()}`)
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })
    const run = await startWorkspaceAgentRun(
      context,
      workspace.id,
      new Date(now),
      `runtime-${randomUUID()}`
    )
    const plan = vi.fn(async (request: TransitPlanRequest) => {
      await prisma.workspaceSession.update({
        where: { id: workspace.id },
        data: { expiresAt: new Date("2026-08-01T00:01:00.000Z") },
      })
      return {
        transitEventId: request.transitEventId,
        requestFingerprint: transitPlanFingerprint(request),
        plans: [
          {
            id: "provider-expiry-plan",
            provider: "mock" as const,
            rank: 0,
            label: "推荐",
            strategy: "recommended",
            distanceMeters: 1_000,
            durationSeconds: 300,
            trafficBasis: "TYPICAL" as const,
            calculatedAt: now,
            requestFingerprint: transitPlanFingerprint(request),
            segments: [],
          },
        ],
      }
    })
    const service = new WorkspaceCommandService({
      transitPlanning: { plan },
    })
    await expect(
      service.execute(
        context,
        command(
          workspace.id,
          0,
          "provider-expiry-command",
          {
            name: "journey.plan_transit",
            payload: {
              eventId: `${input.id}-transit`,
              forceRefresh: false,
            },
          },
          { kind: "AGENT", agentRunId: run!.id }
        ),
        { now: new Date("2026-08-01T00:02:00.000Z") }
      )
    ).rejects.toThrow("Workspace is not active")
    await expect(
      prisma.workspaceSession.findUniqueOrThrow({
        where: { id: workspace.id },
      })
    ).resolves.toMatchObject({ status: "EXPIRED" })
    await expect(
      prisma.workspaceAgentRun.findUniqueOrThrow({ where: { id: run!.id } })
    ).resolves.toMatchObject({
      status: "FAILED",
      errorCode: "WORKSPACE_EXPIRED",
      completedAt: expect.any(Date),
      leaseExpiresAt: null,
    })
    expect(
      await prisma.workspaceRevision.count({
        where: { workspaceId: workspace.id },
      })
    ).toBe(0)
  })

  it("persists malformed provider bundles as failed Transit facts", async () => {
    const workspace = await createWorkspace(context, {
      graph: readyTransitFixtureGraph(),
      now: new Date(now),
    })
    const service = new WorkspaceCommandService({
      transitPlanning: {
        plan: vi.fn(async (request: TransitPlanRequest) => ({
          transitEventId: request.transitEventId,
          requestFingerprint: transitPlanFingerprint(request),
          plans: [],
        })),
      },
    })
    await expect(
      service.execute(
        context,
        command(workspace.id, 0, "malformed-provider-bundle", {
          name: "journey.plan_transit",
          payload: { eventId: "transit", forceRefresh: true },
        })
      )
    ).resolves.toMatchObject({ newRevision: 1 })
    const document = await service.getDocument(context, workspace.id)
    expect(
      document?.session.headGraph.transitPlanningRuns.at(-1)
    ).toMatchObject({
      status: "FAILED",
      errorCode: "MALFORMED_RESPONSE",
      errorMessage: expect.stringContaining(
        "READY planning run requires at least one plan"
      ),
      plans: [],
    })
    expect(
      document?.session.headGraph.events.find((event) => event.id === "transit")
    ).toMatchObject({ detail: { routeState: "ROUTE_STALE" } })

    const duplicateRankInput = transitGraph(
      `workspace-duplicate-provider-rank-${randomUUID()}`
    )
    const duplicateRankWorkspace = await createWorkspace(context, {
      graph: duplicateRankInput,
      now: new Date(now),
    })
    const duplicateRankService = new WorkspaceCommandService({
      transitPlanning: {
        plan: vi.fn(async (request: TransitPlanRequest) => ({
          transitEventId: request.transitEventId,
          requestFingerprint: transitPlanFingerprint(request),
          plans: [0, 1].map((index) => ({
            id: `duplicate-rank-${index}`,
            provider: "mock" as const,
            rank: 0,
            label: `Plan ${index}`,
            strategy: "recommended",
            distanceMeters: 1_000 + index,
            durationSeconds: 300 + index,
            trafficBasis: "TYPICAL" as const,
            calculatedAt: now,
            requestFingerprint: transitPlanFingerprint(request),
            segments: [],
          })),
        })),
      },
    })
    await duplicateRankService.execute(
      context,
      command(duplicateRankWorkspace.id, 0, "duplicate-provider-rank", {
        name: "journey.plan_transit",
        payload: {
          eventId: `${duplicateRankInput.id}-transit`,
          forceRefresh: true,
        },
      })
    )
    expect(
      (
        await duplicateRankService.getDocument(
          context,
          duplicateRankWorkspace.id
        )
      )?.session.headGraph.transitPlanningRuns.at(-1)
    ).toMatchObject({
      status: "FAILED",
      errorCode: "MALFORMED_RESPONSE",
      errorMessage: expect.stringContaining(
        "plan rank must be unique within a planning run"
      ),
    })
    await expect(
      duplicateRankService.execute(
        context,
        command(duplicateRankWorkspace.id, 1, "commit-duplicate-rank", {
          name: "workspace.commit",
          payload: { expectedJourneyRevision: null },
        })
      )
    ).resolves.toMatchObject({ outcome: { type: "workspace.committed" } })
  })

  it("forks, replays, and atomically commits a CORE-TRANSIT-CONTENT-undo chain", async () => {
    const journeyId = `workspace-lifecycle-${randomUUID()}`
    const base = await createJourney(context, {
      graph: transitGraph(journeyId),
      operation: "create lifecycle Journey",
      patch: [],
      inversePatch: [],
      idempotencyKey: `${journeyId}-create`,
    })
    const workspace = await createWorkspace(context, {
      graph: base,
      sourceJourneyId: journeyId,
      baseJourneyRevision: 1,
      now: new Date(now),
    })
    const asset = await createAsset(context, {
      kind: "IMAGE",
      storageKey: `workspace-lifecycle/${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 32,
      checksum: `workspace-lifecycle-${randomUUID()}`,
    })
    const plan = vi.fn(async (request: TransitPlanRequest) => ({
      transitEventId: request.transitEventId,
      requestFingerprint: transitPlanFingerprint(request),
      plans: [
        {
          id: "lifecycle-plan",
          provider: "mock" as const,
          rank: 0,
          label: "推荐",
          strategy: "recommended",
          distanceMeters: 2_000,
          durationSeconds: 600,
          trafficBasis: "TYPICAL" as const,
          calculatedAt: now,
          requestFingerprint: transitPlanFingerprint(request),
          segments: [],
        },
      ],
    }))
    const service = new WorkspaceCommandService({
      transitPlanning: new TransitPlanningService({ provider: { plan } }),
    })
    await service.execute(
      context,
      command(workspace.id, 0, "lifecycle-core", {
        name: "journey.update_event",
        payload: {
          eventId: `${journeyId}-a`,
          patch: { type: "VISIT", title: "A lifecycle" },
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 1, "lifecycle-transit", {
        name: "journey.plan_transit",
        payload: { eventId: `${journeyId}-transit`, forceRefresh: false },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 2, "lifecycle-content", {
        name: "journey.attach_asset",
        payload: {
          eventId: `${journeyId}-b`,
          assetId: asset.id,
          role: "GALLERY",
          visibility: "PRIVATE",
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 3, "lifecycle-undo-content", {
        name: "journey.undo",
        payload: { steps: 1 },
      })
    )
    const originalGraph = structuredClone(
      (await service.getDocument(context, workspace.id))!.session.headGraph
    )

    const forkRequest = command(workspace.id, 4, "lifecycle-fork-mid", {
      name: "workspace.fork",
      payload: { fromWorkspaceRevision: 2 },
    })
    const [forked, forkReplay] = await Promise.all([
      service.execute(context, forkRequest),
      service.execute(context, forkRequest),
    ])
    expect(forked.outcome).toMatchObject({
      type: "workspace.forked",
      sourceWorkspaceRevision: 2,
      headWorkspaceRevision: 2,
    })
    expect(forkReplay).toMatchObject({
      outcome: forked.outcome,
      replayedFromIdempotencyKey: true,
    })
    const midWorkspaceId = (forked.outcome as { workspaceId: string })
      .workspaceId

    const replayed = await service.execute(
      context,
      command(workspace.id, 5, "lifecycle-replay", {
        name: "workspace.replay",
        payload: { fromWorkspaceRevision: 0 },
      })
    )
    expect(replayed.outcome).toMatchObject({
      type: "workspace.replayed",
      fromWorkspaceRevision: 0,
      throughWorkspaceRevision: 5,
      headWorkspaceRevision: 6,
    })
    const fullFork = await service.execute(
      context,
      command(workspace.id, 6, "lifecycle-fork-full", {
        name: "workspace.fork",
        payload: { fromWorkspaceRevision: 6 },
      })
    )
    const fullWorkspaceId = (fullFork.outcome as { workspaceId: string })
      .workspaceId
    expect(
      (await service.getDocument(context, midWorkspaceId))?.session
        .headWorkspaceRevision
    ).toBe(2)
    expect(
      (await service.getDocument(context, fullWorkspaceId))?.session
        .headWorkspaceRevision
    ).toBe(4)

    const midCommitRequest = command(
      midWorkspaceId,
      2,
      "lifecycle-commit-mid",
      {
        name: "workspace.commit",
        payload: { expectedJourneyRevision: 1 },
      }
    )
    const [midCommit, midCommitReplay] = await Promise.all([
      service.execute(context, midCommitRequest),
      service.execute(context, midCommitRequest),
    ])
    expect(midCommit.outcome).toMatchObject({
      type: "workspace.committed",
      committedJourneyRevision: 3,
    })
    expect(midCommitReplay).toMatchObject({
      outcome: midCommit.outcome,
      replayedFromIdempotencyKey: true,
    })
    const refreshedFull = await service.execute(
      context,
      command(fullWorkspaceId, 4, "lifecycle-refresh-full", {
        name: "workspace.refresh",
        payload: { fromWorkspaceRevision: 0 },
      })
    )
    const fullCommit = await service.execute(
      context,
      command(
        fullWorkspaceId,
        refreshedFull.newRevision,
        "lifecycle-commit-full",
        {
          name: "workspace.commit",
          payload: { expectedJourneyRevision: 3 },
        }
      )
    )
    expect(fullCommit.outcome).toMatchObject({
      type: "workspace.committed",
      committedJourneyRevision: 5,
    })

    const canonical = await getJourney(context, journeyId)
    expect(canonical).toMatchObject({
      revision: 5,
      events: expect.arrayContaining([
        expect.objectContaining({ id: `${journeyId}-a`, title: "A lifecycle" }),
      ]),
      transitPlanningRuns: [expect.objectContaining({ status: "READY" })],
      eventAssetLinks: [expect.objectContaining({ retiredRevision: 5 })],
    })
    for (const revisionNumber of [2, 3, 4, 5]) {
      expect(
        (await getJourneyRevision(context, journeyId, revisionNumber))
          ?.workspaceRevisionId
      ).toEqual(expect.any(String))
    }
    expect(plan).toHaveBeenCalledOnce()
    expect(
      (await service.getDocument(context, workspace.id))?.session.headGraph
    ).toEqual(originalGraph)
  })

  it("refreshes clean and non-conflicting dirty bases, rejects conflicts, and creates a scratch Journey", async () => {
    const journeyId = `workspace-refresh-${randomUUID()}`
    const base = await createJourney(context, {
      graph: graph(journeyId),
      operation: "create refresh Journey",
      patch: [],
      inversePatch: [],
      idempotencyKey: `${journeyId}-create`,
    })
    const [cleanWorkspace, dirtyWorkspace, conflictWorkspace] =
      await Promise.all([
        createWorkspace(context, {
          graph: base,
          sourceJourneyId: journeyId,
          baseJourneyRevision: 1,
          now: new Date(now),
        }),
        createWorkspace(context, {
          graph: base,
          sourceJourneyId: journeyId,
          baseJourneyRevision: 1,
          now: new Date(now),
        }),
        createWorkspace(context, {
          graph: base,
          sourceJourneyId: journeyId,
          baseJourneyRevision: 1,
          now: new Date(now),
        }),
      ])
    const service = new WorkspaceCommandService()
    await service.execute(
      context,
      command(dirtyWorkspace.id, 0, "dirty-before-refresh", {
        name: "journey.update_event",
        payload: {
          eventId: `${journeyId}-a`,
          patch: { type: "VISIT", title: "dirty local title" },
        },
      })
    )
    await service.execute(
      context,
      command(conflictWorkspace.id, 0, "conflict-before-refresh", {
        name: "journey.update_event",
        payload: {
          eventId: `${journeyId}-b`,
          patch: { type: "VISIT", title: "conflicting local title" },
        },
      })
    )
    const canonical = structuredClone(base)
    canonical.revision = 2
    const canonicalEvent = canonical.events.find(
      (event) => event.id === `${journeyId}-b`
    )!
    canonicalEvent.title = "canonical refreshed title"
    canonicalEvent.updatedAt = "2026-08-01T00:01:00.000Z"
    await commitJourneyGraph(
      context,
      journeyId,
      {
        graph: canonical,
        operation: "canonical refresh change",
        patch: [],
        inversePatch: [],
        idempotencyKey: `${journeyId}-canonical-refresh`,
      },
      1
    )

    const refreshRequest = command(cleanWorkspace.id, 0, "refresh-clean", {
      name: "workspace.refresh",
      payload: { fromWorkspaceRevision: 0 },
    })
    const refreshed = await service.execute(context, refreshRequest)
    expect(refreshed.outcome).toMatchObject({
      type: "workspace.refreshed",
      sourceJourneyId: journeyId,
      baseJourneyRevision: 2,
      headWorkspaceRevision: 1,
    })
    expect(await service.execute(context, refreshRequest)).toMatchObject({
      outcome: refreshed.outcome,
      replayedFromIdempotencyKey: true,
    })
    expect(
      (await service.getDocument(context, cleanWorkspace.id))?.session
    ).toMatchObject({
      baseJourneyRevision: 2,
      headGraph: {
        revision: 2,
        events: expect.arrayContaining([
          expect.objectContaining({
            id: `${journeyId}-b`,
            title: "canonical refreshed title",
          }),
        ]),
      },
    })
    const dirtyRefresh = await service.execute(
      context,
      command(dirtyWorkspace.id, 1, "refresh-dirty-stale", {
        name: "workspace.refresh",
        payload: { fromWorkspaceRevision: 0 },
      })
    )
    expect(dirtyRefresh.outcome).toMatchObject({
      type: "workspace.refreshed",
      baseJourneyRevision: 2,
      headWorkspaceRevision: 4,
    })
    expect(
      (await service.getDocument(context, dirtyWorkspace.id))?.session.headGraph
        .events
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${journeyId}-a`,
          title: "dirty local title",
        }),
        expect.objectContaining({
          id: `${journeyId}-b`,
          title: "canonical refreshed title",
        }),
      ])
    )
    const rebasedCommit = await service.execute(
      context,
      command(dirtyWorkspace.id, 4, "commit-dirty-refresh", {
        name: "workspace.commit",
        payload: { expectedJourneyRevision: 2 },
      })
    )
    expect(rebasedCommit.outcome).toMatchObject({
      type: "workspace.committed",
      fromWorkspaceRevision: 3,
      throughWorkspaceRevision: 3,
      committedJourneyRevision: 3,
    })
    expect(await getJourney(context, journeyId)).toMatchObject({
      revision: 3,
      events: expect.arrayContaining([
        expect.objectContaining({
          id: `${journeyId}-a`,
          title: "dirty local title",
        }),
        expect.objectContaining({
          id: `${journeyId}-b`,
          title: "canonical refreshed title",
        }),
      ]),
    })
    await expect(
      appendWorkspaceRevision(context, cleanWorkspace.id, {
        expectedRevision: 1,
        commandName: "workspace.refresh",
        after: canonical,
        patch: [{ op: "stale-refresh-probe" }],
        inversePatch: [],
        idempotencyKey: "stale-refresh-probe",
        actor: { kind: "USER", userId: ownerId },
        baseJourneyRevision: 2,
        now: new Date(now),
      })
    ).rejects.toThrow(
      "Workspace refresh base is no longer the canonical Journey head"
    )
    const historicalFork = await service.execute(
      context,
      command(dirtyWorkspace.id, 5, "fork-dirty-refresh-history", {
        name: "workspace.fork",
        payload: { fromWorkspaceRevision: 4 },
      })
    )
    expect(historicalFork.outcome).toMatchObject({
      type: "workspace.forked",
      sourceWorkspaceRevision: 4,
      headWorkspaceRevision: 1,
    })
    const historicalForkId = (historicalFork.outcome as { workspaceId: string })
      .workspaceId
    expect(
      (await service.getDocument(context, historicalForkId))?.session
    ).toMatchObject({
      baseJourneyRevision: 2,
      headWorkspaceRevision: 1,
      headGraph: {
        revision: 3,
        events: expect.arrayContaining([
          expect.objectContaining({
            id: `${journeyId}-a`,
            title: "dirty local title",
          }),
          expect.objectContaining({
            id: `${journeyId}-b`,
            title: "canonical refreshed title",
          }),
        ]),
      },
    })
    const committedFork = await service.execute(
      context,
      command(dirtyWorkspace.id, 6, "fork-after-dirty-commit", {
        name: "workspace.fork",
        payload: { fromWorkspaceRevision: 5 },
      })
    )
    expect(committedFork.outcome).toMatchObject({
      type: "workspace.forked",
      sourceWorkspaceRevision: 5,
      headWorkspaceRevision: 0,
    })
    const committedForkId = (committedFork.outcome as { workspaceId: string })
      .workspaceId
    expect(
      (await service.getDocument(context, committedForkId))?.session
    ).toMatchObject({
      baseJourneyRevision: 3,
      headWorkspaceRevision: 0,
      headGraph: { revision: 3 },
    })
    await expect(
      service.execute(
        context,
        command(conflictWorkspace.id, 1, "refresh-conflict", {
          name: "workspace.refresh",
          payload: { fromWorkspaceRevision: 0 },
        })
      )
    ).rejects.toThrow("Workspace refresh conflict")

    const scratchId = `workspace-scratch-commit-${randomUUID()}`
    const scratch = await createWorkspace(context, {
      graph: graph(scratchId),
      now: new Date(now),
    })
    const scratchCommit = await service.execute(
      context,
      command(scratch.id, 0, "commit-scratch", {
        name: "workspace.commit",
        payload: { expectedJourneyRevision: null },
      })
    )
    expect(scratchCommit.outcome).toMatchObject({
      type: "workspace.committed",
      journeyId: scratchId,
      fromWorkspaceRevision: 0,
      throughWorkspaceRevision: 0,
      committedJourneyRevision: 1,
    })
    expect(await getJourney(context, scratchId)).toMatchObject({ revision: 1 })
    expect(
      (await service.getDocument(context, scratch.id))?.session
    ).toMatchObject({
      sourceJourneyId: scratchId,
      baseJourneyRevision: 1,
      headWorkspaceRevision: 1,
    })
  })

  it("rolls back the whole commit chain when a later pinned Content fact fails", async () => {
    const journeyId = `workspace-commit-rollback-${randomUUID()}`
    const base = await createJourney(context, {
      graph: graph(journeyId),
      operation: "create rollback Journey",
      patch: [],
      inversePatch: [],
      idempotencyKey: `${journeyId}-create`,
    })
    const workspace = await createWorkspace(context, {
      graph: base,
      sourceJourneyId: journeyId,
      baseJourneyRevision: 1,
      now: new Date(now),
    })
    const asset = await createAsset(context, {
      kind: "IMAGE",
      storageKey: `workspace-rollback/${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 32,
      checksum: `workspace-rollback-${randomUUID()}`,
    })
    const service = new WorkspaceCommandService()
    await service.execute(
      context,
      command(workspace.id, 0, "rollback-core", {
        name: "journey.update_event",
        payload: {
          eventId: `${journeyId}-a`,
          patch: { type: "VISIT", title: "must roll back" },
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 1, "rollback-content", {
        name: "journey.attach_asset",
        payload: {
          eventId: `${journeyId}-a`,
          assetId: asset.id,
          role: "GALLERY",
          visibility: "PRIVATE",
        },
      })
    )
    await deleteAsset(context, asset.id)

    await expect(
      service.execute(
        context,
        command(workspace.id, 2, "rollback-commit", {
          name: "workspace.commit",
          payload: { expectedJourneyRevision: 1 },
        })
      )
    ).rejects.toThrow("active Asset checksum")
    expect(await getJourney(context, journeyId)).toMatchObject({
      revision: 1,
      events: expect.arrayContaining([
        expect.objectContaining({ id: `${journeyId}-a`, title: "A" }),
      ]),
      eventAssetLinks: [],
    })
    expect(await prisma.journeyRevision.count({ where: { journeyId } })).toBe(1)
  })

  it("replays pinned READY/FAILED Transit and Content facts without provider or mutable-object reads", async () => {
    const workspace = await createWorkspace(context, {
      graph: transitGraph(`workspace-replay-facts-${randomUUID()}`),
      now: new Date(now),
    })
    const asset = await createAsset(context, {
      kind: "IMAGE",
      storageKey: `workspace-replay/${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 32,
      checksum: `workspace-replay-${randomUUID()}`,
    })
    const sourceAsset = await createAsset(context, {
      kind: "FILE",
      storageKey: `workspace-replay/${randomUUID()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 32,
      checksum: `workspace-replay-source-${randomUUID()}`,
    })
    const pack = await createSourcePack(context, {
      title: "Replay source",
      visibility: "PRIVATE",
    })
    const sourceDocument = await createSourceDocument(context, {
      sourcePackId: pack.id,
      assetId: sourceAsset.id,
      title: "Replay source document",
    })
    const sourceItem = await createSourceItem(context, {
      sourceDocumentId: sourceDocument.id,
      kind: "NOTE",
      title: "Replay source item",
      sourceOrder: 0,
      confidence: 0.9,
    })
    const plan = vi
      .fn()
      .mockImplementationOnce(async (request: TransitPlanRequest) => ({
        transitEventId: request.transitEventId,
        requestFingerprint: transitPlanFingerprint(request),
        plans: [
          {
            id: "replay-ready-plan",
            provider: "mock" as const,
            rank: 0,
            label: "推荐",
            strategy: "recommended",
            distanceMeters: 2_000,
            durationSeconds: 600,
            trafficBasis: "TYPICAL" as const,
            calculatedAt: now,
            requestFingerprint: transitPlanFingerprint(request),
            segments: [],
          },
        ],
      }))
      .mockRejectedValueOnce(
        Object.assign(new Error("provider timeout"), { code: "TIMEOUT" })
      )
    const service = new WorkspaceCommandService({
      transitPlanning: { plan },
    })
    await service.execute(
      context,
      command(workspace.id, 0, "replay-ready", {
        name: "journey.plan_transit",
        payload: {
          eventId: `${workspace.headGraph.id}-transit`,
          forceRefresh: false,
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 1, "replay-failed", {
        name: "journey.plan_transit",
        payload: {
          eventId: `${workspace.headGraph.id}-transit`,
          forceRefresh: true,
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 2, "replay-observation", {
        name: "journey.add_observation",
        payload: {
          eventId: `${workspace.headGraph.id}-a`,
          observation: {
            kind: "NOTE",
            phase: "ACTUAL",
            visibility: "PRIVATE",
            body: "pinned observation",
          },
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 3, "replay-asset", {
        name: "journey.attach_asset",
        payload: {
          eventId: `${workspace.headGraph.id}-a`,
          assetId: asset.id,
          role: "GALLERY",
          visibility: "PRIVATE",
        },
      })
    )
    await service.execute(
      context,
      command(workspace.id, 4, "replay-source", {
        name: "journey.link_source_item",
        payload: {
          eventId: `${workspace.headGraph.id}-a`,
          sourceItemId: sourceItem.id,
          role: "EVIDENCE",
          approvedForJourneySharing: false,
        },
      })
    )
    const pinned = structuredClone(
      (await service.getDocument(context, workspace.id))!.session.headGraph
    )
    await deleteAsset(context, asset.id)

    const replayed = await service.execute(
      context,
      command(workspace.id, 5, "replay-pinned-facts", {
        name: "workspace.replay",
        payload: { fromWorkspaceRevision: 0 },
      })
    )
    expect(replayed.outcome).toMatchObject({
      type: "workspace.replayed",
      throughWorkspaceRevision: 5,
    })
    expect(plan).toHaveBeenCalledTimes(2)
    expect(
      (await service.getDocument(context, workspace.id))?.session.headGraph
    ).toEqual(pinned)
    expect(pinned.transitPlanningRuns.map((run) => run.status)).toEqual([
      "READY",
      "FAILED",
    ])
    expect(pinned.observations).toHaveLength(1)
    expect(pinned.eventAssetLinks).toHaveLength(1)
    expect(pinned.eventSourceLinks).toHaveLength(1)
  })

  it("persists Transit planning and observation commands through the same bus", async () => {
    const workspace = await createWorkspace(context, {
      graph: transitGraph(`workspace-transit-${randomUUID()}`),
      now: new Date(now),
    })
    const plan = vi.fn(async (request: TransitPlanRequest) => ({
      transitEventId: request.transitEventId,
      requestFingerprint: transitPlanFingerprint(request),
      plans: [
        {
          id: "provider-plan",
          provider: "mock" as const,
          rank: 0,
          label: "推荐",
          strategy: "recommended",
          distanceMeters: 2_000,
          durationSeconds: 600,
          fareAmount: 20,
          trafficBasis: "TYPICAL" as const,
          calculatedAt: now,
          requestFingerprint: transitPlanFingerprint(request),
          segments: [],
        },
      ],
    }))
    const planning = new TransitPlanningService({ provider: { plan } })
    const service = new WorkspaceCommandService({ transitPlanning: planning })
    const planningKey = `plan-transit-${workspace.id}`
    const planningCommand = command(workspace.id, 0, planningKey, {
      name: "journey.plan_transit",
      payload: {
        eventId: `${workspace.headGraph.id}-transit`,
        forceRefresh: false,
      },
    })
    const [planned, replayed] = await Promise.all([
      service.execute(context, planningCommand),
      service.execute(context, planningCommand),
    ])
    expect(planned).toMatchObject({
      newRevision: 1,
      changedEventIds: [`${workspace.headGraph.id}-transit`],
      replayedFromIdempotencyKey: false,
    })
    expect(replayed).toMatchObject({
      newRevision: 1,
      replayedFromIdempotencyKey: true,
    })
    expect(plan).toHaveBeenCalledOnce()
    await expect(
      prisma.providerUsageLog.findFirstOrThrow({
        where: { requestId: planningKey },
      })
    ).resolves.toMatchObject({
      userId: ownerId,
      workspaceId: workspace.id,
      agentRunId: null,
      status: "success",
    })

    await expect(
      service.execute(
        context,
        command(workspace.id, 1, "observe-start", {
          name: "journey.add_observation",
          payload: {
            eventId: `${workspace.headGraph.id}-a`,
            observation: {
              kind: "NOTE",
              phase: "ACTUAL",
              visibility: "PRIVATE",
              body: "现场记录",
            },
          },
        })
      )
    ).resolves.toMatchObject({
      newRevision: 2,
      changedEventIds: [`${workspace.headGraph.id}-a`],
    })
    const recovered = await service.getDocument(context, workspace.id)
    expect(recovered?.session.headGraph.transitPlanningRuns).toHaveLength(1)
    expect(recovered?.session.headGraph.observations).toHaveLength(1)
  })

  it("invalidates every before/after SECTION ancestor scope through root", async () => {
    const service = new WorkspaceCommandService()

    const updateWorkspace = await createWorkspace(context, {
      graph: nestedSectionGraph(),
      now: new Date(now),
    })
    await expect(
      service.execute(
        context,
        command(updateWorkspace.id, 0, "nested-time-update", {
          name: "journey.update_event",
          payload: {
            eventId: "morning",
            patch: {
              type: "VISIT",
              plannedStartAt: "2026-08-01T01:00:00.000Z",
            },
          },
        })
      )
    ).resolves.toMatchObject({
      projectionInvalidationScopes: [null, "city", "day"],
    })

    const moveWorkspace = await createWorkspace(context, {
      graph: nestedSectionGraph(),
      now: new Date(now),
    })
    await expect(
      service.execute(
        context,
        command(moveWorkspace.id, 0, "move-section-scope", {
          name: "journey.move_event",
          payload: {
            eventId: "day",
            position: { placement: "START", parentSectionEventId: null },
          },
        })
      )
    ).resolves.toMatchObject({
      projectionInvalidationScopes: [null, "city"],
    })

    const retireWorkspace = await createWorkspace(context, {
      graph: nestedSectionGraph(),
      now: new Date(now),
    })
    await expect(
      service.execute(
        context,
        command(retireWorkspace.id, 0, "retire-section-subtree", {
          name: "journey.retire_event",
          payload: {
            eventId: "city",
            sectionChildren: "RECURSIVE_RETIRE",
          },
        })
      )
    ).resolves.toMatchObject({
      projectionInvalidationScopes: [null, "city", "day"],
    })

    const replaceWorkspace = await createWorkspace(context, {
      graph: nestedSectionGraph(),
      now: new Date(now),
    })
    await expect(
      service.execute(
        context,
        command(replaceWorkspace.id, 0, "replace-section-subtree", {
          name: "journey.replace_event",
          payload: {
            predecessorEventId: "day",
            successor: {
              id: "day-successor",
              type: "SECTION",
              title: "第一天（新）",
              detail: {
                kind: "DAY",
                localDate: "2026-08-01",
                timezone: "Asia/Shanghai",
              },
            },
            reason: "replace day",
          },
        })
      )
    ).resolves.toMatchObject({
      projectionInvalidationScopes: [null, "city", "day", "day-successor"],
    })
  })

  it("rejects malformed structured branches before scratch or command persistence", async () => {
    const crossingFixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "06-strict-nested-branch"
    )!.cases.find((candidate) => candidate.id === "crossing-branch-error")!
    const crossing = structuredClone(crossingFixture.input.graph!)
    crossing.ownerId = ownerId
    await expect(
      createWorkspace(context, { graph: crossing, now: new Date(now) })
    ).rejects.toThrow("cross")

    const input = graph(`workspace-invalid-branch-${randomUUID()}`)
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })
    await expect(
      new WorkspaceCommandService().execute(
        context,
        command(workspace.id, 0, "reuse-branch-key", {
          name: "journey.add_link",
          payload: {
            link: {
              fromEventId: `${input.id}-a`,
              toEventId: `${input.id}-b`,
              kind: "ALTERNATIVE",
              branchKey: "rain",
              rank: 3072,
            },
          },
        })
      )
    ).rejects.toThrow("continuous path")
    const recovered = await new WorkspaceCommandService().getDocument(
      context,
      workspace.id
    )
    expect(recovered?.session.headWorkspaceRevision).toBe(0)
    expect(recovered?.session.headGraph.links).toHaveLength(4)
  })

  it("marks selected Transit planning stale after request or endpoint edits", async () => {
    const service = new WorkspaceCommandService()
    const requestWorkspace = await createWorkspace(context, {
      graph: readyTransitFixtureGraph(),
      now: new Date(now),
    })
    await expect(
      service.execute(
        context,
        command(requestWorkspace.id, 0, "edit-transit-request", {
          name: "journey.update_event",
          payload: {
            eventId: "transit",
            patch: {
              type: "TRANSIT",
              detail: { preference: "LOW_COST" },
            },
          },
        })
      )
    ).resolves.toMatchObject({ changedEventIds: ["transit"] })
    const requestResult = await service.getDocument(
      context,
      requestWorkspace.id
    )
    expect(
      requestResult?.session.headGraph.events.find(
        (event) => event.id === "transit"
      )
    ).toMatchObject({ detail: { routeState: "ROUTE_STALE" } })

    const endpointWorkspace = await createWorkspace(context, {
      graph: readyTransitFixtureGraph(),
      now: new Date(now),
    })
    await expect(
      service.execute(
        context,
        command(endpointWorkspace.id, 0, "edit-transit-endpoint", {
          name: "journey.update_event",
          payload: {
            eventId: "start",
            patch: {
              type: "VISIT",
              detail: { plannedLat: 31 },
            },
          },
        })
      )
    ).resolves.toMatchObject({ changedEventIds: ["start", "transit"] })
    const endpointResult = await service.getDocument(
      context,
      endpointWorkspace.id
    )
    expect(
      endpointResult?.session.headGraph.events.find(
        (event) => event.id === "transit"
      )
    ).toMatchObject({ detail: { routeState: "ROUTE_STALE" } })
  })

  it("rejects approved source links without excerpts for owner and shared external packs", async () => {
    const sourceItem = async (
      sourceContext: typeof context,
      visibility: "PRIVATE" | "SHARED"
    ) => {
      const asset = await createAsset(sourceContext, {
        kind: "FILE",
        storageKey: `workspace-source/${randomUUID()}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 32,
        checksum: `workspace-source-${randomUUID()}`,
      })
      const pack = await createSourcePack(sourceContext, {
        title: "Workspace source",
        visibility,
      })
      const document = await createSourceDocument(sourceContext, {
        sourcePackId: pack.id,
        assetId: asset.id,
        title: "Workspace source document",
      })
      return createSourceItem(sourceContext, {
        sourceDocumentId: document.id,
        kind: "NOTE",
        title: "Workspace source item",
        sourceOrder: 0,
        confidence: 0.9,
      })
    }
    const [ownerItem, externalItem] = await Promise.all([
      sourceItem(context, "PRIVATE"),
      sourceItem(otherContext, "SHARED"),
    ])
    const workspace = await createWorkspace(context, {
      graph: graph(`workspace-source-excerpt-${randomUUID()}`),
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    for (const [index, item] of [ownerItem, externalItem].entries()) {
      await expect(
        service.execute(
          context,
          command(workspace.id, 0, `missing-source-excerpt-${index}`, {
            name: "journey.link_source_item",
            payload: {
              eventId: `${workspace.headGraph.id}-a`,
              sourceItemId: item.id,
              role: "EVIDENCE",
              approvedForJourneySharing: true,
            },
          })
        )
      ).rejects.toThrow("nonblank excerpt")
    }
  })

  it("retires active content links with ordinary, recursive, and replacement Events", async () => {
    const withContent = (
      input: TargetJourneyGraphSnapshot,
      eventId: string
    ) => {
      input.eventAssetLinks.push({
        id: `${eventId}-asset-link`,
        journeyId: input.id,
        eventId,
        assetId: `${eventId}-asset`,
        assetChecksum: `${eventId}-checksum`,
        role: "GALLERY",
        rank: 0,
        visibility: "PRIVATE",
        introducedRevision: 1,
        createdAt: now,
      })
      input.eventSourceLinks.push({
        id: `${eventId}-source-link`,
        journeyId: input.id,
        eventId,
        sourceItemId: `${eventId}-source-item`,
        sourceDocumentId: `${eventId}-source-document`,
        sourceDocumentChecksum: `${eventId}-source-checksum`,
        role: "EVIDENCE",
        confidence: 0.9,
        rank: 0,
        approvedForJourneySharing: false,
        introducedRevision: 1,
        createdAt: now,
      })
      return input
    }
    const service = new WorkspaceCommandService()

    const ordinaryInput = withContent(
      sectionGraph(`workspace-content-retire-${randomUUID()}`, "LINEAR"),
      ""
    )
    const ordinaryEventId = `${ordinaryInput.id}-a`
    ordinaryInput.eventAssetLinks[0]!.eventId = ordinaryEventId
    ordinaryInput.eventSourceLinks[0]!.eventId = ordinaryEventId
    const ordinaryWorkspace = await createWorkspace(context, {
      graph: ordinaryInput,
      now: new Date(now),
    })
    await service.execute(
      context,
      command(ordinaryWorkspace.id, 0, "retire-content-event", {
        name: "journey.retire_event",
        payload: { eventId: ordinaryEventId },
      })
    )
    const ordinary = await service.getDocument(context, ordinaryWorkspace.id)
    expect(ordinary?.session.headGraph.eventAssetLinks[0]).toMatchObject({
      retiredRevision: 2,
    })
    expect(ordinary?.session.headGraph.eventSourceLinks[0]).toMatchObject({
      retiredRevision: 2,
    })

    const recursiveInput = sectionGraph(
      `workspace-content-recursive-${randomUUID()}`,
      "LINEAR"
    )
    const recursiveEventId = `${recursiveInput.id}-b`
    withContent(recursiveInput, recursiveEventId)
    const recursiveWorkspace = await createWorkspace(context, {
      graph: recursiveInput,
      now: new Date(now),
    })
    await service.execute(
      context,
      command(recursiveWorkspace.id, 0, "retire-content-section", {
        name: "journey.retire_event",
        payload: {
          eventId: `${recursiveInput.id}-section`,
          sectionChildren: "RECURSIVE_RETIRE",
        },
      })
    )
    const recursive = await service.getDocument(context, recursiveWorkspace.id)
    expect(recursive?.session.headGraph.eventAssetLinks[0]).toMatchObject({
      retiredRevision: 2,
    })
    expect(recursive?.session.headGraph.eventSourceLinks[0]).toMatchObject({
      retiredRevision: 2,
    })

    const replacementInput = sectionGraph(
      `workspace-content-replace-${randomUUID()}`,
      "LINEAR"
    )
    const predecessorEventId = `${replacementInput.id}-a`
    withContent(replacementInput, predecessorEventId)
    const replacementWorkspace = await createWorkspace(context, {
      graph: replacementInput,
      now: new Date(now),
    })
    await service.execute(
      context,
      command(replacementWorkspace.id, 0, "replace-content-event", {
        name: "journey.replace_event",
        payload: {
          predecessorEventId,
          successor: {
            id: `${replacementInput.id}-a2`,
            type: "VISIT",
            title: "A2",
            detail: {
              plannedLat: 30.2,
              plannedLng: 120.1,
              coordinateSystem: "GCJ02",
            },
          },
          reason: "replace content event",
        },
      })
    )
    const replacement = await service.getDocument(
      context,
      replacementWorkspace.id
    )
    expect(replacement?.session.headGraph.eventAssetLinks[0]).toMatchObject({
      retiredRevision: 2,
    })
    expect(replacement?.session.headGraph.eventSourceLinks[0]).toMatchObject({
      retiredRevision: 2,
    })
  })

  it("moves a linear Event while preserving the P0 Link identities", async () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "08-replacement-retire-undo"
    )!.cases.find((candidate) => candidate.id === "move-keeps-identities")!
    const input = structuredClone(fixture.input.graph!)
    input.ownerId = ownerId
    const workspace = await createWorkspace(context, {
      graph: input,
      now: new Date(now),
    })
    const service = new WorkspaceCommandService()
    await service.execute(
      context,
      command(workspace.id, 0, "move-c-before-b", {
        name: "journey.move_event",
        payload: {
          eventId: "move-c",
          position: { placement: "BEFORE", anchorEventId: "move-b" },
        },
      })
    )
    const recovered = await service.getDocument(context, workspace.id)
    expect(
      recovered?.session.headGraph.links.map(
        ({ id, fromEventId, toEventId, retiredRevision }) => ({
          id,
          fromEventId,
          toEventId,
          retiredRevision,
        })
      )
    ).toEqual([
      {
        id: "move-link-1",
        fromEventId: "move-a",
        toEventId: "move-c",
        retiredRevision: undefined,
      },
      {
        id: "move-link-2",
        fromEventId: "move-c",
        toEventId: "move-b",
        retiredRevision: undefined,
      },
    ])
  })
})
