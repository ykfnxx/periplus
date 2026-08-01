"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { selectWorkspaceLocked } from "@/modules/workspace/state/selectors"

export default function ChatHistory() {
  const chatMessages = useWorkspaceStore((state) => state.chatMessages)
  const isWorkspaceLocked = useWorkspaceStore(selectWorkspaceLocked)
  const suggestions = useWorkspaceStore(
    (state) =>
      state.workspaceDocument?.suggestions.filter(
        (suggestion) => suggestion.status === "PENDING"
      ) ?? []
  )

  if (!chatMessages.length && !suggestions.length && !isWorkspaceLocked) {
    return null
  }

  return (
    <div className="space-y-4">
      {chatMessages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-soft-white">
              {message.content}
            </div>
          </div>
        ) : (
          <div
            key={message.id}
            className="periplus-markdown text-sm leading-6 text-ink"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )
      )}
      {isWorkspaceLocked && (
        <div className="text-xs font-bold text-teak">正在规划...</div>
      )}
      {suggestions.map((suggestion) => (
        <div
          key={suggestion.id}
          className="rounded-xl border border-ink-10 bg-white p-3 shadow-periplus-soft"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-ink">
                {suggestion.title}
              </h3>
              <p className="mt-1 text-xs leading-5 text-walnut">
                {suggestion.summary}
              </p>
              <p className="mt-1 text-[11px] font-bold text-teak">
                {suggestion.commandPayloads.length} 项变更 · 建议模式待确认
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
