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
import { prisma } from "@/modules/data/db/prisma"
import { TransitPlanningService } from "@/modules/data/transit/transit-planning-service"
import {
  createWorkspace,
  finishWorkspaceAgentRun,
  startWorkspaceAgentRun,
  WorkspaceIdempotencyConflictError,
  WorkspaceInputError,
  WorkspaceRevisionConflictError,
} from "@/modules/data/workspaces/workspace-repository"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"

const ownerId = `workspace-command-owner-${randomUUID()}`
const context = { userId: ownerId, role: "user" as const }
const now = "2026-08-01T00:00:00.000Z"

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: ownerId,
      name: "Workspace command owner",
      email: `${ownerId}@periplus.local`,
      emailVerified: true,
    },
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
            origin: "USER_INSERTED",
            executionStatus: "PLANNED",
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
    expect(
      replacedTransit?.session.headGraph.links.find(
        (link) => link.id === `${transitInput.id}-to-transit`
      )
    ).toMatchObject({ fromEventId: `${transitInput.id}-a2` })

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
            origin: "USER_INSERTED",
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
            origin: "USER_INSERTED",
            executionStatus: "PLANNED",
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
    const event = input.events.find((candidate) => candidate.id === `${input.id}-a`)!
    if (event.type !== "VISIT") throw new Error("fixture invariant")
    event.executionStatus = "STARTED"
    event.actualStartAt = "2026-08-01T01:00:00.000Z"
    event.detail.actualLat = 30.251
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
            detail: { actualLng: 120.151 },
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
      detail: { actualLat: 30.251, actualLng: 120.151 },
    })
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
    await expect(
      service.execute(context, planningCommand)
    ).resolves.toMatchObject({
      newRevision: 1,
      changedEventIds: [`${workspace.headGraph.id}-transit`],
    })
    await expect(
      service.execute(context, planningCommand)
    ).resolves.toMatchObject({
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
