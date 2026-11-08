// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { PHOTO_MAX_BYTES, PHOTO_SIZE_ERROR } from "@/types/photo"
import { recordingApi } from "@/modules/travelogue/data/client"
import { uploadPhotoResource } from "@/modules/data/photos/photo-repository"
import { POST } from "@/app/api/photos/route"

const { uploadResource } = vi.hoisted(() => ({ uploadResource: vi.fn() }))
vi.mock("@/modules/data/assets/asset-service", () => ({ uploadResource }))
vi.mock("@/modules/data/assets/asset-repository", () => ({}))
vi.mock("@/modules/auth/server/context", () => ({ isAdmin: () => false }))
vi.mock("@/modules/data/assets/asset-http", () => ({
  resourceResponse: (
    action: (context: { userId: string; role: "user" }) => unknown
  ) => action({ userId: "test", role: "user" }),
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function file(size: number) {
  return new File([new Uint8Array(size)], "photo.jpg", { type: "image/jpeg" })
}

describe("photo upload boundaries", () => {
  it("sends exactly 64MiB, but rejects larger files before fetching", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: "photo" }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      recordingApi.upload(file(PHOTO_MAX_BYTES), "upload")
    ).resolves.toEqual({ id: "photo" })
    expect(fetch).toHaveBeenCalledTimes(1)
    await expect(
      recordingApi.upload(file(PHOTO_MAX_BYTES + 1), "large")
    ).rejects.toThrow(PHOTO_SIZE_ERROR)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("enforces the same server limit and does not write oversized files", async () => {
    const stop = new Error("storage reached")
    uploadResource.mockRejectedValue(stop)
    const context = { userId: "test", role: "user" as const }
    await expect(
      uploadPhotoResource(context, file(PHOTO_MAX_BYTES), "ok", {})
    ).rejects.toBe(stop)
    expect(uploadResource.mock.calls[0][1].maxBytes).toBe(PHOTO_MAX_BYTES)
    await expect(
      uploadPhotoResource(context, file(PHOTO_MAX_BYTES + 1), "large", {})
    ).rejects.toThrow(PHOTO_SIZE_ERROR)
    expect(uploadResource).toHaveBeenCalledTimes(1)
  })

  it("returns a specific 400 for a truncated multipart body", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await POST(
      new NextRequest("http://localhost/api/photos", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=broken" },
        body: '--broken\r\nContent-Disposition: form-data; name="file"\r\n\r\ntruncated',
      })
    )
    expect(log).toHaveBeenCalledWith(
      "Photo multipart parsing failed",
      expect.objectContaining({
        contentType: "multipart/form-data; boundary=broken",
      })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: "INVALID_MULTIPART" })
    expect(uploadResource).not.toHaveBeenCalled()
  })

  it("preserves API reasons and explains a proxy 413 without JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ error: PHOTO_SIZE_ERROR }, { status: 400 })
        )
        .mockResolvedValueOnce(new Response("too large", { status: 413 }))
    )
    await expect(recordingApi.upload(file(1), "first")).rejects.toThrow(
      PHOTO_SIZE_ERROR
    )
    await expect(recordingApi.upload(file(1), "second")).rejects.toThrow(
      "上传内容过大"
    )
  })
})
