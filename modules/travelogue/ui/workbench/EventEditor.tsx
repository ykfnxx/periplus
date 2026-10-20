"use client"
import { useEffect, useState } from "react"
import { useStore } from "zustand"
import { Tabs } from "@/components/kumo/components/tabs/tabs"
import type {
  RecordingEvent,
  RecordingEventContent,
} from "@/modules/data-model/contracts/recording"
import type { RecordingStore } from "../../state/recording-store"
import type { EventWindowRequest } from "../../state/workbench-store"
import { operationId } from "../../data/operation-id"
import { eventTitle } from "../display"
import EventForm, { type EventDraft } from "./EventForm"
import LocationPanel from "./LocationPanel"
import PhotoPanel from "./PhotoPanel"
import EventActions from "./EventActions"
import { Modal, useConfirmation } from "./Modal"
function toContent(draft: EventDraft): Partial<RecordingEventContent> {
  return {
    title: draft.title.trim(),
    body: draft.body,
    category: draft.category,
    date: draft.date || null,
    time: draft.time || null,
    timeZone: draft.time ? draft.timeZone || null : null,
  }
}
function toDraft(entry: RecordingEvent): EventDraft {
  return {
    title: entry.title,
    body: entry.body,
    category: entry.category,
    date: entry.date || "",
    time: entry.time || "",
    timeZone:
      entry.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}
type View = "edit" | "photos" | "location" | "actions"
export default function EventEditor({
  store,
  request,
  onClose,
  onSaved,
}: {
  store: RecordingStore
  request: EventWindowRequest
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const { journey, uploads, saving, error } = useStore(store)
  const [eventId, setEventId] = useState(request.eventId)
  const [view, setView] = useState<View>("edit")
  const [dirty, setDirty] = useState(false)
  const [saveKey] = useState(operationId)
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", unload)
    return () => window.removeEventListener("beforeunload", unload)
  }, [dirty])
  const { ask, confirmation } = useConfirmation()
  const entry = journey?.events.find((event) => event.id === eventId)
  const pending = uploads.filter((upload) => upload.eventId === eventId)
  async function switchView(next: View) {
    if (dirty && !(await ask("还有输入尚未保存，放弃修改并切换？"))) return
    setDirty(false)
    setView(next)
  }
  async function save(draft: EventDraft, files: File[]) {
    const patch = toContent(draft)
    const result = await store.getState().mutate(
      eventId
        ? { name: "event.update", eventId, patch }
        : {
            name: "event.add",
            afterEventId: request.afterEventId,
            content: patch,
          },
      eventId ? undefined : saveKey
    )
    const id = eventId || result.eventId!
    const saved = result.journey.events.find((event) => event.id === id)
    if (
      saved &&
      Object.entries(patch).some(
        ([key, value]) => saved[key as keyof RecordingEvent] !== value
      )
    )
      await store
        .getState()
        .mutate({ name: "event.update", eventId: id, patch })
    setEventId(id)
    if (files.length) store.getState().addFiles(id, files)
    setDirty(false)
    setView("edit")
    onSaved(id)
  }
  return (
    <>
      <Modal
        title={entry ? `${eventTitle(entry)} · 这段经历` : "添加记录"}
        onClose={onClose}
        beforeClose={async () => {
          if (!dirty && !saving && !pending.length) return true
          return ask(
            pending.length
              ? "这段记录还有照片尚未保存完成。关闭会放弃未保存输入；已开始的上传会继续，失败后可返回重试。仍然关闭？"
              : "还有内容尚未保存，放弃未保存的输入并关闭？"
          )
        }}
        className="w-[640px]! max-w-[calc(100vw-24px)]! p-5! md:p-7!"
      >
        {(close) => {
          return (
            <div className="min-h-0">
              <p role="status" className="mb-4 pr-8 text-xs text-walnut">
                {saving
                  ? "保存中…"
                  : dirty
                    ? "编辑中"
                    : pending.length
                      ? `${pending.length} 张照片待保存`
                      : entry
                        ? "已保存 · 仅自己可见"
                        : "先记下来，慢慢整理"}
              </p>
              {entry && (
                <Tabs
                  tabs={[
                    { value: "edit", label: "文字" },
                    { value: "photos", label: "照片" },
                    { value: "location", label: "地点" },
                    { value: "actions", label: "整理" },
                  ]}
                  value={view}
                  onValueChange={(value) => {
                    void switchView(value as View)
                  }}
                  variant="underline"
                  listClassName="mb-6"
                />
              )}
              {error && (
                <p role="alert" className="mb-4 text-sm text-coral">
                  {error}
                </p>
              )}
              {view === "edit" ? (
                <EventForm
                  initial={entry ? toDraft(entry) : undefined}
                  onDirtyChange={setDirty}
                  onSave={save}
                  onAutosave={
                    entry
                      ? async (draft) => {
                          await store.getState().mutate({
                            name: "event.update",
                            eventId: entry.id,
                            patch: toContent(draft),
                          })
                        }
                      : undefined
                  }
                  onCancel={() => {
                    close()
                  }}
                />
              ) : view === "photos" && entry ? (
                <PhotoPanel
                  store={store}
                  eventId={entry.id}
                  onDirtyChange={setDirty}
                  onClose={() => void switchView("edit")}
                />
              ) : view === "location" && entry ? (
                <LocationPanel
                  initialLocation={entry.location}
                  onDirtyChange={setDirty}
                  onClose={() => void switchView("edit")}
                  onSave={async (location) => {
                    await store.getState().mutate({
                      name: "event.update",
                      eventId: entry.id,
                      patch: { location },
                    })
                    setDirty(false)
                    setView("edit")
                  }}
                />
              ) : view === "actions" && entry ? (
                <EventActions
                  store={store}
                  eventId={entry.id}
                  onMoved={() => setView("edit")}
                  onRemoved={close}
                />
              ) : (
                <p>这段记录已移除。</p>
              )}
            </div>
          )
        }}
      </Modal>
      {confirmation}
    </>
  )
}
