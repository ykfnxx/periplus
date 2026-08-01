"use client"

import { useRef } from "react"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import { selectWorkspaceGraph } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { TargetJourneyEvent } from "@/modules/data-model/contracts"

type SectionEvent = Extract<TargetJourneyEvent, { type: "SECTION" }>

export default function RouteScopeTabs() {
  const railRef = useRef<HTMLDivElement>(null)
  const graph = useWorkspaceStore(selectWorkspaceGraph)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
  const enterSectionView = useWorkspaceStore((state) => state.enterSectionView)
  const returnToParentScope = useWorkspaceStore(
    (state) => state.returnToParentScope
  )
  const returnToOverview = useWorkspaceStore((state) => state.returnToOverview)
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  if (!graph) return null
  const rootSections = getJourneyScopeProjection(
    graph,
    "overview",
    null
  ).events.filter((event) => event.type === "SECTION")
  const activeSection = activeSectionEventId
    ? graph.events.find(
        (event): event is SectionEvent =>
          event.id === activeSectionEventId && event.type === "SECTION"
      )
    : null
  const nestedPath: SectionEvent[] = []
  let cursor = activeSection
  while (cursor) {
    nestedPath.unshift(cursor)
    if (!cursor.parentSectionEventId) break
    const parentId = cursor.parentSectionEventId
    cursor = graph.events.find(
      (event): event is SectionEvent =>
        event.id === parentId && event.type === "SECTION"
    )
  }
  const directChildSections = activeSection
    ? getJourneyScopeProjection(
        graph,
        "section",
        activeSection.id
      ).events.filter(
        (event): event is SectionEvent => event.type === "SECTION"
      )
    : []

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
      className="scrollbar-hidden flex gap-2 overflow-x-auto pt-4 pb-0.5"
    >
      {viewLevel === "section" ? (
        <button
          type="button"
          aria-label="返回上一级"
          onClick={() => {
            returnToParentScope()
            requestMapFocus({
              type: "active-journey",
              maxZoom: activeSection?.parentSectionEventId ? 15 : 12,
            })
          }}
          className="h-[30px] shrink-0 rounded-full bg-cream px-3 text-[11px] font-black text-teak transition hover:bg-ink hover:text-soft-white"
        >
          ← 上一级
        </button>
      ) : null}
      <div role="tablist" aria-label="行程范围" className="contents">
        {viewLevel === "overview" ? (
          <>
            <ScopeTab label="总览" selected onSelect={selectOverview} />
            {rootSections.map((section) => (
              <ScopeTab
                key={section.id}
                label={section.title}
                selected={false}
                onSelect={() => selectSection(section.id)}
              />
            ))}
          </>
        ) : (
          <>
            {nestedPath.map((section) => (
              <ScopeTab
                key={section.id}
                label={section.title}
                selected={activeSectionEventId === section.id}
                onSelect={() => selectSection(section.id)}
              />
            ))}
            {directChildSections.map((section) => (
              <ScopeTab
                key={section.id}
                label={section.title}
                selected={false}
                onSelect={() => selectSection(section.id)}
              />
            ))}
          </>
        )}
      </div>
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
