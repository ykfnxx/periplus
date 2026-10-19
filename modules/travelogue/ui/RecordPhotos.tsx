"use client"

import { useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Camera, RefreshCw, X } from "lucide-react"
import RecordDialog from "./RecordDialog"
import { RecordButton, RecordError, recordInputClass } from "./primitives"

export interface RecordUpload {
  id: string
  eventId: string
  preview: string
  name: string
  status: "uploading" | "failed"
  error?: string
}

function PhotoCaption({
  caption,
  onSave,
}: {
  caption: string
  onSave: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(caption)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
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
      className="space-y-2"
    >
      <input
        aria-label="照片说明"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="为照片写一句说明"
        className={recordInputClass}
      />
      <button
        type="submit"
        disabled={saving || value === caption}
        className="min-h-9 text-xs font-bold text-russet disabled:text-walnut/50"
      >
        {saving ? "保存中…" : "保存说明"}
      </button>
      <RecordError message={error} />
    </form>
  )
}

export default function RecordPhotos({
  title,
  photos,
  uploads,
  eventId,
  events,
  onFiles,
  onRetry,
  onDiscard,
  onCaption,
  onReorder,
  onMove,
  onUnlink,
  onClose,
}: {
  title: string
  photos: { assetId: string; url: string; caption?: string | null }[]
  uploads: RecordUpload[]
  eventId: string
  events: { id: string; title: string }[]
  onFiles: (files: File[]) => void
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
  onCaption: (id: string, caption: string) => Promise<void>
  onReorder: (ids: string[]) => Promise<void>
  onMove: (id: string, targetEventId: string) => Promise<void>
  onUnlink: (id: string) => Promise<void>
  onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<void>) {
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
  function reorder(index: number, offset: number) {
    const ids = photos.map((photo) => photo.assetId)
    ;[ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]
    void run(() => onReorder(ids))
  }
  return (
    <RecordDialog
      title={`${title} · 照片`}
      onClose={() => {
        if (!busy) onClose()
      }}
      wide
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-walnut">
          无定位照片也能添加，移除只解除这段记录的关联。
        </p>
        <RecordButton primary onClick={() => input.current?.click()}>
          <Camera size={18} />
          加照片
        </RecordButton>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            onFiles(Array.from(event.target.files || []))
            event.target.value = ""
          }}
        />
      </div>
      <RecordError message={error} />
      <div className="mt-4 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
        {photos.map((photo, index) => (
          <section
            key={photo.assetId}
            className="space-y-3 rounded-xl border border-ink-10 p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.caption || `照片 ${index + 1}`}
              className="aspect-[4/3] w-full rounded-lg object-cover"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-walnut">第 {index + 1} 张</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={`照片 ${index + 1} 前移`}
                  onClick={() => reorder(index, -1)}
                  disabled={busy || index === 0}
                  className="rounded p-2 hover:bg-cream disabled:opacity-30"
                >
                  <ArrowLeft size={17} />
                </button>
                <button
                  type="button"
                  aria-label={`照片 ${index + 1} 后移`}
                  onClick={() => reorder(index, 1)}
                  disabled={busy || index === photos.length - 1}
                  className="rounded p-2 hover:bg-cream disabled:opacity-30"
                >
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
            <PhotoCaption
              caption={photo.caption || ""}
              onSave={(caption) => onCaption(photo.assetId, caption)}
            />
            {events.length > 1 ? (
              <select
                aria-label={`移动照片 ${index + 1} 到其他记录`}
                defaultValue=""
                disabled={busy}
                onChange={(event) => {
                  const id = event.target.value
                  event.target.value = ""
                  if (id) void run(() => onMove(photo.assetId, id))
                }}
                className={recordInputClass}
              >
                <option value="">移动到其他记录…</option>
                {events
                  .filter((event) => event.id !== eventId)
                  .map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
              </select>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("从这段记录移除照片？原素材会保留。"))
                  void run(() => onUnlink(photo.assetId))
              }}
              className="min-h-9 text-xs font-bold text-coral"
            >
              从记录中移除
            </button>
          </section>
        ))}
        {uploads.map((upload) => (
          <section
            key={upload.id}
            className="relative space-y-3 rounded-xl border border-dashed border-ink-20 p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={upload.preview}
              alt={upload.name}
              className="aspect-[4/3] w-full rounded-lg object-cover opacity-70"
            />
            <p role="status" className="text-sm font-bold text-walnut">
              {upload.status === "uploading" ? "正在上传…" : "这张照片尚未保存"}
            </p>
            {upload.error ? (
              <p className="text-xs leading-5 text-coral">{upload.error}</p>
            ) : null}
            {upload.status === "failed" ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => onRetry(upload.id)}
                  className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-russet"
                >
                  <RefreshCw size={15} />
                  重试
                </button>
                <button
                  type="button"
                  onClick={() => onDiscard(upload.id)}
                  className="inline-flex min-h-10 items-center gap-1 text-sm text-walnut"
                >
                  <X size={15} />
                  取消这张
                </button>
              </div>
            ) : null}
          </section>
        ))}
      </div>
      {!photos.length && !uploads.length ? (
        <div className="py-12 text-center text-sm text-walnut">
          还没有照片，选几张留下这段经历。
        </div>
      ) : null}
      <div className="mt-6 flex justify-end">
        <RecordButton onClick={onClose} disabled={busy}>
          完成
        </RecordButton>
      </div>
    </RecordDialog>
  )
}
