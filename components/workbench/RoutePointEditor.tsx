"use client"

import { useState, type FormEvent } from "react"
import type { RoutePoint } from "@/types/route"

interface RoutePointEditorProps {
  point: RoutePoint
  onSubmit: (point: RoutePoint) => void
  onCancel: () => void
}

export default function RoutePointEditor({
  point,
  onSubmit,
  onCancel,
}: RoutePointEditorProps) {
  const [name, setName] = useState(point.name)
  const [stayHours, setStayHours] = useState(point.stayHours?.toString() ?? "")
  const [notes, setNotes] = useState(point.notes ?? "")
  const [error, setError] = useState("")

  const submit = (event: FormEvent) => {
    event.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("请输入地点名称")
      return
    }

    const nextStayHours = stayHours ? Number(stayHours) : undefined
    if (
      nextStayHours !== undefined &&
      (!Number.isFinite(nextStayHours) || nextStayHours <= 0)
    ) {
      setError("停留时间必须大于 0")
      return
    }

    setError("")
    onSubmit({
      ...point,
      name: trimmedName,
      stayHours: nextStayHours,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-2 rounded-lg border border-[rgb(44_36_22_/_14%)] bg-white/70 p-3"
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="w-full rounded-md border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 py-2 text-sm text-[var(--periplus-ink)] outline-none focus:border-[var(--periplus-russet)]"
        aria-label="地点名称"
      />
      <input
        type="number"
        min="0.25"
        step="0.25"
        value={stayHours}
        onChange={(event) => setStayHours(event.target.value)}
        className="w-full rounded-md border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 py-2 text-sm text-[var(--periplus-ink)] outline-none focus:border-[var(--periplus-russet)]"
        aria-label="停留小时"
      />
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className="h-20 w-full resize-none rounded-md border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 py-2 text-sm text-[var(--periplus-ink)] outline-none focus:border-[var(--periplus-russet)]"
        aria-label="地点备注"
      />
      {error && (
        <p className="text-xs font-bold text-[var(--periplus-coral)]">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] text-xs font-black text-[var(--periplus-walnut)]"
        >
          取消
        </button>
        <button
          type="submit"
          className="h-9 rounded-full bg-[var(--periplus-russet)] text-xs font-black text-[var(--periplus-soft-white)]"
        >
          保存地点
        </button>
      </div>
    </form>
  )
}
