"use client"

import { type WheelEvent, useLayoutEffect, useRef } from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

const presetPrompts = [
  "规划一条丝绸之路路线",
  "推荐北京周边徒步",
  "设计7天云南行程",
  "帮我优化当前路线",
]

export default function PresetPromptBubbles({
  prompts = presetPrompts,
  stacked = false,
}: {
  prompts?: string[]
  stacked?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const chatMessages = useWorkspaceStore((state) => state.chatMessages)
  const isDraftLocked = useWorkspaceStore((state) => state.isDraftLocked)
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const addUserMessage = useWorkspaceStore((state) => state.addUserMessage)
  const setComposerInput = useWorkspaceStore((state) => state.setComposerInput)
  const agentMode = useWorkspaceStore((state) => state.agentMode)
  const setWorkbenchTab = useWorkspaceStore((state) => state.setWorkbenchTab)

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2
  }, [])

  if (chatMessages.length > 0) return null

  const sendPrompt = (prompt: string) => {
    if (!sendAgentEvent || isDraftLocked) return
    addUserMessage(prompt)
    setWorkbenchTab("chat")
    sendAgentEvent("agent.run.start", { prompt, mode: agentMode })
    setComposerInput("")
  }

  const scrollHorizontally = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.scrollLeft +=
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY
  }

  return (
    <div
      ref={scrollRef}
      onWheel={scrollHorizontally}
      tabIndex={0}
      aria-label="推荐提示"
      className={
        stacked
          ? "flex flex-col items-start gap-2"
          : "periplus-prompt-scroll scrollbar-hidden flex gap-2 overflow-x-auto px-7 pb-1"
      }
    >
      {prompts.map((prompt, index) => (
        <button
          key={prompt}
          type="button"
          onClick={() => sendPrompt(prompt)}
          disabled={!sendAgentEvent || isDraftLocked}
          className={`shrink-0 rounded-full px-4 py-2 text-left text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-55 ${
            stacked && index === 0
              ? "bg-russet text-soft-white hover:bg-ink"
              : stacked
                ? "bg-cream text-teak hover:bg-ink hover:text-soft-white"
                : "bg-russet/10 text-russet hover:bg-russet/16"
          }`}
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}
