// @vitest-environment node
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NextRequest } from "next/server"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { GET as listAssets, POST as uploadAsset } from "@/app/api/assets/route"
import { DELETE as deleteAsset } from "@/app/api/assets/[id]/route"
import { GET as readAsset } from "@/app/api/assets/[id]/file/route"
import { setTestAuthContext } from "@/modules/auth/server/context"
import { prisma } from "@/modules/data/db/prisma"
import {
  assetDtoSchema,
  AssetInputError,
  AssetUploadConflictError,
} from "@/modules/data/assets/asset-contract"
import {
  uploadResource,
  parseByteRange,
} from "@/modules/data/assets/asset-service"
import {
  assetOperator,
  createAssetOperator,
  newObjectKey,
} from "@/modules/data/assets/object-storage"

const owner = {
  userId: `resource-owner-${randomUUID()}`,
  role: "user" as const,
}
const other = {
  userId: `resource-other-${randomUUID()}`,
  role: "user" as const,
}
const keys = new Set<string>()
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const request = (range?: string) =>
  new NextRequest("http://localhost/api/assets/file", {
    headers: range ? { Range: range } : {},
  })
const stream = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
async function upload(
  bytes = Buffer.from("sound-data"),
  uploadId: string = randomUUID(),
  extra = {}
) {
  const result = await uploadResource(owner, {
    source: stream(bytes),
    uploadId,
    mimeType: "audio/mpeg",
    ...extra,
  })
  keys.add(result.asset.storageKey)
  return result
}

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test")
  await prisma.user.createMany({
    data: [owner, other].map(({ userId }) => ({
      id: userId,
      name: userId,
      email: `${userId}@example.test`,
      emailVerified: true,
    })),
  })
})
beforeEach(() => setTestAuthContext(owner))
afterEach(() => vi.restoreAllMocks())
afterAll(async () => {
  setTestAuthContext(undefined)
  const records = await prisma.asset.findMany({
    where: { ownerId: owner.userId },
  })
  records.forEach((record) => keys.add(record.storageKey))
  await Promise.all([...keys].map((key) => assetOperator().delete(key)))
  vi.unstubAllEnvs()
})

