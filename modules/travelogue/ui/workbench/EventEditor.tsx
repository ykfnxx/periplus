"use client"
import RevisionReload from "./RevisionReload"
import { useEffect, useRef, useState } from "react"
import { useStore } from "zustand"
import { ChevronLeft, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type {
  RecordingEventContent,
  RecordingLocation,
} from "@/modules/data-model/contracts/recording"
import type { RecordingStore } from "../../state/recording-store"
import type { EventWindowRequest } from "../../state/workbench-store"
import { operationId } from "../../data/operation-id"
import EventComposer from "./EventComposer"
import PhotoPanel from "./PhotoPanel"
import EventActions from "./EventActions"
import { Modal, useConfirmation } from "./Modal"

export default function EventEditor({
  store,
  request,
  onClose,
  onSaved,
  onPickLocation,
}: {
  store: RecordingStore
  request: EventWindowRequest
  onClose: () => void
  onSaved: (id: string) => void
  onPickLocation: (
    location: RecordingLocation | null
  ) => Promise<RecordingLocation | null | undefined>
}) {
  const { journey, uploads, saving } = useStore(store)
  const [eventId, setEventId] = useState(request.eventId)
  const entry = journey?.events.find((event) => event.id === eventId)
  const [draft, setDraft] = useState<RecordingEventContent>(() => ({
    title: entry?.title || "",
    body: entry?.body || "",
    category: entry?.category || null,
    date: entry?.date || null,
    time: entry?.time || null,
    timeZone: entry?.timeZone || null,
    location: entry?.location || request.location || null,
  }))
  const [saved, setSaved] = useState(JSON.stringify(draft))
  const [files, setFiles] = useState<File[]>([])
  const [view, setView] = useState<"edit" | "photos" | "actions">("edit")
  const [viewDirty, setViewDirty] = useState(false)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [saveKey] = useState(operationId)
  const saveLock = useRef(false)
  const mounted = useRef(true)
  const { ask, confirmation } = useConfirmation()
  const pending = uploads.filter((upload) => upload.eventId === eventId)
  const dirty = JSON.stringify(draft) !== saved || files.length > 0 || viewDirty
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
    setPicking(true)
    const location = await onPickLocation(draft.location)
    if (!mounted.current) return
    if (location !== undefined)
      setDraft((current) => ({ ...current, location }))
    setPicking(false)
  }
  async function save() {
    if (saveLock.current) return
    if (
      !entry &&
      !draft.body.trim() &&
      !draft.title.trim() &&
      !files.length &&
      !draft.location
    ) {
      setError("写下一句话，选几张照片，或在地图上选个地点。")
      return
    }
    saveLock.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await store.getState().mutate(
        eventId
          ? { name: "event.update", eventId, patch: draft }
          : {
              name: "event.add",
              afterEventId: request.afterEventId,
              content: draft,
            },
        eventId ? undefined : saveKey
      )
      const id = eventId || result.eventId!
      // 重试可能命中已落库的旧请求；仍将当前完整输入应用到同一个事件。
      const persisted = result.journey.events.find((event) => event.id === id)
      if (
        persisted &&
        Object.entries(draft).some(
          ([key, value]) =>
            JSON.stringify(persisted[key as keyof RecordingEventContent]) !==
            JSON.stringify(value)
        )
      )
        await store
          .getState()
          .mutate({ name: "event.update", eventId: id, patch: draft })
      setEventId(id)
      if (files.length) store.getState().addFiles(id, files)
      setFiles([])
      setSaved(JSON.stringify(draft))
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
  return (
    <>
      {!picking && (
        <Modal
          title={entry ? "编辑记录" : "添加记录"}
          hideTitle
          hideClose
          onClose={onClose}
          beforeClose={async () => {
            if (!dirty && !saving && !pending.length) return true
            return ask(
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
            )
          }}
          className="journal-composer w-[560px]! max-w-[calc(100vw-32px)]! p-0! max-sm:top-0! max-sm:left-0! max-sm:h-dvh! max-sm:max-h-dvh! max-sm:w-screen! max-sm:max-w-none! max-sm:translate-none! max-sm:transform-none! max-sm:rounded-none! max-sm:pt-[env(safe-area-inset-top)]! max-sm:pb-[env(safe-area-inset-bottom)]!"
          backdropClassName="bg-ink-20!"
        >
          {(close) => (
            <>
              <header className="sticky top-0 z-10 flex h-16 items-center justify-between bg-white px-6 md:px-9">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={
                    view === "edit" ? close : () => void switchView("edit")
                  }
                >
                  {view !== "edit" && <ChevronLeft size={16} />}
                  {view === "edit" ? "取消" : "返回"}
                </Button>
                <div className="flex items-center gap-2">
                  {entry &&
                    view === "edit" &&
                    (journey?.role === "OWNER" || entry.canRemove === true) && (
                      <Button
                        variant="ghost"
                        shape="circle"
                        size="sm"
                        aria-label="整理记录"
                        disabled={busy}
                        onClick={() => setView("actions")}
                      >
                        <MoreHorizontal size={18} />
                      </Button>
                    )}
                  {view === "edit" && (
                    <Button
                      variant="primary"
                      loading={busy}
                      onClick={() => void save()}
                    >
                      保存
                    </Button>
                  )}
                </div>
              </header>
              <div className="mx-6 md:mx-9">
                <RevisionReload store={store} onReload={() => setError(null)} />
              </div>
              {error && (
                <p
                  role="alert"
                  className="mx-6 mb-3 text-sm text-coral md:mx-9"
                >
                  {error}
                </p>
              )}
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
                    onManagePhotos={entry ? () => setView("photos") : undefined}
                  />
                  {(status || pending.length > 0) && (
                    <p
                      role="status"
                      className="px-6 pb-6 text-xs text-walnut md:px-9"
                    >
                      {pending.length
                        ? `${pending.length} 张照片待保存`
                        : status}
                    </p>
                  )}
                </>
              ) : view === "photos" && entry ? (
                <div className="px-6 pb-6 md:px-9">
                  <PhotoPanel
                    store={store}
                    eventId={entry.id}
                    onDirtyChange={setViewDirty}
                    onClose={() => void switchView("edit")}
                  />
                </div>
              ) : entry ? (
                <div className="px-6 pb-6 md:px-9">
                  <EventActions
                    store={store}
                    eventId={entry.id}
                    onMoved={() => setView("edit")}
                    onRemoved={onClose}
                  />
                </div>
              ) : (
                <p className="px-6 pb-6">这段记录已移除。</p>
              )}
            </>
          )}
        </Modal>
      )}
      {confirmation}
    </>
  )
}
