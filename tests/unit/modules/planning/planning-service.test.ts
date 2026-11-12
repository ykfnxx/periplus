// @vitest-environment node
import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"
import type { AuthContext } from "@/modules/auth/server/context"
import { prisma } from "@/modules/data/db/prisma"
import {
  createJourney,
  getJourney,
  commitJourney,
} from "@/modules/data/journeys/journey-repository"
import {
  eventFixture,
  journeyFixture,
  transitJourneyFixture,
} from "@/tests/fixtures/journey"
import type {
  PlanningEdit,
  PlanningStarted,
} from "@/modules/planning/contracts"
import type {
  PlanningRuntime,
  PlanningRunInput,
  PlanningFieldSource,
  PlanningRuntimeResult,
} from "@/modules/planning/server/runtime-contract"
import {
  applyPlanningProposal,
  cancelPlanningRun,
  createPlanningProposal,
  discardPlanningProposal,
  executePlanningRun,
  getPlanningProposal,
  startPlanningTurn,
} from "@/modules/planning/server/service"
const user: AuthContext = { userId: randomUUID(), role: "user" }
const stranger: AuthContext = { userId: randomUUID(), role: "user" }
let eventPrefix = ""
const eid = (id: string) => `${eventPrefix}-${id}`
function resolveTestEdits(edits: PlanningEdit[]) {
  const value = structuredClone(edits)
  const visit = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return
    for (const [key, v] of Object.entries(obj)) {
      if (
        ["eventId", "afterEventId", "fromEventId", "toEventId"].includes(key) &&
        typeof v === "string" &&
        ["L", "G", "S", "T1", "T2"].includes(v)
      )
        (obj as Record<string, unknown>)[key] = eid(v)
      else visit(v)
    }
  }
  visit(value)
  return value
}
const message = "11月15日在杭州调整行程，安排午餐和交通"
beforeAll(async () => {
  for (const context of [user, stranger])
    await prisma.user.create({
      data: {
        id: context.userId,
        name: "Planner",
        email: `${context.userId}@example.test`,
      },
    })
})
function sources(operations: PlanningEdit[], quote = message) {
  const result: PlanningFieldSource[] = []
  const walk = (obj: unknown, path: string, operation: number) => {
    if (obj === null || obj === undefined) return
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj))
        walk(v, `${path}.${k}`, operation)
      return
    }
    result.push({ kind: "user", quote, operation, path })
  }
  for (const [i, op] of operations.entries()) {
    if (op.command.name === "event.add") walk(op.command.content, "content", i)
    if (op.command.name === "event.update") walk(op.command.patch, "patch", i)
  }
  return result
}
const runtime = (
  edits: PlanningEdit[],
  extra: Partial<
    Extract<PlanningRuntimeResult["output"], { kind: "changes" }>
  > = {}
): PlanningRuntime => {
  const operations = resolveTestEdits(edits)
  return {
    canRetain: () => false,
    run: async () => ({
      output: {
        kind: "changes",
        operations,
        sources: sources(operations),
        constraints: [],
        unverified: [],
        ...extra,
      },
      displayOnlyValues: [],
      permittedFacts: [],
    }),
  }
}
async function saved(events = ["L", "T1", "G", "T2", "S"]) {
  const journey = journeyFixture(user.userId, randomUUID())
  eventPrefix = journey.id
  journey.events = events.map((id) => ({
    ...eventFixture(eid(id), user.userId),
    title: id,
    date: "2026-11-15",
  }))
  if (events.includes("L")) {
    const assetId = randomUUID()
    await prisma.asset.create({
      data: {
        id: assetId,
        ownerId: user.userId,
        kind: "IMAGE",
        visibility: "PRIVATE",
        storageKey: assetId,
        mimeType: "image/png",
        sizeBytes: 1,
        checksum: "fixture",
      },
    })
    journey.events.find((e) => e.id === eid("L"))!.photos = [
      {
        assetId,
        caption: "保留",
        url: `/api/assets/${assetId}/file`,
        isCover: true,
        source: { userId: user.userId, name: "Planner", image: null },
        canEdit: true,
        location: null,
      },
    ]
  }
  if (events.includes("S"))
    journey.events.find((e) => e.id === eid("S"))!.body = "车站备注"
  if (events.includes("T")) {
    const t = journey.events.find((e) => e.title === "T")!
    t.category = "TRANSIT"
    Object.assign(t, {
      transit: {
        fromName: "午餐",
        toName: "车站",
        fromEventId: eid("L"),
        toEventId: eid("S"),
        transportMode: "WALK",
        routeState: "EMPTY",
      },
    })
  }
  await createJourney(user, {
    journey,
    operation: "test",
    patch: [],
    inversePatch: [],
    idempotencyKey: randomUUID(),
  })
  return journey
}
async function first(journeyId: string, operations: PlanningEdit[]) {
  const p = await createPlanningProposal(user, journeyId, {
    requestId: randomUUID(),
    message,
  })
  await executePlanningRun(
    user,
    journeyId,
    p.proposalId,
    p.runId,
    runtime(operations)
  )
  return p
}
const add = (
  draftRef: string,
  afterEventId: string | { draftRef: string } | null = null
): PlanningEdit => ({
  draftRef,
  command: {
    name: "event.add",
    afterEventId,
    content: { title: "新安排", category: "VISIT", date: "2026-11-15" },
  },
})
async function changed(journeyId: string) {
  const before = (await getJourney(user, journeyId))!
  const next = { ...before, revision: before.revision + 1, title: "同行人修改" }
  await commitJourney(
    user,
    journeyId,
    {
      journey: next,
      operation: "test",
      patch: [],
      inversePatch: [],
      idempotencyKey: randomUUID(),
    },
    before.revision,
    { name: "journey.update", patch: { title: next.title } }
  )
}
async function turn(
  p: PlanningStarted,
  journeyId: string,
  version: number,
  operations: PlanningEdit[],
  extra = {}
) {
  const next = await startPlanningTurn(user, journeyId, p.proposalId, {
    requestId: randomUUID(),
    parentVersion: version,
    message,
    ...extra,
  })
  await executePlanningRun(
    user,
    journeyId,
    p.proposalId,
    next.runId,
    runtime(operations)
  )
  return next
}
describe("planning lifecycle and atomic domain apply", () => {
  it("previews two cumulative turns then writes one revision, preserving IDs and attachments", async () => {
    const j = await saved()
    const edits: PlanningEdit[] = [
      ...["T1", "T2", "G"].map((eventId) => ({
        command: { name: "event.remove" as const, eventId },
      })),
      {
        draftRef: "d1",
        command: {
          name: "event.add",
          afterEventId: "L",
          content: {
            title: "打车去杭州东站",
            category: "TRANSIT",
            date: "2026-11-15",
            transit: {
              fromName: "湖滨午餐",
              toName: "杭州东站",
              fromEventId: "L",
              toEventId: "S",
              transportMode: "TAXI",
            },
          },
        },
      },
    ]
    const p = await first(j.id, edits)
    const v1 = await getPlanningProposal(user, j.id, p.proposalId)
    expect(v1.latestVersion).toBe(1)
    await turn(p, j.id, 1, [
      {
        command: {
          name: "event.update",
          eventId: "L",
          patch: {
            date: "2026-11-15",
            time: "11:30",
            timeZone: "Asia/Shanghai",
            startAt: "2026-11-15T03:30:00.000Z",
          },
        },
      },
    ])
    const v2 = await getPlanningProposal(user, j.id, p.proposalId)
    expect(v2.latestVersion).toBe(2)
    expect(
      v2.preview?.delta
        .filter((d) => d.changedFields.length)
        .map((d) => d.eventId)
    ).toEqual([eid("L")])
    expect((await getJourney(user, j.id))!.events).toHaveLength(5)
    const receipts = await Promise.all([
      applyPlanningProposal(user, j.id, p.proposalId, { version: 2 }),
      applyPlanningProposal(user, j.id, p.proposalId, { version: 2 }),
    ])
    expect(receipts.map((r) => r.appliedRevision)).toEqual([2, 2])
    expect(receipts.filter((r) => r.replayed)).toHaveLength(1)
    const current = (await getJourney(user, j.id))!
    expect(current.events.map((e) => e.id)).toEqual([
      eid("L"),
      v2.preview!.events[1]!.id,
      eid("S"),
    ])
    expect(current.events[0]!.photos).toHaveLength(1)
    expect(current.events[0]!.time).toBe("11:30")
    expect(current.events[2]!.body).toBe("车站备注")
    expect(current.events[1]!.transit?.routeState).toBe("EMPTY")
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: j.id } })
    ).toBe(2)
    await changed(j.id)
    expect(
      (await applyPlanningProposal(user, j.id, p.proposalId, { version: 2 }))
        .appliedRevision
    ).toBe(2)
  })
  it("resolves empty-Journey draft references and new transit in one batch", async () => {
    const j = await saved([])
    const p = await first(j.id, [
      add("d1"),
      add("d2", { draftRef: "d1" }),
      {
        draftRef: "t",
        command: {
          name: "event.add",
          afterEventId: { draftRef: "d1" },
          content: {
            category: "TRANSIT",
            date: "2026-11-15",
            transit: {
              fromName: "午餐",
              toName: "车站",
              fromEventId: { draftRef: "d1" },
              toEventId: { draftRef: "d2" },
              transportMode: "WALK",
            },
          },
        },
      },
    ])
    const preview = await getPlanningProposal(user, j.id, p.proposalId)
    expect((await getJourney(user, j.id))!.events).toEqual([])
    await applyPlanningProposal(user, j.id, p.proposalId, { version: 1 })
    const result = (await getJourney(user, j.id))!
    expect(new Set(result.events.map((e) => e.id)).size).toBe(3)
    expect(result.events[1]!.transit?.fromEventId).toBe(result.events[0]!.id)
    expect(result.events[1]!.transit?.toEventId).toBe(result.events[2]!.id)
    expect(result.events.map((e) => e.id)).toEqual(
      preview.preview!.events.map((e) => e.id)
    )
  })
  it("deduplicates requests, rejects stale versions, and requires explicit rebase", async () => {
    const j = await saved([]),
      request = { requestId: randomUUID(), message }
    const p = await createPlanningProposal(user, j.id, request)
    expect(await createPlanningProposal(user, j.id, request)).toEqual(p)
    await expect(
      createPlanningProposal(user, j.id, { ...request, message: "different" })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" })
    await expect(
      startPlanningTurn(user, j.id, p.proposalId, {
        requestId: randomUUID(),
        parentVersion: 0,
        message,
      })
    ).rejects.toMatchObject({ code: "RUN_ACTIVE" })
    await executePlanningRun(
      user,
      j.id,
      p.proposalId,
      p.runId,
      runtime([add("d1")])
    )
    await expect(
      applyPlanningProposal(user, j.id, p.proposalId, { version: 0 })
    ).rejects.toMatchObject({ code: "PROPOSAL_VERSION_CONFLICT" })
    await changed(j.id)
    await expect(
      applyPlanningProposal(user, j.id, p.proposalId, { version: 1 })
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
    await expect(
      startPlanningTurn(user, j.id, p.proposalId, {
        requestId: randomUUID(),
        parentVersion: 1,
        message,
      })
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
    await turn(p, j.id, 1, [add("d1")], { mode: "rebase" })
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).baseRevision
    ).toBe(2)
    expect(
      (await applyPlanningProposal(user, j.id, p.proposalId, { version: 2 }))
        .appliedRevision
    ).toBe(3)
  })
  it("invalidates a cancelled run before abort and ignores its delayed result", async () => {
    const j = await saved([]),
      p = await first(j.id, [add("d1")])
    const next = await startPlanningTurn(user, j.id, p.proposalId, {
      requestId: randomUUID(),
      parentVersion: 1,
      message,
    })
    let release!: () => void, entered!: () => void, input!: PlanningRunInput
    const ready = new Promise<void>((r) => {
      entered = r
    })
    const gate = new Promise<void>((r) => {
      release = r
    })
    const task = executePlanningRun(user, j.id, p.proposalId, next.runId, {
      canRetain: () => false,
      run: async (i) => {
        input = i
        entered()
        await gate
        return runtime([add("d2")]).run(i)
      },
    })
    await ready
    expect(
      (await cancelPlanningRun(user, j.id, p.proposalId, next.runId)).status
    ).toBe("CANCELLED")
    expect(input.signal.aborted).toBe(true)
    release()
    await task
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).latestVersion
    ).toBe(1)
    const third = await startPlanningTurn(user, j.id, p.proposalId, {
      requestId: randomUUID(),
      parentVersion: 1,
      message,
    })
    await prisma.planningRun.update({
      where: { id: third.runId },
      data: { deadline: new Date(0) },
    })
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).run?.status
    ).toBe("TIMED_OUT")
  })
  it("keeps questions at the parent version and rejects stale answers and foreign choices", async () => {
    const j = await saved([]),
      p = await first(j.id, [add("d1")])
    const q = await startPlanningTurn(user, j.id, p.proposalId, {
      requestId: randomUUID(),
      parentVersion: 1,
      message,
    })
    await executePlanningRun(user, j.id, p.proposalId, q.runId, {
      canRetain: () => false,
      run: async () => ({
        output: {
          kind: "question",
          message: "确认日期",
          choices: [{ choiceRef: "choice-1", label: "继续" }],
        },
        displayOnlyValues: [],
        permittedFacts: [],
      }),
    })
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).latestVersion
    ).toBe(1)
    await expect(
      startPlanningTurn(user, j.id, p.proposalId, {
        requestId: randomUUID(),
        parentVersion: 1,
        message,
        replyToRunId: p.runId,
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(
      startPlanningTurn(user, j.id, p.proposalId, {
        requestId: randomUUID(),
        parentVersion: 1,
        message,
        replyToRunId: q.runId,
        choiceRef: "foreign",
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await turn(p, j.id, 1, [], { replyToRunId: q.runId, choiceRef: "choice-1" })
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).latestVersion
    ).toBe(1)
  })
  it("publishes an empty diff after withdrawing additions and refuses to apply it", async () => {
    const j = await saved([]),
      p = await first(j.id, [add("d1")])
    await turn(p, j.id, 1, [
      { command: { name: "event.remove", eventId: { draftRef: "d1" } } },
    ])
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).preview
        ?.committableDiff
    ).toEqual([])
    await expect(
      applyPlanningProposal(user, j.id, p.proposalId, { version: 2 })
    ).rejects.toMatchObject({ code: "EMPTY_DIFF" })
    expect((await getJourney(user, j.id))!.revision).toBe(1)
  })
  it("checks identity before receipt replay and rolls back a final command after permission loss", async () => {
    const j = await saved(["L", "G"])
    const actor: AuthContext = { ...stranger, role: "admin" }
    await prisma.user.update({
      where: { id: actor.userId },
      data: { role: "admin" },
    })
    await prisma.journeyMember.create({
      data: { userId: actor.userId, journeyId: j.id },
    })
    const p = await createPlanningProposal(actor, j.id, {
      requestId: randomUUID(),
      message,
    })
    const edits: PlanningEdit[] = [
      add("mine"),
      {
        command: {
          name: "event.update",
          eventId: "G",
          patch: { title: "更改" },
        },
      },
    ]
    await executePlanningRun(actor, j.id, p.proposalId, p.runId, runtime(edits))
    expect(
      (await getPlanningProposal(actor, j.id, p.proposalId)).latestVersion
    ).toBe(1)
    await prisma.user.update({
      where: { id: actor.userId },
      data: { role: "user" },
    })
    await expect(
      applyPlanningProposal(stranger, j.id, p.proposalId, { version: 1 })
    ).rejects.toThrow("own content")
    expect((await getJourney(user, j.id))!.events.map((e) => e.id)).toEqual([
      eid("L"),
      eid("G"),
    ])
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: j.id } })
    ).toBe(1)
    expect(
      await prisma.planningReceipt.count({
        where: { proposalId: p.proposalId },
      })
    ).toBe(0)
    expect(
      (
        await prisma.planningProposal.findUniqueOrThrow({
          where: { id: p.proposalId },
        })
      ).status
    ).toBe("OPEN")
    await expect(
      getPlanningProposal(user, j.id, p.proposalId)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await prisma.journeyMember.delete({
      where: { journeyId_userId: { journeyId: j.id, userId: stranger.userId } },
    })
    await expect(
      applyPlanningProposal(stranger, j.id, p.proposalId, { version: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
  it("does not persist display-only strings in questions or constraints", async () => {
    const j = await saved([])
    const p = await createPlanningProposal(user, j.id, {
      requestId: randomUUID(),
      message,
    })
    await executePlanningRun(user, j.id, p.proposalId, p.runId, {
      canRetain: () => false,
      run: async () => ({
        output: { kind: "question", message: "选择秘密商家", choices: [] },
        displayOnlyValues: ["秘密商家"],
        permittedFacts: [],
      }),
    })
    const result = await getPlanningProposal(user, j.id, p.proposalId)
    expect(result.run?.status).toBe("FAILED")
    expect(result.question).toBeNull()
    expect(
      JSON.stringify(
        await prisma.planningRun.findUnique({ where: { id: p.runId } })
      )
    ).not.toContain("秘密商家")
  })
  it("discards the specified version and never accepts a fresh mutation afterward", async () => {
    const j = await saved([]),
      p = await first(j.id, [add("d1")])
    expect(
      await discardPlanningProposal(user, j.id, p.proposalId, { version: 1 })
    ).toMatchObject({ status: "DISCARDED" })
    await expect(
      startPlanningTurn(user, j.id, p.proposalId, {
        requestId: randomUUID(),
        parentVersion: 1,
        message,
      })
    ).rejects.toMatchObject({ code: "PROPOSAL_CLOSED" })
    await expect(
      applyPlanningProposal(user, j.id, p.proposalId, { version: 1 })
    ).rejects.toMatchObject({ code: "PROPOSAL_CLOSED" })
  })
  it("answers a rebase question against its target revision before confirmation", async () => {
    const j = await saved(["L"])
    const p = await first(j.id, [
      {
        command: {
          name: "event.update",
          eventId: "L",
          patch: { title: "午餐安排" },
        },
      },
    ])
    const before = (await getJourney(user, j.id))!
    const next = structuredClone(before)
    next.revision++
    next.events[0]!.title = "同行人更改"
    await commitJourney(
      user,
      j.id,
      {
        journey: next,
        operation: "test",
        patch: [],
        inversePatch: [],
        idempotencyKey: randomUUID(),
      },
      1,
      {
        name: "event.update",
        eventId: eid("L"),
        patch: { title: "同行人更改" },
      }
    )
    const q = await startPlanningTurn(user, j.id, p.proposalId, {
      requestId: randomUUID(),
      parentVersion: 1,
      message,
      mode: "rebase",
    })
    let conflicts: string[] = []
    await executePlanningRun(user, j.id, p.proposalId, q.runId, {
      canRetain: () => false,
      run: async (input) => {
        conflicts = input.rebaseConflicts
        return {
          output: {
            kind: "question",
            message: "是否保留同行人的更改",
            choices: [],
          },
          displayOnlyValues: [],
          permittedFacts: [],
        }
      },
    })
    expect(conflicts).not.toHaveLength(0)
    const answer = await startPlanningTurn(user, j.id, p.proposalId, {
      requestId: randomUUID(),
      parentVersion: 1,
      message,
      replyToRunId: q.runId,
    })
    await executePlanningRun(user, j.id, p.proposalId, answer.runId, {
      ...runtime([
        {
          command: {
            name: "event.update",
            eventId: "L",
            patch: { time: "11:30" },
          },
        },
      ]),
      run: async (input) => {
        expect(input.mode).toBe("rebase")
        expect(input.baseRevision).toBe(2)
        expect(input.question?.runId).toBe(q.runId)
        return runtime([
          {
            command: {
              name: "event.update",
              eventId: "L",
              patch: { time: "11:30" },
            },
          },
        ]).run(input)
      },
    })
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).preview?.version
    ).toBe(2)
    await applyPlanningProposal(user, j.id, p.proposalId, { version: 2 })
    expect((await getJourney(user, j.id))!.events[0]!.title).toBe("同行人更改")
  })
  it("blocks hard constraints and a changed field-retention permission", async () => {
    const j = await saved([]),
      p = await createPlanningProposal(user, j.id, {
        requestId: randomUUID(),
        message,
      })
    await executePlanningRun(
      user,
      j.id,
      p.proposalId,
      p.runId,
      runtime([add("d1")], {
        constraints: [
          {
            id: "deadline",
            text: "必须按时到站",
            hard: true,
            satisfied: false,
            verificationRequired: false,
          },
        ],
      })
    )
    await expect(
      applyPlanningProposal(user, j.id, p.proposalId, { version: 1 })
    ).rejects.toMatchObject({ code: "PREVIEW_REQUIRED" })
    const q = await createPlanningProposal(user, j.id, {
      requestId: randomUUID(),
      message,
    })
    const edits = [add("d1")]
    const providerSource: PlanningFieldSource = {
      operation: 0,
      path: "content.title",
      kind: "provider",
      provider: "licensed",
      policyId: "policy",
      factRef: "f1",
    }
    const authorized: PlanningRuntime = {
      canRetain: () => true,
      run: async () => ({
        output: {
          kind: "changes",
          operations: edits,
          constraints: [],
          unverified: [],
          sources: [
            ...sources(edits).filter((s) => s.path !== "content.title"),
            providerSource,
          ],
        },
        displayOnlyValues: [],
        permittedFacts: [
          {
            factRef: "f1",
            provider: "licensed",
            policyId: "policy",
            value: "新安排",
          },
        ],
      }),
    }
    await executePlanningRun(user, j.id, q.proposalId, q.runId, authorized)
    expect(
      (await getPlanningProposal(user, j.id, q.proposalId)).latestVersion
    ).toBe(1)
    await expect(
      applyPlanningProposal(
        user,
        j.id,
        q.proposalId,
        { version: 1 },
        { canRetain: () => false }
      )
    ).rejects.toMatchObject({ code: "PREVIEW_REQUIRED" })
    expect((await getJourney(user, j.id))!.revision).toBe(1)
  })
  it("rejects an inconsistent clock, forward reference and removed transit endpoint", async () => {
    const j = await saved([])
    const p = await first(j.id, [
      {
        draftRef: "bad",
        command: {
          name: "event.add",
          afterEventId: null,
          content: {
            category: "VISIT",
            date: "2026-11-15",
            time: "11:30",
            timeZone: "Asia/Shanghai",
            startAt: "2026-11-15T09:00:00.000Z",
          },
        },
      },
    ])
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).run?.status
    ).toBe("FAILED")
    const q = await first(j.id, [
      add("d1", { draftRef: "later" }),
      add("later"),
    ])
    expect(
      (await getPlanningProposal(user, j.id, q.proposalId)).latestVersion
    ).toBe(0)
    const connected = await saved(["L", "T", "S"])
    const removed = await first(connected.id, [
      { command: { name: "event.remove", eventId: "L" } },
    ])
    expect(
      (await getPlanningProposal(user, connected.id, removed.proposalId)).run
        ?.status
    ).toBe("FAILED")
    expect((await getJourney(user, connected.id))!.events).toHaveLength(3)
  })
  it("allows explicit rebase to replace a pending question after the Journey changes", async () => {
    const j = await saved([]),
      p = await first(j.id, [add("d1")])
    const q = await startPlanningTurn(user, j.id, p.proposalId, {
      requestId: randomUUID(),
      parentVersion: 1,
      message,
    })
    await executePlanningRun(user, j.id, p.proposalId, q.runId, {
      canRetain: () => false,
      run: async () => ({
        output: { kind: "question", message: "确认日期", choices: [] },
        displayOnlyValues: [],
        permittedFacts: [],
      }),
    })
    await changed(j.id)
    await turn(p, j.id, 1, [add("d1")], { mode: "rebase" })
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).baseRevision
    ).toBe(2)
  })
  it("shows cleared hotel/provider information and invalidated routes in the saved preview", async () => {
    const j = transitJourneyFixture(user.userId, randomUUID())
    j.events[0]!.category = "STAY"
    j.events[0]!.hotel = {
      provider: "rollinggo",
      providerHotelId: "hotel",
      fetchedAt: "2026-10-29T00:00:00.000Z",
    }
    j.events[0]!.planning!.coverImageUrl = "https://example.test/cover.png"
    await createJourney(user, {
      journey: j,
      operation: "test",
      patch: [],
      inversePatch: [],
      idempotencyKey: randomUUID(),
    })
    const p = await first(j.id, [
      {
        command: {
          name: "event.update",
          eventId: j.events[0]!.id,
          patch: { location: null },
        },
      },
    ])
    const preview = (await getPlanningProposal(user, j.id, p.proposalId))
      .preview!
    expect(
      preview.committableDiff.find((e) => e.eventId === j.events[0]!.id)
        ?.impacts
    ).toMatchObject({ hotelCleared: true, providerBindingCleared: true })
    expect(
      preview.committableDiff.find((e) => e.eventId === j.events[1]!.id)
        ?.impacts.routeInvalidated
    ).toBe(true)
    await applyPlanningProposal(user, j.id, p.proposalId, { version: 1 })
    expect((await getJourney(user, j.id))!.events[0]!.hotel).toBeUndefined()
  })
  it("compares business fields independently of refreshed contributor profiles", async () => {
    const j = await saved(["L"])
    const p = await first(j.id, [
      {
        command: {
          name: "event.update",
          eventId: "L",
          patch: { title: "午餐安排" },
        },
      },
    ])
    await prisma.user.update({
      where: { id: user.userId },
      data: { name: "Updated name" },
    })
    await applyPlanningProposal(user, j.id, p.proposalId, { version: 1 })
    expect((await getJourney(user, j.id))!.events[0]!.photos).toHaveLength(1)
    await prisma.user.update({
      where: { id: user.userId },
      data: { name: "Planner" },
    })
  })
  it("keeps place candidates in memory across the question and valid answer", async () => {
    const j = await saved([]),
      p = await createPlanningProposal(user, j.id, {
        requestId: randomUUID(),
        message,
      })
    const place = {
      candidateRef: "amap:question-fixture",
      name: "仅供展示商家",
    }
    await executePlanningRun(user, j.id, p.proposalId, p.runId, {
      canRetain: () => false,
      run: async (input) => {
        input.onLivePlaces([place])
        return {
          livePlacesExpiresAt: new Date(Date.now() + 60000).toISOString(),
          output: {
            kind: "question",
            message: "请选择",
            choices: [{ choiceRef: place.candidateRef, label: "选项 1" }],
          },
          displayOnlyValues: [place.name],
          permittedFacts: [],
        }
      },
    })
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).livePlaces
    ).toEqual([place])
    const answer = await startPlanningTurn(user, j.id, p.proposalId, {
      requestId: randomUUID(),
      parentVersion: 0,
      message,
      replyToRunId: p.runId,
      choiceRef: place.candidateRef,
    })
    await executePlanningRun(user, j.id, p.proposalId, answer.runId, {
      canRetain: () => false,
      run: async (input) => {
        expect(input.question?.runId).toBe(p.runId)
        expect(input.choiceRef).toBe(place.candidateRef)
        input.onLivePlaces([place])
        return {
          livePlacesExpiresAt: new Date(0).toISOString(),
          output: {
            kind: "question",
            message: "是否接受文字安排",
            choices: [{ choiceRef: "accept-text", label: "接受" }],
          },
          displayOnlyValues: [place.name],
          permittedFacts: [],
        }
      },
    })
    const view = await getPlanningProposal(user, j.id, p.proposalId)
    expect(view.question?.runId).toBe(answer.runId)
    expect(view.livePlaces).toEqual([])
    expect(
      JSON.stringify(
        await prisma.planningRun.findMany({
          where: { proposalId: p.proposalId },
        })
      )
    ).not.toContain(place.name)
  })
  it("validates an authorized coordinate object regardless of property order", async () => {
    const j = await saved([]),
      p = await createPlanningProposal(user, j.id, {
        requestId: randomUUID(),
        message,
      })
    const edit = add("d1")
    if (edit.command.name !== "event.add") throw new Error("addition expected")
    edit.command.content.location = {
      name: "杭州",
      address: null,
      coordinates: { lat: 30.25, lng: 120.15, coordinateSystem: "GCJ02" },
    }
    const allowed: PlanningRuntime = {
      canRetain: () => true,
      run: async () => ({
        output: {
          kind: "changes",
          operations: [edit],
          constraints: [],
          unverified: [],
          sources: [
            ...sources([edit]).filter(
              (s) => !s.path.startsWith("content.location.coordinates")
            ),
            {
              operation: 0,
              path: "content.location.coordinates",
              kind: "provider",
              provider: "amap",
              policyId: "permit:coordinates",
              factRef: "coords",
            },
          ],
        },
        displayOnlyValues: [],
        permittedFacts: [
          {
            factRef: "coords",
            provider: "amap",
            policyId: "permit:coordinates",
            value: { lng: 120.15, lat: 30.25, coordinateSystem: "GCJ02" },
          },
        ],
      }),
    }
    await executePlanningRun(user, j.id, p.proposalId, p.runId, allowed)
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).latestVersion
    ).toBe(1)
    await applyPlanningProposal(
      user,
      j.id,
      p.proposalId,
      { version: 1 },
      allowed
    )
    expect(
      (await getJourney(user, j.id))!.events[0]!.location?.coordinates?.lat
    ).toBe(30.25)
  })
  it("publishes a new confirmation version when retention permission changes without changing business fields", async () => {
    const j = await saved([]),
      p = await createPlanningProposal(user, j.id, {
        requestId: randomUUID(),
        message,
      })
    const edits = [add("d1")]
    const authorized = (policyId: string): PlanningRuntime => ({
      canRetain: (fact) => fact.policyId === policyId,
      run: async () => ({
        output: {
          kind: "changes",
          operations: edits,
          constraints: [],
          unverified: [],
          sources: [
            ...sources(edits).filter((s) => s.path !== "content.title"),
            {
              operation: 0,
              path: "content.title",
              kind: "provider",
              provider: "licensed",
              policyId,
              factRef: policyId,
            },
          ],
        },
        displayOnlyValues: [],
        permittedFacts: [
          {
            provider: "licensed",
            policyId,
            factRef: policyId,
            value: "新安排",
          },
        ],
      }),
    })
    await executePlanningRun(
      user,
      j.id,
      p.proposalId,
      p.runId,
      authorized("first-policy")
    )
    const next = await startPlanningTurn(user, j.id, p.proposalId, {
      requestId: randomUUID(),
      parentVersion: 1,
      message,
      mode: "rebase",
    })
    await executePlanningRun(
      user,
      j.id,
      p.proposalId,
      next.runId,
      authorized("new-policy")
    )
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).latestVersion
    ).toBe(2)
    await applyPlanningProposal(
      user,
      j.id,
      p.proposalId,
      { version: 2 },
      authorized("new-policy")
    )
  })
  it("requires an unknown hard constraint to be confirmed even without a separate verification request", async () => {
    const j = await saved([])
    const p = await createPlanningProposal(user, j.id, {
      requestId: randomUUID(),
      message,
    })
    const constraint = {
      id: "arrival",
      text: "必须按时到站",
      hard: true,
      satisfied: null as boolean | null,
      verificationRequired: false,
    }
    await executePlanningRun(
      user,
      j.id,
      p.proposalId,
      p.runId,
      runtime([add("d1")], { constraints: [constraint] })
    )
    const blocked = await getPlanningProposal(user, j.id, p.proposalId)
    expect(blocked.preview?.canApply).toBe(false)
    expect(blocked.preview?.blockers).toEqual([constraint.text])
    await expect(
      applyPlanningProposal(user, j.id, p.proposalId, { version: 1 })
    ).rejects.toMatchObject({ code: "PREVIEW_REQUIRED" })
    expect((await getJourney(user, j.id))!.revision).toBe(1)
    const next = await startPlanningTurn(user, j.id, p.proposalId, {
      requestId: randomUUID(),
      parentVersion: 1,
      message,
    })
    await executePlanningRun(
      user,
      j.id,
      p.proposalId,
      next.runId,
      runtime([], { constraints: [{ ...constraint, satisfied: true }] })
    )
    expect(
      (await getPlanningProposal(user, j.id, p.proposalId)).preview?.canApply
    ).toBe(true)
    expect(
      (await applyPlanningProposal(user, j.id, p.proposalId, { version: 2 }))
        .appliedRevision
    ).toBe(2)
  })
  it("includes every allowed transit distance and note change in the preview", async () => {
    const j = await saved(["L", "T", "S"])
    const transitId = j.events.find((event) => event.title === "T")!.id
    const requestMessage = message + "，距离350米，到东门上车"
    const p = await createPlanningProposal(user, j.id, {
      requestId: randomUUID(),
      message: requestMessage,
    })
    const edits: PlanningEdit[] = [
      {
        command: {
          name: "event.update",
          eventId: transitId,
          patch: { transit: { distanceMeters: 350, notes: "到东门上车" } },
        },
      },
    ]
    await executePlanningRun(
      user,
      j.id,
      p.proposalId,
      p.runId,
      runtime(edits, { sources: sources(edits, requestMessage) })
    )
    const preview = (await getPlanningProposal(user, j.id, p.proposalId))
      .preview!
    expect(
      preview.events.find((event) => event.id === transitId)?.transit
    ).toMatchObject({ distanceMeters: 350, notes: "到东门上车" })
    expect(
      preview.committableDiff.find((event) => event.eventId === transitId)
        ?.after?.transit
    ).toMatchObject({ distanceMeters: 350, notes: "到东门上车" })
    await applyPlanningProposal(user, j.id, p.proposalId, { version: 1 })
    expect(
      (await getJourney(user, j.id))!.events.find(
        (event) => event.id === transitId
      )?.transit
    ).toMatchObject({ distanceMeters: 350, notes: "到东门上车" })
  })
})
