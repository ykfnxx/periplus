import { createHash } from "node:crypto"
import { z } from "zod"
import {
  authenticateAgent,
  agentAuthResponse,
} from "@/modules/agent/server/access"
import { AgentAuthorizationError } from "@/modules/agent/contracts"
import { uploadPhotoResource } from "@/modules/data/photos/photo-repository"
import { PHOTO_MAX_BYTES, PHOTO_SIZE_ERROR } from "@/types/photo"
import {
  AssetInputError,
  AssetStorageError,
  AssetUploadConflictError,
} from "@/modules/data/assets/asset-contract"

export const runtime = "nodejs"
export async function POST(
  request: Request,
  { params }: { params: Promise<{ journeyId: string }> }
) {
  try {
    const identity = await authenticateAgent(request, [
      "journey:read",
      "photos:upload",
    ])
    if ((await params).journeyId !== identity.grant.journeyId) {
      throw new AgentAuthorizationError(
        "Journey is outside this authorization",
        403
      )
    }
    let form: FormData
    try {
      form = await request.formData()
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      return Response.json(
        { code: "INVALID_INPUT", message: "Invalid multipart upload" },
        { status: 400 }
      )
    }
    const file = form.get("file")
    const uploadId = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .parse(form.get("uploadId"))
    if (!(file instanceof File))
      throw new AssetInputError("An image file is required")
    if (file.size > PHOTO_MAX_BYTES)
      return Response.json(
        { code: "INVALID_INPUT", message: PHOTO_SIZE_ERROR },
        { status: 413 }
      )
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type.toLowerCase()
      )
    ) {
      return Response.json(
        { code: "INVALID_INPUT", message: "Unsupported image format" },
        { status: 415 }
      )
    }
    const key = createHash("sha256")
      .update(JSON.stringify([identity.grant.id, uploadId]))
      .digest("hex")
    const result = await uploadPhotoResource(
      identity.context,
      file,
      `agent-${key}`,
      {},
      request.signal
    )
    return Response.json(
      {
        assetId: result.photo.id,
        mimeType: file.type.toLowerCase(),
        sizeBytes: file.size,
        replayed: !result.created,
      },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      }
    )
  } catch (error) {
    if (error instanceof AgentAuthorizationError)
      return agentAuthResponse(error)
    if (error instanceof z.ZodError || error instanceof AssetInputError) {
      return Response.json(
        { code: "INVALID_INPUT", message: error.message },
        { status: 400 }
      )
    }
    if (error instanceof AssetUploadConflictError)
      return Response.json(
        { code: "IDEMPOTENCY_CONFLICT", message: error.message },
        { status: 409 }
      )
    if (error instanceof AssetStorageError)
      return Response.json(
        { code: "STORAGE_UNAVAILABLE", message: error.message },
        { status: 503 }
      )
    throw error
  }
}
