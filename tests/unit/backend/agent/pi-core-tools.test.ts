import { describe, expect, it, vi } from "vitest"
import { createPiCoreTools } from "@/backend/agent/pi-core-tools"

describe("Pi core tool catalog", () => {
  it("maps canonical schemas to direct AgentTools without an MCP bridge", async () => {
    const execute = vi.fn().mockResolvedValue({ workspaceRevision: 3 })
    const tools = createPiCoreTools({ execute })
    const workspaceTool = tools.find(
      (tool) => tool.name === "periplus.workspace.get_context"
    )

    expect(workspaceTool).toBeDefined()
    const output = await workspaceTool!.execute("tool-call-1", {}, undefined)

    expect(execute).toHaveBeenCalledWith(
      { type: "workspace.get_context" },
      undefined
    )
    expect(output.details).toEqual({ workspaceRevision: 3 })
    expect(tools.some((tool) => tool.name.includes("mcp"))).toBe(false)
  })
})
