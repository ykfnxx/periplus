"use client"

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { useStore } from "zustand"
import dynamic from "next/dynamic"
import { DragDropProvider, PointerSensor, KeyboardSensor } from "@dnd-kit/react"
import {
  Accessibility,
  PointerActivationConstraints,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/dom"
import { isSortable } from "@dnd-kit/react/sortable"
import {
  ArrowLeft,
  ChartNoAxesColumn,
  List,
  Plus,
  Route,
} from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type {
  EventContent,
  EventLocation,
  JourneyEvent,
  JourneySummary,
} from "@/modules/data-model/contracts"
import type { JourneyOpenRequest } from "../data/navigation"
import DraftEntry from "../drafts/DraftEntry"
import type { RecordingStore } from "../state/recording-store"
import {
  createWorkbenchStore,
  type EventWindowRequest,
} from "../state/workbench-store"
import { eventRouteBounds } from "@/lib/journeys/route-paths"
import { dateLabel, eventTitle, recordingCoordinateToMap } from "./display"
import { photoItems } from "./photo-items"
import type { RecordMapPoint, RecordMapRequest } from "./RecordMap"
import { confirmedReceiptFields, receiptFormValues } from "./receipt-display"
import type { MapPhoto } from "./usePhotoMapLayer"
import useRecordingViewport from "./useRecordingViewport"
import EventCard from "./workbench/EventCard"
import EventDetails from "./workbench/EventDetails"
import EventEditor from "./workbench/EventEditor"
import EventTimeline from "./workbench/EventTimeline"
import JourneyMembers from "./workbench/JourneyMembers"
import JourneyMenu from "./workbench/JourneyMenu"
import JourneySettings from "./workbench/JourneySettings"
import MapControls from "./workbench/MapControls"
import MapPickBar from "./workbench/MapPickBar"
import MobileTimelineCurtain, {
  collapsedCurtainHeight,
  expandedCurtainHeight,
} from "./workbench/MobileTimelineCurtain"
import { useConfirmation } from "./workbench/Modal"
import PhotoPanel from "./workbench/PhotoPanel"
import PhotoViewer from "./workbench/PhotoViewer"
import ReceiptDetails from "./workbench/ReceiptDetails"
import ReceiptImport from "./workbench/ReceiptImport"
import RecordingMenu from "./workbench/RecordingMenu"
import ResizableMapPanel, {
  mobileSheetHeight,
} from "./workbench/ResizableMapPanel"
import RevisionReload from "./workbench/RevisionReload"

const RecordMap = dynamic(() => import("./RecordMap"), { ssr: false })

const cardSensors = [
  PointerSensor.configure({
    activationConstraints: [
      new PointerActivationConstraints.Distance({ value: 8 }),
    ],
    activatorElements: (source) => [source.element],
    preventActivation(event, source) {
      return (
        (event.pointerType === "touch" &&
          !source.handle?.contains(event.target as Node)) ||
        (event.target instanceof Element &&
          !!event.target.closest("[data-photo-strip]")) ||
        !!PointerSensor.defaults.preventActivation?.(event, source)
      )
    },
  }),
  KeyboardSensor.configure({
    keyboardCodes: {
      ...KeyboardSensor.defaults.keyboardCodes,
      start: ["Space"],
    },
  }),
]

const cardAccessibility = Accessibility.configure({
  screenReaderInstructions: {
    draggable: "按空格提起事件，方向键调整顺序，再按空格放下；按 Escape 取消。",
  },
  announcements: {
    dragstart: ({ operation: { source } }: DragStartEvent) =>
      isSortable(source)
        ? `已提起“${source.data.title}”，位于第${source.initialIndex + 1}项。`
        : undefined,
    dragover: ({ operation: { source, target } }: DragOverEvent) =>
      isSortable(source) && isSortable(target) && source.id !== target.id
        ? `正在将“${source.data.title}”移到“${target.data.title}”的位置。`
        : undefined,
    dragend: ({ operation: { source }, canceled }: DragEndEvent) =>
      isSortable(source)
        ? canceled
          ? `已取消调整“${source.data.title}”的顺序。`
          : `已放下“${source.data.title}”，位于第${source.index + 1}项。`
        : undefined,
  },
})

function syncStreamCardsToSlots(
  stream: HTMLElement | null,
  events: JourneyEvent[] | undefined
) {
  if (!stream || !events) return
  for (const entry of events) {
    const anchor = stream.querySelector(
      `[data-before-record="${CSS.escape(entry.id)}"]`
    )
    const card = stream.querySelector(
      `[data-record-id="${CSS.escape(entry.id)}"]:not([data-dnd-placeholder])`
    )
    if (anchor && card && anchor.nextElementSibling !== card) {
      anchor.insertAdjacentElement("afterend", card)
    }
  }
}

function GapSlot({
  beforeRecordId,
  afterEventId,
  date,
  canInsert,
  onInsert,
}: {
  beforeRecordId?: string
  afterEventId: string | null
  date?: string
  canInsert: boolean
  onInsert: (
    afterEventId: string | null,
    category: EventContent["category"],
    date?: string
  ) => void
}) {
  if (!canInsert)
    return (
      <div
        className="h-2 shrink-0"
        data-before-record={beforeRecordId}
      />
    )
  return (
    <div
      className="journal-gap-slot"
      data-before-record={beforeRecordId}
    >
      <div className="journal-gap-reveal">
        <button
          type="button"
          aria-label="在此处插入记录"
          className="journal-gap-btn"
          onClick={() => onInsert(afterEventId, "VISIT", date)}
        >
          <Plus size={13} />
          <span>记录</span>
        </button>
        <button
          type="button"
          aria-label="在此处插入交通"
          className="journal-gap-btn journal-gap-btn--transit"
          onClick={() => onInsert(afterEventId, "TRANSIT", date)}
        >
          <Route size={13} />
          <span>交通</span>
        </button>
      </div>
    </div>
  )
}

export default function RecordingEditor({
  userId,
  store,
  onBack,
  mapPreview,
  developerMode = false,
  readOnly = false,
  journeys = [],
  onOpenJourney,
  initialRequest,
  onRequestHandled,
  directoryError,
  directoryLoading = false,
  onRetryDirectory,
}: {
  userId: string
  store: RecordingStore
  onBack: () => void
  mapPreview?: ReactNode
  developerMode?: boolean
  readOnly?: boolean
  journeys?: JourneySummary[]
  onOpenJourney?: (id: string, request?: JourneyOpenRequest) => void
  directoryError?: string | null
  directoryLoading?: boolean
  onRetryDirectory?: () => void
  onRequestHandled?: () => void
  initialRequest?: JourneyOpenRequest
}) {
  const { journey, weather, loading, error, conflict, saving, uploads } =
    useStore(store)
  const canEdit =
    !readOnly && (journey?.role === "OWNER" || journey?.role === "MEMBER")
  const isOwner = !readOnly && journey?.role === "OWNER"
  const [ui] = useState(createWorkbenchStore)
  const {
    picking,
    selected,
    view,
    focusId,
    activeDay,
    dialog,
    detailsId,
    metadata,
    members,
    receiptImport,
    receiptDetails,
    photoPanelId,
    sheetRatio,
    panelWidth,
    photoViewer,
  } = useStore(ui)
  const { desktop, height, width } = useRecordingViewport()
  const timeline = view === "timeline"
  const selectedEntry =
    journey?.events.find((entry) => entry.id === selected) || journey?.events[0]
  const details = journey?.events.find((entry) => entry.id === detailsId)
  const detailsIndex = details
    ? (journey?.events.findIndex((entry) => entry.id === details.id) ?? -1)
    : -1
  const hasDetails = Boolean(details)
  const receiptEvent = journey?.events.find(
    (entry) => entry.id === receiptDetails?.eventId
  )
  const activeReceipt = receiptEvent?.receipts?.find(
    (receipt) => receipt.assetId === receiptDetails?.assetId
  )
  const photoEntry = journey?.events.find((entry) => entry.id === photoPanelId)
  const hasManagementSubpage = Boolean(
    (activeReceipt && receiptEvent) ||
      (receiptImport && journey && canEdit) ||
      (photoEntry && canEdit) ||
      (dialog && canEdit) ||
      (members && journey && canEdit) ||
      (metadata && journey && isOwner)
  )
  const showTimeline = timeline && !hasManagementSubpage

  const [photoDirty, setPhotoDirty] = useState(false)
  const [directory, setDirectory] = useState(false)
  const [sortReset, setSortReset] = useState(0)
  const initialApplied = useRef(false)
  const { ask, confirmation } = useConfirmation()
  const [mapRequest, setMapRequest] = useState<RecordMapRequest | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const dateNavRef = useRef<HTMLElement>(null)
  const savedScrollTop = useRef(0)
  const scrollLocked = useRef(false)
  const scrollLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current)
    }
  }, [])

  const pickResult = useRef<
    ((location: EventLocation | null | undefined) => void) | null
  >(null)
  const finishPick = useCallback(
    (location: EventLocation | null | undefined) => {
      ui.setState((current) => ({
        picking: null,
        sheetRatio: current.savedSheetRatio ?? current.sheetRatio,
        savedSheetRatio: null,
      }))
      pickResult.current?.(location)
      pickResult.current = null
    },
    [ui]
  )
  const cancelPick = useCallback(() => finishPick(undefined), [finishPick])
  function pickLocation(location: EventLocation | null) {
    // 移动端进入地图选点时自动下沉抽屉至约 32% 高度露出大片底图，完成后恢复原比例
    ui.setState((current) => ({
      picking: { location },
      savedSheetRatio: current.sheetRatio,
      sheetRatio:
        !desktop && current.sheetRatio > 0.34 ? 0.32 : current.sheetRatio,
    }))
    return new Promise<EventLocation | null | undefined>((resolve) => {
      pickResult.current = resolve
    })
  }

  const days = useMemo(
    () =>
      Array.from(new Set(journey?.events.map((event) => event.date) || [])).map(
        (key) => ({
          key,
          first: journey!.events.find((event) => event.date === key)!.id,
        })
      ),
    [journey]
  )
  const ordinals = useMemo(
    () => new Map(journey?.events.map((event, i) => [event.id, i + 1])),
    [journey?.events]
  )
  const points = useMemo<RecordMapPoint[]>(
    () =>
      journey?.events.flatMap((event) =>
        event.location?.coordinates
          ? [
              {
                eventId: event.id,
                title: eventTitle(event),
                ordinal: ordinals.get(event.id),
                ...recordingCoordinateToMap(event.location.coordinates),
              },
            ]
          : []
      ) || [],
    [journey?.events, ordinals]
  )
  const hasRoutes = useMemo(
    () =>
      Boolean(
        journey?.events.some((event) => eventRouteBounds(event).length > 0)
      ),
    [journey?.events]
  )
  const photos = useMemo(
    () => photoItems(journey?.events || []),
    [journey?.events]
  )
  const mapPhotos = useMemo(
    () =>
      photos.filter((photo): photo is MapPhoto => photo.coordinate !== null),
    [photos]
  )
  const viewerPhotos =
    photoViewer?.ids.flatMap((id) => {
      const photo = photos.find((item) => item.id === id)
      return photo ? [photo] : []
    }) || []

  const sheetHeight = mobileSheetHeight(height, sheetRatio)
  const insets = useMemo(
    () =>
      showTimeline
        ? {
            left: desktop && hasDetails ? 468 : 24,
            right: 64,
            top: 96,
            bottom: desktop
              ? 210
              : (hasDetails
                  ? expandedCurtainHeight(height)
                  : collapsedCurtainHeight) + 16,
          }
        : desktop
          ? {
              left: Math.min(width * 0.65, panelWidth + 36),
              right: 64,
              top: 40,
              bottom: 28,
            }
          : { left: 24, right: 60, top: 68, bottom: sheetHeight + 16 },
    [showTimeline, desktop, hasDetails, height, panelWidth, sheetHeight, width]
  )

  // 左栏从二级子页返回连续事件流时恢复进入子页前的精确滚动位置
  const inListStream = !showTimeline && !hasManagementSubpage && !details
  const wasInListStream = useRef(inListStream)
  useLayoutEffect(() => {
    if (inListStream && !wasInListStream.current && list.current) {
      list.current.scrollTop = savedScrollTop.current
    }
    wasInListStream.current = inListStream
  }, [inListStream])

  // @dnd-kit 乐观排序会直接移动卡片 DOM 跨越分隔符与间隙槽，提交后在此校准回各自锚点之后
  useLayoutEffect(() => {
    syncStreamCardsToSlots(streamRef.current, journey?.events)
  }, [journey?.events, sortReset, inListStream])

  useEffect(() => {
    if (!saving && !uploads.length) return
    const unload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", unload)
    return () => window.removeEventListener("beforeunload", unload)
  }, [saving, uploads.length])

  const rememberScroll = () => {
    if (list.current) savedScrollTop.current = list.current.scrollTop
  }

  function select(id: string, fromMap = false) {
    ui.setState((current) => ({
      selected: id,
      focusId: current.focusId + (fromMap ? 0 : 1),
      sheetRatio:
        fromMap && current.sheetRatio < 0.35 ? 0.55 : current.sheetRatio,
    }))
    if (showTimeline && detailsId) {
      ui.setState({ detailsId: id })
    }
    if (fromMap && !showTimeline)
      document
        .getElementById(`record-${id}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }

  const openEditor = (request: EventWindowRequest) => {
    if (
      canEdit &&
      (!request.eventId ||
        journey?.events.find((event) => event.id === request.eventId)
          ?.canEdit === true)
    ) {
      rememberScroll()
      ui.setState({ dialog: request })
    }
  }

  const openInsert = (
    afterEventId: string | null,
    category: EventContent["category"],
    date?: string
  ) => {
    openEditor({
      eventId: null,
      afterEventId,
      category,
      date,
    })
  }

  const expand = (eventId: string, photoIndex = 0) => {
    const ids = photos
      .filter((photo) => photo.eventId === eventId)
      .map((photo) => photo.id)
    ui.setState({ selected: eventId, photoViewer: { ids, index: photoIndex } })
  }

  useEffect(() => {
    if (!journey || initialApplied.current) return
    initialApplied.current = true
    if (initialRequest?.add || initialRequest?.eventId) onRequestHandled?.()
    if (initialRequest?.add && canEdit) {
      ui.setState({
        dialog: {
          eventId: null,
          afterEventId: journey.events.at(-1)?.id || null,
          location: initialRequest.location,
        },
      })
    } else if (
      initialRequest?.eventId &&
      journey.events.some((event) => event.id === initialRequest.eventId)
    ) {
      ui.setState({ selected: initialRequest.eventId, focusId: 1 })
      document
        .getElementById(`record-${initialRequest.eventId}`)
        ?.scrollIntoView({ block: "start" })
    }
  }, [journey, initialRequest, canEdit, ui, onRequestHandled])

  async function leave(action: () => void) {
    if (
      (saving || uploads.length) &&
      !(await ask("还有内容或照片尚未保存完成，仍然离开？"))
    )
      return
    action()
  }

  async function closePhotoSubpage() {
    if (!photoEntry) {
      ui.setState({ photoPanelId: null })
      return
    }
    const hasPending = store
      .getState()
      .uploads.some((upload) => upload.eventId === photoEntry.id)
    if (
      (photoDirty || hasPending) &&
      !(await ask("未保存输入将被放弃；已开始的上传会继续。", {
        title: "关闭照片？",
        cancelLabel: "继续整理",
        confirmLabel: "关闭照片",
      }))
    )
      return
    setPhotoDirty(false)
    ui.setState({ photoPanelId: null })
  }

  async function removeEvent(entry: JourneyEvent) {
    if (!canEdit || !entry.canRemove) return
    if (
      !(await ask(
        "删除这段记录？关联的照片与账单会从记录中移除，原素材保留。",
        { title: "删除记录？", confirmLabel: "删除", cancelLabel: "取消" }
      ))
    )
      return
    if (
      store.getState().uploads.some((upload) => upload.eventId === entry.id)
    ) {
      store.setState({ error: "请先完成或取消这段记录的待上传照片。" })
      return
    }
    try {
      await store.getState().mutate({ name: "event.remove", eventId: entry.id })
      if (ui.getState().selected === entry.id) {
        ui.setState({ selected: null, detailsId: null })
        if (showTimeline)
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLButtonElement>(
                ".journal-timeline-item[aria-current]"
              )
              ?.focus({ preventScroll: true })
          )
      }
    } catch {
      /* The store displays the mutation error in the list. */
    }
  }

  function centerActivePill(dayKey: string) {
    const nav = dateNavRef.current
    if (!nav) return
    const pill = nav.querySelector<HTMLElement>(
      `[data-day-pill="${CSS.escape(dayKey)}"]`
    )
    pill?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    })
  }

  function updateDay() {
    const root = list.current
    if (!root || !journey?.events.length) return
    savedScrollTop.current = root.scrollTop
    if (scrollLocked.current) return

    // 触底时直接高亮最后一条记录所属日期，其余位置按视口顶部向下 28% 阅读线取焦
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 8) {
      const lastDate = journey.events.at(-1)!.date
      if (ui.getState().activeDay !== lastDate) {
        ui.setState({ activeDay: lastDate })
        centerActivePill(lastDate)
      }
      return
    }

    const bounds = root.getBoundingClientRect()
    const readingLine = bounds.top + root.clientHeight * 0.28
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>(
        "[data-record-id]:not([data-dnd-placeholder])"
      )
    )
    const activeEl =
      elements.find(
        (element) => element.getBoundingClientRect().bottom >= readingLine
      ) || elements.at(-1)
    const entry = journey.events.find(
      (event) => event.id === activeEl?.dataset.recordId
    )
    if (entry && ui.getState().activeDay !== entry.date) {
      ui.setState({ activeDay: entry.date })
      centerActivePill(entry.date)
    }
  }

  function changeView(next: "list" | "timeline") {
    if (next === view) return
    rememberScroll()
    ui.setState({ view: next, detailsId: null })
    if (next === "list" && selected)
      requestAnimationFrame(() =>
        document
          .getElementById(`record-${selected}`)
          ?.scrollIntoView({ block: "center" })
      )
  }

  function closeTimelineDetails() {
    ui.setState({ detailsId: null })
    requestAnimationFrame(() =>
      document
        .getElementById(`timeline-${ui.getState().selected}`)
        ?.focus({ preventScroll: true })
    )
  }

  const heading = (
    <div className="journal-heading flex min-w-0 items-center gap-1">
      <Button
        variant="ghost"
        shape="square"
        className="shrink-0 text-journal-muted!"
        aria-label="返回全部游记"
        onClick={() => void leave(onBack)}
      >
        <ArrowLeft size={16} />
      </Button>
      <div className="min-w-0 flex-1">
        {onOpenJourney ? (
          <JourneyMenu
            error={directoryError}
            onRetry={onRetryDirectory}
            title={journey?.title || "游记"}
            journeys={journeys}
            open={directory}
            onOpenChange={setDirectory}
            onOpen={(id) => void leave(() => onOpenJourney(id))}
            onCreate={() => void leave(onBack)}
          />
        ) : (
          <h1 className="truncate text-lg font-bold">
            {journey?.title || "游记"}
          </h1>
        )}
      </div>
      <DraftEntry
        userId={userId}
        journeys={
          directoryLoading || directoryError || !onOpenJourney
            ? undefined
            : journeys
        }
      />
      {canEdit && (
        <Button
          variant="primary"
          shape="square"
          className="journal-write shrink-0"
          title="添加记录"
          disabled={!journey || loading}
          aria-label="添加记录"
          onClick={() =>
            openEditor({
              eventId: null,
              afterEventId: journey?.events.at(-1)?.id || null,
            })
          }
        >
          <Plus size={16} />
        </Button>
      )}
      {canEdit && journey && (
        <RecordingMenu
          onAgents={() =>
            window.location.assign(
              `/journeys/${encodeURIComponent(journey.id)}/agents`
            )
          }
          onReceipt={() => {
            rememberScroll()
            ui.setState({ receiptImport: { eventId: null } })
          }}
          onMembers={() => {
            rememberScroll()
            ui.setState({ members: true })
          }}
          shareDisabled={loading || saving > 0 || uploads.length > 0}
          onShare={
            isOwner
              ? () => {
                  window.location.assign(
                    `/journeys/${encodeURIComponent(journey.id)}/share${
                      selectedEntry
                        ? `?event=${encodeURIComponent(selectedEntry.id)}`
                        : ""
                    }`
                  )
                }
              : undefined
          }
          onSettings={
            isOwner
              ? () => {
                  rememberScroll()
                  ui.setState({ metadata: true })
                }
              : undefined
          }
        />
      )}
    </div>
  )

  const rail = (
    <EventTimeline
      events={journey?.events || []}
      selectedId={selectedEntry?.id || null}
      compact={!desktop}
      canEdit={canEdit}
      loading={loading}
      onSelect={(id) => select(id)}
      onOpen={(event) => ui.setState({ detailsId: event.id })}
      onEdit={(event) => openEditor({ eventId: event.id, afterEventId: null })}
      onRemove={(event) => void removeEvent(event)}
    />
  )

  const events = journey?.events || []

  const leftPanelContent =
    activeReceipt && receiptEvent ? (
      <ReceiptDetails
        key={`${receiptEvent.id}:${activeReceipt.assetId}`}
        receipt={activeReceipt}
        eventId={receiptEvent.id}
        store={canEdit ? store : undefined}
        onClose={() => ui.setState({ receiptDetails: null })}
      />
    ) : receiptImport && journey && canEdit ? (
      <ReceiptImport
        events={journey.events.map((entry) => ({
          id: entry.id,
          title: eventTitle(entry),
        }))}
        initialEventId={receiptImport.eventId}
        revisionNotice={<RevisionReload store={store} />}
        upload={(file, uploadId) =>
          store.getState().uploadReceipt(file, uploadId)
        }
        recognize={async (assetId) => {
          const result = await store.getState().recognizeReceipt(assetId)
          return receiptFormValues(result.fields)
        }}
        save={async (review, eventId, saveKey) => {
          const fields = confirmedReceiptFields(review.values)
          const receipt = { assetId: review.assetId, ...fields }
          const result = await store.getState().mutate(
            eventId
              ? { name: "receipt.add", eventId, receipt }
              : {
                  name: "event.add",
                  afterEventId:
                    store.getState().journey!.events.at(-1)?.id || null,
                  content: {
                    title: fields.merchant || "账单",
                    date: fields.date || new Date().toLocaleDateString("en-CA"),
                  },
                  receipt,
                },
            saveKey
          )
          const persistedEvent = result.journey.events.find((entry) =>
            entry.receipts?.some((item) => item.assetId === review.assetId)
          )
          const persisted = persistedEvent?.receipts?.find(
            (item) => item.assetId === review.assetId
          )
          if (!persistedEvent || !persisted)
            throw new Error("尚未确认账单保存结果，请重试。")
          if (
            Object.entries(fields).some(
              ([key, value]) =>
                JSON.stringify(persisted[key as keyof typeof fields]) !==
                JSON.stringify(value)
            )
          )
            await store.getState().mutate({
              name: "receipt.update",
              eventId: persistedEvent.id,
              receiptId: persisted.id,
              fields,
            })
          return persistedEvent.id
        }}
        onClose={() => ui.setState({ receiptImport: null })}
        onSaved={(eventId) => {
          ui.setState({ receiptImport: null })
          select(eventId)
          requestAnimationFrame(() =>
            document
              .getElementById(`record-${eventId}`)
              ?.scrollIntoView({ block: "nearest" })
          )
        }}
      />
    ) : photoEntry && canEdit ? (
      <PhotoPanel
        subpage
        store={store}
        eventId={photoEntry.id}
        onDirtyChange={setPhotoDirty}
        onClose={() => void closePhotoSubpage()}
      />
    ) : dialog && canEdit ? (
      <EventEditor
        userId={userId}
        store={store}
        request={dialog}
        onPickLocation={pickLocation}
        onClose={() => ui.setState({ dialog: null })}
        onSaved={(id) => {
          select(id)
          requestAnimationFrame(() =>
            document
              .getElementById(`record-${id}`)
              ?.scrollIntoView({ block: "nearest" })
          )
        }}
      />
    ) : members && journey && canEdit ? (
      <JourneyMembers
        journeyId={journey.id}
        title={journey.title}
        owner={isOwner}
        store={store}
        onClose={() => ui.setState({ members: false })}
      />
    ) : metadata && journey && isOwner ? (
      <JourneySettings
        journey={journey}
        store={store}
        onClose={() => ui.setState({ metadata: false })}
      />
    ) : details ? (
      <EventDetails
        key={details.id}
        entry={details}
        weather={weather[details.id]}
        currentIndex={detailsIndex >= 0 ? detailsIndex : undefined}
        totalCount={journey?.events.length}
        onPrev={
          detailsIndex > 0
            ? () => {
                const prev = journey!.events[detailsIndex - 1]!
                ui.setState((current) => ({
                  detailsId: prev.id,
                  selected: prev.id,
                  focusId: current.focusId + 1,
                }))
              }
            : undefined
        }
        onNext={
          journey &&
          detailsIndex >= 0 &&
          detailsIndex < journey.events.length - 1
            ? () => {
                const next = journey.events[detailsIndex + 1]!
                ui.setState((current) => ({
                  detailsId: next.id,
                  selected: next.id,
                  focusId: current.focusId + 1,
                }))
              }
            : undefined
        }
        onClose={() => ui.setState({ detailsId: null })}
        onReceipt={(assetId) =>
          ui.setState({ receiptDetails: { eventId: details.id, assetId } })
        }
        onEdit={
          canEdit && details.canEdit === true
            ? () => openEditor({ eventId: details.id, afterEventId: null })
            : undefined
        }
        onAddPhotos={
          canEdit
            ? () => {
                setPhotoDirty(false)
                ui.setState({ photoPanelId: details.id })
              }
            : undefined
        }
        onAddReceipt={
          canEdit
            ? () => ui.setState({ receiptImport: { eventId: details.id } })
            : undefined
        }
      />
    ) : (
      <>
        <header className="journal-dates shrink-0">
          {heading}
          {days.length > 0 && (
            <nav
              ref={dateNavRef}
              aria-label="记录日期"
              className="mt-2.5 flex gap-1.5 overflow-x-auto py-0.5"
            >
              {days.map((day) => {
                const isActive = (activeDay || days[0]?.key) === day.key
                return (
                  <Button
                    key={day.key}
                    data-day-pill={day.key}
                    size="sm"
                    variant={isActive ? "primary" : "secondary"}
                    className="shrink-0 rounded-full"
                    aria-pressed={isActive}
                    onClick={() => {
                      scrollLocked.current = true
                      if (scrollLockTimer.current)
                        clearTimeout(scrollLockTimer.current)
                      scrollLockTimer.current = setTimeout(() => {
                        scrollLocked.current = false
                      }, 720)
                      ui.setState({ activeDay: day.key })
                      centerActivePill(day.key)
                      const divider = list.current?.querySelector<HTMLElement>(
                        `[data-date-divider="${CSS.escape(day.key)}"]`
                      )
                      const target =
                        divider || document.getElementById(`record-${day.first}`)
                      target?.scrollIntoView({
                        block: "start",
                        behavior: "smooth",
                      })
                      setMapRequest((current) => ({
                        id: (current?.id || 0) + 1,
                        type: "fit-date",
                        date: day.key,
                      }))
                    }}
                  >
                    {day.key ? dateLabel(day.key) : "待定"}
                  </Button>
                )
              })}
            </nav>
          )}
        </header>

        <div
          ref={list}
          onScroll={updateDay}
          className="journal-list min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {error && (
            <div role="alert" className="my-3 text-sm text-coral">
              <p>{error}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => void store.getState().load()}
              >
                重新读取
              </Button>
            </div>
          )}
          {conflict && (
            <p className="my-2.5 text-xs leading-5 text-walnut">
              旅程已有其他修改。重新读取后再继续，未保存输入保留在编辑窗中。
            </p>
          )}

          {events.length === 0 && !loading ? (
            <div className="mt-4 rounded-3xl border border-dashed border-journal-line bg-journal-card px-5 py-10 text-center">
              <p className="font-editorial text-base font-bold text-journal-ink">
                这本游记还是空白页
              </p>
              {canEdit && (
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    aria-label="在此处插入记录"
                    className="journal-gap-btn"
                    onClick={() => openInsert(null, "VISIT")}
                  >
                    <Plus size={13} />
                    <span>记录</span>
                  </button>
                  <button
                    type="button"
                    aria-label="在此处插入交通"
                    className="journal-gap-btn journal-gap-btn--transit"
                    onClick={() => openInsert(null, "TRANSIT")}
                  >
                    <Route size={13} />
                    <span>交通</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div ref={streamRef} className="journal-stream">
              <DragDropProvider
                key={sortReset}
                plugins={(defaults) => [...defaults, cardAccessibility]}
                sensors={cardSensors}
                onDragStart={() => {
                  mainRef.current?.setAttribute("data-dragging-card", "true")
                }}
                onDragEnd={(event) => {
                  mainRef.current?.removeAttribute("data-dragging-card")
                  const source = event.operation.source
                  if (
                    event.canceled ||
                    !isSortable(source) ||
                    source.initialIndex === source.index ||
                    !journey ||
                    !isOwner
                  ) {
                    requestAnimationFrame(() =>
                      syncStreamCardsToSlots(streamRef.current, journey?.events)
                    )
                    return
                  }
                  const keyboard =
                    event.operation.activatorEvent instanceof KeyboardEvent
                  const remaining = journey.events.filter(
                    (entry) => entry.id !== source.id
                  )
                  const afterEventId =
                    source.index === 0
                      ? null
                      : remaining[source.index - 1]?.id || null
                  void store
                    .getState()
                    .mutate({
                      name: "event.move",
                      eventId: String(source.id),
                      afterEventId,
                    })
                    // 乐观排序写入失败时重置 Provider，恢复已确认的事件顺序
                    .catch(() => setSortReset((value) => value + 1))
                    .finally(() => {
                      if (keyboard)
                        requestAnimationFrame(() =>
                          document
                            .getElementById(`record-${source.id}`)
                            ?.querySelector<HTMLButtonElement>(
                              ".journal-card-sort"
                            )
                            ?.focus({ preventScroll: true })
                        )
                    })
                }}
              >
                {events.map((entry, index) => {
                  const prev = index > 0 ? events[index - 1]! : null
                  const showDateDivider =
                    index === 0 || entry.date !== prev!.date
                  return (
                    <Fragment key={entry.id}>
                      {showDateDivider && index > 0 && (
                        <GapSlot
                          afterEventId={prev!.id}
                          date={prev!.date}
                          canInsert={canEdit}
                          onInsert={openInsert}
                        />
                      )}
                      {showDateDivider && (
                        <div
                          className="journal-date-divider"
                          data-date-divider={entry.date}
                        >
                          <span>
                            {entry.date ? dateLabel(entry.date) : "待定"}
                          </span>
                        </div>
                      )}
                      <GapSlot
                        beforeRecordId={entry.id}
                        afterEventId={prev ? prev.id : null}
                        date={entry.date}
                        canInsert={canEdit}
                        onInsert={openInsert}
                      />
                      <EventCard
                        entry={entry}
                        weather={weather[entry.id]}
                        index={index}
                        selected={selected === entry.id}
                        canEdit={canEdit && entry.canEdit === true}
                        canRemove={canEdit && entry.canRemove === true}
                        canMove={isOwner}
                        moveDisabled={saving > 0 || conflict}
                        onAddReceipt={
                          canEdit && entry.canEdit === true
                            ? () => {
                                rememberScroll()
                                ui.setState({
                                  receiptImport: { eventId: entry.id },
                                })
                              }
                            : undefined
                        }
                        onReceipt={(assetId) => {
                          rememberScroll()
                          ui.setState({
                            receiptDetails: { eventId: entry.id, assetId },
                          })
                        }}
                        onSelect={() => select(entry.id)}
                        onExpand={(photoIndex) => expand(entry.id, photoIndex)}
                        onEdit={() =>
                          openEditor({
                            eventId: entry.id,
                            afterEventId: null,
                          })
                        }
                        onRemove={() => void removeEvent(entry)}
                        onRead={() => {
                          rememberScroll()
                          ui.setState({ detailsId: entry.id })
                        }}
                      />
                    </Fragment>
                  )
                })}
                {events.length > 0 && (
                  <GapSlot
                    afterEventId={events.at(-1)!.id}
                    date={events.at(-1)!.date}
                    canInsert={canEdit}
                    onInsert={openInsert}
                  />
                )}
              </DragDropProvider>
            </div>
          )}
        </div>
      </>
    )

  return (
    <main
      ref={mainRef}
      data-picking={!!picking}
      data-view={showTimeline ? "timeline" : "list"}
      className="journal-workbench fixed inset-0 isolate overflow-hidden bg-journal-canvas text-journal-ink"
      style={
        {
          "--journal-map-bottom":
            !desktop && !showTimeline ? `${sheetHeight}px` : "0px",
          "--journal-map-left":
            desktop && !showTimeline ? `${panelWidth + 36}px` : "4px",
        } as CSSProperties
      }
    >
      <div className="absolute inset-0 z-0">
        {mapPreview || (
          <RecordMap
            events={journey?.events}
            points={points}
            photos={mapPhotos}
            onOpenPhotos={(ids) =>
              ui.setState({ photoViewer: { ids, index: 0 } })
            }
            selectedEventId={showTimeline ? selectedEntry?.id : selected}
            onSelect={(id) => select(id, true)}
            insets={insets}
            request={mapRequest}
            focusId={focusId}
            picking={!!picking}
            pickedLocation={picking?.location}
            onPick={
              picking
                ? (coordinate) =>
                    ui.setState({
                      picking: {
                        location: {
                          name: "所选位置",
                          address: null,
                          coordinates: {
                            ...coordinate,
                            coordinateSystem: "WGS84",
                          },
                        },
                      },
                    })
                : undefined
            }
            onAddAtLocation={
              canEdit && journey && !dialog && !picking
                ? (location) => {
                    rememberScroll()
                    ui.setState({
                      dialog: {
                        eventId: null,
                        afterEventId: journey.events.at(-1)?.id || null,
                        location,
                      },
                    })
                  }
                : undefined
            }
          />
        )}
      </div>

      <MapControls
        canFit={points.length > 0 || mapPhotos.length > 0 || hasRoutes}
        onRequest={(type) =>
          setMapRequest((current) => ({ id: (current?.id || 0) + 1, type }))
        }
      />

      <div>
        {developerMode && <p className="sr-only">共用调试数据</p>}
        <div
          inert={!!picking || undefined}
          className={`journal-view-switch ${
            picking ? "pointer-events-none opacity-0" : ""
          }`}
          role="group"
          aria-label="游记展示方式"
        >
          <Button
            variant={timeline ? "ghost" : "primary"}
            aria-pressed={!timeline}
            onClick={() => changeView("list")}
          >
            <List size={17} />
            列表
          </Button>
          <Button
            variant={timeline ? "primary" : "ghost"}
            aria-pressed={timeline}
            onClick={() => changeView("timeline")}
          >
            <ChartNoAxesColumn size={17} />
            时间轴
          </Button>
        </div>

        {showTimeline ? (
          <div
            inert={!!picking || undefined}
            className={picking ? "pointer-events-none opacity-0" : ""}
          >
            <header className="journal-timeline-heading">{heading}</header>
            {(error || conflict) && (
              <div role="alert" className="journal-timeline-notice">
                <p>{error || "旅程已有其他修改，请重新读取。"}</p>
                <Button
                  variant="secondary"
                  onClick={() => void store.getState().load()}
                >
                  重新读取
                </Button>
              </div>
            )}
            {desktop ? (
              rail
            ) : (
              <MobileTimelineCurtain
                open={hasDetails}
                canOpen={Boolean(selectedEntry)}
                viewportHeight={height}
                onOpen={() => {
                  if (selectedEntry) {
                    select(selectedEntry.id)
                    ui.setState({ detailsId: selectedEntry.id })
                  }
                }}
                onClose={closeTimelineDetails}
                timeline={rail}
              >
                {selectedEntry ? (
                  <EventDetails
                    key={selectedEntry.id}
                    entry={selectedEntry}
                    weather={weather[selectedEntry.id]}
                    panel
                    embedded
                    onClose={closeTimelineDetails}
                    onReceipt={(assetId) =>
                      ui.setState({
                        receiptDetails: {
                          eventId: selectedEntry.id,
                          assetId,
                        },
                      })
                    }
                    onEdit={
                      canEdit && selectedEntry.canEdit === true
                        ? () =>
                            openEditor({
                              eventId: selectedEntry.id,
                              afterEventId: null,
                            })
                        : undefined
                    }
                    onAddPhotos={
                      canEdit
                        ? () => {
                            setPhotoDirty(false)
                            ui.setState({ photoPanelId: selectedEntry.id })
                          }
                        : undefined
                    }
                    onAddReceipt={
                      canEdit
                        ? () =>
                            ui.setState({
                              receiptImport: { eventId: selectedEntry.id },
                            })
                        : undefined
                    }
                  />
                ) : null}
              </MobileTimelineCurtain>
            )}
            {details && desktop && !picking && (
              <EventDetails
                key={details.id}
                entry={details}
                weather={weather[details.id]}
                panel
                onClose={closeTimelineDetails}
                onReceipt={(assetId) =>
                  ui.setState({
                    receiptDetails: { eventId: details.id, assetId },
                  })
                }
                onEdit={
                  canEdit && details.canEdit === true
                    ? () =>
                        openEditor({
                          eventId: details.id,
                          afterEventId: null,
                        })
                    : undefined
                }
                onAddPhotos={
                  canEdit
                    ? () => {
                        setPhotoDirty(false)
                        ui.setState({ photoPanelId: details.id })
                      }
                    : undefined
                }
                onAddReceipt={
                  canEdit
                    ? () =>
                        ui.setState({
                          receiptImport: { eventId: details.id },
                        })
                    : undefined
                }
              />
            )}
          </div>
        ) : (
          <ResizableMapPanel
            recording
            picking={!!picking}
            width={panelWidth}
            onWidth={(panelWidth) => ui.setState({ panelWidth })}
            sheetRatio={sheetRatio}
            onSheetRatio={(sheetRatio) => ui.setState({ sheetRatio })}
          >
            {leftPanelContent}
          </ResizableMapPanel>
        )}

        {photoViewer && viewerPhotos.length > 0 && (
          <PhotoViewer
            photos={viewerPhotos}
            initialIndex={photoViewer.index}
            onClose={() => ui.setState({ photoViewer: null })}
          />
        )}
      </div>

      {picking && (
        <MapPickBar
          location={picking.location}
          onChange={(location) => ui.setState({ picking: { location } })}
          onCancel={cancelPick}
          onConfirm={() =>
            finishPick(
              picking.location
                ? {
                    ...picking.location,
                    name: picking.location.name.trim() || "所选位置",
                  }
                : null
            )
          }
          onRemove={() => finishPick(null)}
        />
      )}

      {confirmation}
    </main>
  )
}
