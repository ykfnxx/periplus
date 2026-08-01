import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"
import type {
  TargetJourneyEvent,
  TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import {
  commitJourneyGraph,
  createJourney,
  deleteJourney,
  getJourney,
  getJourneyRevision,
  JourneyIdempotencyConflictError,
  JourneyInputError,
  JourneyRevisionConflictError,
} from "@/modules/data/journeys/journey-repository"

const ownerId = `journey-core-owner-${randomUUID()}`
const otherUserId = `journey-core-other-${randomUUID()}`
const context = { userId: ownerId, role: "user" as const }
const now = "2026-08-01T00:00:00.000Z"
const later = "2026-08-01T01:00:00.000Z"

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ownerId,
        name: "Journey Core Test",
        email: `${ownerId}@periplus.local`,
        emailVerified: true,
      },
      {
        id: otherUserId,
        name: "Other Journey Core Test",
        email: `${otherUserId}@periplus.local`,
        emailVerified: true,
      },
    ],
  })
})

function visit(
  id: string,
  journeyId: string,
  title: string,
  introducedRevision = 1
): Extract<TargetJourneyEvent, { type: "VISIT" }> {
  return {
    id,
    journeyId,
    parentSectionEventId: null,
    placementStatus: "SCHEDULED" as const,
    origin: "ORIGINAL" as const,
    title,
    introducedRevision,
    createdAt: introducedRevision === 1 ? now : later,
    updatedAt: introducedRevision === 1 ? now : later,
    type: "VISIT" as const,
    executionStatus: "PLANNED" as const,
    detail: {
      plannedLat: 30.25,
      plannedLng: 120.15,
      coordinateSystem: "GCJ02" as const,
    },
  }
}

function section(
  id: string,
  journeyId: string,
  title: string
): Extract<TargetJourneyEvent, { type: "SECTION" }> {
  return {
    id,
    journeyId,
    parentSectionEventId: null,
    placementStatus: "SCHEDULED",
    origin: "ORIGINAL",
    title,
    introducedRevision: 1,
    createdAt: now,
    updatedAt: now,
    type: "SECTION",
    detail: { kind: "CITY", coordinateSystem: "GCJ02" },
  }
}

