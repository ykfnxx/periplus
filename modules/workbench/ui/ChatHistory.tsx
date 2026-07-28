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
      {pendingSuggestions.map((suggestion) => (
        <div
          key={suggestion.id}
          className="rounded-[12px] border border-[rgb(44_36_22_/_12%)] bg-[var(--periplus-white)] p-3 shadow-[0_8px_18px_rgb(44_36_22_/_6%)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--periplus-ink)]">
                {suggestion.title}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--periplus-walnut)]">
                {suggestion.summary}
              </p>
              <p className="mt-1 text-[11px] font-bold text-[var(--periplus-teak)]">
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
              className="rounded-full border border-[rgb(44_36_22_/_14%)] px-3 py-1.5 text-xs font-bold text-[var(--periplus-teak)] transition hover:border-[var(--periplus-walnut)] hover:text-[var(--periplus-ink)] disabled:cursor-not-allowed disabled:opacity-55"
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
              className="rounded-full bg-[var(--periplus-russet)] px-3 py-1.5 text-xs font-bold text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              接受
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
