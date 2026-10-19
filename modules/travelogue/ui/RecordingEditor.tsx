"use client"

import { operationId } from "../data/operation-id"

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  useSyncExternalStore,
} from "react"
import { useStore } from "zustand"
import dynamic from "next/dynamic"
import { Camera, ChevronUp, Eye, MapPin, Pencil, Plus } from "lucide-react"
import type {
  RecordingEvent,
  RecordingEventContent,
} from "@/modules/data-model/contracts/recording"
import type { RecordingStore } from "../state/recording-store"
import TravelogueHeader from "./TravelogueHeader"
import RecordDateNav from "./RecordDateNav"
import RecordEntryCard from "./RecordEntryCard"
import RecordComposer, { type RecordDraft } from "./RecordComposer"
import { RecordButton, RecordError } from "./primitives"
import RecordingOverlays, { type RecordingOverlay } from "./RecordingOverlays"
import {
  dateLabel,
  eventTitle,
  recordingDays,
  recordingCoordinateToMap,
} from "./display"
import type { RecordMapPoint } from "./RecordMap"

const RecordMap = dynamic(() => import("./RecordMap"), { ssr: false })
const desktopQuery = "(min-width: 1280px)"
function subscribeDesktop(callback: () => void) {
  const media = window.matchMedia(desktopQuery)
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}
type Composer = {
  key: string
  eventId?: string
  afterEventId: string | null
  files: File[]
}

