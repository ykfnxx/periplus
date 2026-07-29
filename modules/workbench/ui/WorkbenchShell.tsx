"use client"

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { GripHorizontal, Map, Sparkles } from "lucide-react"
import {
  FULL_MAP_VIEWPORT_INSETS,
  measuredWorkspaceViewportInsets,
} from "@/modules/workspace/viewport"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type {
  MobileSheetSnap,
  WorkbenchTab,
} from "@/modules/workspace/state/types"
import AIComposer from "./AIComposer"
import ChatHistory from "./ChatHistory"
import InitialChatState from "./InitialChatState"
import RoutePreview from "./RoutePreview"

type WorkbenchLayout = "mobile" | "compact" | "wide"

const mobileSheetHeights: Record<MobileSheetSnap, string> = {
  collapsed: "76px",
  half: "44svh",
  expanded: "calc(100svh - 12px)",
}

export default function WorkbenchShell() {
  const sectionRef = useRef<HTMLElement>(null)
  const layout = useWorkbenchLayout()
  const chatMessages = useWorkspaceStore((state) => state.chatMessages)
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const isDraftLocked = useWorkspaceStore((state) => state.isDraftLocked)
  const workbenchTab = useWorkspaceStore((state) => state.workbenchTab)
  const setWorkbenchTab = useWorkspaceStore((state) => state.setWorkbenchTab)
  const mobileSheetSnap = useWorkspaceStore((state) => state.mobileSheetSnap)
  const setMobileSheetSnap = useWorkspaceStore(
    (state) => state.setMobileSheetSnap
  )
  const setMapViewportInsets = useWorkspaceStore(
    (state) => state.setMapViewportInsets
  )
  const isPickingUploadPhotoLocation = useWorkspaceStore(
    (state) =>
      state.isSelectingLocation &&
      state.locationSelectionMode === "upload-photo"
  )
  const showInitialState = chatMessages.length === 0 && !isDraftLocked

  useEffect(() => {
    if (isPickingUploadPhotoLocation) {
      setMapViewportInsets?.(FULL_MAP_VIEWPORT_INSETS)
      return
    }

    const section = sectionRef.current
    if (!section) return

    const measure = () => {
      const rect = section.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      setMapViewportInsets?.(
        measuredWorkspaceViewportInsets(rect, {
          width: window.innerWidth,
          height: window.innerHeight,
        })
      )
    }

    measure()
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure)
    observer?.observe(section)
    window.addEventListener("resize", measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [
    isPickingUploadPhotoLocation,
    layout,
    mobileSheetSnap,
    setMapViewportInsets,
  ])

  if (isPickingUploadPhotoLocation) return null

  const panel = (
    activeTab: WorkbenchTab,
    panelClassName: string,
    showHeader: boolean
  ) => (
    <div
      className={`${panelClassName} min-h-0 flex-col overflow-hidden rounded-xl border border-ink-15 bg-soft-white/96 shadow-periplus backdrop-blur-sm`}
    >
      {showHeader ? (
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-ink-10 px-4 text-sm font-black text-ink">
          {activeTab === "chat" ? (
            <Sparkles className="h-4 w-4 text-russet" aria-hidden="true" />
          ) : (
            <Map className="h-4 w-4 text-russet" aria-hidden="true" />
          )}
          {activeTab === "chat" ? "问问 AI" : "行程详情"}
        </div>
      ) : null}
      {activeTab === "preview" ? (
        <div className="periplus-chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <RoutePreview />
        </div>
      ) : showInitialState ? (
        <InitialChatState />
      ) : (
        <>
          <div className="periplus-chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-4">
            <ChatHistory />
          </div>
          <div className="shrink-0 px-4 pt-2 pb-3">
            <AIComposer />
          </div>
        </>
      )}
    </div>
  )

  if (layout === "wide") {
    return (
      <section
        ref={sectionRef}
        aria-label="旅行规划工作台"
        className="pointer-events-none absolute top-5 bottom-5 left-5 z-20 grid w-[752px] grid-cols-[320px_420px] gap-3"
      >
        {panel("chat", "pointer-events-auto flex", true)}
        {panel("preview", "pointer-events-auto flex", false)}
      </section>
    )
  }

  if (layout === "mobile") {
    return (
      <section
        ref={sectionRef}
        aria-label="旅行规划工作台"
        className="pointer-events-auto absolute right-0 bottom-0 left-0 z-20 flex min-h-[76px] flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-ink-15 bg-soft-white/98 shadow-[0_-16px_40px_var(--color-ink-15)] backdrop-blur-sm transition-[height] duration-200"
        style={{ height: mobileSheetHeights[mobileSheetSnap] }}
      >
        <MobileSheetHandle
          snap={mobileSheetSnap}
          routeName={draftRoute?.name ?? "行程工作台"}
          onSnapChange={setMobileSheetSnap}
        />
        {mobileSheetSnap === "collapsed" ? null : (
          <>
            <CompactTabBar
              activeTab={workbenchTab}
              onSelect={setWorkbenchTab}
            />
            <div className="min-h-0 flex-1">
              {panel(workbenchTab, "flex h-full rounded-none border-0 shadow-none", false)}
            </div>
          </>
        )}
      </section>
    )
  }

  return (
    <section
      ref={sectionRef}
      aria-label="旅行规划工作台"
      className="pointer-events-auto absolute top-5 bottom-5 left-5 z-20 flex w-[420px] flex-col overflow-hidden rounded-xl border border-ink-15 bg-soft-white/96 shadow-periplus backdrop-blur-sm"
    >
      <CompactTabBar activeTab={workbenchTab} onSelect={setWorkbenchTab} />
      <div className="min-h-0 flex-1">
        {panel(workbenchTab, "flex h-full rounded-none border-0 shadow-none", false)}
      </div>
    </section>
  )
}

function CompactTabBar({
  activeTab,
  onSelect,
}: {
  activeTab: WorkbenchTab
  onSelect: (tab: WorkbenchTab) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="工作台面板"
      className="grid shrink-0 grid-cols-2 border-b border-ink-10 bg-soft-white px-3 pt-2"
    >
      <WorkbenchTabButton
        value="preview"
        label="行程"
        selected={activeTab === "preview"}
        onSelect={onSelect}
      />
      <WorkbenchTabButton
        value="chat"
        label="问问 AI"
        selected={activeTab === "chat"}
        onSelect={onSelect}
      />
    </div>
  )
}

function WorkbenchTabButton({
  value,
  label,
  selected,
  onSelect,
}: {
  value: WorkbenchTab
  label: string
  selected: boolean
  onSelect: (tab: WorkbenchTab) => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(value)}
      className={`relative h-10 text-xs font-black transition ${
        selected ? "text-russet" : "text-teak hover:text-ink"
      }`}
    >
      {label}
      {selected ? (
        <span className="absolute right-5 bottom-0 left-5 h-0.5 bg-russet" />
      ) : null}
    </button>
  )
}

