"use client"

import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  selectWorkspaceCanMutate,
  selectWorkspaceLocked,
} from "@/modules/workspace/state/selectors"
import type { AgentMode } from "@/modules/workspace/state/types"

const options: Array<{ value: AgentMode; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "suggest", label: "建议" },
]

export default function AgentModeToggle() {
  const agentMode = useWorkspaceStore((state) => state.agentMode)
  const setAgentMode = useWorkspaceStore((state) => state.setAgentMode)
  const isWorkspaceLocked = useWorkspaceStore(selectWorkspaceLocked)
  const canMutate = useWorkspaceStore(selectWorkspaceCanMutate)

  return (
    <div aria-label="Agent 模式" className="flex rounded-full bg-cream p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setAgentMode(option.value)}
          disabled={isWorkspaceLocked || !canMutate}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            agentMode === option.value
              ? "bg-ink text-soft-white"
              : "text-teak hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
