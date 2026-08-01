"use client"

import { Save, Send, Square } from "lucide-react"
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
} from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  selectWorkspaceCanMutate,
  selectWorkspaceCanRecover,
  selectWorkspaceLocked,
} from "@/modules/workspace/state/selectors"
import type { TargetCommandEnvelope } from "@/modules/data-model/contracts"
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
  const canMutate = useWorkspaceStore(selectWorkspaceCanMutate)
  const canRecover = useWorkspaceStore(selectWorkspaceCanRecover)
  const workspaceCommitState = useWorkspaceStore(
    (state) => state.workspaceCommitState
  )
  const setWorkspaceCommitState = useWorkspaceStore(
    (state) => state.setWorkspaceCommitState
  )
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
      !canMutate ||
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

  const recoverWorkspace = (
    name: Extract<
      TargetCommandEnvelope["command"]["name"],
      "workspace.refresh" | "workspace.fork"
    >
  ) => {
    if (!document || !sendAgentEvent || !canRecover || isWorkspaceLocked) {
      return
    }
    const revision = document.session.headWorkspaceRevision
    const commandId = `browser-recover:${name}:${document.session.id}:${revision}`
    sendAgentEvent("workspace.command", {
      commandId,
      expectedRevision: revision,
      idempotencyKey: commandId,
      command: {
        name,
        payload: {
          fromWorkspaceRevision: name === "workspace.fork" ? revision : 0,
        },
      },
    })
  }

  const cancelAgentRun = () => {
    if (canControlAgent) sendAgentEvent?.("agent.run.cancel")
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
            disabled={isWorkspaceLocked || !canMutate}
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
                  !canMutate ||
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
                isWorkspaceLocked
                  ? !sendAgentEvent || !canControlAgent
                  : !composerInput.trim() || !sendAgentEvent || !canMutate
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
      {canRecover ? (
        <div className="mt-2 rounded-xl border border-mustard/40 bg-cream p-3">
          <p className="text-[11px] font-black text-ink">源行程已更新</p>
          <p className="mt-1 text-[10px] leading-4 text-teak">
            先选择如何恢复 Workspace，再继续编辑或保存。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <RecoveryButton
              label="刷新并重放"
              disabled={!sendAgentEvent || isWorkspaceLocked}
              onClick={() => recoverWorkspace("workspace.refresh")}
            />
            <RecoveryButton
              label="派生副本"
              disabled={!sendAgentEvent || isWorkspaceLocked}
              onClick={() => recoverWorkspace("workspace.fork")}
            />
          </div>
        </div>
      ) : document && document.accessState !== "OWNER" ? (
        <p className="mt-2 rounded-xl border border-ink-10 bg-cream px-3 py-2 text-[11px] font-black text-teak">
          Workspace 已过期或无写权限，当前为只读状态。
        </p>
      ) : null}
      <div className="flex items-center justify-end px-2 text-[11px] font-bold text-teak">
        {workspaceCommitState === "success" && <span>保存成功</span>}
        {workspaceCommitState === "error" && (
          <span className="text-coral">保存失败</span>
        )}
      </div>
    </div>
  )
}

function RecoveryButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-ink-15 bg-white px-3 py-1.5 text-[10px] font-black text-walnut transition hover:border-russet hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  )
}
