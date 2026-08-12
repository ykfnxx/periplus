import { describe, expect, it, vi } from "vitest"
import {
  canonicalPiCoreToolName,
  createPiCoreTools,
} from "@/backend/agent/pi-core-tools"

describe("Pi core tool catalog", () => {
  it("maps the minimal canonical schemas to direct AgentTools without an MCP bridge", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "ok",
      data: { draftState: "BUILDING" },
    })
    const tools = createPiCoreTools({ execute })
    const draftTool = tools.find(
      (tool) => tool.name === "periplus__draft__open"
    )

    expect(draftTool).toBeDefined()
    const output = await draftTool!.execute("tool-call-1", {}, undefined)

    expect(execute).toHaveBeenCalledWith(
      { type: "draft.open" },
      "tool-call-1",
      undefined
    )
    expect(output.details).toEqual({
      status: "ok",
      data: { draftState: "BUILDING" },
    })
    expect(tools.some((tool) => tool.name.includes("mcp"))).toBe(false)
    expect(tools.every((tool) => /^[A-Za-z0-9_-]+$/.test(tool.name))).toBe(true)
    expect(canonicalPiCoreToolName(draftTool!.name)).toBe("periplus.draft.open")
    expect(tools.map((tool) => tool.name)).not.toContain(
      "periplus__journey__validate_current"
    )
  })

  it("projects validator allowed tools into the provider-safe model result", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "ok",
      data: {
        validation: {
          valid: false,
          issues: [
            {
              issueId: "issue-1",
              allowedTools: [
                "periplus.card.update",
                "periplus.draft.prepare_transit",
              ],
            },
          ],
        },
      },
    })
    const tools = createPiCoreTools({ execute })
    const validateTool = tools.find(
      (tool) => tool.name === "periplus__draft__validate"
    )

    const output = await validateTool!.execute("tool-call-1", {}, undefined)

    expect(output.details).toMatchObject({
      data: {
        validation: {
          issues: [
            {
              allowedTools: [
                "periplus.card.update",
                "periplus.draft.prepare_transit",
              ],
            },
          ],
        },
      },
    })
    const modelText = output.content
      .filter((content) => content.type === "text")
      .map((content) => content.text)
      .join("\n")
    expect(modelText).toContain("periplus__card__update")
    expect(modelText).toContain("periplus__draft__prepare_transit")
    expect(modelText).not.toContain("periplus.card.update")
  })

  it("returns invalid model arguments as a retryable ToolResult", async () => {
    const execute = vi.fn()
    const cityTool = createPiCoreTools({ execute }).find(
      (tool) => tool.name === "periplus__city__add"
    )!

    const output = await cityTool.execute(
      "tool-call-invalid",
      { name: "" },
      undefined
    )

    expect(execute).not.toHaveBeenCalled()
    expect(output.details).toMatchObject({
      status: "retryable_error",
      code: "INVALID_ARGUMENTS",
    })
  })
})
