import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { Operator, RetryLayer, TimeoutLayer } from "opendal"
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
  const retry = new RetryLayer()
  retry.maxTimes = 2
  retry.jitter = true
  return new Operator(config.scheme, options)
    .layer(retry.build())
    .layer(timeout.build())
}

let operator: Operator | undefined
export function assetOperator() {
  return (operator ??= createAssetOperator(periplusServerConfig.storage))
}

export function newObjectKey() {
  // Each upload attempt owns a different key, so compensating a retry can never
  // delete the object belonging to the winning database receipt.
  return `private/assets/${randomUUID()}`
}

export function assertObjectKey(key: string) {
  if (
    !key.startsWith("private/") ||
    !/^[a-zA-Z0-9_./-]+$/.test(key) ||
    key
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid private object key")
  }
}

export function isObjectNotFound(error: unknown) {
  return error instanceof Error && /\bNotFound\b/.test(error.message)
}
