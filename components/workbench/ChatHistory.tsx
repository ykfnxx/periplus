"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useMapStore } from "@/stores/mapStore"

export default function ChatHistory() {
  const chatMessages = useMapStore((state) => state.chatMessages)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)

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
        <div className="text-xs font-bold text-[var(--periplus-teak)]">
          正在规划...
        </div>
      )}
    </div>
  )
}