function graph(
  id: string,
  eventIds: readonly string[]
): TargetJourneyGraphSnapshot {
  const events = eventIds.map((eventId) =>
    visit(`${id}-${eventId}`, id, eventId)
  )
  return {
    id,
    ownerId,
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: id,
    events,
    links: events.slice(1).map((event, index) => ({
      id: `${id}-link-${index + 1}`,
      journeyId: id,
      fromEventId: events[index]!.id,
      toEventId: event.id,
      kind: "MAIN",
      rank: (index + 1) * 1024,
      introducedRevision: 1,
    })),
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}

function write(
  value: TargetJourneyGraphSnapshot,
  operation: string,
  idempotencyKey: string
) {
  return {
    graph: value,
    operation,
    patch: [{ operation }],
    inversePatch: [{ operation: `undo:${operation}` }],
    idempotencyKey,
  }
}

describe("P2A Journey core repository", () => {
  it("persists one immutable revision per atomic graph write and replays idempotently", async () => {
    const initial = graph(`journey-revision-${randomUUID()}`, ["visit"])
    const created = await createJourney(
      context,
      write(initial, "create journey", "create")
    )
    expect(created).toEqual(initial)

    const next = structuredClone(created)
    next.revision = 2
    next.title = "Updated journey"
    next.events[0]!.title = "Updated visit"
    next.events[0]!.updatedAt = later
    const updateWrite = write(next, "update journey", "update-title")
    const updated = await commitJourneyGraph(
      context,
      initial.id,
      updateWrite,
      1
    )
    expect(updated).toEqual(next)

    const replay = await commitJourneyGraph(context, initial.id, updateWrite, 1)
    expect(replay).toEqual(next)
    expect(
      await prisma.journeyRevision.count({
        where: { journeyId: initial.id },
      })
    ).toBe(2)

    await expect(
      commitJourneyGraph(
        context,
        initial.id,
        { ...updateWrite, operation: "different payload" },
        2
      )
    ).rejects.toBeInstanceOf(JourneyIdempotencyConflictError)

    const stale = structuredClone(next)
    stale.revision = 3
    await expect(
      commitJourneyGraph(
        context,
        initial.id,
        write(stale, "stale update", "stale-update"),
        1
      )
    ).rejects.toBeInstanceOf(JourneyRevisionConflictError)

    const revision1 = await getJourneyRevision(context, initial.id, 1)
    const revision2 = await getJourneyRevision(context, initial.id, 2)
    expect(revision1?.snapshot).toEqual(initial)
    expect(revision2?.snapshot).toEqual(next)
    expect(revision2?.parentRevisionId).toBe(revision1?.id)
  })

  it("returns the same canonical snapshot for the first write and replay", async () => {
    const initial = graph(`journey-canonical-${randomUUID()}`, [
      "z-event",
      "a-event",
      "m-event",
    ])
    initial.events.reverse()
    initial.links.reverse()
    for (const event of initial.events) {
      event.createdAt = "2026-08-01T08:00:00+08:00"
      event.updatedAt = "2026-08-01T08:00:00+08:00"
    }
    const request = write(initial, "create canonical journey", "create")

    const created = await createJourney(context, request)
    const replay = await createJourney(context, request)

    expect(JSON.stringify(replay)).toBe(JSON.stringify(created))
    expect(created.events.map((event) => event.id)).toEqual(
      [...created.events.map((event) => event.id)].sort()
    )
    expect(created.links.map((link) => link.rank)).toEqual([1024, 2048])
    expect(created.events.every((event) => event.createdAt === now)).toBe(true)
    expect(
      JSON.stringify(
        (await getJourneyRevision(context, initial.id, 1))?.snapshot
      )
    ).toBe(JSON.stringify(created))

    const next = structuredClone(created)
    next.revision = 2
    next.events.reverse()
    next.links.reverse()
    for (const event of next.events) {
      event.updatedAt = "2026-08-01T09:00:00+08:00"
    }
    const updateRequest = write(next, "canonical update", "canonical-update")
    const updated = await commitJourneyGraph(
      context,
      initial.id,
      updateRequest,
      1
    )
    const updateReplay = await commitJourneyGraph(
      context,
      initial.id,
      updateRequest,
      1
    )
    expect(JSON.stringify(updateReplay)).toBe(JSON.stringify(updated))
    expect(updated?.events.every((event) => event.updatedAt === later)).toBe(
      true
    )
    expect(
      JSON.stringify(
        (await getJourneyRevision(context, initial.id, 2))?.snapshot
      )
    ).toBe(JSON.stringify(updated))
  })

  it("allows only one concurrent writer to advance the same head revision", async () => {
    const initial = graph(`journey-concurrency-${randomUUID()}`, ["visit"])
    const created = await createJourney(
      context,
      write(initial, "create journey", "create")
    )
    const left = structuredClone(created)
    left.revision = 2
    left.title = "left"
    const right = structuredClone(created)
    right.revision = 2
    right.title = "right"

    const results = await Promise.allSettled([
      commitJourneyGraph(
        context,
        initial.id,
        write(left, "left update", "left-update"),
        1
      ),
      commitJourneyGraph(
        context,
        initial.id,
        write(right, "right update", "right-update"),
        1
      ),
    ])
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1)
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: initial.id } })
    ).toBe(2)
    expect((await getJourney(context, initial.id))?.revision).toBe(2)
  })

  it("rolls back the revision and graph together when a relation write fails", async () => {
    const initial = graph(`journey-rollback-${randomUUID()}`, ["visit"])
    const created = await createJourney(
      context,
      write(initial, "create journey", "create")
    )
    const invalid = structuredClone(created)
    invalid.revision = 2
    const added = visit(`${initial.id}-new`, initial.id, "new", 2)
    added.detail.plannedPlaceId = "missing-place"
    invalid.events.push(added)
    invalid.links.push({
      id: `${initial.id}-new-link`,
      journeyId: initial.id,
      fromEventId: invalid.events[0]!.id,
      toEventId: added.id,
      kind: "MAIN",
      rank: 1024,
      introducedRevision: 2,
    })

    await expect(
      commitJourneyGraph(
        context,
        initial.id,
        write(invalid, "invalid relation", "invalid-relation"),
        1
      )
    ).rejects.toBeDefined()
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: initial.id } })
    ).toBe(1)
    expect(
      await prisma.journeyEvent.count({ where: { journeyId: initial.id } })
    ).toBe(1)
    expect((await getJourney(context, initial.id))?.revision).toBe(1)
  })

  it("moves Events by updating stable Link identities without delete-all rebuilds", async () => {
    const initial = graph(`journey-move-${randomUUID()}`, ["a", "b", "c"])
    const created = await createJourney(
      context,
      write(initial, "create journey", "create")
    )
    const moved = structuredClone(created)
    moved.revision = 2
    const [a, b, c] = moved.events.map((event) => event.id)
    moved.links[0]!.toEventId = c!
    moved.links[1]!.fromEventId = c!
    moved.links[1]!.toEventId = b!

    const result = await commitJourneyGraph(
      context,
      initial.id,
      write(moved, "move c before b", "move-c"),
      1
    )
    expect(result?.events.map((event) => event.id)).toEqual([a, b, c])
    expect(result?.links.map((link) => link.id)).toEqual(
      initial.links.map((link) => link.id)
    )
    expect(
      await prisma.journeyEventLink.count({
        where: { journeyId: initial.id },
      })
    ).toBe(2)
  })

  it("moves a stable linked subgraph across SECTION scopes atomically", async () => {
    const journeyId = `journey-scope-move-${randomUUID()}`
    const sectionA = section(`${journeyId}-section-a`, journeyId, "A")
    const sectionB = section(`${journeyId}-section-b`, journeyId, "B")
    const first = visit(`${journeyId}-first`, journeyId, "first")
    const second = visit(`${journeyId}-second`, journeyId, "second")
    first.parentSectionEventId = sectionA.id
    second.parentSectionEventId = sectionA.id
    const initial: TargetJourneyGraphSnapshot = {
      ...graph(journeyId, []),
      events: [sectionA, sectionB, first, second],
      links: [
        {
          id: `${journeyId}-root-link`,
          journeyId,
          fromEventId: sectionA.id,
          toEventId: sectionB.id,
          kind: "MAIN",
          rank: 1024,
          introducedRevision: 1,
        },
        {
          id: `${journeyId}-child-link`,
          journeyId,
          fromEventId: first.id,
          toEventId: second.id,
          kind: "MAIN",
          rank: 1024,
          introducedRevision: 1,
        },
      ],
    }
    const created = await createJourney(
      context,
      write(initial, "create scoped graph", "create")
    )
    const moved = structuredClone(created)
    moved.revision = 2
    for (const event of moved.events.filter(
      (event) => event.id === first.id || event.id === second.id
    )) {
      event.parentSectionEventId = sectionB.id
      event.updatedAt = later
    }

    const result = await commitJourneyGraph(
      context,
      journeyId,
      write(moved, "move linked scope", "move-scope"),
      1
    )
    expect(
      result?.events
        .filter((event) => event.id === first.id || event.id === second.id)
        .map((event) => event.parentSectionEventId)
    ).toEqual([sectionB.id, sectionB.id])
    expect(
      result?.links.find((link) => link.id.endsWith("child-link"))
    ).toEqual(initial.links[1])
  })

  it("moves a selected branch across SECTION scopes with stable identities", async () => {
    const journeyId = `journey-selected-scope-${randomUUID()}`
    const sectionA = section(`${journeyId}-section-a`, journeyId, "A")
    const sectionB = section(`${journeyId}-section-b`, journeyId, "B")
    const fork = visit(`${journeyId}-fork`, journeyId, "fork")
    const branchA = visit(`${journeyId}-branch-a`, journeyId, "branch A")
    const branchB = visit(`${journeyId}-branch-b`, journeyId, "branch B")
    const join = visit(`${journeyId}-join`, journeyId, "join")
    for (const event of [fork, branchA, branchB, join]) {
      event.parentSectionEventId = sectionA.id
    }
    const initial: TargetJourneyGraphSnapshot = {
      ...graph(journeyId, []),
      events: [sectionA, sectionB, fork, branchA, branchB, join],
      links: [
        {
          id: `${journeyId}-root-link`,
          journeyId,
          fromEventId: sectionA.id,
          toEventId: sectionB.id,
          kind: "MAIN",
          rank: 1024,
          introducedRevision: 1,
        },
        {
          id: `${journeyId}-fork-a`,
          journeyId,
          fromEventId: fork.id,
          toEventId: branchA.id,
          kind: "MAIN",
          rank: 1024,
          introducedRevision: 1,
        },
        {
          id: `${journeyId}-a-join`,
          journeyId,
          fromEventId: branchA.id,
          toEventId: join.id,
          kind: "MAIN",
          rank: 1024,
          introducedRevision: 1,
        },
        {
          id: `${journeyId}-fork-b`,
          journeyId,
          fromEventId: fork.id,
          toEventId: branchB.id,
          kind: "ALTERNATIVE",
          branchKey: "rain",
          rank: 2048,
          introducedRevision: 1,
        },
        {
          id: `${journeyId}-b-join`,
          journeyId,
          fromEventId: branchB.id,
          toEventId: join.id,
          kind: "ALTERNATIVE",
          branchKey: "rain",
          rank: 1024,
          introducedRevision: 1,
        },
      ],
      branchSelections: [
        {
          id: `${journeyId}-selection-a`,
          journeyId,
          forkEventId: fork.id,
          selectedLinkId: `${journeyId}-fork-a`,
          journeyRevision: 1,
          actor: { kind: "USER", userId: ownerId },
          createdAt: now,
        },
      ],
    }
    const created = await createJourney(
      context,
      write(initial, "create selected branch", "create")
    )
    const moved = structuredClone(created)
    moved.revision = 2
    for (const event of moved.events.filter((candidate) =>
      [fork.id, branchA.id, branchB.id, join.id].includes(candidate.id)
    )) {
      event.parentSectionEventId = sectionB.id
      event.updatedAt = later
    }

    const result = await commitJourneyGraph(
      context,
      journeyId,
      write(moved, "move selected branch", "move-selected-branch"),
      1
    )

    expect(result?.links).toStrictEqual(created.links)
    expect(result?.branchSelections).toStrictEqual(created.branchSelections)
    expect(
      result?.events
        .filter((event) =>
          [fork.id, branchA.id, branchB.id, join.id].includes(event.id)
        )
        .every((event) => event.parentSectionEventId === sectionB.id)
    ).toBe(true)
    expect(await prisma.journeyEventLink.count({ where: { journeyId } })).toBe(
      5
    )
  })

  it("retires and restores nested SECTION trees in either Event id order", async () => {
    for (const [parentSuffix, childSuffix] of [
      ["z-parent", "a-child"],
      ["a-parent", "z-child"],
    ] as const) {
      const journeyId = `journey-nested-${randomUUID()}`
      const parent = section(
        `${journeyId}-${parentSuffix}`,
        journeyId,
        "parent"
      )
      const child = visit(`${journeyId}-${childSuffix}`, journeyId, "child")
      child.parentSectionEventId = parent.id
      const initial: TargetJourneyGraphSnapshot = {
        ...graph(journeyId, []),
        events: [child, parent],
      }
      const created = await createJourney(
        context,
        write(initial, "create nested journey", "create")
      )

      const retired = structuredClone(created)
      retired.revision = 2
      for (const event of retired.events) event.retiredRevision = 2
      const retiredResult = await commitJourneyGraph(
        context,
        journeyId,
        write(retired, "retire nested tree", "retire"),
        1
      )
      expect(
        retiredResult?.events.every((event) => event.retiredRevision === 2)
      ).toBe(true)

      const restored = structuredClone(retiredResult!)
      restored.revision = 3
      for (const event of restored.events) delete event.retiredRevision
      const restoredResult = await commitJourneyGraph(
        context,
        journeyId,
        write(restored, "restore nested tree", "restore"),
        2
      )
      expect(
        restoredResult?.events.every(
          (event) => event.retiredRevision === undefined
        )
      ).toBe(true)
      expect(await prisma.journeyRevision.count({ where: { journeyId } })).toBe(
        3
      )
    }
  })

  it("retires, undoes, and replaces without deleting Event history", async () => {
    const initial = graph(`journey-lineage-${randomUUID()}`, ["a"])
    const created = await createJourney(
      context,
      write(initial, "create journey", "create")
    )

    const retired = structuredClone(created)
    retired.revision = 2
    retired.events[0]!.retiredRevision = 2
    const retiredResult = await commitJourneyGraph(
      context,
      initial.id,
      write(retired, "retire a", "retire-a"),
      1
    )
    expect(retiredResult?.events[0]?.retiredRevision).toBe(2)

    const restored = structuredClone(retiredResult!)
    restored.revision = 3
    delete restored.events[0]!.retiredRevision
    const restoredResult = await commitJourneyGraph(
      context,
      initial.id,
      write(restored, "undo retire a", "undo-retire-a"),
      2
    )
    expect(restoredResult?.events[0]?.retiredRevision).toBeUndefined()

    const replaced = structuredClone(restoredResult!)
    replaced.revision = 4
    replaced.events[0]!.retiredRevision = 4
    const predecessorId = replaced.events[0]!.id
    const successorId = `${initial.id}-b`
    replaced.events.push(visit(successorId, initial.id, "replacement b", 4))
    replaced.replacements.push({
      id: `${initial.id}-replacement`,
      journeyId: initial.id,
      predecessorEventId: predecessorId,
      successorEventId: successorId,
      revision: 4,
      reason: "a is unavailable",
    })
    const replacedResult = await commitJourneyGraph(
      context,
      initial.id,
      write(replaced, "replace a with b", "replace-a"),
      3
    )
    expect(replacedResult?.events).toHaveLength(2)
    expect(replacedResult?.replacements).toEqual(replaced.replacements)
    expect(
      await prisma.journeyEvent.count({
        where: { journeyId: initial.id },
      })
    ).toBe(2)
  })

  it("appends BranchSelections and rejects mutation of prior decisions", async () => {
    const initial = graph(`journey-branch-${randomUUID()}`, [
      "fork",
      "branch-a",
      "branch-b",
      "join",
    ])
    const [fork, branchA, branchB, join] = initial.events.map(
      (event) => event.id
    )
    initial.links = [
      {
        id: `${initial.id}-fork-a`,
        journeyId: initial.id,
        fromEventId: fork!,
        toEventId: branchA!,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: `${initial.id}-a-join`,
        journeyId: initial.id,
        fromEventId: branchA!,
        toEventId: join!,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: `${initial.id}-fork-b`,
        journeyId: initial.id,
        fromEventId: fork!,
        toEventId: branchB!,
        kind: "ALTERNATIVE",
        branchKey: "rain",
        rank: 2048,
        introducedRevision: 1,
      },
      {
        id: `${initial.id}-b-join`,
        journeyId: initial.id,
        fromEventId: branchB!,
        toEventId: join!,
        kind: "ALTERNATIVE",
        branchKey: "rain",
        rank: 1024,
        introducedRevision: 1,
      },
    ]
    initial.branchSelections = [
      {
        id: `${initial.id}-selection-a`,
        journeyId: initial.id,
        forkEventId: fork!,
        selectedLinkId: initial.links[0]!.id,
        journeyRevision: 1,
        actor: { kind: "USER", userId: ownerId },
        createdAt: now,
      },
    ]
    const created = await createJourney(
      context,
      write(initial, "create branch", "create")
    )

    const selectedB = structuredClone(created)
    selectedB.revision = 2
    selectedB.branchSelections.push({
      id: `${initial.id}-selection-b`,
      journeyId: initial.id,
      forkEventId: fork!,
      selectedLinkId: initial.links[2]!.id,
      journeyRevision: 2,
      supersedesId: initial.branchSelections[0]!.id,
      actor: { kind: "USER", userId: ownerId },
      reason: "rain",
      createdAt: later,
    })
    const result = await commitJourneyGraph(
      context,
      initial.id,
      write(selectedB, "select branch b", "select-b"),
      1
    )
    expect(result?.branchSelections).toHaveLength(2)

    const mutated = structuredClone(result!)
    mutated.revision = 3
    mutated.branchSelections[0]!.reason = "rewritten history"
    await expect(
      commitJourneyGraph(
        context,
        initial.id,
        write(mutated, "mutate selection", "mutate-selection"),
        2
      )
    ).rejects.toBeInstanceOf(JourneyInputError)
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: initial.id } })
    ).toBe(2)
  })

  it("binds revision and selection provenance to the authenticated principal", async () => {
    const createAgentRun = async (runOwnerId: string) => {
      const workspaceId = `workspace-${randomUUID()}`
      const agentRunId = `agent-run-${randomUUID()}`
      const createdAt = new Date()
      await prisma.workspaceSession.create({
        data: {
          id: workspaceId,
          ownerId: runOwnerId,
          headGraphJson: JSON.stringify({ ownerId: runOwnerId }),
          expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1000),
          lastAccessAt: createdAt,
          createdAt,
        },
      })
      await prisma.workspaceAgentRun.create({
        data: {
          id: agentRunId,
          workspaceId,
          status: "RUNNING",
          startedAt: new Date(now),
        },
      })
      return agentRunId
    }

    const ownedAgentRunId = await createAgentRun(ownerId)
    const externalAgentRunId = await createAgentRun(otherUserId)
    const ownedAgentJourney = graph(`journey-owned-agent-${randomUUID()}`, [
      "visit",
    ])
    await createJourney(context, {
      ...write(ownedAgentJourney, "owned agent write", "create"),
      actor: { kind: "AGENT", agentRunId: ownedAgentRunId },
    })
    expect(
      (await getJourneyRevision(context, ownedAgentJourney.id, 1))?.actor
    ).toStrictEqual({ kind: "AGENT", agentRunId: ownedAgentRunId })

    for (const [label, actor] of [
      ["other user", { kind: "USER", userId: otherUserId }],
      ["system", { kind: "SYSTEM" }],
      ["external agent", { kind: "AGENT", agentRunId: externalAgentRunId }],
    ] as const) {
      const rejected = graph(`journey-spoof-${label}-${randomUUID()}`, [
        "visit",
      ])
      await expect(
        createJourney(context, {
          ...write(rejected, `spoof ${label}`, "create"),
          actor,
        })
      ).rejects.toBeInstanceOf(JourneyInputError)
      expect(
        await prisma.journeyRevision.count({
          where: { journeyId: rejected.id },
        })
      ).toBe(0)
    }

    const branch = graph(`journey-selection-spoof-${randomUUID()}`, [
      "fork",
      "main",
      "alternative",
    ])
    const [fork, main, alternative] = branch.events.map((event) => event.id)
    branch.links = [
      {
        id: `${branch.id}-main`,
        journeyId: branch.id,
        fromEventId: fork!,
        toEventId: main!,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: `${branch.id}-alternative`,
        journeyId: branch.id,
        fromEventId: fork!,
        toEventId: alternative!,
        kind: "ALTERNATIVE",
        branchKey: "rain",
        rank: 2048,
        introducedRevision: 1,
      },
    ]
    const created = await createJourney(
      context,
      write(branch, "create branch", "create")
    )
    const spoofedSelection = structuredClone(created)
    spoofedSelection.revision = 2
    spoofedSelection.branchSelections.push({
      id: `${branch.id}-spoofed-selection`,
      journeyId: branch.id,
      forkEventId: fork!,
      selectedLinkId: branch.links[0]!.id,
      journeyRevision: 2,
      actor: { kind: "USER", userId: otherUserId },
      createdAt: later,
    })
    await expect(
      commitJourneyGraph(
        context,
        branch.id,
        write(spoofedSelection, "spoof selection actor", "spoof-selection"),
        1
      )
    ).rejects.toBeInstanceOf(JourneyInputError)
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: branch.id } })
    ).toBe(1)
  })

  it("rejects Transit/Content side effects before creating a revision", async () => {
    const initial = graph(`journey-readonly-${randomUUID()}`, ["visit"])
    const created = await createJourney(
      context,
      write(initial, "create journey", "create")
    )
    const changed = structuredClone(created)
    changed.revision = 2
    changed.eventAssetLinks.push({
      id: `${initial.id}-asset-link`,
      journeyId: initial.id,
      eventId: changed.events[0]!.id,
      assetId: "asset",
      assetChecksum: "checksum",
      role: "GALLERY",
      rank: 0,
      visibility: "PRIVATE",
      introducedRevision: 2,
      createdAt: later,
    })

    await expect(
      commitJourneyGraph(
        context,
        initial.id,
        write(changed, "forbidden content mutation", "content-mutation"),
        1
      )
    ).rejects.toBeInstanceOf(JourneyInputError)
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: initial.id } })
    ).toBe(1)
  })

  it("soft-deletes the current Journey while preserving readable revisions", async () => {
    const initial = graph(`journey-delete-${randomUUID()}`, ["visit"])
    await createJourney(context, write(initial, "create journey", "create"))

    expect(await deleteJourney(context, initial.id)).toBe(true)
    expect(await getJourney(context, initial.id)).toBeNull()
    const deleted = await getJourney(context, initial.id, {
      includeDeleted: true,
    })
    expect(deleted?.revision).toBe(2)
    expect(deleted?.deletedAt).toBeDefined()
    expect(
      (await getJourneyRevision(context, initial.id, 1))?.snapshot
    ).toEqual(initial)
    expect(
      (await getJourneyRevision(context, initial.id, 2))?.snapshot.deletedAt
    ).toBe(deleted?.deletedAt)
  })

  it("round-trips seeded Transit and Content fields without lossy defaults", async () => {
    const seeded = await getJourney(
      { userId: "dev-admin", role: "admin" },
      "dev-user-1-sample-journey",
      { includeDeleted: true }
    )
    expect(seeded).not.toBeNull()
    const transit = seeded!.events.find((event) => event.type === "TRANSIT")
    expect(transit).toMatchObject({
      type: "TRANSIT",
      detail: {
        activePlanningRunId: "dev-user-1-sample-transit-run",
        selectedPlanId: "dev-user-1-sample-transit-plan",
        routeState: "READY",
      },
    })
    expect(
      seeded!.transitPlanningRuns[0]?.plans[0]?.segments[0]?.coordinateSystem
    ).toBe("WGS84")
    expect(seeded!.eventAssetLinks[0]).toMatchObject({
      assetChecksum: "seed-photo-checksum",
      visibility: "JOURNEY",
    })
    expect(seeded!.observations[0]?.actor).toEqual({
      kind: "USER",
      userId: "dev-user-1",
    })
    expect(seeded!.eventSourceLinks[0]).toMatchObject({
      sourceDocumentChecksum: "seed-source-checksum",
      approvedForJourneySharing: true,
    })
  })
})
