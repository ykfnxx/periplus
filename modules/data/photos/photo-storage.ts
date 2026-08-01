import path from "node:path"

const privatePhotoStoragePrefix = "private/photos/"
const privatePhotoRoot = path.join(process.cwd(), "uploads", "photos")
const privatePhotoFilenamePattern = /^[a-zA-Z0-9_-]+\.(?:jpg|png|webp|gif)$/

const extensionByMimeType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const

export function privatePhotoExtension(mimeType: string): string | null {
  return Object.hasOwn(extensionByMimeType, mimeType)
    ? extensionByMimeType[mimeType as keyof typeof extensionByMimeType]
    : null
}

export function createPrivatePhotoStorageKey(filename: string) {
  if (!privatePhotoFilenamePattern.test(filename)) {
    throw new Error("Invalid private photo filename")
  }
  return `${privatePhotoStoragePrefix}${filename}`
}

export function privatePhotoFilePath(storageKey: string) {
  if (!storageKey.startsWith(privatePhotoStoragePrefix)) {
    throw new Error("Photo is not stored in private storage")
  }
  const filename = storageKey.slice(privatePhotoStoragePrefix.length)
  if (!privatePhotoFilenamePattern.test(filename)) {
    throw new Error("Invalid private photo storage key")
  }
  return path.join(privatePhotoRoot, filename)
}
