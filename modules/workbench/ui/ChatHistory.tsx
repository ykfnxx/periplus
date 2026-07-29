"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function ChatHistory() {
  const chatMessages = useWorkspaceStore((state) => state.chatMessages)
  const isDraftLocked = useWorkspaceStore((state) => state.isDraftLocked)
  const pendingSuggestions = useWorkspaceStore(
    (state) => state.pendingSuggestions
  )
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)

  if (!chatMessages.length && !pendingSuggestions.length && !isDraftLocked) {
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
      {isDraftLocked && (
        <div className="text-xs font-bold text-teak">正在规划...</div>
      )}
      {pendingSuggestions.map((suggestion) => (
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
                {suggestion.toolCallCount} 项变更
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={!sendAgentEvent || isDraftLocked}
              onClick={() =>
                sendAgentEvent?.("agent.diff.reject", {
                  suggestionId: suggestion.id,
                })
              }
              className="rounded-full border border-ink-15 px-3 py-1.5 text-xs font-bold text-teak transition hover:border-walnut hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
            >
              拒绝
            </button>
            <button
              type="button"
              disabled={!sendAgentEvent || isDraftLocked}
              onClick={() =>
                sendAgentEvent?.("agent.diff.accept", {
                  suggestionId: suggestion.id,
                })
              }
              className="rounded-full bg-russet px-3 py-1.5 text-xs font-bold text-soft-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-55"
            >
              接受
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
