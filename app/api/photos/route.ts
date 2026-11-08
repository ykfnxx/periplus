import { NextRequest, NextResponse } from "next/server"
import { AssetInputError } from "@/modules/data/assets/asset-contract"
import { resourceResponse } from "@/modules/data/assets/asset-http"
import {
  listPhotos,
  uploadPhotoResource,
} from "@/modules/data/photos/photo-repository"

export const runtime = "nodejs"
function coordinate(value: FormDataEntryValue | null) {
  if (value === null) return undefined
  return typeof value === "string" && value.trim() ? Number(value) : Number.NaN
}
export function GET() {
  return resourceResponse(async (context) =>
    NextResponse.json(await listPhotos(context))
  )
}
export function POST(request: NextRequest) {
  return resourceResponse(async (context) => {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      console.error("Photo multipart parsing failed", {
        contentType: request.headers.get("content-type"),
        contentLength: request.headers.get("content-length"),
        userAgent: request.headers.get("user-agent"),
        reason: error.message,
      })
      return NextResponse.json(
        {
          error: "图片上传数据不完整或格式异常，请重新选择图片后重试。",
          code: "INVALID_MULTIPART",
        },
        { status: 400 }
      )
    }
    const file = formData.get("file")
    const uploadId = formData.get("uploadId")
    if (!(file instanceof File)) throw new AssetInputError("请选择图片文件")
    if (typeof uploadId !== "string")
      throw new AssetInputError("上传需要稳定的 uploadId")
    const caption = formData.get("caption")
    if (typeof caption === "string" && caption.trim())
      throw new AssetInputError("照片说明请在关联行程事件后填写")
    const result = await uploadPhotoResource(
      context,
      file,
      uploadId,
      {
        lat: coordinate(formData.get("lat")),
        lng: coordinate(formData.get("lng")),
      },
      request.signal
    )
    return NextResponse.json(result.photo, {
      status: result.created ? 201 : 200,
    })
  })
}
