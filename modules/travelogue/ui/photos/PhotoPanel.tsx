"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { useReducedMotion } from "motion/react"
import { DragDropProvider, PointerSensor, KeyboardSensor } from "@dnd-kit/react"
import { PointerActivationConstraints } from "@dnd-kit/dom"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import { ArrowLeft, Camera, GripVertical, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Select } from "@/components/kumo/components/select/select"
import type { JourneySnapshot } from "@/modules/data-model/contracts/index"
import { eventTitle } from "../formatting/display"
import { useConfirmation } from "@/components/ui/Modal"
import PhotoLocationEditor from "./PhotoLocationEditor"
import FilePreview from "./FilePreview"
import UserSource from "../workbench/UserSource"

import type { RecordUpload, PhotoActions } from "../../contracts"

const photoSensors = [
  PointerSensor.configure({
    activationConstraints: [
      new PointerActivationConstraints.Distance({ value: 6 }),
    ],
    activatorElements: (source) => [source.element],
    preventActivation(event, source) {
      return (
        (event.target instanceof Element &&
          !!event.target.closest(
            "button:not([data-photo-drag-handle]), input, select, [role=combobox]"
          )) ||
        !!PointerSensor.defaults.preventActivation?.(event, source)
      )
    },
  }),
  KeyboardSensor,
]

function SortablePhoto({
  id,
  index,
  isCover,
  busy,
  canSort,
  children,
}: {
  id: string
  index: number
  isCover: boolean
  busy: boolean
  canSort: boolean
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    disabled: busy || !canSort,
    transition: {
      duration: reduced ? 0 : 220,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      idle: false,
    },
  })
  return (
    <section
      ref={canSort ? ref : undefined}
      data-photo-id={id}
      className={`space-y-2.5 rounded-2xl border border-journal-line bg-journal-card p-3 shadow-journal-card ${
        canSort && !busy ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-75 shadow-periplus" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-journal-muted tabular-nums">
            {index + 1}
          </span>
          {isCover && (
            <span className="rounded-full bg-journal-chip px-2 py-0.5 text-xs font-medium text-journal-amber">
              封面
            </span>
          )}
        </div>
        {canSort && (
          <Button
            ref={handleRef}
            data-photo-drag-handle=""
            aria-label={`拖动照片 ${index + 1}`}
            variant="ghost"
            shape="square"
            size="sm"
            className="size-7! cursor-grab touch-none text-journal-muted!"
          >
            <GripVertical size={15} />
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}

export default function PhotoPanel({
  journey,
  uploads,
  actions,
  revisionNotice,
  eventId,
  onDirtyChange,
  onClose,
  subpage = false,
}: {
  journey: JourneySnapshot
  uploads: RecordUpload[]
  actions: PhotoActions
  revisionNotice: ReactNode
  eventId: string
  onDirtyChange: (dirty: boolean) => void
  onClose: () => void
  subpage?: boolean
}) {
  const entry = journey!.events.find((event) => event.id === eventId)!
  const canSort = journey?.role === "OWNER"
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

  const body = (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        {!subpage && (
          <h3 className="font-editorial text-lg font-bold text-journal-ink">
            整理照片
          </h3>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            actions.add(Array.from(event.target.files || []))
            event.target.value = ""
          }}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => input.current?.click()}
        >
          <Camera size={15} />
          加照片
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
      {revisionNotice}

      <DragDropProvider
        sensors={photoSensors}
        onDragEnd={(event) => {
          const source = event.operation.source
          if (
            event.canceled ||
            !canSort ||
            !isSortable(source) ||
            source.index === source.initialIndex
          )
            return
          const handle = source.handle
          const keyboard =
            event.operation.activatorEvent instanceof KeyboardEvent
          const from = source.initialIndex
          const to = source.index
          void run(() => actions.reorder(from, to)).finally(() => {
            if (keyboard)
              requestAnimationFrame(
                () =>
                  handle instanceof HTMLElement &&
                  handle.focus({ preventScroll: true })
              )
          })
        }}
      >
        <div className="space-y-3">
          {entry.photos.map((photo, index) => (
            <SortablePhoto
              key={photo.assetId}
              id={photo.assetId}
              index={index}
              isCover={photo.isCover}
              busy={busy}
              canSort={canSort}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`照片 ${index + 1}`}
                draggable={false}
                className="aspect-[16/10] w-full rounded-xl object-cover"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {photo.source && (
                  <UserSource
                    user={photo.source}
                    className="text-journal-muted"
                  />
                )}
                {canSort && !photo.isCover && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => actions.cover(photo.assetId))}
                  >
                    设为封面
                  </Button>
                )}
              </div>
              {photo.canEdit === true ? (
                <PhotoLocationEditor
                  key={`${photo.assetId}:${JSON.stringify(photo.location)}`}
                  photo={photo}
                  entry={entry}
                  onSave={(location) =>
                    actions.location(photo.assetId, location)
                  }
                  onDirty={report}
                />
              ) : (
                <div className="text-xs text-journal-muted">
                  {photo.location?.name || entry.location?.name || "未添加地点"}
                </div>
              )}
              {photo.canEdit === true && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {journey!.events.length > 1 && (
                    <div className="min-w-44 flex-1">
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
                              drafts.current.has(
                                `${photo.assetId}:location`
                              )) &&
                            !(await ask("这张照片有未保存的输入，仍然移动？"))
                          )
                            return
                          if (target)
                            void run(() => actions.move(photo.assetId, target))
                        }}
                      />
                    </div>
                  )}
                  <Button
                    variant="secondary-destructive"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      if (await ask("从这段记录移除照片？原素材会保留。"))
                        void run(() => actions.remove(photo.assetId))
                    }}
                  >
                    从记录中移除
                  </Button>
                </div>
              )}
            </SortablePhoto>
          ))}
        </div>
      </DragDropProvider>

      {uploads
        .filter((upload) => upload.eventId === eventId)
        .map((upload) => (
          <section
            key={upload.id}
            className="space-y-2.5 rounded-2xl border border-dashed border-journal-line bg-journal-card p-3"
          >
            <FilePreview
              file={upload.file}
              className="h-24 w-full rounded-xl object-cover opacity-70"
            />
            <p role="status" className="text-xs text-journal-muted">
              {upload.status === "uploading" ? "正在上传…" : "这张照片尚未保存"}
            </p>
            {upload.error && (
              <p className="text-xs text-coral">{upload.error}</p>
            )}
            {upload.status === "failed" && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => actions.retry(upload.id)}
                >
                  <RefreshCw size={14} />
                  重试
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => actions.discard(upload.id)}
                >
                  <X size={14} />
                  取消这张
                </Button>
              </div>
            )}
          </section>
        ))}

      {!entry.photos.length &&
        !uploads.some((upload) => upload.eventId === eventId) && (
          <div className="rounded-2xl border border-journal-line bg-journal-card py-8 text-center text-sm text-journal-muted">
            还没有照片
          </div>
        )}

      {!subpage && (
        <div className="flex justify-end">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            完成
          </Button>
        </div>
      )}
      {confirmation}
    </div>
  )

  if (!subpage) return body
  return (
    <section className="journal-subpage" aria-label="整理照片">
      <header className="journal-subpage-header sticky top-0 z-10">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            shape="square"
            aria-label="返回"
            disabled={busy}
            onClick={onClose}
          >
            <ArrowLeft size={16} />
          </Button>
          <h2 className="truncate font-editorial text-lg font-bold">
            整理照片
          </h2>
        </div>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
          完成
        </Button>
      </header>
      <div className="journal-subpage-body">{body}</div>
    </section>
  )
}
