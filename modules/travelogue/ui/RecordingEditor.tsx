"use client"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { useStore } from "zustand"
import dynamic from "next/dynamic"
import { DragDropProvider, PointerSensor, KeyboardSensor } from "@dnd-kit/react"
import { isSortable } from "@dnd-kit/react/sortable"
import { ArrowLeft, Plus } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type {
  JourneySummary,
  JourneyEvent,
  EventLocation,
} from "@/modules/data-model/contracts"
import { eventCalendarDate } from "@/lib/journeys/calendar"
import MapPickBar from "./workbench/MapPickBar"
import type { RecordingStore } from "../state/recording-store"
import { createWorkbenchStore } from "../state/workbench-store"
import ResizableMapPanel from "./workbench/ResizableMapPanel"
import EventCard from "./workbench/EventCard"
import EventEditor from "./workbench/EventEditor"
import EventDetails from "./workbench/EventDetails"
import JourneyMenu from "./workbench/JourneyMenu"
import type { JourneyOpenRequest } from "../data/navigation"
import JourneySettings from "./workbench/JourneySettings"
import MapControls from "./workbench/MapControls"
import { Modal, useConfirmation } from "./workbench/Modal"
import RecordingMenu from "./workbench/RecordingMenu"
import RevisionReload from "./workbench/RevisionReload"
import ReceiptImport from "./workbench/ReceiptImport"
import ReceiptDetails from "./workbench/ReceiptDetails"
import PhotoPanel from "./workbench/PhotoPanel"
import JourneyMembers from "./workbench/JourneyMembers"
import { confirmedReceiptFields, receiptFormValues } from "./receipt-display"
import { dateLabel, eventTitle, recordingCoordinateToMap } from "./display"
import type { RecordMapPoint, RecordMapRequest } from "./RecordMap"
import PhotoViewer from "./workbench/PhotoViewer"
import { photoItems } from "./photo-items"
import type { MapPhoto } from "./usePhotoMapLayer"
import useRecordingViewport from "./useRecordingViewport"
const RecordMap = dynamic(() => import("./RecordMap"), { ssr: false })

