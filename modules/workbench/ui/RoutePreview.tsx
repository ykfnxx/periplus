"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import {
  deriveJourneyDayGroups,
  type JourneyDayProjection,
} from "@/lib/journeys/day-groups"
import {
  getJourneyScopeProjection,
  getJourneyScopeTreeEvents,
} from "@/lib/journeys/projections"
import { totalDurationDays } from "@/lib/journeys/summary"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  selectWorkspaceJourneyView,
  selectWorkspaceLocked,
} from "@/modules/workspace/state/selectors"
import RouteOverview from "./RouteOverview"
import RouteScopeTabs from "./RouteScopeTabs"
import RouteTimeline from "./RouteTimeline"

const EMPTY_DAY_PROJECTION: JourneyDayProjection = {
  groups: [],
  groupKeyByEventId: new Map(),
  hasValidTimeZone: true,
}

export default function RoutePreview({
  onCollapse,
}: {
  onCollapse?: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dayNavigationLockedRef = useRef(false)
  const dayNavigationTimeoutRef = useRef<number | null>(null)
  const [activeDayKey, setActiveDayKey] = useState<string | null>(null)
  const graph = useWorkspaceStore(selectWorkspaceJourneyView)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
  const isWorkspaceLocked = useWorkspaceStore(selectWorkspaceLocked)
  const commitPresentation = useWorkspaceStore(
    (state) => state.journeyCommitPresentation
  )
  const view = getJourneyScopeProjection(graph, viewLevel, activeSectionEventId)
  const dayProjection = useMemo(() => {
    if (view.level !== "section" || view.section?.detail.kind !== "CITY") {
      return EMPTY_DAY_PROJECTION
    }
    return deriveJourneyDayGroups(view.events, view.section.detail.timeZone)
  }, [view.events, view.level, view.section])
  const visibleActiveDayKey = dayProjection.groups.some(
    (group) => group.key === activeDayKey
  )
    ? activeDayKey
    : (dayProjection.groups[0]?.key ?? null)

  useEffect(() => {
    const scrollContainer = rootRef.current?.closest(".periplus-chat-scroll")
    if (scrollContainer) scrollContainer.scrollTop = 0
  }, [activeSectionEventId, viewLevel])

  useEffect(
    () => () => {
      if (dayNavigationTimeoutRef.current !== null) {
        window.clearTimeout(dayNavigationTimeoutRef.current)
      }
    },
    []
  )

  const handleActiveDayChange = useCallback((dayKey: string) => {
    if (dayNavigationLockedRef.current) return
    setActiveDayKey((current) => (current === dayKey ? current : dayKey))
  }, [])

  const handleSelectDay = useCallback(
    (dayKey: string) => {
      const root = rootRef.current
      const viewport = root?.closest<HTMLElement>(
        "[data-overlay-scroll-viewport]"
      )
      const group = dayProjection.groups.find(
        (candidate) => candidate.key === dayKey
      )
      const target = Array.from(
        root?.querySelectorAll<HTMLElement>("[data-route-event-id]") ?? []
      ).find((element) => element.dataset.routeEventId === group?.firstEventId)
      const header = root?.querySelector<HTMLElement>(
        "[data-route-preview-header]"
      )
      if (!viewport || !target || !header) return

      setActiveDayKey(dayKey)
      dayNavigationLockedRef.current = true
      if (dayNavigationTimeoutRef.current !== null) {
        window.clearTimeout(dayNavigationTimeoutRef.current)
      }

      const releaseNavigationLock = () => {
        dayNavigationLockedRef.current = false
        if (dayNavigationTimeoutRef.current !== null) {
          window.clearTimeout(dayNavigationTimeoutRef.current)
          dayNavigationTimeoutRef.current = null
        }
      }
      viewport.addEventListener("scrollend", releaseNavigationLock, {
        once: true,
      })
      dayNavigationTimeoutRef.current = window.setTimeout(
        releaseNavigationLock,
        900
      )

      const viewportRect = viewport.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const targetScrollTop =
        viewport.scrollTop +
        targetRect.top -
        viewportRect.top -
        header.getBoundingClientRect().height -
        8
      viewport.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: "smooth",
      })
    },
    [dayProjection.groups]
  )

  if (!graph) {
    return <div ref={rootRef} data-route-preview className="min-h-full" />
  }

  const durationDays = totalDurationDays(
    getJourneyScopeTreeEvents(graph, viewLevel, activeSectionEventId)
  )
  const scopeLabel = "城市行程"
  const title =
    view.level === "overview"
      ? `${graph.title}${durationDays ? ` · ${durationDays} 天` : ""}`
      : `${view.title}${durationDays ? ` · ${durationDays} 天` : ""}`

  return (
    <div ref={rootRef} data-route-preview className="min-h-full">
      <header
        data-route-preview-header
        className="sticky top-0 z-10 bg-soft-white/98 px-5 pt-4 pb-3 backdrop-blur-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-teak">
              {view.level === "overview" ? "行程总览" : scopeLabel}
            </p>
            <h1
              aria-label={view.level === "overview" ? graph.title : view.title}
              className="mt-1 truncate text-[22px] leading-7 font-black text-ink"
            >
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <RevisionState planning={isWorkspaceLocked} />
            {onCollapse ? (
              <button
                type="button"
                onClick={onCollapse}
                aria-label="收起行程面板"
                className="flex h-7 w-[26px] items-center justify-center rounded-lg border border-ink-10 bg-cream text-walnut transition hover:border-russet hover:bg-russet hover:text-soft-white"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 h-px bg-ink-10" />
        <RouteScopeTabs
          dayGroups={dayProjection.groups}
          activeDayKey={visibleActiveDayKey}
          onSelectDay={handleSelectDay}
        />
      </header>

      {commitPresentation ? (
        <div
          role="status"
          className="mx-5 mt-2 rounded-xl border border-mustard/45 bg-mustard/10 px-4 py-3 text-walnut"
        >
          <p className="text-[10px] font-black tracking-[0.08em] text-ink">
            行程已更新
          </p>
          <p className="mt-1 text-xs leading-5 font-bold">
            {commitPresentation.summary}
          </p>
        </div>
      ) : null}

      {view.events.length === 0 && view.level === "overview" ? (
        <div className="m-5 rounded-xl border border-dashed border-ink-20 bg-white/45 p-4 text-sm leading-6 text-walnut">
          路线尚无地点，可以在 AI 面板中添加第一站。
        </div>
      ) : view.level === "overview" ? (
        <RouteOverview
          changedEventIds={commitPresentation?.changedEventIds ?? []}
        />
      ) : view.isEmptySection ? (
        <div className="m-5 rounded-xl border border-dashed border-ink-20 bg-white/45 p-4 text-sm leading-6 text-walnut">
          这个城市还没有安排地点，可以在 AI 面板中继续规划。
        </div>
      ) : (
        <RouteTimeline
          items={view.items}
          dayProjection={dayProjection}
          onActiveDayChange={handleActiveDayChange}
          changedEventIds={commitPresentation?.changedEventIds ?? []}
        />
      )}
    </div>
  )
}

function RevisionState({ planning }: { planning: boolean }) {
  return (
    <span
      className={`mt-1.5 flex items-center gap-2 text-[10px] font-black ${
        planning ? "text-teak" : "text-olive"
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          planning ? "bg-mustard" : "bg-olive"
        }`}
      />
      {planning ? "当前版本" : "已保存"}
    </span>
  )
}
