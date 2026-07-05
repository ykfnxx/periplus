import { describe, expect, it } from "vitest"
import { RouteInputError } from "@/lib/routes/service"

describe("route service", () => {
  it("exposes route input errors", () => {
    expect(new RouteInputError("bad input").message).toBe("bad input")
  })
})
