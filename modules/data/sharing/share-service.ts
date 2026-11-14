import { createHash, randomBytes } from "node:crypto"
import type { Prisma, JourneyShare } from "@prisma/client"
import {
  isAdmin,
  PermissionDeniedError,
  type AuthContext,
} from "@/modules/auth/server/context"
import { periplusServerConfig } from "@/config/periplus.server"
import { prisma } from "@/modules/data/db/prisma"
import {
  journeySnapshotSchema,
  eventWeatherSchema,
  sharedJourneySchema,
  type JourneySnapshot,
  type SharedJourney,
  type ShareWrite,
  type ShareRevoke,
} from "@/modules/data-model/contracts"
import { lockAssetRows } from "@/modules/data/assets/asset-repository"
import { assetUrl } from "@/modules/data/assets/asset-service"
import {
  assetOperator,
  assertObjectKey,
  isObjectNotFound,
} from "@/modules/data/assets/object-storage"
import { AssetStorageError } from "@/modules/data/assets/asset-contract"
import {
  JourneyInputError,
  JourneyRevisionConflictError,
  JourneyIdempotencyConflictError,
} from "@/modules/data/journeys/journey-repository"
import { RecordingNotFoundError } from "@/modules/data/journeys/recording-service"
import { eventWeatherInput } from "@/modules/data/weather/weather-input"
import {
  eventCardTimes,
  eventTransitDisplay,
} from "@/modules/travelogue/model/event-card-display"
import { receiptCardTotal } from "@/modules/travelogue/model/receipt-draft"

type Tx = Prisma.TransactionClient
const photoIds = (journey: JourneySnapshot) => [
  ...new Set(
    journey.events.flatMap((event) =>
      event.photos.map((photo) => photo.assetId)
    )
  ),
]

