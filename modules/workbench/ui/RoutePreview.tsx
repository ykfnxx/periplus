"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import {
  deriveJourneyDayGroups,
  type JourneyDayProjection,
} from "@/lib/journeys/day-groups"

import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  selectWorkspaceJourney,
  selectWorkspaceLocked,
} from "@/modules/workspace/state/selectors"
import RouteDayNavigation from "./RouteDayNavigation"
import RouteTimeline from "./RouteTimeline"

const EMPTY_DAY_PROJECTION: JourneyDayProjection = {
  groups: [],
  groupKeyByEventId: new Map(),
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
  const journey = useWorkspaceStore(selectWorkspaceJourney)
  const isWorkspaceLocked = useWorkspaceStore(selectWorkspaceLocked)
  const sourceJourneyId = useWorkspaceStore(
    (state) => state.workspaceDocument?.session.sourceJourneyId
  )
  const commitPresentation = useWorkspaceStore(
    (state) => state.journeyCommitPresentation
  )
  const dayProjection = useMemo(
    () =>
      journey ? deriveJourneyDayGroups(journey.events) : EMPTY_DAY_PROJECTION,
    [journey]
  )
  const visibleActiveDayKey = dayProjection.groups.some(
    (group) => group.key === activeDayKey
  )
    ? activeDayKey
    : (dayProjection.groups[0]?.key ?? null)

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

  const title = journey?.title ?? "旅程"

  return (
    <div ref={rootRef} data-route-preview className="journal-shell min-h-full">
      <header
        data-route-preview-header
        className="sticky top-0 z-10 bg-soft-white/98 px-5 pt-4 pb-3 backdrop-blur-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-teak">旅程事件</p>
            <h1
              aria-label={title}
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
        {sourceJourneyId && (
          <Link
            href={`/journeys/${encodeURIComponent(sourceJourneyId)}`}
            className="mt-3 inline-block text-xs font-semibold text-russet"
          >
            打开旅程编辑
          </Link>
        )}
        <RouteDayNavigation
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

      {journey?.events.length === 0 ? (
        <p className="px-5 py-6 text-sm leading-6 text-teak">
          还没有记录，可以添加经历或让 AI 帮你规划。
        </p>
      ) : journey ? (
        <RouteTimeline
          events={journey.events}
          dayProjection={dayProjection}
          onActiveDayChange={handleActiveDayChange}
          changedEventIds={commitPresentation?.changedEventIds ?? []}
        />
      ) : null}
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
