// @vitest-environment node
import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/modules/data/db/prisma"
import type { TargetJourneyGraphSnapshot } from "@/modules/data-model/contracts"
import {
  commitJourneyDomainGraph,
  commitJourneyRevisionChain,
  createJourney,
  createJourneyRevisionChain,
  getJourney,
  JourneyRevisionConflictError,
  type JourneyRevisionWrite,
} from "@/modules/data/journeys/journey-repository"

const owner = {
  userId: `asset-lock-owner-${randomUUID()}`,
  role: "user" as const,
}
const now = "2026-10-23T00:00:00.000Z"
beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: owner.userId,
      email: `${owner.userId}@example.test`,
      name: "Asset lock regression",
      emailVerified: true,
    },
  })
})

function baseGraph(): TargetJourneyGraphSnapshot {
  const id = `asset-lock-journey-${randomUUID()}`
  return {
    id,
    ownerId: owner.userId,
    title: "Lock order",
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    events: [
      {
        id: `${id}-note`,
        journeyId: id,
        type: "NOTE",
        title: "Photos",
        detail: { body: "Photo attachments" },
        parentSectionEventId: null,
        placementStatus: "SCHEDULED",
        origin: "ORIGINAL",
        introducedRevision: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    links: [],
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}
const write = (graph: TargetJourneyGraphSnapshot): JourneyRevisionWrite => ({
  graph,
  operation: "attach lock regression photos",
  idempotencyKey: randomUUID(),
  patch: [],
  inversePatch: [],
})
function appendAsset(
  graph: TargetJourneyGraphSnapshot,
  asset: { id: string; checksum: string }
) {
  graph.eventAssetLinks.push({
    id: randomUUID(),
    journeyId: graph.id,
    eventId: graph.events[0]!.id,
    assetId: asset.id,
    assetChecksum: asset.checksum,
    role: "GALLERY",
    rank: graph.eventAssetLinks.length,
    visibility: "PRIVATE",
    introducedRevision: graph.revision,
    createdAt: now,
  })
}

describe("PostgreSQL resource lock ordering", () => {
  it.each(["domain", "chain-batch", "chain-split", "create-chain"] as const)(
    "commits opposite photo orders across different Journeys through %s",
    async (mode) => {
      const assets = await Promise.all(
        [0, 1].map(() =>
          prisma.asset.create({
            data: {
              ownerId: owner.userId,
              kind: "IMAGE",
              storageKey: `private/lock-test/${randomUUID()}`,
              mimeType: "image/png",
              sizeBytes: 1,
              checksum: randomUUID(),
            },
          })
        )
      )
      const bases = [baseGraph(), baseGraph()]
      if (mode !== "create-chain")
        await Promise.all(
          bases.map((base) => createJourney(owner, write(base)))
        )
      const plans = bases.map((base, index) => {
        const order = index === 0 ? assets : [...assets].reverse()
        const graph = structuredClone(base)
        const writes: JourneyRevisionWrite[] = []
        if (mode === "domain" || mode === "chain-batch") {
          graph.revision++
          order.forEach((asset) => appendAsset(graph, asset))
          writes.push(write(graph))
        } else {
          for (const asset of order) {
            graph.revision++
            appendAsset(graph, asset)
            writes.push(write(structuredClone(graph)))
          }
        }
        return { base, baseWrite: write(base), writes, order }
      })
      const name = `lock_pause_${randomUUID().replaceAll("-", "")}`
      // Widen the overlap after each first row is locked. Without the batch
      // pre-lock, both transactions hold opposite first Assets before continuing;
      // with it, one can finish while the other waits for the same ordered set.
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."assetId" IN ('${assets[0]!.id}', '${assets[1]!.id}') THEN PERFORM pg_sleep(0.15); END IF; RETURN NEW; END; $$`
      )
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER "${name}" AFTER INSERT ON "EventAssetLink" FOR EACH ROW EXECUTE FUNCTION "${name}"()`
      )
      const commit = ({ base, baseWrite, writes }: (typeof plans)[number]) =>
        mode === "domain"
          ? commitJourneyDomainGraph(owner, base.id, writes[0]!, 1, "CONTENT")
          : mode === "create-chain"
            ? createJourneyRevisionChain(owner, baseWrite, writes)
            : commitJourneyRevisionChain(owner, base.id, writes, 1)
      try {
        const results = await Promise.allSettled(plans.map(commit))
        expect(
          results.flatMap((result) =>
            result.status === "rejected" ? [String(result.reason)] : []
          )
        ).toEqual([])
        for (const plan of plans) {
          const persisted = await getJourney(owner, plan.base.id)
          expect(persisted?.revision).toBe(plan.writes.at(-1)!.graph.revision)
          expect(
            persisted?.eventAssetLinks.map((link) => link.assetId)
          ).toEqual(plan.order.map((asset) => asset.id))
          expect(
            await prisma.journeyRevision.count({
              where: { journeyId: plan.base.id },
            })
          ).toBe(persisted!.revision)
          // A lost reply replays the same receipt; a different stale request
          // still conflicts instead of being silently applied to a newer head.
          expect((await commit(plan))?.revision).toBe(persisted!.revision)
          if (mode !== "create-chain") {
            const stale = write({
              ...plan.base,
              revision: 2,
              title: "Stale write",
            })
            await expect(
              mode === "domain"
                ? commitJourneyDomainGraph(
                    owner,
                    plan.base.id,
                    stale,
                    1,
                    "CONTENT"
                  )
                : commitJourneyRevisionChain(owner, plan.base.id, [stale], 1)
            ).rejects.toBeInstanceOf(JourneyRevisionConflictError)
          }
        }
      } finally {
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER "${name}" ON "EventAssetLink"`
        )
        await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`)
      }
    },
    15000
  )
})