describe.sequential("OpenDAL resource service", () => {
  it.each(["memory", "fs"] as const)(
    "uses the same object contract with %s",
    async (scheme) => {
      const root = await mkdtemp(join(tmpdir(), "periplus-objects-"))
      try {
        const op = createAssetOperator({ scheme, root })
        const key = newObjectKey()
        await op.write(key, Buffer.from("abcdef"))
        expect(Number((await op.stat(key)).contentLength)).toBe(6)
        expect(
          (
            await op.read(key, { offset: BigInt(1), size: BigInt(3) })
          ).toString()
        ).toBe("bcd")
        await op.delete(key)
        expect(await op.exists(key)).toBe(false)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    }
  )

  it("streams binary bytes, pins their checksum and serves bounded ranges", async () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 31)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
    const { asset } = await upload(bytes, randomUUID(), {
      mimeType: "video/mp4",
    })
    expect(asset).toMatchObject({
      kind: "VIDEO",
      sizeBytes: bytes.length,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    })
    for (const [header, start, end] of [
      [undefined, 0, bytes.length - 1],
      ["bytes=1048560-1048600", 1048560, 1048600],
      ["bytes=-17", bytes.length - 17, bytes.length - 1],
      ["bytes=2097152-", 2097152, bytes.length - 1],
    ] as const) {
      const response = await readAsset(request(header), params(asset.id))
      expect(response.status).toBe(header ? 206 : 200)
      expect(response.headers.get("content-length")).toBe(
        String(end - start + 1)
      )
      expect(
        Buffer.from(await response.arrayBuffer()).equals(
          bytes.subarray(start, end + 1)
        )
      ).toBe(true)
      if (header)
        expect(response.headers.get("content-range")).toBe(
          `bytes ${start}-${end}/${bytes.length}`
        )
    }
    for (const range of [
      "bytes=9999999-",
      "bytes=3-1",
      "bytes=-0",
      "bytes=0-1,3-4",
      "bytes=-999999999999999999999999",
    ]) {
      const response = await readAsset(request(range), params(asset.id))
      expect(response.status).toBe(416)
      expect(response.headers.get("content-range")).toBe(
        `bytes */${bytes.length}`
      )
    }
    expect(() => parseByteRange("bytes=0-", 0)).toThrow(AssetInputError)
  })

  it("handles empty and missing objects without bypassing metadata validation", async () => {
    const key = newObjectKey()
    keys.add(key)
    await assetOperator().write(key, Buffer.alloc(0))
    const asset = await prisma.asset.create({
      data: {
        ownerId: owner.userId,
        kind: "FILE",
        storageKey: key,
        mimeType: "application/octet-stream",
        sizeBytes: 0,
        checksum: createHash("sha256").digest("hex"),
      },
    })
    const empty = await readAsset(request(), params(asset.id))
    expect(empty.status).toBe(200)
    expect(empty.headers.get("content-length")).toBe("0")
    expect((await empty.arrayBuffer()).byteLength).toBe(0)
    expect(
      (await readAsset(request("bytes=0-"), params(asset.id))).status
    ).toBe(416)
    await assetOperator().delete(key)
    expect((await readAsset(request(), params(asset.id))).status).toBe(404)
    await prisma.asset.update({
      where: { id: asset.id },
      data: { storageKey: `../../outside-${randomUUID()}` },
    })
    try {
      const stat = vi.spyOn(assetOperator(), "stat")
      expect((await readAsset(request(), params(asset.id))).status).toBe(503)
      expect(stat).not.toHaveBeenCalled()
    } finally {
      await prisma.asset.update({
        where: { id: asset.id },
        data: { storageKey: key },
      })
    }
  })

  it("keeps concurrent retries on one receipt and cleans only losing candidates", async () => {
    const op = assetOperator()
    const deleteSpy = vi.spyOn(op, "delete")
    const uploadId = randomUUID()
    const results = await Promise.all([
      upload(undefined, uploadId),
      upload(undefined, uploadId),
      upload(undefined, uploadId),
    ])
    expect(new Set(results.map((result) => result.asset.id)).size).toBe(1)
    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(
      await prisma.asset.count({ where: { ownerId: owner.userId, uploadId } })
    ).toBe(1)
    const canonicalKey = results[0]!.asset.storageKey
    expect(deleteSpy).toHaveBeenCalledTimes(2)
    expect(deleteSpy.mock.calls.every(([key]) => key !== canonicalKey)).toBe(
      true
    )
    expect((await op.read(canonicalKey)).toString()).toBe("sound-data")
    await expect(
      upload(Buffer.from("changed"), uploadId)
    ).rejects.toBeInstanceOf(AssetUploadConflictError)
    expect((await op.read(canonicalKey)).toString()).toBe("sound-data")
  })

  it("recovers a committed receipt when the database acknowledgement is lost", async () => {
    const create = prisma.asset.create.bind(prisma.asset)
    const loseAcknowledgement = async (args: Parameters<typeof create>[0]) => {
      await create(args)
      throw new Error("lost commit acknowledgement")
    }
    // Prisma returns a fluent thenable; this fault deliberately replaces only
    // its awaited outcome, without using relation accessors.
    vi.spyOn(prisma.asset, "create").mockImplementationOnce(
      loseAcknowledgement as unknown as typeof prisma.asset.create
    )
    const { asset, created } = await upload()
    expect(created).toBe(true)
    expect((await assetOperator().read(asset.storageKey)).toString()).toBe(
      "sound-data"
    )
    expect((await upload(undefined, asset.uploadId!)).asset.id).toBe(asset.id)
  })

  it("retains the object if both the commit response and reconciliation fail", async () => {
    const create = prisma.asset.create.bind(prisma.asset)
    const find = prisma.asset.findUnique.bind(prisma.asset)
    let candidate = ""
    const findSpy = vi.spyOn(prisma.asset, "findUnique")
    findSpy.mockImplementationOnce((args) => find(args))
    findSpy.mockRejectedValueOnce(new Error("database unavailable"))
    const loseAcknowledgement = async (args: Parameters<typeof create>[0]) => {
      const record = await create(args)
      candidate = record.storageKey
      keys.add(candidate)
      throw new Error("lost commit acknowledgement")
    }
    vi.spyOn(prisma.asset, "create").mockImplementationOnce(
      loseAcknowledgement as unknown as typeof prisma.asset.create
    )
    const uploadId = randomUUID()
    await expect(upload(undefined, uploadId)).rejects.toThrow(
      "lost commit acknowledgement"
    )
    expect((await assetOperator().read(candidate)).toString()).toBe(
      "sound-data"
    )
    vi.restoreAllMocks()
    expect((await upload(undefined, uploadId)).asset.storageKey).toBe(candidate)
  })

  it("compensates invalid, failed and cancelled streams without metadata", async () => {
    const op = assetOperator()
    const deletion = vi.spyOn(op, "delete")
    for (const input of [
      { source: stream(Buffer.from("12345")), maxBytes: 4 },
      { source: stream(Buffer.from("12345")), sizeBytes: 6 },
      { source: stream(new Uint8Array()) },
      {
        source: new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new Error("source failed"))
          },
        }),
      },
    ]) {
      const uploadId = randomUUID()
      await expect(
        uploadResource(owner, { uploadId, mimeType: "audio/mpeg", ...input })
      ).rejects.toThrow()
      expect(
        await prisma.asset.count({ where: { ownerId: owner.userId, uploadId } })
      ).toBe(0)
    }
    const abort = new AbortController()
    abort.abort()
    await expect(
      uploadResource(
        owner,
        {
          uploadId: randomUUID(),
          mimeType: "audio/mpeg",
          source: stream(Buffer.from("123")),
        },
        abort.signal
      )
    ).rejects.toThrow()
    expect(deletion).toHaveBeenCalledTimes(5)
    for (const [key] of deletion.mock.calls)
      expect(await op.exists(key)).toBe(false)
  })

  it("authenticates generic upload/list/read/delete and keeps soft-deleted bytes", async () => {
    setTestAuthContext(null)
    expect((await listAssets()).status).toBe(401)
    setTestAuthContext(owner)
    const response = await uploadAsset(
      new NextRequest("http://localhost/api/assets", {
        method: "POST",
        headers: {
          "content-type": "application/pdf",
          "x-upload-id": randomUUID(),
          "x-file-name": encodeURIComponent("路线.pdf"),
        },
        body: Buffer.from("pdf-content"),
      })
    )
    expect(response.status).toBe(201)
    const dto = assetDtoSchema.parse(await response.json())
    expect(dto.kind).toBe("FILE")
    expect(dto).not.toHaveProperty("storageKey")
    const record = await prisma.asset.findUniqueOrThrow({
      where: { id: dto.id },
    })
    keys.add(record.storageKey)
    const read = await readAsset(request(), params(dto.id))
    expect(read.headers.get("content-disposition")).toContain("attachment;")
    expect(await read.text()).toBe("pdf-content")
    setTestAuthContext(other)
    expect((await readAsset(request("bytes=0-1"), params(dto.id))).status).toBe(
      403
    )
    expect((await deleteAsset(request(), params(dto.id))).status).toBe(403)
    expect(await (await listAssets()).json()).toEqual([])
    setTestAuthContext(owner)
    expect((await deleteAsset(request(), params(dto.id))).status).toBe(200)
    expect((await readAsset(request("bytes=0-1"), params(dto.id))).status).toBe(
      404
    )
    expect(await assetOperator().exists(record.storageKey)).toBe(true)
    expect(
      (await prisma.asset.findUniqueOrThrow({ where: { id: dto.id } }))
        .deletedAt
    ).not.toBeNull()
  })
})
