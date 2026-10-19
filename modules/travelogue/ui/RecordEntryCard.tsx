"use client"

import type { DragEventHandler } from "react"
import type { RecordingEvent } from "@/modules/data-model/contracts/recording"
import { eventTitle } from "./display"
import {
  Camera,
  Clock3,
  GripVertical,
  MapPin,
  MoreHorizontal,
  Pencil,
} from "lucide-react"

export type RecordEntry = RecordingEvent

export default function RecordEntryCard({
  entry,
  readOnly = false,
  selected,
  busy,
  onSelect,
  onEdit,
  onLocation,
  onPhotos,
  onPhotoOpen,
  onMore,
  onDragStart,
  onDrop,
}: {
  entry: RecordEntry
  readOnly?: boolean
  selected?: boolean
  busy?: boolean
  onSelect: () => void
  onEdit: () => void
  onLocation: () => void
  onPhotos: () => void
  onPhotoOpen: (index: number) => void
  onMore: () => void
  onDragStart: DragEventHandler<HTMLButtonElement>
  onDrop: DragEventHandler<HTMLElement>
}) {
  return (
    <article
      id={`record-${entry.id}`}
      tabIndex={-1}
      onFocus={onSelect}
      onClick={onSelect}
      onDragOver={(event) => {
        if (!readOnly) event.preventDefault()
      }}
      onDrop={onDrop}
      className={`scroll-mt-28 rounded-2xl border bg-white p-5 outline-none md:p-6 ${selected ? "border-russet/30" : "border-ink-5"}`}
    >
      <div className="mb-3 flex items-start gap-3">
        {!readOnly ? (
          <button
            type="button"
            draggable={!busy}
            onDragStart={onDragStart}
            aria-label={`拖动${eventTitle(entry)}`}
            title="拖动排序，也可从更多中选择移动位置"
            className="hidden cursor-grab rounded p-1 text-teak active:cursor-grabbing lg:block"
          >
            <GripVertical size={20} />
          </button>
        ) : null}
        <h3 className="min-w-0 flex-1 text-xl leading-8 font-black md:text-2xl">
          {readOnly ? (
            eventTitle(entry)
          ) : (
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              className="text-left hover:text-russet"
            >
              {eventTitle(entry)}
            </button>
          )}
        </h3>
        {!readOnly ? (
          <button
            type="button"
            onClick={onMore}
            disabled={busy}
            aria-label={`${eventTitle(entry)}的更多操作`}
            className="rounded-full p-2 text-teak hover:bg-ink-5"
          >
            <MoreHorizontal size={20} />
          </button>
        ) : null}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-teak md:pl-9 md:text-sm">
        <span className="inline-flex items-center gap-2">
          <Clock3 size={16} />
          {entry.time || "时间待补"}
        </span>
        <span aria-hidden="true" className="h-4 border-l border-ink-15" />
        {readOnly ? (
          entry.location ? (
            <span className="inline-flex items-center gap-2">
              <MapPin size={16} />
              {entry.location.name}
            </span>
          ) : (
            <span>地点待补</span>
          )
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onLocation}
            className={`inline-flex min-h-7 items-center gap-2 rounded-lg ${entry.location ? "hover:text-russet" : "border border-dashed border-russet/40 px-2"}`}
          >
            <MapPin size={16} />
            {entry.location?.name || "补充地点"}
          </button>
        )}
      </div>
      {entry.body ? (
        <p className="mb-4 text-base leading-8 whitespace-pre-wrap text-ink md:pl-9">
          {entry.body}
        </p>
      ) : null}
      {entry.photos.length ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {entry.photos.map((photo, index) => (
            <button
              key={photo.assetId}
              type="button"
              onClick={() => onPhotoOpen(index)}
              className="overflow-hidden rounded-xl bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-russet"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.caption || `${eventTitle(entry)}的照片 ${index + 1}`}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              {photo.caption ? (
                <span className="block p-2 text-left text-xs leading-5 text-walnut">
                  {photo.caption}
                </span>
              ) : null}
            </button>
          ))}
          {!readOnly ? (
            <button
              type="button"
              onClick={onPhotos}
              disabled={busy}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-20 text-sm text-walnut hover:border-russet md:hidden"
            >
              <Camera size={23} strokeWidth={1.5} />
              添加照片
            </button>
          ) : null}
        </div>
      ) : null}
      {!readOnly ? (
        <div className="mt-4 flex divide-x divide-ink-10 border-t border-ink-10 pt-3 text-sm text-teak">
          <button
            type="button"
            onClick={onPhotos}
            disabled={busy}
            className="hidden min-h-10 flex-1 items-center justify-center gap-2 hover:text-russet md:inline-flex"
          >
            <Camera size={19} />
            加照片
          </button>
          <button
            type="button"
            onClick={onLocation}
            disabled={busy}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 hover:text-russet"
          >
            <MapPin size={19} />
            {entry.location ? "改地点" : "补充地点"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 hover:text-russet md:hidden"
          >
            <Pencil size={18} />
            补充信息
          </button>
          <button
            type="button"
            onClick={onMore}
            disabled={busy}
            className="hidden min-h-10 flex-1 items-center justify-center gap-2 hover:text-russet md:inline-flex"
          >
            <MoreHorizontal size={19} />
            更多
          </button>
        </div>
      ) : null}
    </article>
  )
}
