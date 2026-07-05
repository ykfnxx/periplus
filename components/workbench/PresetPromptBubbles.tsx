"use client"

import { type WheelEvent, useLayoutEffect, useRef } from "react"
import { useMapStore } from "@/stores/mapStore"

const presetPrompts = [
  "规划一条丝绸之路路线",
  "推荐北京周边徒步",
  "设计7天云南行程",
  "帮我优化当前路线",
]

export default function PresetPromptBubbles() {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const chatMessages = useMapStore((state) => state.chatMessages)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)
  const sendAgentEvent = useMapStore((state) => state.sendAgentEvent)
  const addUserMessage = useMapStore((state) => state.addUserMessage)
  const setComposerInput = useMapStore((state) => state.setComposerInput)
  const agentMode = useMapStore((state) => state.agentMode)
  const setWorkbenchTab = useMapStore((state) => state.setWorkbenchTab)

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
      className="periplus-prompt-scroll scrollbar-hidden flex gap-2 overflow-x-auto px-7 pb-1"
    >
      {presetPrompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => sendPrompt(prompt)}
          disabled={!sendAgentEvent || isDraftLocked}
          className="shrink-0 rounded-full bg-[rgb(217_118_66_/_10%)] px-3.5 py-2 text-[13px] text-[var(--periplus-russet)] transition hover:bg-[rgb(217_118_66_/_16%)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}
