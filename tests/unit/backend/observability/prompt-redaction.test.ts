import { describe, expect, it } from "vitest"
import {
  redactTelemetryText,
  redactTelemetryValue,
  redactedJson,
} from "@/backend/observability/prompt-redaction"

describe("observability prompt redaction", () => {
  it("redacts exact coordinate keys and URL credentials", () => {
    const input = {
      lat: 30.25,
      lng: 120.15,
      plannedLat: 30.26,
      plannedLng: 120.16,
      url: "https://provider.example/search?api_key=secret-key&query=西湖",
      nested: { coordinates: [30.25, 120.15] },
    }

    expect(redactTelemetryValue(input)).toEqual({
      lat: "[REDACTED]",
      lng: "[REDACTED]",
      plannedLat: "[REDACTED]",
      plannedLng: "[REDACTED]",
      url: "[REDACTED]",
      nested: { coordinates: "[REDACTED]" },
    })
    expect(redactedJson(input)).not.toContain("30.25")
    expect(redactedJson(input)).not.toContain("secret-key")
  })

  it("does not treat a regex offset as a replacement prefix", () => {
    const redacted = redactTelemetryText(
      "Authorization: Bearer abcdefghijklmnop and https://x.test/?token=secret"
    )

    expect(redacted).toBe(
      "Authorization: [REDACTED] and https://x.test/?token=[REDACTED]"
    )
    expect(redacted).not.toMatch(/\d+\"\[REDACTED\]/)
  })
})
