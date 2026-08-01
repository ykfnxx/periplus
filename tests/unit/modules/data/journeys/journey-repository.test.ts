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
const latest = "2026-08-01T02:00:00.000Z"

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

function transit(
  id: string,
  journeyId: string,
  parentSectionEventId: string,
  fromEventId: string,
  toEventId: string,
  introducedRevision: number
): Extract<TargetJourneyEvent, { type: "TRANSIT" }> {
  return {
    id,
    journeyId,
    parentSectionEventId,
    placementStatus: "SCHEDULED",
    origin: "ORIGINAL",
    title: "transit",
    introducedRevision,
    createdAt: introducedRevision === 1 ? now : later,
    updatedAt: introducedRevision === 1 ? now : later,
    type: "TRANSIT",
    executionStatus: "PLANNED",
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
          id: `${journeyId}-occupied-parking-link`,
          journeyId,
          fromEventId: sectionA.id,
          toEventId: sectionB.id,
          kind: "ALTERNATIVE",
          branchKey: "occupied-parking-tuple",
          rank: 2048,
          introducedRevision: 1,
        },
        {
          id: `${journeyId}-retired-reverse-main`,
          journeyId,
          fromEventId: sectionB.id,
          toEventId: sectionA.id,
          kind: "MAIN",
          rank: 3072,
          introducedRevision: 1,
          retiredRevision: 1,
        },
        {
          id: `${journeyId}-retired-reverse-alternative`,
          journeyId,
          fromEventId: sectionB.id,
          toEventId: sectionA.id,
          kind: "ALTERNATIVE",
          branchKey: "retired-reverse",
          rank: 4096,
          introducedRevision: 1,
          retiredRevision: 1,
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
      8
    )
  })

  it("moves two same-revision current selections without parking collisions", async () => {
    const journeyId = `journey-multi-selection-move-${randomUUID()}`
    const sectionA = section(`${journeyId}-section-a`, journeyId, "A")
    const sectionB = section(`${journeyId}-section-b`, journeyId, "B")
    const child = (suffix: string) =>
      visit(`${journeyId}-${suffix}`, journeyId, suffix)
    const fork1 = child("fork-1")
    const selected1 = child("selected-1")
    const alternative1 = child("alternative-1")
    const join1 = child("join-1")
    const fork2 = child("fork-2")
    const selected2 = child("selected-2")
    const alternative2 = child("alternative-2")
    const join2 = child("join-2")
    const children = [
      fork1,
      selected1,
      alternative1,
      join1,
      fork2,
      selected2,
      alternative2,
      join2,
    ]
    for (const event of children) event.parentSectionEventId = sectionA.id

    const link = (
      suffix: string,
      fromEventId: string,
      toEventId: string,
      kind: "MAIN" | "ALTERNATIVE",
      rank = 1024
    ): TargetJourneyGraphSnapshot["links"][number] => ({
      id: `${journeyId}-${suffix}`,
      journeyId,
      fromEventId,
      toEventId,
      kind,
      ...(kind === "ALTERNATIVE" ? { branchKey: suffix } : {}),
      rank,
      introducedRevision: 1,
    })
    const selectedLink1 = link("fork-1-main", fork1.id, selected1.id, "MAIN")
    const selectedLink2 = link("fork-2-main", fork2.id, selected2.id, "MAIN")
    const initial: TargetJourneyGraphSnapshot = {
      ...graph(journeyId, []),
      events: [sectionA, sectionB, ...children],
      links: [
        link("root", sectionA.id, sectionB.id, "MAIN"),
        selectedLink1,
        link("selected-1-join", selected1.id, join1.id, "MAIN"),
        link("fork-1-alt", fork1.id, alternative1.id, "ALTERNATIVE", 2048),
        link("alternative-1-join", alternative1.id, join1.id, "ALTERNATIVE"),
        link("join-1-fork-2", join1.id, fork2.id, "MAIN"),
        selectedLink2,
        link("selected-2-join", selected2.id, join2.id, "MAIN"),
        link("fork-2-alt", fork2.id, alternative2.id, "ALTERNATIVE", 2048),
        link("alternative-2-join", alternative2.id, join2.id, "ALTERNATIVE"),
      ],
      branchSelections: [
        {
          id: `${journeyId}-selection-1`,
          journeyId,
          forkEventId: fork1.id,
          selectedLinkId: selectedLink1.id,
          journeyRevision: 1,
          actor: { kind: "USER", userId: ownerId },
          createdAt: now,
        },
        {
          id: `${journeyId}-selection-2`,
          journeyId,
          forkEventId: fork2.id,
          selectedLinkId: selectedLink2.id,
          journeyRevision: 1,
          actor: { kind: "USER", userId: ownerId },
          createdAt: now,
        },
      ],
    }
    const created = await createJourney(
      context,
      write(initial, "create two selected branches", "create")
    )
    const moved = structuredClone(created)
    moved.revision = 2
    for (const event of moved.events.filter((candidate) =>
      children.some((original) => original.id === candidate.id)
    )) {
      event.parentSectionEventId = sectionB.id
      event.updatedAt = later
    }

    const result = await commitJourneyGraph(
      context,
      journeyId,
      write(moved, "move two selected branches", "move-two-selections"),
      1
    )

    expect(result?.links).toStrictEqual(created.links)
    expect(result?.branchSelections).toStrictEqual(created.branchSelections)
    expect(
      result?.events
        .filter((event) =>
          children.some((childEvent) => childEvent.id === event.id)
        )
        .every((event) => event.parentSectionEventId === sectionB.id)
    ).toBe(true)
    expect(await prisma.journeyEventLink.count({ where: { journeyId } })).toBe(
      10
    )
  })

  it("permutes stable Link tuples without colliding with retired identities", async () => {
    const initial = graph(`journey-link-swap-${randomUUID()}`, [
      "a",
      "b",
      "c",
      "d",
    ])
    const [a, b, c, d] = initial.events.map((event) => event.id)
    const firstLinkId = `${initial.id}-alternative-1`
    const secondLinkId = `${initial.id}-alternative-2`
    initial.links.push(
      {
        id: firstLinkId,
        journeyId: initial.id,
        fromEventId: a!,
        toEventId: c!,
        kind: "ALTERNATIVE",
        branchKey: "first",
        rank: 4096,
        introducedRevision: 1,
      },
      {
        id: secondLinkId,
        journeyId: initial.id,
        fromEventId: b!,
        toEventId: d!,
        kind: "ALTERNATIVE",
        branchKey: "second",
        rank: 5120,
        introducedRevision: 1,
      }
    )
    const created = await createJourney(
      context,
      write(initial, "create swappable Links", "create")
    )

    const swapped = structuredClone(created)
    swapped.revision = 2
    const firstLink = swapped.links.find((link) => link.id === firstLinkId)!
    const secondLink = swapped.links.find((link) => link.id === secondLinkId)!
    firstLink.fromEventId = b!
    firstLink.toEventId = d!
    secondLink.fromEventId = a!
    secondLink.toEventId = c!

    const result = await commitJourneyGraph(
      context,
      initial.id,
      write(swapped, "swap stable Link tuples", "swap-links"),
      1
    )

    expect(result?.links.find((link) => link.id === firstLinkId)).toMatchObject(
      {
        fromEventId: b,
        toEventId: d,
        branchKey: "first",
      }
    )
    expect(
      result?.links.find((link) => link.id === secondLinkId)
    ).toMatchObject({
      fromEventId: a,
      toEventId: c,
      branchKey: "second",
    })
    expect(
      await prisma.journeyEvent.count({ where: { journeyId: initial.id } })
    ).toBe(4)
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

  it("restores an existing SECTION before inserting its new child", async () => {
    const journeyId = `journey-restore-parent-${randomUUID()}`
    const parent = section(`${journeyId}-section`, journeyId, "parent")
    const initial: TargetJourneyGraphSnapshot = {
      ...graph(journeyId, []),
      events: [parent],
    }
    const created = await createJourney(
      context,
      write(initial, "create parent section", "create")
    )

    const retired = structuredClone(created)
    retired.revision = 2
    retired.events[0]!.retiredRevision = 2
    retired.events[0]!.updatedAt = later
    const retiredResult = await commitJourneyGraph(
      context,
      journeyId,
      write(retired, "retire parent section", "retire-parent"),
      1
    )

    const restored = structuredClone(retiredResult!)
    restored.revision = 3
    delete restored.events[0]!.retiredRevision
    restored.events[0]!.updatedAt = latest
    const child = visit(`${journeyId}-child`, journeyId, "child", 3)
    child.parentSectionEventId = parent.id
    child.createdAt = latest
    child.updatedAt = latest
    restored.events.push(child)

    const result = await commitJourneyGraph(
      context,
      journeyId,
      write(restored, "restore parent and add child", "restore-add-child"),
      2
    )

    expect(result?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: parent.id,
          retiredRevision: undefined,
        }),
        expect.objectContaining({
          id: child.id,
          parentSectionEventId: parent.id,
          introducedRevision: 3,
        }),
      ])
    )
    expect(await prisma.journeyRevision.count({ where: { journeyId } })).toBe(3)
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

  it("retargets an existing Link before selecting it for the first time", async () => {
    const initial = graph(`journey-retarget-select-${randomUUID()}`, [
      "fork-a",
      "middle",
      "fork-b",
      "branch",
    ])
    const [forkA, middle, forkB, branch] = initial.events.map(
      (event) => event.id
    )
    const selectedLinkId = `${initial.id}-alternative`
    initial.links = [
      {
        id: `${initial.id}-main-a`,
        journeyId: initial.id,
        fromEventId: forkA!,
        toEventId: middle!,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: `${initial.id}-main-b`,
        journeyId: initial.id,
        fromEventId: middle!,
        toEventId: forkB!,
        kind: "MAIN",
        rank: 2048,
        introducedRevision: 1,
      },
      {
        id: selectedLinkId,
        journeyId: initial.id,
        fromEventId: forkA!,
        toEventId: branch!,
        kind: "ALTERNATIVE",
        branchKey: "retargeted",
        rank: 2048,
        introducedRevision: 1,
      },
    ]
    const created = await createJourney(
      context,
      write(initial, "create retargetable branch", "create")
    )

    const retargeted = structuredClone(created)
    retargeted.revision = 2
    retargeted.links.find((link) => link.id === selectedLinkId)!.fromEventId =
      forkB!
    retargeted.branchSelections.push({
      id: `${initial.id}-selection`,
      journeyId: initial.id,
      forkEventId: forkB!,
      selectedLinkId,
      journeyRevision: 2,
      actor: { kind: "USER", userId: ownerId },
      createdAt: later,
    })

    const result = await commitJourneyGraph(
      context,
      initial.id,
      write(
        retargeted,
        "retarget and select existing branch",
        "retarget-select"
      ),
      1
    )

    expect(
      result?.links.find((link) => link.id === selectedLinkId)
    ).toMatchObject({
      fromEventId: forkB,
      toEventId: branch,
      retiredRevision: undefined,
    })
    expect(result?.branchSelections).toEqual([
      expect.objectContaining({
        forkEventId: forkB,
        selectedLinkId,
        journeyRevision: 2,
      }),
    ])
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: initial.id } })
    ).toBe(2)
  })

  it("parks the selected MAIN path before activating its replacement", async () => {
    const initial = graph(`journey-main-selection-cycle-${randomUUID()}`, [
      "fork",
      "branch-a",
      "join",
    ])
    const [fork, branchA, join] = initial.events.map((event) => event.id)
    const selectionAId = `${initial.id}-selection-a`
    initial.branchSelections = [
      {
        id: selectionAId,
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
      write(initial, "create selected MAIN path", "create")
    )

    const replaced = structuredClone(created)
    replaced.revision = 2
    const retiredBranch = replaced.events.find((event) => event.id === branchA)!
    retiredBranch.retiredRevision = 2
    retiredBranch.updatedAt = later
    for (const link of replaced.links) link.retiredRevision = 2
    const branchB = visit(`${initial.id}-branch-b`, initial.id, "branch B", 2)
    replaced.events.push(branchB)
    const forkBLinkId = `${initial.id}-fork-b`
    const bJoinLinkId = `${initial.id}-b-join`
    replaced.links.push(
      {
        id: forkBLinkId,
        journeyId: initial.id,
        fromEventId: fork!,
        toEventId: branchB.id,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 2,
      },
      {
        id: bJoinLinkId,
        journeyId: initial.id,
        fromEventId: branchB.id,
        toEventId: join!,
        kind: "MAIN",
        rank: 2048,
        introducedRevision: 2,
      }
    )
    replaced.branchSelections.push({
      id: `${initial.id}-selection-b`,
      journeyId: initial.id,
      forkEventId: fork!,
      selectedLinkId: forkBLinkId,
      journeyRevision: 2,
      supersedesId: selectionAId,
      actor: { kind: "USER", userId: ownerId },
      createdAt: later,
    })

    const result = await commitJourneyGraph(
      context,
      initial.id,
      write(replaced, "replace selected MAIN path", "replace-main-path"),
      1
    )

    expect(result?.events.find((event) => event.id === branchA)).toMatchObject({
      retiredRevision: 2,
    })
    expect(result?.links.find((link) => link.id === forkBLinkId)).toMatchObject(
      {
        fromEventId: fork,
        toEventId: branchB.id,
        retiredRevision: undefined,
      }
    )
    expect(result?.branchSelections.at(-1)).toMatchObject({
      selectedLinkId: forkBLinkId,
      supersedesId: selectionAId,
    })
    expect(
      await prisma.journeyEvent.count({ where: { journeyId: initial.id } })
    ).toBe(4)
    expect(
      await prisma.journeyEventLink.count({ where: { journeyId: initial.id } })
    ).toBe(4)
  })

  it("restores a retired stable branch before reselecting it", async () => {
    const initial = graph(`journey-branch-restore-${randomUUID()}`, [
      "fork",
      "branch-a",
      "branch-b",
      "join",
    ])
    const [fork, branchA, branchB, join] = initial.events.map(
      (event) => event.id
    )
    const forkALinkId = `${initial.id}-fork-a`
    const aJoinLinkId = `${initial.id}-a-join`
    const forkBLinkId = `${initial.id}-fork-b`
    initial.links = [
      {
        id: forkALinkId,
        journeyId: initial.id,
        fromEventId: fork!,
        toEventId: branchA!,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: aJoinLinkId,
        journeyId: initial.id,
        fromEventId: branchA!,
        toEventId: join!,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: forkBLinkId,
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
    const selectionAId = `${initial.id}-selection-a`
    const selectionBId = `${initial.id}-selection-b`
    initial.branchSelections = [
      {
        id: selectionAId,
        journeyId: initial.id,
        forkEventId: fork!,
        selectedLinkId: forkALinkId,
        journeyRevision: 1,
        actor: { kind: "USER", userId: ownerId },
        createdAt: now,
      },
    ]
    const created = await createJourney(
      context,
      write(initial, "create restorable branch", "create")
    )

    const selectedB = structuredClone(created)
    selectedB.revision = 2
    selectedB.branchSelections.push({
      id: selectionBId,
      journeyId: initial.id,
      forkEventId: fork!,
      selectedLinkId: forkBLinkId,
      journeyRevision: 2,
      supersedesId: selectionAId,
      actor: { kind: "USER", userId: ownerId },
      createdAt: later,
    })
    const retiredBranchA = selectedB.events.find(
      (event) => event.id === branchA
    )!
    retiredBranchA.retiredRevision = 2
    retiredBranchA.updatedAt = later
    for (const link of selectedB.links.filter((candidate) =>
      [forkALinkId, aJoinLinkId].includes(candidate.id)
    )) {
      link.retiredRevision = 2
    }
    const retired = await commitJourneyGraph(
      context,
      initial.id,
      write(selectedB, "select B and retire A", "select-b-retire-a"),
      1
    )

    const restoredA = structuredClone(retired!)
    restoredA.revision = 3
    const restoredBranchA = restoredA.events.find(
      (event) => event.id === branchA
    )!
    delete restoredBranchA.retiredRevision
    restoredBranchA.updatedAt = latest
    for (const link of restoredA.links.filter((candidate) =>
      [forkALinkId, aJoinLinkId].includes(candidate.id)
    )) {
      delete link.retiredRevision
    }
    restoredA.branchSelections.push({
      id: `${initial.id}-selection-a-2`,
      journeyId: initial.id,
      forkEventId: fork!,
      selectedLinkId: forkALinkId,
      journeyRevision: 3,
      supersedesId: selectionBId,
      actor: { kind: "USER", userId: ownerId },
      createdAt: latest,
    })
    const result = await commitJourneyGraph(
      context,
      initial.id,
      write(restoredA, "restore and reselect A", "restore-reselect-a"),
      2
    )

    expect(result?.events.find((event) => event.id === branchA)).toMatchObject({
      id: branchA,
      retiredRevision: undefined,
    })
    expect(
      result?.links
        .filter((link) => [forkALinkId, aJoinLinkId].includes(link.id))
        .every((link) => link.retiredRevision === undefined)
    ).toBe(true)
    expect(result?.branchSelections.at(-1)?.selectedLinkId).toBe(forkALinkId)
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: initial.id } })
    ).toBe(3)
  })

  it("moves existing Transit endpoints before creating a dependent detail", async () => {
    const journeyId = `journey-new-transit-${randomUUID()}`
    const sectionA = section(`${journeyId}-section-a`, journeyId, "A")
    const sectionB = section(`${journeyId}-section-b`, journeyId, "B")
    const from = visit(`${journeyId}-from`, journeyId, "from")
    const to = visit(`${journeyId}-to`, journeyId, "to")
    from.parentSectionEventId = sectionA.id
    to.parentSectionEventId = sectionA.id
    const initial: TargetJourneyGraphSnapshot = {
      ...graph(journeyId, []),
      events: [sectionA, sectionB, from, to],
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
          id: `${journeyId}-visit-link`,
          journeyId,
          fromEventId: from.id,
          toEventId: to.id,
          kind: "MAIN",
          rank: 1024,
          introducedRevision: 1,
        },
      ],
    }
    const created = await createJourney(
      context,
      write(initial, "create movable Transit endpoints", "create")
    )

    const moved = structuredClone(created)
    moved.revision = 2
    for (const event of moved.events.filter((candidate) =>
      [from.id, to.id].includes(candidate.id)
    )) {
      event.parentSectionEventId = sectionB.id
      event.updatedAt = later
    }
    const transitEvent = transit(
      `${journeyId}-transit`,
      journeyId,
      sectionB.id,
      from.id,
      to.id,
      2
    )
    moved.events.push(transitEvent)
    moved.links.push({
      id: `${journeyId}-transit-link`,
      journeyId,
      fromEventId: to.id,
      toEventId: transitEvent.id,
      kind: "MAIN",
      rank: 2048,
      introducedRevision: 2,
    })

    const result = await commitJourneyGraph(
      context,
      journeyId,
      write(moved, "move endpoints and add Transit", "move-add-transit"),
      1
    )

    expect(
      result?.events
        .filter((event) => [from.id, to.id].includes(event.id))
        .every((event) => event.parentSectionEventId === sectionB.id)
    ).toBe(true)
    expect(
      result?.events.find((event) => event.id === transitEvent.id)
    ).toMatchObject({
      parentSectionEventId: sectionB.id,
      type: "TRANSIT",
      detail: {
        plannedFromEventId: from.id,
        plannedToEventId: to.id,
      },
    })
    expect(result?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${journeyId}-visit-link`,
          retiredRevision: undefined,
        }),
        expect.objectContaining({
          id: `${journeyId}-transit-link`,
          fromEventId: to.id,
          toEventId: transitEvent.id,
        }),
      ])
    )
    expect(await prisma.journeyRevision.count({ where: { journeyId } })).toBe(2)
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
          runtimeOwnerId: `test-runtime-${runOwnerId}`,
          heartbeatAt: new Date(now),
          leaseExpiresAt: new Date("2026-08-01T00:01:00.000Z"),
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

    const crossOwnerWorkspaceJourney = graph(
      `journey-cross-owner-workspace-${randomUUID()}`,
      ["visit"]
    )
    const crossOwnerWorkspaceId = `workspace-${randomUUID()}`
    const crossOwnerWorkspaceRevisionId = `workspace-revision-${randomUUID()}`
    const crossOwnerWorkspaceCreatedAt = new Date()
    const crossOwnerGraphIdentity = {
      id: crossOwnerWorkspaceJourney.id,
      ownerId: otherUserId,
    }
    await prisma.workspaceSession.create({
      data: {
        id: crossOwnerWorkspaceId,
        ownerId: otherUserId,
        headGraphJson: JSON.stringify(crossOwnerGraphIdentity),
        expiresAt: new Date(
          crossOwnerWorkspaceCreatedAt.getTime() + 60 * 60 * 1000
        ),
        lastAccessAt: crossOwnerWorkspaceCreatedAt,
        createdAt: crossOwnerWorkspaceCreatedAt,
      },
    })
    await prisma.workspaceRevision.create({
      data: {
        id: crossOwnerWorkspaceRevisionId,
        workspaceId: crossOwnerWorkspaceId,
        revision: 1,
        commandName: "WORKSPACE_COMMIT",
        beforeGraphJson: JSON.stringify(crossOwnerGraphIdentity),
        afterGraphJson: JSON.stringify(crossOwnerGraphIdentity),
        patchJson: "[]",
        inversePatchJson: "[]",
        actorKind: "USER",
        actorUserId: otherUserId,
        idempotencyKey: "cross-owner-workspace-revision",
      },
    })
    await expect(
      createJourney(context, {
        ...write(
          crossOwnerWorkspaceJourney,
          "cross-owner workspace provenance",
          "create"
        ),
        workspaceRevisionId: crossOwnerWorkspaceRevisionId,
      })
    ).rejects.toBeInstanceOf(JourneyInputError)
    expect(
      await prisma.journey.count({
        where: { id: crossOwnerWorkspaceJourney.id },
      })
    ).toBe(0)
    expect(
      await prisma.journeyRevision.count({
        where: { journeyId: crossOwnerWorkspaceJourney.id },
      })
    ).toBe(0)

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
