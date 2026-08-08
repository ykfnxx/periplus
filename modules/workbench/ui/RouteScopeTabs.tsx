"use client"

import { useCallback, useEffect, useRef } from "react"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import type { JourneyDayGroup } from "@/lib/journeys/day-groups"
import { selectWorkspaceGraph } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { usePlanChoiceWheelScroll } from "./scroll-plan-choices"
import { routeDayTone } from "./route-day-theme"

export default function RouteScopeTabs({
  dayGroups = [],
  activeDayKey = null,
  onSelectDay,
}: {
  dayGroups?: JourneyDayGroup[]
  activeDayKey?: string | null
  onSelectDay?: (dayKey: string) => void
}) {
  const wheelScrollRef = usePlanChoiceWheelScroll()
  const railRef = useRef<HTMLDivElement>(null)
  const dayTabRefs = useRef(new Map<string, HTMLButtonElement>())
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

  const setRailRef = useCallback(
    (element: HTMLDivElement | null) => {
      railRef.current = element
      wheelScrollRef(element)
    },
    [wheelScrollRef]
  )

  useEffect(() => {
    if (!activeDayKey) return
    const rail = railRef.current
    const tab = dayTabRefs.current.get(activeDayKey)
    if (!rail || !tab) return

    const railRect = rail.getBoundingClientRect()
    const tabRect = tab.getBoundingClientRect()
    const leftOverflow = tabRect.left - railRect.left
    const rightOverflow = tabRect.right - railRect.right
    if (leftOverflow < 0) {
      rail.scrollTo({
        left: rail.scrollLeft + leftOverflow - 8,
        behavior: "smooth",
      })
    } else if (rightOverflow > 0) {
      rail.scrollTo({
        left: rail.scrollLeft + rightOverflow + 8,
        behavior: "smooth",
      })
    }
  }, [activeDayKey])

  if (!graph) return null
  const rootSections = getJourneyScopeProjection(
    graph,
    "overview",
    null
  ).events.filter((event) => event.type === "SECTION")
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
      ref={setRailRef}
      data-route-scope-tabs
      data-active-day-key={activeDayKey ?? undefined}
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
              maxZoom: 12,
            })
          }}
          className="h-[30px] shrink-0 rounded-full bg-cream px-3 text-[11px] font-black text-teak transition hover:bg-ink hover:text-soft-white"
        >
          ← 上一级
        </button>
      ) : null}
      <div
        role="tablist"
        aria-label={viewLevel === "section" ? "行程日期" : "行程范围"}
        className="contents"
      >
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
            {dayGroups.map((group) => (
              <DateTab
                key={group.key}
                buttonRef={(element) => {
                  if (element) dayTabRefs.current.set(group.key, element)
                  else dayTabRefs.current.delete(group.key)
                }}
                group={group}
                selected={activeDayKey === group.key}
                onSelect={() => onSelectDay?.(group.key)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function DateTab({
  buttonRef,
  group,
  selected,
  onSelect,
}: {
  buttonRef: (element: HTMLButtonElement | null) => void
  group: JourneyDayGroup
  selected: boolean
  onSelect: () => void
}) {
  const tone = routeDayTone(group.colorIndex)
  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-label={`跳转到${group.label}`}
      data-route-day-tab={group.key}
      data-day-tone={tone.id}
      onClick={onSelect}
      className={`h-[30px] shrink-0 rounded-full px-4 text-[11px] font-black transition ${
        selected ? tone.tabSelected : tone.tabIdle
      }`}
    >
      {group.label}
    </button>
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