async function ownedJourney(context: AuthContext, id: string, tx: Tx = prisma) {
  const row = await tx.journey.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw new RecordingNotFoundError()
  if (row.ownerId !== context.userId && !isAdmin(context))
    throw new PermissionDeniedError("只有旅程所有者或管理员可以管理分享。")
  return row
}
function status(row: JourneyShare | null, currentRevision: number) {
  return {
    version: row?.version ?? 0,
    sourceRevision: row?.sourceRevision ?? 0,
    currentRevision,
    includeCosts: row?.includeCosts ?? false,
    url:
      row && !row.revokedAt
        ? new URL(
            `/s/${row.token}`,
            periplusServerConfig.app.baseUrl
          ).toString()
        : null,
    publishedAt: row?.publishedAt.toISOString() ?? null,
    revokedAt: row?.revokedAt?.toISOString() ?? null,
    lastMutationId: row?.lastMutationId ?? null,
  }
}
export async function getShareStatus(context: AuthContext, id: string) {
  const journey = await ownedJourney(context, id)
  return status(
    await prisma.journeyShare.findUnique({ where: { journeyId: id } }),
    journey.revision
  )
}
async function project(
  tx: Tx,
  journey: JourneySnapshot,
  includeCosts: boolean
): Promise<SharedJourney> {
  const [assets, users, weather] = await Promise.all([
    tx.asset.findMany({
      where: { id: { in: photoIds(journey) } },
      include: { owner: { select: { name: true } } },
    }),
    tx.user.findMany({
      where: { id: { in: journey.events.map((event) => event.source.userId) } },
      select: { id: true, name: true },
    }),
    tx.eventWeather.findMany({ where: { journeyId: journey.id } }),
  ])
  const byAsset = new Map(assets.map((asset) => [asset.id, asset]))
  const byUser = new Map(users.map((user) => [user.id, user.name]))
  const byWeather = new Map(weather.map((row) => [row.eventId, row]))
  return {
    title: journey.title,
    description: journey.description,
    authors: [
      ...new Set(
        journey.events.map((event) => byUser.get(event.source.userId)!)
      ),
    ],
    cities: [
      ...new Set(
        journey.events.flatMap((event) =>
          event.location?.city ? [event.location.city] : []
        )
      ),
    ],
    events: journey.events.map((event) => {
      const times = eventCardTimes(event)
      const display = eventTransitDisplay(event)
      const savedWeather = byWeather.get(event.id)
      const input = eventWeatherInput(event)
      return {
        id: event.id,
        category: event.category,
        title: event.title,
        body: event.body,
        date: event.date,
        timeLabel: times.range,
        location: event.location?.name ?? null,
        author: byUser.get(event.source.userId)!,
        photos: event.photos.map((photo) => {
          const asset = byAsset.get(photo.assetId)
          if (!asset || asset.deletedAt || asset.kind !== "IMAGE")
            throw new JourneyInputError(
              "照片已不可用，请重新打开旅程后再分享。"
            )
          return {
            assetId: photo.assetId,
            caption: photo.caption,
            author: asset.owner.name,
            isCover: photo.isCover,
          }
        }),
        costs: includeCosts
          ? event.receipts
              .filter((receipt) => receipt.total !== null)
              .map(receiptCardTotal)
          : [],
        weather:
          savedWeather && input?.key === savedWeather.inputKey
            ? eventWeatherSchema.parse(JSON.parse(savedWeather.resultJson))
            : null,
        transit: event.transit
          ? {
              fromName: event.transit.fromName,
              toName: event.transit.toName,
              departure: times.departure,
              arrival: [
                times.arrival,
                times.arrivalDays > 0 ? `+${times.arrivalDays}天` : null,
              ]
                .filter(Boolean)
                .join(" "),
              mode: display.mode,
              duration: display.duration,
              distance: display.distance,
              line: display.line,
              note: event.transit.notes ?? "",
            }
          : null,
      }
    }),
  }
}
export async function getSharePreview(
  context: AuthContext,
  id: string,
  includeCosts: boolean
) {
  return prisma.$transaction(
    async (tx) => {
      const row = await ownedJourney(context, id, tx)
      const journey = journeySnapshotSchema.parse(JSON.parse(row.snapshotJson))
      return {
        includeCosts,
        revision: row.revision,
        document: await project(tx, journey, includeCosts),
        photoUrls: Object.fromEntries(
          photoIds(journey).map((id) => [id, assetUrl(id)])
        ),
      }
    },
    { isolationLevel: "RepeatableRead" }
  )
}
function fingerprint(action: string, input: ShareWrite | ShareRevoke) {
  return createHash("sha256")
    .update(JSON.stringify({ action, input }))
    .digest("hex")
}
function replay(row: JourneyShare | null, key: string, signature: string) {
  if (row?.lastMutationId !== key) return false
  if (row.lastMutationSignature !== signature)
    throw new JourneyIdempotencyConflictError(
      "同一请求标识不能用于不同的分享操作。"
    )
  return true
}
function checkVersion(row: JourneyShare | null, expected: number) {
  if ((row?.version ?? 0) !== expected)
    throw new JourneyRevisionConflictError("分享状态已变化，请刷新预览后重试。")
}
export async function publishShare(
  context: AuthContext,
  id: string,
  input: ShareWrite
) {
  const signature = fingerprint("publish", input)
  const prepared = await ownedJourney(context, id)
  const previous = await prisma.journeyShare.findUnique({
    where: { journeyId: id },
  })
  if (replay(previous, input.idempotencyKey, signature))
    return status(previous, prepared.revision)
  if (prepared.revision !== input.expectedRevision)
    throw new JourneyRevisionConflictError(
      "旅程已有新保存内容，请刷新预览后再发布。"
    )
  const journey = journeySnapshotSchema.parse(JSON.parse(prepared.snapshotJson))
  if (!journey.events.length)
    throw new JourneyInputError("请先保存至少一条记录。")
  const ids = photoIds(journey)
  const assets = await prisma.asset.findMany({ where: { id: { in: ids } } })
  // Storage I/O stays outside the Journey lock. The transaction rechecks the
  // canonical revision and locks the complete photo set before publication.
  for (let index = 0; index < assets.length; index += 4) {
    await Promise.all(
      assets.slice(index, index + 4).map(async (asset) => {
        assertObjectKey(asset.storageKey)
        try {
          await assetOperator().stat(asset.storageKey)
        } catch (error) {
          if (isObjectNotFound(error))
            throw new JourneyInputError("照片文件不可用，分享未更新。")
          throw new AssetStorageError()
        }
      })
    )
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Journey" WHERE "id" = ${id} FOR UPDATE`
    const current = await ownedJourney(context, id, tx)
    const share = await tx.journeyShare.findUnique({ where: { journeyId: id } })
    if (replay(share, input.idempotencyKey, signature))
      return status(share, current.revision)
    checkVersion(share, input.expectedShareVersion)
    if (current.revision !== input.expectedRevision)
      throw new JourneyRevisionConflictError(
        "旅程已有新保存内容，请刷新预览后再发布。"
      )
    await lockAssetRows(tx, ids)
    const document = await project(tx, journey, input.includeCosts)
    const data = {
      token:
        share && !share.revokedAt
          ? share.token
          : randomBytes(32).toString("base64url"),
      version: (share?.version ?? 0) + 1,
      sourceRevision: current.revision,
      includeCosts: input.includeCosts,
      snapshotJson: JSON.stringify(document),
      publishedAt: new Date(),
      revokedAt: null,
      lastMutationId: input.idempotencyKey,
      lastMutationSignature: signature,
    }
    const saved = await tx.journeyShare.upsert({
      where: { journeyId: id },
      create: { journeyId: id, ...data },
      update: data,
    })
    await tx.journeyShareAsset.deleteMany({ where: { shareId: saved.id } })
    if (ids.length)
      await tx.journeyShareAsset.createMany({
        data: ids.map((assetId) => ({ shareId: saved.id, assetId })),
      })
    return status(saved, current.revision)
  })
}
export async function revokeShare(
  context: AuthContext,
  id: string,
  input: ShareRevoke
) {
  const signature = fingerprint("revoke", input)
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Journey" WHERE "id" = ${id} FOR UPDATE`
    const journey = await ownedJourney(context, id, tx)
    const share = await tx.journeyShare.findUnique({ where: { journeyId: id } })
    if (replay(share, input.idempotencyKey, signature))
      return status(share, journey.revision)
    checkVersion(share, input.expectedShareVersion)
    if (!share || share.revokedAt) return status(share, journey.revision)
    const saved = await tx.journeyShare.update({
      where: { id: share.id },
      data: {
        version: share.version + 1,
        revokedAt: new Date(),
        lastMutationId: input.idempotencyKey,
        lastMutationSignature: signature,
      },
    })
    await tx.journeyShareAsset.deleteMany({ where: { shareId: share.id } })
    return status(saved, journey.revision)
  })
}
export async function getPublicShare(token: string) {
  const share = await prisma.journeyShare.findFirst({
    where: { token, revokedAt: null, journey: { deletedAt: null } },
  })
  if (!share) return null
  const document = sharedJourneySchema.parse(JSON.parse(share.snapshotJson))
  return {
    document,
    photoUrls: Object.fromEntries(
      document.events.flatMap((event) =>
        event.photos.map((photo) => [
          photo.assetId,
          `/api/shares/${encodeURIComponent(token)}/photos/${encodeURIComponent(photo.assetId)}`,
        ])
      )
    ),
  }
}
export async function getSharedAsset(token: string, assetId: string) {
  // Published references intentionally retain immutable bytes after an original
  // photo is detached or soft-deleted. Only the active share grants this read.
  const link = await prisma.journeyShareAsset.findFirst({
    where: {
      assetId,
      share: { token, revokedAt: null, journey: { deletedAt: null } },
    },
    include: { asset: true },
  })
  return link?.asset ?? null
}
