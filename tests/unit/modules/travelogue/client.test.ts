import { afterEach, describe, expect, it, vi } from "vitest"
import {
  recordingApi,
  RecordingApiError,
} from "@/modules/travelogue/data/client"

afterEach(() => vi.unstubAllGlobals())
function respond(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
}

describe("recording HTTP response parsing", () => {
  it("returns a successful JSON response", async () => {
    respond(Response.json([]))
    expect(await recordingApi.list()).toEqual([])
  })

  it("rejects malformed successful responses instead of returning typed null", async () => {
    respond(new Response("not JSON", { status: 200 }))
    await expect(recordingApi.list()).rejects.toBeInstanceOf(SyntaxError)
  })

  it("preserves the server's readable HTTP error and status", async () => {
    respond(
      Response.json({ error: "没有权限。", code: "FORBIDDEN" }, { status: 403 })
    )
    await expect(recordingApi.list()).rejects.toMatchObject({
      name: "RecordingApiError",
      message: "没有权限。",
      status: 403,
      code: "FORBIDDEN",
    })
  })

  it("preserves the generic message for a non-JSON error response", async () => {
    respond(new Response("unavailable", { status: 503 }))
    await expect(recordingApi.list()).rejects.toMatchObject({
      name: "RecordingApiError",
      message: "请求失败，请重试。",
      status: 503,
    })
  })

  it("preserves the current OCR error explanation", async () => {
    respond(Response.json({ code: "OCR_UNAVAILABLE" }, { status: 503 }))
    await expect(recordingApi.extractReceipt("receipt-image")).rejects.toEqual(
      new RecordingApiError(
        "账单识别暂时不可用，请稍后重试。",
        503,
        "OCR_UNAVAILABLE"
      )
    )
  })
})
