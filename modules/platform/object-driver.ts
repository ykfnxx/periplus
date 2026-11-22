import { AssetStorageError } from "@/modules/data/assets/asset-contract"
import { resolve } from "node:path"
import { Operator, TimeoutLayer } from "opendal"
import { periplusServerConfig } from "@/config/periplus.server"

export interface ObjectStorageConfig {
  scheme: "s3" | "fs" | "memory"
  root?: string
  bucket?: string
  region?: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
}

export function createAssetOperator(config: ObjectStorageConfig) {
  const options: Record<string, string> = {}
  if (config.scheme === "fs") options.root = resolve(config.root ?? "uploads")
  if (config.scheme === "s3") {
    if (!config.bucket) throw new Error("PERIPLUS_STORAGE_BUCKET is required")
    options.bucket = config.bucket
    options.region = config.region ?? "us-east-1"
    if (config.endpoint) options.endpoint = config.endpoint
    if (config.accessKeyId) options.access_key_id = config.accessKeyId
    if (config.secretAccessKey)
      options.secret_access_key = config.secretAccessKey
  }
  const timeout = new TimeoutLayer()
  timeout.timeout = 30_000
  timeout.ioTimeout = 30_000
  return new Operator(config.scheme, options).layer(timeout.build())
}

let operator: Operator | undefined
export function assetOperator() {
  return (operator ??= createAssetOperator(periplusServerConfig.storage))
}

export function readObjectStream(key: string, start: number, end: number) {
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
