import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import WorkbenchShell from "@/components/workbench/WorkbenchShell"
import { useMapStore } from "@/stores/mapStore"

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

vi.mock("@/components/workbench/AgentSync", () => ({
  default: () => null,
}))

describe("WorkbenchShell", () => {
  it("shows preset prompts and keeps the composer as the only input surface", () => {
    const setComposerInput = vi.fn()
    const addUserMessage = vi.fn()
    const sendAgentEvent = vi.fn()
    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({
          chatMessages: [],
          composerInput: "保留这段输入",
          setComposerInput,
          addUserMessage,
          sendAgentEvent,
          isDraftLocked: false,
          currentRoute: null,
          draftSaveState: "idle",
          setDraftSaveState: vi.fn(),
        })
    )

    render(<WorkbenchShell />)
    expect(screen.getByText("规划一条丝绸之路路线")).toBeInTheDocument()
    expect(screen.getByLabelText("AI 输入")).toHaveValue("保留这段输入")

    fireEvent.click(screen.getByText("北京周边徒步推荐"))
    expect(addUserMessage).toHaveBeenCalledWith("北京周边徒步推荐")
    expect(sendAgentEvent).toHaveBeenCalledWith("agent.run.start", {
      prompt: "北京周边徒步推荐",
    })
  })
})
