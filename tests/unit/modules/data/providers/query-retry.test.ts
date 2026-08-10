import { describe, expect, it, vi } from "vitest"
import { queryWithRetry } from "@/modules/data/providers/query-retry"

describe("queryWithRetry", () => {
  it("uses bounded exponential backoff with rate-limit pacing", async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ failure: "rate" })
      .mockResolvedValueOnce({ failure: "transient" })
      .mockResolvedValueOnce({ value: "ok" })
    const sleep = vi.fn().mockResolvedValue(undefined)

    const result = await queryWithRetry<
      { failure: string } | { value: string }
    >({
      operation,
      failure: (value) =>
        "failure" in value
          ? {
              retryable: true,
              rateLimited: value.failure === "rate",
            }
          : undefined,
      sleep,
      random: () => 0.5,
    })

    expect(result).toEqual({
      result: { value: "ok" },
      attempts: 3,
      exhausted: false,
    })
    expect(sleep).toHaveBeenNthCalledWith(1, 1_000)
    expect(sleep).toHaveBeenNthCalledWith(2, 400)
  })

  it("does not retry a terminal provider failure", async () => {
    const operation = vi.fn().mockResolvedValue({ failure: "hard-quota" })
    const sleep = vi.fn().mockResolvedValue(undefined)

    const result = await queryWithRetry({
      operation,
      failure: () => ({ retryable: false }),
      sleep,
    })

    expect(result).toEqual({
      result: { failure: "hard-quota" },
      attempts: 1,
      exhausted: true,
    })
    expect(operation).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })

  it("terminates a retry backoff when its parent run is aborted", async () => {
    const controller = new AbortController()
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ failure: true })
      .mockResolvedValueOnce({ value: "aborted" })
    const sleep = vi.fn(() => new Promise<void>(() => undefined))

    const pending = queryWithRetry<{ failure: boolean } | { value: string }>({
      operation,
      failure: (value) =>
        "failure" in value ? { retryable: true } : undefined,
      sleep,
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledOnce())
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(operation).toHaveBeenCalledOnce()
  })
})
