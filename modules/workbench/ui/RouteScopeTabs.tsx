"use client"

import { useRef } from "react"
import { projectMainSequence } from "@/lib/journeys/graph"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function RouteScopeTabs() {
  const railRef = useRef<HTMLDivElement>(null)
  const draftJourney = useWorkspaceStore((state) => state.draftJourney)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
  const enterSectionView = useWorkspaceStore((state) => state.enterSectionView)
  const returnToOverview = useWorkspaceStore((state) => state.returnToOverview)
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  if (!draftJourney) return null
  const sections = projectMainSequence(draftJourney).filter(
    (event) => event.type === "SECTION"
  )

  const selectOverview = () => {
    if (viewLevel === "overview") return
    returnToOverview()
    requestMapFocus({ type: "active-journey", maxZoom: 12 })
  }

  const selectSection = (eventId: string) => {
    if (viewLevel === "section" && activeSectionEventId === eventId) return
    enterSectionView(eventId)
    requestMapFocus({ type: "active-journey", maxZoom: 15 })
  }

  return (
    <div
      ref={railRef}
      role="tablist"
      aria-label="行程范围"
      className="scrollbar-hidden flex gap-2 overflow-x-auto pt-4 pb-0.5"
    >
      <ScopeTab
        label="总览"
        selected={viewLevel === "overview"}
        onSelect={selectOverview}
      />
      {sections.map((section) => (
        <ScopeTab
          key={section.id}
          label={section.title}
          selected={
            viewLevel === "section" && activeSectionEventId === section.id
          }
          onSelect={() => selectSection(section.id)}
        />
      ))}
    </div>
  )
}

function ScopeTab({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`h-[30px] shrink-0 rounded-full px-4 text-[11px] font-black transition ${
        selected
          ? "bg-russet text-ink"
          : "bg-cream text-teak hover:bg-ink hover:text-soft-white"
      }`}
    >
      {label}
    </button>
  )
}
