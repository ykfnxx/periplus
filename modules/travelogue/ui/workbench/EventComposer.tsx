"use client"
import { useEffect, useRef } from "react"
import { CalendarDays, ChevronRight, MapPin, Plus, X } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { InputArea } from "@/components/kumo/components/input/input-area"
import type {
  RecordingEventContent,
  RecordingPhoto,
} from "@/modules/data-model/contracts/recording"
import { dateLabel } from "../display"
import type { RecordUpload } from "../../state/recording-store"

function FilePreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    if (image.current) image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={image} alt={file.name} className="h-full w-full object-cover" />
  )
}

export default function EventComposer({
  draft,
  files,
  photos,
  uploads,
  busy,
  onChange,
  onFiles,
  onPickLocation,
  onManagePhotos,
}: {
  draft: RecordingEventContent
  files: File[]
  photos: RecordingPhoto[]
  uploads: RecordUpload[]
  busy: boolean
  onChange: (draft: RecordingEventContent) => void
  onFiles: (files: File[]) => void
  onPickLocation: () => void
  onManagePhotos?: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="px-6 pb-8 md:px-9">
      <InputArea
        autoResize
        minRows={3}
        aria-label="记录正文"
        placeholder="这一刻，有什么想记下来？"
        value={draft.body}
        maxLength={100_000}
        disabled={busy}
        onChange={(event) => onChange({ ...draft, body: event.target.value })}
        className="mt-4 w-full border-0 bg-transparent! p-0! text-base text-journal-ink ring-0! outline-none placeholder:text-journal-muted focus:ring-0!"
      />
      {(photos.length > 0 || uploads.length > 0 || files.length > 0) && (
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          {photos.map((photo, index) => (
            <button
              key={photo.assetId}
              type="button"
              aria-label={`整理照片 ${index + 1}`}
              disabled={busy}
              onClick={onManagePhotos}
              className="aspect-square overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-russet"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.caption || `照片 ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="relative aspect-square overflow-hidden rounded-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={upload.preview}
                alt={upload.name}
                className="h-full w-full object-cover opacity-60"
              />
              <button
                type="button"
                className="absolute inset-x-0 bottom-0 bg-ink-70 p-1 text-xs text-white"
                onClick={onManagePhotos}
              >
                {upload.status === "failed" ? "上传失败，点击重试" : "上传中…"}
              </button>
            </div>
          ))}
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="relative aspect-square overflow-hidden rounded-md"
            >
              <FilePreview file={file} />
              <Button
                aria-label={`移除待上传照片 ${file.name}`}
                variant="secondary"
                shape="circle"
                size="xs"
                disabled={busy}
                className="absolute top-1 right-1"
                onClick={() => onFiles(files.filter((_, i) => i !== index))}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="mt-3 mb-4 gap-2! px-0! text-journal-muted!"
      >
        <Plus size={18} />
        添加照片
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          onFiles([...files, ...Array.from(event.target.files || [])])
          event.target.value = ""
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={onPickLocation}
        className="flex min-h-14 w-full items-center gap-3 border-t border-ink-10 text-left text-sm text-walnut focus-visible:outline-2 focus-visible:outline-russet"
      >
        <MapPin size={17} strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate">
          {draft.location?.name || "添加地点"}
        </span>
        <ChevronRight size={15} className="text-walnut-50" />
      </button>
      <label className="relative flex min-h-14 items-center gap-3 border-t border-ink-10 text-sm text-walnut">
        <CalendarDays size={17} strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          {draft.date ? dateLabel(draft.date) : "添加日期"}
        </span>
        <input
          type="date"
          aria-label="记录日期"
          value={draft.date || ""}
          disabled={busy}
          onChange={(event) =>
            onChange({
              ...draft,
              date: event.target.value || null,
              ...(!event.target.value ? { time: null, timeZone: null } : {}),
            })
          }
          className="absolute inset-y-0 right-9 left-7 min-w-0 cursor-pointer opacity-0"
        />
        {draft.date && (
          <Button
            aria-label="清除日期"
            variant="ghost"
            shape="circle"
            size="xs"
            disabled={busy}
            onClick={() =>
              onChange({ ...draft, date: null, time: null, timeZone: null })
            }
          >
            <X size={14} />
          </Button>
        )}
      </label>
    </div>
  )
}
