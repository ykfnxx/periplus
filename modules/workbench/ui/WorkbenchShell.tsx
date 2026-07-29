"use client"

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  Map,
  Sparkles,
} from "lucide-react"
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
import AIContextCard from "./AIContextCard"
import ChatHistory from "./ChatHistory"
import InitialChatState from "./InitialChatState"
import RoutePreview from "./RoutePreview"

type WorkbenchLayout = "mobile" | "compact" | "wide"
type WidePanel = "chat" | "preview"

export default function WorkbenchShell() {
  const sectionRef = useRef<HTMLElement>(null)
  const layout = useWorkbenchLayout()
  const [collapsedPanels, setCollapsedPanels] = useState<Set<WidePanel>>(
    () => new Set()
  )
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
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(section)
    window.addEventListener("resize", measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [
    collapsedPanels,
    isPickingUploadPhotoLocation,
    layout,
    mobileSheetSnap,
    setMapViewportInsets,
  ])

  if (isPickingUploadPhotoLocation) return null

  const toggleWidePanel = (panel: WidePanel) => {
    setCollapsedPanels((current) => {
      const next = new Set(current)
      if (next.has(panel)) next.delete(panel)
      else next.add(panel)
      return next
    })
  }

  if (layout === "wide") {
    return (
      <section
        ref={sectionRef}
        aria-label="旅行规划工作台"
        className="pointer-events-none absolute top-5 bottom-5 left-5 z-20 flex gap-5"
      >
        {collapsedPanels.has("chat") ? (
          <CollapsedPanelRail
            label="AI 旅行助手"
            onExpand={() => toggleWidePanel("chat")}
          />
        ) : (
          <AIWorkbenchPanel
            className="pointer-events-auto flex w-[340px]"
            showInitialState={showInitialState}
            onCollapse={() => toggleWidePanel("chat")}
          />
        )}
        {collapsedPanels.has("preview") ? (
          <CollapsedPanelRail
            label="行程"
            onExpand={() => toggleWidePanel("preview")}
          />
        ) : (
          <ItineraryPanel
            className="pointer-events-auto flex w-[414px]"
            onCollapse={() => toggleWidePanel("preview")}
          />
        )}
      </section>
    )
  }

  if (layout === "mobile") {
    const sheetHeight =
      mobileSheetSnap === "collapsed"
        ? "76px"
        : mobileSheetSnap === "expanded"
          ? "calc(100svh - 8px)"
          : workbenchTab === "chat"
            ? "56svh"
            : "47svh"

    return (
      <section
        ref={sectionRef}
        aria-label="旅行规划工作台"
        className="pointer-events-auto absolute right-2 bottom-0 left-2 z-20 flex min-h-[76px] flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-ink-15 bg-soft-white/98 shadow-periplus-sheet backdrop-blur-sm transition-[height] duration-200"
        style={{ height: sheetHeight }}
      >
        <MobileSheetHandle
          snap={mobileSheetSnap}
          routeName={draftRoute?.name ?? "行程工作台"}
          onSnapChange={setMobileSheetSnap}
        />
        {mobileSheetSnap === "collapsed" ? null : (
          <>
            <div className="min-h-0 flex-1">
              {workbenchTab === "preview" ? (
                <ItineraryPanel className="flex h-full" framed={false} />
              ) : (
                <AIWorkbenchPanel
                  className="flex h-full"
                  showInitialState={showInitialState}
                  framed={false}
                />
              )}
            </div>
            <CompactTabBar
              activeTab={workbenchTab}
              onSelect={setWorkbenchTab}
              mobile
            />
          </>
        )}
      </section>
    )
  }

  return (
    <section
      ref={sectionRef}
      aria-label="旅行规划工作台"
      className="pointer-events-auto absolute top-5 bottom-5 left-5 z-20 flex w-[414px] flex-col overflow-hidden rounded-xl border border-ink-15 bg-soft-white/98 shadow-periplus backdrop-blur-sm"
    >
      <CompactTabBar activeTab={workbenchTab} onSelect={setWorkbenchTab} />
      <div className="min-h-0 flex-1">
        {workbenchTab === "preview" ? (
          <ItineraryPanel className="flex h-full" framed={false} />
        ) : (
          <AIWorkbenchPanel
            className="flex h-full"
            showInitialState={showInitialState}
            framed={false}
          />
        )}
      </div>
    </section>
  )
}

