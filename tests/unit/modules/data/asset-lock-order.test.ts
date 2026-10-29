// @vitest-environment node
import { randomUUID } from "node:crypto"
import { beforeAll, describe, it, expect } from "vitest"
import { prisma } from "@/modules/data/db/prisma"
import {
  createRecordingJourney,
  mutateRecordingJourney,
  getRecordingJourney,
} from "@/modules/data/journeys/recording-service"
import { deleteAsset } from "@/modules/data/assets/asset-repository"
const owner = { userId: `asset-order-${randomUUID()}`, role: "user" as const }
beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: owner.userId,
      email: `${owner.userId}@example.test`,
      name: "Owner",
    },
  })
})
async function asset() {
  return prisma.asset.create({
    data: {
      id: randomUUID(),
      ownerId: owner.userId,
      kind: "IMAGE",
      visibility: "PRIVATE",
      storageKey: `test/${randomUUID()}`,
      mimeType: "image/png",
      checksum: randomUUID(),
      sizeBytes: 1,
    },
  })
}
async function journey() {
  const created = await createRecordingJourney(owner, {
    idempotencyKey: randomUUID(),
  })
  return mutateRecordingJourney(owner, created.journey.id, {
    expectedRevision: 1,
    idempotencyKey: randomUUID(),
    command: { name: "event.add", afterEventId: null, content: {} },
  })
}
describe("ordered asset locks on the one Journey write path", () => {
  it("commits opposite photo orders on different Journeys without deadlock", async () => {
    const images = await Promise.all([asset(), asset()]),
      journals = await Promise.all([journey(), journey()])
    const results = await Promise.all(
      journals.map((journal, index) =>
        mutateRecordingJourney(owner, journal.journey.id, {
          expectedRevision: journal.journey.revision,
          idempotencyKey: randomUUID(),
          command: {
            name: "photos.set",
            eventId: journal.eventId,
            photos: (index ? [...images].reverse() : images).map((image) => ({
              assetId: image.id,
              caption: "",
            })),
            coverAssetId: null,
          },
        })
      )
    )
    expect(results.map((result) => result.journey.revision)).toEqual([3, 3])
    for (const [index, result] of results.entries())
      expect(
        (
          await getRecordingJourney(owner, result.journey.id)
        ).events[0]!.photos.map((photo) => photo.assetId)
      ).toEqual(
        (index ? [...images].reverse() : images).map((image) => image.id)
      )
  })
  it("serializes attachment and resource deletion without a deleted live reference", async () => {
    const image = await asset(),
      journal = await journey()
    await Promise.allSettled([
      mutateRecordingJourney(owner, journal.journey.id, {
        expectedRevision: 2,
        idempotencyKey: randomUUID(),
        command: {
          name: "photos.set",
          eventId: journal.eventId,
          photos: [{ assetId: image.id, caption: "" }],
          coverAssetId: null,
        },
      }),
      deleteAsset(owner, image.id),
    ])
    const actual = await prisma.asset.findUniqueOrThrow({
        where: { id: image.id },
      }),
      links = await prisma.eventAssetLink.count({
        where: { assetId: image.id },
      })
    expect(Boolean(actual.deletedAt) && links > 0).toBe(false)
  })
})
