"use client"

import { useEffect, useRef, useState } from "react"
import { useStore } from "zustand"
import { ArrowLeft, ChevronLeft } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { EventLocation } from "@/modules/data-model/contracts"
import { operationId } from "../../data/operation-id"
import DraftEditor from "../../drafts/DraftEditor"
import type { LocalDraft } from "../../drafts/storage"
import type { RecordingStore } from "../../state/recording-store"
import type { EventWindowRequest } from "../../state/workbench-store"
import {
  eventContent,
  eventContentPatch,
  type EventDraft,
} from "../event-content"
import EventComposer from "./EventComposer"
import { useConfirmation } from "./Modal"
import PhotoPanel from "./PhotoPanel"
import RevisionReload from "./RevisionReload"

export default function EventEditor({
  userId,
  store,
  request,
  onClose,
  onSaved,
  onPickLocation,
}: {
  userId: string
  store: RecordingStore
  request: EventWindowRequest
  onClose: () => void
  onSaved: (id: string) => void
  onPickLocation: (
    location: EventLocation | null
  ) => Promise<EventLocation | null | undefined>
}) {
  const { journey, uploads, saving } = useStore(store)
  const [eventId, setEventId] = useState(request.eventId)
  const entry = journey?.events.find((event) => event.id === eventId)
  const [draft, setDraft] = useState<EventDraft>(() => {
    const base = eventContent(entry)
    const category = entry?.category ?? request.category ?? base.category
    return {
      ...base,
      category,
      title: category === "TRANSIT" ? "" : base.title,
      date: entry?.date ?? request.date ?? base.date,
      location: entry?.location ?? request.location ?? null,
      transit:
        category === "TRANSIT"
          ? base.transit || {
              fromName: "",
              toName: "",
              transportMode: "TRAIN",
            }
          : null,
    }
  })
  const [saved, setSaved] = useState(draft)
  const [files, setFiles] = useState<File[]>([])
  const [view, setView] = useState<"edit" | "photos">("edit")
  const [viewDirty, setViewDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [saveKey] = useState(operationId)
  const [localDraft] = useState<LocalDraft>(() => ({
    id: operationId(),
    userId,
    journey: { id: journey!.id, title: journey!.title },
    content: draft,
    photos: [],
    afterEventId: request.afterEventId,
    updatedAt: new Date().toISOString(),
  }))
  const saveLock = useRef(false)
  const mounted = useRef(true)
  const { ask, confirmation } = useConfirmation()
  const pending = uploads.filter((upload) => upload.eventId === eventId)
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) ||
    files.length > 0 ||
    viewDirty

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", unload)
    return () => window.removeEventListener("beforeunload", unload)
  }, [dirty])

  async function attemptClose() {
    if (busy) return
    if (
      (dirty || saving || pending.length) &&
      !(await ask(
        pending.length
          ? "这段记录还有照片尚未保存完成。关闭会放弃未保存输入；已开始的上传会继续，失败后可返回重试。仍然关闭？"
          : "未保存的文字和照片输入将被放弃。",
        dirty
          ? {
              title: "放弃本次修改？",
              cancelLabel: "继续编辑",
              confirmLabel: "放弃修改",
            }
          : {
              title: "关闭记录？",
              cancelLabel: "返回记录",
              confirmLabel: "关闭并继续上传",
            }
      ))
    )
      return
    onClose()
  }

  async function switchView(next: typeof view) {
    if (
      viewDirty &&
      !(await ask("照片的未保存输入将被放弃。", {
        title: "放弃本次修改？",
        cancelLabel: "继续编辑",
        confirmLabel: "放弃修改",
      }))
    )
      return
    setViewDirty(false)
    setView(next)
  }

  async function pick() {
    const location = await onPickLocation(draft.location)
    if (!mounted.current || location === undefined) return
    setDraft((current) => ({ ...current, location }))
  }

  async function pickTransitEndpoint(which: "from" | "to") {
    const currentLoc =
      which === "from"
        ? (draft.transit?.fromLocation ?? null)
        : (draft.transit?.toLocation ?? null)
    const location = await onPickLocation(currentLoc)
    if (!mounted.current || location === undefined) return
    setDraft((current) => {
      const prevTransit = current.transit || {
        fromName: "",
        toName: "",
        transportMode: "TRAIN" as const,
      }
      const nameKey = which === "from" ? "fromName" : "toName"
      const locKey = which === "from" ? "fromLocation" : "toLocation"
      const nextName =
        location &&
        (!prevTransit[nameKey]?.trim() || prevTransit[nameKey] === "所选位置")
          ? location.name
          : prevTransit[nameKey]
      return {
        ...current,
        transit: {
          ...prevTransit,
          [nameKey]: nextName,
          [locKey]: location,
        },
      }
    })
  }

  async function save() {
    if (saveLock.current) return
    const normalized: EventDraft =
      draft.category === "TRANSIT" ? { ...draft, title: "" } : draft
    if (
      !entry &&
      !normalized.body.trim() &&
      !normalized.title.trim() &&
      !files.length &&
      !normalized.location &&
      !(
        normalized.category === "TRANSIT" &&
        normalized.transit?.fromName?.trim() &&
        normalized.transit?.toName?.trim()
      )
    ) {
      setError("写下一句话，选几张照片，或在地图上选个地点。")
      return
    }
    if (!normalized.date) {
      setError("请选择事件日期。")
      return
    }
    if (
      normalized.category === "TRANSIT" &&
      (!normalized.transit?.fromName?.trim() ||
        !normalized.transit?.toName?.trim())
    ) {
      setError("请填写出发地和目的地。")
      return
    }
    if (
      normalized.startAt &&
      normalized.endAt &&
      Date.parse(normalized.endAt) < Date.parse(normalized.startAt)
    ) {
      setError("结束时间不能早于开始时间，请确认到达日期。")
      return
    }
    saveLock.current = true
    setBusy(true)
    setError(null)
    try {
      const changes = eventContentPatch(normalized, saved)
      const result =
        eventId && Object.keys(changes).length === 0
          ? { journey: store.getState().journey!, eventId }
          : await store.getState().mutate(
              eventId
                ? { name: "event.update", eventId, patch: changes }
                : {
                    name: "event.add",
                    afterEventId: request.afterEventId,
                    content: normalized,
                  },
              eventId ? undefined : saveKey
            )
      const id = eventId || result.eventId!
      const persisted = result.journey.events.find((event) => event.id === id)
      const persistedDraft = persisted && eventContent(persisted)
      if (
        persistedDraft &&
        Object.entries(eventId ? changes : normalized).some(([key, value]) => {
          const stored = persistedDraft[key as keyof EventDraft]
          return value && typeof value === "object" && key === "transit"
            ? Object.entries(value).some(
                ([field, next]) =>
                  JSON.stringify(
                    (stored as Record<string, unknown> | null)?.[field]
                  ) !== JSON.stringify(next)
              )
            : JSON.stringify(stored) !== JSON.stringify(value)
        })
      )
        await store.getState().mutate({
          name: "event.update",
          eventId: id,
          patch: eventId ? changes : normalized,
        })
      setEventId(id)
      if (files.length) store.getState().addFiles(id, files)
      setFiles([])
      setDraft(normalized)
      setSaved(normalized)
      setStatus("已保存")
      onSaved(id)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "保存失败，内容保留，请重试。"
      )
    } finally {
      saveLock.current = false
      setBusy(false)
    }
  }

  if (!request.eventId)
    return (
      <DraftEditor
        inline
        initial={localDraft}
        journeys={[localDraft.journey]}
        onClose={() => {
          window.dispatchEvent(new Event("drafts-changed"))
          onClose()
        }}
        onPickLocation={onPickLocation}
        onSaved={async (_, id) => {
          await store.getState().load()
          window.dispatchEvent(new Event("drafts-changed"))
          onSaved(id)
          onClose()
        }}
      />
    )

  return (
    <section
      className="journal-subpage journal-composer"
      aria-label={entry ? "编辑记录" : "添加记录"}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation()
          void attemptClose()
        }
      }}
    >
      <header className="journal-subpage-header sticky top-0 z-10">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={
            view === "edit"
              ? () => void attemptClose()
              : () => void switchView("edit")
          }
        >
          {view !== "edit" ? <ChevronLeft size={16} /> : <ArrowLeft size={16} />}
          {view === "edit" ? "取消" : "返回"}
        </Button>
        <div className="flex items-center gap-2">
          {view === "edit" && (
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => void save()}
            >
              保存
            </Button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 pt-2">
          <RevisionReload
            store={store}
            onReload={() => {
              const current = store
                .getState()
                .journey?.events.find((event) => event.id === eventId)
              if (current) {
                const fresh = eventContent(current)
                setDraft((current) => {
                  const patch = eventContentPatch(current, saved)
                  return {
                    ...fresh,
                    ...patch,
                    transit:
                      patch.transit === undefined
                        ? fresh.transit
                        : patch.transit === null
                          ? null
                          : { ...fresh.transit, ...patch.transit },
                  }
                })
                setSaved(fresh)
              }
              setError(null)
            }}
          />
          {error && (
            <p role="alert" className="mb-2 text-sm text-coral">
              {error}
            </p>
          )}
        </div>
        {view === "edit" ? (
          <>
            <EventComposer
              draft={draft}
              files={files}
              photos={entry?.photos || []}
              uploads={pending}
              busy={busy}
              onChange={(next) => {
                setDraft(next)
                setStatus("")
              }}
              onFiles={setFiles}
              onPickLocation={() => void pick()}
              onPickTransitLocation={(which) => void pickTransitEndpoint(which)}
              onManagePhotos={entry ? () => setView("photos") : undefined}
            />
            {(status || pending.length > 0) && (
              <p
                role="status"
                className="px-4 pb-6 text-xs text-journal-muted"
              >
                {pending.length ? `${pending.length} 张照片待保存` : status}
              </p>
            )}
          </>
        ) : view === "photos" && entry ? (
          <div className="px-4 pb-6">
            <PhotoPanel
              store={store}
              eventId={entry.id}
              onDirtyChange={setViewDirty}
              onClose={() => void switchView("edit")}
            />
          </div>
        ) : (
          <p className="px-4 pb-6 text-sm text-journal-muted">这段记录已移除。</p>
        )}
      </div>
      {confirmation}
    </section>
  )
}
