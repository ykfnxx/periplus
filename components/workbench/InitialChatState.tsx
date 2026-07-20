"use client"

import { Send } from "lucide-react"
import { type FormEvent, type KeyboardEvent } from "react"
import { useMapStore } from "@/stores/mapStore"
import AgentModeToggle from "./AgentModeToggle"
import PresetPromptBubbles from "./PresetPromptBubbles"

export default function InitialChatState() {
  const composerInput = useMapStore((state) => state.composerInput)
  const setComposerInput = useMapStore((state) => state.setComposerInput)
  const sendAgentEvent = useMapStore((state) => state.sendAgentEvent)
  const addUserMessage = useMapStore((state) => state.addUserMessage)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)
  const agentMode = useMapStore((state) => state.agentMode)
  const setWorkbenchTab = useMapStore((state) => state.setWorkbenchTab)

  const sendPrompt = () => {
    const prompt = composerInput.trim()
    if (!prompt || !sendAgentEvent || isDraftLocked) return

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

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-ink">
          开始你的旅程
        </h1>
        <p className="mt-2 text-sm text-teak">
          告诉我你想去哪里，我来帮你规划
        </p>
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
            disabled={isDraftLocked}
            className="periplus-textarea-hidden-scroll max-h-24 min-h-9 w-full resize-none bg-transparent text-sm leading-5 text-ink outline-none placeholder:text-teak disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <AgentModeToggle />
            <button
              type="submit"
              aria-label="发送"
              title="发送"
              disabled={
                !composerInput.trim() || !sendAgentEvent || isDraftLocked
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
