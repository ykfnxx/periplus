"use client"

import { useCallback, useEffect, useRef } from "react"
import type { JourneyDayGroup } from "@/lib/journeys/day-groups"
import { usePlanChoiceWheelScroll } from "./scroll-plan-choices"
import { routeDayTone } from "./route-day-theme"

export default function RouteDayNavigation({
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

  if (dayGroups.length === 0) return null

  return (
    <div
      ref={setRailRef}
      data-route-day-navigation
      data-active-day-key={activeDayKey ?? undefined}
      className="scrollbar-hidden flex gap-2 overflow-x-auto pt-4 pb-0.5"
    >
      <div role="tablist" aria-label="行程日期" className="contents">
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
