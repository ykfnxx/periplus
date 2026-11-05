import { getSharedAsset } from "@/modules/data/sharing/share-service"
import {
  resourceStream,
  parseByteRange,
} from "@/modules/data/assets/asset-service"
import {
  assetOperator,
  assertObjectKey,
  isObjectNotFound,
} from "@/modules/data/assets/object-storage"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; assetId: string }> }
) {
  const { token, assetId } = await params
  const asset = await getSharedAsset(token, assetId)
  if (!asset) return new Response(null, { status: 404, headers })
  assertObjectKey(asset.storageKey)
  try {
    await assetOperator().stat(asset.storageKey)
  } catch (error) {
    if (isObjectNotFound(error))
      return new Response(null, { status: 404, headers })
    return new Response(null, { status: 503, headers })
  }
  let range
  try {
    range = parseByteRange(request.headers.get("range"), asset.sizeBytes)
  } catch {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${asset.sizeBytes}` },
    })
  }
  const start = range?.start ?? 0,
    end = range?.end ?? asset.sizeBytes - 1
  return new Response(resourceStream(asset.storageKey, start, end), {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "Content-Type": asset.mimeType,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      ...(range
        ? { "Content-Range": `bytes ${start}-${end}/${asset.sizeBytes}` }
        : {}),
    },
  })
}
