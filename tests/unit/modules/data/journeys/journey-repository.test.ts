// @vitest-environment node
import { randomUUID } from "node:crypto"
import { beforeAll, describe, it, expect } from "vitest"
import { prisma } from "@/modules/data/db/prisma"
import {
  createJourney,
  commitJourney,
  getJourney,
} from "@/modules/data/journeys/journey-repository"
import { journeyFixture, eventFixture } from "@/tests/fixtures/journey"
const context = {
  userId: `single-model-${randomUUID()}`,
  role: "user" as const,
}
beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: context.userId,
      email: `${context.userId}@example.test`,
      name: "Owner",
    },
  })
})
const write = (
  journey: ReturnType<typeof journeyFixture>,
  key = randomUUID()
) => ({
  journey,
  operation: "test",
  patch: [{ key }],
  inversePatch: [],
  idempotencyKey: key,
})
describe("canonical Journey snapshots in PostgreSQL", () => {
  it("persists array order, immutable history and the same contract on reopen", async () => {
    const journey = journeyFixture(context.userId, randomUUID())
    journey.events = [
      eventFixture(randomUUID(), context.userId),
      eventFixture(randomUUID(), context.userId),
    ]
    await createJourney(context, write(journey))
    const next = structuredClone(journey)
    next.revision++
    next.events.reverse()
    await commitJourney(context, journey.id, write(next), 1, {
      name: "event.move",
      eventId: next.events[0]!.id,
      afterEventId: null,
    })
    expect(
      (await getJourney(context, journey.id))!.events.map((event) => event.id)
    ).toEqual(next.events.map((event) => event.id))
    const rows = await prisma.journeyEvent.findMany({
      where: { journeyId: journey.id },
      orderBy: { rank: "asc" },
    })
    expect(rows.map((row) => row.id)).toEqual(
      next.events.map((event) => event.id)
    )
    const first = await prisma.journeyRevision.findUniqueOrThrow({
      where: { journeyId_revision: { journeyId: journey.id, revision: 1 } },
    })
    expect(
      JSON.parse(first.snapshotJson).events.map(
        (event: { id: string }) => event.id
      )
    ).toEqual(journey.events.map((event) => event.id))
    await expect(
      prisma.journeyRevision.update({
        where: { id: first.id },
        data: { operation: "rewrite" },
      })
    ).rejects.toThrow()
  })
  it("serializes CAS and duplicate requests across separate writers", async () => {
    const journey = journeyFixture(context.userId, randomUUID())
    await createJourney(context, write(journey))
    const next = { ...journey, revision: 2, title: "下一版" },
      request = write(next)
    const command = {
      name: "journey.update" as const,
      patch: { title: next.title },
    }
    const results = await Promise.all([
      commitJourney(context, journey.id, request, 1, command),
      commitJourney(context, journey.id, request, 1, command),
    ])
    expect(results.map((result) => result!.revision)).toEqual([2, 2])
    await expect(
      commitJourney(
        context,
        journey.id,
        write({ ...next, title: "冲突" }),
        1,
        command
      )
    ).rejects.toThrow("updated")
    await expect(
      commitJourney(
        context,
        journey.id,
        { ...request, patch: ["different"] },
        1,
        command
      )
    ).rejects.toThrow("payload")
    expect(
      await prisma.journeyRevision.count({ where: { journeyId: journey.id } })
    ).toBe(2)
  })
})
