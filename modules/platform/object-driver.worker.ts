import { getCloudflareContext } from "@opennextjs/cloudflare"
import type {
  R2MultipartUpload,
  R2UploadedPart,
} from "@cloudflare/workers-types"

const partSize = 8 * 1024 * 1024
const missing = () => new Error("NotFound")

export function assetOperator() {
  const bucket = getCloudflareContext().env.ASSETS_BUCKET
  return {
    capability: () => ({ writeWithContentType: true }),
    delete: (key: string) => bucket.delete(key),
    async stat(key: string) {
      const object = await bucket.head(key)
      if (!object) throw missing()
      return { contentLength: object.size }
    },
    async read(key: string, range?: { offset: bigint; size: bigint }) {
      const object = await bucket.get(
        key,
        range
          ? {
              range: {
                offset: Number(range.offset),
                length: Number(range.size),
              },
            }
          : undefined
      )
      if (!object) throw missing()
      return Buffer.from(await object.arrayBuffer())
    },
    async writer(key: string, options: { contentType?: string }) {
      const metadata = { httpMetadata: { contentType: options.contentType } }
      let multipart: R2MultipartUpload | undefined
      let chunks: Buffer[] = []
      let length = 0
      let finished = false
      const parts: R2UploadedPart[] = []
      async function flush() {
        multipart ??= await bucket.createMultipartUpload(key, metadata)
        parts.push(
          await multipart.uploadPart(
            parts.length + 1,
            Buffer.concat(chunks, length)
          )
        )
        chunks = []
        length = 0
      }
      return {
        async write(chunk: Buffer) {
          while (chunk.length) {
            const take = Math.min(chunk.length, partSize - length)
            chunks.push(chunk.subarray(0, take))
            length += take
            chunk = chunk.subarray(take)
            if (length === partSize) await flush()
          }
        },
        async close() {
          if (finished) return
          finished = true
          if (!multipart) {
            await bucket.put(key, Buffer.concat(chunks, length), metadata)
            return
          }
          try {
            if (length) await flush()
            await multipart.complete(parts)
          } catch (error) {
            await multipart.abort()
            throw error
          }
        },
      }
    },
  }
}

export { assetOperator as createAssetOperator }

export async function readObjectStream(
  key: string,
  start: number,
  end: number
) {
  const object = await getCloudflareContext().env.ASSETS_BUCKET.get(key, {
    range: { offset: start, length: end - start + 1 },
  })
  if (!object) throw missing()
  return object.body
}
