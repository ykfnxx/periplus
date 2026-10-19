import { createHash, randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import {
  createPhoto,
  findPhotoUpload,
  listPhotos,
  PhotoIdempotencyError,
  PhotoInputError,
} from "@/modules/data/photos/photo-repository"
import {
  createPrivatePhotoStorageKey,
  privatePhotoExtension,
  privatePhotoFilePath,
} from "@/modules/data/photos/photo-storage"

const maxPhotoSize = 5 * 1024 * 1024

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function parseCoordinate(value: FormDataEntryValue | null) {
  if (value === null) return undefined
  if (typeof value !== "string" || !value.trim()) return Number.NaN
  return Number(value)
}

export async function GET() {
  try {
    const context = await requireCurrentUser()
    return NextResponse.json(await listPhotos(context))
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireCurrentUser()
    const formData = await request.formData()
    const file = formData.get("file")
    const uploadId = formData.get("uploadId")
    const lat = parseCoordinate(formData.get("lat"))
    const lng = parseCoordinate(formData.get("lng"))
    const caption =
      typeof formData.get("caption") === "string"
        ? String(formData.get("caption"))
        : undefined

    if (!(file instanceof File)) return badRequest("请选择图片文件")
    if (
      typeof uploadId !== "string" ||
      !uploadId.trim() ||
      uploadId.length > 200
    )
      return badRequest("上传需要稳定的 uploadId")
    const extension = privatePhotoExtension(file.type)
    if (!extension) return badRequest("仅支持 JPEG、PNG、WebP 或 GIF 图片")
    if (!file.size || file.size > maxPhotoSize)
      return badRequest("图片大小需大于 0 且不能超过 5MB")
    if ((lat === undefined) !== (lng === undefined))
      return badRequest("经纬度需同时提供")
    if (
      (lat !== undefined && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
      (lng !== undefined && (!Number.isFinite(lng) || lng < -180 || lng > 180))
    )
      return badRequest("照片坐标无效")
    if (caption?.trim()) {
      return badRequest("照片说明请在关联行程事件后填写")
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const checksum = createHash("sha256").update(bytes).digest("hex")
    const input = {
      uploadId,
      lat,
      lng,
      mimeType: file.type,
      size: bytes.length,
      checksum,
      originalName: file.name || undefined,
    }
    const previous = await findPhotoUpload(context, input)
    if (previous) return NextResponse.json(previous)
    const filename = `${randomUUID()}.${extension}`
    const storageKey = createPrivatePhotoStorageKey(filename)
    const filePath = privatePhotoFilePath(storageKey)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, bytes)

    let photo
    try {
      const result = await createPhoto(context, { storageKey, ...input })
      photo = result.photo
      if (!result.created) await unlink(filePath)
    } catch (error) {
      await unlink(filePath).catch(() => undefined)
      throw error
    }

    return NextResponse.json(photo, { status: 201 })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
    if (error instanceof PhotoInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof PhotoIdempotencyError)
      return NextResponse.json(
        { error: error.message, code: "IDEMPOTENCY_CONFLICT" },
        { status: 409 }
      )
    if (error instanceof z.ZodError)
      return badRequest(error.issues.map((issue) => issue.message).join("; "))
    throw error
  }
}
