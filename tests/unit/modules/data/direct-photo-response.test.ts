// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest"
import { directPhotoResponse } from "@/modules/data/assets/object-storage"

afterEach(() => vi.unstubAllEnvs())

it("signs photo GETs for 60 seconds and keeps HEAD on the app", async () => {
  vi.stubEnv("PERIPLUS_STORAGE_DIRECT_PHOTO_READS", "true")
  vi.stubEnv("PERIPLUS_STORAGE_SCHEME", "s3")
  vi.stubEnv("PERIPLUS_STORAGE_BUCKET", "periplus-test")
  vi.stubEnv("PERIPLUS_STORAGE_REGION", "us-east-1")
  vi.stubEnv("PERIPLUS_STORAGE_ENDPOINT", "http://127.0.0.1:1")
  vi.stubEnv("PERIPLUS_STORAGE_ACCESS_KEY_ID", "fixture")
  vi.stubEnv("PERIPLUS_STORAGE_SECRET_ACCESS_KEY", "fixture")

  const asset = { kind: "IMAGE", storageKey: "private/assets/photo" }
  expect(await directPhotoResponse(asset, "HEAD")).toBeNull()

  const response = await directPhotoResponse(asset, "GET")
  expect(response?.status).toBe(307)
  expect(response?.headers.get("Cache-Control")).toBe("private, no-store")
  const url = new URL(response!.headers.get("Location")!)
  expect(url.searchParams.get("X-Amz-Expires")).toBe("60")
})
