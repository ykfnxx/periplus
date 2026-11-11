"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronRight, MapPin, Plus, X } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import { InputArea } from "@/components/kumo/components/input/input-area"
import type { EventPhoto } from "@/modules/data-model/contracts"
import type { RecordUpload } from "../../state/recording-store"
import {
  eventLocalDateTime,
  eventTimeInstant,
  type EventDraft,
} from "../event-content"

const TRANSPORT_MODES = [
  ["WALK", "步行"],
  ["BUS", "公交"],
  ["SUBWAY", "地铁"],
  ["TRAIN", "火车"],
  ["FLIGHT", "飞机"],
  ["CAR", "驾车"],
  ["TAXI", "出租车"],
  ["RENTAL", "租车"],
] as const

function FilePreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    if (image.current) image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      alt={file.name}
      draggable={false}
      className="h-full w-full object-cover"
    />
  )
}

export default function EventComposer({
  draft,
  files,
  photos,
  uploads,
  busy,
  filesBusy = busy,
  onChange,
  onFiles,
  onPickLocation,
  onPickTransitLocation,
  onManagePhotos,
  canPickLocation = true,
}: {
  draft: EventDraft
  files: File[]
  photos: EventPhoto[]
  uploads: RecordUpload[]
  busy: boolean
  filesBusy?: boolean
  onChange: (draft: EventDraft) => void
  onFiles: (files: File[]) => void
  onPickLocation: () => void
  onPickTransitLocation?: (which: "from" | "to") => void
  onManagePhotos?: () => void
  canPickLocation?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const zone =
    draft.timeZone ||
    (draft.startAt || draft.endAt
      ? "UTC"
      : Intl.DateTimeFormat().resolvedOptions().timeZone)
  const start = eventLocalDateTime(draft.startAt, zone)

  function startTime(date: string, time: string) {
    onChange({
      ...draft,
      date,
      time: time || null,
      timeZone: zone,
      startAt: date && time ? eventTimeInstant(`${date}T${time}`, zone) : null,
    })
  }

  function reorderFiles(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= files.length) return
    const next = [...files]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onFiles(next)
    setDragIndex(to)
  }

  const isTransit = draft.category === "TRANSIT"

  return (
    <div className="journal-composer-body space-y-4">
      <fieldset className="flex flex-wrap gap-1.5" disabled={busy}>
        <legend className="sr-only">事件类型</legend>
        {(
          [
            ["VISIT", "游览"],
            ["MEAL", "用餐"],
            ["STAY", "住宿"],
            ["TRANSIT", "交通"],
          ] as const
        ).map(([value, label]) => {
          const active = draft.category === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={() =>
                onChange({
                  ...draft,
                  category: value,
                  title: value === "TRANSIT" ? "" : draft.title,
                  transit:
                    value === "TRANSIT"
                      ? draft.transit || {
                          fromName: "",
                          toName: "",
                          transportMode: "TRAIN",
                        }
                      : null,
                })
              }
              className={`h-8 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                active
                  ? value === "TRANSIT"
                    ? "border-journal-transit-ink bg-journal-transit-ink text-white"
                    : "border-journal-ink bg-journal-ink text-white"
                  : value === "TRANSIT"
                    ? "border-journal-transit-line bg-journal-transit text-journal-transit-accent"
                    : "border-journal-line bg-journal-card text-journal-muted hover:text-journal-ink"
              }`}
            >
              {label}
            </button>
          )
        })}
      </fieldset>

      {isTransit ? (
        <div className="space-y-3.5 rounded-2xl border border-journal-transit-line bg-journal-transit p-3.5">
          <div
            role="group"
            aria-label="交通方式"
            className="flex flex-wrap gap-1.5"
          >
            {TRANSPORT_MODES.map(([value, label]) => {
              const active =
                (draft.transit?.transportMode || "TRAIN") === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() =>
                    onChange({
                      ...draft,
                      transit: {
                        ...draft.transit,
                        transportMode: value,
                      },
                    })
                  }
                  className={`h-7 rounded-full border px-2.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-journal-transit-ink bg-journal-transit-ink text-white"
                      : "border-journal-transit-chip-line bg-journal-transit-chip text-journal-transit-ink"
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-xl border border-journal-transit-chip-line bg-journal-transit-chip p-2.5">
              <div className="flex items-center justify-between gap-1">
                <label
                  htmlFor="transit-from-input"
                  className="text-xs font-semibold text-journal-transit-ink"
                >
                  出发地
                </label>
                {canPickLocation && onPickTransitLocation && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPickTransitLocation("from")}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-journal-transit-accent hover:bg-journal-transit"
                  >
                    <MapPin size={12} />
                    {draft.transit?.fromLocation?.coordinates
                      ? "已选坐标"
                      : "选点"}
                  </button>
                )}
              </div>
              <input
                id="transit-from-input"
                aria-label="出发地"
                placeholder="例如：杭州东站"
                value={draft.transit?.fromName || ""}
                disabled={busy}
                required
                onChange={(e) =>
                  onChange({
                    ...draft,
                    transit: {
                      ...draft.transit,
                      fromName: e.target.value,
                      ...(draft.transit?.fromLocation
                        ? {
                            fromLocation: {
                              ...draft.transit.fromLocation,
                              name: e.target.value || "出发地",
                            },
                          }
                        : {}),
                    },
                  })
                }
                className="w-full bg-transparent font-editorial text-sm font-bold text-journal-transit-ink outline-none placeholder:font-sans placeholder:font-normal placeholder:text-journal-transit-muted"
              />
            </div>

            <div className="space-y-1.5 rounded-xl border border-journal-transit-chip-line bg-journal-transit-chip p-2.5">
              <div className="flex items-center justify-between gap-1">
                <label
                  htmlFor="transit-to-input"
                  className="text-xs font-semibold text-journal-transit-ink"
                >
                  目的地
                </label>
                {canPickLocation && onPickTransitLocation && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPickTransitLocation("to")}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-journal-transit-accent hover:bg-journal-transit"
                  >
                    <MapPin size={12} />
                    {draft.transit?.toLocation?.coordinates
                      ? "已选坐标"
                      : "选点"}
                  </button>
                )}
              </div>
              <input
                id="transit-to-input"
                aria-label="目的地"
                placeholder="例如：上海虹桥站"
                value={draft.transit?.toName || ""}
                disabled={busy}
                required
                onChange={(e) =>
                  onChange({
                    ...draft,
                    transit: {
                      ...draft.transit,
                      toName: e.target.value,
                      ...(draft.transit?.toLocation
                        ? {
                            toLocation: {
                              ...draft.transit.toLocation,
                              name: e.target.value || "目的地",
                            },
                          }
                        : {}),
                    },
                  })
                }
                className="w-full bg-transparent font-editorial text-sm font-bold text-journal-transit-ink outline-none placeholder:font-sans placeholder:font-normal placeholder:text-journal-transit-muted"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Input
              label="班次 / 线路"
              placeholder="例如：7路 / G7302"
              value={draft.transit?.line || ""}
              disabled={busy}
              maxLength={120}
              onChange={(e) =>
                onChange({
                  ...draft,
                  transit: {
                    ...draft.transit,
                    line: e.target.value || null,
                  },
                })
              }
            />
            <Input
              label="耗时"
              placeholder="例如：40 分钟"
              value={draft.transit?.durationText || ""}
              disabled={busy}
              maxLength={60}
              onChange={(e) =>
                onChange({
                  ...draft,
                  transit: {
                    ...draft.transit,
                    durationText: e.target.value || null,
                  },
                })
              }
            />
          </div>

          <Input
            label="距离（公里）"
            type="number"
            min="0"
            step="0.001"
            value={
              draft.transit?.distanceMeters == null
                ? ""
                : draft.transit.distanceMeters / 1000
            }
            disabled={busy}
            onChange={(e) =>
              onChange({
                ...draft,
                transit: {
                  ...draft.transit,
                  distanceMeters:
                    e.target.value === ""
                      ? null
                      : Number(e.target.value) * 1000,
                },
              })
            }
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-journal-line bg-journal-card p-3.5 shadow-journal-card">
          <Input
            aria-label="记录标题"
            placeholder="标题"
            value={draft.title}
            maxLength={200}
            disabled={busy}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
          />
          <InputArea
            autoResize
            minRows={3}
            aria-label="记录正文"
            placeholder="写下此刻…"
            value={draft.body}
            maxLength={100_000}
            disabled={busy}
            onChange={(event) =>
              onChange({ ...draft, body: event.target.value })
            }
            className="mt-3 w-full border-0 bg-transparent! p-0! text-sm text-journal-ink ring-0! outline-none placeholder:text-journal-muted focus:ring-0!"
          />
        </div>
      )}

      {isTransit && (
        <div className="rounded-2xl border border-journal-line bg-journal-card p-3.5 shadow-journal-card">
          <InputArea
            autoResize
            minRows={2}
            aria-label="记录正文"
            placeholder="记下一句旅途小记…"
            value={draft.body}
            maxLength={100_000}
            disabled={busy}
            onChange={(event) =>
              onChange({ ...draft, body: event.target.value })
            }
            className="w-full border-0 bg-transparent! p-0! text-sm text-journal-ink ring-0! outline-none placeholder:text-journal-muted focus:ring-0!"
          />
        </div>
      )}

      <div className="rounded-2xl border border-journal-line bg-journal-card p-3.5 shadow-journal-card">
        {(photos.length > 0 || uploads.length > 0 || files.length > 0) && (
          <div className="mb-3 grid grid-cols-3 gap-2">
            {photos.map((photo, index) => (
              <button
                key={photo.assetId}
                type="button"
                aria-label={`整理照片 ${index + 1}`}
                disabled={busy}
                onClick={onManagePhotos}
                className="relative aspect-square overflow-hidden rounded-xl border border-journal-line focus-visible:outline-2 focus-visible:outline-journal-amber"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`照片 ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                {photo.isCover && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-ink-70 px-1.5 py-0.5 text-xs text-white">
                    封面
                  </span>
                )}
              </button>
            ))}
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="relative aspect-square overflow-hidden rounded-xl border border-journal-line"
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
                  {upload.status === "failed"
                    ? "上传失败，点击重试"
                    : "上传中…"}
                </button>
              </div>
            ))}
            {files.map((file, index) => (
              <div
                key={`${file.name}-${file.lastModified}-${index}`}
                draggable={!filesBusy && files.length > 1}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (dragIndex !== null && dragIndex !== index)
                    reorderFiles(dragIndex, index)
                }}
                onDragEnd={() => setDragIndex(null)}
                className={`relative aspect-square overflow-hidden rounded-xl border border-journal-line ${
                  !filesBusy && files.length > 1
                    ? "cursor-grab active:cursor-grabbing"
                    : ""
                }`}
              >
                <FilePreview file={file} />
                {photos.length === 0 && index === 0 && (
                  <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-ink-70 px-1.5 py-0.5 text-xs text-white">
                    封面
                  </span>
                )}
                <Button
                  aria-label={`移除待上传照片 ${file.name}`}
                  variant="secondary"
                  shape="circle"
                  size="xs"
                  disabled={filesBusy}
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
          disabled={filesBusy}
          onClick={() => input.current?.click()}
          className="gap-2! px-0! text-journal-muted!"
        >
          <Plus size={17} />
          添加照片
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={filesBusy}
          onChange={(event) => {
            onFiles([...files, ...Array.from(event.target.files || [])])
            event.target.value = ""
          }}
        />
      </div>

      {!isTransit && (
        <button
          type="button"
          disabled={busy || !canPickLocation}
          onClick={onPickLocation}
          className="flex min-h-12 w-full items-center gap-2.5 rounded-2xl border border-journal-line bg-journal-card px-3.5 text-left text-sm text-journal-ink shadow-journal-card focus-visible:outline-2 focus-visible:outline-journal-amber disabled:opacity-60"
        >
          <MapPin size={16} className="shrink-0 text-journal-amber" />
          <span className="min-w-0 flex-1 truncate">
            {draft.location?.name || "添加地点"}
          </span>
          <ChevronRight size={15} className="text-journal-muted" />
        </button>
      )}

      <div className="space-y-3 rounded-2xl border border-journal-line bg-journal-card p-3.5 text-sm shadow-journal-card">
        <Input
          label="事件日期"
          type="date"
          required
          value={draft.date || ""}
          disabled={busy}
          onChange={(e) =>
            startTime(e.target.value, draft.time || start.slice(11, 16))
          }
        />
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Input
            label={isTransit ? "出发时间" : "开始时间"}
            type="time"
            value={draft.time || start.slice(11, 16)}
            disabled={busy}
            onChange={(e) => startTime(draft.date || "", e.target.value)}
          />
          <Input
            label={isTransit ? "到达日期与时间" : "结束时间（选填）"}
            type="datetime-local"
            value={eventLocalDateTime(draft.endAt, zone)}
            disabled={busy}
            onChange={(e) =>
              onChange({
                ...draft,
                endAt: e.target.value
                  ? eventTimeInstant(e.target.value, zone)
                  : null,
              })
            }
          />
        </div>
      </div>
    </div>
  )
}
