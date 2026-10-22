import { createHash } from "node:crypto"
import { Readable } from "node:stream"
import { isAdmin, type AuthContext } from "@/modules/auth/server/context"
import { deleteAsset } from "@/modules/data/content/content-repository"
import {
  AssetInputError,
  AssetStorageError,
  AssetUploadConflictError,
  type AssetDto,
} from "./asset-contract"
import {
  getAssetRecord,
  saveAssetUpload,
  type AssetRecord,
} from "./asset-repository"
import { assetOperator, assertObjectKey, newObjectKey } from "./object-storage"

const imageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])
export function resourceKind(mimeType: string): AssetRecord["kind"] {
  if (imageTypes.has(mimeType)) return "IMAGE"
  if (/^audio\/[a-z0-9.+-]+$/.test(mimeType)) return "AUDIO"
  if (/^video\/[a-z0-9.+-]+$/.test(mimeType)) return "VIDEO"
  if (
    ["application/pdf", "application/octet-stream", "text/plain"].includes(
      mimeType
    )
  )
    return "FILE"
  throw new AssetInputError("Unsupported resource MIME type")
}

export function assetUrl(id: string) {
  return `/api/assets/${encodeURIComponent(id)}/file`
}
export function assetDto(context: AuthContext, asset: AssetRecord): AssetDto {
  return {
    id: asset.id,
    kind: asset.kind,
    url: assetUrl(asset.id),
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    originalName: asset.originalName,
    createdAt: asset.createdAt.toISOString(),
    canDelete: isAdmin(context) || asset.ownerId === context.userId,
  }
}

export interface ResourceUpload {
  uploadId: string
  mimeType: string
  source: ReadableStream<Uint8Array>
  originalName?: string
  sizeBytes?: number
  lat?: number
  lng?: number
  requiredKind?: AssetRecord["kind"]
  maxBytes?: number
}

export async function uploadResource(
  context: AuthContext,
  input: ResourceUpload,
  signal?: AbortSignal
) {
  const mimeType = input.mimeType.split(";")[0]!.trim().toLowerCase()
  const kind = resourceKind(mimeType)
  const maxBytes = input.maxBytes ?? 100 * 1024 * 1024
  if (!input.uploadId.trim() || input.uploadId.length > 200)
    throw new AssetInputError("A stable uploadId is required")
  if (input.originalName && input.originalName.length > 300)
    throw new AssetInputError("Resource filename is too long")
  if (input.requiredKind && kind !== input.requiredKind)
    throw new AssetInputError("Unsupported resource kind")
  if (
    input.sizeBytes !== undefined &&
    (!Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > maxBytes)
  ) {
    throw new AssetInputError(
      "Resource size is invalid or exceeds the upload limit"
    )
  }
  if (
    (input.lat === undefined) !== (input.lng === undefined) ||
    (input.lat !== undefined &&
      (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90)) ||
    (input.lng !== undefined &&
      (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180))
  ) {
    throw new AssetInputError(
      "Resource coordinates must be a valid latitude/longitude pair"
    )
  }
  const op = assetOperator()
  const key = newObjectKey()
  let retained = false
  try {
    const hash = createHash("sha256")
    let sizeBytes = 0
    try {
      signal?.throwIfAborted()
      const writer = await op.writer(
        key,
        op.capability().writeWithContentType ? { contentType: mimeType } : {}
      )
      let closed = false
      try {
        const source = Readable.fromWeb(
          input.source as import("node:stream/web").ReadableStream<Uint8Array>,
          { signal }
        )
        for await (const chunk of source) {
          sizeBytes += chunk.length
          if (sizeBytes > maxBytes)
            throw new AssetInputError("Resource exceeds the upload limit")
          hash.update(chunk)
          await writer.write(chunk)
        }
        signal?.throwIfAborted()
        await writer.close()
        closed = true
      } finally {
        // This binding has no writer.abort(). Finish a partial candidate before
        // compensating it, with no concurrent native writes still in flight.
        if (!closed) await writer.close().catch(() => undefined)
      }
    } catch (error) {
      if (error instanceof AssetInputError || signal?.aborted) throw error
      throw new AssetStorageError()
    }
    if (
      !sizeBytes ||
      (input.sizeBytes !== undefined && sizeBytes !== input.sizeBytes)
    ) {
      throw new AssetInputError(
        "Resource size does not match the uploaded bytes"
      )
    }
    const checksum = hash.digest("hex")
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          checksum,
          mimeType,
          sizeBytes,
          originalName: input.originalName ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
        })
      )
      .digest("hex")
    // Once a database write starts, a lost response can hide a successful
    // commit. Keep the candidate unless a receipt proves another key won.
    retained = true
    try {
      const result = await saveAssetUpload(context, {
        storageKey: key,
        uploadId: input.uploadId,
        fingerprint,
        kind,
        mimeType,
        sizeBytes,
        checksum,
        originalName: input.originalName,
        lat: input.lat,
        lng: input.lng,
      })
      retained = result.asset.storageKey === key
      return result
    } catch (error) {
      if (error instanceof AssetUploadConflictError)
        retained = error.preserveObject
      throw error
    }
  } finally {
    if (!retained) {
      // Only this attempt's unique candidate is deleted. Soft deletion and
      // event detachment retain objects referenced by historical revisions.
      await op
        .delete(key)
        .catch(() => console.error("Resource candidate cleanup failed"))
    }
  }
}

export async function removeResource(
  context: AuthContext,
  id: string,
  kind?: AssetRecord["kind"]
) {
  const asset = await getAssetRecord(context, id, kind)
  if (!asset) return false
  return deleteAsset(context, id)
}

export function parseByteRange(header: string | null, size: number) {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2]) || size === 0)
    throw new AssetInputError("Unsatisfiable byte range")
  if (
    [match[1], match[2]].some(
      (value) => value && !Number.isSafeInteger(Number(value))
    )
  ) {
    throw new AssetInputError("Unsatisfiable byte range")
  }
  const suffix = !match[1]
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1])
  const end =
    suffix || !match[2] ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    throw new AssetInputError("Unsatisfiable byte range")
  }
  return { start, end }
}

export function resourceStream(key: string, start: number, end: number) {
  assertObjectKey(key)
  const op = assetOperator()
  let offset = start
  let cancelled = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled) return
      if (offset > end) return controller.close()
      const size = Math.min(1024 * 1024, end - offset + 1)
      try {
        // The Node binding exposes byte ranges on read(), not reader(). Bound
        // each read and let the response stream provide downstream backpressure.
        const bytes = await op.read(key, {
          offset: BigInt(offset),
          size: BigInt(size),
        })
        if (cancelled) return
        if (!bytes.length || bytes.length > size) throw new AssetStorageError()
        offset += bytes.length
        controller.enqueue(new Uint8Array(bytes))
      } catch {
        if (!cancelled) controller.error(new AssetStorageError())
      }
    },
    cancel() {
      cancelled = true
    },
  })
}