function MobileSheetHandle({
  snap,
  routeName,
  onSnapChange,
}: {
  snap: MobileSheetSnap
  routeName: string
  onSnapChange: (snap: MobileSheetSnap) => void
}) {
  const pointerStartRef = useRef<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  const finishDrag = (clientY: number) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    setDragOffset(0)
    if (start === null) return
    const delta = clientY - start
    if (Math.abs(delta) < 44) return
    onSnapChange(nextMobileSheetSnap(snap, delta < 0 ? "up" : "down"))
  }

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    pointerStartRef.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerStartRef.current === null) return
    setDragOffset(event.clientY - pointerStartRef.current)
  }

  return (
    <button
      type="button"
      aria-label={`调整行程面板高度，当前为${mobileSheetSnapLabel(snap)}`}
      onClick={() => {
        if (Math.abs(dragOffset) < 4) {
          onSnapChange(nextMobileSheetSnap(snap, "up"))
        }
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={(event) => finishDrag(event.clientY)}
      onPointerCancel={(event) => finishDrag(event.clientY)}
      className="flex h-[76px] shrink-0 touch-none items-center gap-3 px-5 text-left"
    >
      <span className="absolute top-2 left-1/2 -translate-x-1/2 text-ink-30">
        <GripHorizontal className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate pt-2 text-sm font-black text-ink">
        {routeName}
      </span>
      <span className="pt-2 text-[10px] font-bold text-teak">
        {mobileSheetSnapLabel(snap)}
      </span>
    </button>
  )
}

function nextMobileSheetSnap(
  current: MobileSheetSnap,
  direction: "up" | "down"
): MobileSheetSnap {
  const order: MobileSheetSnap[] = ["collapsed", "half", "expanded"]
  const currentIndex = order.indexOf(current)
  const delta = direction === "up" ? 1 : -1
  return order[Math.min(order.length - 1, Math.max(0, currentIndex + delta))]
}

function mobileSheetSnapLabel(snap: MobileSheetSnap) {
  if (snap === "collapsed") return "已收起"
  if (snap === "expanded") return "已展开"
  return "半屏"
}

function useWorkbenchLayout(): WorkbenchLayout {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("resize", notify)
      return () => window.removeEventListener("resize", notify)
    },
    () => layoutForWidth(window.innerWidth),
    () => "compact"
  )
}

function layoutForWidth(width: number): WorkbenchLayout {
  if (width < 768) return "mobile"
  if (width >= 1_440) return "wide"
  return "compact"
}
