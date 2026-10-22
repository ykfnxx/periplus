import { NextResponse } from "next/server"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireCurrentUser,
  type AuthContext,
} from "@/modules/auth/server/context"
import { AssetInUseError } from "@/modules/data/content/content-repository"
import {
  AssetInputError,
  AssetStorageError,
  AssetUploadConflictError,
} from "./asset-contract"
import { getAssetRecord, type AssetRecord } from "./asset-repository"
import { parseByteRange, resourceStream } from "./asset-service"
import {
  assetOperator,
  assertObjectKey,
  isObjectNotFound,
} from "./object-storage"

export async function resourceResponse(
  action: (context: AuthContext) => Promise<Response>
) {
  try {
    return await action(await requireCurrentUser())
  } catch (error) {
    if (
      error instanceof AuthRequiredError ||
      error instanceof PermissionDeniedError
    ) {
      return NextResponse.json(
        { error: error.message, code: "FORBIDDEN" },
        { status: error instanceof AuthRequiredError ? 401 : 403 }
      )
    }
    if (error instanceof AssetInputError)
      return NextResponse.json(
        { error: error.message, code: "INVALID_INPUT" },
        { status: 400 }
      )
    if (
      error instanceof AssetUploadConflictError ||
      error instanceof AssetInUseError
    ) {
      return NextResponse.json(
        {
          error: error.message,
          code:
            error instanceof AssetUploadConflictError
              ? "IDEMPOTENCY_CONFLICT"
              : "RESOURCE_IN_USE",
        },
        { status: 409 }
      )
    }
    if (error instanceof AssetStorageError)
      return NextResponse.json(
        { error: error.message, code: "STORAGE_UNAVAILABLE" },
        { status: 503 }
      )
    throw error
  }
}

export async function resourceFile(
  request: Request,
  id: string,
  kind?: AssetRecord["kind"]
) {
  return resourceResponse(async (context) => {
    // This check remains on every read. No signed download URL can bypass a
    // subsequent soft deletion or a change to the resource's ownership rules.
    const asset = await getAssetRecord(context, id, kind)
    if (!asset)
      return NextResponse.json({ error: "Resource not found" }, { status: 404 })
    try {
      assertObjectKey(asset.storageKey)
      await assetOperator().stat(asset.storageKey)
    } catch (error) {
      if (isObjectNotFound(error))
        return NextResponse.json(
          { error: "Resource not found" },
          { status: 404 }
        )
      throw new AssetStorageError()
    }
    let range
    try {
      range = parseByteRange(request.headers.get("range"), asset.sizeBytes)
    } catch {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${asset.sizeBytes}` },
      })
    }
    const start = range?.start ?? 0
    const end = range?.end ?? asset.sizeBytes - 1
    return new Response(resourceStream(asset.storageKey, start, end), {
      status: range ? 206 : 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Type": asset.mimeType,
        "Content-Length": String(end - start + 1),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(range
          ? { "Content-Range": `bytes ${start}-${end}/${asset.sizeBytes}` }
          : {}),
        ...(asset.kind === "FILE"
          ? {
              "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.originalName ?? "download")}`,
            }
          : {}),
      },
    })
  })
}
