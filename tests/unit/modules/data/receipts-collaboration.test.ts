// @vitest-environment node
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { setTestAuthContext } from "@/modules/auth/server/context"
import { prisma } from "@/modules/data/db/prisma"
import { assetOperator } from "@/modules/data/assets/object-storage"
import { uploadResource } from "@/modules/data/assets/asset-service"
import { getAssetRecord } from "@/modules/data/assets/asset-repository"
import {
  createRecordingJourney,
  getRecordingJourney,
  listRecordingJourneys,
  mutateRecordingJourney,
} from "@/modules/data/journeys/recording-service"
import {
  getJourney,
  commitJourneyGraph,
} from "@/modules/data/journeys/journey-repository"
import {
  createJourneyInvitation,
  acceptJourneyInvitation,
  listJourneyInvitations,
  listJourneyMembers,
  previewJourneyInvitation,
  revokeJourneyInvitation,
} from "@/modules/data/collaboration/collaboration-service"
import { POST as commandRoute } from "@/app/api/journeys/[id]/commands/route"
import { POST as extractRoute } from "@/app/api/receipts/extract/route"
import { GET as invitationRoute } from "@/app/api/journey-invitations/[token]/route"
import { POST as acceptRoute } from "@/app/api/journey-invitations/[token]/accept/route"
import { GET as fileRoute } from "@/app/api/assets/[id]/file/route"
import type {
  RecordingCommand,
  RecordingJourney,
} from "@/modules/data-model/contracts"

const contexts = ["owner", "friend", "stranger"].map((label) => ({
  userId: `${label}-${randomUUID()}`,
  role: "user" as const,
}))
const [owner, friend, stranger] = contexts as [
  (typeof contexts)[number],
  (typeof contexts)[number],
  (typeof contexts)[number],
]
const objects = new Set<string>()
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
  "base64"
)
const fields = {
  merchant: "西湖小馆",
  date: "2026-10-28",
  total: "128.50",
  currency: "CNY",
  items: [{ name: "午餐", quantity: "2", amount: "128.50" }],
}
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
async function upload(context = owner) {
  const { asset } = await uploadResource(context, {
    uploadId: randomUUID(),
    mimeType: "image/png",
    source: new ReadableStream({
      start(controller) {
        controller.enqueue(png)
        controller.close()
      },
    }),
  })
  objects.add(asset.storageKey)
  return asset
}
async function journey() {
  return (await createRecordingJourney(owner, { idempotencyKey: randomUUID() }))
    .journey
}
async function write(
  context: typeof owner,
  current: RecordingJourney,
  command: RecordingCommand,
  key = randomUUID()
) {
  return mutateRecordingJourney(context, current.id, {
    expectedRevision: current.revision,
    idempotencyKey: key,
    command,
  })
}
async function joined(current: RecordingJourney) {
  const invite = await createJourneyInvitation(owner, current.id)
  const token = invite.url.split("/").at(-1)!
  await acceptJourneyInvitation(friend, token)
  return { invite, token }
}
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test")
  await prisma.user.createMany({
    data: contexts.map((context) => ({
      id: context.userId,
      name: context.userId,
      email: `${context.userId}@example.test`,
      emailVerified: true,
    })),
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  setTestAuthContext(undefined)
})
afterAll(async () => {
  await Promise.all([...objects].map((key) => assetOperator().delete(key)))
  vi.unstubAllEnvs()
})

