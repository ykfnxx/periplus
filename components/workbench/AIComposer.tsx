"use client"

import { Send } from "lucide-react"
import { type FormEvent } from "react"
import { useMapStore } from "@/stores/mapStore"

export default function AIComposer() {
  const composerInput = useMapStore((state) => state.composerInput)
  const setComposerInput = useMapStore((state) => state.setComposerInput)
  const sendAgentEvent = useMapStore((state) => state.sendAgentEvent)
  const clearAgentMessages = useMapStore((state) => state.clearAgentMessages)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)

  const submitPrompt = (event: FormEvent) => {
    event.preventDefault()
    const prompt = composerInput.trim()
    if (!prompt || !sendAgentEvent || isDraftLocked) return

    clearAgentMessages()
    sendAgentEvent("agent.run.start", { prompt })
    setComposerInput("")
  }

  return (
    <form
      onSubmit={submitPrompt}
      className="flex items-end gap-2 rounded-[10px] border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-white)] px-3 py-2 shadow-[0_8px_18px_rgb(44_36_22_/_8%)]"
    >
      <textarea
        value={composerInput}
        onChange={(event) => setComposerInput(event.target.value)}
        rows={1}
        aria-label="AI 输入"
        placeholder="告诉我你想怎么改路线..."
        className="max-h-24 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-[var(--periplus-ink)] outline-none placeholder:text-[var(--periplus-teak)]"
      />
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
  )
}