function AIWorkbenchPanel({
  className,
  showInitialState,
  onCollapse,
  framed = true,
}: {
  className: string
  showInitialState: boolean
  onCollapse?: () => void
  framed?: boolean
}) {
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)

  return (
    <div
      className={`${className} min-h-0 flex-col overflow-hidden bg-soft-white/98 ${
        framed
          ? "rounded-xl border border-ink-15 shadow-periplus backdrop-blur-sm"
          : ""
      }`}
    >
      <PanelHeader label="AI 旅行助手" onCollapse={onCollapse} />
      {draftRoute ? (
        <div className="shrink-0">
          <p className="px-5 pb-2 text-[11px] font-black text-teak">
            当前上下文
          </p>
          <AIContextCard />
        </div>
      ) : null}
      {showInitialState ? (
        <InitialChatState />
      ) : (
        <>
          <div className="periplus-chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-5">
            <ChatHistory />
          </div>
          <div className="shrink-0 px-5 pt-2 pb-4">
            <AIComposer />
          </div>
        </>
      )}
    </div>
  )
}

function ItineraryPanel({
  className,
  onCollapse,
  framed = true,
}: {
  className: string
  onCollapse?: () => void
  framed?: boolean
}) {
  return (
    <div
      className={`${className} min-h-0 flex-col overflow-hidden bg-soft-white/98 ${
        framed
          ? "rounded-xl border border-ink-15 shadow-periplus backdrop-blur-sm"
          : ""
      }`}
    >
      <div className="periplus-chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <RoutePreview onCollapse={onCollapse} />
      </div>
    </div>
  )
}

function PanelHeader({
  label,
  onCollapse,
}: {
  label: string
  onCollapse?: () => void
}) {
  return (
    <div className="flex h-[64px] shrink-0 items-center justify-between gap-3 px-5">
      <p className="text-[13px] font-black tracking-[0.08em] text-teak">
        {label}
      </p>
      {onCollapse ? (
        <button
          type="button"
          onClick={onCollapse}
          aria-label={`收起${label}`}
          className="flex h-7 w-[26px] items-center justify-center rounded-lg border border-ink-10 bg-cream text-walnut transition hover:border-russet hover:bg-russet hover:text-soft-white"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function CollapsedPanelRail({
  label,
  onExpand,
}: {
  label: string
  onExpand: () => void
}) {
  return (
    <div className="pointer-events-auto flex w-[42px] flex-col items-center rounded-xl border border-ink-15 bg-soft-white/98 py-2 shadow-periplus backdrop-blur-sm">
      <button
        type="button"
        onClick={onExpand}
        aria-label={`展开${label}`}
        className="flex h-7 w-[26px] items-center justify-center rounded-lg border border-ink-10 bg-cream text-walnut transition hover:border-russet hover:bg-russet hover:text-soft-white"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="mt-4 text-[10px] font-black tracking-[0.16em] text-teak [writing-mode:vertical-rl]">
        {label}
      </span>
    </div>
  )
}

function CompactTabBar({
  activeTab,
  onSelect,
  mobile = false,
}: {
  activeTab: WorkbenchTab
  onSelect: (tab: WorkbenchTab) => void
  mobile?: boolean
}) {
  return (
    <div
      role="tablist"
      aria-label="工作台面板"
      className={
        mobile
          ? "grid shrink-0 grid-cols-2 gap-2 border-t border-ink-10 bg-soft-white px-5 py-3"
          : "grid shrink-0 grid-cols-2 border-b border-ink-10 bg-soft-white px-3 pt-2"
      }
    >
      <WorkbenchTabButton
        value="preview"
        label="行程"
        selected={activeTab === "preview"}
        onSelect={onSelect}
        mobile={mobile}
      />
      <WorkbenchTabButton
        value="chat"
        label={mobile ? "AI 助手" : "问问 AI"}
        selected={activeTab === "chat"}
        onSelect={onSelect}
        mobile={mobile}
      />
    </div>
  )
}

function WorkbenchTabButton({
  value,
  label,
  selected,
  onSelect,
  mobile,
}: {
  value: WorkbenchTab
  label: string
  selected: boolean
  onSelect: (tab: WorkbenchTab) => void
  mobile: boolean
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(value)}
      className={
        mobile
          ? `flex h-[42px] items-center justify-center gap-2 rounded-full text-[13px] font-black transition ${
              selected
                ? "bg-russet text-ink"
                : "bg-cream text-ink hover:bg-ink hover:text-soft-white"
            }`
          : `relative h-10 text-xs font-black transition ${
              selected ? "text-ink" : "text-teak hover:text-ink"
            }`
      }
    >
      {value === "preview" ? (
        <Map className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
      {!mobile && selected ? (
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
      className={`relative flex shrink-0 touch-none items-center px-5 text-left ${
        snap === "collapsed" ? "h-[76px]" : "h-7"
      }`}
    >
      <span className="absolute top-2 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-ink-20" />
      {snap === "collapsed" ? (
        <>
          <span className="min-w-0 flex-1 truncate pt-3 text-sm font-black text-ink">
            {routeName}
          </span>
          <span className="pt-3 text-[10px] font-bold text-teak">点击展开</span>
        </>
      ) : (
        <GripHorizontal className="sr-only" aria-hidden="true" />
      )}
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
