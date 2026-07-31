import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/modules/data/db/prisma"
import {
  createJourney,
  JourneyRevisionConflictError,
  updateJourney,
} from "@/modules/data/journeys/journey-repository"

const userId = "test-journey-repository-user"
const journeyId = "test-journey-repository-journey"
const eventId = "test-journey-repository-event"
const context = { userId, role: "user" as const }

beforeAll(async () => {
  await prisma.journey.deleteMany({ where: { id: journeyId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.user.create({
    data: {
      id: userId,
      name: "Repository Test",
      email: `${userId}@periplus.local`,
      emailVerified: true,
    },
  })
})

afterAll(async () => {
  await prisma.journey.deleteMany({ where: { id: journeyId } })
  await prisma.user.deleteMany({ where: { id: userId } })
})

describe("journey repository graph synchronization", () => {
  it("updates stable events without deleting their attachments", async () => {
    const created = await createJourney(context, {
      id: journeyId,
      title: "Repository Journey",
      status: "DRAFT",
      events: [
        {
          id: eventId,
          type: "VISIT",
          executionStatus: "PLANNED",
          origin: "ORIGINAL",
          title: "Original title",
          detail: { plannedLat: 30, plannedLng: 120 },
        },
      ],
      links: [],
    })
    await prisma.journeyEventAttachment.create({
      data: {
        id: "test-journey-repository-attachment",
        eventId,
        type: "photo",
        url: "https://example.test/photo.jpg",
      },
    })

    const updated = await updateJourney(
      context,
      journeyId,
      {
        title: created.title,
        description: created.description,
        status: created.status,
        events: created.events.map((event) => ({
          ...event,
          title: "Updated title",
        })),
        links: created.links,
      },
      created.revision
    )

    expect(updated?.revision).toBe(2)
    expect(updated?.events[0]?.id).toBe(eventId)
    expect(updated?.events[0]?.title).toBe("Updated title")
    expect(
      await prisma.journeyEventAttachment.count({ where: { eventId } })
    ).toBe(1)
    expect(
      await prisma.journeyEventRevision.count({ where: { journeyId } })
    ).toBe(2)

    await expect(
      updateJourney(
        context,
        journeyId,
        {
          title: created.title,
          description: created.description,
          status: created.status,
          events: created.events,
          links: created.links,
        },
        created.revision
      )
    ).rejects.toBeInstanceOf(JourneyRevisionConflictError)
  })
})
