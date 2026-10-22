"use client"
import { MAX_RECORDING_PHOTO_CAPTION_LENGTH } from "@/modules/data-model/contracts/recording"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useReducedMotion } from "motion/react"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import { Camera, GripVertical, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import { Select } from "@/components/kumo/components/select/select"
import type { RecordingEvent } from "@/modules/data-model/contracts/recording"
import type { RecordingStore } from "../../state/recording-store"
import { useStore } from "zustand"
import { eventTitle } from "../display"
import { useConfirmation } from "./Modal"
import PhotoLocationEditor from "./PhotoLocationEditor"

function SortablePhoto({
  id,
  index,
  busy,
  children,
}: {
  id: string
  index: number
  busy: boolean
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    disabled: busy,
    transition: { duration: reduced ? 0 : 220, easing: "ease", idle: false },
  })
  return (
    <section
      ref={ref}
      data-photo-id={id}
      className={`grid grid-cols-2 gap-2 rounded-xl border border-ink-10 bg-soft-white p-3 ${isDragging ? "shadow-periplus" : ""}`}
    >
      <div className="col-span-2 flex items-center justify-between">
        <span className="text-xs text-walnut">第 {index + 1} 张</span>
        <Button
          ref={handleRef}
          aria-label={`拖动照片 ${index + 1}`}
          variant="ghost"
          shape="square"
          size="sm"
          className="cursor-grab touch-none"
        >
          <GripVertical size={16} />
        </Button>
      </div>
      {children}
    </section>
  )
}
function Caption({
  photo,
  onSave,
  onDirty,
}: {
  photo: RecordingEvent["photos"][number]
  onSave: (caption: string) => Promise<void>
  onDirty: (id: string, dirty: boolean) => void
}) {
  const [value, setValue] = useState(photo.caption)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    onDirty(photo.assetId, value !== photo.caption)
    return () => onDirty(photo.assetId, false)
  }, [value, photo.caption, photo.assetId, onDirty])
  return (
    <form
      className="col-span-2 flex items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true)
        setError(null)
        try {
          await onSave(value)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "说明保存失败")
        } finally {
          setSaving(false)
        }
      }}
    >
      <Input
        className="w-full min-w-0"
        aria-label="照片说明"
        placeholder="为照片写一句描述"
        maxLength={MAX_RECORDING_PHOTO_CAPTION_LENGTH}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          onDirty(photo.assetId, event.target.value !== photo.caption)
        }}
      />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        loading={saving}
        disabled={value === photo.caption}
      >
        保存说明
      </Button>
      {error && (
        <p role="alert" className="text-xs text-coral">
          {error}
        </p>
      )}
    </form>
  )
}
export default function PhotoPanel({
  store,
  eventId,
  onDirtyChange,
  onClose,
}: {
  store: RecordingStore
  eventId: string
  onDirtyChange: (dirty: boolean) => void
  onClose: () => void
}) {
  const { journey, uploads } = useStore(store)
  const entry = journey!.events.find((event) => event.id === eventId)!
  const input = useRef<HTMLInputElement>(null)
  const drafts = useRef(new Set<string>())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { ask, confirmation } = useConfirmation()
  const report = useCallback(
    (id: string, dirty: boolean) => {
      if (dirty) drafts.current.add(id)
      else drafts.current.delete(id)
      onDirtyChange(drafts.current.size > 0)
    },
    [onDirtyChange]
  )
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "照片操作失败，请重试。"
      )
    } finally {
      setBusy(false)
    }
  }
  function setPhotos(
    transform: (event: RecordingEvent) => {
      photos: { assetId: string; caption: string }[]
      coverAssetId: string | null
    }
  ) {
    return store.getState().mutate((journey) => ({
      name: "photos.set",
      eventId,
      ...transform(journey.events.find((event) => event.id === eventId)!),
    }))
  }
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-black">整理照片</h3>
      <p className="text-sm leading-6 text-walnut">
        无定位照片也能添加。拖动把手调整顺序，移除只解除记录关联。
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          store
            .getState()
            .addFiles(eventId, Array.from(event.target.files || []))
          event.target.value = ""
        }}
      />
      <Button variant="primary" onClick={() => input.current?.click()}>
        <Camera size={17} />
        加照片
      </Button>
      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
      <DragDropProvider
        onDragEnd={(event) => {
          const source = event.operation.source
          if (
            event.canceled ||
            !isSortable(source) ||
            source.index === source.initialIndex
          )
            return
          const handle = source.handle
          const keyboard =
            event.operation.activatorEvent instanceof KeyboardEvent
          const from = source.initialIndex
          const to = source.index
          void run(() =>
            setPhotos((entry) => {
              const photos = [...entry.photos]
              const [moved] = photos.splice(from, 1)
              photos.splice(to, 0, moved)
              return {
                photos: photos.map(({ assetId, caption }) => ({
                  assetId,
                  caption,
                })),
                coverAssetId:
                  photos.find((photo) => photo.isCover)?.assetId || null,
              }
            })
          ).finally(() => {
            if (keyboard)
              requestAnimationFrame(
                () =>
                  handle instanceof HTMLElement &&
                  handle.focus({ preventScroll: true })
              )
          })
        }}
      >
        <div className="space-y-4">
          {entry.photos.map((photo, index) => (
            <SortablePhoto
              key={photo.assetId}
              id={photo.assetId}
              index={index}
              busy={busy}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.caption || `照片 ${index + 1}`}
                className="h-16 w-full rounded-lg object-cover"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || photo.isCover}
                onClick={() =>
                  void run(() =>
                    setPhotos((entry) => ({
                      photos: entry.photos.map(({ assetId, caption }) => ({
                        assetId,
                        caption,
                      })),
                      coverAssetId: photo.assetId,
                    }))
                  )
                }
              >
                {photo.isCover ? "当前封面" : "设为这段封面"}
              </Button>
              <Caption
                photo={photo}
                onDirty={report}
                onSave={async (caption) => {
                  await store.getState().mutate({
                    name: "photo.update",
                    eventId,
                    assetId: photo.assetId,
                    patch: { caption },
                  })
                }}
              />
              <div className="col-span-2">
                <PhotoLocationEditor
                  key={`${photo.assetId}:${JSON.stringify(photo.location)}`}
                  photo={photo}
                  entry={entry}
                  store={store}
                  onDirty={report}
                />
              </div>
              {journey!.events.length > 1 && (
                <Select
                  aria-label={`移动照片 ${index + 1} 到其他记录`}
                  placeholder="移动到其他记录…"
                  value={null}
                  disabled={busy}
                  items={journey!.events
                    .filter((event) => event.id !== eventId)
                    .map((event) => ({
                      value: event.id,
                      label: eventTitle(event),
                    }))}
                  onValueChange={async (target) => {
                    if (
                      target &&
                      (drafts.current.has(photo.assetId) ||
                        drafts.current.has(`${photo.assetId}:location`)) &&
                      !(await ask("这张照片有未保存的输入，仍然移动？"))
                    )
                      return
                    if (target)
                      void run(() =>
                        store.getState().mutate((journey) => ({
                          name: "photo.move",
                          assetId: photo.assetId,
                          fromEventId: eventId,
                          toEventId: target,
                          afterAssetId:
                            journey.events
                              .find((event) => event.id === target)
                              ?.photos.at(-1)?.assetId || null,
                        }))
                      )
                  }}
                />
              )}
              <Button
                variant="secondary-destructive"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  if (await ask("从这段记录移除照片？原素材会保留。"))
                    void run(() =>
                      setPhotos((entry) => ({
                        photos: entry.photos
                          .filter((item) => item.assetId !== photo.assetId)
                          .map(({ assetId, caption }) => ({
                            assetId,
                            caption,
                          })),
                        coverAssetId:
                          entry.photos.find(
                            (item) =>
                              item.isCover && item.assetId !== photo.assetId
                          )?.assetId || null,
                      }))
                    )
                }}
              >
                从记录中移除
              </Button>
            </SortablePhoto>
          ))}
        </div>
      </DragDropProvider>
      {uploads
        .filter((upload) => upload.eventId === eventId)
        .map((upload) => (
          <section
            key={upload.id}
            className="space-y-3 rounded-xl border border-dashed border-ink-20 p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={upload.preview}
              alt={upload.name}
              className="h-20 w-full rounded-lg object-cover opacity-70"
            />
            <p role="status" className="text-sm text-walnut">
              {upload.status === "uploading" ? "正在上传…" : "这张照片尚未保存"}
            </p>
            {upload.error && (
              <p className="text-xs text-coral">{upload.error}</p>
            )}
            {upload.status === "failed" && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => store.getState().retryUpload(upload.id)}
                >
                  <RefreshCw size={15} />
                  重试
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => store.getState().discardUpload(upload.id)}
                >
                  <X size={15} />
                  取消这张
                </Button>
              </div>
            )}
          </section>
        ))}
      {!entry.photos.length &&
        !uploads.some((upload) => upload.eventId === eventId) && (
          <p className="py-8 text-center text-sm text-walnut">
            还没有照片，选几张留下这段经历。
          </p>
        )}
      <div className="flex justify-end">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          完成
        </Button>
      </div>
      {confirmation}
    </div>
  )
}
