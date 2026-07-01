"use client"

import { useMapStore } from "@/stores/mapStore"

const presetPrompts = [
  "规划一条丝绸之路路线",
  "北京周边徒步推荐",
  "7天新疆自驾游",
  "帮我找有历史感的古镇",
]

export default function PresetPromptBubbles() {
  const chatMessages = useMapStore((state) => state.chatMessages)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)
  const sendAgentEvent = useMapStore((state) => state.sendAgentEvent)
  const addUserMessage = useMapStore((state) => state.addUserMessage)

  if (chatMessages.length > 0) return null

  const sendPrompt = (prompt: string) => {
    if (!sendAgentEvent || isDraftLocked) return
    addUserMessage(prompt)
    sendAgentEvent("agent.run.start", { prompt })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {presetPrompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => sendPrompt(prompt)}
          disabled={!sendAgentEvent || isDraftLocked}
          className="rounded-full bg-[var(--periplus-russet)] px-3 py-2 text-xs font-black text-[var(--periplus-soft-white)] shadow-[0_6px_14px_rgb(217_118_66_/_22%)] transition hover:bg-[var(--periplus-ink)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}
