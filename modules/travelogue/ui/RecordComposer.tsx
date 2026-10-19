"use client"

import type { RecordingEventContent } from "@/modules/data-model/contracts/recording"
import { useEffect, useRef, useState } from "react"
import { Camera, X } from "lucide-react"
import {
  RecordButton,
  RecordError,
  RecordField,
  recordInputClass,
} from "./primitives"

export interface RecordDraft {
  title: string
  body: string
  category: RecordingEventContent["category"]
  date: string
  time: string
  timeZone: string
}

export const recordKinds = [
  ["", "随手记"],
  ["VISIT", "游览"],
  ["MEAL", "餐饮"],
  ["STAY", "住宿"],
  ["ACTIVITY", "活动"],
  ["TRANSIT", "交通"],
] as const

export default function RecordComposer({
  initial,
  onSave,
  onAutosave,
  onDirtyChange,
  onCancel,
  initialFiles = [],
}: {
  initial?: RecordDraft
  initialFiles?: File[]
  onSave: (draft: RecordDraft, files: File[]) => Promise<void>
  onAutosave?: (draft: RecordDraft) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<RecordDraft>(
    initial || {
      title: "",
      body: "",
      category: null,
      date: "",
      time: "",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  )
  const [files, setFiles] = useState(initialFiles)
  const [previews, setPreviews] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file))
    setPreviews(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [files])
  const [autoStatus, setAutoStatus] = useState("")
  const autoSaveRef = useRef(onAutosave)
  autoSaveRef.current = onAutosave
  const initialFingerprint = JSON.stringify(initial)
  const dirty = initial
    ? JSON.stringify(draft) !== initialFingerprint || files.length > 0
    : !!(draft.title || draft.body || files.length)
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [dirty])

  useEffect(() => {
    if (
      !autoSaveRef.current ||
      !initialFingerprint ||
      JSON.stringify(draft) === initialFingerprint ||
      (draft.time && !draft.date)
    )
      return
    let stale = false
    const timer = window.setTimeout(async () => {
      setAutoStatus("自动保存中…")
      try {
        await autoSaveRef.current!(draft)
        if (!stale) {
          setAutoStatus("文字已自动保存")
          setError(null)
        }
      } catch (cause) {
        if (!stale) {
          setAutoStatus("")
          setError(
            cause instanceof Error
              ? cause.message
              : "自动保存失败，输入保留在这里，请重试。"
          )
        }
      }
    }, 900)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [draft, initialFingerprint])

  function cancel() {
    if (saving) return
    const changed = initial
      ? JSON.stringify(draft) !== JSON.stringify(initial) || files.length > 0
      : !!(draft.title || draft.body || files.length)
    if (changed && !window.confirm("这段内容还没有保存，放弃编辑？")) return
    onCancel()
  }

  async function submit() {
    if (!draft.title.trim() && !draft.body.trim() && !files.length) {
      setError("写下一句话，或选择几张照片。")
      return
    }
    if (draft.time && !draft.date) {
      setError("填写时间时，请同时选择日期。")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(draft, files)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "保存失败，内容已留在这里，请重试。"
      )
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="rounded-2xl border border-russet/40 bg-white p-5 shadow-periplus-soft md:p-7"
      aria-label={initial ? "编辑记录" : "添加记录"}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-black">
          {initial ? "编辑这段经历" : "记下一段经历"}
        </h3>
        <button
          aria-label="收起编辑"
          type="button"
          onClick={cancel}
          disabled={saving}
          className="rounded-full p-2 hover:bg-ink-5"
        >
          <X size={18} />
        </button>
      </div>
      <div className="space-y-4">
        <input
          aria-label="记录标题"
          value={draft.title}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
          placeholder="给这段经历起个名字（选填）"
          maxLength={200}
          autoFocus
          className="w-full border-b border-ink-10 bg-transparent py-2 text-xl font-black outline-none focus:border-russet"
          disabled={saving}
        />
        <textarea
          aria-label="记录正文"
          value={draft.body}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          placeholder="此刻有什么想记下来的？"
          rows={4}
          className="w-full resize-y bg-transparent text-base leading-8 outline-none placeholder:text-walnut/60"
          disabled={saving}
        />
        {files.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="relative overflow-hidden rounded-xl bg-cream"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previews[index]}
                  alt={file.name}
                  className="aspect-[4/3] w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`移除待上传照片 ${file.name}`}
                  onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  className="absolute top-2 right-2 rounded-full bg-soft-white p-1.5"
                  disabled={saving}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            setFiles([...files, ...Array.from(event.target.files || [])])
            event.target.value = ""
          }}
        />
        <RecordButton
          onClick={() => fileInput.current?.click()}
          disabled={saving}
        >
          <Camera size={17} />
          加照片
        </RecordButton>
        <details
          className="rounded-xl border border-ink-10 p-4"
          open={initial ? true : undefined}
        >
          <summary className="cursor-pointer text-sm font-bold text-walnut">
            补充信息（选填）
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <RecordField label="日期">
              <input
                type="date"
                value={draft.date}
                onChange={(event) =>
                  setDraft({ ...draft, date: event.target.value })
                }
                className={recordInputClass}
                disabled={saving}
              />
            </RecordField>
            <RecordField label="时间">
              <input
                type="time"
                value={draft.time}
                onChange={(event) =>
                  setDraft({ ...draft, time: event.target.value })
                }
                className={recordInputClass}
                disabled={saving}
              />
            </RecordField>
            <RecordField label="分类">
              <select
                value={draft.category || ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    category: (event.target.value ||
                      null) as RecordDraft["category"],
                  })
                }
                className={recordInputClass}
                disabled={saving}
              >
                {recordKinds.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </RecordField>
          </div>
        </details>
        {draft.time ? (
          <RecordField label="当地时区">
            <input
              value={draft.timeZone}
              onChange={(event) =>
                setDraft({ ...draft, timeZone: event.target.value })
              }
              placeholder="Asia/Shanghai"
              className={recordInputClass}
              disabled={saving}
            />
          </RecordField>
        ) : null}
        <RecordError message={error} />
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-10 pt-4">
          {onAutosave ? (
            <span role="status" className="mr-auto text-xs text-walnut">
              {autoStatus || "修改后自动保存文字"}
            </span>
          ) : null}
          <RecordButton onClick={cancel} disabled={saving}>
            取消
          </RecordButton>
          <RecordButton primary type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存记录"}
          </RecordButton>
        </div>
      </div>
    </form>
  )
}
