import { randomUUID } from "node:crypto"
export {
  assetOperator,
  createAssetOperator,
  readObjectStream,
} from "@/modules/platform/object-driver"

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
