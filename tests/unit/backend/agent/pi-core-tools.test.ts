import { describe, expect, it, vi } from "vitest"
import {
  canonicalPiCoreToolName,
  createPiCoreTools,
} from "@/backend/agent/pi-core-tools"

describe("Pi core tool catalog", () => {
  it("maps canonical schemas to direct AgentTools without an MCP bridge", async () => {
    const execute = vi.fn().mockResolvedValue({ workspaceRevision: 3 })
    const tools = createPiCoreTools({ execute })
    const workspaceTool = tools.find(
      (tool) => tool.name === "periplus__workspace__get_context"
    )

    expect(workspaceTool).toBeDefined()
    const output = await workspaceTool!.execute("tool-call-1", {}, undefined)

    expect(execute).toHaveBeenCalledWith(
      { type: "workspace.get_context" },
      undefined
    )
    expect(output.details).toEqual({ workspaceRevision: 3 })
    expect(tools.some((tool) => tool.name.includes("mcp"))).toBe(false)
    expect(tools.every((tool) => /^[A-Za-z0-9_-]+$/.test(tool.name))).toBe(true)
    expect(canonicalPiCoreToolName(workspaceTool!.name)).toBe(
      "periplus.workspace.get_context"
    )
  })

  it("projects validator allowed tools into the provider-safe model result", async () => {
    const execute = vi.fn().mockResolvedValue({
      draftId: "draft-1",
      validation: {
        valid: false,
        issues: [
          {
            issueId: "issue-1",
            allowedTools: [
              "periplus.draft.update_schedule",
              "periplus.draft.prepare_transit",
            ],
          },
        ],
      },
    })
    const tools = createPiCoreTools({ execute })
    const validateTool = tools.find(
      (tool) => tool.name === "periplus__draft__validate"
    )

    const output = await validateTool!.execute(
      "tool-call-1",
      { draftId: "draft-1", attemptId: "attempt-1" },
      undefined
    )

    expect(output.details).toMatchObject({
      validation: {
        issues: [
          {
            allowedTools: [
              "periplus.draft.update_schedule",
              "periplus.draft.prepare_transit",
            ],
          },
        ],
      },
    })
    const modelText = output.content
      .filter((content) => content.type === "text")
      .map((content) => content.text)
      .join("\n")
    expect(modelText).toContain("periplus__draft__update_schedule")
    expect(modelText).toContain("periplus__draft__prepare_transit")
    expect(modelText).not.toContain("periplus.draft.update_schedule")
  })
})
