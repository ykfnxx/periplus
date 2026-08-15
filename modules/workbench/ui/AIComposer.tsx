"use client"

import { Send, Square } from "lucide-react"
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
} from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  selectWorkspaceCanMutate,
  selectWorkspaceLocked,
} from "@/modules/workspace/state/selectors"
import { agentRunStageLabel } from "./agent-run-presentation"

export default function AIComposer({
  onPromptSent,
}: {
  onPromptSent?: () => void
}) {
  const document = useWorkspaceStore((state) => state.workspaceDocument)
  const composerInput = useWorkspaceStore((state) => state.composerInput)
  const setWorkbenchTab = useWorkspaceStore((state) => state.setWorkbenchTab)
  const setComposerInput = useWorkspaceStore((state) => state.setComposerInput)
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const addUserMessage = useWorkspaceStore((state) => state.addUserMessage)
  const isWorkspaceLocked = useWorkspaceStore(selectWorkspaceLocked)
  const agentRunStage = useWorkspaceStore((state) => state.agentRunStage)
  const canMutate = useWorkspaceStore(selectWorkspaceCanMutate)
  const lightboxPhotoShare = useWorkspaceStore(
    (state) => state.lightboxPhotoShare
  )
  const canControlAgent = Boolean(
    document?.accessState === "OWNER" && document.session.status === "ACTIVE"
  )
  const escTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        !isWorkspaceLocked ||
        !canControlAgent ||
        lightboxPhotoShare
      ) {
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
  }, [canControlAgent, isWorkspaceLocked, lightboxPhotoShare, sendAgentEvent])

  const sendPrompt = () => {
    const prompt = composerInput.trim()
    if (!prompt || !sendAgentEvent || isWorkspaceLocked || !canMutate) return

    addUserMessage(prompt)
    setWorkbenchTab("chat")
    sendAgentEvent("agent.run.start", { prompt })
    setComposerInput("")
    onPromptSent?.()
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

  if (isWorkspaceLocked) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-2xl border border-mustard/45 bg-cream px-4 py-3 shadow-periplus-soft"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-mustard"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-black text-ink">
            {agentRunStageLabel(agentRunStage)}
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-teak">
            当前版本仍可浏览，完成后会一次性更新。
          </p>
        </div>
        <button
          type="button"
          onClick={() => sendAgentEvent?.("agent.run.cancel")}
          aria-label="取消规划"
          title="取消规划"
          disabled={!sendAgentEvent || !canControlAgent}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-soft-white transition hover:bg-russet disabled:cursor-default disabled:opacity-55"
        >
          <Square className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    )
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
            disabled={!canMutate}
            className="periplus-textarea-hidden-scroll max-h-24 min-h-9 w-full resize-none bg-transparent py-1 text-[13px] leading-5 text-ink outline-none placeholder:text-teak disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-end">
          <button
            type="submit"
            aria-label="发送"
            title="发送"
            disabled={!composerInput.trim() || !sendAgentEvent || !canMutate}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-russet text-soft-white transition hover:bg-ink disabled:cursor-default disabled:bg-mustard disabled:text-ink disabled:opacity-55"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
      {document &&
      (document.accessState !== "OWNER" ||
        document.session.status !== "ACTIVE") ? (
        <p className="mt-2 rounded-xl border border-ink-10 bg-cream px-3 py-2 text-[11px] font-black text-teak">
          Workspace 已归档或无写权限，当前为只读状态。
        </p>
      ) : null}
    </div>
  )
}
