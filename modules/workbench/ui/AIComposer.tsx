"use client"

import { Save, Send, Square } from "lucide-react"
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
} from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { selectWorkspaceLocked } from "@/modules/workspace/state/selectors"
import AgentModeToggle from "./AgentModeToggle"

export default function AIComposer() {
  const document = useWorkspaceStore((state) => state.workspaceDocument)
  const composerInput = useWorkspaceStore((state) => state.composerInput)
  const agentMode = useWorkspaceStore((state) => state.agentMode)
  const setWorkbenchTab = useWorkspaceStore((state) => state.setWorkbenchTab)
  const setComposerInput = useWorkspaceStore((state) => state.setComposerInput)
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const addUserMessage = useWorkspaceStore((state) => state.addUserMessage)
  const isWorkspaceLocked = useWorkspaceStore(selectWorkspaceLocked)
  const workspaceCommitState = useWorkspaceStore(
    (state) => state.workspaceCommitState
  )
  const setWorkspaceCommitState = useWorkspaceStore(
    (state) => state.setWorkspaceCommitState
  )
  const lightboxPhotoShare = useWorkspaceStore(
    (state) => state.lightboxPhotoShare
  )
  const escTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isWorkspaceLocked || lightboxPhotoShare) {
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
  }, [isWorkspaceLocked, lightboxPhotoShare, sendAgentEvent])

  const sendPrompt = () => {
    const prompt = composerInput.trim()
    if (!prompt || !sendAgentEvent || isWorkspaceLocked) return

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
    if (
      !document ||
      document.draftState === "CLEAN" ||
      !sendAgentEvent ||
      isWorkspaceLocked
    ) {
      return
    }
    const revision = document.session.headWorkspaceRevision
    const commandId = `browser-commit:${document.session.id}:${revision}`
    setWorkspaceCommitState("saving")
    sendAgentEvent("workspace.command", {
      commandId,
      expectedRevision: revision,
      idempotencyKey: commandId,
      command: {
        name: "workspace.commit",
        payload: {
          expectedJourneyRevision: document.session.baseJourneyRevision,
        },
      },
    })
  }

  const cancelAgentRun = () => {
    sendAgentEvent?.("agent.run.cancel")
  }

  return (
    <div className="space-y-1.5">
      <form
        onSubmit={submitPrompt}
        className="rounded-2xl border border-ink-15 bg-white px-4 py-3 shadow-periplus-soft"
      >
        <div className="flex items-end">
          <textarea
            value={composerInput}
            onChange={(event) => setComposerInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="AI 输入"
            placeholder="告诉我你想怎么改路线..."
            disabled={isWorkspaceLocked}
            className="periplus-textarea-hidden-scroll max-h-24 min-h-9 w-full resize-none bg-transparent py-1 text-[13px] leading-5 text-ink outline-none placeholder:text-teak disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <AgentModeToggle />
          <div className="flex items-center gap-2">
            {!isWorkspaceLocked && (
              <button
                type="button"
                onClick={saveRoute}
                aria-label="保存"
                title="保存"
                disabled={
                  !document ||
                  document.draftState === "CLEAN" ||
                  !sendAgentEvent ||
                  workspaceCommitState === "saving"
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-15 bg-cream text-walnut transition hover:border-russet hover:text-russet disabled:cursor-default disabled:opacity-45"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type={isWorkspaceLocked ? "button" : "submit"}
              onClick={isWorkspaceLocked ? cancelAgentRun : undefined}
              aria-label={isWorkspaceLocked ? "停止" : "发送"}
              title={isWorkspaceLocked ? "停止" : "发送"}
              disabled={
                !isWorkspaceLocked && (!composerInput.trim() || !sendAgentEvent)
              }
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-soft-white transition disabled:cursor-default disabled:opacity-55 ${
                isWorkspaceLocked
                  ? "bg-ink hover:bg-russet"
                  : "bg-russet hover:bg-ink disabled:bg-mustard disabled:text-ink"
              }`}
            >
              {isWorkspaceLocked ? (
                <Square className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </form>
      <div className="flex items-center justify-end px-2 text-[11px] font-bold text-teak">
        {workspaceCommitState === "success" && <span>保存成功</span>}
        {workspaceCommitState === "error" && (
          <span className="text-coral">保存失败</span>
        )}
      </div>
    </div>
  )
}
