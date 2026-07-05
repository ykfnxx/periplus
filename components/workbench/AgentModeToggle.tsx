"use client"

import { useMapStore, type AgentMode } from "@/stores/mapStore"

const options: Array<{ value: AgentMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "suggest", label: "Suggest" },
]

export default function AgentModeToggle() {
  const agentMode = useMapStore((state) => state.agentMode)
  const setAgentMode = useMapStore((state) => state.setAgentMode)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)

  return (
    <div
      aria-label="Agent 模式"
      className="flex rounded-full border border-[rgb(44_36_22_/_12%)] bg-[var(--periplus-cream)] p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setAgentMode(option.value)}
          disabled={isDraftLocked}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            agentMode === option.value
              ? "bg-[var(--periplus-ink)] text-[var(--periplus-soft-white)]"
              : "text-[var(--periplus-teak)] hover:text-[var(--periplus-ink)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