function draftContent(draft: RecordDraft): Partial<RecordingEventContent> {
  return {
    title: draft.title.trim(),
    body: draft.body,
    category: draft.category,
    date: draft.date || null,
    time: draft.time || null,
    timeZone: draft.time ? draft.timeZone || null : null,
  }
}
function eventDraft(event: RecordingEvent): RecordDraft {
  return {
    title: event.title,
    body: event.body,
    category: event.category,
    date: event.date || "",
    time: event.time || "",
    timeZone:
      event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

export default function RecordingEditor({
  store,
  onBack,
  mapPreview,
}: {
  store: RecordingStore
  onBack: () => void
  mapPreview?: ReactNode
}) {
  const { journey, loading, error, conflict, saving, uploads } = useStore(store)
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => false
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const [showMap, setShowMap] = useState(true)
  const [composer, setComposer] = useState<Composer | null>(null)
  const [overlay, setOverlay] = useState<RecordingOverlay | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const savedScroll = useRef(0)
  const days = useMemo(
    () => recordingDays(journey?.events || []),
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
                ...recordingCoordinateToMap(event.location.coordinates),
              },
            ]
          : []
      ) || [],
    [journey?.events]
  )
  const selectedEvent = journey?.events.find((event) => event.id === selected)
  const editingEvent = journey?.events.find(
    (event) => event.id === composer?.eventId
  )

  useEffect(() => {
    if (journey && !journey.events.some((event) => event.id === selected))
      setSelected(journey.events[0]?.id || null)
  }, [journey, selected])
  useEffect(() => {
    if (!saving && !uploads.length) return
    const unload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", unload)
    return () => window.removeEventListener("beforeunload", unload)
  }, [saving, uploads.length])

  useEffect(() => {
    if (!journey) return
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )[0]
        const id = first?.target.getAttribute("data-record-id")
        const event = journey.events.find((event) => event.id === id)
        if (event) setActiveDay(event.date || "undated")
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: 0 }
    )
    document
      .querySelectorAll("[data-record-id]")
      .forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [journey, reading])

  function leave() {
    if (
      (draftDirty || saving || uploads.length) &&
      !window.confirm(
        "还有编辑或照片尚未保存完成。离开后，未保存的输入和待上传照片需要重新添加。仍然离开？"
      )
    )
      return
    onBack()
  }
  function scrollToEvent(id: string) {
    setSelected(id)
    document
      .getElementById(`record-${id}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" })
  }
  function add(afterEventId: string | null, files: File[] = []) {
    if (
      composer &&
      !window.confirm("当前记录仍在编辑，放弃这次编辑并添加另一条？")
    )
      return
    setComposer({ key: operationId(), afterEventId, files })
    setReading(false)
    requestAnimationFrame(() =>
      document
        .getElementById("record-composer")
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
    )
  }
  function edit(event: RecordingEvent) {
    setOverlay(null)
    if (
      composer &&
      composer.eventId !== event.id &&
      !window.confirm("当前记录仍在编辑，放弃这次编辑？")
    )
      return
    setComposer({
      key: operationId(),
      eventId: event.id,
      afterEventId: null,
      files: [],
    })
  }
  async function saveDraft(draft: RecordDraft, files: File[]) {
    if (!composer) return
    const content = draftContent(draft)
    const result = await store
      .getState()
      .mutate(
        composer.eventId
          ? { name: "event.update", eventId: composer.eventId, patch: content }
          : { name: "event.add", afterEventId: composer.afterEventId, content },
        composer.key
      )
    const eventId = composer.eventId || result.eventId!
    // 原添加请求可能在断线前已成功。重试后若作者修改了输入，仍更新同一 eventId。
    const saved = result.journey.events.find((event) => event.id === eventId)
    if (
      saved &&
      Object.entries(content).some(
        ([key, value]) => saved[key as keyof RecordingEvent] !== value
      )
    )
      await store
        .getState()
        .mutate({ name: "event.update", eventId, patch: content })
    if (files.length) {
      store.getState().addFiles(eventId, files)
      setOverlay({ type: "photos", eventId })
    }
    setComposer(null)
    setSelected(eventId)
  }
  function preview() {
    if (composer) {
      if (
        draftDirty &&
        !window.confirm("当前记录尚在编辑，先放弃这次编辑并预览已保存内容？")
      )
        return
      setComposer(null)
    }
    if (!reading) savedScroll.current = window.scrollY
    setReading(!reading)
    requestAnimationFrame(() =>
      window.scrollTo({ top: reading ? savedScroll.current : 0 })
    )
  }

  if (!journey)
    return (
      <main className="min-h-dvh bg-cream">
        <TravelogueHeader onBack={onBack} />
        <div className="mx-auto max-w-xl px-6 py-16">
          <RecordError message={error} />
          {loading ? (
            <p role="status" className="text-walnut">
              正在打开旅程…
            </p>
          ) : (
            <RecordButton
              onClick={() => void store.getState().load()}
              className="mt-4"
            >
              重新打开
            </RecordButton>
          )}
        </div>
      </main>
    )

  const mapContent = mapPreview || (
    <RecordMap
      points={points}
      selectedEventId={selected}
      onSelect={scrollToEvent}
    />
  )
  const currentCover =
    journey.events
      .flatMap((event) => event.photos)
      .find((photo) => photo.isCover) ||
    journey.events.flatMap((event) => event.photos)[0]
  const status = saving
    ? "保存中…"
    : uploads.some((upload) => upload.status === "failed")
      ? "照片待重试"
      : uploads.length
        ? "文字已保存，照片上传中"
        : error
          ? "保存未完成"
          : "已保存"
  const dated = journey.events
    .flatMap((event) => (event.date ? [event.date] : []))
    .sort()
  const range = dated.length
    ? `${dateLabel(dated[0])}${dated.at(-1) !== dated[0] ? ` — ${dateLabel(dated.at(-1)!)}` : ""}`
    : "日期待补"

  return (
    <main className="min-h-dvh bg-cream text-ink">
      <TravelogueHeader onBack={leave}>
        <span
          role="status"
          className={`hidden items-center gap-2 text-xs md:inline-flex ${error || uploads.some((upload) => upload.status === "failed") ? "text-coral" : "text-walnut"}`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${saving || uploads.length ? "bg-mustard" : error ? "bg-coral" : "bg-olive"}`}
          />
          {status}
        </span>
        <RecordButton onClick={preview} className="px-4">
          <Eye size={17} />
          {reading ? "返回编辑" : "阅读预览"}
        </RecordButton>
        {!reading ? (
          <RecordButton
            primary
            onClick={() => add(journey.events.at(-1)?.id || null)}
            disabled={!!saving || conflict}
            className="hidden md:inline-flex"
          >
            <Plus size={19} />
            添加记录
          </RecordButton>
        ) : null}
      </TravelogueHeader>
      <div className="mx-auto max-w-[1680px] lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-5 lg:px-6 lg:pt-6">
        <aside className="hidden self-start lg:block">
          <RecordDateNav
            days={days}
            activeDay={activeDay}
            onSelect={(day) => {
              setActiveDay(day?.key || null)
              if (day) scrollToEvent(day.firstEventId)
              else window.scrollTo({ top: 0, behavior: "smooth" })
            }}
          />
        </aside>
        <section className="min-w-0 px-5 pt-6 pb-28 lg:rounded-t-3xl lg:bg-soft-white lg:px-7 lg:pt-3 lg:pb-12">
          <div className="mb-6 border-b border-ink-10 pb-5">
            {!showMap ? (
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className="float-right hidden min-h-11 items-center gap-2 text-sm font-bold text-teak xl:inline-flex"
              >
                <MapPin size={17} />
                展开旅程地图
              </button>
            ) : null}
            <div className="flex items-center gap-3">
              <h1 className="text-3xl leading-tight font-black tracking-tight md:text-4xl">
                {journey.title}
              </h1>
              {!reading ? (
                <button
                  aria-label="编辑旅程信息"
                  onClick={() => setOverlay({ type: "metadata" })}
                  className="rounded p-2 text-teak hover:bg-cream"
                >
                  <Pencil size={18} />
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-teak">
              {range}
              <span className="mx-2">·</span>仅自己可见
              {journey.status === "COMPLETED" ? " · 旅行已结束" : ""}
            </p>
            <div className="mt-4 flex items-center justify-between md:hidden">
              <span role="status" className="text-xs text-walnut">
                {status}
              </span>
              <button
                type="button"
                onClick={() => setOverlay({ type: "map" })}
                className="inline-flex items-center gap-1 text-sm font-bold text-teak"
              >
                <MapPin size={17} />
                查看地图
              </button>
            </div>
            <div className="mt-5 lg:hidden">
              <RecordDateNav
                days={days}
                activeDay={activeDay}
                onSelect={(day) => {
                  setActiveDay(day?.key || null)
                  if (day) scrollToEvent(day.firstEventId)
                  else window.scrollTo({ top: 0, behavior: "smooth" })
                }}
              />
            </div>
          </div>
          {error ? (
            <div className="mb-5 space-y-3">
              <RecordError message={error} />
              {conflict ? (
                <RecordButton
                  disabled={saving > 0}
                  onClick={() => void store.getState().load()}
                >
                  刷新最新记录，保留当前输入
                </RecordButton>
              ) : null}
            </div>
          ) : null}
          <div
            className={`grid items-start gap-5 ${showMap ? "xl:grid-cols-[minmax(0,1fr)_minmax(280px,32%)]" : ""}`}
          >
            <div className="min-w-0 space-y-4">
              {reading && currentCover ? (
                <div className="overflow-hidden rounded-2xl">
                  <img
                    src={currentCover.url}
                    alt={journey.title}
                    className="aspect-[2.1] w-full object-cover"
                  />
                </div>
              ) : null}
              {reading && journey.description ? (
                <p className="px-1 text-base leading-8 text-walnut">
                  {journey.description}
                </p>
              ) : null}
              {!reading &&
              composer &&
              !composer.eventId &&
              composer.afterEventId === null ? (
                <div id="record-composer">
                  <RecordComposer
                    key={composer.key}
                    initialFiles={composer.files}
                    onSave={saveDraft}
                    onDirtyChange={setDraftDirty}
                    onCancel={() => setComposer(null)}
                  />
                </div>
              ) : null}
              {!journey.events.length && !composer ? (
                <div className="rounded-2xl border border-dashed border-ink-20 bg-white p-8 text-center">
                  <h2 className="text-xl font-black">还没有记录</h2>
                  <p className="mt-3 mb-6 text-sm leading-7 text-walnut">
                    写下一句话，或者先放几张照片。
                    <br />
                    时间和地点，慢慢补就好。
                  </p>
                  {!reading ? (
                    <RecordButton primary onClick={() => add(null)}>
                      <Plus size={18} />
                      记下第一段经历
                    </RecordButton>
                  ) : null}
                </div>
              ) : null}
              {journey.events.map((event, index) => (
                <Fragment key={event.id}>
                  {index === 0 ||
                  journey.events[index - 1].date !== event.date ? (
                    <h2 className="pt-2 text-xl font-black md:text-2xl">
                      {event.date ? `${dateLabel(event.date)}` : "未标日期"}
                    </h2>
                  ) : null}
                  <div data-record-id={event.id}>
                    {composer?.eventId === event.id && !reading ? (
                      <div id="record-composer">
                        <RecordComposer
                          key={composer.key}
                          initial={eventDraft(editingEvent!)}
                          onSave={saveDraft}
                          onDirtyChange={setDraftDirty}
                          onAutosave={async (draft) => {
                            await store.getState().mutate({
                              name: "event.update",
                              eventId: event.id,
                              patch: draftContent(draft),
                            })
                          }}
                          onCancel={() => setComposer(null)}
                        />
                      </div>
                    ) : (
                      <RecordEntryCard
                        entry={event}
                        readOnly={reading}
                        selected={selected === event.id}
                        busy={!!saving || conflict}
                        onSelect={() => setSelected(event.id)}
                        onEdit={() => edit(event)}
                        onLocation={() =>
                          setOverlay({ type: "location", eventId: event.id })
                        }
                        onPhotos={() =>
                          setOverlay({ type: "photos", eventId: event.id })
                        }
                        onPhotoOpen={(index) =>
                          setOverlay({
                            type: "viewer",
                            eventId: event.id,
                            index,
                          })
                        }
                        onMore={() =>
                          setOverlay({ type: "actions", eventId: event.id })
                        }
                        onDragStart={(drag) =>
                          drag.dataTransfer.setData(
                            "application/x-periplus-event",
                            event.id
                          )
                        }
                        onDrop={(drag) => {
                          drag.preventDefault()
                          const dragged = drag.dataTransfer.getData(
                            "application/x-periplus-event"
                          )
                          if (
                            reading ||
                            saving ||
                            conflict ||
                            !dragged ||
                            dragged === event.id
                          )
                            return
                          void store
                            .getState()
                            .mutate({
                              name: "event.move",
                              eventId: dragged,
                              afterEventId: event.id,
                            })
                            .catch(() => {})
                        }}
                      />
                    )}
                  </div>
                  {!reading ? (
                    <button
                      type="button"
                      disabled={!!saving || conflict}
                      onClick={() => add(event.id)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-russet/40 text-sm text-teak hover:bg-cream disabled:opacity-40"
                    >
                      <Plus size={17} />
                      在这里添加
                    </button>
                  ) : null}
                  {!reading &&
                  composer &&
                  !composer.eventId &&
                  composer.afterEventId === event.id ? (
                    <div id="record-composer">
                      <RecordComposer
                        key={composer.key}
                        initialFiles={composer.files}
                        onSave={saveDraft}
                        onDirtyChange={setDraftDirty}
                        onCancel={() => setComposer(null)}
                      />
                    </div>
                  ) : null}
                  {!reading &&
                  uploads.some((upload) => upload.eventId === event.id) ? (
                    <button
                      type="button"
                      onClick={() =>
                        setOverlay({ type: "photos", eventId: event.id })
                      }
                      className="w-full rounded-xl bg-mustard/15 p-3 text-left text-sm text-teak"
                    >
                      {
                        uploads.filter((upload) => upload.eventId === event.id)
                          .length
                      }{" "}
                      张照片
                      {uploads.some(
                        (upload) =>
                          upload.eventId === event.id &&
                          upload.status === "failed"
                      )
                        ? "待重试"
                        : "正在上传"}{" "}
                      · 查看进度
                    </button>
                  ) : null}
                </Fragment>
              ))}
            </div>
            <aside
              className={`sticky top-24 hidden min-w-0 ${showMap ? "xl:block" : ""}`}
            >
              <div className="rounded-2xl border border-ink-5 bg-white p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-black">旅程地图</h2>
                  <button
                    type="button"
                    onClick={() => setShowMap(!showMap)}
                    className="inline-flex items-center gap-1 text-xs text-teak"
                  >
                    {showMap ? "收起" : "展开"}
                    <ChevronUp size={16} />
                  </button>
                </div>
                {showMap && desktop ? (
                  <>
                    <div className="h-[min(52vh,520px)]">{mapContent}</div>
                    {selectedEvent ? (
                      <div className="mt-3 rounded-xl border border-ink-10 p-4">
                        <p className="mb-2 text-xs text-teak">当前记录</p>
                        <p className="flex items-center gap-2 text-sm font-bold">
                          <MapPin size={17} />
                          {eventTitle(selectedEvent)}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </aside>
          </div>
        </section>
      </div>
      {!reading ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-ink-10 bg-soft-white px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
          <RecordButton
            onClick={() => fileInput.current?.click()}
            disabled={!!saving || conflict}
            className="flex-1 rounded-xl"
          >
            <Camera size={20} />
            加照片
          </RecordButton>
          <RecordButton
            primary
            onClick={() => add(journey.events.at(-1)?.id || null)}
            disabled={!!saving || conflict}
            className="flex-1 rounded-xl"
          >
            <Plus size={21} />
            记一笔
          </RecordButton>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files || [])
              event.target.value = ""
              if (files.length) add(journey.events.at(-1)?.id || null, files)
            }}
          />
        </div>
      ) : null}
      <RecordingOverlays
        store={store}
        overlay={overlay}
        onClose={() => setOverlay(null)}
        onOpen={setOverlay}
        onEdit={edit}
        mapContent={mapContent}
      />
    </main>
  )
}
