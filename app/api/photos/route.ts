import { createHash, randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import {
  createPhoto,
  listPhotos,
  PhotoInputError,
} from "@/modules/data/photos/photo-repository"

const maxPhotoSize = 5 * 1024 * 1024
const uploadRoot = path.join(process.cwd(), "public", "uploads", "photos")

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function parseCoordinate(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return Number.NaN
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
    const lat = parseCoordinate(formData.get("lat"))
    const lng = parseCoordinate(formData.get("lng"))
    const caption =
      typeof formData.get("caption") === "string"
        ? String(formData.get("caption"))
        : undefined

    if (!(file instanceof File)) return badRequest("请选择图片文件")
    if (!file.type.startsWith("image/")) return badRequest("请选择图片文件")
    if (file.size > maxPhotoSize) return badRequest("图片大小不能超过 5MB")
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return badRequest("请选择照片位置")
    }
    if (caption?.trim()) {
      return badRequest("照片说明请在关联行程事件后填写")
    }

    const extension = extensionByMimeType[file.type] ?? "bin"
    const filename = `${randomUUID()}.${extension}`
    const filePath = path.join(uploadRoot, filename)
    const bytes = Buffer.from(await file.arrayBuffer())
    const checksum = createHash("sha256").update(bytes).digest("hex")
    await mkdir(uploadRoot, { recursive: true })
    await writeFile(filePath, bytes)

    let photo
    try {
      photo = await createPhoto(context, {
        url: `/uploads/photos/${filename}`,
        lat,
        lng,
        caption,
        mimeType: file.type,
        size: file.size,
        checksum,
        originalName: file.name || undefined,
      })
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
    throw error
  }
}
