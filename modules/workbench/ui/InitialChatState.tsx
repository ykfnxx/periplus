"use client"

import { Send } from "lucide-react"
import { type FormEvent, type KeyboardEvent } from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  selectWorkspaceGraph,
  selectWorkspaceCanMutate,
  selectWorkspaceLocked,
} from "@/modules/workspace/state/selectors"
import AIComposer from "./AIComposer"
import AgentModeToggle from "./AgentModeToggle"
import PresetPromptBubbles from "./PresetPromptBubbles"

export default function InitialChatState() {
  const graph = useWorkspaceStore(selectWorkspaceGraph)
  const composerInput = useWorkspaceStore((state) => state.composerInput)
  const setComposerInput = useWorkspaceStore((state) => state.setComposerInput)
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const addUserMessage = useWorkspaceStore((state) => state.addUserMessage)
  const isWorkspaceLocked = useWorkspaceStore(selectWorkspaceLocked)
  const canMutate = useWorkspaceStore(selectWorkspaceCanMutate)
  const agentMode = useWorkspaceStore((state) => state.agentMode)
  const setWorkbenchTab = useWorkspaceStore((state) => state.setWorkbenchTab)

  const sendPrompt = () => {
    const prompt = composerInput.trim()
    if (!prompt || !sendAgentEvent || isWorkspaceLocked || !canMutate) return

    addUserMessage(prompt)
    setWorkbenchTab("chat")
    sendAgentEvent("agent.run.start", { prompt, mode: agentMode })
    setComposerInput("")
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    sendPrompt()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      sendPrompt()
    }
  }

  if (graph) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="periplus-chat-scroll min-h-0 flex-1 overflow-y-auto px-5 pt-6">
          <p className="text-[13px] leading-6 text-walnut">
            我已按当前范围整理好行程。选择城市或地点后，地图会同步显示对应路线。
          </p>
          <p className="mt-7 text-[13px] leading-6 text-walnut">
            你可以继续调整停留时间、交通方式或每天的行程强度。
          </p>
          <p className="mt-8 mb-2.5 text-[11px] font-black text-teak">
            你还可以继续问
          </p>
          <PresetPromptBubbles
            prompts={["优化跨城交通时间", "检查每天是否太赶", "加入历史类景点"]}
            stacked
          />
        </div>
        <div className="shrink-0 px-5 pt-3 pb-4">
          <AIComposer />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-5">
      <div className="mb-5 text-center">
        <h1 className="text-xl font-semibold text-ink">开始你的旅程</h1>
        <p className="mt-2 text-sm text-teak">告诉我你想去哪里，我来帮你规划</p>
      </div>
      <div className="w-full max-w-[480px]">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-ink-5 bg-white px-5 py-4 shadow-[0_4px_24px_var(--color-ink-10)]"
        >
          <textarea
            value={composerInput}
            onChange={(event) => setComposerInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="AI 初始输入"
            placeholder="告诉我你想怎么改路线..."
            disabled={isWorkspaceLocked || !canMutate}
            className="periplus-textarea-hidden-scroll max-h-24 min-h-9 w-full resize-none bg-transparent text-sm leading-5 text-ink outline-none placeholder:text-teak disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <AgentModeToggle />
            <button
              type="submit"
              aria-label="发送"
              title="发送"
              disabled={
                !composerInput.trim() ||
                !sendAgentEvent ||
                isWorkspaceLocked ||
                !canMutate
              }
              className="flex h-9 w-9 items-center justify-center rounded-full bg-russet text-soft-white transition hover:bg-ink disabled:cursor-default disabled:bg-mustard disabled:text-ink disabled:opacity-55"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>
        <div className="mt-3">
          <PresetPromptBubbles />
        </div>
      </div>
    </div>
  )
}
