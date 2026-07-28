"use client"

import { Save, Send, Square } from "lucide-react"
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
} from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import AgentModeToggle from "./AgentModeToggle"

export default function AIComposer() {
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const composerInput = useWorkspaceStore((state) => state.composerInput)
  const agentMode = useWorkspaceStore((state) => state.agentMode)
  const setWorkbenchTab = useWorkspaceStore((state) => state.setWorkbenchTab)
  const setComposerInput = useWorkspaceStore((state) => state.setComposerInput)
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const addUserMessage = useWorkspaceStore((state) => state.addUserMessage)
  const isDraftLocked = useWorkspaceStore((state) => state.isDraftLocked)
  const draftSaveState = useWorkspaceStore((state) => state.draftSaveState)
  const setDraftSaveState = useWorkspaceStore(
    (state) => state.setDraftSaveState
  )
  const lightboxPhotoShare = useWorkspaceStore(
    (state) => state.lightboxPhotoShare
  )
  const escTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isDraftLocked || lightboxPhotoShare) {
        return
      }

      if (escTimerRef.current) {
        window.clearTimeout(escTimerRef.current)
        escTimerRef.current = null
        sendAgentEvent?.("agent.run.cancel")
        return
      }

      escTimerRef.current = window.setTimeout(() => {
        escTimerRef.current = null
      }, 500)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      if (escTimerRef.current) {
        window.clearTimeout(escTimerRef.current)
        escTimerRef.current = null
      }
    }
  }, [isDraftLocked, lightboxPhotoShare, sendAgentEvent])

  const sendPrompt = () => {
    const prompt = composerInput.trim()
    if (!prompt || !sendAgentEvent || isDraftLocked) return

    addUserMessage(prompt)
    setWorkbenchTab("chat")
    sendAgentEvent("agent.run.start", { prompt, mode: agentMode })
    setComposerInput("")
  }

  const submitPrompt = (event: FormEvent) => {
    event.preventDefault()
    sendPrompt()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      sendPrompt()
    }
  }

  const saveRoute = () => {
    if (!draftRoute || !sendAgentEvent || isDraftLocked) return
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
        className="rounded-2xl border border-ink-15 bg-white px-3 py-2 shadow-[0_8px_18px_var(--color-ink-10)]"
      >
        <div className="flex items-end">
          <textarea
            value={composerInput}
            onChange={(event) => setComposerInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="AI 输入"
            placeholder="告诉我你想怎么改路线..."
            disabled={isDraftLocked}
            className="periplus-textarea-hidden-scroll max-h-24 min-h-9 w-full resize-none bg-transparent py-2 text-sm leading-5 text-ink outline-none placeholder:text-teak disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <AgentModeToggle />
          <div className="flex items-center gap-2">
            {!isDraftLocked && (
              <button
                type="button"
                onClick={saveRoute}
                aria-label="保存"
                title="保存"
                disabled={
                  !draftRoute || !sendAgentEvent || draftSaveState === "saving"
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-15 bg-cream text-walnut transition hover:border-russet hover:text-russet disabled:cursor-default disabled:opacity-45"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type={isDraftLocked ? "button" : "submit"}
              onClick={isDraftLocked ? cancelAgentRun : undefined}
              aria-label={isDraftLocked ? "停止" : "发送"}
              title={isDraftLocked ? "停止" : "发送"}
              disabled={
                !isDraftLocked && (!composerInput.trim() || !sendAgentEvent)
              }
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-soft-white transition disabled:cursor-default disabled:opacity-55 ${
                isDraftLocked
                  ? "bg-ink hover:bg-russet"
                  : "bg-russet hover:bg-ink disabled:bg-mustard disabled:text-ink"
              }`}
            >
              {isDraftLocked ? (
                <Square className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </form>
      <div className="flex items-center justify-end px-2 text-[11px] font-bold text-teak">
        {draftSaveState === "success" && <span>保存成功</span>}
        {draftSaveState === "error" && (
          <span className="text-coral">保存失败</span>
        )}
      </div>
    </div>
  )
}