const cardSensors = [
  PointerSensor.configure({
    preventActivation(event, source) {
      return (
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

export default function RecordingEditor({
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
  onRetryDirectory,
}: {
  store: RecordingStore
  onBack: () => void
  mapPreview?: ReactNode
  developerMode?: boolean
  readOnly?: boolean
  journeys?: JourneySummary[]
  onOpenJourney?: (id: string, request?: JourneyOpenRequest) => void
  directoryError?: string | null
  onRetryDirectory?: () => void
  onRequestHandled?: () => void
  initialRequest?: JourneyOpenRequest
}) {
  const { journey, loading, error, conflict, saving, uploads } = useStore(store)
  const canEdit =
    !readOnly && (journey?.role === "OWNER" || journey?.role === "MEMBER")
  const isOwner = !readOnly && journey?.role === "OWNER"
  const [ui] = useState(createWorkbenchStore)
  const {
    picking,
    selected,
    focusId,
    activeDay,
    dialog,
    detailsId,
    metadata,
    members,
    receiptImport,
    receiptDetails,
    photoPanelId,
    sheet,
    panelWidth,
    photoViewer,
  } = useStore(ui)
  const { desktop, height, width } = useRecordingViewport()
  const details = journey?.events.find((entry) => entry.id === detailsId)
  const receiptEvent = journey?.events.find(
    (entry) => entry.id === receiptDetails?.eventId
  )
  const activeReceipt = receiptEvent?.receipts?.find(
    (receipt) => receipt.assetId === receiptDetails?.assetId
  )
  const photoEntry = journey?.events.find((entry) => entry.id === photoPanelId)
  const [photoDirty, setPhotoDirty] = useState(false)
  const [directory, setDirectory] = useState(false)
  const initialApplied = useRef(false)
  const { ask, confirmation } = useConfirmation()
  const [mapRequest, setMapRequest] = useState<RecordMapRequest | null>(null)
  const pickResult = useRef<
    ((location: EventLocation | null | undefined) => void) | null
  >(null)
  const finishPick = useCallback(
    (location: EventLocation | null | undefined) => {
      ui.setState({ picking: null })
      pickResult.current?.(location)
      pickResult.current = null
    },
    [ui]
  )
  const cancelPick = useCallback(() => finishPick(undefined), [finishPick])
  function pickLocation(location: EventLocation | null) {
    ui.setState({ picking: { location } })
    return new Promise<EventLocation | null | undefined>((resolve) => {
      pickResult.current = resolve
    })
  }
  const list = useRef<HTMLDivElement>(null)
  const days = useMemo(
    () =>
      Array.from(
        new Set(
          journey?.events.map(
            (event) => eventCalendarDate(event) || "undated"
          ) || []
        )
      ).map((key) => ({
        key,
        first: journey!.events.find(
          (event) => (eventCalendarDate(event) || "undated") === key
        )!.id,
      })),
    [journey]
  )
  const ordinals = useMemo(
    () => new Map(journey?.events.map((event, i) => [event.id, i + 1])),
    [journey?.events]
  )
  const eventsById = useMemo(
    () =>
      new Map<string, JourneyEvent>(
        journey?.events.map((event) => [event.id, event])
      ),
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
  const sheetHeight =
    sheet === "small"
      ? 164
      : sheet === "full"
        ? height
        : Math.round(height * 0.8)
  const insets = useMemo(
    () =>
      desktop
        ? {
            left: Math.min(width * 0.65, panelWidth + 36),
            right: 64,
            top: 40,
            bottom: 28,
          }
        : { left: 24, right: 60, top: 68, bottom: sheetHeight + 16 },
    [desktop, panelWidth, sheetHeight, width]
  )
  useEffect(() => {
    if (!saving && !uploads.length) return
    const unload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", unload)
    return () => window.removeEventListener("beforeunload", unload)
  }, [saving, uploads.length])
  function select(id: string, fromMap = false) {
    ui.setState((current) => ({
      selected: id,
      focusId: current.focusId + (fromMap ? 0 : 1),
      sheet: fromMap && current.sheet === "small" ? "half" : current.sheet,
    }))
    if (fromMap)
      document
        .getElementById(`record-${id}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }
  const openEditor = (
    eventId: string | null,
    afterEventId: string | null = null
  ) => {
    if (
      canEdit &&
      (!eventId ||
        journey?.events.find((event) => event.id === eventId)?.canEdit === true)
    )
      ui.setState({ dialog: { eventId, afterEventId } })
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
  function updateDay() {
    const root = list.current
    if (!root) return
    const first = Array.from(
      root.querySelectorAll<HTMLElement>("[data-record-id]")
    ).find(
      (element) =>
        element.getBoundingClientRect().bottom >
        root.getBoundingClientRect().top + 20
    )
    const entry = journey?.events.find(
      (event) => event.id === first?.dataset.recordId
    )
    if (entry) ui.setState({ activeDay: eventCalendarDate(entry) || "undated" })
  }
  return (
    <main
      data-picking={!!picking}
      className="journal-workbench fixed inset-0 isolate overflow-hidden bg-cream text-ink"
      style={
        {
          "--journal-map-bottom":
            !desktop && !picking ? `${sheetHeight}px` : "0px",
          "--journal-map-left": desktop ? `${panelWidth + 36}px` : "4px",
        } as CSSProperties
      }
    >
      <div className="absolute inset-0">
        {mapPreview || (
          <RecordMap
            events={journey?.events}
            points={points}
            photos={mapPhotos}
            onOpenPhotos={(ids) =>
              ui.setState({ photoViewer: { ids, index: 0 } })
            }
            selectedEventId={selected}
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
                            coordinateSystem: "GCJ02",
                          },
                        },
                      },
                    })
                : undefined
            }
            onAddAtLocation={
              canEdit && journey && !dialog && !picking
                ? (location) =>
                    ui.setState({
                      dialog: {
                        eventId: null,
                        afterEventId: journey.events.at(-1)?.id || null,
                        location,
                      },
                    })
                : undefined
            }
          />
        )}
      </div>
      <MapControls
        canFit={points.length > 0 || mapPhotos.length > 0}
        onRequest={(type) =>
          setMapRequest((current) => ({ id: (current?.id || 0) + 1, type }))
        }
      />
      <div
        inert={!!picking}
        className={picking ? "pointer-events-none hidden md:block" : ""}
      >
        {developerMode && <p className="sr-only">共用调试数据</p>}
        <ResizableMapPanel
          recording
          width={420}
          onWidth={(panelWidth) => ui.setState({ panelWidth })}
          sheet={sheet}
          onSheet={(sheet) => ui.setState({ sheet })}
        >
          <header className="journal-dates shrink-0">
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
                  <h1 className="truncate text-lg font-semibold">
                    {journey?.title || "游记"}
                  </h1>
                )}
              </div>
              {canEdit && (
                <Button
                  variant="primary"
                  shape="square"
                  className="journal-write shrink-0"
                  title="添加记录"
                  disabled={!journey || loading}
                  aria-label="添加记录"
                  onClick={() =>
                    openEditor(null, journey?.events.at(-1)?.id || null)
                  }
                >
                  <Plus size={16} />
                </Button>
              )}
              {canEdit && journey && (
                <RecordingMenu
                  onReceipt={() =>
                    ui.setState({ receiptImport: { eventId: null } })
                  }
                  onMembers={() => ui.setState({ members: true })}
                  onSettings={
                    isOwner ? () => ui.setState({ metadata: true }) : undefined
                  }
                />
              )}
            </div>
            <nav
              aria-label="记录日期"
              className="mt-3 flex gap-2 overflow-x-auto py-1"
            >
              {days.map((day) => (
                <Button
                  key={day.key}
                  size="sm"
                  variant={
                    (activeDay || days[0]?.key) === day.key
                      ? "primary"
                      : "secondary"
                  }
                  className="shrink-0 rounded-lg"
                  aria-pressed={(activeDay || days[0]?.key) === day.key}
                  onClick={() => {
                    ui.setState({ activeDay: day.key })
                    document
                      .getElementById(`record-${day.first}`)
                      ?.scrollIntoView({ block: "start", behavior: "smooth" })
                  }}
                >
                  {day.key === "undated" ? "日期待补" : dateLabel(day.key)}
                </Button>
              ))}
            </nav>
          </header>
          <div
            ref={list}
            onScroll={updateDay}
            className="journal-list min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-9 md:px-10"
          >
            {error && (
              <div role="alert" className="my-4 text-sm text-coral">
                <p>{error}</p>
                <Button
                  variant="secondary"
                  className="mt-2"
                  onClick={() => void store.getState().load()}
                >
                  重新读取
                </Button>
              </div>
            )}
            {conflict && (
              <p className="my-3 text-xs leading-5 text-walnut">
                旅程已有其他修改。重新读取后再继续，未保存输入保留在编辑窗中。
              </p>
            )}
            <div className="flex flex-col gap-7">
              <DragDropProvider
                sensors={cardSensors}
                onDragEnd={(event) => {
                  const source = event.operation.source
                  if (
                    event.canceled ||
                    !isSortable(source) ||
                    source.initialIndex === source.index ||
                    !journey ||
                    !isOwner
                  )
                    return
                  const handle = source.handle || source.element
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
                    .catch(() => {})
                    .finally(() => {
                      if (keyboard)
                        requestAnimationFrame(
                          () =>
                            handle instanceof HTMLElement &&
                            handle.focus({ preventScroll: true })
                        )
                    })
                }}
              >
                {journey?.events.map((entry, index) => (
                  <EventCard
                    key={entry.id}
                    entry={entry}
                    eventsById={eventsById}
                    index={index}
                    selected={selected === entry.id}
                    canEdit={canEdit && entry.canEdit === true}
                    canMove={isOwner}
                    onReceipt={(assetId) =>
                      ui.setState({
                        receiptDetails: { eventId: entry.id, assetId },
                      })
                    }
                    onSelect={() => select(entry.id)}
                    onExpand={(photoIndex) => expand(entry.id, photoIndex)}
                    onEdit={() => openEditor(entry.id)}
                    onRead={() => ui.setState({ detailsId: entry.id })}
                  />
                ))}
              </DragDropProvider>
            </div>
          </div>
        </ResizableMapPanel>
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
      {details && (
        <EventDetails
          key={details.id}
          entry={details}
          onClose={() => ui.setState({ detailsId: null })}
          onReceipt={(assetId) =>
            ui.setState({ receiptDetails: { eventId: details.id, assetId } })
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
          onEdit={
            canEdit && details.canEdit === true
              ? () => {
                  ui.setState({ detailsId: null })
                  openEditor(details.id)
                }
              : undefined
          }
        />
      )}
      {dialog && canEdit && (
        <EventEditor
          store={store}
          request={dialog}
          onPickLocation={pickLocation}
          onClose={() => ui.setState({ dialog: null })}
          onSaved={(id) => {
            ui.setState({ selected: id })
            requestAnimationFrame(() =>
              document
                .getElementById(`record-${id}`)
                ?.scrollIntoView({ block: "nearest" })
            )
          }}
        />
      )}
      {metadata && journey && isOwner && (
        <JourneySettings
          journey={journey}
          store={store}
          onClose={() => ui.setState({ metadata: false })}
        />
      )}
      {members && journey && canEdit && (
        <JourneyMembers
          journeyId={journey.id}
          title={journey.title}
          owner={isOwner}
          store={store}
          onClose={() => ui.setState({ members: false })}
        />
      )}
      {activeReceipt && receiptEvent && (
        <ReceiptDetails
          key={`${receiptEvent.id}:${activeReceipt.assetId}`}
          receipt={activeReceipt}
          eventId={receiptEvent.id}
          store={canEdit ? store : undefined}
          onClose={() => ui.setState({ receiptDetails: null })}
        />
      )}
      {photoEntry && canEdit && (
        <Modal
          title="整理照片"
          hideTitle
          className="journal-photo-management w-[560px]! p-6! max-sm:top-0! max-sm:left-0! max-sm:h-dvh! max-sm:max-h-dvh! max-sm:w-screen! max-sm:max-w-none! max-sm:translate-none! max-sm:transform-none! max-sm:rounded-none! max-sm:pt-[calc(env(safe-area-inset-top)+24px)]! max-sm:pb-[calc(env(safe-area-inset-bottom)+24px)]!"
          onClose={() => ui.setState({ photoPanelId: null })}
          beforeClose={() =>
            (!photoDirty &&
              !uploads.some((upload) => upload.eventId === photoEntry.id)) ||
            ask("未保存输入将被放弃；已开始的上传会继续。", {
              title: "关闭照片？",
              cancelLabel: "继续整理",
              confirmLabel: "关闭照片",
            })
          }
        >
          {(close) => (
            <PhotoPanel
              store={store}
              eventId={photoEntry.id}
              onDirtyChange={setPhotoDirty}
              onClose={close}
            />
          )}
        </Modal>
      )}
      {receiptImport && journey && canEdit && (
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
                      date: fields.date,
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
            ui.setState({ receiptImport: null, selected: eventId })
            requestAnimationFrame(() =>
              document
                .getElementById(`record-${eventId}`)
                ?.scrollIntoView({ block: "nearest" })
            )
          }}
        />
      )}
      {confirmation}
    </main>
  )
}
