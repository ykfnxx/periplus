"use client"

import { Square } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useMapStore } from "@/stores/mapStore"

export default function ChatHistory() {
  const chatMessages = useMapStore((state) => state.chatMessages)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)
  const sendAgentEvent = useMapStore((state) => state.sendAgentEvent)

  const cancelAgentRun = () => {
    sendAgentEvent?.("agent.run.cancel")
  }

  if (!chatMessages.length && !isDraftLocked) return null

  return (
    <div className="space-y-4">
      {chatMessages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-[18px] rounded-br-[4px] bg-[var(--periplus-ink)] px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-[var(--periplus-soft-white)]">
              {message.content}
            </div>
          </div>
        ) : (
          <div
            key={message.id}
            className="periplus-markdown text-sm leading-6 text-[var(--periplus-ink)]"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )
      )}
      {isDraftLocked && (
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--periplus-teak)]">
          <span>正在规划...</span>
          <button
            type="button"
            onClick={cancelAgentRun}
            aria-label="停止"
            title="停止"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] text-[var(--periplus-walnut)] transition hover:border-[var(--periplus-russet)] hover:text-[var(--periplus-russet)]"
          >
            <Square aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
