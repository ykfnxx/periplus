"use client"

import { useState } from "react"
import RecordDialog from "./RecordDialog"
import {
  RecordButton,
  RecordError,
  RecordField,
  recordInputClass,
} from "./primitives"

export default function RecordActions({
  eventId,
  title,
  events,
  onMove,
  onDelete,
  onEdit,
  onPhotos,
  onClose,
}: {
  eventId: string
  title: string
  events: { id: string; title: string }[]
  onMove: (afterEventId: string | null) => Promise<void>
  onDelete: () => Promise<void>
  onEdit: () => void
  onPhotos: () => void
  onClose: () => void
}) {
  const currentIndex = events.findIndex((event) => event.id === eventId)
  const [afterId, setAfterId] = useState(
    currentIndex > 0 ? events[currentIndex - 1].id : ""
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。")
      setBusy(false)
    }
  }
  return (
    <RecordDialog
      title={title}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <RecordButton onClick={onEdit} disabled={busy}>
            编辑文字和时间
          </RecordButton>
          <RecordButton onClick={onPhotos} disabled={busy}>
            整理照片
          </RecordButton>
        </div>
        <div className="border-t border-ink-10 pt-4">
          <RecordField label="移动到">
            <select
              value={afterId}
              onChange={(event) => setAfterId(event.target.value)}
              disabled={busy}
              className={recordInputClass}
            >
              <option value="">旅程开头</option>
              {events
                .filter((event) => event.id !== eventId)
                .map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}之后
                  </option>
                ))}
            </select>
          </RecordField>
          <p className="mt-2 text-xs leading-5 text-walnut">
            只调整记录顺序，日期和内容保持原样。
          </p>
          <RecordButton
            onClick={() => void run(() => onMove(afterId || null))}
            disabled={busy}
            className="mt-3 w-full"
          >
            移动记录
          </RecordButton>
        </div>
        <RecordError message={error} />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "删除这段记录？关联照片会从记录中移除，原素材不会被删除。"
              )
            )
              void run(onDelete)
          }}
          className="min-h-11 w-full rounded-xl border border-coral/20 text-sm font-bold text-coral disabled:opacity-50"
        >
          删除记录
        </button>
      </div>
    </RecordDialog>
  )
}