describe.sequential("confirmed receipts and journey collaboration", () => {
  it("saves a new event and confirmed bill in one revision, reopens, replays and edits without changing sources", async () => {
    let current = await journey()
    const asset = await upload()
    const key = randomUUID()
    const command: RecordingCommand = {
      name: "event.add",
      afterEventId: null,
      content: { body: "午饭", date: null, location: null },
      receipt: { assetId: asset.id, ...fields },
    }
    const saved = await write(owner, current, command, key)
    expect(saved.journey.revision).toBe(current.revision + 1)
    const replay = await write(owner, current, command, key)
    expect(replay.replayed).toBe(true)
    expect(replay.journey).toEqual(saved.journey)
    current = await getRecordingJourney(owner, current.id)
    expect(current.events[0]!.receipts![0]).toMatchObject({
      assetId: asset.id,
      ...fields,
      source: { userId: owner.userId },
      canEdit: true,
    })
    expect(current.events[0]!.photos).toEqual([])
    expect(current.events[0]).toMatchObject({
      source: { userId: owner.userId },
      date: null,
      location: null,
    })
    const receiptId = current.events[0]!.receipts![0]!.id
    current = (
      await write(owner, current, {
        name: "receipt.update",
        eventId: current.events[0]!.id,
        receiptId,
        fields: { ...fields, total: "130.00" },
      })
    ).journey
    expect(current.events[0]!.receipts![0]).toMatchObject({
      total: "130.00",
      source: { userId: owner.userId },
    })
    expect(
      (
        await prisma.eventAssetLink.findUniqueOrThrow({
          where: { id: receiptId },
        })
      ).retiredRevision
    ).toBe(current.revision)
    expect((await getAssetRecord(owner, asset.id))!.storageKey).toBe(
      asset.storageKey
    )
  })
  it("invites authenticated friends idempotently, lists shared journeys and preserves independent event/photo sources", async () => {
    let current = await journey()
    const { token } = await joined(current)
    await acceptJourneyInvitation(friend, token)
    expect((await listJourneyMembers(friend, current.id)).members).toHaveLength(
      2
    )
    expect(
      (await listRecordingJourneys(friend)).some(
        (item) => item.id === current.id
      )
    ).toBe(true)
    const event = await write(owner, current, {
      name: "event.add",
      afterEventId: null,
      content: { body: "作者的文字" },
    })
    current = event.journey
    const ownerPhoto = await upload()
    current = (
      await write(owner, current, {
        name: "photos.set",
        eventId: event.eventId!,
        photos: [{ assetId: ownerPhoto.id, caption: "原照片" }],
        coverAssetId: ownerPhoto.id,
      })
    ).journey
    const friendPhoto = await upload(friend)
    current = (
      await write(friend, current, {
        name: "photos.set",
        eventId: event.eventId!,
        photos: [
          { assetId: ownerPhoto.id, caption: "原照片" },
          { assetId: friendPhoto.id, caption: "好友的照片" },
        ],
        coverAssetId: ownerPhoto.id,
      })
    ).journey
    current = await getRecordingJourney(friend, current.id)
    expect(current.role).toBe("MEMBER")
    expect(current.events[0]).toMatchObject({
      source: { userId: owner.userId },
      canEdit: false,
    })
    expect(
      current.events[0]!.photos.map((photo) => [
        photo.source!.userId,
        photo.canEdit,
      ])
    ).toEqual([
      [owner.userId, false],
      [friend.userId, true],
    ])
    const receipt = await upload(friend)
    current = (
      await write(friend, current, {
        name: "receipt.add",
        eventId: event.eventId!,
        receipt: { assetId: receipt.id, ...fields },
      })
    ).journey
    expect(current.events[0]!.receipts![0]!.source.userId).toBe(friend.userId)
    current = (
      await write(owner, current, {
        name: "photo.update",
        eventId: event.eventId!,
        assetId: friendPhoto.id,
        patch: { caption: "整理后的说明" },
      })
    ).journey
    expect(current.events[0]!.photos[1]!.source!.userId).toBe(friend.userId)
    expect(
      (await getRecordingJourney(friend, current.id)).events[0]!.body
    ).toBe("作者的文字")
    setTestAuthContext(friend)
    expect(
      (
        await fileRoute(
          new NextRequest("http://localhost/file"),
          params(ownerPhoto.id)
        )
      ).status
    ).toBe(200)
    setTestAuthContext(owner)
    expect(
      (
        await fileRoute(
          new NextRequest("http://localhost/file"),
          params(friendPhoto.id)
        )
      ).status
    ).toBe(200)
    const unshared = await upload(owner)
    setTestAuthContext(friend)
    expect(
      (
        await fileRoute(
          new NextRequest("http://localhost/file"),
          params(unshared.id)
        )
      ).status
    ).toBe(403)
    setTestAuthContext(stranger)
    expect(
      (
        await fileRoute(
          new NextRequest("http://localhost/file"),
          params(ownerPhoto.id)
        )
      ).status
    ).toBe(403)
    await expect(getRecordingJourney(stranger, current.id)).rejects.toThrow(
      "Journey not found"
    )
  })
  it("rejects member edits to other content and generic graph writes, preserving revision and original inputs", async () => {
    let current = await journey()
    await joined(current)
    const added = await write(owner, current, {
      name: "event.add",
      afterEventId: null,
      content: { body: "不可改" },
    })
    current = added.journey
    const asset = await upload()
    current = (
      await write(owner, current, {
        name: "photos.set",
        eventId: added.eventId!,
        photos: [{ assetId: asset.id, caption: "保留" }],
        coverAssetId: asset.id,
      })
    ).journey
    const forbidden: RecordingCommand[] = [
      {
        name: "event.update",
        eventId: added.eventId!,
        patch: { body: "覆盖" },
      },
      { name: "event.remove", eventId: added.eventId! },
      {
        name: "photos.set",
        eventId: added.eventId!,
        photos: [],
        coverAssetId: null,
      },
      {
        name: "photo.update",
        eventId: added.eventId!,
        assetId: asset.id,
        patch: { caption: "覆盖" },
      },
      { name: "journey.update", patch: { title: "覆盖" } },
    ]
    setTestAuthContext(friend)
    for (const command of forbidden)
      expect(
        (
          await commandRoute(
            request({
              expectedRevision: current.revision,
              idempotencyKey: randomUUID(),
              command,
            }),
            params(current.id)
          )
        ).status
      ).toBe(403)
    const graph = (await getJourney(friend, current.id))!
    await expect(
      commitJourneyGraph(
        friend,
        current.id,
        {
          graph: { ...graph, revision: graph.revision + 1 },
          operation: "bypass",
          idempotencyKey: randomUUID(),
          patch: [],
          inversePatch: [],
        },
        graph.revision
      )
    ).rejects.toThrow("owner")
    expect((await getRecordingJourney(owner, current.id)).revision).toBe(
      current.revision
    )
    const own = await write(friend, current, {
      name: "event.add",
      afterEventId: added.eventId!,
      content: { body: "好友" },
    })
    current = own.journey
    current = (
      await write(owner, current, {
        name: "photos.set",
        eventId: own.eventId!,
        photos: [{ assetId: asset.id, caption: "作者补图" }],
        coverAssetId: asset.id,
      })
    ).journey
    const reopened = await getRecordingJourney(friend, current.id)
    expect(reopened.events[1]).toMatchObject({
      canEdit: true,
      canRemove: false,
      source: { userId: friend.userId },
    })
    await expect(
      write(friend, current, { name: "event.remove", eventId: own.eventId! })
    ).rejects.toThrow("own content")
  })
  it("rejects attaching another member's unshared original at both command and SQL boundaries", async () => {
    let current = await journey()
    await joined(current)
    const added = await write(owner, current, {
      name: "event.add",
      afterEventId: null,
      content: {},
    })
    current = added.journey
    const privateAsset = await upload(friend)
    await expect(
      write(owner, current, {
        name: "receipt.add",
        eventId: added.eventId!,
        receipt: { assetId: privateAsset.id, ...fields },
      })
    ).rejects.toThrow("not available")
    await expect(
      prisma.eventAssetLink.create({
        data: {
          id: randomUUID(),
          journeyId: current.id,
          eventId: added.eventId!,
          assetId: privateAsset.id,
          assetChecksum: privateAsset.checksum,
          role: "GALLERY",
          rank: 0,
          visibility: "PRIVATE",
          introducedRevision: current.revision,
        },
      })
    ).rejects.toThrow()
  })
  it("rejects stale writes, forged sources, invalid calendars, and deletion of an attached bill", async () => {
    let current = await journey()
    const initial = current
    const asset = await upload()
    const added = await write(owner, current, {
      name: "event.add",
      afterEventId: null,
      content: {},
      receipt: { assetId: asset.id, ...fields },
    })
    current = added.journey
    setTestAuthContext(owner)
    const invoke = (revision: number, command: unknown) =>
      commandRoute(
        request({
          expectedRevision: revision,
          idempotencyKey: randomUUID(),
          command,
        }),
        params(current.id)
      )
    expect(
      (
        await invoke(initial.revision, {
          name: "event.add",
          afterEventId: null,
          content: {},
        })
      ).status
    ).toBe(409)
    expect(
      (
        await invoke(current.revision, {
          name: "event.add",
          afterEventId: null,
          content: {},
          source: { userId: friend.userId },
        })
      ).status
    ).toBe(400)
    expect(
      (
        await invoke(current.revision, {
          name: "receipt.add",
          eventId: added.eventId!,
          receipt: { assetId: asset.id, ...fields, date: "2026-02-30" },
        })
      ).status
    ).toBe(400)
    await expect(
      prisma.asset.update({
        where: { id: asset.id },
        data: { deletedAt: new Date() },
      })
    ).rejects.toThrow()
    current = (
      await write(owner, current, {
        name: "receipt.remove",
        eventId: added.eventId!,
        receiptId: current.events[0]!.receipts![0]!.id,
      })
    ).journey
    expect(current.events[0]!.receipts).toEqual([])
    expect(
      (await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }))
        .deletedAt
    ).toBeNull()
  })
  it("supports anonymous invitation preview, requires login to join, and rejects revoked/expired invitations", async () => {
    const current = await journey()
    const invite = await createJourneyInvitation(owner, current.id)
    const token = invite.url.split("/").at(-1)!
    expect(
      (await listJourneyInvitations(owner, current.id)).invitations.map(
        (item) => item.id
      )
    ).toContain(invite.invitation.id)
    await expect(listJourneyInvitations(stranger, current.id)).rejects.toThrow()
    setTestAuthContext(null)
    const tokenParams = { params: Promise.resolve({ token }) }
    expect(
      (
        await invitationRoute(
          new Request("http://localhost/invite"),
          tokenParams
        )
      ).status
    ).toBe(200)
    expect((await acceptRoute(request({}), tokenParams)).status).toBe(401)
    await revokeJourneyInvitation(owner, current.id, invite.invitation.id)
    await expect(acceptJourneyInvitation(friend, token)).rejects.toThrow(
      "not found"
    )
    const expired = await createJourneyInvitation(owner, current.id)
    await prisma.journeyInvitation.update({
      where: { id: expired.invitation.id },
      data: { expiresAt: new Date(0) },
    })
    await expect(
      previewJourneyInvitation(expired.url.split("/").at(-1)!)
    ).rejects.toThrow("not found")
    expect(
      await prisma.journeyMember.count({ where: { journeyId: current.id } })
    ).toBe(0)
  })
  it("extracts authorized originals without persisting guesses, and returns a retryable OCR failure", async () => {
    const asset = await upload()
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          errorCode: 0,
          result: {
            ocrResults: [
              {
                prunedResult: {
                  rec_texts: [
                    "西湖小馆",
                    "2026-10-28",
                    "人民币",
                    "实付 128.50",
                    "午餐 2 128.50",
                  ],
                  rec_scores: [0.99, 0.98, 0.99, 0.99, 0.97],
                },
              },
            ],
          },
        }),
        { status: 200 }
      )
    )
    setTestAuthContext(owner)
    const result = await extractRoute(request({ assetId: asset.id }))
    expect(result.status).toBe(200)
    expect((await result.json()).fields).toEqual(fields)
    expect(
      await prisma.eventAssetLink.count({ where: { assetId: asset.id } })
    ).toBe(0)
    setTestAuthContext(stranger)
    expect((await extractRoute(request({ assetId: asset.id }))).status).toBe(
      403
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    setTestAuthContext(owner)
    fetchMock.mockRejectedValue(new Error("connection refused"))
    const failed = await extractRoute(request({ assetId: asset.id }))
    expect(failed.status).toBe(503)
    expect(await failed.json()).toMatchObject({ code: "OCR_UNAVAILABLE" })
    expect(
      await prisma.eventAssetLink.count({ where: { assetId: asset.id } })
    ).toBe(0)
  })
})
