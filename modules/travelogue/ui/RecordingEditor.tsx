"use client"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useStore } from "zustand"
import dynamic from "next/dynamic"
import { DragDropProvider, PointerSensor, KeyboardSensor } from "@dnd-kit/react"
import { isSortable } from "@dnd-kit/react/sortable"
import { ArrowLeft, MoreHorizontal, Plus } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { RecordingLocation } from "@/modules/data-model/contracts/recording"
import MapPickBar from "./workbench/MapPickBar"
import type { RecordingStore } from "../state/recording-store"
import { createWorkbenchStore } from "../state/workbench-store"
import ResizableMapPanel from "./workbench/ResizableMapPanel"
import EventCard from "./workbench/EventCard"
import EventEditor from "./workbench/EventEditor"
import EventDetails from "./workbench/EventDetails"
import JourneySettings from "./workbench/JourneySettings"
import MapControls from "./workbench/MapControls"
import { useConfirmation } from "./workbench/Modal"
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
  canEdit = false,
}: {
  store: RecordingStore
  onBack: () => void
  mapPreview?: ReactNode
  developerMode?: boolean
  canEdit?: boolean
}) {
  const { journey, loading, error, conflict, saving, uploads } = useStore(store)
  const [ui] = useState(createWorkbenchStore)
  const {
    picking,
    selected,
    focusId,
    activeDay,
    dialog,
    expanded,
    metadata,
    sheet,
    panelWidth,
    photoViewer,
  } = useStore(ui)
  const { desktop, height, width } = useRecordingViewport()
  const { ask, confirmation } = useConfirmation()
  const [mapRequest, setMapRequest] = useState<RecordMapRequest | null>(null)
  const pickResult = useRef<
    ((location: RecordingLocation | null | undefined) => void) | null
  >(null)
  const finishPick = useCallback(
    (location: RecordingLocation | null | undefined) => {
      ui.setState({ picking: null })
      pickResult.current?.(location)
      pickResult.current = null
    },
    [ui]
  )
  const cancelPick = useCallback(() => finishPick(undefined), [finishPick])
  function pickLocation(location: RecordingLocation | null) {
    ui.setState({ picking: { location } })
    return new Promise<RecordingLocation | null | undefined>((resolve) => {
      pickResult.current = resolve
    })
  }
  const list = useRef<HTMLDivElement>(null)
  const days = useMemo(
    () =>
      Array.from(
        new Set(journey?.events.map((event) => event.date || "undated") || [])
      ).map((key) => ({
        key,
        first: journey!.events.find(
          (event) => (event.date || "undated") === key
        )!.id,
      })),
    [journey]
  )
  const ordinals = useMemo(
    () =>
      new Map(
        journey?.events
          .filter((event) => event.category !== "TRANSIT")
          .map((event, i) => [event.id, i + 1])
      ),
    [journey?.events]
  )
  const points = useMemo<RecordMapPoint[]>(
    () =>
      journey?.events.flatMap((event) =>
        event.location?.coordinates && event.category !== "TRANSIT"
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
        ? height - 24
        : Math.round(height * 0.55)
  const expandedId = journey?.events.some(
    (entry) => entry.id === expanded?.eventId
  )
    ? expanded?.eventId
    : null
  const insets = useMemo(
    () =>
      desktop
        ? {
            left: Math.min(
              width * 0.65,
              panelWidth + 20 + (expandedId && width >= 1200 ? 568 : 16)
            ),
            right: 64,
            top: 28,
            bottom: 28,
          }
        : { left: 24, right: 60, top: 68, bottom: sheetHeight + 24 },
    [desktop, panelWidth, sheetHeight, expandedId, width]
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
    if (canEdit) ui.setState({ dialog: { eventId, afterEventId } })
  }
  const expand = (eventId: string, photoIndex = 0) =>
    ui.setState({ selected: eventId, expanded: { eventId, photoIndex } })
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
    if (entry) ui.setState({ activeDay: entry.date || "undated" })
  }
  return (
    <main
      data-picking={!!picking}
      className="journal-workbench fixed inset-0 isolate overflow-hidden bg-cream text-ink"
    >
      <div className="absolute inset-0">
        {mapPreview || (
          <RecordMap
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
                      expanded: null,
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
        {developerMode && (
          <p className="absolute top-5 left-5 rounded-lg bg-soft-white px-3 py-2 text-xs text-walnut md:top-auto md:right-20 md:bottom-5 md:left-auto">
            开发者模式 · 共用调试数据
          </p>
        )}
        <nav aria-label="旅程操作" className="absolute top-2 left-5 flex gap-1">
          <Button
            variant="ghost"
            shape="circle"
            size="xs"
            aria-label="返回我的旅程"
            onClick={async () => {
              if (
                (saving || uploads.length) &&
                !(await ask("还有内容或照片尚未保存完成，仍然离开？"))
              )
                return
              onBack()
            }}
          >
            <ArrowLeft size={16} />
          </Button>
          {canEdit && (
            <Button
              variant="ghost"
              shape="circle"
              size="xs"
              aria-label="旅程信息"
              disabled={!journey}
              onClick={() => ui.setState({ metadata: true })}
            >
              <MoreHorizontal size={16} />
            </Button>
          )}
        </nav>
        <ResizableMapPanel
          recording
          width={384}
          onWidth={(panelWidth) => ui.setState({ panelWidth })}
          sheet={sheet}
          onSheet={(sheet) => ui.setState({ sheet })}
        >
          <header className="journal-dates shrink-0 px-5 pt-4 pb-8 md:px-10 md:pt-5 md:pb-12">
            <h1
              className="mb-3 line-clamp-2 text-xl leading-7 font-semibold break-words md:text-[22px] md:leading-8"
              title={journey?.title}
            >
              {journey?.title || "我的旅程"}
            </h1>
            <nav
              aria-label="记录日期"
              className="flex gap-2 overflow-x-auto py-1"
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
            {journey && !journey.events.length && (
              <div className="py-12 text-center">
                <h2 className="text-lg font-black">从一段经历开始</h2>
                <p className="mt-3 text-sm leading-7 text-walnut">
                  一句话，几张照片。
                  <br />
                  时间和地点可以慢慢补。
                </p>
              </div>
            )}
            <div className="flex flex-col gap-8">
              <DragDropProvider
                sensors={cardSensors}
                onDragEnd={(event) => {
                  const source = event.operation.source
                  if (
                    event.canceled ||
                    !isSortable(source) ||
                    source.initialIndex === source.index ||
                    !journey
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
                    index={index}
                    selected={selected === entry.id}
                    canEdit={canEdit}
                    onSelect={() => select(entry.id)}
                    onExpand={(photoIndex) => expand(entry.id, photoIndex)}
                  />
                ))}
              </DragDropProvider>
              {canEdit && (
                <Button
                  variant="primary"
                  className="journal-add w-full"
                  disabled={!journey || loading}
                  aria-label="添加记录"
                  onClick={() =>
                    openEditor(null, journey?.events.at(-1)?.id || null)
                  }
                >
                  <Plus size={20} />
                  添加记录
                </Button>
              )}
            </div>
          </div>
        </ResizableMapPanel>
        {expanded &&
          !dialog &&
          journey?.events.some((entry) => entry.id === expanded.eventId) && (
            <EventDetails
              key={`${expanded.eventId}:${expanded.photoIndex}`}
              store={store}
              eventId={expanded.eventId}
              initialIndex={expanded.photoIndex}
              panelWidth={panelWidth}
              canEdit={canEdit}
              editing={!!dialog}
              onClose={() => ui.setState({ expanded: null })}
              onEdit={() => openEditor(expanded.eventId)}
            />
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
      {dialog && canEdit && (
        <EventEditor
          store={store}
          request={dialog}
          onPickLocation={pickLocation}
          onClose={() => ui.setState({ dialog: null })}
          onSaved={(id) => {
            ui.setState((current) => ({
              selected: id,
              expanded:
                current.expanded?.eventId === id
                  ? current.expanded
                  : { eventId: id, photoIndex: 0 },
            }))
            requestAnimationFrame(() =>
              document
                .getElementById(`record-${id}`)
                ?.scrollIntoView({ block: "nearest" })
            )
          }}
        />
      )}
      {metadata && journey && canEdit && (
        <JourneySettings
          journey={journey}
          store={store}
          onClose={() => ui.setState({ metadata: false })}
        />
      )}
      {confirmation}
    </main>
  )
}
