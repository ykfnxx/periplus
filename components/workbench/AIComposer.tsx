"use client"

import { Save, Send, Square } from "lucide-react"
import { type FormEvent, type KeyboardEvent } from "react"
import { useMapStore } from "@/stores/mapStore"

export default function AIComposer() {
  const currentRoute = useMapStore((state) => state.currentRoute)
  const composerInput = useMapStore((state) => state.composerInput)
  const setComposerInput = useMapStore((state) => state.setComposerInput)
  const sendAgentEvent = useMapStore((state) => state.sendAgentEvent)
  const addUserMessage = useMapStore((state) => state.addUserMessage)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)
  const draftSaveState = useMapStore((state) => state.draftSaveState)
  const setDraftSaveState = useMapStore((state) => state.setDraftSaveState)

  const sendPrompt = () => {
    const prompt = composerInput.trim()
    if (!prompt || !sendAgentEvent || isDraftLocked) return

    addUserMessage(prompt)
    sendAgentEvent("agent.run.start", { prompt })
    setComposerInput("")
  }

  const submitPrompt = (event: FormEvent) => {
    event.preventDefault()
    sendPrompt()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      sendPrompt()
    }
  }

  const saveRoute = () => {
    if (!currentRoute || !sendAgentEvent || isDraftLocked) return
    setDraftSaveState("saving")
    sendAgentEvent("draft.save")
  }

  const cancelAgentRun = () => {
    sendAgentEvent?.("agent.run.cancel")
  }

  return (
    <div className="space-y-1.5">
      <form
        onSubmit={submitPrompt}
        className="flex items-end gap-2 rounded-[20px] border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-white)] px-3 py-2 shadow-[0_8px_18px_rgb(44_36_22_/_8%)]"
      >
        <textarea
          value={composerInput}
          onChange={(event) => setComposerInput(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="AI 输入"
          placeholder="告诉我你想怎么改路线..."
          disabled={isDraftLocked}
          className="max-h-24 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-[var(--periplus-ink)] outline-none placeholder:text-[var(--periplus-teak)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        {isDraftLocked ? (
          <button
            type="button"
            onClick={cancelAgentRun}
            aria-label="停止"
            title="停止"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--periplus-ink)] text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-russet)]"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={saveRoute}
            aria-label="保存"
            title="保存"
            disabled={
              !currentRoute || !sendAgentEvent || draftSaveState === "saving"
            }
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] text-[var(--periplus-walnut)] transition hover:border-[var(--periplus-russet)] hover:text-[var(--periplus-russet)] disabled:cursor-default disabled:opacity-45"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="submit"
          aria-label="发送"
          title="发送"
          disabled={!composerInput.trim() || !sendAgentEvent || isDraftLocked}
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--periplus-russet)] text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)] disabled:cursor-default disabled:bg-[var(--periplus-mustard)] disabled:text-[var(--periplus-ink)] disabled:opacity-55"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      <div className="flex items-center justify-between px-2 text-[11px] font-bold text-[var(--periplus-teak)]">
        <span>Enter 发送 · Shift+Enter 换行</span>
        {draftSaveState === "success" && <span>保存成功</span>}
        {draftSaveState === "error" && (
          <span className="text-[var(--periplus-coral)]">保存失败</span>
        )}
      </div>
    </div>
  )
}
