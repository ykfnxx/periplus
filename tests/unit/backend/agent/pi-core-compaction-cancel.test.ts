import { afterEach, describe, expect, it, vi } from "vitest"

const generateSummaryWithUsage = vi.hoisted(() => vi.fn())

vi.mock("@earendil-works/pi-agent-core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@earendil-works/pi-agent-core")>()
  return { ...actual, generateSummaryWithUsage }
})

import { PeriplusAgentHarness } from "@/backend/agent/periplus-agent-harness"

afterEach(() => vi.clearAllMocks())

describe("Pi core conversation summary cancellation", () => {
  it("passes the bounded checkpoint signal to Pi summary generation", async () => {
    let markSummaryStarted!: () => void
    const summaryStarted = new Promise<void>((resolve) => {
      markSummaryStarted = resolve
    })
    generateSummaryWithUsage.mockImplementation(
      (
        _messages: unknown,
        _models: unknown,
        _model: unknown,
        _reserveTokens: unknown,
        signal: AbortSignal
      ) =>
        new Promise((_, reject) => {
          markSummaryStarted()
          signal.addEventListener(
            "abort",
            () =>
              reject(
                Object.assign(new Error("cancelled"), { name: "AbortError" })
              ),
            { once: true }
          )
        })
    )
    const harness = new PeriplusAgentHarness({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      webSearchEnabled: false,
      timeoutMs: 30_000,
    })
    const controller = new AbortController()

    const summary = harness.generateConversationSummary(
      [
        {
          id: "previous-user-message",
          role: "user",
          content: "请保留安静酒店偏好",
          createdAt: "2026-08-13T00:00:00.000Z",
        },
      ],
      undefined,
      controller.signal
    )

    await summaryStarted
    controller.abort()

    await expect(summary).rejects.toMatchObject({ name: "AbortError" })
    expect(generateSummaryWithUsage).toHaveBeenCalledOnce()
  })
})
